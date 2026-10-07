import { createServerFn } from "@tanstack/react-start";
import { loadAccountHistory } from "@/db/account-history";
import { summarizeTrades } from "@/lib/analytics";
import { authMiddleware } from "./auth-middleware";
import { rangeSchema, toDateRange } from "./rangeInput";

export const getAnalytics = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(rangeSchema)
	.handler(async ({ data, context }) => {
		const { userId } = context;
		// The whole history loads because the window needs the balance carried into it.
		const history = await loadAccountHistory(userId, data.portfolioId);
		return summarizeTrades(
			history.trades,
			history.cashFlows,
			toDateRange(data),
			data.timeZone,
		);
	});
