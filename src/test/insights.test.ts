import { describe, expect, it } from "vitest";
import { summarizeGroup } from "@/lib/group-summary";
import {
	FINDING_MIN_TRADES,
	sessionFindings,
	sessionOf,
	sizingAfterLoss,
	TradingSession,
	tagFindings,
	tradesAfterLoss,
} from "@/lib/insights";
import { TradeStatus } from "@/lib/trade";

const group = (key: string, pnls: number[]) => ({
	key,
	name: `Tag ${key}`,
	...summarizeGroup(pnls),
});

describe("tagFindings", () => {
	const enough = Array<number>(FINDING_MIN_TRADES).fill(-10);
	const scope = summarizeGroup([...enough, ...Array<number>(20).fill(30)]);

	it("returns the difference from the scope average for a tag with enough trades", () => {
		const [finding] = tagFindings([group("1", enough)], scope);
		expect(scope.avgPnl).toBe(10);
		expect(finding).toEqual({
			key: "1",
			name: "Tag 1",
			count: FINDING_MIN_TRADES,
			avgPnl: -10,
			difference: -20,
		});
	});

	it("returns no difference below the minimum sample", () => {
		const [finding] = tagFindings(
			[group("2", enough.slice(1))],
			summarizeGroup(enough),
		);
		expect(finding.count).toBe(FINDING_MIN_TRADES - 1);
		expect(finding.difference).toBeNull();
	});

	it("returns no finding for random data with no pattern", () => {
		const pnls = Array.from({ length: 40 }, (_, i) => (i % 2 ? 25 : -25));
		const [finding] = tagFindings([group("3", pnls)], summarizeGroup(pnls));
		expect(finding.difference).toBe(0);
	});
});

describe("sizingAfterLoss", () => {
	const HOUR = 3_600_000;
	const start = Date.UTC(2026, 0, 1);
	const trade = (
		id: number,
		netPnl: number,
		risk: number | null,
		status: TradeStatus = TradeStatus.Closed,
	) => ({
		id,
		status,
		netPnl,
		entryDate: new Date(start + id * 2 * HOUR),
		exitDate: new Date(start + (id * 2 + 1) * HOUR),
		initialRiskAmount: risk === null ? null : String(risk),
		initialRiskSnapshot: { accountCurrency: "USD" },
	});
	/** Alternates a loss and a win: each win is the first entry after a loss. */
	const pattern = (pairs: number, afterLossRisk: number | null) =>
		Array.from({ length: pairs }, (_, i) => [
			trade(i * 2, -10, 100),
			trade(i * 2 + 1, 30, afterLossRisk),
		]).flat();

	it("picks the next entry in the account after a loss exit", () => {
		const history = [
			trade(0, -10, 100),
			trade(1, -5, 100),
			trade(2, 20, 100),
			trade(3, 0, 100, TradeStatus.Pending),
			trade(4, 5, 100),
		];
		expect([...tradesAfterLoss(history)]).toEqual([1, 2]);
	});

	it("returns the change of the median risk after a loss", () => {
		const history = pattern(FINDING_MIN_TRADES, 150);
		const finding = sizingAfterLoss(history, history, "USD");
		expect(finding.afterLoss).toMatchObject({
			withRisk: FINDING_MIN_TRADES,
			medianRisk: 150,
		});
		expect(finding.other).toMatchObject({
			withRisk: FINDING_MIN_TRADES,
			medianRisk: 100,
		});
		expect(finding.change).toBe(50);
	});

	it("returns no change for data with no pattern", () => {
		const history = pattern(FINDING_MIN_TRADES, 100);
		expect(sizingAfterLoss(history, history, "USD").change).toBe(0);
	});

	it("returns no finding below the minimum sample", () => {
		const history = pattern(FINDING_MIN_TRADES - 1, 150);
		const finding = sizingAfterLoss(history, history, "USD");
		expect(finding.afterLoss.tradeIds).toHaveLength(FINDING_MIN_TRADES - 1);
		expect(finding.change).toBeNull();
	});

	it("counts trades without initial risk as unknown", () => {
		const history = pattern(FINDING_MIN_TRADES, null);
		const finding = sizingAfterLoss(history, history, "USD");
		expect(finding.afterLoss).toEqual({
			tradeIds: expect.any(Array),
			withRisk: 0,
			medianRisk: null,
		});
		expect(finding.afterLoss.tradeIds).toHaveLength(FINDING_MIN_TRADES);
		expect(finding.change).toBeNull();
	});

	it("counts a risk in another currency as unknown", () => {
		const history = pattern(FINDING_MIN_TRADES, 150);
		const finding = sizingAfterLoss(history, history, "EUR");
		expect(finding.afterLoss.withRisk).toBe(0);
		expect(finding.other.withRisk).toBe(0);
		expect(finding.change).toBeNull();
	});

	it("keeps only the closed trades in scope in the cohorts", () => {
		const history = pattern(3, 150);
		const finding = sizingAfterLoss(history, history.slice(0, 2), "USD");
		expect(finding.afterLoss.tradeIds).toEqual([1]);
		expect(finding.other.tradeIds).toEqual([0]);
	});
});

describe("sessionFindings", () => {
	const at = (id: number, hour: number, minute: number, netPnl: number) => ({
		id,
		netPnl,
		entryDate: new Date(Date.UTC(2026, 0, 5, hour, minute)),
	});
	const many = (from: number, hour: number, pnl: number, count: number) =>
		Array.from({ length: count }, (_, i) => at(from + i, hour, 0, pnl));
	const scopeOf = (trades: { netPnl: number }[]) =>
		summarizeGroup(trades.map((t) => t.netPnl));

	it("puts an entry at 07:59 UTC in Asia and at 08:00 UTC in London", () => {
		expect(sessionOf(at(1, 7, 59, 0).entryDate)).toBe(TradingSession.Asia);
		expect(sessionOf(at(1, 8, 0, 0).entryDate)).toBe(TradingSession.London);
		expect(sessionOf(at(1, 20, 59, 0).entryDate)).toBe(TradingSession.NewYork);
		expect(sessionOf(at(1, 21, 0, 0).entryDate)).toBe(TradingSession.Other);
	});

	it("returns the difference from the scope average for each session", () => {
		const closed = [...many(0, 3, -10, 20), ...many(100, 14, 30, 20)];
		const findings = sessionFindings(closed, scopeOf(closed));
		expect(findings.map((f) => f.session)).toEqual([
			TradingSession.Asia,
			TradingSession.London,
			TradingSession.NewYork,
			TradingSession.Other,
		]);
		expect(findings[0]).toMatchObject({
			count: 20,
			avgPnl: -10,
			difference: -20,
		});
		expect(findings[0].tradeIds).toHaveLength(20);
		expect(findings[2]).toMatchObject({
			count: 20,
			avgPnl: 30,
			difference: 20,
		});
		expect(findings[1]).toMatchObject({ count: 0, difference: null });
	});

	it("returns no difference for data with no pattern", () => {
		const closed = [...many(0, 3, 25, 20), ...many(100, 3, -25, 20)];
		const [asia] = sessionFindings(closed, scopeOf(closed));
		expect(asia.difference).toBe(0);
	});

	it("returns no finding below the minimum sample", () => {
		const closed = [...many(0, 9, 50, 19), ...many(100, 3, -10, 30)];
		const london = sessionFindings(closed, scopeOf(closed))[1];
		expect(london.count).toBe(FINDING_MIN_TRADES - 1);
		expect(london.difference).toBeNull();
	});
});
