import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	groupBrokerRows,
	loadGroupLegs,
	loadGroupSuggestions,
	ungroupBrokerRows,
} from "@/db/position-groups";
import {
	type ExecutionFill,
	loadPosition,
	loadPositionForWrite,
	writePositionFills,
} from "@/db/positions";
import {
	ExecutionKind,
	executionInputSchema,
	replayPosition,
} from "@/lib/position";
import { authMiddleware } from "./auth-middleware";

const tradeRefSchema = z.object({ tradeId: z.number().int().positive() });
const writeRefSchema = tradeRefSchema.extend({
	expectedRevision: z.number().int().nonnegative(),
});
const accountRefSchema = z.object({ portfolioId: z.number().int().positive() });
const groupSchema = accountRefSchema.extend({
	tradeIds: z.array(z.number().int().positive()).min(2).max(100),
});
const fillRefSchema = writeRefSchema.extend({
	executionId: z.number().int().positive(),
});

const toFill = ({
	executedAt,
	...input
}: z.infer<typeof executionInputSchema>): ExecutionFill => ({
	...input,
	executedAt: new Date(executedAt),
});

function requireFill(fills: ExecutionFill[], executionId: number) {
	const fill = fills.find((candidate) => candidate.id === executionId);
	if (!fill) throw new Error("Fill not found.");
	return fill;
}

export const getPositionExecutions = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(tradeRefSchema)
	.handler(async ({ data, context }) => {
		const { trade, instrument, fills } = await loadPosition(
			context.userId,
			data.tradeId,
		);
		const legIds = [
			...new Set(fills.flatMap((fill) => fill.sourceTradeId ?? [])),
		];
		return {
			editRevision: trade.editRevision,
			isMaterialized: trade.executionCount > 0,
			legs: await loadGroupLegs(context.userId, legIds),
			fills,
			replay: replayPosition(trade.side, fills, instrument),
		};
	});

export const addExecution = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(executionInputSchema.extend(writeRefSchema.shape))
	.handler(
		async ({ data: { tradeId, expectedRevision, ...input }, context }) => {
			const position = await loadPositionForWrite(
				context.userId,
				tradeId,
				expectedRevision,
			);
			await writePositionFills(
				context.userId,
				position,
				[...position.fills, toFill(input)],
				expectedRevision,
			);
			return { success: true };
		},
	);

export const updateExecution = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(executionInputSchema.extend(fillRefSchema.shape))
	.handler(
		async ({
			data: { tradeId, expectedRevision, executionId, ...input },
			context,
		}) => {
			const position = await loadPositionForWrite(
				context.userId,
				tradeId,
				expectedRevision,
			);
			const previous = requireFill(position.fills, executionId);
			const fills = position.fills.map((fill) =>
				fill === previous
					? { ...toFill(input), id: fill.id, sourceTradeId: fill.sourceTradeId }
					: fill,
			);
			await writePositionFills(
				context.userId,
				position,
				fills,
				expectedRevision,
			);
			return { success: true };
		},
	);

export const deleteExecution = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(fillRefSchema)
	.handler(
		async ({ data: { tradeId, expectedRevision, executionId }, context }) => {
			const position = await loadPositionForWrite(
				context.userId,
				tradeId,
				expectedRevision,
			);
			const removed = requireFill(position.fills, executionId);
			const fills = position.fills.filter((fill) => fill !== removed);
			if (!fills.some((fill) => fill.kind === ExecutionKind.Entry))
				throw new Error("A position needs at least one entry fill.");
			await writePositionFills(
				context.userId,
				position,
				fills,
				expectedRevision,
			);
			return { success: true };
		},
	);

export const getGroupSuggestions = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(accountRefSchema)
	.handler(({ data, context }) =>
		loadGroupSuggestions(context.userId, data.portfolioId),
	);

export const groupImportedTrades = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(groupSchema)
	.handler(async ({ data, context }) => ({
		tradeId: await groupBrokerRows(
			context.userId,
			data.portfolioId,
			data.tradeIds,
		),
	}));

export const ungroupPosition = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(tradeRefSchema)
	.handler(async ({ data, context }) => {
		await ungroupBrokerRows(context.userId, data.tradeId);
		return { success: true };
	});
