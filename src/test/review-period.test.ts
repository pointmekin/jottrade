import { describe, expect, it } from "vitest";
import { AccountEntryKind } from "@/lib/account-entry";
import {
	ReviewKind,
	type ReviewTradeSnapshot,
	summarizeReview,
	tradeInReview,
} from "@/lib/review";
import { sourceDiscrepancies } from "@/lib/review-discrepancies";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";
import { reviewDaySchema, reviewPeriod } from "@/lib/review-period";
import { TradeStatus } from "@/lib/trade";

const trade = (id: number, netPnl: string | null): ReviewTradeSnapshot => ({
	id,
	symbol: "EURUSD",
	side: "LONG",
	status: TradeStatus.Closed,
	entryDate: "2026-09-30T09:00:00Z",
	exitDate: "2026-10-02T01:00:00Z",
	netPnl,
	notes: null,
	executionFacts: { execution: {}, risk: null, pnlContext: null },
	executionFingerprint: `f:${id}`,
});
describe("review periods and results", () => {
	it("anchors Monday and Sunday weeks across the year boundary", () => {
		expect(reviewPeriod("2027-01-01", ReviewKind.Weekly, 1)).toEqual({
			periodStart: "2026-12-28",
			periodEndExclusive: "2027-01-04",
		});
		expect(reviewPeriod("2027-01-01", ReviewKind.Weekly, 0).periodStart).toBe(
			"2026-12-27",
		);
		expect(
			reviewPeriod("2028-02-29", ReviewKind.Daily, 1).periodEndExclusive,
		).toBe("2028-03-01");
		expect(reviewDaySchema.safeParse("2026-02-29").success).toBe(false);
	});
	it.each(["2026-03-08", "2026-11-01"])(
		"uses civil days through New York DST %s",
		(day) => {
			const window = {
				...reviewPeriod(day, ReviewKind.Daily, 1),
				timezoneSnapshot: "America/New_York",
			};
			const early = new Date(`${day}T06:30:00Z`);
			const late = new Date(`${day}T23:30:00Z`);
			expect(
				tradeInReview(
					{
						status: TradeStatus.Closed,
						entryDate: new Date("2026-01-01T00:00:00Z"),
						exitDate: early,
					},
					window,
				),
			).toBe(true);
			expect(
				tradeInReview(
					{ status: TradeStatus.Closed, entryDate: early, exitDate: late },
					window,
				),
			).toBe(true);
		},
	);
	it("groups realization, legacy fallback and Bangkok midnight independently of browser zone", () => {
		const window = {
			periodStart: "2026-10-02",
			periodEndExclusive: "2026-10-03",
			timezoneSnapshot: "Asia/Bangkok",
		};
		expect(
			tradeInReview(
				{
					status: TradeStatus.Closed,
					entryDate: new Date("2026-09-20T00:00:00Z"),
					exitDate: new Date("2026-10-01T17:00:00Z"),
				},
				window,
			),
		).toBe(true);
		expect(
			tradeInReview(
				{
					status: TradeStatus.Closed,
					entryDate: new Date("2026-10-02T01:00:00Z"),
					exitDate: null,
				},
				window,
			),
		).toBe(true);
		expect(
			tradeInReview(
				{
					status: TradeStatus.Open,
					entryDate: new Date("2026-10-01T01:00:00Z"),
					exitDate: new Date("2026-10-02T01:00:00Z"),
				},
				window,
			),
		).toBe(false);
	});
	it("retains more than a journal page and separates funding from adjustments", () => {
		const results = summarizeReview(
			Array.from({ length: 75 }, (_, id) => trade(id, "2")),
			[
				{
					id: 1,
					occurredAt: "2026-10-02T00:00:00Z",
					amount: "1000",
					kind: AccountEntryKind.Deposit,
					note: null,
					brokerFacts: null,
					executionFingerprint: "deposit",
				},
				{
					id: 2,
					occurredAt: "2026-10-02T00:00:00Z",
					amount: "-3",
					kind: AccountEntryKind.Adjustment,
					note: null,
					brokerFacts: null,
					executionFingerprint: "adjustment",
				},
			],
		);
		expect(results).toMatchObject({
			closedTradeCount: 75,
			tradePnl: "150",
			tradingPnl: "147",
			netDeposits: "1000",
			payoffRatio: null,
		});
		expect(summarizeReview([trade(1, null)], []).tradingPnl).toBeNull();
		expect(summarizeReview([trade(1, "0")], []).tradingPnl).toBe("0");
		expect(summarizeReview([], []).winRate).toBeNull();
	});
	it("reports later sources/corrections without changing frozen facts", () => {
		const frozen = trade(1, "2");
		const current = { ...frozen, netPnl: "3", executionFingerprint: "changed" };
		expect(
			sourceDiscrepancies(
				[current, trade(2, "4")],
				[{ snapshot: frozen, includedInSnapshot: true }],
			),
		).toEqual({ added: 1, changed: 1, removed: 0 });
		expect(frozen.netPnl).toBe("2");
	});
	it("fingerprints current financial/risk facts, excluding annotations/provenance", async () => {
		const base = {
			entryPrice: "100.00",
			quantity: "0.20",
			netPnl: "2",
			entryDate: new Date("2026-10-02T00:00:00Z"),
		};
		const fingerprint = await currentExecutionFingerprint(base);
		expect(
			await currentExecutionFingerprint({
				...base,
				entryPrice: "100",
				quantity: "0.2",
				notes: "new",
				importHash: "different",
				reviewedAt: new Date(),
			}),
		).toBe(fingerprint);
		expect(
			await currentExecutionFingerprint({ ...base, netPnl: "3" }),
		).not.toBe(fingerprint);
		expect(
			await currentExecutionFingerprint({ ...base, initialStopPrice: "95" }),
		).not.toBe(fingerprint);
	});
	it("retains exact large money and tiny adjustments", () => {
		const results = summarizeReview(
			[trade(1, "9007199254740993.01"), trade(2, "0.02")],
			[
				{
					id: 1,
					occurredAt: "2026-10-02T00:00:00Z",
					amount: "0.00000001",
					kind: AccountEntryKind.Adjustment,
					note: null,
					brokerFacts: null,
					executionFingerprint: "flow",
				},
			],
		);
		expect(results.tradePnl).toBe("9007199254740993.03");
		expect(results.tradingPnl).toBe("9007199254740993.03000001");
	});
	it("reviews exit FX/context changes even at breakeven, excluding calculation time", async () => {
		const base = {
			netPnl: "0",
			exitQuoteToAccountRate: "1.2",
			pnlCalculationSnapshot: {
				version: 1,
				quantityUnit: "LOTS",
				contractSize: "100000",
				quoteCurrency: "USD",
				accountCurrency: "EUR",
				exitQuoteToAccountRate: "1.2",
				calculatedAt: "2026-10-02T00:00:00Z",
			},
		};
		const digest = await currentExecutionFingerprint(base);
		expect(
			await currentExecutionFingerprint({
				...base,
				pnlCalculationSnapshot: {
					...base.pnlCalculationSnapshot,
					calculatedAt: "2026-10-03T00:00:00Z",
				},
			}),
		).toBe(digest);
		expect(
			await currentExecutionFingerprint({
				...base,
				exitQuoteToAccountRate: "1.3",
			}),
		).not.toBe(digest);
		expect(
			await currentExecutionFingerprint({
				...base,
				pnlCalculationSnapshot: {
					...base.pnlCalculationSnapshot,
					quantityUnit: "UNITS",
				},
			}),
		).not.toBe(digest);
	});
});
