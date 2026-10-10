import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRuleContext } from "@/db/risk-rule-context";
import { type RuleContext, RuleOutcome } from "@/lib/risk-rule-evaluation";
import { TradeSide } from "@/lib/trade";
import { RiskCaptureSource } from "@/lib/trade-risk-schema";
import { createTrade } from "@/server/tradeActions";

const mocks = vi.hoisted(() => ({
	values: vi.fn(),
	where: vi.fn(),
	inserted: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => "user1" }));
vi.mock("@/db/risk-rule-context", () => ({ loadRuleContext: vi.fn() }));
vi.mock("@/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.where }) }),
		insert: () => ({
			values: (row: unknown) => {
				mocks.values(row);
				return {
					onConflictDoNothing: () => ({ returning: mocks.inserted }),
				};
			},
		}),
		execute: vi.fn(),
		batch: (statements: unknown[]) => Promise.all(statements),
	},
}));

const context: RuleContext = {
	currency: "USD",
	version: {
		version: 2,
		timezone: "UTC",
		rules: { v: 1, maxTradesPerDay: 3 },
	},
	dayKey: "2026-10-09",
	realizedPnl: 0,
	missingPnlCount: 0,
	enteredCount: 3,
	dayStartBalance: null,
	recentClosed: [],
};
const capture = {
	symbol: "AAPL",
	side: TradeSide.Long,
	entryPrice: "100",
	quantity: "1",
	portfolioId: 7,
	entryDate: "2026-10-09T14:00:00Z",
};
const storedCheck = () => mocks.values.mock.lastCall?.[0].ruleCheck;
const violated = (check: { outcomes: { outcome: string }[] }) =>
	check.outcomes.filter((item) => item.outcome === RuleOutcome.Violated);

beforeEach(() => {
	vi.resetAllMocks();
	mocks.where.mockResolvedValue([{ id: 7, currency: "USD" }]);
	mocks.inserted.mockResolvedValue([{ id: 1 }]);
	vi.mocked(loadRuleContext).mockResolvedValue(context);
});

describe("stored entry rule check", () => {
	it("stores equal outcomes for equal inputs from the form and the command palette", async () => {
		const manual = await createTrade({ data: capture });
		const manualCheck = storedCheck();
		const command = await createTrade({
			data: { ...capture, captureSource: RiskCaptureSource.Command },
		});
		const commandCheck = storedCheck();

		expect(manualCheck.outcomes).toEqual(commandCheck.outcomes);
		expect(manualCheck).toMatchObject({
			v: 1,
			version: 2,
			timezone: "UTC",
			dayKey: "2026-10-09",
			captureSource: RiskCaptureSource.Manual,
		});
		expect(commandCheck.captureSource).toBe(RiskCaptureSource.Command);
		expect(violated(manualCheck)).toEqual([
			expect.objectContaining({ limit: 3, actual: 4 }),
		]);
		expect(manual.ruleCheck).toEqual(manualCheck);
		expect(command.ruleCheck).toEqual(commandCheck);
		expect(loadRuleContext).toHaveBeenCalledWith(
			"user1",
			7,
			new Date(capture.entryDate),
		);
	});

	it("stores the note as the override only when a rule is violated", async () => {
		await createTrade({ data: { ...capture, ruleNote: " A+ setup. " } });
		expect(storedCheck()).toMatchObject({
			acknowledged: true,
			note: "A+ setup.",
		});

		vi.mocked(loadRuleContext).mockResolvedValue({
			...context,
			enteredCount: 0,
		});
		await createTrade({ data: { ...capture, ruleNote: "Not needed." } });
		expect(storedCheck()).toMatchObject({ acknowledged: false, note: null });
		expect(mocks.values.mock.lastCall?.[0]).not.toHaveProperty("ruleNote");
	});

	it("stores no check when the account has no rules", async () => {
		vi.mocked(loadRuleContext).mockResolvedValue({
			...context,
			version: null,
			dayKey: null,
		});

		const result = await createTrade({ data: capture });

		expect(storedCheck()).toBeNull();
		expect(result.ruleCheck).toBeNull();
	});

	it("saves the trade with an unknown check when the rules cannot be read", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(loadRuleContext).mockRejectedValue(new Error("timeout"));

		const result = await createTrade({ data: capture });

		expect(result.id).toBe(1);
		expect(storedCheck()).toMatchObject({
			version: null,
			outcomes: [],
			reason: "Rules could not be read",
		});
	});

	it("returns the stored check of the existing trade for a duplicate draft", async () => {
		const existing = { v: 1, version: 1, outcomes: [] };
		mocks.inserted.mockResolvedValue([]);
		mocks.where
			.mockResolvedValueOnce([{ id: 7, currency: "USD" }])
			.mockResolvedValueOnce([{ id: 5, ruleCheck: existing }]);

		const result = await createTrade({
			data: {
				...capture,
				clientDraftId: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60",
			},
		});

		expect(result).toEqual({
			success: true,
			id: 5,
			duplicate: true,
			ruleCheck: existing,
		});
	});
});
