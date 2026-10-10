import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { formatMoney } from "@/lib/currency";
import { type Trade, TradeStatus } from "@/lib/trade";
import {
	calculatePlannedRewardRisk,
	calculateRealizedR,
} from "@/lib/trade-risk";
import { RiskUnavailableReason } from "@/lib/trade-risk-schema";
import { TradeRiskCorrectionForm } from "./trade-risk-correction-form";
import { TradeRuleCheck } from "./trade-rule-check";

export function TradeRiskDetails({ trade }: { trade: Trade }) {
	const { accounts } = useAccounts();
	const account = accounts.find((item) => item.id === trade.portfolioId);
	const [correcting, setCorrecting] = useState(false);
	const snapshot = trade.initialRiskSnapshot;
	const currency = snapshot?.accountCurrency ?? account?.currency ?? "USD";
	const metrics = riskMetricValues(trade, currency, account?.currency);
	return (
		<section className="space-y-3" aria-label="Initial risk and R">
			<h2 className="text-sm font-medium">Original risk plan</h2>
			<dl className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<dt className="text-muted-foreground">Initial risk</dt>
					<dd>{metrics.money}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Initial account risk</dt>
					<dd>{metrics.percent}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Planned RR</dt>
					<dd>{metrics.planned}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Realized net R</dt>
					<dd>{metrics.realized}</dd>
				</div>
			</dl>
			<p className="text-xs text-muted-foreground">
				Planned RR uses the original target and stop. Realized R divides closed
				net P&L after fees by original stop-distance risk before costs.
				Management changes preserve this plan.
			</p>
			{snapshot && <SavedRiskInputs trade={trade} snapshot={snapshot} />}
			{metrics.mismatch && (
				<p role="alert" className="text-sm text-destructive">
					{RiskUnavailableReason.CurrencyMismatch}. Saved money remains in{" "}
					{currency}.
				</p>
			)}
			<Button
				type="button"
				variant="outline"
				onClick={() => setCorrecting(!correcting)}
			>
				Correct original plan
			</Button>
			{correcting && (
				<TradeRiskCorrectionForm
					key={trade.id}
					trade={trade}
					onClose={() => setCorrecting(false)}
				/>
			)}
			<RiskCorrectionHistory trade={trade} />
			<TradeRuleCheck check={trade.ruleCheck} currency={currency} />
		</section>
	);
}

function riskMetricValues(
	trade: Trade,
	currency: string,
	accountCurrency?: string,
) {
	const snapshot = trade.initialRiskSnapshot;
	const rr = calculatePlannedRewardRisk(snapshot);
	const realizedR = calculateRealizedR(trade, accountCurrency);
	const mismatch = Boolean(
		accountCurrency && snapshot && accountCurrency !== snapshot.accountCurrency,
	);
	let unavailable: string =
		snapshot?.unavailableReason ?? RiskUnavailableReason.MissingStop;
	if (trade.status !== TradeStatus.Closed) unavailable = "Trade is not closed";
	else if (mismatch) unavailable = RiskUnavailableReason.CurrencyMismatch;
	else if (trade.netPnl == null) unavailable = "Net P&L is unavailable";
	return {
		mismatch,
		money: trade.initialRiskAmount
			? formatMoney(Number(trade.initialRiskAmount), currency)
			: "Unavailable",
		percent: trade.initialRiskPercent
			? `${Number(trade.initialRiskPercent).toFixed(2)}%`
			: "No positive balance recorded",
		planned: rr === null ? "Unavailable" : `1:${rr.toFixed(2)}`,
		realized: realizedR === null ? unavailable : `${realizedR.toFixed(2)}R`,
	};
}

function SavedRiskInputs({
	trade,
	snapshot,
}: {
	trade: Trade;
	snapshot: NonNullable<Trade["initialRiskSnapshot"]>;
}) {
	return (
		<details className="text-sm">
			<summary>Saved calculation inputs</summary>
			<dl className="mt-2 space-y-1">
				<dt>Symbol / side / entry date</dt>
				<dd>
					{snapshot.symbol} / {snapshot.side} / {snapshot.entryDate}
				</dd>
				<dt>Entry / initial stop / initial target</dt>
				<dd>
					{snapshot.entryPrice} / {snapshot.stopPrice ?? "unavailable"} /{" "}
					{snapshot.targetPrice ?? "unavailable"}
				</dd>
				<dt>Original quantity / contract</dt>
				<dd>
					{snapshot.quantity} {snapshot.quantityUnit.toLowerCase()} ×{" "}
					{snapshot.contractSize} · {snapshot.specSource}
				</dd>
				<dt>Entry quote-to-account FX</dt>
				<dd>
					{snapshot.quoteCurrency ?? "unknown"} → {snapshot.accountCurrency}:{" "}
					{snapshot.quoteToAccountRate ?? "unavailable"} ·{" "}
					{snapshot.conversionSource ?? "unavailable"} ·{" "}
					{snapshot.conversionAsOf}
				</dd>
				<dt>Reviewed balance at entry</dt>
				<dd>
					{snapshot.balanceAccount ?? "unavailable"} {snapshot.accountCurrency}{" "}
					· {snapshot.balanceSource}
				</dd>
				{snapshot.quantity !== trade.quantity && (
					<>
						<dt>Current quantity differs</dt>
						<dd>{trade.quantity}; original risk is unchanged.</dd>
					</>
				)}
			</dl>
		</details>
	);
}

function RiskCorrectionHistory({ trade }: { trade: Trade }) {
	if (!trade.riskCorrectionHistory?.length) return null;
	return (
		<details className="text-sm">
			<summary>
				Correction history ({trade.riskCorrectionHistory.length})
			</summary>
			<ul className="mt-2 space-y-2">
				{trade.riskCorrectionHistory.map((item) => (
					<li key={item.revisionAfter}>
						{item.correctedAt}: {item.reason}. Initial risk{" "}
						{item.previous.initialRiskAmount ?? "unavailable"} →{" "}
						{item.replacement.initialRiskAmount ?? "unavailable"}.
					</li>
				))}
			</ul>
		</details>
	);
}
