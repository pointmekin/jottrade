import { ModeToggle } from "@/components/mode-toggle";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
	component: RouteComponent,
	ssr: false,
});

function RouteComponent() {
	return (
		<div className="p-4 lg:p-8 space-y-8 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">
					Settings
				</h1>
				<p className="text-sm text-muted-foreground">
					Customize your experience.
				</p>
			</div>

			<div className="bg-card border border-border rounded-lg p-5 space-y-4">
				<div>
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
						Appearance
					</p>
					<div className="flex items-center justify-between">
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
		</div>
	);
}
