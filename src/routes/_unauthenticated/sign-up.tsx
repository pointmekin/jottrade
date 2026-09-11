import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { ArrowRight, Crosshair, Loader2, Lock, Mail, User } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/sign-up")({
	beforeLoad: async () => {
		try {
			const { data } = await authClient.getSession();
			if (data) {
				throw redirect({
					to: "/journal",
				});
			}
		} catch (e) {
			if (e instanceof Response) throw e;
		}
	},
	component: SignUp,
});

function SignUp() {
	const { data: session, isPending } = authClient.useSession();
	const router = useRouter();
	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (session && !isPending) {
			router.navigate({ to: "/journal" });
		}
	}, [session, isPending, router]);

	const handleSignUp = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			await authClient.signUp.email(
				{
					email,
					password,
					name,
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
			<aside className="surface relative hidden border-y-0 border-l-0 p-10 lg:flex lg:flex-col lg:justify-between">
				<div className="flex items-center gap-3">
					<Crosshair className="size-5 text-ring" />
					<span className="text-sm font-semibold">JotTrade</span>
				</div>
				<div className="max-w-3xl">
					<h2 className="max-w-4xl text-[clamp(3.5rem,7vw,7.5rem)] font-semibold leading-[0.84] tracking-[-0.06em]">
						Build a record you can learn from.
					</h2>
					<p className="mt-8 max-w-xl text-base leading-7 text-muted-foreground">
						Capture trades manually or import your broker history, then trace
						the decisions behind the result.
					</p>
				</div>
				<div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
					<span className="surface p-3">Capture</span>
					<span className="surface p-3">Connect</span>
					<span className="surface p-3">Improve</span>
				</div>
			</aside>

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
								Create account
							</h1>
							<p className="text-sm text-muted-foreground">
								Start tracking your trades today.
							</p>
						</div>

						{error && (
							<div className="mb-5 border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
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
								className="flex w-full items-center justify-center gap-3 border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
							>
								<svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
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
								Sign up with Google
							</button>

							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-border" />
								</div>
								<div className="relative flex justify-center text-xs">
									<span className="bg-background px-2 text-muted-foreground">
										or continue with email
									</span>
								</div>
							</div>
						</div>

						<form onSubmit={handleSignUp} className="space-y-4 mt-4">
							<div className="space-y-1.5">
								<label
									htmlFor={nameId}
									className="text-sm font-medium text-foreground block"
								>
									Full Name
								</label>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
										<User className="h-4 w-4" />
									</div>
									<input
										id={nameId}
										autoComplete="name"
										type="text"
										value={name}
										onChange={(e) => setName(e.target.value)}
										className="block w-full border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
										placeholder="John Doe"
										required
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<label
									htmlFor={emailId}
									className="text-sm font-medium text-foreground block"
								>
									Email
								</label>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
										<Mail className="h-4 w-4" />
									</div>
									<input
										id={emailId}
										autoComplete="email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										className="block w-full border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
										placeholder="you@example.com"
										required
									/>
								</div>
							</div>

							<div className="space-y-1.5">
								<label
									htmlFor={passwordId}
									className="text-sm font-medium text-foreground block"
								>
									Password
								</label>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
										<Lock className="h-4 w-4" />
									</div>
									<input
										id={passwordId}
										autoComplete="new-password"
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
										Create Account
										<ArrowRight className="ml-2 h-4 w-4" />
									</>
								)}
							</button>
						</form>

						<p className="mt-6 text-center text-sm text-muted-foreground">
							Already have an account?{" "}
							<Link
								to="/sign-in"
								className="text-primary hover:text-primary/80 font-medium transition-colors"
							>
								Sign in
							</Link>
						</p>
					</div>
				</div>
			</main>
		</div>
	);
}
