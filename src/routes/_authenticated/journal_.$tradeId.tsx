import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import type { Trade } from "@/components/journal/JournalTable";
import { TradeDetailContent } from "@/components/journal/TradeDetailSheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { getTradeById } from "@/server/getTrades";

export const Route = createFileRoute("/_authenticated/journal_/$tradeId")({
	component: JournalEntryPage,
});

function JournalEntryPage() {
	const navigate = useNavigate({ from: "/journal/$tradeId" });
	const { tradeId } = useParams({ from: "/_authenticated/journal_/$tradeId" });
	const currency = useCurrency();
	const { activeAccount } = useAccounts();
	const numericTradeId = Number(tradeId);
	const isValidId = Number.isInteger(numericTradeId) && numericTradeId > 0;

	const portfolioId = activeAccount?.id;
	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["trade", portfolioId, numericTradeId],
		queryFn: () =>
			portfolioId === undefined
				? Promise.resolve(null)
				: getTradeById({ data: { portfolioId, id: numericTradeId } }),
		enabled: isValidId && portfolioId !== undefined,
	});

	const trade = data as Trade | null | undefined;
	const goBack = () => navigate({ to: "/journal" });

	return (
		<div className="app-page">
			<main className="page-frame section-enter max-w-5xl space-y-5">
				<AppPageHeader
					title={trade?.symbol ?? "Journal entry"}
					description={
						trade
							? `${trade.side} · ${trade.status ?? "Unspecified status"} · Review and refine this trade.`
							: "Review and refine a recorded trade."
					}
					meta={
						trade
							? `${formatEntryDate(trade.entryDate)}${trade.netPnl ? ` · ${formatMoney(Number(trade.netPnl), currency, { signed: true })} net P&L` : ""}`
							: undefined
					}
					actions={
						<Button variant="outline" onClick={goBack}>
							<ArrowLeft className="h-4 w-4" />
							Back to Journal
						</Button>
					}
				/>

				{isLoading && <JournalEntrySkeleton />}

				{!isLoading && (!isValidId || isError || !trade) && (
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
							<Button variant="outline" onClick={goBack}>
								<ArrowLeft className="h-4 w-4" />
								Back to Journal
							</Button>
							{isError && (
								<Button variant="ghost" onClick={() => refetch()}>
									<RefreshCw className="h-4 w-4" />
									Try again
								</Button>
							)}
						</div>
					</div>
				)}

				{!isLoading && trade && !isError && (
					<TradeDetailContent trade={trade} onDeleted={goBack} />
				)}
			</main>
		</div>
	);
}

function JournalEntrySkeleton() {
	return (
		<div className="surface space-y-6 overflow-hidden">
			<div className="border-b border-border px-5 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-2">
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-4 w-36" />
					</div>
					<Skeleton className="h-6 w-24" />
				</div>
			</div>
			<div className="space-y-4 px-5 pb-5">
				<Skeleton className="h-5 w-28" />
				<div className="grid grid-cols-2 gap-3">
					{["entry", "exit", "quantity", "fees"].map((field) => (
						<Skeleton key={field} className="h-9 w-full" />
					))}
				</div>
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
		</div>
	);
}

function formatEntryDate(value: Date | string | null | undefined) {
	if (!value) return "Entry date unavailable";
	try {
		return new Date(value).toLocaleString("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return "Entry date unavailable";
	}
}
