import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getTrades } from "@/server/getTrades";
import { JournalTable } from "@/components/journal/JournalTable";
import { TradeEntryForm } from "@/components/journal/TradeEntryForm";
import { ImportZone } from "@/components/journal/ImportZone";
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

import { Plus, Upload } from "lucide-react";

// Use a loader to ensure authentication?
// Best practice in Tanstack Start is to use `beforeLoad`.
// But since we are using BetterAuth client-side mostly for UI state, and server functions check auth,
// we'll handle the data fetching error if unauthorized by redirecting or showing error.
// Ideally, `__root.tsx` handles global auth protection or we do it here.

export const Route = createFileRoute("/_authenticated/journal")({
  component: JournalPage,
  // loader: async ({ context }) => {
  //   // Preload? Or just let query handle it.
  //   // We can pre-fetch if we want SSR, but for now client fetch is fine.
  // },
});

function JournalPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: trades, isLoading } = useQuery({
    queryKey: ["trades"],
    queryFn: () => getTrades({ data: undefined }), // fetch all
  });

  return (
    <div className="p-8 space-y-8 w-full">
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

      {/* Metrics Cards would go here */}

      {/* Main Table */}
      {isLoading ? (
        <div className="flex items-center justify-center space-x-2">
          <Spinner /> <div>Loading trades...</div>
        </div>
      ) : (
        <JournalTable data={trades || []} />
      )}
    </div>
  );
}
