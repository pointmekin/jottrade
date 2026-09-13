import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type GroupStats = {
	name: string;
	avgPnl: number;
	totalPnl: number;
	winRate: number;
	count: number;
};

interface PerformanceChartsProps {
	byStrategy: GroupStats[];
	bySymbol: GroupStats[];
	byDayOfWeek: GroupStats[];
	byHour: GroupStats[];
}

const POSITIVE_COLOR = "var(--success)";
const NEGATIVE_COLOR = "var(--destructive)";

function PnLBar({
	data,
	dataKey = "avgPnl",
	name,
}: {
	data: GroupStats[];
	dataKey?: keyof GroupStats;
	name: string;
}) {
	return (
		<div className="surface p-3 sm:p-4">
			<p className="mb-4 text-sm font-semibold">{name}</p>
			<ResponsiveContainer width="100%" height={200}>
				<BarChart
					data={data}
					margin={{ top: 4, right: 4, bottom: 4, left: -12 }}
					barCategoryGap="18%"
				>
					<XAxis
						dataKey="name"
						tick={{
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							fill: "var(--muted-foreground)",
						}}
						tickLine={false}
						axisLine={{ stroke: "var(--border)" }}
						minTickGap={12}
					/>
					<YAxis
						tick={{
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							fill: "var(--muted-foreground)",
						}}
						tickLine={false}
						axisLine={{ stroke: "var(--border)" }}
						width={42}
					/>
					<Tooltip
						cursor={{ fill: "var(--accent)" }}
						contentStyle={{
							background: "var(--popover)",
							border: "1px solid var(--border)",
							borderRadius: 8,
							color: "var(--popover-foreground)",
						}}
						labelStyle={{
							color: "var(--popover-foreground)",
							fontFamily: "var(--font-sans)",
						}}
						itemStyle={{
							color: "var(--popover-foreground)",
							fontFamily: "var(--font-mono)",
						}}
						formatter={(val) =>
							val !== undefined
								? [`$${Number(val).toFixed(2)}`, "Avg P&L"]
								: ["", "Avg P&L"]
						}
					/>
					<Bar dataKey={dataKey as string} radius={[4, 4, 0, 0]}>
						{data.map((entry) => (
							<Cell
								key={entry.name}
								fill={
									(entry[dataKey] as number) >= 0
										? POSITIVE_COLOR
										: NEGATIVE_COLOR
								}
							/>
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}

export function PerformanceCharts({
	byStrategy,
	bySymbol,
	byDayOfWeek,
	byHour,
}: PerformanceChartsProps) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			<PnLBar data={byStrategy} name="Avg P&L by strategy" />
			<PnLBar data={bySymbol} name="Avg P&L by symbol (top 10)" />
			<PnLBar data={byDayOfWeek} name="Avg P&L by day of week" />
			<PnLBar data={byHour} name="Avg P&L by entry hour" />
		</div>
	);
}
