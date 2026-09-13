import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { auth } from "@/lib/auth";

const PAGE_SIZE = 50;

const tradeByIdSchema = z.object({
	id: z.coerce.number().int().positive(),
});

const filterSchema = z
	.object({
		portfolioId: z.number().optional(),
		symbol: z.string().optional(),
		side: z.enum(["LONG", "SHORT"]).optional(),
		status: z.enum(["OPEN", "CLOSED", "PENDING"]).optional(),
		setupId: z.union([z.number(), z.literal("none")]).optional(),
		confidence: z.array(z.enum(["HIGH", "MEDIUM", "LOW"])).optional(),
		mistake: z.array(z.string()).optional(),
		dateFrom: z.string().optional(),
		dateTo: z.string().optional(),
		page: z.number().default(1),
	})
	.optional();

export const getTrades = createServerFn({ method: "GET" }).handler(
	async (ctx: any) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		type FilterData = NonNullable<z.infer<typeof filterSchema>>;
		const data: FilterData = (filterSchema.parse(ctx.data ?? {}) ??
			{}) as FilterData;
		const page = data.page ?? 1;
		const offset = (page - 1) * PAGE_SIZE;

		const conditions = [eq(trades.userId, session.user.id)];

		if (data.portfolioId)
			conditions.push(eq(trades.portfolioId, data.portfolioId));
		if (data.symbol) conditions.push(like(trades.symbol, `%${data.symbol}%`));
		if (data.side) conditions.push(eq(trades.side, data.side));
		if (data.status) conditions.push(eq(trades.status, data.status));
		if (data.setupId === "none") conditions.push(isNull(trades.setupId));
		else if (data.setupId !== undefined)
			conditions.push(eq(trades.setupId, data.setupId));
		if (data.confidence?.length)
			conditions.push(inArray(trades.confidence, data.confidence));
		if (data.mistake?.length)
			conditions.push(inArray(trades.mistake, data.mistake));
		if (data.dateFrom)
			conditions.push(gte(trades.entryDate, new Date(data.dateFrom)));
		if (data.dateTo)
			conditions.push(lte(trades.entryDate, new Date(data.dateTo)));

		const where = and(...conditions);

		const [tradeRows, [{ total }]] = await Promise.all([
			db
				.select()
				.from(trades)
				.where(where)
				.orderBy(desc(trades.entryDate))
				.limit(PAGE_SIZE)
				.offset(offset),
			db.select({ total: count() }).from(trades).where(where),
		]);

		return {
			trades: tradeRows as any[],
			total: Number(total),
			page,
			pageSize: PAGE_SIZE,
		};
	},
);

export const getTradeById = createServerFn({ method: "GET" })
	.validator(tradeByIdSchema)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		const [trade] = await db
			.select()
			.from(trades)
			.where(and(eq(trades.id, data.id), eq(trades.userId, session.user.id)));

		if (!trade) return null;
		return {
			...trade,
			screenshots: (trade.screenshots as string[] | null) ?? [],
		};
	});
