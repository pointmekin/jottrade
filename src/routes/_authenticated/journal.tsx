import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { AccountEntriesPanel } from "@/components/journal/AccountEntriesPanel";
import { AdjustmentImportZone } from "@/components/journal/AdjustmentImportZone";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
import { ImportZone } from "@/components/journal/ImportZone";
import type { Trade } from "@/components/journal/JournalTable";
import {
	JournalTable,
	JournalTableSkeleton,
} from "@/components/journal/JournalTable";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountEntries } from "@/hooks/use-account-entries";
import { AccountEntryKind } from "@/lib/account-entry";
import { mergeJournalEntries } from "@/lib/journal-entries";
import { describePeriod, PeriodPreset, resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { getTrades } from "@/server/getTrades";

const journalSearchSchema = z.object({
	symbol: z.string().optional(),
	side: z.enum(["LONG", "SHORT"]).optional(),
	status: z.enum(["OPEN", "CLOSED", "PENDING"]).optional(),
	setupId: z.string().optional(),
	confidence: z.string().optional(),
	mistake: z.string().optional(),
	period: z.nativeEnum(PeriodPreset).default(PeriodPreset.All),
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
	intent: z.enum(["log"]).optional(),
	view: z.enum(["all", "trades", "adjustments", "funding"]).default("all"),
	page: z.number().default(1),
});

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(false);
	useEffect(() => {
		const mql = window.matchMedia("(min-width: 768px)");
		setIsDesktop(mql.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);
	return isDesktop;
}

export const Route = createFileRoute("/_authenticated/journal")({
	validateSearch: journalSearchSchema,
	component: JournalPage,
});

function JournalPage() {
	const navigate = useNavigate({ from: "/journal" });
	const search = useSearch({ from: "/_authenticated/journal" });
	const isDesktop = useIsDesktop();
	const [sheetOpen, setSheetOpen] = useState(search.intent === "log");
	const [importOpen, setImportOpen] = useState(false);

	const filters: JournalFilters = search;
	const isJournalView = search.view === "all" || search.view === "trades";

	const handleFiltersChange = (newFilters: JournalFilters) => {
		navigate({ search: newFilters as any });
	};

	const { from, to } = resolvePeriod({
		preset: filters.period,
		from: filters.dateFrom,
		to: filters.dateTo,
	});

	const queryParams = {
		symbol: filters.symbol,
		side: filters.side,
		status: filters.status,
		setupId:
			filters.setupId === "none"
				? ("none" as const)
				: filters.setupId
					? Number(filters.setupId)
					: undefined,
		confidence: filters.confidence?.split(",").filter(Boolean) as
			| ("HIGH" | "MEDIUM" | "LOW")[]
			| undefined,
		mistake: filters.mistake?.split(",").filter(Boolean),
		dateFrom: from?.toISOString(),
		dateTo: to?.toISOString(),
		page: filters.page ?? 1,
	};

	const { data: result, isLoading } = useQuery({
		queryKey: ["trades", queryParams],
		queryFn: () => getTrades({ data: queryParams } as any),
	});
	const { data: accountEntries = [], isLoading: accountEntriesLoading } =
		useAccountEntries();

	const tradeList: Trade[] = (result as any)?.trades ?? [];
	const total = (result as any)?.total ?? 0;
	const page = (result as any)?.page ?? 1;
	const pageSize = (result as any)?.pageSize ?? 50;
	const totalPages = Math.ceil(total / pageSize);
	const adjustments = accountEntries.filter((entry) => {
		if (entry.kind !== AccountEntryKind.Adjustment) return false;
		const occurredAt = new Date(entry.occurredAt);
		if (from && occurredAt < from) return false;
		if (to && occurredAt > to) return false;
		return true;
	});

	// The journal is reverse chronological, so a page of trades also defines a
	// date window. Adjustments outside that window belong to another page.
	const newestOnPage = page > 1 ? tradeList[0]?.entryDate : undefined;
	const oldestOnPage =
		page < totalPages ? tradeList[tradeList.length - 1]?.entryDate : undefined;
	const pageAdjustments = adjustments.filter((entry) => {
		const occurredAt = new Date(entry.occurredAt);
		if (newestOnPage && occurredAt > new Date(newestOnPage)) return false;
		if (oldestOnPage && occurredAt < new Date(oldestOnPage)) return false;
		return true;
	});
	const entries = mergeJournalEntries<Trade>(
		tradeList,
		search.view === "all" ? pageAdjustments : [],
	);

	const handleRowClick = (trade: Trade) => {
		navigate({
			to: "/journal/$tradeId",
			params: { tradeId: String(trade.id) },
		});
	};

	return (
		<div className="app-page">
			<main className="page-frame section-enter space-y-6">
				<AppPageHeader
					title="Journal"
					description="Every trade you have recorded, with filters and full detail."
					meta={`${total} trades · ${adjustments.length} adjustments · ${describePeriod(
						{
							preset: filters.period,
							from: filters.dateFrom,
							to: filters.dateTo,
						},
					)}`}
					actions={
						<>
							<Dialog open={importOpen} onOpenChange={setImportOpen}>
								<DialogTrigger asChild>
									<Button variant="outline">
										<Upload className="h-4 w-4 mr-2" />
										Import CSV
									</Button>
								</DialogTrigger>
								<DialogContent className="sm:max-w-3xl bg-card">
									<DialogHeader>
										<DialogTitle>Import journal data</DialogTitle>
										<DialogDescription>
											Choose the file type first. Trade history and account
											adjustments use different CSV formats.
										</DialogDescription>
									</DialogHeader>
									<Tabs defaultValue="trades" className="mt-2">
										<TabsList className="grid w-full grid-cols-2">
											<TabsTrigger value="trades">
												Trade history CSV
											</TabsTrigger>
											<TabsTrigger value="adjustments">
												Adjustment CSV
											</TabsTrigger>
										</TabsList>
										{/* A fixed body height keeps the dialog still when the tab changes. */}
										<div className="mt-4 h-[26rem] overflow-y-auto">
											<TabsContent value="trades" className="space-y-3">
												<p className="text-xs leading-5 text-muted-foreground">
													In Exness History of orders, choose the account and
													date range, download the trade CSV, then upload it
													here.
												</p>
												<ImportZone onSuccess={() => setImportOpen(false)} />
											</TabsContent>
											<TabsContent value="adjustments">
												<AdjustmentImportZone
													onSuccess={() => setImportOpen(false)}
												/>
											</TabsContent>
										</div>
									</Tabs>
								</DialogContent>
							</Dialog>

							<Button onClick={() => setSheetOpen(true)}>
								<Plus className="h-4 w-4 mr-2" />
								Log Trade
							</Button>
							<Drawer
								open={sheetOpen}
								onOpenChange={setSheetOpen}
								direction={isDesktop ? "right" : "bottom"}
							>
								<DrawerContent
									className={cn(
										"bg-popover text-popover-foreground",
										isDesktop
											? "inset-y-0 right-0 left-auto mt-0 h-screen w-[440px] max-w-[90vw] flex-col rounded-md border-l"
											: "inset-x-0 bottom-0 top-auto max-h-[92vh] flex-col rounded-md border-t",
									)}
								>
									<div className="h-px w-full flex-shrink-0 bg-ring" />
									{!isDesktop && (
										<div className="flex justify-center pt-3 pb-1 flex-shrink-0">
											<div className="h-1 w-10 bg-border" />
										</div>
									)}
									<DrawerHeader className="flex-shrink-0 border-b border-border px-5 pb-4 pt-5">
										<DrawerTitle className="text-lg font-semibold tracking-tight">
											Log New Trade
										</DrawerTitle>
										<DrawerDescription className="mt-1 text-sm text-muted-foreground">
											Record the setup, execution, and outcome in one place.
										</DrawerDescription>
									</DrawerHeader>
									<div className="flex-1 overflow-y-auto px-5 py-5">
										<TradeEntryForm
											onSuccess={() => setSheetOpen(false)}
											onCancel={() => setSheetOpen(false)}
										/>
									</div>
								</DrawerContent>
							</Drawer>
						</>
					}
				/>

				<Tabs
					value={search.view}
					onValueChange={(view) =>
						navigate({ search: { ...search, view, page: 1 } as any })
					}
				>
					<TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
						<TabsTrigger value="all">All entries</TabsTrigger>
						<TabsTrigger value="trades">Trades</TabsTrigger>
						<TabsTrigger value="adjustments">Adjustments</TabsTrigger>
						<TabsTrigger value="funding">Funding</TabsTrigger>
					</TabsList>
				</Tabs>

				{isJournalView && (
					<FilterBar filters={filters} onFiltersChange={handleFiltersChange} />
				)}

				{search.view === "adjustments" && (
					<AccountEntriesPanel mode="adjustments" />
				)}
				{search.view === "funding" && <AccountEntriesPanel mode="funding" />}

				{isJournalView &&
					(isLoading || (search.view === "all" && accountEntriesLoading) ? (
						<JournalTableSkeleton />
					) : (
						<>
							<JournalTable
								entries={entries}
								onTradeClick={handleRowClick}
								emptyMessage={
									search.view === "all"
										? "No entries match this section."
										: "No trades match this section."
								}
							/>
							{totalPages > 1 && (
								<div className="flex items-center justify-between pt-2">
									<p className="text-sm text-muted-foreground">
										{total} trades · Page {page} of {totalPages}
									</p>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											className="border-border"
											disabled={page <= 1}
											onClick={() =>
												navigate({ search: { ...search, page: page - 1 } })
											}
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="border-border"
											disabled={page >= totalPages}
											onClick={() =>
												navigate({ search: { ...search, page: page + 1 } })
											}
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>
							)}
						</>
					))}
			</main>
		</div>
	);
}
