import { Link } from "@tanstack/react-router";
import { ArrowRight, Crosshair } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { EquityPoint } from "@/lib/analytics";
import { EQUITY_SERIES_LABEL, EquitySeries } from "@/lib/equity-series";
import { JournalIntent } from "@/lib/journal-search";

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
}

function SeriesToggle({
	value,
	onChange,
}: {
	value: EquitySeries;
	onChange: (series: EquitySeries) => void;
}) {
	return (
		<fieldset className="flex gap-1">
			<legend className="sr-only">Curve</legend>
			{Object.values(EquitySeries).map((series) => (
				<Button
					key={series}
					size="sm"
					variant="outline"
					className={
						value === series
							? "border-ring bg-accent text-accent-foreground"
							: "text-muted-foreground"
					}
					aria-pressed={value === series}
					onClick={() => onChange(series)}
				>
					{EQUITY_SERIES_LABEL[series]}
				</Button>
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
}: Omit<EquityCurveSectionProps, "totalTrades"> & { series: EquitySeries }) {
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
}: EquityCurveSectionProps) {
	const currency = useCurrency();
	const [series, setSeries] = useState<EquitySeries>(EquitySeries.Balance);
	const detail =
		series === EquitySeries.Performance
			? `Trading P&L only, no deposits or withdrawals · ${periodLabel} · ${currency}`
			: `${totalTrades} trades · ${periodLabel} · ${currency}`;

	return (
		<section className="surface mt-6 p-3 sm:p-4 md:p-5">
			<SectionHeading
				title="Equity curve"
				detail={detail}
				actions={
					<div className="flex items-center gap-2">
						<SeriesToggle value={series} onChange={setSeries} />
						<Button asChild variant="outline" size="sm">
							<Link to="/journal">
								Open journal <ArrowRight className="size-4" />
							</Link>
						</Button>
					</div>
				}
			/>
			<div className="mt-3 h-[18rem] sm:mt-4 sm:h-[20rem] md:h-[22rem]">
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
