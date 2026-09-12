import { describe, it, expect } from 'vitest';
import {
  groupByDay, computeSharpe, computeMaxDrawdown, computeAvgRR, computeAvgHoldTime,
  summarizeTrades, type TradeRecord,
} from '../lib/analytics';

const t = (exitISO: string, entryISO: string, pnl: number) => ({
  exitDate: new Date(exitISO),
  entryDate: new Date(entryISO),
  netPnl: pnl,
});

describe('groupByDay', () => {
  it('sums P&L per exit date', () => {
    const trades = [
      t('2025-01-01T10:00:00Z', '2025-01-01T09:00:00Z', 100),
      t('2025-01-01T14:00:00Z', '2025-01-01T09:00:00Z', 50),
      t('2025-01-02T10:00:00Z', '2025-01-02T09:00:00Z', -30),
    ];
    const result = groupByDay(trades);
    expect(result.get('2025-01-01')).toBe(150);
    expect(result.get('2025-01-02')).toBe(-30);
  });
});

describe('computeSharpe', () => {
  it('returns 0 for < 2 data points', () => {
    expect(computeSharpe(new Map([['2025-01-01', 100]]))).toBe(0);
  });
  it('returns 0 when stddev is 0', () => {
    expect(computeSharpe(new Map([['a', 100], ['b', 100]]))).toBe(0);
  });
  it('returns positive for consistently positive returns', () => {
    const map = new Map([['a', 100], ['b', 200], ['c', 150]]);
    expect(computeSharpe(map)).toBeGreaterThan(0);
  });
  it('uses sample stddev (n-1)', () => {
    // With 2 points [0, 100]: mean=50, sample stddev=70.71, sharpe = (50/70.71)*sqrt(252) ≈ 11.22
    const map = new Map([['a', 0], ['b', 100]]);
    expect(computeSharpe(map)).toBeCloseTo(11.22, 0);
  });
});

describe('computeMaxDrawdown', () => {
  it('returns zeros for no trades', () => {
    expect(computeMaxDrawdown([], 10000)).toEqual({ dollars: 0, percent: 0 });
  });
  it('computes peak-to-trough correctly', () => {
    const trades = [
      t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1000),  // balance 11000, peak 11000
      t('2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', -2000), // balance 9000, dd 2000
      t('2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', 500),   // balance 9500
    ];
    const { dollars, percent } = computeMaxDrawdown(trades, 10000);
    expect(dollars).toBe(2000);
    expect(percent).toBeCloseTo(18.18, 1);
  });
});

describe('computeAvgRR', () => {
  it('returns 0 with no losses', () => {
    expect(computeAvgRR([t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 100)])).toBe(0);
  });
  it('returns 0 with no wins', () => {
    expect(computeAvgRR([t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', -100)])).toBe(0);
  });
  it('computes ratio correctly', () => {
    const trades = [
      t('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 200),
      t('2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', 100),
      t('2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', -100),
    ];
    expect(computeAvgRR(trades)).toBe(1.5); // avgWin=150, avgLoss=100
  });
});

describe('summarizeTrades', () => {
  const closed = (
    entryISO: string,
    exitISO: string | null,
    pnl: number
  ): TradeRecord => ({
    status: 'CLOSED',
    entryDate: new Date(entryISO),
    exitDate: exitISO ? new Date(exitISO) : null,
    netPnl: pnl,
  });

  it('returns an empty curve and zeroed stats with no trades', () => {
    const { stats, equityCurve } = summarizeTrades([], 10000);
    expect(equityCurve).toEqual([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.profitFactor).toBeNull();
    expect(stats.totalBalance).toBe(10000);
  });

  it('excludes breakeven trades from the win rate', () => {
    const { stats } = summarizeTrades(
      [
        closed('2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z', 100),
        closed('2025-01-02T09:00:00Z', '2025-01-02T10:00:00Z', -50),
        closed('2025-01-03T09:00:00Z', '2025-01-03T10:00:00Z', 0),
        closed('2025-01-04T09:00:00Z', '2025-01-04T10:00:00Z', 0),
      ],
      10000
    );
    expect(stats.winningTrades).toBe(1);
    expect(stats.losingTrades).toBe(1);
    expect(stats.breakevenTrades).toBe(2);
    expect(stats.winRate).toBe(50);
  });

  it('counts only CLOSED trades as realized and OPEN trades as active', () => {
    const { stats } = summarizeTrades(
      [
        closed('2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z', 100),
        { status: 'OPEN', entryDate: new Date('2025-01-02T09:00:00Z'), exitDate: null, netPnl: 0 },
        { status: 'PENDING', entryDate: new Date('2025-01-03T09:00:00Z'), exitDate: null, netPnl: 0 },
      ],
      10000
    );
    expect(stats.totalTrades).toBe(1);
    expect(stats.activeTrades).toBe(1);
    expect(stats.totalPnL).toBe(100);
  });

  it('orders the curve by exit date, not entry date', () => {
    const { equityCurve } = summarizeTrades(
      [
        closed('2025-01-01T09:00:00Z', '2025-01-05T10:00:00Z', -200),
        closed('2025-01-03T09:00:00Z', '2025-01-04T10:00:00Z', 500),
      ],
      10000
    );
    expect(equityCurve).toEqual([
      { date: '2025-01-03', balance: 10000 },
      { date: '2025-01-04', balance: 10500 },
      { date: '2025-01-05', balance: 10300 },
    ]);
  });

  it('emits one point per day and ends at the final balance', () => {
    const trades = [
      closed('2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z', 100),
      closed('2025-01-01T11:00:00Z', '2025-01-01T12:00:00Z', 50),
      closed('2025-01-02T09:00:00Z', '2025-01-02T10:00:00Z', -30),
    ];
    const { stats, equityCurve } = summarizeTrades(trades, 1000);
    expect(equityCurve).toHaveLength(3); // baseline + 2 trading days
    expect(equityCurve.at(-1)).toEqual({ date: '2025-01-02', balance: 1120 });
    expect(stats.totalBalance).toBe(1120);
  });

  it('keeps a closed trade without an exit date on the curve', () => {
    const { stats, equityCurve } = summarizeTrades(
      [closed('2025-01-01T09:00:00Z', null, 250)],
      10000
    );
    expect(stats.totalPnL).toBe(250);
    expect(equityCurve.at(-1)).toEqual({ date: '2025-01-01', balance: 10250 });
  });

  it('reports profit factor as null when there is no loss', () => {
    const { stats } = summarizeTrades(
      [closed('2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z', 100)],
      10000
    );
    expect(stats.profitFactor).toBeNull();
    expect(stats.winRate).toBe(100);
  });

  it('computes profit factor from gross profit over gross loss', () => {
    const { stats } = summarizeTrades(
      [
        closed('2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z', 300),
        closed('2025-01-02T09:00:00Z', '2025-01-02T10:00:00Z', -100),
      ],
      10000
    );
    expect(stats.profitFactor).toBe(3);
  });
});

describe('computeAvgHoldTime', () => {
  it('returns 0 for empty', () => {
    expect(computeAvgHoldTime([])).toBe(0);
  });
  it('returns average hours', () => {
    const trades = [
      t('2025-01-01T10:00:00Z', '2025-01-01T08:00:00Z', 100), // 2h
      t('2025-01-02T12:00:00Z', '2025-01-02T08:00:00Z', 50),  // 4h
    ];
    expect(computeAvgHoldTime(trades)).toBe(3);
  });
});
