import {
	type BrokerRecord,
	ImportAction,
	type ImportCandidate,
	type ImportCommitPlan,
	type ImportDecision,
	ImportKind,
	type ImportPreviewRow,
} from "./import-batch";

const RESOLVED = new Set<ImportAction>([
	ImportAction.Insert,
	ImportAction.Duplicate,
	ImportAction.Superseded,
	ImportAction.Adopt,
	ImportAction.Correct,
	ImportAction.Exclude,
	ImportAction.Reimport,
]);
function validateDecision(
	row: ImportPreviewRow,
	decision: ImportDecision | undefined,
	action: ImportAction,
): void {
	if (!RESOLVED.has(action))
		throw Error(
			`CSV record ${row.rowNumber}: repair, exclude or resolve this row.`,
		);
	if (action !== ImportAction.Exclude && !row.record)
		throw Error(`CSV record ${row.rowNumber} has unresolved errors.`);
	if (action === ImportAction.Reimport && !row.reason.includes("removed"))
		throw Error("Only removed versions can be explicitly reimported.");
	if (
		(action === ImportAction.Insert || action === ImportAction.Correct) &&
		(row.action === ImportAction.Duplicate ||
			row.action === ImportAction.Superseded)
	)
		throw Error(
			"An already recorded source version cannot be inserted or applied again.",
		);
	if (
		decision?.action === ImportAction.Adopt &&
		row.action !== ImportAction.Adopt
	)
		throw Error("Legacy adoption requires identical economic facts.");
	if (
		(action === ImportAction.Duplicate &&
			row.action !== ImportAction.Duplicate) ||
		(action === ImportAction.Superseded &&
			row.action !== ImportAction.Superseded)
	)
		throw Error(
			"A row cannot be marked duplicate without a recorded source version.",
		);
}
function findTarget(
	row: ImportPreviewRow,
	decision: ImportDecision | undefined,
	action: ImportAction,
	targets: Set<number>,
): ImportCandidate | undefined {
	const updating =
		action === ImportAction.Correct || action === ImportAction.Adopt;
	if (!updating) return undefined;
	const target = row.candidates.find(
		(candidate) => candidate.id === (decision?.targetId ?? row.targetId),
	);
	if (!target) throw Error("Choose an existing candidate from this account.");
	if (
		decision?.expectedRevision !== undefined &&
		decision.expectedRevision !== target.revision
	)
		throw Error("Refresh stale previews before applying.");
	if (targets.has(target.id))
		throw Error(
			"Two source records cannot update the same execution in one batch.",
		);
	targets.add(target.id);
	return target;
}
function afterSnapshot(
	row: ImportPreviewRow,
	action: ImportAction,
	target: ImportCandidate | undefined,
): BrokerRecord | null {
	if (!row.record) return null;
	const source = row.record;
	const result = {
		...source,
		importHash:
			target?.snapshot.importHash ?? `v2:${row.fingerprint}:${row.occurrence}`,
	};
	if (action !== ImportAction.Adopt || !target) return result;
	if (
		source.kind === ImportKind.Trades &&
		target.snapshot.kind === ImportKind.Trades
	)
		return {
			...target.snapshot,
			brokerSource: source.brokerSource,
			brokerTicket: source.brokerTicket,
			brokerProfit: source.brokerProfit,
			brokerCommission: source.brokerCommission,
			brokerSwap: source.brokerSwap,
			brokerCloseReason: source.brokerCloseReason,
		};
	if (
		source.kind === ImportKind.Adjustments &&
		target.snapshot.kind === ImportKind.Adjustments
	)
		return {
			...target.snapshot,
			brokerSource: source.brokerSource,
			brokerAdjustment: source.brokerAdjustment,
		};
	throw Error("The candidate belongs to another import type.");
}
function insertionNotes(record: BrokerRecord | null): string | null {
	if (record?.kind === ImportKind.Trades)
		return `Ticket: ${record.brokerTicket} | Reason: ${record.brokerCloseReason || "N/A"}`;
	if (record?.kind === ImportKind.Adjustments)
		return record.brokerAdjustment?.note ?? null;
	return null;
}
function planRow(
	row: ImportPreviewRow,
	decision: ImportDecision | undefined,
	targets: Set<number>,
): ImportCommitPlan {
	const action = decision?.action ?? row.action;
	validateDecision(row, decision, action);
	const target = findTarget(row, decision, action, targets);
	const after = afterSnapshot(row, action, target);
	const mutating =
		Boolean(target) ||
		action === ImportAction.Insert ||
		action === ImportAction.Reimport;
	return {
		rowNumber: row.rowNumber,
		action,
		reason: decision ? `Explicit choice: ${action}. ${row.reason}` : row.reason,
		recordId: target?.id ?? row.targetId,
		fingerprint: row.fingerprint,
		occurrence: row.occurrence,
		before: target?.snapshot ?? null,
		after,
		afterRevision: target ? target.revision + 1 : 0,
		expectedRevision: target?.revision ?? null,
		expectedImportHash: target?.snapshot.importHash ?? null,
		notes: insertionNotes(after),
		source: row.source,
		originalSource: row.originalSource ?? row.source,
		undoState: mutating ? "pending" : "none",
		undoReason: null,
	};
}
export function buildImportPlan(
	rows: ImportPreviewRow[],
	decisions: ImportDecision[],
): ImportCommitPlan[] {
	const targets = new Set<number>();
	const decisionMap = new Map(
		decisions.map((decision) => [decision.rowNumber, decision]),
	);
	if (
		decisionMap.size !== decisions.length ||
		decisions.some(
			(item) => !rows.some((row) => row.rowNumber === item.rowNumber),
		)
	)
		throw Error("Each import decision must address one source record.");
	return rows.map((row) =>
		planRow(row, decisionMap.get(row.rowNumber), targets),
	);
}
