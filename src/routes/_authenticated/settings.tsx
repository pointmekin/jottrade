import { createFileRoute } from "@tanstack/react-router";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import { ModeToggle } from "@/components/mode-toggle";
import { TradingAccounts } from "@/components/settings/TradingAccounts";

export const Route = createFileRoute("/_authenticated/settings")({
	component: RouteComponent,
	ssr: false,
});

function RouteComponent() {
	return (
		<div className="app-page">
			<main className="page-frame section-enter max-w-4xl">
				<AppPageHeader
					title="Settings"
					description="Set how the workspace behaves without changing the trading record beneath it."
					meta="Workspace preferences"
				/>
				<TradingAccounts />

				<div className="surface mt-6 space-y-4 p-5">
					<SectionHeading title="Appearance" detail="Local preference" />
					<div>
						<div className="flex items-center justify-between gap-5 py-2">
							<div>
								<p className="text-sm font-medium text-foreground">Theme</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Switch between light and dark mode.
								</p>
							</div>
							<ModeToggle />
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
