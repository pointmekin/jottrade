import type { ReactNode } from "react";
import { MetricLabel } from "@/components/metric-label";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricTone, MetricVariant } from "@/lib/metric";
import { cn } from "@/lib/utils";

const CONTAINER_CLASS: Record<MetricVariant, string> = {
	[MetricVariant.Cell]: "metric-cell",
	[MetricVariant.Card]: "surface p-4",
	[MetricVariant.Compact]: "surface p-3",
};

const VALUE_CLASS: Record<MetricVariant, string> = {
	[MetricVariant.Cell]: "metric-value",
	[MetricVariant.Card]: "metric-value",
	[MetricVariant.Compact]: "font-data text-sm font-semibold",
};

const TONE_CLASS: Record<MetricTone, string> = {
	[MetricTone.Neutral]: "",
	[MetricTone.Positive]: "text-success",
	[MetricTone.Negative]: "text-destructive",
};

interface MetricCardProps {
	label: string;
	definition?: ReactNode;
	value: ReactNode;
	sub: ReactNode;
	tone?: MetricTone;
	variant?: MetricVariant;
}

export function MetricCard({
	label,
	definition,
	value,
	sub,
	tone = MetricTone.Neutral,
	variant = MetricVariant.Card,
}: MetricCardProps) {
	return (
		<div className={CONTAINER_CLASS[variant]}>
			{definition ? (
				<MetricLabel label={label}>{definition}</MetricLabel>
			) : (
				<p className="field-label">{label}</p>
			)}
			<p className={cn("mt-1", VALUE_CLASS[variant], TONE_CLASS[tone])}>
				{value}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">{sub}</p>
		</div>
	);
}

export function MetricCardSkeleton({
	variant = MetricVariant.Card,
}: {
	variant?: MetricVariant;
}) {
	const isCompact = variant === MetricVariant.Compact;
	return (
		<div className={CONTAINER_CLASS[variant]} aria-hidden="true">
			<Skeleton className="h-4 w-24" />
			<Skeleton className={cn("mt-2", isCompact ? "h-5 w-16" : "h-7 w-28")} />
			<Skeleton className="mt-2 h-3 w-20" />
		</div>
	);
}
