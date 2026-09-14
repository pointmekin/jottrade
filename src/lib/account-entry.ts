export const AccountEntryKind = {
	Deposit: "DEPOSIT",
	Withdrawal: "WITHDRAWAL",
	Adjustment: "ADJUSTMENT",
} as const;

export type AccountEntryKind =
	(typeof AccountEntryKind)[keyof typeof AccountEntryKind];

export type AccountEntryRecord = {
	id: number;
	occurredAt: string;
	amount: number;
	kind: AccountEntryKind;
	note: string | null;
};
