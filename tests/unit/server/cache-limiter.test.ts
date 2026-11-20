import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleFlight, TtlCache } from '../../../server/src/cache.js';
import { TokenBucket, UpstreamBusyError, UpstreamGate } from '../../../server/src/limiter.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('expira entradas pelo TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(10, () => now);
    cache.set('a', 'x', 1000);
    now = 999;
    expect(cache.get('a')).toBe('x');
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('descarta a menos usada recentemente quando passa do limite', () => {
    const cache = new TtlCache<number>(2);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.get('a'); // "a" passa a ser a mais recente
    cache.set('c', 3, 60_000);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('rejeita limite inválido', () => {
    expect(() => new TtlCache(0)).toThrow(RangeError);
  });
});

describe('SingleFlight', () => {
  it('executa uma vez para chamadas simultâneas com a mesma chave', async () => {
    const flight = new SingleFlight<number>();
    const fn = vi.fn(async () => 42);
    const results = await Promise.all([
      flight.run('k', fn),
      flight.run('k', fn),
      flight.run('k', fn),
    ]);
    expect(results).toEqual([42, 42, 42]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(flight.size).toBe(0);
  });

  it('libera a chave mesmo se a execução falhar', async () => {
    const flight = new SingleFlight<number>();
    await expect(flight.run('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(flight.run('k', async () => 1)).resolves.toBe(1);
  });
});

describe('TokenBucket', () => {
  it('permite a rajada e depois o ritmo configurado', () => {
    let now = 0;
    const bucket = new TokenBucket(2, 3, () => now); // 2/s, rajada 3
    expect([bucket.tryTake(), bucket.tryTake(), bucket.tryTake(), bucket.tryTake()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(bucket.msUntilNext()).toBe(500);
    now = 500;
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
  });
});

describe('UpstreamGate', () => {
  const deferred = () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it('limita a concorrência e atende a fila em ordem', async () => {
    const gate = new UpstreamGate({
      name: 't',
      maxConcurrent: 2,
      maxQueue: 10,
      ratePerSecond: 1000,
      burst: 1000,
    });
    const tasks = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = tasks.map((t, i) =>
      gate.run(async () => {
        started.push(i);
        return t.promise;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(gate.stats).toEqual({ active: 2, queued: 1 });
    tasks[0]?.resolve('a');
    await runs[0];
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    tasks[1]?.resolve('b');
    tasks[2]?.resolve('c');
    await expect(Promise.all(runs)).resolves.toEqual(['a', 'b', 'c']);
    expect(gate.stats).toEqual({ active: 0, queued: 0 });
  });

  it('recusa na hora quando a fila está cheia', async () => {
    const gate = new UpstreamGate({
      name: 'viacep',
      maxConcurrent: 1,
      maxQueue: 1,
      ratePerSecond: 1000,
      burst: 1000,
    });
    const block = deferred();
    const first = gate.run(() => block.promise);
    const second = gate.run(async () => 'ok');
    await expect(gate.run(async () => 'x')).rejects.toBeInstanceOf(UpstreamBusyError);
    block.resolve('done');
    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('ok');
  });

  it('respeita o ritmo (req/s) do provedor', async () => {
    vi.useFakeTimers();
    const gate = new UpstreamGate({
      name: 't',
      maxConcurrent: 10,
      maxQueue: 10,
      ratePerSecond: 2,
      burst: 1,
    });
    const done: number[] = [];
    const runs = [0, 1, 2].map((i) => gate.run(async () => done.push(i)));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual([0]);
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toEqual([0, 1, 2]);
    await Promise.all(runs);
  });

  it('quem espera na fila sai quando o sinal é cancelado (timeout)', async () => {
    const gate = new UpstreamGate({
      name: 't',
      maxConcurrent: 1,
      maxQueue: 5,
      ratePerSecond: 1000,
      burst: 1000,
    });
    const block = deferred();
    const first = gate.run(() => block.promise);
    const controller = new AbortController();
    const waiting = gate.run(async () => 'nunca', controller.signal);
    const reason = new Error('timeout');
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(gate.stats.queued).toBe(0);
    block.resolve('ok');
    await first;
  });
});
