import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lockPortfolio } from "@/db/portfolios";
import { strategies, trades } from "@/db/schema";
import {
	buildPlaybookCheck,
	type CriterionResult,
	isPlaybookCheckStale,
	playbookCheckSchema,
} from "@/lib/playbook-check";

export async function loadPlaybookCheck(
	userId: string,
	portfolioId: number,
	id: number,
) {
	const [row] = await db
		.select({
			setupId: trades.setupId,
			revision: trades.editRevision,
			initialRiskPercent: trades.initialRiskPercent,
			playbookCheck: trades.playbookCheck,
			strategy: {
				id: strategies.id,
				name: strategies.name,
				criteria: strategies.criteria,
				riskGuidance: strategies.riskGuidance,
				criteriaVersion: strategies.criteriaVersion,
			},
		})
		.from(trades)
		.leftJoin(
			strategies,
			and(
				eq(strategies.id, trades.setupId),
				eq(strategies.userId, trades.userId),
			),
		)
		.where(
			and(
				eq(trades.userId, userId),
				eq(trades.portfolioId, portfolioId),
				eq(trades.id, id),
			),
		);
	if (!row) throw new Error("Trade not found.");
	const check = row.playbookCheck
		? playbookCheckSchema.parse(row.playbookCheck)
		: null;
	return {
		revision: row.revision,
		initialRiskPercent: row.initialRiskPercent,
		strategy: row.strategy,
		check,
		isStale: check
			? isPlaybookCheckStale(check, row.setupId, row.strategy)
			: false,
	};
}

export async function writePlaybookCheck(
	userId: string,
	data: {
		portfolioId: number;
		id: number;
		expectedRevision: number;
		criteriaVersion: number;
		results: Record<string, CriterionResult>;
	},
) {
	const { strategy } = await loadPlaybookCheck(
		userId,
		data.portfolioId,
		data.id,
	);
	if (!strategy)
		throw new Error(
			"Assign a strategy to check this trade against its playbook.",
		);
	if (strategy.criteriaVersion !== data.criteriaVersion)
		throw new Error("The playbook changed. Reload.");
	const check = buildPlaybookCheck(strategy, data.results, new Date());
	const rows = await db.batch([
		lockPortfolio(userId, data.portfolioId),
		db
			.update(trades)
			.set({
				playbookCheck: check,
				editRevision: sql`${trades.editRevision} + 1`,
			})
			.where(
				and(
					eq(trades.id, data.id),
					eq(trades.portfolioId, data.portfolioId),
					eq(trades.userId, userId),
					eq(trades.editRevision, data.expectedRevision),
					eq(trades.setupId, strategy.id),
					sql`EXISTS(SELECT 1 FROM ${strategies} WHERE ${strategies.id}=${strategy.id} AND ${strategies.userId}=${userId} AND ${strategies.criteriaVersion}=${strategy.criteriaVersion})`,
				),
			)
			.returning({ revision: trades.editRevision }),
	]);
	const [saved] = rows[1];
	if (!saved) throw new Error("This trade changed. Reload.");
	return { revision: saved.revision, check };
}
