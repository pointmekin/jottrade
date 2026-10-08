import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { ArrowRight, Crosshair, Loader2, Lock, Mail, User } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	AuthAside,
	GoogleAuthSection,
	IconField,
} from "@/components/auth/auth-page-parts";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/sign-up")({
	beforeLoad: async () => {
		try {
			const { data } = await authClient.getSession();
			if (data) {
				throw redirect({
					to: "/dashboard",
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
			router.navigate({ to: "/dashboard" });
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
			<AuthAside
				heading="Build a record you can learn from."
				description="Capture trades manually or import your broker history, then trace the decisions behind the result."
				steps={["Capture", "Connect", "Improve"]}
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

						<GoogleAuthSection label="Sign up with Google" />

						<form onSubmit={handleSignUp} className="space-y-4 mt-4">
							<IconField
								id={nameId}
								label="Full Name"
								icon={User}
								type="text"
								autoComplete="name"
								placeholder="John Doe"
								value={name}
								onChange={setName}
							/>

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

							<IconField
								id={passwordId}
								label="Password"
								icon={Lock}
								type="password"
								autoComplete="new-password"
								placeholder="••••••••"
								value={password}
								onChange={setPassword}
							/>

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
