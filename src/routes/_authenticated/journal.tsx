import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import { AccountEntriesPanel } from "@/components/journal/AccountEntriesPanel";
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
import { useJournalEntries } from "@/hooks/use-journal-entries";
import { useIsJournalFirstRun } from "@/hooks/use-onboarding";
import {
	JournalIntent,
	JournalView,
	journalSearchSchema,
} from "@/lib/journal-search";
import { describePeriod } from "@/lib/period";

export const Route = createFileRoute("/_authenticated/journal")({
	validateSearch: journalSearchSchema,
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
	const isFirstRun = useIsJournalFirstRun(search.view, journal.adjustmentCount);
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
					meta={`${journal.total} trades · ${journal.adjustmentCount} adjustments · ${periodLabel}`}
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
							navigate({ search: { ...search, ...filters } })
						}
					/>
				)}
				{search.view === JournalView.Adjustments && (
					<AccountEntriesPanel mode="adjustments" />
				)}
				{search.view === JournalView.Funding && (
					<AccountEntriesPanel mode="funding" />
				)}
				{isJournalView && isFirstRun && (
					<FirstTradeEmptyState
						icon={BookOpen}
						title="Your journal is empty"
						description="Log a trade by hand, or import an Exness MT4/MT5 CSV from the Import button above."
					/>
				)}
				{isJournalView && !isFirstRun && journal.isLoading && (
					<JournalTableSkeleton />
				)}
				{isJournalView && !isFirstRun && !journal.isLoading && (
					<>
						<JournalTable
							entries={journal.entries}
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
					</>
				)}
			</main>
		</div>
	);
}
