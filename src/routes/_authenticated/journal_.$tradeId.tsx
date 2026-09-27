import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import { TradeDetailContent } from "@/components/journal/TradeDetailSheet";
import { TradeReturns } from "@/components/journal/trade-returns";
import { MetricCardSkeleton } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { MetricVariant } from "@/lib/metric";
import { QueryKey } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import { getTradeById } from "@/server/getTrades";

export const Route = createFileRoute("/_authenticated/journal_/$tradeId")({
	component: JournalEntryPage,
});

function formatEntryDate(value: Date) {
	return new Date(value).toLocaleString("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function tradeMeta(trade: Trade, currency: string) {
	const date = formatEntryDate(trade.entryDate);
	if (!trade.netPnl) return date;
	const pnl = formatMoney(Number(trade.netPnl), currency, { signed: true });
	return `${date} · ${pnl} net P&L`;
}

function JournalEntryPage() {
	const navigate = useNavigate({ from: "/journal/$tradeId" });
	const { tradeId } = useParams({ from: "/_authenticated/journal_/$tradeId" });
	const currency = useCurrency();
	const { activeAccount } = useAccounts();
	const id = Number(tradeId);
	const isValidId = Number.isInteger(id) && id > 0;
	const portfolioId = activeAccount?.id;

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: [QueryKey.Trade, portfolioId, id],
		queryFn: () =>
			getTradeById({ data: { portfolioId: portfolioId as number, id } }),
		enabled: isValidId && portfolioId !== undefined,
	});
	const goBack = () => navigate({ to: "/journal" });

	return (
		<div className="app-page">
			<main className="page-frame section-enter max-w-5xl space-y-5">
				<AppPageHeader
					title={data?.symbol ?? "Journal entry"}
					description={
						data
							? `${data.side} · ${data.status ?? "Unspecified status"} · Review and refine this trade.`
							: "Review and refine a recorded trade."
					}
					meta={data ? tradeMeta(data, currency) : undefined}
					actions={<BackButton onClick={goBack} />}
				/>
				{isLoading && <JournalEntrySkeleton />}
				{!isLoading && !data && (
					<EntryUnavailable
						isError={isError}
						onBack={goBack}
						onRetry={() => refetch()}
					/>
				)}
				{!isLoading && data && (
					<>
						<TradeReturns trade={data} accountReturn={data.accountReturn} />
						<TradeDetailContent trade={data} onDeleted={goBack} />
					</>
				)}
			</main>
		</div>
	);
}

function BackButton({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="outline" onClick={onClick}>
			<ArrowLeft className="h-4 w-4" />
			Back to Journal
		</Button>
	);
}

function EntryUnavailable({
	isError,
	onBack,
	onRetry,
}: {
	isError: boolean;
	onBack: () => void;
	onRetry: () => void;
}) {
	return (
		<div className="surface flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
			<h2 className="text-base font-semibold text-foreground">
				{isError
					? "This journal entry could not be loaded"
					: "Journal entry not found"}
			</h2>
			<p className="max-w-md text-sm text-muted-foreground">
				{isError
					? "The entry may have been removed or is temporarily unavailable."
					: "This entry may have been removed, or you may not have access to it."}
			</p>
			<div className="flex flex-wrap justify-center gap-2">
				<BackButton onClick={onBack} />
				{isError && (
					<Button variant="ghost" onClick={onRetry}>
						<RefreshCw className="h-4 w-4" />
						Try again
					</Button>
				)}
			</div>
		</div>
	);
}

function JournalEntrySkeleton() {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<MetricCardSkeleton variant={MetricVariant.Compact} />
				<MetricCardSkeleton variant={MetricVariant.Compact} />
			</div>
			<div className="surface space-y-4 p-5" aria-hidden="true">
				<div className="grid grid-cols-2 gap-3">
					{["entry", "target", "exit", "quantity", "fees"].map((field) => (
						<Skeleton key={field} className="h-9 w-full" />
					))}
				</div>
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
		</>
	);
}
