import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Lock, Mail } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AuthSubmitButton, IconField } from "@/components/auth/auth-page-parts";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GoogleAuthSection } from "@/components/auth/google-auth-section";
import { AuthStatus, useAuthStatus } from "@/components/auth/use-auth-status";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/sign-in")({
	component: SignIn,
});

const SIGN_IN_FAILED = "Couldn't sign in. Try again.";

function SignIn() {
	const { data: session, isPending } = authClient.useSession();
	const router = useRouter();
	const emailId = useId();
	const passwordId = useId();
	const flow = useAuthStatus();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	useEffect(() => {
		if (session && !isPending) {
			router.navigate({ to: "/dashboard" });
		}
	}, [session, isPending, router]);

	const handleSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		if (flow.busy) return;
		flow.start(AuthStatus.Email);
		try {
			await authClient.signIn.email(
				{
					email,
					password,
				},
				{
					onSuccess: (ctx) => {
						router.navigate({
							to: ctx.data?.twoFactorRedirect ? "/two-factor" : "/dashboard",
						});
					},
					onError: (ctx) => {
						flow.fail(ctx.error.message || SIGN_IN_FAILED);
					},
				},
			);
		} catch (err: unknown) {
			flow.fail(err instanceof Error ? err.message : SIGN_IN_FAILED);
		}
	};

	return (
		<AuthPageShell
			aside={{
				heading: "Review the decision, not only the result.",
				description:
					"Your setups, executions, outcomes, and notes stay aligned in one private trading record.",
				steps: ["Setup", "Execution", "Review"],
			}}
			title="Welcome back"
			description="Sign in to continue to your dashboard."
			error={flow.error}
			loading={isPending || !!session}
			fields={2}
			footer={
				<>
					Don't have an account?{" "}
					<Link
						to="/sign-up"
						className="font-medium text-primary transition-colors hover:text-primary/80"
					>
						Sign up
					</Link>
				</>
			}
		>
			<GoogleAuthSection label="Sign in with Google" flow={flow} />

			<form onSubmit={handleSignIn} className="mt-4">
				<fieldset disabled={flow.busy} className="min-w-0 space-y-4">
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
						autoComplete="current-password"
						placeholder="••••••••"
						value={password}
						onChange={setPassword}
						labelAction={
							<Link
								to="/forgot-password"
								className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
							>
								Forgot password?
							</Link>
						}
					/>

					<AuthSubmitButton
						pending={flow.status === AuthStatus.Email}
						label="Sign In"
						pendingLabel="Signing in…"
					/>
				</fieldset>
			</form>
		</AuthPageShell>
	);
}
