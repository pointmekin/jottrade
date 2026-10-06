import type { portfolios, strategies } from "@/db/schema";
import { AccountKind } from "@/lib/account";

type PortfolioRow = typeof portfolios.$inferInsert;
type StrategyRow = typeof strategies.$inferInsert;

export const at = (iso: string) => new Date(`${iso}Z`);
export const CREATED = at("2026-01-01T00:00:00");

export const SeedUser = {
	Alice: "seed-alice",
	Bob: "seed-bob",
	Erin: "seed-erin",
	Nora: "seed-nora",
} as const;

export const PEOPLE = [
	{ id: SeedUser.Alice, name: "Alice Active", email: "alice@jottrade.test" },
	{ id: SeedUser.Bob, name: "Bob Two-Accounts", email: "bob@jottrade.test" },
	{ id: SeedUser.Erin, name: "Erin Empty", email: "erin@jottrade.test" },
	// No trading account: exercises first-run and account-creation paths.
	{ id: SeedUser.Nora, name: "Nora No-Account", email: "nora@jottrade.test" },
];

export const PORTFOLIOS: PortfolioRow[] = [
	{
		id: 1,
		userId: SeedUser.Alice,
		name: "Main USD",
		kind: AccountKind.Real,
		currency: "USD",
		isDefault: true,
		reviewTimezone: "America/New_York",
		reviewWeekStartsOn: 1,
	},
	{
		id: 2,
		userId: SeedUser.Alice,
		name: "Prop Challenge",
		kind: AccountKind.Demo,
		currency: "USD",
		isDefault: false,
		reviewTimezone: "UTC",
		reviewWeekStartsOn: 1,
		description: "Losing streak and a negative balance.",
	},
	{
		id: 3,
		userId: SeedUser.Alice,
		name: "EUR Swing",
		kind: AccountKind.Real,
		currency: "EUR",
		isDefault: false,
		reviewTimezone: "Europe/Berlin",
		reviewWeekStartsOn: 0,
	},
	{
		id: 4,
		userId: SeedUser.Bob,
		name: "Bob Main",
		kind: AccountKind.Real,
		currency: "USD",
		isDefault: true,
		reviewTimezone: "Asia/Bangkok",
		reviewWeekStartsOn: 1,
	},
	{
		id: 5,
		userId: SeedUser.Bob,
		name: "Bob Crypto",
		kind: AccountKind.Real,
		currency: "USD",
		isDefault: false,
	},
	{
		id: 6,
		userId: SeedUser.Erin,
		name: "Empty Account",
		kind: AccountKind.Real,
		currency: "USD",
		isDefault: true,
	},
].map((row) => ({ ...row, createdAt: CREATED }));

export const STRATEGIES: StrategyRow[] = [
	{
		id: 1,
		userId: SeedUser.Alice,
		name: "Breakout",
		description: "Range break with volume.",
	},
	{
		id: 2,
		userId: SeedUser.Alice,
		name: "Mean Reversion",
		description: "Fade a stretched move.",
	},
	{
		id: 3,
		userId: SeedUser.Alice,
		name: "News Fade",
		description: "Defined, never traded.",
	},
	// Same name as Alice's: names are unique per user, not globally.
	{ id: 4, userId: SeedUser.Bob, name: "Breakout", description: null },
];

export const CURRENCY: Record<number, string> = Object.fromEntries(
	PORTFOLIOS.map((row) => [row.id, row.currency ?? "USD"]),
);
export const OWNER: Record<number, string> = Object.fromEntries(
	PORTFOLIOS.map((row) => [row.id, row.userId]),
);
