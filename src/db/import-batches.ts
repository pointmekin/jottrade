import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import {
	type ImportCommitPlan,
	ImportKind,
	type ImportOutcome,
	type ImportReceipt,
	type ImportSummary,
} from "@/lib/import-batch";
import { importParentLockSql, importScopeLockSql } from "./import-locks";
import { importUndoSql, undoClassificationSql } from "./import-undo-sql";
import { importCommitSql } from "./import-write-sql";

export function importReceipt(
	row: typeof importBatches.$inferSelect,
): ImportReceipt {
	return {
		...row,
		kind:
			row.kind === ImportKind.Trades
				? ImportKind.Trades
				: ImportKind.Adjustments,
	};
}
export async function requireImportBatch(userId: string, batchId: string) {
	const [batch] = await db
		.select()
		.from(importBatches)
		.where(
			and(
				eq(importBatches.id, batchId),
				eq(importBatches.userId, userId),
				or(
					ne(importBatches.state, "staged"),
					sql`${importBatches.expiresAt}>NOW()`,
				),
			),
		);
	if (!batch) throw Error("Import batch not found.");
	return batch;
}
export async function applyImportPlan(
	userId: string,
	batch: typeof importBatches.$inferSelect,
	plan: ImportCommitPlan[],
	summary: ImportSummary,
) {
	const results = await db.batch([
		db.execute(importScopeLockSql(userId, batch.portfolioId)),
		db.execute(importParentLockSql(userId, batch.portfolioId, "trades")),
		db.execute(importParentLockSql(userId, batch.portfolioId, "cash_flows")),
		db.execute(
			importCommitSql(
				userId,
				batch.portfolioId,
				batch.id,
				batch.revision,
				batch.sourceCurrency,
				plan,
				summary,
			),
		),
	]);
	if (!results[3].rows.length) {
		const latest = await requireImportBatch(userId, batch.id);
		if (latest.state !== "staged") return importReceipt(latest);
		throw Error(
			"The import preview changed or expired. Refresh it before applying.",
		);
	}
	return importReceipt(await requireImportBatch(userId, batch.id));
}
export async function previewImportUndo(userId: string, batchId: string) {
	const batch = await requireImportBatch(userId, batchId);
	const result = await db.execute(
		undoClassificationSql(userId, batch.portfolioId, batchId),
	);
	return result.rows.map((row) => ({
		outcome: row.p as ImportOutcome,
		reason: row.reason as string | null,
	}));
}
export async function undoImport(userId: string, batchId: string) {
	const batch = await requireImportBatch(userId, batchId);
	if (batch.state === "undone") return importReceipt(batch);
	const results = await db.batch([
		db.execute(importScopeLockSql(userId, batch.portfolioId)),
		db.execute(importParentLockSql(userId, batch.portfolioId, "trades")),
		db.execute(importParentLockSql(userId, batch.portfolioId, "cash_flows")),
		db.execute(
			importUndoSql(userId, batch.portfolioId, batchId, batch.revision),
		),
	]);
	if (!results[3].rows.length)
		throw Error("This batch has not been applied or changed during undo.");
	return importReceipt(await requireImportBatch(userId, batchId));
}
export async function accountImportHistory(
	userId: string,
	portfolioId: number,
	cursor?: { createdAt: string; id: string },
) {
	const rows = await db
		.select({
			id: importBatches.id,
			userId: importBatches.userId,
			portfolioId: importBatches.portfolioId,
			revision: importBatches.revision,
			kind: importBatches.kind,
			state: importBatches.state,
			fileName: importBatches.fileName,
			fileHash: importBatches.fileHash,
			sourceCurrency: importBatches.sourceCurrency,
			parserVersion: importBatches.parserVersion,
			summary: importBatches.summary,
			createdAt: importBatches.createdAt,
			expiresAt: importBatches.expiresAt,
			committedAt: importBatches.committedAt,
			undoneAt: importBatches.undoneAt,
		})
		.from(importBatches)
		.where(
			and(
				eq(importBatches.userId, userId),
				or(
					ne(importBatches.state, "staged"),
					sql`${importBatches.expiresAt}>NOW()`,
				),
				eq(importBatches.portfolioId, portfolioId),
				cursor
					? or(
							lt(importBatches.createdAt, new Date(cursor.createdAt)),
							and(
								eq(importBatches.createdAt, new Date(cursor.createdAt)),
								lt(importBatches.id, cursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(desc(importBatches.createdAt), desc(importBatches.id))
		.limit(50);
	return rows.map((row) => importReceipt({ ...row, rows: [], outcomes: [] }));
}

export async function discardExpiredImportStages(userId: string) {
	await db
		.delete(importBatches)
		.where(
			and(
				eq(importBatches.userId, userId),
				eq(importBatches.state, "staged"),
				sql`${importBatches.expiresAt}<NOW()`,
			),
		);
}
