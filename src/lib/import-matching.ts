import { legacyEconomicFactsMatch } from "./import-adoption";
import {
	ImportAction,
	type ImportCandidate,
	type ImportPreviewRow,
} from "./import-batch";
import { candidateMatches } from "./import-record";

export type ImportIdentity = {
	fingerprint: string;
	occurrence: number;
	recordId: number | null;
	state: string;
};
export type ExistingImportRecord = ImportCandidate & {
	importHash: string | null;
	notes: string | null;
};
function matchRow(
	row: ImportPreviewRow,
	existing: ExistingImportRecord[],
	identities: ImportIdentity[],
	occurrence: number,
): ImportPreviewRow {
	if (!row.record || !row.fingerprint) return row;
	const exact = identities.filter(
		(alias) => alias.fingerprint === row.fingerprint,
	);
	const alias = exact.find((item) => item.occurrence === occurrence);
	if (alias) {
		let action: ImportPreviewRow["action"] = ImportAction.Duplicate;
		let reason =
			"An identical broker version is already recorded in this account.";
		if (alias.state === "superseded") {
			action = ImportAction.Superseded;
			reason =
				"This older export version has been superseded. It will not roll the record back.";
		}
		if (alias.state === "undone" || alias.recordId === null) {
			action = ImportAction.Ambiguous;
			reason =
				"This version was removed. Choose reimport explicitly to restore it.";
		}
		const candidate = existing.find((item) => item.id === alias.recordId);
		return {
			...row,
			action,
			reason,
			occurrence,
			targetId: alias.recordId,
			expectedRevision: candidate?.revision ?? null,
			candidates: candidate ? [candidate] : [],
		};
	}
	const legacy = existing.filter((item) => item.importHash === row.legacyHash);
	if (
		legacy.length === 1 &&
		legacyEconomicFactsMatch(row.record, legacy[0].snapshot)
	) {
		return {
			...row,
			action: ImportAction.Adopt,
			reason:
				"An identical legacy import belongs to this account. Its ID, money and journal fields will be preserved.",
			targetId: legacy[0].id,
			expectedRevision: legacy[0].revision,
			candidates: legacy,
		};
	}
	const candidates = existing.filter(
		(item) =>
			item.importHash &&
			(item.importHash === row.legacyHash ||
				candidateMatches(
					row.record as NonNullable<typeof row.record>,
					item.snapshot,
					item.notes,
				)),
	);
	if (candidates.length || exact.length)
		return {
			...row,
			action: ImportAction.Ambiguous,
			reason:
				"This may be a correction or another execution. Choose explicitly; ticket alone is not unique.",
			candidates,
			occurrence,
		};
	return { ...row, occurrence };
}
export function matchImportRows(
	rows: ImportPreviewRow[],
	existing: ExistingImportRecord[],
	identities: ImportIdentity[],
): ImportPreviewRow[] {
	const counts = new Map<string, number>();
	for (const row of rows)
		if (row.fingerprint)
			counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1);
	const occurrences = new Map<string, number>();
	return rows.map((row) => {
		const fingerprint = row.fingerprint ?? "";
		const occurrence = occurrences.get(fingerprint) ?? 0;
		occurrences.set(fingerprint, occurrence + 1);
		const matched = matchRow(row, existing, identities, occurrence);
		if (
			(counts.get(fingerprint) ?? 0) > 1 &&
			!identities.some(
				(item) =>
					item.fingerprint === fingerprint && item.occurrence === occurrence,
			)
		) {
			return {
				...matched,
				action: ImportAction.Ambiguous,
				reason:
					"Identical source records cannot be assumed one execution. Exclude a repeated CSV record or explicitly insert each distinct execution.",
			};
		}
		return matched;
	});
}
