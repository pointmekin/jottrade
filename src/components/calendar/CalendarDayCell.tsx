import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import type { CalendarDay } from "@/server/calendarActions";

interface CalendarDayCellProps {
	date: string; // YYYY-MM-DD
	day: CalendarDay | undefined;
	isCurrentMonth: boolean;
	onClick?: (date: string) => void;
}

function formatCompactMoney(value: number, currency: string) {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			currencyDisplay: "narrowSymbol",
			notation: "compact",
			maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
			signDisplay: "always",
		}).format(value);
	} catch {
		return formatMoney(value, currency, {
			signed: true,
			maximumFractionDigits: 0,
		});
	}
}

export function CalendarDayCell({
	date,
	day,
	isCurrentMonth,
	onClick,
}: CalendarDayCellProps) {
	const currency = useCurrency();
	const dayNum = parseInt(date.slice(8, 10), 10);
	const hasTrades = !!day && day.tradeCount > 0;
	const isProfit = hasTrades && day.netPnl > 0;
	const isLoss = hasTrades && day.netPnl < 0;
	const fullPnlLabel = hasTrades
		? formatMoney(day.netPnl, currency, {
				signed: true,
				maximumFractionDigits: 0,
			})
		: null;
	const accessibleDate = new Date(`${date}T00:00:00`).toLocaleDateString(
		"en-US",
		{
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		},
	);

	const cellClassName = `min-h-11 min-w-0 border-b border-r border-border p-1 text-left transition-colors sm:min-h-[88px] sm:p-2
		${isCurrentMonth ? "" : "opacity-30"}
		${isProfit ? "bg-success/5 hover:bg-success/10" : ""}
		${isLoss ? "bg-destructive/5 hover:bg-destructive/10" : ""}
		${!hasTrades ? "" : "cursor-pointer hover:bg-accent/45"}
	`;

	if (!hasTrades) {
		return (
			<div className={cellClassName}>
				<p className="font-data text-xs leading-tight text-muted-foreground">
					{dayNum}
				</p>
			</div>
		);
	}

	return (
		<button
			type="button"
			className={`w-full ${cellClassName}`}
			aria-label={`${accessibleDate}, ${day.tradeCount} trade${day.tradeCount !== 1 ? "s" : ""}, net P&L ${fullPnlLabel}`}
			onClick={() => onClick?.(date)}
		>
			<p className="font-data text-xs leading-tight text-muted-foreground">
				{dayNum}
			</p>
			<div className="min-w-0">
				<p
					className={`truncate font-data text-xs font-semibold leading-tight ${isProfit ? "text-success" : isLoss ? "text-destructive" : "text-muted-foreground"}`}
					title={fullPnlLabel ?? undefined}
				>
					<span className="sm:hidden">
						{formatCompactMoney(day.netPnl, currency)}
					</span>
					<span className="hidden sm:inline">{fullPnlLabel}</span>
				</p>
				<p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">
					{day.tradeCount} trade{day.tradeCount !== 1 ? "s" : ""}
				</p>
			</div>
		</button>
	);
}
