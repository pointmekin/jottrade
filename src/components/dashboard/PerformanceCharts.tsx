// Only loaded through React.lazy, so recharts stays out of the first bundle.
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import type { GroupSummary } from "@/lib/group-summary";
import { UNAVAILABLE } from "@/lib/metric";
import {
	AXIS_TICK,
	TOOLTIP_CONTENT_STYLE,
	TOOLTIP_LABEL_STYLE,
} from "./chart-theme";

type GroupStats = GroupSummary & { key: string; name: string };

interface PerformanceChartsProps {
	byStrategy: GroupStats[];
	bySymbol: GroupStats[];
	byDayOfWeek: GroupStats[];
	byHour: GroupStats[];
}

function AvgPnlBar({ data, title }: { data: GroupStats[]; title: string }) {
	const currency = useCurrency();

	return (
		<div className="surface p-3 sm:p-4">
			<p className="mb-4 text-sm font-semibold">{title}</p>
			<ResponsiveContainer width="100%" height={200}>
				<BarChart
					data={data}
					margin={{ top: 4, right: 4, bottom: 4, left: -12 }}
					barCategoryGap="18%"
				>
					<XAxis
						dataKey="name"
						tick={AXIS_TICK}
						tickLine={false}
						axisLine={{ stroke: "var(--border)" }}
						minTickGap={12}
					/>
					<YAxis
						tick={AXIS_TICK}
						tickLine={false}
						axisLine={{ stroke: "var(--border)" }}
						width={42}
					/>
					<Tooltip
						cursor={{ fill: "var(--accent)" }}
						contentStyle={TOOLTIP_CONTENT_STYLE}
						labelStyle={TOOLTIP_LABEL_STYLE}
						itemStyle={{
							color: "var(--popover-foreground)",
							fontFamily: "var(--font-mono)",
						}}
						formatter={(value, _name, item) => {
							const group = item.payload as GroupStats;
							const winRate =
								group.winRate === null
									? UNAVAILABLE
									: `${group.winRate.toFixed(0)}%`;
							return [
								`${formatMoney(Number(value), currency)} · ${group.count} trades · ${winRate} win`,
								"Avg P&L",
							];
						}}
					/>
					<Bar dataKey="avgPnl" radius={[4, 4, 0, 0]}>
						{data.map((group) => (
							<Cell
								key={group.key}
								fill={
									group.avgPnl >= 0 ? "var(--success)" : "var(--destructive)"
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
			<AvgPnlBar data={byStrategy} title="Avg P&L by strategy" />
			<AvgPnlBar data={bySymbol} title="Avg P&L by symbol (top 10)" />
			<AvgPnlBar data={byDayOfWeek} title="Avg P&L by day of week" />
			<AvgPnlBar data={byHour} title="Avg P&L by entry hour" />
		</div>
	);
}
