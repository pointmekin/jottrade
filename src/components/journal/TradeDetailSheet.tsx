import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { QueryKey } from "@/lib/query-keys";
import { type Trade, TradeSide } from "@/lib/trade";
import { cn } from "@/lib/utils";
import { updateTrade } from "@/server/tradeActions";
import { DeleteTradeDialog } from "./DeleteTradeDialog";
import { TradeImages } from "./trade-images";
import { TradeOverviewForm } from "./trade-overview-form";
import { TradeRiskDetails } from "./trade-risk-details";

interface TradeDetailContentProps {
	trade: Trade;
	onDeleted: () => void;
}

function Divider() {
	return <div className="h-px bg-border" />;
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
	const saveNotes = useMutation({
		mutationFn: (notes: string) =>
			updateTrade({ data: { id: trade.id, notes } }),
		onSuccess: refreshTrade,
	});

	return (
		<div className="surface overflow-hidden bg-popover text-popover-foreground">
			<div
				className={cn(
					"h-px w-full flex-shrink-0",
					trade.side === TradeSide.Long ? "bg-success" : "bg-destructive",
				)}
			/>
			<div className="space-y-6 px-4 py-4 sm:px-5 sm:py-5">
				<TradeOverviewForm trade={trade} />
				<TradeRiskDetails key={trade.id} trade={trade} />
				<Divider />
				<div className="space-y-2">
					<p className="field-label">Notes</p>
					<Textarea
						defaultValue={trade.notes ?? ""}
						className="min-h-32 resize-none border-input bg-background text-sm leading-relaxed placeholder:text-muted-foreground"
						placeholder="Add your trade notes here…"
						onBlur={(event) => saveNotes.mutate(event.target.value)}
					/>
					<p className="text-xs text-muted-foreground">Auto-saved on blur.</p>
				</div>
				<Divider />
				<TradeImages trade={trade} onChange={refreshTrade} />
				<Divider />
				<div className="flex items-center justify-between gap-4 pb-2">
					<div>
						<p className="text-sm font-medium">Delete this trade</p>
						<p className="text-xs text-muted-foreground">
							Permanently remove it from your journal.
						</p>
					</div>
					<DeleteTradeDialog trade={trade} onDeleted={onDeleted} />
				</div>
			</div>
		</div>
	);
}
