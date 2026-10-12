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
	editRevision?: number;
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
	screenshots?: string[] | null;
};
