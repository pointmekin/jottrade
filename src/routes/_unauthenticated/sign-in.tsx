import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";

import { Loader2, Mail, Lock, ArrowRight, TrendingUp } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/sign-in")({
	component: SignIn,
});

function SignIn() {
	const { data: session, isPending } = authClient.useSession();
	const router = useRouter();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (session && !isPending) {
			router.navigate({ to: "/journal" });
		}
	}, [session, isPending, router]);

	const handleSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			await authClient.signIn.email(
				{
					email,
					password,
				},
				{
					onSuccess: () => {
						router.navigate({ to: "/dashboard" });
					},
					onError: (ctx) => {
						setError(ctx.error.message);
						setLoading(false);
					},
				},
			);
		} catch (err: any) {
			setError(err.message || "An error occurred");
			setLoading(false);
		}
	};

	if (isPending || session) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<Loader2 className="h-8 w-8 text-primary animate-spin" />
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
			{/* Subtle background glow */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/6 blur-[120px]" />
				<div className="absolute -bottom-[10%] right-[5%] w-[40%] h-[40%] rounded-full bg-primary/4 blur-[120px]" />
			</div>

			<div className="w-full max-w-[380px] px-6 py-10 relative z-10">
				{/* Brand mark */}
				<div className="flex items-center justify-center gap-2.5 mb-10">
					<div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
						<TrendingUp
							className="h-4 w-4 text-primary-foreground"
							strokeWidth={2.5}
						/>
					</div>
					<span className="font-semibold text-lg tracking-tight text-foreground">
						JotTrade
					</span>
				</div>

				<div className="bg-card border border-border rounded-xl shadow-lg p-7">
					<div className="mb-6">
						<h1 className="text-xl font-semibold text-foreground mb-1">
							Welcome back
						</h1>
						<p className="text-sm text-muted-foreground">
							Sign in to continue to your dashboard.
						</p>
					</div>

					{error && (
						<div className="mb-5 p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
							{error}
						</div>
					)}

					<div className="space-y-3">
						<button
							type="button"
							onClick={async () => {
								await authClient.signIn.social({
									provider: "google",
									callbackURL: "/dashboard",
								});
							}}
							className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white hover:bg-gray-50 border border-border text-gray-900 font-medium text-sm rounded-lg transition-colors"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24">
								<path
									d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
									fill="#4285F4"
								/>
								<path
									d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
									fill="#34A853"
								/>
								<path
									d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
									fill="#FBBC05"
								/>
								<path
									d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
									fill="#EA4335"
								/>
							</svg>
							Sign in with Google
						</button>

						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-border" />
							</div>
							<div className="relative flex justify-center text-xs">
								<span className="px-2 bg-card text-muted-foreground">
									or continue with email
								</span>
							</div>
						</div>
					</div>

					<form onSubmit={handleSignIn} className="space-y-4 mt-4">
						<div className="space-y-1.5">
							<label className="text-sm font-medium text-foreground block">
								Email
							</label>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
									<Mail className="h-4 w-4" />
								</div>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="block w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/60 transition-all"
									placeholder="you@example.com"
									required
								/>
							</div>
						</div>

						<div className="space-y-1.5">
							<div className="flex justify-between items-center">
								<label className="text-sm font-medium text-foreground">
									Password
								</label>
								<a
									href="#"
									className="text-xs text-primary hover:text-primary/80 transition-colors"
								>
									Forgot password?
								</a>
							</div>
							<div className="relative group">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
									<Lock className="h-4 w-4" />
								</div>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="block w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/60 transition-all"
									placeholder="••••••••"
									required
								/>
							</div>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="w-full flex items-center justify-center py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
						>
							{loading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<>
									Sign In
									<ArrowRight className="ml-2 h-4 w-4" />
								</>
							)}
						</button>
					</form>

					<p className="mt-6 text-center text-sm text-muted-foreground">
						Don't have an account?{" "}
						<Link
							to="/sign-up"
							className="text-primary hover:text-primary/80 font-medium transition-colors"
						>
							Sign up
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
