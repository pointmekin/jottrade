import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { getTrades } from "@/server/getTrades";
import { JournalTable } from "@/components/journal/JournalTable";
import type { Trade } from "@/components/journal/JournalTable";
import { TradeDetailSheet } from "@/components/journal/TradeDetailSheet";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { ImportZone } from "@/components/journal/ImportZone";
import { FilterBar, type JournalFilters } from "@/components/journal/FilterBar";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

export const Route = createFileRoute("/_authenticated/journal")({
  validateSearch: journalSearchSchema,
  component: JournalPage,
});

function JournalPage() {
  const navigate = useNavigate({ from: "/journal" });
  const search = useSearch({ from: "/_authenticated/journal" });
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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Trade Journal
          </h1>
          <p className="text-zinc-400">
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
            <DialogContent className="sm:max-w-3xl border-zinc-800 bg-zinc-950 text-white">
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

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Log Trade
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto sm:max-w-md border-l-zinc-800 bg-zinc-950 text-white">
              <SheetHeader>
                <SheetTitle className="text-white">Log New Trade</SheetTitle>
                <SheetDescription className="text-zinc-400">
                  Enter the details of your trade execution.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-8">
                <TradeEntryForm onSuccess={() => setSheetOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
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
              <p className="text-sm text-zinc-500">
                {total} trades · Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700"
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
                  className="border-zinc-700"
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
