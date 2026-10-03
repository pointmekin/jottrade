import { z } from "zod";
import { TradeSide, TradeStatus } from "./trade";
import {
	optionalPositiveDecimal,
	positiveDecimal,
	riskInputSchema,
} from "./trade-risk-schema";

const optionalDate = z
	.string()
	.refine(
		(v) => v === "" || Number.isFinite(Date.parse(v)),
		"Enter a valid date.",
	)
	.optional();
export const tradeCaptureSchema = riskInputSchema.extend({
	symbol: z
		.string()
		.trim()
		.min(1)
		.max(40)
		.transform((s) => s.toUpperCase()),
	side: z.enum(TradeSide),
	entryDate: z
		.string()
		.refine((v) => Number.isFinite(Date.parse(v)), "Enter a valid entry date."),
	entryPrice: positiveDecimal,
	quantity: positiveDecimal,
	targetPrice: optionalPositiveDecimal.nullable(),
	exitPrice: optionalPositiveDecimal,
	exitDate: optionalDate,
	exitQuoteToAccountRate: optionalPositiveDecimal,
	fees: z
		.string()
		.trim()
		.refine(
			(v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
			"Fees must be nonnegative.",
		)
		.optional(),
	notes: z.string().optional(),
	status: z.enum(TradeStatus).optional(),
});
export type TradeCaptureValues = z.infer<typeof tradeCaptureSchema>;
export type TradeCaptureDraft = Partial<TradeCaptureValues> & {
	portfolioId: number;
};
