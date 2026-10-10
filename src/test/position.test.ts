import { describe, expect, it } from "vitest";
import { calculateManualPnl } from "@/lib/pnl-context";
import {
	ExecutionKind,
	executionInputSchema,
	PositionError,
	type PositionFill,
	positionTotals,
	replayPosition,
} from "@/lib/position";
import { TradeSide, TradeStatus } from "@/lib/trade";

const USD_EURUSD = { symbol: "EURUSD", accountCurrency: "USD" };
const at = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour));
const entry = (
	hour: number,
	quantity: string,
	price: string,
	fees = "0",
): PositionFill => ({
	kind: ExecutionKind.Entry,
	executedAt: at(hour),
	price,
	quantity,
	fees,
});
const exit = (
	hour: number,
	quantity: string,
	price: string,
	fees = "0",
	exitQuoteToAccountRate?: string,
): PositionFill => ({
	kind: ExecutionKind.Exit,
	executedAt: at(hour),
	price,
	quantity,
	fees,
	exitQuoteToAccountRate,
});

function replaySteps(
	side: TradeSide,
	fills: PositionFill[],
	instrument = USD_EURUSD,
) {
	const replay = replayPosition(side, fills, instrument);
	if (!replay.ok) throw new Error(`Unexpected ${replay.error}`);
	return replay.steps;
}

function ledger(steps: ReturnType<typeof replaySteps>) {
	return steps.map((step) => ({
		remainingQty: step.remainingQty,
		unallocatedFees: Number(step.unallocatedFees.toFixed(8)),
		realizedPnl: step.realizedPnl,
		cumulativeRealizedPnl: step.cumulativeRealizedPnl,
	}));
}

const scaleInFills = [
	entry(1, "1.0", "1.1000"),
	entry(2, "1.0", "1.0950"),
	exit(3, "0.5", "1.1050"),
	exit(4, "1.5", "1.1000"),
];

