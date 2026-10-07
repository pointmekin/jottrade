import { createMiddleware } from "@tanstack/react-start";
import { requireUserId } from "@/lib/auth";

/**
 * Every server function starts with `.middleware([authMiddleware])`. The
 * handler reads the signed-in user from `context.userId`; a request without a
 * session fails here, before validation and before the handler runs.
 * scripts/quality/server-boundaries.ts enforces this.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const userId = await requireUserId();
		return next({ context: { userId } });
	},
);
