import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import {
	type CommandExtractionResult,
	commandInputSchema,
	LOCAL_CONFIDENCE_THRESHOLD,
} from "@/lib/commands/intent-schema";
import { matchCommands } from "@/lib/commands/matcher";

export const extractCommandIntent = createServerFn({ method: "POST" })
	.validator(commandInputSchema)
	.handler(async ({ data }): Promise<CommandExtractionResult> => {
		try {
			const session = await auth.api.getSession({
				headers: getRequestHeaders(),
			});
			if (!session)
				return { error: "Sign in to interpret commands with Gemini." };
			const local = matchCommands(data.command)[0];
			if (local && local.confidence >= LOCAL_CONFIDENCE_THRESHOLD)
				return { intent: local.intent };
			const { extractWithGemini } = await import("./gemini-command.server");
			return await extractWithGemini(data.command, session.user.id);
		} catch {
			return {
				error:
					"Gemini could not interpret this command. Try again or use a local command.",
			};
		}
	});
