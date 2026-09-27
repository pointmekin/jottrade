import { createServerFn } from "@tanstack/react-start";
import { loadAccountHistory } from "@/db/account-history";
import { summarizeTrades } from "@/lib/analytics";
import { requireUserId } from "@/lib/auth";
import { rangeSchema, toDateRange } from "./rangeInput";

export const getAnalytics = createServerFn({ method: "GET" })
	.validator(rangeSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		// The whole history loads because the window needs the balance carried into it.
		const history = await loadAccountHistory(userId, data.portfolioId);
		return summarizeTrades(
			history.trades,
			history.cashFlows,
			toDateRange(data),
			data.timeZone,
		);
	});