describe("replayPosition", () => {
	it("reconciles a long with two entries and two partial exits after every fill", () => {
		const steps = replaySteps(TradeSide.Long, scaleInFills);

		expect(ledger(steps)).toEqual([
			{
				remainingQty: 1,
				unallocatedFees: 0,
				realizedPnl: null,
				cumulativeRealizedPnl: 0,
			},
			{
				remainingQty: 2,
				unallocatedFees: 0,
				realizedPnl: null,
				cumulativeRealizedPnl: 0,
			},
			{
				remainingQty: 1.5,
				unallocatedFees: 0,
				realizedPnl: 375,
				cumulativeRealizedPnl: 375,
			},
			{
				remainingQty: 0,
				unallocatedFees: 0,
				realizedPnl: 375,
				cumulativeRealizedPnl: 750,
			},
		]);
		expect(steps[1].averageEntryPrice).toBeCloseTo(1.0975, 10);
		expect(positionTotals(TradeSide.Long, steps)).toEqual({
			entryDate: at(1),
			entryPrice: "1.0975",
			quantity: "2",
			exitDate: at(4),
			exitPrice: "1.10125",
			fees: "0",
			netPnl: "750.00",
			returnPercent: "0.34",
			status: TradeStatus.Closed,
		});
	});

	it("reverses the sign for a short with the same fills", () => {
		const steps = replaySteps(TradeSide.Short, scaleInFills);

		expect(steps.map((step) => step.remainingQty)).toEqual([1, 2, 1.5, 0]);
		expect(steps.map((step) => step.realizedPnl)).toEqual([
			null,
			null,
			-375,
			-375,
		]);
		const totals = positionTotals(TradeSide.Short, steps);
		expect(totals.netPnl).toBe("-750.00");
		expect(totals.returnPercent).toBe("-0.34");
	});

	it("allocates entry fees to each exit by the closed quantity", () => {
		const steps = replaySteps(TradeSide.Long, [
			entry(1, "1.0", "1.2000", "4"),
			exit(2, "0.4", "1.1950", "1"),
			exit(3, "0.6", "1.2100", "1.5"),
		]);

		expect(ledger(steps)).toEqual([
			{
				remainingQty: 1,
				unallocatedFees: 4,
				realizedPnl: null,
				cumulativeRealizedPnl: 0,
			},
			{
				remainingQty: 0.6,
				unallocatedFees: 2.4,
				realizedPnl: -202.6,
				cumulativeRealizedPnl: -202.6,
			},
			{
				remainingQty: 0,
				unallocatedFees: 0,
				realizedPnl: 596.1,
				cumulativeRealizedPnl: 393.5,
			},
		]);
		expect(steps[1].allocatedEntryFees).toBeCloseTo(1.6, 10);
		expect(positionTotals(TradeSide.Long, steps).fees).toBe("6.5");
	});

	it("keeps an open remainder out of the closed totals", () => {
		const steps = replaySteps(TradeSide.Long, scaleInFills.slice(0, 3));

		expect(positionTotals(TradeSide.Long, steps)).toMatchObject({
			quantity: "2",
			exitDate: null,
			exitPrice: null,
			netPnl: null,
			returnPercent: null,
			status: TradeStatus.Open,
		});
	});

	it("replays fills in time order, whatever the input order", () => {
		const shuffled = [
			scaleInFills[2],
			scaleInFills[0],
			scaleInFills[3],
			scaleInFills[1],
		];

		expect(ledger(replaySteps(TradeSide.Long, shuffled))).toEqual(
			ledger(replaySteps(TradeSide.Long, scaleInFills)),
		);
	});

	it("rejects an earlier exit that closes more than was open at that time", () => {
		const replay = replayPosition(
			TradeSide.Long,
			[entry(1, "1.0", "1.1"), entry(3, "1.0", "1.1"), exit(2, "1.5", "1.2")],
			USD_EURUSD,
		);

		expect(replay).toMatchObject({
			ok: false,
			error: PositionError.OverClose,
			fill: { executedAt: at(2) },
			remainingQty: 1,
		});
	});

	it.each([
		{
			name: "an over-close",
			fills: [entry(1, "1.0", "1.1"), exit(2, "1.01", "1.2")],
			error: PositionError.OverClose,
		},
		{
			name: "an exit before the first entry",
			fills: [exit(1, "1.0", "1.2"), entry(2, "1.0", "1.1")],
			error: PositionError.ExitBeforeEntry,
		},
		{
			name: "an entry after the full close",
			fills: [
				entry(1, "1.0", "1.1"),
				exit(2, "1.0", "1.2"),
				entry(3, "1.0", "1.1"),
			],
			error: PositionError.Reopen,
		},
		{
			name: "an exit after the full close",
			fills: [
				entry(1, "1.0", "1.1"),
				exit(2, "1.0", "1.2"),
				exit(3, "0.1", "1.2"),
			],
			error: PositionError.Reopen,
		},
		{
			name: "a zero quantity",
			fills: [entry(1, "0", "1.1")],
			error: PositionError.InvalidQuantity,
		},
		{
			name: "a negative quantity",
			fills: [entry(1, "1.0", "1.1"), exit(2, "-0.5", "1.2")],
			error: PositionError.InvalidQuantity,
		},
	])("rejects $name", ({ fills, error }) => {
		expect(replayPosition(TradeSide.Long, fills, USD_EURUSD)).toMatchObject({
			ok: false,
			error,
		});
	});

	it("closes exactly when decimal quantities add up", () => {
		const steps = replaySteps(TradeSide.Long, [
			entry(1, "0.1", "1.1"),
			entry(2, "0.2", "1.1"),
			exit(3, "0.3", "1.1"),
		]);

		expect(steps.at(-1)?.remainingQty).toBe(0);
	});

	it("converts JPY quote P&L into USD at each exit price", () => {
		const steps = replaySteps(
			TradeSide.Long,
			[
				entry(1, "1.0", "150"),
				entry(2, "1.0", "152"),
				exit(3, "1.0", "153"),
				exit(4, "1.0", "150"),
			],
			{ symbol: "USDJPY", accountCurrency: "USD" },
		);

		expect(steps.map((step) => step.realizedPnl)).toEqual([
			null,
			null,
			1307.19,
			-666.67,
		]);
		expect(positionTotals(TradeSide.Long, steps).netPnl).toBe("640.52");
	});

	it("converts into a non-USD account currency", () => {
		const steps = replaySteps(
			TradeSide.Long,
			[entry(1, "1.0", "1.1"), exit(2, "0.5", "1.12"), exit(3, "0.5", "1.08")],
			{ symbol: "EURUSD", accountCurrency: "EUR" },
		);

		expect(steps.map((step) => step.realizedPnl)).toEqual([
			null,
			892.86,
			-925.93,
		]);
	});

	it("uses the exit FX of each exit fill and requires it for a cross pair", () => {
		const eurJpy = { symbol: "EURJPY", accountCurrency: "USD" };
		const steps = replaySteps(
			TradeSide.Long,
			[
				entry(1, "0.15", "169"),
				exit(2, "0.05", "171", "0", "0.00625"),
				exit(3, "0.10", "170", "0", "0.0066"),
			],
			eurJpy,
		);

		expect(steps.map((step) => step.realizedPnl)).toEqual([null, 62.5, 66]);
		expect(() =>
			replayPosition(
				TradeSide.Long,
				[entry(1, "0.15", "169"), exit(2, "0.15", "171")],
				eurJpy,
			),
		).toThrow("exit FX");
	});
});

