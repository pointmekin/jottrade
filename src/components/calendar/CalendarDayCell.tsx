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
		<button
			type="button"
			disabled={!hasTrades}
			className={`min-h-[88px] w-full p-2 text-left border-b border-r border-border transition-colors disabled:cursor-default
				${isCurrentMonth ? "" : "opacity-30"}
				${isProfit ? "bg-success/5 hover:bg-success/10" : ""}
				${isLoss ? "bg-destructive/5 hover:bg-destructive/10" : ""}
				${!hasTrades ? "hover:bg-accent/45" : ""}
			`}
			onClick={() => hasTrades && onClick(date)}
		>
			<p className="mb-1 font-data text-xs text-muted-foreground">{dayNum}</p>
			{hasTrades && (
				<div className="space-y-1">
					<p
						className={`font-data text-xs font-semibold ${isProfit ? "text-success" : isLoss ? "text-destructive" : "text-muted-foreground"}`}
					>
						{day.netPnl >= 0 ? "+" : ""}${day.netPnl.toFixed(0)}
					</p>
					<p className="text-xs text-muted-foreground">
						{day.tradeCount} trade{day.tradeCount !== 1 ? "s" : ""}
					</p>
					<div className="flex flex-wrap gap-0.5">
						{day.trades.slice(0, 3).map((t) => (
							<span
								key={t.id}
								className="border border-border bg-muted px-1 font-data text-xs text-muted-foreground"
							>
								{t.symbol}
							</span>
						))}
						{day.trades.length > 3 && (
							<span className="text-xs text-muted-foreground">
								+{day.trades.length - 3}
							</span>
						)}
					</div>
				</div>
			)}
		</button>
	);
}
