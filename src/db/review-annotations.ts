import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { currentExecutionFingerprint } from "@/lib/review-execution-fingerprint";
import { trades } from "./schema";

export async function loadTradeAnnotation(
	userId: string,
	portfolioId: number,
	id: number,
) {
	const [trade] = await db
		.select()
		.from(trades)
		.where(
			and(
				eq(trades.userId, userId),
				eq(trades.portfolioId, portfolioId),
				eq(trades.id, id),
			),
		);
	if (!trade) throw new Error("Trade not found.");
	const executionFingerprint = await currentExecutionFingerprint(trade);
	return {
		trade,
		executionFingerprint,
		reviewed:
			trade.reviewedExecutionFingerprint === executionFingerprint &&
			trade.reviewedAt !== null,
	};
}
export async function writeTradeAnnotation(
	userId: string,
	data: {
		portfolioId: number;
		id: number;
		expectedRevision: number;
		notes: string;
		review: "KEEP" | "COMPLETE" | "REOPEN";
		expectedFingerprint?: string;
	},
) {
	const { trade, executionFingerprint } = await loadTradeAnnotation(
		userId,
		data.portfolioId,
		data.id,
	);
	if (
		data.review === "COMPLETE" &&
		data.expectedFingerprint !== executionFingerprint
	)
		throw new Error("This trade changed. Reload before marking reviewed.");
	let reviewedAt = trade.reviewedAt;
	let reviewedExecutionFingerprint = trade.reviewedExecutionFingerprint;
	if (data.review === "COMPLETE") {
		reviewedAt = new Date();
		reviewedExecutionFingerprint = executionFingerprint;
	}
	if (data.review === "REOPEN") {
		reviewedAt = null;
		reviewedExecutionFingerprint = null;
	}
	const rows = await db.batch([
		db.execute(
			sql`select id from portfolios where id = ${data.portfolioId} and user_id = ${userId} for update`,
		),
		db
			.update(trades)
			.set({
				notes: data.notes,
				reviewedAt,
				reviewedExecutionFingerprint,
				annotationRevision: sql`${trades.annotationRevision} + 1`,
				editRevision: sql`${trades.editRevision} + 1`,
			})
			.where(
				and(
					eq(trades.id, data.id),
					eq(trades.portfolioId, data.portfolioId),
					eq(trades.userId, userId),
					eq(trades.annotationRevision, data.expectedRevision),
					data.review === "COMPLETE"
						? eq(trades.editRevision, trade.editRevision)
						: undefined,
				),
			)
			.returning({ revision: trades.annotationRevision, notes: trades.notes }),
	]);
	const [saved] = rows[1];
	if (!saved)
		throw new Error(
			"This trade changed elsewhere. Your draft is kept. Reload to resolve.",
		);
	return { revision: saved.revision, fields: { notes: saved.notes ?? "" } };
}
