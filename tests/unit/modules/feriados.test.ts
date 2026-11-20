import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/core/errors.js';
import { FERIADOS_FIXOS, PORTARIAS } from '../../../src/modules/feriados/dados.js';
import {
  ANOS_COM_PORTARIA,
  buscarDataNacional,
  calcularPascoa,
  getFeriadosNacionais,
  isFeriadoNacional,
} from '../../../src/modules/feriados/index.js';

const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('calcularPascoa', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'], // limite tardio
    [2285, '2285-03-22'], // limite precoce
  ])('%i → %s', (ano, esperado) => {
    expect(calcularPascoa(ano)).toBe(esperado);
  });

  it('rejeita anos anteriores ao calendário gregoriano', () => {
    expect(() => calcularPascoa(1500)).toThrow(ValidationError);
  });
});

describe('portarias oficiais conferidas contra a lei e o cálculo da Páscoa', () => {
  it.each(ANOS_COM_PORTARIA)(
    '%i: todo feriado de data fixa da lei consta como feriado nacional',
    (ano) => {
      const datas = PORTARIAS[ano]?.datas ?? [];
      for (const f of FERIADOS_FIXOS) {
        const iso = `${ano}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;
        expect(datas.find((d) => d.data === iso)).toMatchObject({
          tipo: 'feriado_nacional',
          nome: f.nome,
        });
      }
    },
  );

  it.each(ANOS_COM_PORTARIA)('%i: datas móveis batem com a Páscoa calculada', (ano) => {
    const pascoa = calcularPascoa(ano);
    const datas = PORTARIAS[ano]?.datas ?? [];
    const por = (nome: string) => datas.filter((d) => d.nome === nome).map((d) => d.data);
    expect(por('Carnaval')).toEqual([addDays(pascoa, -48), addDays(pascoa, -47)]);
    expect(por('Quarta-Feira de Cinzas')).toEqual([addDays(pascoa, -46)]);
    expect(por('Paixão de Cristo')).toEqual([addDays(pascoa, -2)]);
    expect(por('Corpus Christi')).toEqual([addDays(pascoa, 60)]);
  });

  it.each(ANOS_COM_PORTARIA)(
    '%i: datas em ordem, sem repetição e com 10 feriados nacionais',
    (ano) => {
      const datas = PORTARIAS[ano]?.datas ?? [];
      const isos = datas.map((d) => d.data);
      expect([...isos].sort()).toEqual(isos);
      expect(new Set(isos).size).toBe(isos.length);
      expect(datas.filter((d) => d.tipo === 'feriado_nacional')).toHaveLength(10);
    },
  );

  it('quantidades conforme a divulgação oficial (2026: 10 feriados e 9 pontos facultativos)', () => {
    const datas2026 = PORTARIAS[2026]?.datas ?? [];
    expect(datas2026.filter((d) => d.tipo === 'ponto_facultativo')).toHaveLength(9);
    expect(PORTARIAS[2025]?.datas).toHaveLength(18);
  });
});

describe('getFeriadosNacionais', () => {
  it('2026 vem da portaria, com fonte e pontos facultativos parciais', () => {
    const cal = getFeriadosNacionais(2026);
    expect(cal.origem).toBe('portaria');
    expect(cal.fontes[0]?.descricao).toContain('Portaria MGI nº 11.460/2025');
    expect(cal.datas).toHaveLength(19);
    expect(cal.datas.find((d) => d.nome === 'Quarta-Feira de Cinzas')).toMatchObject({
      data: '2026-02-18',
      tipo: 'ponto_facultativo',
      periodo: 'ate_14h',
    });
    expect(cal.datas.find((d) => d.data === '2026-12-24')?.periodo).toBe('apos_13h');
  });

  it('2027 (sem portaria na base) traz só os feriados da lei, com aviso', () => {
    const cal = getFeriadosNacionais(2027);
    expect(cal.origem).toBe('lei');
    expect(cal.datas).toHaveLength(10);
    expect(cal.datas.every((d) => d.tipo === 'feriado_nacional')).toBe(true);
    expect(cal.datas.find((d) => d.nome === 'Paixão de Cristo')?.data).toBe('2027-03-26');
    expect(cal.avisos[0]).toMatch(/não está na base/);
    expect(cal.datas.map((d) => d.data)).toEqual([...cal.datas.map((d) => d.data)].sort());
  });

  it('2024 inclui o 20 de novembro (Lei nº 14.759/2023)', () => {
    expect(getFeriadosNacionais(2024).datas.find((d) => d.data === '2024-11-20')).toMatchObject({
      baseLegal: 'Lei nº 14.759/2023',
    });
  });

  it('devolve cópias: alterar o resultado não altera a base', () => {
    const cal = getFeriadosNacionais(2026);
    const primeira = cal.datas[0];
    if (primeira) primeira.nome = 'alterado';
    expect(getFeriadosNacionais(2026).datas[0]?.nome).toBe('Confraternização Universal');
  });

  it.each([2023, 2100, 2026.5, Number.NaN])('rejeita ano %s', (ano) => {
    expect(() => getFeriadosNacionais(ano)).toThrow(ValidationError);
  });
});

describe('isFeriadoNacional e buscarDataNacional', () => {
  it.each([
    ['2026-11-20', true],
    ['2026-04-03', true],
    ['2026-02-16', false], // Carnaval: ponto facultativo
    ['2026-11-19', false],
    ['2027-03-26', true], // Paixão calculada
  ])('%s → %s', (data, esperado) => {
    expect(isFeriadoNacional(data)).toBe(esperado);
  });

  it('aceita Date no fuso local', () => {
    expect(isFeriadoNacional(new Date(2026, 11, 25))).toBe(true);
  });

  it('busca ponto facultativo', () => {
    expect(buscarDataNacional('2026-02-17')).toMatchObject({
      nome: 'Carnaval',
      tipo: 'ponto_facultativo',
    });
    expect(buscarDataNacional('2026-03-10')).toBeNull();
  });

  it.each(['2026-02-30', '20/11/2026', '2026-13-01', 'x'])('rejeita data inválida %j', (data) => {
    expect(() => buscarDataNacional(data)).toThrow(ValidationError);
  });
});
