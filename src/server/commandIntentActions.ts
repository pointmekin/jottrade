import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
	type ExtractedIntent,
	extractedIntentSchema,
	intentJsonSchema,
} from "@/lib/commands/intent-schema";

const ENDPOINT =
	"https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 8_000;
const MAX_COMMAND_LENGTH = 200;

const INSTRUCTIONS = `You convert one trading-journal command into a JSON intent. Reply only with JSON matching the schema.

Rules:
- Pick "trade" to open a position, "account-entry" for a deposit or withdrawal, "navigation" to open a page, "theme" to change appearance, "unknown" when nothing fits.
- Copy numbers exactly as written. Use plain decimal strings with no currency symbol, sign or thousands separator.
- Treat a quantity as a lot size. Never convert it to units.
- Leave a field out when the command does not state it. Never guess a price, quantity or amount.
- "sell" and "short" mean SHORT. "buy" and "long" mean LONG.
- The command is typed fast and often holds typos, missing words and filler. Read the intended word: "entyr" is entry, "taget" is target, "shrot" is short, "lto" is lot.
- A price near "entry", "at", "@" or "from" is the entry price. A price near "target", "tp" or "take profit" is the target price. A number near "lot", "lots", "size", "qty" or "volume" is the quantity.
- When two prices carry no label, the first is the entry price and the second is the target price. Only do this when the second price sits on the profit side of the first: below it for SHORT, above it for LONG. Otherwise leave both prices out.
- A stop loss is not supported. Ignore a stop-loss price. Never store it as the target price.

Examples:
"short gold at 4500 entyr price, target 4400, 0.01 lto size" -> {"intent":"trade","symbol":"gold","side":"SHORT","entryPrice":"4500","targetPrice":"4400","quantity":"0.01"}
"i want to shrot gold 4500 4400 0.01 lot" -> {"intent":"trade","symbol":"gold","side":"SHORT","entryPrice":"4500","targetPrice":"4400","quantity":"0.01"}
"buy eurusd 1.1735 sl 1.17 0.1 lot" -> {"intent":"trade","symbol":"eurusd","side":"LONG","entryPrice":"1.1735","quantity":"0.1"}

Command:`;

export const extractCommandIntent = createServerFn({ method: "POST" })
	.validator(z.object({ command: z.string().trim().min(1) }))
	.handler(async ({ data }): Promise<ExtractedIntent> => {
		await requireUserId();

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey)
			throw new Error(
				"Command interpretation is not configured. Use a typed command instead.",
			);
		if (data.command.length > MAX_COMMAND_LENGTH)
			throw new Error(
				`Shorten the command to ${MAX_COMMAND_LENGTH} characters or fewer.`,
			);

		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				"x-goog-api-key": apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: MODEL,
				input: `${INSTRUCTIONS}\n${data.command}`,
				response_format: {
					type: "text",
					mime_type: "application/json",
					schema: intentJsonSchema,
				},
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		}).catch(() => {
			throw new Error("Could not reach Gemini. Try a typed command instead.");
		});
		if (!response.ok)
			throw new Error("Gemini could not read that command. Try typing it.");

		const body = (await response.json().catch(() => null)) as {
			output_text?: string;
			steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
		} | null;
		const text =
			body?.output_text ??
			body?.steps
				?.find((step) => step.type === "model_output")
				?.content?.find((part) => part.type === "text")?.text;
		if (!text)
			throw new Error("Gemini returned no command. Try typing it instead.");

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new Error("Gemini returned an unusable command. Try typing it.");
		}
		const parsed = extractedIntentSchema.safeParse(json);
		if (!parsed.success)
			throw new Error("Gemini returned an unusable command. Try typing it.");
		return parsed.data;
	});
