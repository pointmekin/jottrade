import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getTrades } from '@/server/getTrades'; 
import { JournalTable, Trade } from '@/components/journal/JournalTable';
import { TradeEntryForm } from '@/components/journal/TradeEntryForm';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useState } from 'react';

// Use a loader to ensure authentication?
// Best practice in Tanstack Start is to use `beforeLoad`.
// But since we are using BetterAuth client-side mostly for UI state, and server functions check auth,
// we'll handle the data fetching error if unauthorized by redirecting or showing error.
// Ideally, `__root.tsx` handles global auth protection or we do it here.

export const Route = createFileRoute('/journal')({
  component: JournalPage,
});

function JournalPage() {
  const [open, setOpen] = useState(false);

  const { data: trades, isLoading, error } = useQuery({
    queryKey: ['trades'],
    queryFn: () => getTrades({ data: {} }),
  });

  if (isLoading) {
      return <div className="p-8 text-zinc-400">Loading journal...</div>
  }

  if (error) {
      return <div className="p-8 text-red-500">Error loading trades: {error.message}</div>
  }

  // Cast type if needed, assuming the server returns data matching our Table type essentially
  // Server returns array of trade objects. 
  // Need to ensure types match. `getTrades` returns inferred type from drizzle select.
  // Our Table `Trade` type is consistent with schema mostly. 
  // Drizzle timestamps are Date objects usually.

  return (
    <div className="p-8 min-h-screen bg-zinc-950 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Trading Journal</h1>
          <p className="text-zinc-400">Review your performance and log new trades.</p>
        </div>
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
              <Plus className="mr-2 h-4 w-4" />
              Log Trade
            </Button>
          </SheetTrigger>
          <SheetContent className="border-l-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="text-zinc-100">Log New Trade</SheetTitle>
              <SheetDescription className="text-zinc-400">
                Enter the details of your trade execution.
              </SheetDescription>
            </SheetHeader>
            <TradeEntryForm onSuccess={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-6">
          {/* We can add stats cards here later */}
          <JournalTable data={(trades as unknown as Trade[]) || []} />
      </div>
    </div>
  );
}
