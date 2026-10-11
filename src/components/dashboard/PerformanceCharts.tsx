import { Link, useNavigate } from "@tanstack/react-router";
// Only loaded through React.lazy, so recharts stays out of the first bundle.
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import {
	Bar,
	BarChart,
	type BarShapeProps,
	Cell,
	Rectangle,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import type { GroupSummary } from "@/lib/group-summary";
import {
	ChartGroup,
	type DashboardSearch,
	drillDownSearch,
} from "@/lib/journal-search";
import { UNAVAILABLE } from "@/lib/metric";
import {
	AXIS_TICK,
	TOOLTIP_CONTENT_STYLE,
	TOOLTIP_LABEL_STYLE,
} from "./chart-theme";

type GroupStats = GroupSummary & { key: string; name: string };

export const INSIGHT_FOOTER =
	"Association in your journal. Not a cause and not a prediction.";

type Coverage = { annotated: number; closed: number; annotation: string };

interface PerformanceChartsProps {
	closedTrades: number;
	insightCoverage: {
		tagged: number | null;
		planChecked: number;
		ruleChecked: number;
	};
	byStrategy: GroupStats[];
	bySymbol: GroupStats[];
	byTag: GroupStats[];
	byAdherence: GroupStats[];
	byRuleCheck: GroupStats[];
	byDayOfWeek: GroupStats[];
	byHour: GroupStats[];
}

function DrillDownBar({
	chartGroup,
	...props
}: BarShapeProps & { chartGroup: ChartGroup }) {
	const navigate = useNavigate({ from: "/dashboard" });
	const group = props.payload as GroupStats;
	const search = (prev: DashboardSearch) => ({
		...prev,
		...drillDownSearch(chartGroup, group.key),
	});
	// The weekday chart has a bar for each day, also with no trades in scope.
	if (group.count === 0) return <Rectangle {...props} />;
	return (
		<Link
			from="/dashboard"
			to="/journal"
			search={search}
			aria-label={`Open ${group.count} ${group.name} trades`}
			className="group cursor-pointer outline-none"
			onKeyDown={(event) => {
				if (event.key !== " ") return;
				event.preventDefault();
				navigate({ to: "/journal", search });
			}}
		>
			<Rectangle
				{...props}
				className="group-focus-visible:stroke-ring group-focus-visible:stroke-2"
			/>
		</Link>
	);
}

function GroupBarChart({
	data,
	drillDown,
}: {
	data: GroupStats[];
	drillDown?: ChartGroup;
}) {
	const currency = useCurrency();

	return (
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
				<Bar
					dataKey="avgPnl"
					radius={[4, 4, 0, 0]}
					// The bar animation remounts the bar links, which drops keyboard focus.
					isAnimationActive={!drillDown}
					shape={
						drillDown &&
						((props: BarShapeProps) => (
							<DrillDownBar {...props} chartGroup={drillDown} />
						))
					}
				>
					{data.map((group) => (
						<Cell
							key={group.key}
							fill={group.avgPnl >= 0 ? "var(--success)" : "var(--destructive)"}
						/>
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}

function AvgPnlBar({
	data,
	title,
	drillDown,
	coverage,
}: {
	data: GroupStats[];
	title: string;
	drillDown?: ChartGroup;
	coverage?: Coverage;
}) {
	return (
		<div className="surface p-3 sm:p-4">
			<p className="text-sm font-semibold">{title}</p>
			{coverage && (
				<p className="mt-1 text-xs text-muted-foreground">
					{`${coverage.annotated} of ${coverage.closed} closed trades ${coverage.annotation}`}
				</p>
			)}
			<div className="mt-4">
				{coverage?.annotated === 0 ? (
					<div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
						<p className="text-sm font-medium">Not enough trades</p>
						<p className="text-xs text-muted-foreground">
							{`None of the closed trades in scope ${coverage.annotation} yet.`}
						</p>
					</div>
				) : (
					<GroupBarChart data={data} drillDown={drillDown} />
				)}
			</div>
			{coverage && (
				<p className="mt-3 text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
			)}
		</div>
	);
}

export function PerformanceCharts({
	closedTrades,
	insightCoverage,
	byStrategy,
	bySymbol,
	byTag,
	byAdherence,
	byRuleCheck,
	byDayOfWeek,
	byHour,
}: PerformanceChartsProps) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			<AvgPnlBar
				data={byStrategy}
				title="Avg P&L by strategy"
				drillDown={ChartGroup.Strategy}
			/>
			<AvgPnlBar
				data={bySymbol}
				title="Avg P&L by symbol (top 10)"
				drillDown={ChartGroup.Symbol}
			/>
			{insightCoverage.tagged !== null && (
				<AvgPnlBar
					data={byTag}
					title="Avg P&L by tag (top 10)"
					drillDown={ChartGroup.Tag}
					coverage={{
						annotated: insightCoverage.tagged,
						closed: closedTrades,
						annotation: "have a tag",
					}}
				/>
			)}
			<AvgPnlBar
				data={byAdherence}
				title="Avg P&L by plan adherence"
				drillDown={ChartGroup.Adherence}
				coverage={{
					annotated: insightCoverage.planChecked,
					closed: closedTrades,
					annotation: "have a plan check",
				}}
			/>
			<AvgPnlBar
				data={byRuleCheck}
				title="Avg P&L by rule check"
				drillDown={ChartGroup.RuleCheck}
				coverage={{
					annotated: insightCoverage.ruleChecked,
					closed: closedTrades,
					annotation: "have a rule check",
				}}
			/>
			<AvgPnlBar
				data={byDayOfWeek}
				title="Avg P&L by day of week"
				drillDown={ChartGroup.Weekday}
			/>
			<AvgPnlBar
				data={byHour}
				title="Avg P&L by entry hour"
				drillDown={ChartGroup.EntryHour}
			/>
		</div>
	);
}
