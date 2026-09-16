import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrade, updateTrade } from "@/server/tradeActions";

const mocks = vi.hoisted(() => ({
	values: vi.fn(),
	where: vi.fn(),
	set: vi.fn(),
	session: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let schema: { parse: (data: unknown) => unknown } | undefined;
		const builder = {
			validator: (value: typeof schema) => {
				schema = value;
				return builder;
			},
			handler:
				(fn: (context: { data: unknown }) => unknown) =>
				async (context: { data: unknown }) =>
					fn({ data: schema ? schema.parse(context.data) : context.data }),
		};
		return builder;
	},
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.where }) }),
		insert: () => ({ values: mocks.values }),
		update: () => ({ set: mocks.set }),
	},
}));
const data = {
	portfolioId: 7,
	symbol: "XAUUSDM",
	side: "SHORT" as const,
	entryPrice: "4550",
	quantity: "0.01",
	entryDate: "2026-09-16T12:00:00Z",
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.session.mockResolvedValue({ user: { id: "user1" } });
	mocks.where.mockResolvedValue([{ currency: "USD" }]);
	mocks.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});
describe("planned trade targets", () => {
	it("saves the target without closing or calculating realized P&L", async () => {
		await createTrade({ data: { ...data, targetPrice: "4500" } });
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({
				targetPrice: "4500",
				status: "OPEN",
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
			{ ...data, id: 2, userId: "user1", status: "OPEN", importHash: null },
		]);
		await updateTrade({ data: { id: 2, targetPrice: "" } } as never);
		expect(mocks.set).toHaveBeenCalledWith(
			expect.objectContaining({ targetPrice: null }),
		);
	});
});
