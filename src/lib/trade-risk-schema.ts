import { z } from "zod";
import { TradeSide } from "./trade";

export const RiskCaptureSource = {
	Manual: "MANUAL",
	Calculator: "CALCULATOR",
	Command: "COMMAND",
	LegacyAttested: "LEGACY_ATTESTED",
} as const;
export const ConversionSource = {
	Identity: "IDENTITY",
	InstrumentPrice: "INSTRUMENT_PRICE",
	UserProvided: "USER_PROVIDED",
	LegacyFallback: "LEGACY_UNIT_FALLBACK",
} as const;
export const SpecSource = {
	Registry: "REGISTRY",
	ConfirmedUnits: "USER_CONFIRMED_UNITS",
	Unknown: "UNKNOWN",
	LegacyFallback: "LEGACY_UNIT_FALLBACK",
} as const;
export const RiskUnavailableReason = {
	MissingStop: "No initial stop recorded",
	MissingFx: "An entry quote-to-account FX rate is required",
	UnknownSpec: "Confirm units and quote currency",
	InvalidInput: "Enter valid prices and quantity",
	CurrencyMismatch: "Account currency differs from the saved plan",
} as const;
export const positiveDecimal = z
	.string()
	.trim()
	.refine(
		(value) =>
			/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) &&
			Number.isFinite(Number(value)) &&
			Number(value) > 0,
		"Enter a positive decimal number.",
	);
export const optionalPositiveDecimal = z
	.union([positiveDecimal, z.literal("")])
	.optional();
export const riskInputSchema = z.object({
	initialStopPrice: optionalPositiveDecimal,
	entryQuoteToAccountRate: optionalPositiveDecimal,
	balanceAccount: z
		.string()
		.trim()
		.refine(
			(v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
			"Balance must be nonnegative.",
		)
		.optional(),
	confirmedUnitQuoteCurrency: z
		.union([
			z
				.string()
				.trim()
				.regex(/^[A-Za-z]{3}$/),
			z.literal(""),
		])
		.optional(),
	captureSource: z.enum(RiskCaptureSource).optional(),
});
export type RiskInputs = z.infer<typeof riskInputSchema>;
export const initialRiskSnapshotSchema = z.object({
	version: z.literal(1),
	symbol: z.string(),
	side: z.enum(TradeSide),
	entryDate: z.string(),
	entryPrice: z.string(),
	quantity: z.string(),
	stopPrice: z.string().nullable(),
	targetPrice: z.string().nullable(),
	instrumentSymbol: z.string(),
	instrumentKind: z.enum(["FOREX", "METAL", "UNIT"]),
	quantityUnit: z.enum(["LOTS", "UNITS"]),
	contractSize: z.string(),
	quoteCurrency: z.string().nullable(),
	accountCurrency: z.string(),
	specSource: z.enum(SpecSource),
	quoteToAccountRate: z.string().nullable(),
	conversionSource: z.enum(ConversionSource).nullable(),
	conversionAsOf: z.string().nullable(),
	balanceAccount: z.string().nullable(),
	balanceAsOf: z.string().nullable(),
	balanceSource: z.literal("USER_REVIEWED").nullable(),
	riskBasis: z.literal("PRICE_DISTANCE"),
	estimatedCostsIncluded: z.literal(false),
	captureSource: z.enum(RiskCaptureSource),
	capturedAt: z.string(),
	unavailableReason: z.enum(RiskUnavailableReason).nullable(),
});
export type InitialRiskSnapshot = z.infer<typeof initialRiskSnapshotSchema>;
export const riskPlanSchema = z.object({
	initialStopPrice: z.string().nullable(),
	initialTargetPrice: z.string().nullable(),
	initialRiskAmount: z.string().nullable(),
	initialRiskPercent: z.string().nullable(),
	initialRiskSnapshot: initialRiskSnapshotSchema.nullable(),
});
export const riskCorrectionSchema = z.object({
	correctedAt: z.string(),
	reason: z.string(),
	revisionBefore: z.number(),
	revisionAfter: z.number(),
	previous: riskPlanSchema,
	replacement: riskPlanSchema,
});
export type RiskCorrection = z.infer<typeof riskCorrectionSchema>;
export type RiskPlan = z.infer<typeof riskPlanSchema>;
