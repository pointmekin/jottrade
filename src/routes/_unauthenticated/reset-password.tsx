import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { IconField } from "@/components/auth/auth-page-parts";
import {
	FormError,
	FormNotice,
	PasswordPageLayout,
	SUBMIT_CLASS,
} from "@/components/auth/password-page-layout";
import { authClient } from "@/lib/auth-client";
import { newPasswordError } from "@/lib/password";

// Better Auth redirects from the email link with `token`, or with
// `error=INVALID_TOKEN` when the token expired or was used.
const resetSearchSchema = z.object({
	token: z.string().optional().catch(undefined),
	error: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_unauthenticated/reset-password")({
	validateSearch: resetSearchSchema,
	component: ResetPassword,
});

const REQUEST_FAILED = "The request failed. Try again.";

function ResetPassword() {
	const search = useSearch({ from: "/_unauthenticated/reset-password" });
	const passwordId = useId();
	const confirmId = useId();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [isInvalidLink, setIsInvalidLink] = useState(
		!search.token || Boolean(search.error),
	);
	const [isDone, setIsDone] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const invalid = newPasswordError(password, confirm);
		if (invalid) {
			setError(invalid);
			return;
		}
		setLoading(true);
		setError("");
		try {
			const { error } = await authClient.resetPassword({
				newPassword: password,
				token: search.token,
			});
			if (error?.code === "INVALID_TOKEN") setIsInvalidLink(true);
			else if (error) setError(error.message ?? REQUEST_FAILED);
			else setIsDone(true);
		} catch {
			setError(REQUEST_FAILED);
		} finally {
			setLoading(false);
		}
	};

	if (isInvalidLink) {
		return (
			<PasswordPageLayout
				title="This link does not work"
				description="The reset link expired or was already used."
			>
				<Link
					to="/forgot-password"
					className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
				>
					Request a new link
				</Link>
			</PasswordPageLayout>
		);
	}

	if (isDone) {
		return (
			<PasswordPageLayout
				title="Password reset"
				description="Sign in with your new password."
			>
				<FormNotice>
					Your password changed. Other devices are signed out.
				</FormNotice>
			</PasswordPageLayout>
		);
	}

	return (
		<PasswordPageLayout
			title="Set a new password"
			description="Use at least 8 characters."
		>
			{error && <FormError message={error} />}
			<form onSubmit={handleSubmit} className="space-y-4">
				<IconField
					id={passwordId}
					label="New password"
					icon={Lock}
					type="password"
					autoComplete="new-password"
					placeholder="••••••••"
					value={password}
					onChange={setPassword}
				/>
				<IconField
					id={confirmId}
					label="Confirm new password"
					icon={Lock}
					type="password"
					autoComplete="new-password"
					placeholder="••••••••"
					value={confirm}
					onChange={setConfirm}
				/>
				<button type="submit" disabled={loading} className={SUBMIT_CLASS}>
					{loading ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						"Reset password"
					)}
				</button>
			</form>
		</PasswordPageLayout>
	);
}
