import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
} from "recharts";

interface EquityCurveProps {
	data: { date: string; balance: number }[];
}

export function EquityCurveChart({ data }: EquityCurveProps) {
	return (
		<div className="w-full h-full min-h-[300px]">
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
					<CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
					<XAxis
						dataKey="date"
						stroke="#52525b"
						tick={{ fill: "#71717a" }}
						tickLine={{ stroke: "#52525b" }}
					/>
					<YAxis
						stroke="#52525b"
						tick={{ fill: "#71717a" }}
						tickLine={{ stroke: "#52525b" }}
						domain={["auto", "auto"]}
					/>
					<Tooltip
						contentStyle={{
							backgroundColor: "#18181b",
							borderColor: "#27272a",
							color: "#f4f4f5",
						}}
						itemStyle={{ color: "#818cf8" }}
					/>
					<Line
						type="monotone"
						dataKey="balance"
						stroke="#818cf8"
						strokeWidth={2}
						dot={false}
						activeDot={{ r: 6, fill: "#818cf8" }}
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
						{data.map((_, index) => (
							<Cell
								key={`cell-${index}`}
								fill={COLORS[index % COLORS.length]}
							/>
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
