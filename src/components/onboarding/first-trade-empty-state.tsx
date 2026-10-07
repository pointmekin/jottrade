import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { JournalIntent } from "@/lib/journal-search";

interface FirstTradeEmptyStateProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function FirstTradeEmptyState(props: FirstTradeEmptyStateProps) {
	return (
		<EmptyState
			{...props}
			action={
				<Button asChild>
					<Link to="/journal" search={{ intent: JournalIntent.Log }}>
						Log your first trade
					</Link>
				</Button>
			}
		/>
	);
}
