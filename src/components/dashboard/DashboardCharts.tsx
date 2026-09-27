import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useCurrency } from "@/hooks/use-currency";
import type { EquityPoint } from "@/lib/analytics";
import { formatMoney } from "@/lib/currency";
import { EQUITY_SERIES_LABEL, EquitySeries } from "@/lib/equity-series";
import {
	AXIS_TICK,
	TOOLTIP_CONTENT_STYLE,
	TOOLTIP_LABEL_STYLE,
} from "./chart-theme";

interface EquityCurveProps {
	data: EquityPoint[];
	series: EquitySeries;
}

const axisDateFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "2-digit",
});

function formatAxisDate(value: string) {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? value : axisDateFormat.format(parsed);
}

export function EquityCurveChart({ data, series }: EquityCurveProps) {
	const currency = useCurrency();

	return (
		<div className="h-full min-h-[300px] w-full font-data">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={data} margin={{ top: 5, right: 10, left: 8, bottom: 5 }}>
					<CartesianGrid stroke="var(--border)" vertical={false} />
					<XAxis
						dataKey="date"
						stroke="var(--border)"
						tick={AXIS_TICK}
						tickLine={false}
						minTickGap={36}
						tickFormatter={formatAxisDate}
					/>
					<YAxis
						stroke="var(--border)"
						tick={AXIS_TICK}
						tickLine={false}
						width={70}
						domain={["auto", "auto"]}
						tickFormatter={(value: number) =>
							formatMoney(value, currency, { maximumFractionDigits: 0 })
						}
					/>
					<Tooltip
						contentStyle={TOOLTIP_CONTENT_STYLE}
						labelStyle={TOOLTIP_LABEL_STYLE}
						itemStyle={{ color: "var(--ring)" }}
						formatter={(value) => [
							`${formatMoney(Number(value), currency)} ${currency}`,
							EQUITY_SERIES_LABEL[series],
						]}
					/>
					{series === EquitySeries.Performance && (
						<ReferenceLine y={0} stroke="var(--muted-foreground)" />
					)}
					<Line
						type="monotone"
						dataKey={series}
						stroke="var(--ring)"
						strokeWidth={2}
						dot={false}
						activeDot={{
							r: 5,
							fill: "var(--primary)",
							stroke: "var(--background)",
							strokeWidth: 2,
						}}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
