import { Link } from "@tanstack/react-router";
import { Crosshair } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EquityPoint } from "@/lib/analytics";
import { EQUITY_SERIES_LABEL, EquitySeries } from "@/lib/equity-series";
import { JournalIntent } from "@/lib/journal-search";
import { cn } from "@/lib/utils";

const EquityCurveChart = lazy(() =>
	import("@/components/dashboard/DashboardCharts").then((module) => ({
		default: module.EquityCurveChart,
	})),
);

interface EquityCurveSectionProps {
	data: EquityPoint[];
	isLoading: boolean;
	totalTrades: number;
	periodLabel: string;
	isAccountWide?: boolean;
}

function SeriesToggle({
	value,
	onChange,
}: {
	value: EquitySeries;
	onChange: (series: EquitySeries) => void;
}) {
	return (
		<fieldset className="inline-flex rounded-md border border-border bg-muted p-0.5">
			<legend className="sr-only">Curve</legend>
			{Object.values(EquitySeries).map((series) => (
				<button
					key={series}
					type="button"
					className={cn(
						"h-7 rounded-sm px-2.5 text-[0.8125rem] font-medium transition-colors duration-150 max-sm:h-9",
						value === series
							? "bg-background text-foreground shadow-xs"
							: "text-muted-foreground hover:text-foreground",
					)}
					aria-pressed={value === series}
					onClick={() => onChange(series)}
				>
					{EQUITY_SERIES_LABEL[series]}
				</button>
			))}
		</fieldset>
	);
}

function EmptyPeriod({ periodLabel }: { periodLabel: string }) {
	return (
		<div className="empty-field h-full border-0">
			<Crosshair className="mb-4 size-6 text-muted-foreground" />
			<p className="font-semibold">Nothing in this period</p>
			<p className="mt-1 max-w-sm text-sm text-muted-foreground">
				No closed trade or deposit falls inside {periodLabel}. Widen the period
				or record a trade.
			</p>
			<Button asChild variant="outline" className="mt-5">
				<Link to="/journal" search={{ intent: JournalIntent.Log }}>
					Record first trade
				</Link>
			</Button>
		</div>
	);
}

function CurveBody({
	data,
	isLoading,
	series,
	periodLabel,
}: Omit<EquityCurveSectionProps, "totalTrades" | "isAccountWide"> & {
	series: EquitySeries;
}) {
	if (isLoading) return <Skeleton className="h-full w-full" />;
	if (data.length === 0) return <EmptyPeriod periodLabel={periodLabel} />;
	return (
		<Suspense fallback={<Skeleton className="h-full w-full" />}>
			<EquityCurveChart data={data} series={series} />
		</Suspense>
	);
}

export function EquityCurveSection({
	data,
	isLoading,
	totalTrades,
	periodLabel,
	isAccountWide,
}: EquityCurveSectionProps) {
	const [series, setSeries] = useState<EquitySeries>(EquitySeries.Balance);
	const detail = [
		isAccountWide && "Account-wide",
		series === EquitySeries.Performance
			? "Trading P&L only, no deposits or withdrawals"
			: `${totalTrades} trades`,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section className="mt-8" aria-label="Equity curve">
			<SectionHeading
				title="Equity curve"
				detail={detail}
				actions={<SeriesToggle value={series} onChange={setSeries} />}
			/>
			<div className="mt-4 h-[16rem] sm:h-[20rem] md:h-[22rem]">
				<CurveBody
					data={data}
					isLoading={isLoading}
					series={series}
					periodLabel={periodLabel}
				/>
			</div>
		</section>
	);
}
