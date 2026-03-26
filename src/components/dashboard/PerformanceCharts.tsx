import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

type GroupStats = { name: string; avgPnl: number; totalPnl: number; winRate: number; count: number };

interface PerformanceChartsProps {
  byStrategy: GroupStats[];
  bySymbol: GroupStats[];
  byDayOfWeek: GroupStats[];
  byHour: GroupStats[];
}

const POSITIVE_COLOR = '#22c55e';
const NEGATIVE_COLOR = '#ef4444';

function PnLBar({ data, dataKey = 'avgPnl', name }: { data: GroupStats[]; dataKey?: keyof GroupStats; name: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-sm font-medium text-zinc-300 mb-4">{name}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: -20, right: 10 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #27272a', color: '#fff' }}
            formatter={(val: number | undefined) => val !== undefined ? [`$${val.toFixed(2)}`, 'Avg P&L'] : ['', 'Avg P&L']}
          />
          <Bar dataKey={dataKey as string} radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={(entry[dataKey] as number) >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceCharts({ byStrategy, bySymbol, byDayOfWeek, byHour }: PerformanceChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PnLBar data={byStrategy} name="Avg P&L by Strategy" />
      <PnLBar data={bySymbol} name="Avg P&L by Symbol (Top 10)" />
      <PnLBar data={byDayOfWeek} name="Avg P&L by Day of Week" />
      <PnLBar data={byHour} name="Avg P&L by Entry Hour" />
    </div>
  );
}
