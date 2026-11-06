import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QueryKey } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import { DeleteTradeDialog } from "./DeleteTradeDialog";
import { GroupedPosition } from "./grouped-position";
import { PositionTimeline } from "./position-timeline";
import { TradeImages } from "./trade-images";
import { TradeOverviewForm } from "./trade-overview-form";
import { TradePlaybookCheck } from "./trade-playbook-check";
import { TradeReviewAnnotation } from "./trade-review-annotation";
import { TradeRiskDetails } from "./trade-risk-details";
import { TradeTags } from "./trade-tags";

interface TradeDetailContentProps {
	trade: Trade;
	onDeleted: () => void;
}

function DetailSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="page-section" aria-label={title}>
			<h2 className="text-base font-semibold">{title}</h2>
			<div className="mt-5 space-y-8">{children}</div>
		</section>
	);
}

export function TradeDetailContent({
	trade,
	onDeleted,
}: TradeDetailContentProps) {
	const queryClient = useQueryClient();
	const refreshTrade = () => {
		queryClient.invalidateQueries({ queryKey: [QueryKey.Trades] });
		queryClient.invalidateQueries({ queryKey: [QueryKey.Trade] });
	};

	return (
		<div>
			<DetailSection title="Review">
				<TradeReviewAnnotation tradeId={trade.id} />
				<TradeTags trade={trade} />
				<TradePlaybookCheck tradeId={trade.id} />
				<TradeImages trade={trade} onChange={refreshTrade} />
			</DetailSection>
			<DetailSection title="Trade details">
				<TradeOverviewForm trade={trade} />
			</DetailSection>
			<DetailSection title="Execution and risk">
				<GroupedPosition trade={trade} onUngrouped={onDeleted} />
				<PositionTimeline trade={trade} />
				<TradeRiskDetails key={trade.id} trade={trade} />
			</DetailSection>
			<div className="page-section flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					Deleting removes this trade from your journal permanently.
				</p>
				<DeleteTradeDialog trade={trade} onDeleted={onDeleted} />
			</div>
		</div>
	);
}
