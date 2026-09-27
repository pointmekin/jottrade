import { Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FundingNotice() {
	return (
		<div className="surface mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
			<div className="flex items-start gap-3">
				<Wallet className="mt-0.5 size-4 text-muted-foreground" />
				<div>
					<p className="text-sm font-medium text-foreground">
						No deposits recorded
					</p>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Balance starts at zero until you record what you funded the account
						with.
					</p>
				</div>
			</div>
			<Button asChild variant="outline" size="sm">
				<Link to="/settings">Add deposits</Link>
			</Button>
		</div>
	);
}
