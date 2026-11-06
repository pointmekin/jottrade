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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import type { GroupSummary } from "@/lib/group-summary";
import { INSIGHT_FOOTER } from "@/lib/insights";
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

const CHART_HEIGHT = 240;

type GroupStats = GroupSummary & { key: string; name: string };

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
		<ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
		<figure className="space-y-3">
			<figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span className="text-sm font-medium">{title}</span>
				{coverage && (
					<span className="text-xs text-muted-foreground">
						{`${coverage.annotated} of ${coverage.closed} closed trades ${coverage.annotation}`}
					</span>
				)}
			</figcaption>
			{coverage?.annotated === 0 ? (
				<div className="flex h-[240px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center">
					<p className="text-sm font-medium">Not enough trades</p>
					<p className="text-xs text-muted-foreground">
						{`None of the closed trades in scope ${coverage.annotation} yet.`}
					</p>
				</div>
			) : (
				<GroupBarChart data={data} drillDown={drillDown} />
			)}
			{coverage && (
				<p className="text-xs text-muted-foreground">{INSIGHT_FOOTER}</p>
			)}
		</figure>
	);
}

interface ChartTab {
	value: ChartGroup;
	label: string;
	title: string;
	data: GroupStats[];
	coverage?: Coverage;
}

function chartTabs({
	closedTrades,
	insightCoverage,
	byStrategy,
	bySymbol,
	byTag,
	byAdherence,
	byRuleCheck,
	byDayOfWeek,
	byHour,
}: PerformanceChartsProps): ChartTab[] {
	const coverageOf = (annotated: number, annotation: string) => ({
		annotated,
		closed: closedTrades,
		annotation,
	});
	const tagTab: ChartTab[] =
		insightCoverage.tagged === null
			? []
			: [
					{
						value: ChartGroup.Tag,
						label: "Tag",
						title: "Avg P&L by tag (top 10)",
						data: byTag,
						coverage: coverageOf(insightCoverage.tagged, "have a tag"),
					},
				];
	return [
		{
			value: ChartGroup.Strategy,
			label: "Strategy",
			title: "Avg P&L by strategy",
			data: byStrategy,
		},
		{
			value: ChartGroup.Symbol,
			label: "Symbol",
			title: "Avg P&L by symbol (top 10)",
			data: bySymbol,
		},
		...tagTab,
		{
			value: ChartGroup.Adherence,
			label: "Plan",
			title: "Avg P&L by plan adherence",
			data: byAdherence,
			coverage: coverageOf(insightCoverage.planChecked, "have a plan check"),
		},
		{
			value: ChartGroup.RuleCheck,
			label: "Rule check",
			title: "Avg P&L by rule check",
			data: byRuleCheck,
			coverage: coverageOf(insightCoverage.ruleChecked, "have a rule check"),
		},
		{
			value: ChartGroup.Weekday,
			label: "Weekday",
			title: "Avg P&L by day of week",
			data: byDayOfWeek,
		},
		{
			value: ChartGroup.EntryHour,
			label: "Entry hour",
			title: "Avg P&L by entry hour",
			data: byHour,
		},
	];
}

export function PerformanceCharts(props: PerformanceChartsProps) {
	const tabs = chartTabs(props);
	return (
		<Tabs defaultValue={ChartGroup.Strategy} className="gap-5">
			<div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
				<TabsList aria-label="Group average P&L by">
					{tabs.map((tab) => (
						<TabsTrigger
							key={tab.value}
							value={tab.value}
							className="px-3 max-sm:h-9"
						>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
			{tabs.map((tab) => (
				<TabsContent key={tab.value} value={tab.value}>
					<AvgPnlBar
						data={tab.data}
						title={tab.title}
						drillDown={tab.value}
						coverage={tab.coverage}
					/>
				</TabsContent>
			))}
		</Tabs>
	);
}
