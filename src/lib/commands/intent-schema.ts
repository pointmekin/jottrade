import { z } from "zod";
import { AccountEntryKind } from "@/lib/account-entry";
import { navItems } from "@/lib/nav-items";

export const MAX_COMMAND_LENGTH = 1000;
export const LOCAL_CONFIDENCE_THRESHOLD = 0.9;
export const commandInputSchema = z.strictObject({
	command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
});
const positiveDecimal = z
	.string()
	.max(40)
	.regex(/^(?:\d+(?:\.\d+)?|\.\d+)$/)
	.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0);
export const tradeParamsSchema = z.strictObject({
	symbol: z
		.string()
		.regex(/^[A-Z][A-Z0-9./_-]{0,39}$/)
		.optional(),
	side: z.enum(["LONG", "SHORT"]).optional(),
	entryPrice: positiveDecimal.optional(),
	quantity: positiveDecimal.optional(),
	quantityUnit: z.enum(["LOTS", "UNITS"]).optional(),
	targetPrice: positiveDecimal.optional(),
});
export const accountEntryParamsSchema = z.strictObject({
	kind: z.enum([AccountEntryKind.Deposit, AccountEntryKind.Withdrawal]),
	amount: positiveDecimal.regex(/^\d+(?:\.\d{1,2})?$/).optional(),
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/)
		.optional(),
});
export const commandIntentSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("trade"), params: tradeParamsSchema }),
	z.strictObject({
		type: z.literal("account-entry"),
		params: accountEntryParamsSchema,
	}),
	z.strictObject({
		type: z.literal("navigation"),
		path: z.enum(navItems.map((item) => item.url)),
	}),
	z.strictObject({
		type: z.literal("theme"),
		theme: z.enum(["dark", "light", "system"]),
	}),
	z.strictObject({ type: z.literal("unknown") }),
]);
export type ExtractedCommandIntent = z.infer<typeof commandIntentSchema>;
export type CommandExtractionResult =
	| { intent: ExtractedCommandIntent; error?: never }
	| { error: string; intent?: never };
