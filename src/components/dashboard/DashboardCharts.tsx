import {
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";

interface EquityCurveProps {
	data: { date: string; balance: number }[];
	currency?: string;
}

const axisDateFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "2-digit",
});

function formatAxisDate(value: string) {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return axisDateFormat.format(parsed);
}

export function EquityCurveChart({
	data,
	currency = DEFAULT_CURRENCY,
}: EquityCurveProps) {
	const formatBalance = (value: number) =>
		formatMoney(value, currency, { maximumFractionDigits: 0 });

	return (
		<div className="h-full min-h-[300px] w-full font-data">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={data}
					margin={{
						top: 5,
						right: 30,
						left: 20,
						bottom: 5,
					}}
				>
					<CartesianGrid stroke="var(--border)" vertical={false} />
					<XAxis
						dataKey="date"
						stroke="var(--border)"
						tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
						tickLine={false}
						minTickGap={56}
						tickFormatter={formatAxisDate}
					/>
					<YAxis
						stroke="var(--border)"
						tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
						tickLine={false}
						width={84}
						domain={["auto", "auto"]}
						tickFormatter={formatBalance}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "var(--popover)",
							borderColor: "var(--border)",
							borderRadius: 8,
							color: "var(--popover-foreground)",
						}}
						itemStyle={{ color: "var(--ring)" }}
						formatter={(value) => [
							`${formatMoney(Number(value), currency)} ${currency}`,
							"Balance",
						]}
					/>
					<Line
						type="monotone"
						dataKey="balance"
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

interface WinLossPieProps {
	winRate: number;
}

export function WinLossPie({ winRate }: WinLossPieProps) {
	const data = [
		{ name: "Wins", value: winRate },
		{ name: "Losses", value: 100 - winRate },
	];
	const COLORS = ["#22c55e", "#ef4444"]; // Green, Red

	return (
		<div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center">
			<ResponsiveContainer width="100%" height={200}>
				<PieChart>
					<Pie
						data={data}
						cx="50%"
						cy="50%"
						innerRadius={60}
						outerRadius={80}
						fill="#8884d8"
						paddingAngle={5}
						dataKey="value"
						stroke="none"
					>
						{data.map((entry, index) => (
							<Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
						))}
					</Pie>
					<Tooltip
						contentStyle={{
							backgroundColor: "#18181b",
							borderColor: "#27272a",
							color: "#f4f4f5",
						}}
					/>
				</PieChart>
			</ResponsiveContainer>
			<div className="text-center mt-2">
				<div className="text-2xl font-bold text-foreground">
					{winRate.toFixed(1)}%
				</div>
				<div className="text-xs text-muted-foreground">Win Rate</div>
			</div>
		</div>
	);
}
