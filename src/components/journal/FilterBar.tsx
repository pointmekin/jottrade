import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStrategies } from '@/server/strategyActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Filter, X } from 'lucide-react';

// Filter state read/written to URL search params
export type JournalFilters = {
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  status?: 'OPEN' | 'CLOSED' | 'PENDING';
  setupId?: string; // number or "none"
  confidence?: string; // comma-separated
  mistake?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
};

interface FilterBarProps {
  filters: JournalFilters;
  onFiltersChange: (filters: JournalFilters) => void;
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [symbolInput, setSymbolInput] = useState(filters.symbol ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const update = useCallback((patch: Partial<JournalFilters>) => {
    onFiltersChange({ ...filters, ...patch, page: 1 });
  }, [filters, onFiltersChange]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (symbolInput !== (filters.symbol ?? '')) {
        update({ symbol: symbolInput || undefined });
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [symbolInput]);

  const activeCount = [
    filters.symbol, filters.side, filters.status, filters.setupId,
    filters.confidence, filters.mistake, filters.dateFrom, filters.dateTo,
  ].filter(Boolean).length;

  const clearAll = () => {
    setSymbolInput('');
    onFiltersChange({ page: 1 });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-700 text-zinc-300"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter className="h-3.5 w-3.5 mr-2" />
          Filters
          {activeCount > 0 && (
            <Badge className="ml-2 h-4 px-1.5 text-xs bg-blue-600">{activeCount}</Badge>
          )}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="text-zinc-500 h-8" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear all
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          {/* Symbol */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Symbol</p>
            <Input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="AAPL"
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>

          {/* Side */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Side</p>
            <div className="flex gap-1">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <Button
                  key={s} size="sm" variant="outline"
                  className={`flex-1 h-8 text-xs border-zinc-700 ${filters.side === s ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
                  onClick={() => update({ side: filters.side === s ? undefined : s })}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Status</p>
            <Select
              value={filters.status ?? ''}
              onValueChange={(v) => update({ status: v === '__all__' ? undefined : v as any })}
            >
              <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="__all__">All</SelectItem>
                {['OPEN', 'CLOSED', 'PENDING'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Strategy */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Strategy</p>
            <Select
              value={filters.setupId ?? ''}
              onValueChange={(v) => update({ setupId: v || undefined })}
            >
              <SelectTrigger className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="">All</SelectItem>
                <SelectItem value="none">No Strategy</SelectItem>
                {(strategies as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Confidence */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Confidence</p>
            <div className="flex gap-1">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((c) => {
                const active = (filters.confidence ?? '').split(',').filter(Boolean).includes(c);
                const toggle = () => {
                  const current = (filters.confidence ?? '').split(',').filter(Boolean);
                  const next = active ? current.filter((x) => x !== c) : [...current, c];
                  update({ confidence: next.join(',') || undefined });
                };
                return (
                  <Button
                    key={c} size="sm" variant="outline"
                    className={`flex-1 h-8 text-xs border-zinc-700 ${active ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
                    onClick={toggle}
                  >
                    {c[0]}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Date from */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">From</p>
            <Input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(e) => update({ dateFrom: e.target.value || undefined })}
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>

          {/* Date to */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">To</p>
            <Input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(e) => update({ dateTo: e.target.value || undefined })}
              className="h-8 bg-zinc-900 border-zinc-700 text-white text-sm"
            />
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.symbol && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              Symbol: {filters.symbol}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ symbol: undefined })} />
            </Badge>
          )}
          {filters.side && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              {filters.side}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ side: undefined })} />
            </Badge>
          )}
          {filters.status && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
              {filters.status}
              <X className="h-3 w-3 cursor-pointer" onClick={() => update({ status: undefined })} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
