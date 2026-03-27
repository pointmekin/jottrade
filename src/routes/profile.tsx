import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { ArrowLeft, User, Mail, Shield, Camera } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

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
		<div className="min-h-screen bg-background">
			<div className="max-w-4xl mx-auto p-4 lg:p-8">
				<div className="mb-8">
					<Link
						to="/dashboard"
						className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mb-4"
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to Dashboard
					</Link>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">
						Profile Settings
					</h1>
					<p className="text-muted-foreground mt-1">
						Manage your account information and preferences.
					</p>
				</div>

				<div className="bg-card border border-border rounded-xl overflow-hidden">
					{/* Header / Cover */}
					<div className="h-28 bg-gradient-to-r from-primary/15 to-primary/5 border-b border-border relative">
						<div className="absolute -bottom-10 left-8">
							<div className="relative">
								<div className="w-20 h-20 rounded-full bg-card border-4 border-card flex items-center justify-center text-2xl font-bold text-foreground overflow-hidden shadow-md">
									{user.image ? (
										<img
											src={user.image}
											alt={user.name || "User"}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center text-white">
											{user.name?.charAt(0) || "U"}
										</div>
									)}
								</div>
								<button
									type="button"
									className="absolute bottom-0 right-0 p-1.5 bg-muted hover:bg-accent rounded-full border-2 border-card text-muted-foreground hover:text-foreground transition-colors"
								>
									<Camera className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					</div>

					<div className="pt-14 px-8 pb-8">
						<div className="grid gap-8">
							{/* Personal Information */}
							<section>
								<h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
									<User className="h-4 w-4 text-primary" />
									Personal Information
								</h2>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
											Full Name
										</label>
										<div className="p-3 bg-background border border-border rounded-lg text-foreground text-sm">
											{user.name}
										</div>
									</div>
									<div className="space-y-1.5">
										<label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
											Email Address
										</label>
										<div className="p-3 bg-background border border-border rounded-lg text-foreground text-sm flex items-center gap-2">
											<Mail className="h-4 w-4 text-muted-foreground" />
											{user.email}
										</div>
									</div>
								</div>
							</section>

							<div className="border-t border-border" />

							{/* Account Security */}
							<section>
								<h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
									<Shield className="h-4 w-4 text-primary" />
									Account Security
								</h2>
								<div className="space-y-3">
									<div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
										<div>
											<h3 className="text-sm font-medium text-foreground">
												Password
											</h3>
											<p className="text-xs text-muted-foreground mt-0.5">
												Last changed 3 months ago
											</p>
										</div>
										<button
											type="button"
											className="px-3 py-1.5 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
										>
											Change Password
										</button>
									</div>
									<div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
										<div>
											<h3 className="text-sm font-medium text-foreground">
												Two-Factor Authentication
											</h3>
											<p className="text-xs text-muted-foreground mt-0.5">
												Add an extra layer of security to your account
											</p>
										</div>
										<button
											type="button"
											className="px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 border border-primary/30 rounded-lg transition-colors"
										>
											Enable 2FA
										</button>
									</div>
								</div>
							</section>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
