import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getStrategies } from '@/server/strategyActions';
import { StrategyList } from '@/components/strategies/StrategyList';
import { StrategyForm } from '@/components/strategies/StrategyForm';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
});

type Strategy = { id: number; name: string; description: string | null };

function StrategiesPage() {
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: strategyList = [], isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const handleSelect = (s: Strategy) => { setSelected(s); setCreating(false); };
  const handleNew = () => { setSelected(null); setCreating(true); };
  const handleSaved = (s: Strategy) => { setSelected(s); setCreating(false); };
  const handleDeleted = (id: number) => {
    if (selected?.id === id) { setSelected(null); setCreating(false); }
  };

  const showForm = creating || !!selected;

  return (
    <div className="p-8 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Strategies</h1>
          <p className="text-zinc-400">Define and manage your trading setups.</p>
        </div>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />New Strategy</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Left panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">Loading...</div>
          ) : (
            <StrategyList
              strategies={strategyList as Strategy[]}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              onDeleted={handleDeleted}
            />
          )}
        </div>

        {/* Right panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          {showForm ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-6">
                {creating ? 'New Strategy' : 'Edit Strategy'}
              </h2>
              <StrategyForm strategy={selected} onSaved={handleSaved} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm">
              Select a strategy to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
