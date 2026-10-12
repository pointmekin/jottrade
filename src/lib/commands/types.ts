import type { z } from "zod";
import type {
	accountEntryParamsSchema,
	ExtractedCommandIntent,
	tradeParamsSchema,
} from "./intent-schema";

export type TradeParams = z.infer<typeof tradeParamsSchema>;
export type AccountEntryParams = z.infer<typeof accountEntryParamsSchema>;
export type CommandIntent = Exclude<
	ExtractedCommandIntent,
	{ type: "unknown" }
>;
export type WriteIntent = Extract<
	CommandIntent,
	{ type: "trade" | "account-entry" }
>;
export type CommandCandidate = {
	id: string;
	title: string;
	intent: CommandIntent;
	confidence: number;
	warning?: string;
};
export type RegisteredCommand = Omit<CommandCandidate, "confidence"> & {
	aliases: string[];
};
