import { ACCOUNT_KIND_LABELS, AccountKind } from "@/lib/account";

const kindStyles = {
	[AccountKind.Real]: "border-success/35 bg-success/10 text-success",
	[AccountKind.Demo]: "border-warning/35 bg-warning/10 text-warning",
} as const;

export function AccountKindBadge({ kind }: { kind: AccountKind }) {
	return (
		<span className={`status-pill ${kindStyles[kind]}`}>
			<span aria-hidden className="size-1.5 rounded-full bg-current" />
			{ACCOUNT_KIND_LABELS[kind]}
		</span>
	);
}
