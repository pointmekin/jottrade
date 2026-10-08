import { createServerFn } from "@tanstack/react-start";
import { loadAccountHistory, loadMatchingTrades } from "@/db/account-history";
import { analysisScopeSchema, toDateRange } from "@/lib/analysis-scope";
import { summarizeScope } from "@/lib/analytics";
import { authMiddleware } from "./auth-middleware";

export const getAnalytics = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(analysisScopeSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		// The whole history loads because the window needs the balance carried into it.
		const [history, matching] = await Promise.all([
			loadAccountHistory(userId, data.portfolioId),
			loadMatchingTrades(userId, data),
		]);
		return summarizeScope(history, matching, toDateRange(data), data.timeZone);
	});
