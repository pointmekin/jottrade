import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
	accountImportHistory,
	applyImportPlan,
	discardExpiredImportStages,
	importReceipt,
	previewImportUndo,
	requireImportBatch,
	undoImport,
} from "@/db/import-batches";
import { loadImportMatches } from "@/db/import-records";
import { requireOwnedPortfolio } from "@/db/portfolios";
import { importBatches } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { sha256Hex } from "@/lib/hash";
import { ImportAction, ImportKind } from "@/lib/import-batch";
import { buildImportPlan } from "@/lib/import-plan";
import { summarizeImport } from "@/lib/import-reconciliation";
import {
	MAX_IMPORT_BYTES,
	parseImportSource,
	readImportCsv,
} from "@/lib/import-source";

const batchIdSchema = z.object({ batchId: z.uuid() });
const scopeSchema = z.object({ portfolioId: z.number().int().positive() });
const sourceSchema = scopeSchema.extend({
	kind: z.enum(ImportKind),
	fileName: z.string().trim().min(1).max(255),
	csv: z.string().min(1).max(MAX_IMPORT_BYTES),
	sourceCurrency: z.string().regex(/^[A-Z]{3}$/),
});
export const stageImport = createServerFn({ method: "POST" })
	.validator(sourceSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const portfolio = await requireOwnedPortfolio(userId, data.portfolioId);
		if ((portfolio.currency ?? DEFAULT_CURRENCY) !== data.sourceCurrency)
			throw Error(
				"Source currency must match the selected account. No FX conversion is applied.",
			);
		const source = readImportCsv(data.csv);
		await discardExpiredImportStages(userId);
		const parsed = await parseImportSource(
			userId,
			data.portfolioId,
			data.kind,
			data.sourceCurrency,
			source.rows,
			source.fields,
		);
		const rows = await loadImportMatches(
			userId,
			data.portfolioId,
			data.kind,
			parsed,
		);
		const [batch] = await db
			.insert(importBatches)
			.values({
				id: crypto.randomUUID(),
				userId,
				portfolioId: data.portfolioId,
				kind: data.kind,
				fileName: data.fileName,
				fileHash: await sha256Hex(data.csv),
				sourceCurrency: data.sourceCurrency,
				rows,
				summary: summarizeImport(rows),
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			})
			.returning();
		return importReceipt(batch);
	});
export const repairImportRow = createServerFn({ method: "POST" })
	.validator(
		batchIdSchema.extend({
			revision: z.number().int().nonnegative(),
			rowNumber: z.number().int().min(2),
			source: z.record(z.string().max(80), z.string().max(4096)),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const batch = await requireImportBatch(userId, data.batchId);
		if (batch.state !== "staged" || batch.expiresAt.getTime() <= Date.now())
			throw Error("This import stage expired or was already applied.");
		if (!batch.rows.some((row) => row.rowNumber === data.rowNumber))
			throw Error("Source record not found.");
		const sources = batch.rows.map((row) =>
			row.rowNumber === data.rowNumber ? data.source : row.source,
		);
		if (
			new TextEncoder().encode(JSON.stringify(sources)).length >
			MAX_IMPORT_BYTES
		)
			throw Error("Repaired source exceeds 5 MB.");
		const fields = [...new Set(sources.flatMap((row) => Object.keys(row)))];
		const parsed = await parseImportSource(
			userId,
			batch.portfolioId,
			z.enum(ImportKind).parse(batch.kind),
			batch.sourceCurrency,
			sources,
			fields,
		);
		const matched = await loadImportMatches(
			userId,
			batch.portfolioId,
			z.enum(ImportKind).parse(batch.kind),
			parsed,
		);
		const rows = matched.map((row, index) => ({
			...row,
			originalSource:
				batch.rows[index].originalSource ?? batch.rows[index].source,
		}));
		const [updated] = await db
			.update(importBatches)
			.set({
				rows,
				summary: summarizeImport(rows),
				revision: batch.revision + 1,
			})
			.where(
				and(
					eq(importBatches.id, batch.id),
					eq(importBatches.userId, userId),
					eq(importBatches.state, "staged"),
					eq(importBatches.revision, data.revision),
				),
			)
			.returning();
		if (!updated)
			throw Error("The staged source changed. Reload before repairing.");
		return importReceipt(updated);
	});
const decisionSchema = z.object({
	rowNumber: z.number().int().min(2),
	action: z.enum(ImportAction),
	targetId: z.number().int().positive().optional(),
	expectedRevision: z.number().int().nonnegative().optional(),
});
export const commitImport = createServerFn({ method: "POST" })
	.validator(
		batchIdSchema.extend({
			revision: z.number().int().nonnegative(),
			decisions: z.array(decisionSchema).max(5000),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const batch = await requireImportBatch(userId, data.batchId);
		if (batch.state !== "staged") return importReceipt(batch);
		if (batch.revision !== data.revision)
			throw Error("The staged source changed. Refresh before applying.");
		const plan = buildImportPlan(batch.rows, data.decisions);
		const resolved = batch.rows.map((row, index) => ({
			...row,
			action: plan[index].action,
		}));
		return applyImportPlan(
			userId,
			batch,
			plan,
			summarizeImport(resolved, plan),
		);
	});
export const getImportHistory = createServerFn({ method: "GET" })
	.validator(
		scopeSchema.extend({
			cursor: z
				.object({ createdAt: z.iso.datetime(), id: z.uuid() })
				.optional(),
		}),
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		await requireOwnedPortfolio(userId, data.portfolioId);
		return accountImportHistory(userId, data.portfolioId, data.cursor);
	});
export const getImportBatch = createServerFn({ method: "GET" })
	.validator(batchIdSchema)
	.handler(async ({ data }) =>
		importReceipt(
			await requireImportBatch(await requireUserId(), data.batchId),
		),
	);
export const getImportUndoPreview = createServerFn({ method: "GET" })
	.validator(batchIdSchema)
	.handler(async ({ data }) =>
		previewImportUndo(await requireUserId(), data.batchId),
	);
export const undoImportBatch = createServerFn({ method: "POST" })
	.validator(batchIdSchema)
	.handler(async ({ data }) => undoImport(await requireUserId(), data.batchId));
