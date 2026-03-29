import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import { getTrades } from "@/server/getTrades";
import { JournalTable } from "@/components/journal/JournalTable";
import type { Trade } from "@/components/journal/JournalTable";
import { TradeDetailSheet } from "@/components/journal/TradeDetailSheet";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { ImportZone } from "@/components/journal/ImportZone";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
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
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
} from "@/components/ui/drawer";
import { Plus, Upload, ChevronLeft, ChevronRight } from "lucide-react";

const journalSearchSchema = z.object({
	symbol: z.string().optional(),
	side: z.enum(["LONG", "SHORT"]).optional(),
	status: z.enum(["OPEN", "CLOSED", "PENDING"]).optional(),
	setupId: z.string().optional(),
	confidence: z.string().optional(),
	mistake: z.string().optional(),
	dateFrom: z.string().optional(),
	dateTo: z.string().optional(),
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
	const [sheetOpen, setSheetOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	const filters: JournalFilters = search;

	const handleFiltersChange = (newFilters: JournalFilters) => {
		navigate({ search: newFilters as any });
	};

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
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
		page: filters.page ?? 1,
	};

	const { data: result, isLoading } = useQuery({
		queryKey: ["trades", queryParams],
		queryFn: () => getTrades({ data: queryParams } as any),
	});

	const tradeList = (result as any)?.trades ?? [];
	const total = (result as any)?.total ?? 0;
	const page = (result as any)?.page ?? 1;
	const pageSize = (result as any)?.pageSize ?? 50;
	const totalPages = Math.ceil(total / pageSize);

	const handleRowClick = (trade: Trade) => {
		setSelectedTrade(trade);
		setDetailOpen(true);
	};

	return (
		<div className="p-8 space-y-6 w-full">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
						Trade Journal
					</h1>
					<p className="text-muted-foreground">
						Track, analyze, and improve your trading performance.
					</p>
				</div>
				<div className="flex space-x-2">
					<Dialog open={importOpen} onOpenChange={setImportOpen}>
						<DialogTrigger asChild>
							<Button variant="outline">
								<Upload className="h-4 w-4 mr-2" />
								Import CSV
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-3xl bg-card">
							<DialogHeader>
								<DialogTitle>Import Trades</DialogTitle>
								<DialogDescription>
									Upload your trade history CSV. We support standard MT4/MT5
									export formats.
								</DialogDescription>
							</DialogHeader>
							<ImportZone onSuccess={() => setImportOpen(false)} />
						</DialogContent>
					</Dialog>

					<Button onClick={() => setSheetOpen(true)}>
						<Plus className="h-4 w-4 mr-2" />
						Log Trade
					</Button>
					<Drawer open={sheetOpen} onOpenChange={setSheetOpen} direction={isDesktop ? "right" : "bottom"}>
						<DrawerContent
							className={cn(
								"bg-zinc-950 border-zinc-800/60 text-white",
								isDesktop
									? "inset-y-0 right-0 left-auto h-screen w-[440px] max-w-[90vw] mt-0 rounded-none border-l flex-col"
									: "inset-x-0 bottom-0 top-auto max-h-[92vh] rounded-t-2xl border-t flex-col",
							)}
						>
							<div className="h-px w-full flex-shrink-0 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
							{!isDesktop && (
								<div className="flex justify-center pt-3 pb-1 flex-shrink-0">
									<div className="h-1 w-10 rounded-full bg-zinc-700" />
								</div>
							)}
							<DrawerHeader className="px-5 pt-5 pb-4 border-b border-zinc-800/60 flex-shrink-0">
								<DrawerTitle className="text-white text-lg font-bold tracking-tight">
									Log New Trade
								</DrawerTitle>
								<DrawerDescription className="text-zinc-500 text-sm mt-1">
									Enter the details of your trade execution.
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
				</div>
			</div>

			<FilterBar filters={filters} onFiltersChange={handleFiltersChange} />

			{isLoading ? (
				<div className="flex items-center justify-center space-x-2">
					<Spinner /> <div>Loading trades...</div>
				</div>
			) : (
				<>
					<JournalTable data={tradeList} onRowClick={handleRowClick} />
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
			)}

			<TradeDetailSheet
				trade={selectedTrade}
				open={detailOpen}
				onOpenChange={setDetailOpen}
			/>
		</div>
	);
}
