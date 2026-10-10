import { RiskFields } from "@/components/journal/trade-risk-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveCommandSymbol } from "@/lib/commands/aliases";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { TradeSide } from "@/lib/trade";
import type { TradeCaptureValues } from "@/lib/trade-capture";

type TradeDraft = TradeCaptureValues;
const SELECT_CLASS =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
export function TextField({
	id,
	label,
	value,
	onChange,
	isRequired = true,
	type = "text",
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	isRequired?: boolean;
	type?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				inputMode="decimal"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				required={isRequired}
			/>
		</div>
	);
}

export function TradeFields({
	id,
	draft,
	onChange,
	currency,
	portfolioId,
}: {
	id: string;
	currency: string;
	portfolioId?: number;
	draft: TradeDraft;
	onChange: (patch: Partial<TradeDraft>) => void;
}) {
	const unit =
		resolveInstrumentSpec(resolveCommandSymbol(draft.symbol.trim()))
			.quantityUnit === "LOTS"
			? "lots"
			: "units";

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<TextField
					id={`${id}-symbol`}
					label="Symbol"
					value={draft.symbol}
					onChange={(symbol) => onChange({ symbol })}
				/>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-side`}>Side</Label>
					<select
						id={`${id}-side`}
						className={SELECT_CLASS}
						value={draft.side}
						onChange={(event) =>
							onChange({
								side:
									event.target.value === TradeSide.Short
										? TradeSide.Short
										: TradeSide.Long,
							})
						}
					>
						<option value={TradeSide.Long}>Long</option>
						<option value={TradeSide.Short}>Short</option>
					</select>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<TextField
					id={`${id}-entry`}
					label="Entry price"
					value={draft.entryPrice}
					onChange={(entryPrice) => onChange({ entryPrice })}
				/>
				<TextField
					id={`${id}-quantity`}
					label={`Quantity (${unit})`}
					value={draft.quantity}
					onChange={(quantity) => onChange({ quantity })}
				/>
			</div>
			<TextField
				id={`${id}-target`}
				label="Planned target price (optional)"
				value={draft.targetPrice ?? ""}
				onChange={(targetPrice) => onChange({ targetPrice })}
				isRequired={false}
			/>
			<RiskFields
				values={draft}
				currency={currency}
				portfolioId={portfolioId}
				onChange={onChange}
			/>
			<CommandCloseFields id={id} draft={draft} onChange={onChange} />
			<p className="text-xs text-muted-foreground">
				A target does not close the trade. Leave exit fields blank to save an
				open trade.
			</p>
		</>
	);
}

function CommandCloseFields({
	id,
	draft,
	onChange,
}: {
	id: string;
	draft: TradeDraft;
	onChange: (patch: Partial<TradeDraft>) => void;
}) {
	return (
		<section aria-label="Optional closed trade" className="space-y-3">
			{(
				[
					["exitPrice", "Exit price", "text"],
					["exitDate", "Exit date", "datetime-local"],
					["fees", "Fees (account currency)", "text"],
					[
						"exitQuoteToAccountRate",
						"Exit FX rate (account money per quote unit)",
						"text",
					],
				] as const
			).map(([name, label, type]) => (
				<TextField
					key={name}
					id={`${id}-${name}`}
					label={label}
					type={type}
					isRequired={false}
					value={draft[name] ?? ""}
					onChange={(value) => onChange({ [name]: value })}
				/>
			))}
		</section>
	);
}
