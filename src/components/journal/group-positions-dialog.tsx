import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrency } from "@/hooks/use-currency";
import {
	useGroupBrokerRows,
	useGroupSuggestions,
} from "@/hooks/use-group-positions";
import { formatMoney } from "@/lib/currency";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { formatEntryDate } from "@/lib/journal-format";
import { formatQuantity } from "@/lib/position";
import type { getGroupSuggestions } from "@/server/positionActions";

type Suggestion = Awaited<ReturnType<typeof getGroupSuggestions>>[number];

const ACTION_CLASS = "h-11 w-full sm:h-9 sm:w-auto";

const groupKey = (suggestion: Suggestion) => suggestion.tradeIds.join("-");

export function GroupSuggestionsNotice() {
	const suggestions = useGroupSuggestions();
	const [skipped, setSkipped] = useState<string[]>([]);
	const visible = (suggestions.data ?? []).filter(
		(suggestion) => !skipped.includes(groupKey(suggestion)),
	);
	if (!visible.length) return null;
	const label =
		visible.length === 1
			? "1 possible partial close."
			: `${visible.length} possible partial closes.`;
	return (
		<Dialog>
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
				<Layers className="size-4 text-muted-foreground" aria-hidden="true" />
				<span>{label}</span>
				<DialogTrigger asChild>
					<Button variant="link" size="sm" className="h-auto px-0">
						Review groups
					</Button>
				</DialogTrigger>
			</div>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Possible partial closes</DialogTitle>
					<DialogDescription>
						These broker rows have the same symbol, side, open time and open
						price. Group them to count one position. Nothing groups until you
						choose Group.
					</DialogDescription>
				</DialogHeader>
				<ul className="space-y-3">
					{visible.map((suggestion) => (
						<SuggestionCard
							key={groupKey(suggestion)}
							suggestion={suggestion}
							onSkip={() => setSkipped([...skipped, groupKey(suggestion)])}
						/>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}

function SuggestionCard({
	suggestion,
	onSkip,
}: {
	suggestion: Suggestion;
	onSkip: () => void;
}) {
	const currency = useCurrency();
	const group = useGroupBrokerRows();
	const [first] = suggestion.legs;
	const unit = resolveInstrumentSpec(first.symbol).quantityUnit.toLowerCase();
	const total = suggestion.legs.reduce(
		(sum, leg) => sum + Number(leg.netPnl),
		0,
	);
	const title = `${first.symbol} ${first.side} opened ${formatEntryDate(first.entryDate)} at ${first.entryPrice}`;
	return (
		<li
			aria-label={title}
			className="section-enter space-y-2 rounded-md border border-border p-3"
		>
			<p className="text-sm font-medium">{title}</p>
			<p className="text-xs text-muted-foreground">{suggestion.reason}</p>
			<ul className="divide-y divide-border text-sm">
				{suggestion.legs.map((leg) => (
					<li
						key={leg.id}
						className="flex flex-wrap justify-between gap-x-3 py-1.5 font-data tabular-nums"
					>
						<span>
							Ticket {leg.brokerTicket ?? leg.id} ·{" "}
							{formatQuantity(Number(leg.quantity))} {unit}
						</span>
						<span className="text-muted-foreground">
							Closed {formatEntryDate(leg.exitDate)}
						</span>
						<span>
							{formatMoney(Number(leg.netPnl), currency, { signed: true })}
						</span>
					</li>
				))}
			</ul>
			<p className="text-sm">
				Position total{" "}
				<span className="font-data tabular-nums">
					{formatMoney(total, currency, { signed: true })}
				</span>
			</p>
			<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
				<Button
					type="button"
					variant="outline"
					className={ACTION_CLASS}
					disabled={group.isPending}
					onClick={onSkip}
				>
					Skip
				</Button>
				<Button
					type="button"
					className={ACTION_CLASS}
					disabled={group.isPending}
					onClick={() => group.mutate(suggestion.tradeIds)}
				>
					{group.isPending ? "Grouping…" : "Group"}
				</Button>
			</div>
		</li>
	);
}
