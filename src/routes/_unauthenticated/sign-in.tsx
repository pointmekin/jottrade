import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Crosshair, Loader2, Lock, Mail } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	AuthAside,
	GoogleAuthSection,
	IconField,
} from "@/components/auth/auth-page-parts";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/sign-in")({
	component: SignIn,
});

function SignIn() {
	const { data: session, isPending } = authClient.useSession();
	const router = useRouter();
	const emailId = useId();
	const passwordId = useId();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (session && !isPending) {
			router.navigate({ to: "/dashboard" });
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
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "An error occurred");
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
		<div className="grid min-h-screen overflow-hidden lg:grid-cols-[minmax(0,1fr)_30rem]">
			<AuthAside
				heading="Review the decision, not only the result."
				description="Your setups, executions, outcomes, and notes stay aligned in one private trading record."
				steps={["Setup", "Execution", "Review"]}
			/>

			<main className="flex items-center justify-center px-6 py-10">
				<div className="w-full max-w-[380px]">
					<div className="mb-10 flex items-center gap-2.5 lg:hidden">
						<div className="flex h-8 w-8 items-center justify-center border border-border bg-accent">
							<Crosshair className="h-4 w-4 text-ring" strokeWidth={1.5} />
						</div>
						<span className="font-semibold text-lg tracking-tight text-foreground">
							JotTrade
						</span>
					</div>

					<div className="border-y border-border py-7">
						<div className="mb-6">
							<h1 className="text-xl font-semibold text-foreground mb-1">
								Welcome back
							</h1>
							<p className="text-sm text-muted-foreground">
								Sign in to continue to your dashboard.
							</p>
						</div>

						{error && (
							<div className="mb-5 border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
								{error}
							</div>
						)}

						<GoogleAuthSection label="Sign in with Google" />

						<form onSubmit={handleSignIn} className="space-y-4 mt-4">
							<IconField
								id={emailId}
								label="Email"
								icon={Mail}
								type="email"
								autoComplete="email"
								placeholder="you@example.com"
								value={email}
								onChange={setEmail}
							/>

							<div className="space-y-1.5">
								<div className="flex items-center">
									<label
										htmlFor={passwordId}
										className="text-sm font-medium text-foreground"
									>
										Password
									</label>
									<Link
										to="/forgot-password"
										className="ml-auto text-xs font-medium text-primary transition-colors hover:text-primary/80"
									>
										Forgot password?
									</Link>
								</div>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
										<Lock className="h-4 w-4" />
									</div>
									<input
										id={passwordId}
										autoComplete="current-password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										className="block w-full border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
										placeholder="••••••••"
										required
									/>
								</div>
							</div>

							<button
								type="submit"
								disabled={loading}
								className="mt-2 flex w-full items-center justify-center border border-primary bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/88 disabled:cursor-not-allowed disabled:opacity-60"
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
			</main>
		</div>
	);
}
