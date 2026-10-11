import { describe, expect, it } from "vitest";
import { ExecutionKind } from "@/lib/position";
import {
	type ReviewTradeSnapshot,
	reviewFills,
	summarizeReview,
	tradeInReview,
} from "@/lib/review";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";
import { TradeStatus } from "@/lib/trade";

const day = (periodStart: string, periodEndExclusive: string) => ({
	periodStart,
	periodEndExclusive,
	timezoneSnapshot: "UTC",
});
const MONDAY = day("2026-10-05", "2026-10-06");
const WEDNESDAY = day("2026-10-07", "2026-10-08");
const TUESDAY = day("2026-10-06", "2026-10-07");
const fill = (
	kind: ExecutionKind,
	executedAt: string,
	quantity: string,
	realizedPnl: string | null,
) => ({
	kind,
	executedAt: new Date(executedAt),
	price: "1.1",
	quantity,
	fees: "0",
	realizedPnl,
});
const FILLS = [
	fill(ExecutionKind.Entry, "2026-10-02T09:00:00Z", "1", null),
	fill(ExecutionKind.Exit, "2026-10-05T09:00:00Z", "0.5", "120.40"),
	fill(ExecutionKind.Exit, "2026-10-07T09:00:00Z", "0.5", "79.59"),
];
const closed = {
	status: TradeStatus.Closed,
	entryDate: new Date("2026-10-02T09:00:00Z"),
	exitDate: new Date("2026-10-07T09:00:00Z"),
	netPnl: "200.00",
};
const snapshot = (
	window: typeof MONDAY,
	trade: { status: string; netPnl: string | null } = closed,
): ReviewTradeSnapshot => ({
	id: 1,
	symbol: "EURUSD",
	side: "LONG",
	status: trade.status,
	entryDate: "2026-10-02T09:00:00Z",
	exitDate: null,
	netPnl: trade.netPnl,
	notes: null,
	executionFacts: { execution: {}, risk: null, pnlContext: null },
	executionFingerprint: "f",
	fills: reviewFills(trade, FILLS, window),
});

describe("reviews with multi-fill positions", () => {
	it("puts a position with exits on two days in both daily reviews with the amount of each day", () => {
		const monday = snapshot(MONDAY);
		const wednesday = snapshot(WEDNESDAY);

		expect(tradeInReview(closed, MONDAY, monday.fills)).toBe(true);
		expect(tradeInReview(closed, WEDNESDAY, wednesday.fills)).toBe(true);
		expect(
			tradeInReview(closed, TUESDAY, reviewFills(closed, FILLS, TUESDAY)),
		).toBe(false);
		expect(summarizeReview([monday], [])).toMatchObject({
			tradePnl: "120.4",
			closedTradeCount: 0,
			winRate: null,
		});
		expect(summarizeReview([wednesday], [])).toMatchObject({
			tradePnl: "79.6",
			closedTradeCount: 1,
			winRate: 100,
		});
	});

	it("gives the last exit of a closed position the rounding rest", () => {
		expect(reviewFills(closed, FILLS, WEDNESDAY)).toEqual([
			{
				kind: ExecutionKind.Exit,
				executedAt: "2026-10-07T09:00:00.000Z",
				price: "1.1",
				quantity: "0.5",
				fees: "0",
				realizedPnl: "79.60",
				closesPosition: true,
			},
		]);
	});

	it("counts a partial exit of an open position as cash, not as a closed trade", () => {
		const open = { status: TradeStatus.Open, netPnl: null };
		const partial = snapshot(MONDAY, open);

		expect(partial.fills?.[0]).toMatchObject({ closesPosition: false });
		expect(summarizeReview([partial], [])).toMatchObject({
			tradePnl: "120.4",
			closedTradeCount: 0,
			missingPnlCount: 0,
		});
	});

	it("keeps the legacy day rule for a trade without fills", () => {
		expect(tradeInReview(closed, WEDNESDAY)).toBe(true);
		expect(tradeInReview(closed, MONDAY)).toBe(false);
	});

	it("keeps the legacy fingerprint and adds a fills digest only with fills", async () => {
		const legacy = {
			symbol: "EURUSD",
			side: "LONG",
			status: "CLOSED",
			entryDate: new Date("2026-10-01T09:00:00Z"),
			exitDate: new Date("2026-10-02T09:00:00Z"),
			entryPrice: "1.1000",
			exitPrice: "1.1050",
			quantity: "1.00",
			netPnl: "500.00",
			fees: "0",
			executionCount: 0,
		};
		const base = await currentExecutionFingerprint(legacy);
		const moved = FILLS.map((f, index) =>
			index === 1 ? { ...f, executedAt: new Date("2026-10-05T10:00:00Z") } : f,
		);

		expect(base).toBe(
			"review-v2:896e66023df7435e12e3e0784fa22f5c787be394f6615260dab9cb706fb595a4",
		);
		expect(await currentExecutionFingerprint(legacy, FILLS)).not.toBe(base);
		expect(await currentExecutionFingerprint(legacy, moved)).not.toBe(
			await currentExecutionFingerprint(legacy, FILLS),
		);
	});
});
