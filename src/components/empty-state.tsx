import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
	icon: LucideIcon;
	title: string;
	description: string;
	/** The single primary button for the next action. */
	action: ReactNode;
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: EmptyStateProps) {
	return (
		<div className="empty-field">
			<Icon aria-hidden className="mb-4 size-6 text-muted-foreground" />
			<p className="font-semibold">{title}</p>
			<p className="mt-1 max-w-sm text-sm text-muted-foreground">
				{description}
			</p>
			<div className="mt-5">{action}</div>
		</div>
	);
}
