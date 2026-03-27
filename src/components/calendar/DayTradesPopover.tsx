import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { CalendarDay } from "@/server/calendarActions";

interface DayTradesPopoverProps {
	date: string;
	day: CalendarDay;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onTradeClick: (tradeId: number) => void;
	children: React.ReactNode;
}

export function DayTradesPopover({
	date,
	day,
	open,
	onOpenChange,
	onTradeClick,
	children,
}: DayTradesPopoverProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				className="w-72 bg-zinc-950 border-zinc-800 text-white p-3"
				side="right"
			>
				<p className="text-xs text-zinc-500 mb-3">
					{new Date(date + "T00:00:00").toLocaleDateString("en-US", {
						weekday: "long",
						month: "long",
						day: "numeric",
					})}
				</p>
				<div className="space-y-2">
					{day.trades.map((t) => (
						<div
							key={t.id}
							className="flex items-center justify-between p-2 rounded bg-zinc-900 cursor-pointer hover:bg-zinc-800 transition-colors"
							onClick={() => onTradeClick(t.id)}
						>
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm">{t.symbol}</span>
								<Badge
									className={`text-[10px] h-4 px-1 ${t.side === "LONG" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}
								>
									{t.side}
								</Badge>
							</div>
							<span
								className={`text-xs font-medium ${t.netPnl === null ? "text-zinc-500" : t.netPnl >= 0 ? "text-green-400" : "text-red-400"}`}
							>
								{t.netPnl === null ? "Open" : `$${t.netPnl.toFixed(2)}`}
							</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
