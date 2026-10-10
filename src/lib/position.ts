import { z } from "zod";
import { roundCents } from "./currency";
import { priceReturnPercent } from "./finance";
import { calculateManualPnl, type ManualPnlInput } from "./pnl-context";
import { type TradeSide, TradeStatus } from "./trade";
import { riskDecimal } from "./trade-risk";
import { optionalPositiveDecimal, positiveDecimal } from "./trade-risk-schema";

export const ExecutionKind = {
	Entry: "entry",
	Exit: "exit",
} as const;

export type ExecutionKind = (typeof ExecutionKind)[keyof typeof ExecutionKind];

export const PositionError = {
	InvalidQuantity: "INVALID_QUANTITY",
	InvalidPrice: "INVALID_PRICE",
	InvalidFee: "INVALID_FEE",
	ExitBeforeEntry: "EXIT_BEFORE_ENTRY",
	OverClose: "OVER_CLOSE",
	Reopen: "REOPEN",
} as const;

export type PositionError = (typeof PositionError)[keyof typeof PositionError];

const isNonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const isPositive = (value: number) => Number.isFinite(value) && value > 0;

export const executionInputSchema = z.object({
	kind: z.enum(ExecutionKind),
	executedAt: z
		.string()
		.refine((v) => Number.isFinite(Date.parse(v)), "Enter a valid fill time."),
	price: positiveDecimal,
	quantity: positiveDecimal,
	fees: z
		.string()
		.trim()
		.refine(
			(v) => v === "" || isNonnegative(Number(v)),
			"Fees must be nonnegative.",
		)
		.optional(),
	exitQuoteToAccountRate: optionalPositiveDecimal,
});

export type PositionFill = Omit<
	z.infer<typeof executionInputSchema>,
	"executedAt"
> & { executedAt: Date };

export type PositionInstrument = Pick<
	ManualPnlInput,
	"symbol" | "accountCurrency" | "confirmedUnitQuoteCurrency"
>;

type PositionState = {
	remainingQty: number;
	averageEntryPrice: number;
	unallocatedFees: number;
	cumulativeRealizedPnl: number;
};

export type PositionStep = PositionState & {
	fill: PositionFill;
	allocatedEntryFees: number;
	realizedPnl: number | null;
};

export type PositionReplay =
	| { ok: true; steps: PositionStep[] }
	| {
			ok: false;
			error: PositionError;
			fill: PositionFill;
			remainingQty: number;
	  };

// Floating-point sums such as 0.1 + 0.2 must close a position exactly.
const roundQuantity = (value: number) => Number(value.toFixed(8));
const feeOf = (fill: PositionFill) => Number(fill.fees || "0");

function fillError(
	fill: PositionFill,
	state: PositionState,
	isFirst: boolean,
): PositionError | null {
	if (!isPositive(Number(fill.quantity))) return PositionError.InvalidQuantity;
	if (!isPositive(Number(fill.price))) return PositionError.InvalidPrice;
	if (!isNonnegative(feeOf(fill))) return PositionError.InvalidFee;
	if (!isFirst && state.remainingQty === 0) return PositionError.Reopen;
	if (fill.kind === ExecutionKind.Entry) return null;
	if (isFirst) return PositionError.ExitBeforeEntry;
	if (roundQuantity(Number(fill.quantity)) > state.remainingQty)
		return PositionError.OverClose;
	return null;
}

function applyEntry(state: PositionState, fill: PositionFill): PositionStep {
	const quantity = Number(fill.quantity);
	const remainingQty = roundQuantity(state.remainingQty + quantity);
	return {
		...state,
		fill,
		remainingQty,
		averageEntryPrice:
			(state.averageEntryPrice * state.remainingQty +
				Number(fill.price) * quantity) /
			remainingQty,
		unallocatedFees: state.unallocatedFees + feeOf(fill),
		allocatedEntryFees: 0,
		realizedPnl: null,
	};
}

function applyExit(
	side: TradeSide,
	instrument: PositionInstrument,
	state: PositionState,
	fill: PositionFill,
): PositionStep {
	const quantity = Number(fill.quantity);
	const remainingQty = roundQuantity(state.remainingQty - quantity);
	const allocatedEntryFees =
		remainingQty === 0
			? state.unallocatedFees
			: (state.unallocatedFees * quantity) / state.remainingQty;
	const realizedPnl = Number(
		calculateManualPnl({
			...instrument,
			side,
			entryPrice: String(state.averageEntryPrice),
			exitPrice: fill.price,
			exitDate: fill.executedAt.toISOString(),
			quantity: fill.quantity,
			fees: String(feeOf(fill) + allocatedEntryFees),
			exitQuoteToAccountRate: fill.exitQuoteToAccountRate,
		}).netPnl,
	);
	return {
		...state,
		fill,
		remainingQty,
		unallocatedFees: state.unallocatedFees - allocatedEntryFees,
		allocatedEntryFees,
		realizedPnl,
		cumulativeRealizedPnl: roundCents(
			state.cumulativeRealizedPnl + realizedPnl,
		),
	};
}

/**
 * Replays fills in time order with weighted average cost. Fills with the same
 * time keep their input order. Exit FX errors from `calculateManualPnl` throw.
 */
export function replayPosition(
	side: TradeSide,
	fills: PositionFill[],
	instrument: PositionInstrument,
): PositionReplay {
	const ordered = [...fills].sort(
		(a, b) => a.executedAt.getTime() - b.executedAt.getTime(),
	);
	const steps: PositionStep[] = [];
	let state: PositionState = {
		remainingQty: 0,
		averageEntryPrice: 0,
		unallocatedFees: 0,
		cumulativeRealizedPnl: 0,
	};
	for (const fill of ordered) {
		const error = fillError(fill, state, steps.length === 0);
		if (error)
			return { ok: false, error, fill, remainingQty: state.remainingQty };
		const step =
			fill.kind === ExecutionKind.Entry
				? applyEntry(state, fill)
				: applyExit(side, instrument, state, fill);
		steps.push(step);
		state = step;
	}
	return { ok: true, steps };
}

function weightedPrice(steps: PositionStep[]) {
	const quantity = steps.reduce((sum, s) => sum + Number(s.fill.quantity), 0);
	const notional = steps.reduce(
		(sum, s) => sum + Number(s.fill.price) * Number(s.fill.quantity),
		0,
	);
	return { quantity, price: notional / quantity };
}

export function positionTotals(side: TradeSide, steps: PositionStep[]) {
	const last = steps.at(-1);
	if (!last) throw new Error("A position needs at least one entry fill.");
	const entries = weightedPrice(
		steps.filter((s) => s.fill.kind === ExecutionKind.Entry),
	);
	const isClosed = last.remainingQty === 0;
	const exitPrice = isClosed
		? weightedPrice(steps.filter((s) => s.fill.kind === ExecutionKind.Exit))
				.price
		: null;
	return {
		entryDate: steps[0].fill.executedAt,
		entryPrice: riskDecimal(entries.price),
		quantity: riskDecimal(entries.quantity),
		exitDate: isClosed ? last.fill.executedAt : null,
		exitPrice: exitPrice === null ? null : riskDecimal(exitPrice),
		fees: riskDecimal(steps.reduce((sum, s) => sum + feeOf(s.fill), 0)),
		netPnl: isClosed ? last.cumulativeRealizedPnl.toFixed(2) : null,
		returnPercent:
			exitPrice === null
				? null
				: (priceReturnPercent(side, entries.price, exitPrice) ?? 0).toFixed(2),
		status: isClosed ? TradeStatus.Closed : TradeStatus.Open,
	};
}
