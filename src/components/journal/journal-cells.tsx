import { SlidersHorizontal } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { UNAVAILABLE } from "@/lib/metric";
import { TradeSide } from "@/lib/trade";
import { cn } from "@/lib/utils";

export function Dash() {
	return <span className="text-muted-foreground">{UNAVAILABLE}</span>;
}

export function SidePill({ side }: { side: TradeSide }) {
	return (
		<span
			className={cn(
				"status-pill",
				side === TradeSide.Long
					? "border-success/35 bg-success/10 text-success"
					: "border-destructive/35 bg-destructive/10 text-destructive",
			)}
		>
			{side}
		</span>
	);
}

export function AdjustmentPill() {
	return (
		<span className="status-pill border-border bg-muted text-muted-foreground">
			<SlidersHorizontal className="size-3" />
			Adjustment
		</span>
	);
}

export function Money({
	value,
	currency,
	signed,
}: {
	value: number | null;
	currency: string;
	signed?: boolean;
}) {
	if (value === null) return <Dash />;
	const color = value >= 0 ? "text-success" : "text-destructive";
	return (
		<span className={cn("font-data font-medium", signed && color)}>
			{formatMoney(value, currency, { signed })}
		</span>
	);
}
