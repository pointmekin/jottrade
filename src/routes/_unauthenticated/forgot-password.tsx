import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Mail } from "lucide-react";
import { useId, useState } from "react";
import { IconField } from "@/components/auth/auth-page-parts";
import {
	FormError,
	FormNotice,
	PasswordPageLayout,
	SUBMIT_CLASS,
} from "@/components/auth/password-page-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/forgot-password")({
	component: ForgotPassword,
});

const REQUEST_FAILED = "The request failed. Try again.";

function ForgotPassword() {
	const emailId = useId();
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [sent, setSent] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			const { error } = await authClient.requestPasswordReset({
				email,
				redirectTo: "/reset-password",
			});
			if (error) setError(error.message ?? REQUEST_FAILED);
			else setSent(true);
		} catch {
			setError(REQUEST_FAILED);
		} finally {
			setLoading(false);
		}
	};

	return (
		<PasswordPageLayout
			title="Reset your password"
			description="Enter the email of your account. We send a link to set a new password."
		>
			{sent ? (
				<FormNotice>
					If an account with a password exists for this email, we sent a reset
					link.
				</FormNotice>
			) : (
				<>
					{error && <FormError message={error} />}
					<form onSubmit={handleSubmit} className="space-y-4">
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
						<button type="submit" disabled={loading} className={SUBMIT_CLASS}>
							{loading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								"Send reset link"
							)}
						</button>
					</form>
				</>
			)}
		</PasswordPageLayout>
	);
}
