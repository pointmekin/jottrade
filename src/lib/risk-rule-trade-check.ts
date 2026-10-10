import { realizedAt } from "./analytics";
import type { ComplianceHistory } from "./risk-rule-compliance";
import {
	buildRuleContext,
	evaluateEntry,
	type RuleCheck,
} from "./risk-rule-evaluation";
import { TradeStatus } from "./trade";

/** The entry check of a saved trade with today's data: its current plan and the trades entered before it. */
export function evaluateTradeNow(
	history: ComplianceHistory,
	tradeId: number,
): RuleCheck | null {
	const trade = history.trades.find((item) => item.id === tradeId);
	if (!trade) return null;
	const at = trade.entryDate.getTime();
	const earlier = history.trades.filter(
		(item) =>
			item.entryDate.getTime() < at ||
			(item.entryDate.getTime() === at && item.id < trade.id),
	);
	const context = buildRuleContext(
		{ ...history, trades: earlier },
		trade.entryDate,
	);
	return evaluateEntry(context, {
		entryDate: trade.entryDate,
		plan: trade.plan,
		exit:
			trade.status === TradeStatus.Closed
				? { at: realizedAt(trade), netPnl: trade.netPnl }
				: null,
	});
}
