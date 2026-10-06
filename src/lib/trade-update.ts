import { shouldRecalculatePnl } from "./finance";
import { calculateManualPnl } from "./pnl-context";
import type { Trade } from "./trade";
import type { TradeCaptureValues } from "./trade-capture";
import { resolveRiskInstrument } from "./trade-risk";
import { SpecSource } from "./trade-risk-schema";

export type TradeUpdateFields = Partial<TradeCaptureValues> & {
	portfolioId?: number;
	managementStopPrice?: string | null;
};
export type StoredTrade = Trade & { importHash: string | null };
const PNL_FIELDS = [
	"symbol",
	"side",
	"entryPrice",
	"exitPrice",
	"exitDate",
	"quantity",
	"fees",
	"exitQuoteToAccountRate",
	"confirmedUnitQuoteCurrency",
	"portfolioId",
] as const;

export function hasPnlChanges(
	existing: StoredTrade,
	changes: TradeUpdateFields,
) {
	return PNL_FIELDS.some((key) => {
		const value = changes[key];
		if (value === undefined) return false;
		if (key === "confirmedUnitQuoteCurrency")
			return value !== savedUnitQuote(existing);
		const stored = existing[key];
		if (key === "exitDate")
			return dateDiffers(String(value || ""), existing.exitDate);
		if (isDecimalField(key)) return !sameDecimal(value, stored);
		return String(value || "") !== String(stored ?? "");
	});
}

function savedUnitQuote(existing: StoredTrade) {
	const context = existing.pnlCalculationSnapshot;
	if (context?.specSource === SpecSource.ConfirmedUnits)
		return context.quoteCurrency ?? "";
	return "";
}

export function manualPnlForUpdate(
	existing: StoredTrade,
	changes: TradeUpdateFields,
	accountCurrency: string,
) {
	if (
		!shouldRecalculatePnl(existing.importHash) ||
		!hasPnlChanges(existing, changes)
	)
		return { isRecalculated: false as const };
	const exitPrice = changes.exitPrice || existing.exitPrice;
	const entryPrice = changes.entryPrice || existing.entryPrice;
	const quantity = changes.quantity || existing.quantity;
	if (!exitPrice || !entryPrice || !quantity)
		return { isRecalculated: false as const };
	const unitQuote = reviewedPnlContext(existing, changes, accountCurrency);
	const pnl = calculateManualPnl({
		symbol: changes.symbol ?? existing.symbol,
		side: changes.side ?? existing.side,
		entryPrice,
		exitPrice,
		quantity,
		accountCurrency,
		fees: changes.fees ?? existing.fees,
		exitDate: changes.exitDate || existing.exitDate?.toISOString(),
		exitQuoteToAccountRate:
			changes.exitQuoteToAccountRate ?? existing.exitQuoteToAccountRate,
		confirmedUnitQuoteCurrency: unitQuote,
	});
	return { ...pnl, isRecalculated: true as const };
}

const NULLABLE_DECIMAL_FIELDS = [
	"targetPrice",
	"exitPrice",
	"exitQuoteToAccountRate",
	"managementStopPrice",
	"initialStopPrice",
	"entryQuoteToAccountRate",
] as const;
type NullableDecimalField = (typeof NULLABLE_DECIMAL_FIELDS)[number];
type DecimalInputs = Partial<
	Record<NullableDecimalField | "fees", string | null | undefined>
>;
export type DecimalWrite<T extends DecimalInputs> = {
	[K in keyof T]: K extends NullableDecimalField ? T[K] | null : T[K];
};

// PostgreSQL numeric columns refuse "", so a blank form field is stored as
// "no value"; blank fees are zero fees, as on create.
export function blankDecimalsToNull<T extends DecimalInputs>(
	values: T,
): DecimalWrite<T> {
	const write: DecimalInputs = { ...values };
	for (const key of NULLABLE_DECIMAL_FIELDS)
		if (write[key] === "") write[key] = null;
	if (write.fees === "") write.fees = "0";
	return write as DecimalWrite<T>;
}

export function assertExitKept(
	existing: StoredTrade,
	changes: TradeUpdateFields,
) {
	if (existing.exitPrice && changes.exitPrice === "")
		throw new Error(
			"A closed trade keeps its exit price. Enter the corrected exit price instead.",
		);
}

export function assertInitialPlanPreserved(
	existing: StoredTrade,
	changes: TradeUpdateFields,
) {
	if (!existing.initialRiskSnapshot) return;
	const identityFields = [
		"symbol",
		"side",
		"entryPrice",
		"entryDate",
		"portfolioId",
	] as const;
	for (const key of identityFields) {
		const supplied = changes[key];
		if (supplied === undefined) continue;
		const old =
			key === "entryDate" ? existing.entryDate.toISOString() : existing[key];
		const matches =
			key === "entryPrice"
				? sameDecimal(supplied, old)
				: String(supplied) === String(old);
		if (!matches)
			throw new Error(
				"Use Correct original plan to change entry facts on a trade with a saved plan.",
			);
	}
}

function reviewedPnlContext(
	existing: StoredTrade,
	changes: TradeUpdateFields,
	accountCurrency: string,
) {
	const context = existing.pnlCalculationSnapshot;
	const unitQuote =
		changes.confirmedUnitQuoteCurrency ??
		(context?.specSource === SpecSource.ConfirmedUnits
			? (context.quoteCurrency ?? undefined)
			: undefined);
	const nextSpec = resolveRiskInstrument(
		changes.symbol ?? existing.symbol,
		unitQuote,
	).spec;
	if (
		context &&
		existing.exitQuoteToAccountRate &&
		nextSpec.quoteCurrency !== context.quoteCurrency
	)
		throw new Error(
			"Review P&L conversion before changing the execution quote currency.",
		);
	if (
		context &&
		context.accountCurrency !== accountCurrency &&
		changes.exitQuoteToAccountRate === undefined
	)
		throw new Error("Review P&L conversion for the new account currency.");
	const changedExitTime =
		changes.exitDate !== undefined &&
		dateDiffers(changes.exitDate, existing.exitDate);
	if (
		changedExitTime &&
		existing.exitQuoteToAccountRate &&
		changes.exitQuoteToAccountRate === undefined
	)
		throw new Error(
			"Review the external exit FX rate when correcting the exit date.",
		);
	return unitQuote;
}

function sameDecimal(left: unknown, right: unknown) {
	if (!left || !right) return String(left || "") === String(right || "");
	return Number(left) === Number(right);
}

function isDecimalField(key: string) {
	return [
		"entryPrice",
		"exitPrice",
		"quantity",
		"fees",
		"exitQuoteToAccountRate",
	].includes(key);
}

function dateDiffers(value: string, stored: Date | null | undefined) {
	if (!value || !stored) return Boolean(value) !== Boolean(stored);
	return Date.parse(value) !== stored.getTime();
}

export function manualPnlFieldsForUpdate(
	existing: StoredTrade,
	changes: TradeUpdateFields,
	accountCurrency: string,
) {
	const result = manualPnlForUpdate(existing, changes, accountCurrency);
	if (!result.isRecalculated) return {};
	return {
		netPnl: result.netPnl,
		returnPercent: result.returnPercent,
		pnlCalculationSnapshot: result.pnlCalculationSnapshot,
		exitQuoteToAccountRate: result.exitQuoteToAccountRate,
	};
}
