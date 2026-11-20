/** Balde de fichas: `ratePerSecond` fichas por segundo, até `burst` acumuladas. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!(ratePerSecond > 0) || !(burst >= 1)) {
      throw new RangeError('ratePerSecond deve ser > 0 e burst >= 1');
    }
    this.tokens = burst;
    this.last = now();
  }

  private refill(): void {
    const current = this.now();
    const elapsed = Math.max(0, current - this.last) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSecond);
    this.last = current;
  }

  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Milissegundos até haver uma ficha disponível. */
  msUntilNext(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000);
  }
}

/** A fila do provedor está cheia: o servidor está no limite que se impôs. */
export class UpstreamBusyError extends Error {
  constructor(readonly upstream: string) {
    super(`Fila para ${upstream} cheia`);
    this.name = 'UpstreamBusyError';
  }
}

export interface UpstreamGateOptions {
  name: string;
  /** Requisições simultâneas ao provedor. */
  maxConcurrent: number;
  /** Requisições aguardando vaga; acima disso, recusa na hora. */
  maxQueue: number;
  /** Ritmo máximo sustentado ao provedor (req/s) e rajada permitida. */
  ratePerSecond: number;
  burst: number;
  now?: () => number;
}

interface Waiter {
  start: () => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal | undefined;
  onAbort: () => void;
}

/**
 * Porteiro de um provedor externo: limita concorrência e ritmo, com fila
 * limitada. Quem espera na fila respeita o `AbortSignal` (ex.: o timeout da
 * requisição), então ninguém fica preso além do prazo.
 */
export class UpstreamGate {
  private active = 0;
  private readonly queue: Waiter[] = [];
  private readonly bucket: TokenBucket;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: UpstreamGateOptions) {
    this.bucket = new TokenBucket(options.ratePerSecond, options.burst, options.now);
  }

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private acquire(signal: AbortSignal | undefined): Promise<void> {
    signal?.throwIfAborted();
    if (
      this.queue.length === 0 &&
      this.active < this.options.maxConcurrent &&
      this.bucket.tryTake()
    ) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.options.maxQueue) {
      return Promise.reject(new UpstreamBusyError(this.options.name));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        start: () => {
          signal?.removeEventListener('abort', waiter.onAbort);
          resolve();
        },
        reject,
        signal,
        onAbort: () => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          reject(signal?.reason);
        },
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.queue.push(waiter);
      this.drain();
    });
  }

  private drain(): void {
    if (this.timer !== undefined) return;
    while (this.queue.length > 0 && this.active < this.options.maxConcurrent) {
      if (!this.bucket.tryTake()) {
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.drain();
        }, this.bucket.msUntilNext());
        this.timer.unref?.();
        return;
      }
      const waiter = this.queue.shift();
      if (waiter === undefined) return;
      this.active += 1;
      waiter.start();
    }
  }
}
