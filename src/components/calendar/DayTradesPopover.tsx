import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCurrency } from "@/hooks/use-currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMoney } from "@/lib/currency";
import type { CalendarDay } from "@/server/calendarActions";

interface DayTradesPopoverProps {
	date: string;
	day: CalendarDay;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onTradeClick: () => void;
	children: React.ReactNode;
}

function formatDate(date: string) {
	return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function DayTradesSummary({
	date,
	day,
}: Pick<DayTradesPopoverProps, "date" | "day">) {
	const currency = useCurrency();
	const netPnlClass =
		day.netPnl > 0
			? "text-success"
			: day.netPnl < 0
				? "text-destructive"
				: "text-muted-foreground";

	return (
		<div className="min-w-0">
			<p className="truncate text-sm font-semibold">{formatDate(date)}</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{day.tradeCount} trade{day.tradeCount !== 1 ? "s" : ""}
				<span className="px-1.5">·</span>
				<span className={netPnlClass}>
					net P&amp;L {formatMoney(day.netPnl, currency, { signed: true })}
				</span>
			</p>
		</div>
	);
}

function TradeList({
	day,
	onTradeClick,
}: Pick<DayTradesPopoverProps, "day" | "onTradeClick">) {
	const currency = useCurrency();

	return (
		<div className="min-w-0 divide-y divide-border">
			{day.trades.map((trade) => {
				const pnlClass =
					trade.netPnl === null
						? "text-muted-foreground"
						: trade.netPnl >= 0
							? "text-success"
							: "text-destructive";

				return (
					<Link
						key={trade.id}
						to="/journal/$tradeId"
						params={{ tradeId: String(trade.id) }}
						onClick={onTradeClick}
						className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 px-2 py-2 text-left transition-colors hover:bg-accent/55 focus-visible:bg-accent/55"
					>
						<div className="flex min-w-0 items-center gap-2">
							<span className="truncate text-sm font-medium">
								{trade.symbol}
							</span>
							<Badge
								className={`h-4 shrink-0 rounded-md px-1 text-xs ${trade.side === "LONG" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
							>
								{trade.side}
							</Badge>
							<span className="hidden shrink-0 text-xs uppercase text-muted-foreground sm:inline">
								{trade.status}
							</span>
						</div>
						<span
							className={`shrink-0 font-data text-xs font-medium ${pnlClass}`}
						>
							{trade.netPnl === null
								? "Open"
								: formatMoney(trade.netPnl, currency, { signed: true })}
						</span>
					</Link>
				);
			})}
		</div>
	);
}

function DayTradesContent({
	date,
	day,
	onTradeClick,
}: Pick<DayTradesPopoverProps, "date" | "day" | "onTradeClick">) {
	return (
		<>
			<div className="border-b border-border px-2 pb-3">
				<DayTradesSummary date={date} day={day} />
			</div>
			<div className="max-h-[60vh] overflow-y-auto pt-1">
				<TradeList day={day} onTradeClick={onTradeClick} />
			</div>
		</>
	);
}

export function DayTradesPopover({
	date,
	day,
	open,
	onOpenChange,
	onTradeClick,
	children,
}: DayTradesPopoverProps) {
	const isMobile = useIsMobile();
	const currency = useCurrency();

	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
				<DrawerTrigger asChild>{children}</DrawerTrigger>
				<DrawerContent className="inset-x-0 bottom-0 top-auto max-h-[92vh] rounded-t-lg border-t border-border bg-popover text-popover-foreground">
					<div className="h-px w-full shrink-0 bg-ring" />
					<div className="flex shrink-0 justify-center pb-1 pt-3">
						<div className="h-1 w-10 rounded-full bg-border" />
					</div>
					<DrawerHeader className="shrink-0 border-b border-border px-5 pb-3 pt-2">
						<DrawerTitle>{formatDate(date)}</DrawerTitle>
						<DrawerDescription>
							{day.tradeCount} trade{day.tradeCount !== 1 ? "s" : ""} · net
							P&amp;L{" "}
							<span
								className={
									day.netPnl > 0
										? "text-success"
										: day.netPnl < 0
											? "text-destructive"
											: "text-muted-foreground"
								}
							>
								{formatMoney(day.netPnl, currency, { signed: true })}
							</span>
						</DrawerDescription>
					</DrawerHeader>
					<div className="min-h-0 overflow-y-auto px-3 pb-5 pt-3">
						<TradeList day={day} onTradeClick={onTradeClick} />
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				className="w-80 rounded-sm border-border bg-popover p-3 text-popover-foreground"
				side="bottom"
				align="start"
				collisionPadding={12}
			>
				<DayTradesContent date={date} day={day} onTradeClick={onTradeClick} />
			</PopoverContent>
		</Popover>
	);
}
