import type { CalendarDay } from "@/server/calendarActions";

interface CalendarDayCellProps {
	date: string; // YYYY-MM-DD
	day: CalendarDay | undefined;
	isCurrentMonth: boolean;
	onClick: (date: string) => void;
}

export function CalendarDayCell({
	date,
	day,
	isCurrentMonth,
	onClick,
}: CalendarDayCellProps) {
	const dayNum = parseInt(date.slice(8, 10), 10);
	const hasTrades = !!day && day.tradeCount > 0;
	const isProfit = hasTrades && day.netPnl > 0;
	const isLoss = hasTrades && day.netPnl < 0;

	return (
		<div
			className={`min-h-[80px] p-1.5 border-b border-r border-zinc-800 cursor-pointer transition-colors
        ${isCurrentMonth ? "" : "opacity-30"}
        ${isProfit ? "bg-green-500/5 hover:bg-green-500/10" : ""}
        ${isLoss ? "bg-red-500/5 hover:bg-red-500/10" : ""}
        ${!hasTrades ? "hover:bg-zinc-900/50" : ""}
      `}
			onClick={() => hasTrades && onClick(date)}
		>
			<p className="text-xs text-zinc-500 mb-1">{dayNum}</p>
			{hasTrades && (
				<div className="space-y-1">
					<p
						className={`text-xs font-medium ${isProfit ? "text-green-400" : isLoss ? "text-red-400" : "text-zinc-400"}`}
					>
						{day.netPnl >= 0 ? "+" : ""}${day.netPnl.toFixed(0)}
					</p>
					<p className="text-[10px] text-zinc-600">
						{day.tradeCount} trade{day.tradeCount !== 1 ? "s" : ""}
					</p>
					<div className="flex flex-wrap gap-0.5">
						{day.trades.slice(0, 3).map((t) => (
							<span
								key={t.id}
								className="text-[9px] bg-zinc-800 text-zinc-400 px-1 rounded"
							>
								{t.symbol}
							</span>
						))}
						{day.trades.length > 3 && (
							<span className="text-[9px] text-zinc-600">
								+{day.trades.length - 3}
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
