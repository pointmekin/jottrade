export const AccountKind = {
	Real: "REAL",
	Demo: "DEMO",
} as const;

export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
	[AccountKind.Real]: "Real",
	[AccountKind.Demo]: "Demo",
};
