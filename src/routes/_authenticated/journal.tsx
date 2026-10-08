import {
	createFileRoute,
	Navigate,
	retainSearchParams,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useEffect } from "react";
import { AppPageHeader } from "@/components/app-page-header";
import { AccountEntriesPanel } from "@/components/journal/AccountEntriesPanel";
import { BulkEditBar } from "@/components/journal/bulk-edit-bar";
import { ExportDialog } from "@/components/journal/export-dialog";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
import { ImportDialog } from "@/components/journal/import-dialog";
import {
	JournalTable,
	JournalTableSkeleton,
} from "@/components/journal/JournalTable";
import { JournalPagination } from "@/components/journal/journal-pagination";
import { LogTradeDrawer } from "@/components/journal/log-trade-drawer";
import { FirstTradeEmptyState } from "@/components/onboarding/first-trade-empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { useJournalEntries } from "@/hooks/use-journal-entries";
import { useIsJournalFirstRun } from "@/hooks/use-onboarding";
import { useTradeSelection } from "@/hooks/use-trade-selection";
import { useAccountStore } from "@/lib/account-store";
import { formatMoney } from "@/lib/currency";
import {
	JournalIntent,
	type JournalSearch,
	JournalView,
	journalSearchSchema,
	SCOPE_SEARCH_KEYS,
} from "@/lib/journal-search";
import { describePeriod } from "@/lib/period";
import {
	isDefaultTradeSort,
	nextTradeSort,
	tradeSortSchema,
} from "@/lib/trade-sort";

export const Route = createFileRoute("/_authenticated/journal")({
	validateSearch: journalSearchSchema,
	search: { middlewares: [retainSearchParams(SCOPE_SEARCH_KEYS)] },
	component: JournalPage,
});

const VIEW_LABELS: Record<JournalView, string> = {
	[JournalView.All]: "All entries",
	[JournalView.Trades]: "Trades",
	[JournalView.Adjustments]: "Adjustments",
	[JournalView.Funding]: "Funding",
};

function JournalPage() {
	const navigate = useNavigate({ from: "/journal" });
	const search = useSearch({ from: "/_authenticated/journal" });
	const journal = useJournalEntries(search);
	const currency = useCurrency();
	useEffect(
		() =>
			useAccountStore.subscribe(() =>
				navigate({ search: (prev) => ({ ...prev, page: 1 }), replace: true }),
			),
		[navigate],
	);
	const isJournalView =
		search.view === JournalView.All || search.view === JournalView.Trades;
	const periodLabel = describePeriod({
		preset: search.period,
		from: search.dateFrom,
		to: search.dateTo,
	});

	return (
		<div className="app-page">
			<main className="page-frame section-enter space-y-6">
				<AppPageHeader
					title="Journal"
					description="Every trade you have recorded, with filters and full detail."
					meta={`${journal.total} trades · ${journal.closedSummary.count} closed · net P&L ${formatMoney(journal.closedSummary.netPnl, currency, { signed: true })} · ${journal.adjustmentCount} adjustments · ${periodLabel}`}
					actions={
						<>
							{isJournalView && (
								<ExportDialog search={search} total={journal.total} />
							)}
							<ImportDialog />
							<LogTradeDrawer
								defaultOpen={search.intent === JournalIntent.Log}
							/>
						</>
					}
				/>
				<Tabs
					value={search.view}
					onValueChange={(view) =>
						navigate({
							search: { ...search, view: view as JournalView, page: 1 },
						})
					}
				>
					<TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
						{Object.values(JournalView).map((view) => (
							<TabsTrigger key={view} value={view}>
								{VIEW_LABELS[view]}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{isJournalView && (
					<FilterBar
						filters={search}
						onFiltersChange={(filters: JournalFilters) =>
							navigate({ search: { ...search, ...filters, page: 1 } })
						}
					/>
				)}
				{search.view === JournalView.Adjustments && (
					<AccountEntriesPanel mode="adjustments" />
				)}
				{search.view === JournalView.Funding && (
					<AccountEntriesPanel mode="funding" />
				)}
				{isJournalView && (
					<JournalTradesSection search={search} journal={journal} />
				)}
			</main>
		</div>
	);
}

function JournalTradesSection({
	search,
	journal,
}: {
	search: JournalSearch;
	journal: ReturnType<typeof useJournalEntries>;
}) {
	const navigate = useNavigate({ from: "/journal" });
	const selection = useTradeSelection(journal.filter);
	const selectedIds = [...selection.selectedIds];
	const isFirstRun = useIsJournalFirstRun(search.view, journal.adjustmentCount);
	const sort = tradeSortSchema.parse(search);
	const hidesAdjustments =
		search.view === JournalView.All &&
		journal.adjustmentCount > 0 &&
		!isDefaultTradeSort(sort);

	if (isFirstRun)
		return (
			<FirstTradeEmptyState
				icon={BookOpen}
				title="Your journal is empty"
				description="Log a trade by hand, or import an Exness MT4/MT5 CSV from the Import button above."
			/>
		);
	if (journal.isLoading) return <JournalTableSkeleton />;
	const lastPage = Math.max(journal.totalPages, 1);
	if (search.page > lastPage)
		return (
			<Navigate to="/journal" search={{ ...search, page: lastPage }} replace />
		);
	return (
		<>
			{hidesAdjustments && (
				<p className="text-sm text-muted-foreground">
					Adjustments show only when you sort by date, newest first.
				</p>
			)}
			<JournalTable
				entries={journal.entries}
				selection={selection}
				sort={{
					current: sort,
					onSortChange: (field) =>
						navigate({
							search: { ...search, ...nextTradeSort(sort, field), page: 1 },
						}),
				}}
				onTradeClick={(trade) =>
					navigate({
						to: "/journal/$tradeId",
						params: { tradeId: String(trade.id) },
					})
				}
				emptyMessage={
					search.view === JournalView.All
						? "No entries match this section."
						: "No trades match this section."
				}
			/>
			<JournalPagination
				page={journal.page}
				totalPages={journal.totalPages}
				total={journal.total}
				onPageChange={(page) => navigate({ search: { ...search, page } })}
			/>
			{selectedIds.length > 0 && (
				<BulkEditBar
					selectedIds={selectedIds}
					matchingTotal={journal.total}
					isSelectingAll={selection.isSelectingAll}
					onSelectAllMatching={selection.selectAllMatching}
					onClear={selection.clear}
				/>
			)}
		</>
	);
}
