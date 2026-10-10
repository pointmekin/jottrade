import type { PnlCalculationSnapshot } from "./pnl-context";
import type { StoredRuleCheck } from "./risk-rule-evaluation";
import type { InitialRiskSnapshot, RiskCorrection } from "./trade-risk-schema";
import type { TradeTag } from "./trade-tag";

export const TradeStatus = {
	Open: "OPEN",
	Closed: "CLOSED",
	Pending: "PENDING",
} as const;

export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export const TradeSide = {
	Long: "LONG",
	Short: "SHORT",
} as const;

export type TradeSide = (typeof TradeSide)[keyof typeof TradeSide];

export const TradeConfidence = {
	High: "HIGH",
	Medium: "MEDIUM",
	Low: "LOW",
} as const;

export type TradeConfidence =
	(typeof TradeConfidence)[keyof typeof TradeConfidence];

export type Trade = {
	id: number;
	portfolioId?: number;
	editRevision?: number;
	importHash?: string | null;
	initialStopPrice?: string | null;
	initialTargetPrice?: string | null;
	initialRiskAmount?: string | null;
	initialRiskPercent?: string | null;
	initialRiskSnapshot?: InitialRiskSnapshot | null;
	managementStopPrice?: string | null;
	riskCorrectionHistory?: RiskCorrection[] | null;
	ruleCheck?: StoredRuleCheck | null;
	exitQuoteToAccountRate?: string | null;
	pnlCalculationSnapshot?: PnlCalculationSnapshot | null;
	brokerSource?: string | null;
	brokerTicket?: string | null;
	brokerProfit?: string | null;
	brokerCommission?: string | null;
	brokerSwap?: string | null;
	symbol: string;
	side: TradeSide;
	status: TradeStatus | null;
	entryDate: Date;
	exitDate: Date | null;
	entryPrice: string | null;
	targetPrice?: string | null;
	exitPrice: string | null;
	quantity: string | null;
	netPnl: string | null;
	returnPercent: string | null;
	fees?: string | null;
	confidence?: TradeConfidence | null;
	mistake?: string | null;
	setupId?: number | null;
	notes?: string | null;
	annotationRevision?: number;
	reviewedAt?: Date | null;
	reviewedExecutionFingerprint?: string | null;
	screenshots?: string[] | null;
	tags?: TradeTag[];
};
