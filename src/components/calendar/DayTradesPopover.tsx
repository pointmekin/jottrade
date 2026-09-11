import { Badge } from "@/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
				className="w-72 rounded-sm border-border bg-popover p-3 text-popover-foreground"
				side="right"
			>
				<p className="field-label mb-3">
					{new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
						weekday: "long",
						month: "long",
						day: "numeric",
					})}
				</p>
				<div className="space-y-2">
					{day.trades.map((t) => (
						<button
							type="button"
							key={t.id}
							className="flex w-full cursor-pointer items-center justify-between border-b border-border p-2 text-left transition-colors hover:bg-accent/55"
							onClick={() => onTradeClick(t.id)}
						>
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm">{t.symbol}</span>
								<Badge
									className={`h-4 rounded-md px-1 text-xs ${t.side === "LONG" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
								>
									{t.side}
								</Badge>
							</div>
							<span
								className={`font-data text-xs font-medium ${t.netPnl === null ? "text-muted-foreground" : t.netPnl >= 0 ? "text-success" : "text-destructive"}`}
							>
								{t.netPnl === null ? "Open" : `$${t.netPnl.toFixed(2)}`}
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
