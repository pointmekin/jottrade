import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { createTrade, updateTrade } from "@/server/tradeActions";

const mocks = vi.hoisted(() => ({
	values: vi.fn(),
	where: vi.fn(),
	set: vi.fn(),
	session: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({
	requireUserId: async () => {
		const session = await mocks.session();
		if (!session) throw new Error("Unauthorized");
		return session.user.id;
	},
}));
vi.mock("@/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.where }) }),
		insert: () => ({
			values: (row: unknown) => {
				mocks.values(row);
				return {
					onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }),
				};
			},
		}),
		update: () => ({ set: mocks.set }),
		execute: vi.fn(),
		batch: (statements: unknown[]) => Promise.all(statements),
	},
}));
const data = {
	portfolioId: 7,
	symbol: "XAUUSDM",
	side: TradeSide.Short,
	entryPrice: "4550",
	quantity: "0.01",
	entryDate: "2026-09-16T12:00:00Z",
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.session.mockResolvedValue({ user: { id: "user1" } });
	mocks.where.mockResolvedValue([{ currency: "USD" }]);
	mocks.set.mockReturnValue({
		where: vi
			.fn()
			.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 2 }]) }),
	});
});
describe("planned trade targets", () => {
	it("saves the target without closing or calculating realized P&L", async () => {
		await createTrade({ data: { ...data, targetPrice: "4500" } });
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({
				targetPrice: "4500",
				status: TradeStatus.Open,
				netPnl: undefined,
				quantity: "0.01",
			}),
		);
	});
	it.each(["-1", "0", "NaN", "Infinity", "abc"])(
		"rejects invalid target %s",
		async (targetPrice) => {
			await expect(
				createTrade({ data: { ...data, targetPrice } }),
			).rejects.toThrow();
			expect(mocks.values).not.toHaveBeenCalled();
		},
	);
	it("still requires authentication and ownership", async () => {
		mocks.session.mockResolvedValueOnce(null);
		await expect(createTrade({ data })).rejects.toThrow("Unauthorized");
		mocks.where.mockResolvedValueOnce([]);
		await expect(createTrade({ data })).rejects.toThrow("Account not found");
		expect(mocks.values).not.toHaveBeenCalled();
	});
	it("clears the target on update", async () => {
		mocks.where.mockResolvedValueOnce([
			{
				...data,
				id: 2,
				userId: "user1",
				status: TradeStatus.Open,
				importHash: null,
				editRevision: 0,
				annotationRevision: 0,
			},
		]);
		await updateTrade({ data: { id: 2, targetPrice: "" } });
		expect(mocks.set).toHaveBeenCalledWith(
			expect.objectContaining({ targetPrice: null }),
		);
	});
	it("rejects stale client notes and notes without a baseline before writing", async () => {
		const existing = {
			...data,
			id: 2,
			userId: "user1",
			status: TradeStatus.Open,
			importHash: "fixed-broker-hash",
			editRevision: 3,
			annotationRevision: 2,
			netPnl: "51.3",
		};
		mocks.where.mockResolvedValueOnce([existing]);
		await expect(
			updateTrade({
				data: { id: 2, notes: "stale", expectedAnnotationRevision: 1 },
			}),
		).rejects.toThrow("Notes changed");
		mocks.where.mockResolvedValueOnce([existing]);
		await expect(
			updateTrade({ data: { id: 2, notes: "no baseline" } }),
		).rejects.toThrow("client annotation baseline");
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it("saves current-baseline notes with broker net preserved and both revisions incremented", async () => {
		mocks.where.mockResolvedValueOnce([
			{
				...data,
				id: 2,
				userId: "user1",
				status: TradeStatus.Closed,
				importHash: "fixed-broker-hash",
				editRevision: 3,
				annotationRevision: 2,
				netPnl: "51.3",
				returnPercent: "0.45",
			},
		]);
		await updateTrade({
			data: { id: 2, notes: "current", expectedAnnotationRevision: 2 },
		});
		expect(mocks.set).toHaveBeenCalledWith(
			expect.objectContaining({
				notes: "current",
				editRevision: expect.any(Object),
				annotationRevision: expect.any(Object),
			}),
		);
	});
	it("reports a zero-row CAS rather than claiming a save", async () => {
		mocks.where.mockResolvedValueOnce([
			{
				...data,
				id: 2,
				userId: "user1",
				status: TradeStatus.Open,
				importHash: null,
				editRevision: 1,
				annotationRevision: 0,
			},
		]);
		mocks.set.mockReturnValueOnce({
			where: vi
				.fn()
				.mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
		});
		await expect(
			updateTrade({
				data: { id: 2, targetPrice: "4500", expectedRevision: 1 },
			}),
		).rejects.toThrow(/Trade changed/);
	});
});
