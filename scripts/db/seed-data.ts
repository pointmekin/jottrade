import { createHash, scryptSync } from "node:crypto";
import type {
	account,
	cashFlows,
	portfolios,
	strategies,
	tags,
	trades,
	tradeTags,
	user,
} from "@/db/schema";
import { AccountEntryKind } from "@/lib/account-entry";
import {
	at,
	CREATED,
	OWNER,
	PEOPLE,
	PORTFOLIOS,
	STRATEGIES,
	TAGS,
	TRADE_TAGS,
} from "./seed-accounts";
import { seedTrades } from "./seed-trades";

export { SeedUser } from "./seed-accounts";

/** Every seeded user signs in with this password. Synthetic data only. */
export const SEED_PASSWORD = "jottrade-dev-password";

type UserRow = typeof user.$inferInsert;
type CredentialRow = typeof account.$inferInsert;
type PortfolioRow = typeof portfolios.$inferInsert;
type StrategyRow = typeof strategies.$inferInsert;
type TradeRow = typeof trades.$inferInsert;
type CashFlowRow = typeof cashFlows.$inferInsert;

export type SeedData = {
	users: UserRow[];
	credentials: CredentialRow[];
	portfolios: PortfolioRow[];
	strategies: StrategyRow[];
	trades: TradeRow[];
	cashFlows: CashFlowRow[];
	tags: (typeof tags.$inferInsert)[];
	tradeTags: (typeof tradeTags.$inferInsert)[];
};

// Better Auth's scrypt format (salt:key, N=16384, r=16, p=1, 64 bytes) with a
// salt derived from the email, so every seed run writes identical rows.
export function seedPasswordHash(email: string, password = SEED_PASSWORD) {
	const salt = createHash("sha256")
		.update(`jottrade-seed:${email}`)
		.digest("hex")
		.slice(0, 32);
	const key = scryptSync(password.normalize("NFKC"), salt, 64, {
		N: 16384,
		r: 16,
		p: 1,
		maxmem: 128 * 16384 * 16 * 2,
	});
	return `${salt}:${key.toString("hex")}`;
}

function cashFlow(
	portfolioId: number,
	occurredAt: string,
	amount: string,
	kind: AccountEntryKind,
	extra: Partial<CashFlowRow> = {},
): CashFlowRow {
	return {
		portfolioId,
		userId: OWNER[portfolioId],
		occurredAt: at(occurredAt),
		createdAt: at(occurredAt),
		amount,
		kind,
		...extra,
	};
}

const CASH_FLOWS: CashFlowRow[] = [
	cashFlow(1, "2026-01-02T12:00:00", "10000.00", AccountEntryKind.Deposit, {
		note: "Initial funding",
	}),
	cashFlow(1, "2026-02-15T12:00:00", "-1500.00", AccountEntryKind.Withdrawal),
	cashFlow(1, "2026-02-28T23:00:00", "-12.34", AccountEntryKind.Adjustment, {
		note: "Platform fee",
	}),
	cashFlow(1, "2026-03-16T21:00:00", "5.67", AccountEntryKind.Adjustment, {
		brokerSource: "seed-broker",
		importHash: "seed-adjustment-0001",
		note: "Dividend",
	}),
	cashFlow(2, "2026-02-01T00:00:00", "500.00", AccountEntryKind.Deposit),
	// Withdrawing more than the account holds leaves a negative balance.
	cashFlow(2, "2026-02-06T00:00:00", "-800.00", AccountEntryKind.Withdrawal, {
		note: "Over-withdrawal",
	}),
	cashFlow(3, "2026-01-05T09:00:00", "5000.00", AccountEntryKind.Deposit),
	cashFlow(4, "2026-02-01T03:00:00", "2500.00", AccountEntryKind.Deposit),
	cashFlow(5, "2026-02-13T03:00:00", "1000.00", AccountEntryKind.Deposit),
];

export function buildSeedData(): SeedData {
	return {
		users: PEOPLE.map((person) => ({
			...person,
			emailVerified: true,
			createdAt: CREATED,
			updatedAt: CREATED,
		})),
		credentials: PEOPLE.map((person) => ({
			id: `${person.id}-credential`,
			accountId: person.id,
			providerId: "credential",
			userId: person.id,
			password: seedPasswordHash(person.email),
			createdAt: CREATED,
			updatedAt: CREATED,
		})),
		portfolios: PORTFOLIOS,
		strategies: STRATEGIES,
		trades: seedTrades(),
		cashFlows: CASH_FLOWS,
		tags: TAGS,
		tradeTags: TRADE_TAGS,
	};
}
