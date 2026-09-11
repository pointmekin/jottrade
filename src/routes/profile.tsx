import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { AppPageHeader, SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/profile")({
	component: Profile,
});

function Profile() {
	const session = authClient.useSession();

	if (session.isPending) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<Spinner />
			</div>
		);
	}

	if (!session.data) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
					<p className="text-muted-foreground">
						You need to be signed in to view this page.
					</p>
				</div>
				<Link
					to="/sign-in"
					className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors"
				>
					Go to Sign In
				</Link>
			</div>
		);
	}

	const user = session.data.user;

	return (
		<div className="app-page">
			<main className="page-frame section-enter max-w-5xl">
				<div>
					<Link
						to="/dashboard"
						className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to Dashboard
					</Link>
					<AppPageHeader
						title="Profile"
						description="Review the identity attached to this private trading record."
						meta="Account record"
					/>
				</div>

				<div className="surface overflow-hidden">
					{/* Header / Cover */}
					<div className="relative h-28 border-b border-border bg-accent/40">
						<div className="absolute -bottom-10 left-8">
							<div>
								<div className="flex h-20 w-20 items-center justify-center overflow-hidden border-4 border-card bg-card font-data text-2xl font-semibold text-foreground">
									{user.image ? (
										<img
											src={user.image}
											alt={user.name || "User"}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center bg-accent text-accent-foreground">
											{user.name?.charAt(0) || "U"}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="pt-14 px-8 pb-8">
						<div className="grid gap-8">
							{/* Personal Information */}
							<section>
								<SectionHeading
									title="Personal information"
									detail="Identity"
								/>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1.5">
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
											Full Name
										</p>
										<div className="border border-border bg-background p-3 text-sm text-foreground">
											{user.name}
										</div>
									</div>
									<div className="space-y-1.5">
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
											Email Address
										</p>
										<div className="flex items-center gap-2 border border-border bg-background p-3 text-sm text-foreground">
											<Mail className="h-4 w-4 text-muted-foreground" />
											{user.email}
										</div>
									</div>
								</div>
							</section>

							<div className="border-t border-border" />

							{/* Account Security */}
							<section>
								<SectionHeading title="Account security" detail="Credentials" />
								<div className="space-y-3">
									<div className="flex items-center justify-between border-b border-border py-4">
										<div>
											<h3 className="text-sm font-medium text-foreground">
												Password
											</h3>
											<p className="mt-0.5 text-xs text-muted-foreground">
												Manage your password through your sign-in provider.
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled
											title="Password management is not available in JotTrade yet"
										>
											Change Password
										</Button>
									</div>
									<div className="flex items-center justify-between py-4">
										<div>
											<h3 className="text-sm font-medium text-foreground">
												Two-Factor Authentication
											</h3>
											<p className="text-xs text-muted-foreground mt-0.5">
												Add an extra layer of security to your account
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled
											title="Two-factor authentication is not available in JotTrade yet"
										>
											Enable 2FA
										</Button>
									</div>
								</div>
							</section>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