describe("legacy single-fill equality", () => {
	it.each([
		{
			side: TradeSide.Long,
			symbol: "EURUSD",
			entryPrice: "1.1",
			exitPrice: "1.1234",
			entryFee: "2",
			exitFee: "3",
		},
		{
			side: TradeSide.Short,
			symbol: "USDJPY",
			entryPrice: "153.588",
			exitPrice: "154.677",
			entryFee: "0",
			exitFee: "7",
		},
		{
			side: TradeSide.Long,
			symbol: "XAUUSD",
			entryPrice: "4348.229",
			exitPrice: "4322.605",
			entryFee: "1.1",
			exitFee: "0",
		},
	])(
		"matches calculateManualPnl for a $side $symbol",
		({ side, symbol, entryPrice, exitPrice, entryFee, exitFee }) => {
			const steps = replaySteps(
				side,
				[
					entry(1, "0.37", entryPrice, entryFee),
					exit(2, "0.37", exitPrice, exitFee),
				],
				{ symbol, accountCurrency: "USD" },
			);

			const legacy = calculateManualPnl({
				symbol,
				side,
				entryPrice,
				exitPrice,
				quantity: "0.37",
				fees: String(Number(entryFee) + Number(exitFee)),
				accountCurrency: "USD",
			});
			const totals = positionTotals(side, steps);
			expect(totals.netPnl).toBe(legacy.netPnl);
			expect(totals.returnPercent).toBe(legacy.returnPercent);
		},
	);
});

describe("executionInputSchema", () => {
	it("accepts a valid fill and rejects a zero quantity or negative fee", () => {
		const fill = {
			kind: ExecutionKind.Exit,
			executedAt: "2026-10-01T10:05:00Z",
			price: "1.1",
			quantity: "0.5",
			fees: "1.2",
		};

		expect(executionInputSchema.safeParse(fill).success).toBe(true);
		expect(
			executionInputSchema.safeParse({ ...fill, quantity: "0" }).success,
		).toBe(false);
		expect(
			executionInputSchema.safeParse({ ...fill, fees: "-1" }).success,
		).toBe(false);
	});
});
