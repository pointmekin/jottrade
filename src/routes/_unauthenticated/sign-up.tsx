import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { Lock, Mail, User } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AuthSubmitButton, IconField } from "@/components/auth/auth-page-parts";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { GoogleAuthSection } from "@/components/auth/google-auth-section";
import { AuthStatus, useAuthStatus } from "@/components/auth/use-auth-status";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

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

const SIGN_UP_FAILED = "Couldn't create the account. Try again.";

function SignUp() {
	const { data: session, isPending } = authClient.useSession();
	const router = useRouter();
	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();
	const flow = useAuthStatus();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	useEffect(() => {
		if (session && !isPending) {
			router.navigate({ to: "/dashboard" });
		}
	}, [session, isPending, router]);

	const handleSignUp = async (e: React.FormEvent) => {
		e.preventDefault();
		if (flow.busy) return;
		flow.start(AuthStatus.Email);
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
						flow.fail(ctx.error.message || SIGN_UP_FAILED);
					},
				},
			);
		} catch (err: unknown) {
			flow.fail(err instanceof Error ? err.message : SIGN_UP_FAILED);
		}
	};

	return (
		<AuthPageShell
			aside={{
				heading: "Build a record you can learn from.",
				description:
					"Capture trades manually or import your broker history, then trace the decisions behind the result.",
				steps: ["Capture", "Connect", "Improve"],
			}}
			title="Create account"
			description="Start tracking your trades today."
			error={flow.error}
			loading={isPending || !!session}
			fields={3}
			footer={
				<>
					Already have an account?{" "}
					<Link
						to="/sign-in"
						className="font-medium text-primary transition-colors hover:text-primary/80"
					>
						Sign in
					</Link>
				</>
			}
		>
			<GoogleAuthSection label="Sign up with Google" flow={flow} />

			<form onSubmit={handleSignUp} className="mt-4">
				<fieldset disabled={flow.busy} className="min-w-0 space-y-4">
					<IconField
						id={nameId}
						label="Full name"
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
						minLength={PASSWORD_MIN_LENGTH}
						hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}
					/>

					<AuthSubmitButton
						pending={flow.status === AuthStatus.Email}
						label="Create Account"
						pendingLabel="Creating account…"
					/>
				</fieldset>
			</form>
		</AuthPageShell>
	);
}
