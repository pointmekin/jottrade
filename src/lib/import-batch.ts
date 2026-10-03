import type { ImportedAdjustment } from "./adjustment-import";
import type { CsvRow, ImportRowIssue } from "./import-values";
import type { ImportedTrade } from "./trade-import";
import type { InitialRiskSnapshot } from "./trade-risk-schema";

export const ImportKind = {
	Trades: "trades",
	Adjustments: "adjustments",
} as const;
export type ImportKind = (typeof ImportKind)[keyof typeof ImportKind];
export const ImportAction = {
	Insert: "insert",
	Duplicate: "duplicate",
	Superseded: "superseded",
	Adopt: "adopt",
	Correct: "correct",
	Exclude: "exclude",
	Ambiguous: "ambiguous",
	Error: "error",
	Reimport: "reimport",
} as const;
export type ImportAction = (typeof ImportAction)[keyof typeof ImportAction];
export type BrokerTrade = {
	kind: typeof ImportKind.Trades;
	symbol: string;
	side: string;
	status: string;
	entryDate: string;
	entryPrice: string;
	quantity: string;
	exitDate: string | null;
	exitPrice: string | null;
	fees: string;
	netPnl: string | null;
	returnPercent: string | null;
	brokerSource: string | null;
	brokerTicket: string | null;
	brokerProfit: string | null;
	brokerCommission: string | null;
	brokerSwap: string | null;
	brokerCloseReason: string | null;
	importHash: string | null;
};
export type BrokerAdjustment = {
	kind: typeof ImportKind.Adjustments;
	occurredAt: string;
	amount: string;
	entryKind: string;
	brokerSource: string | null;
	brokerAdjustment: ImportedAdjustment | null;
	importHash: string | null;
};
export type BrokerRecord = BrokerTrade | BrokerAdjustment;
export type ImportCandidate = {
	id: number;
	revision: number;
	snapshot: BrokerRecord;
	reason: string;
	initialRiskAmount?: string | null;
	initialRiskSnapshot?: InitialRiskSnapshot | null;
};
export type ImportPreviewRow = {
	rowNumber: number;
	source: CsvRow;
	originalSource?: CsvRow;
	issues: ImportRowIssue[];
	record: BrokerRecord | null;
	fingerprint: string | null;
	legacyHash: string | null;
	action: ImportAction;
	reason: string;
	candidates: ImportCandidate[];
	occurrence: number;
	targetId: number | null;
	expectedRevision: number | null;
};
export type ImportDecision = {
	rowNumber: number;
	action: ImportAction;
	targetId?: number;
	expectedRevision?: number;
	source?: CsvRow;
};
export type ImportOutcome = {
	rowNumber: number;
	action: ImportAction;
	reason: string;
	recordId: number | null;
	fingerprint: string | null;
	occurrence: number;
	before: BrokerRecord | null;
	after: BrokerRecord | null;
	afterRevision: number | null;
	undoState: "pending" | "undone" | "protected" | "none";
	undoReason: string | null;
};
export type ImportSummary = {
	warnings: string[];
	rows: number;
	counts: Partial<Record<ImportAction, number>>;
	gross: string;
	commission: string;
	swap: string;
	sourceNet: string;
	openRows: number;
	openNet: string;
	accountDelta: string;
	expectedAccountDelta: string;
	expectedMutations: number;
	actualMutations: number | null;
	accountBefore: string | null;
	accountAfter: string | null;
	reconciled: boolean | null;
	unknownAmounts: number;
	excluded: number;
};
export type ImportReceipt = {
	id: string;
	revision: number;
	portfolioId: number;
	sourceCurrency: string;
	fileName: string;
	kind: ImportKind;
	state: string;
	summary: ImportSummary;
	outcomes: ImportOutcome[];
	rows: ImportPreviewRow[];
	createdAt: Date | string;
	expiresAt: Date | string;
};
export type ImportParsedValue = ImportedTrade | ImportedAdjustment;
export type ImportCommitPlan = ImportOutcome & {
	expectedRevision: number | null;
	expectedImportHash: string | null;
	notes: string | null;
	source: CsvRow;
	originalSource?: CsvRow;
};
