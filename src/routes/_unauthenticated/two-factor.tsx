import { createFileRoute, useRouter } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { IconField } from "@/components/auth/auth-page-parts";
import {
	FormError,
	PasswordPageLayout,
	SUBMIT_CLASS,
} from "@/components/auth/password-page-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_unauthenticated/two-factor")({
	component: TwoFactorChallenge,
});

const REQUEST_FAILED = "The request failed. Try again.";
const CHALLENGE_EXPIRED = "This sign-in expired. Go back and sign in again.";
const EXPIRED_CODES = new Set([
	"INVALID_TWO_FACTOR_COOKIE",
	"TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
]);

const TWO_FACTOR_ASIDE = {
	heading: "Confirm that it is you.",
	description: "Your account uses two-factor authentication.",
	steps: ["Password", "Code", "Dashboard"],
};

function TwoFactorChallenge() {
	const router = useRouter();
	const codeId = useId();
	const [code, setCode] = useState("");
	const [useRecoveryCode, setUseRecoveryCode] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			const body = { code: code.trim() };
			const { error } = useRecoveryCode
				? await authClient.twoFactor.verifyBackupCode(body)
				: await authClient.twoFactor.verifyTotp(body);
			if (!error) {
				await router.navigate({ to: "/dashboard" });
				return;
			}
			if (error.code && EXPIRED_CODES.has(error.code)) {
				setError(CHALLENGE_EXPIRED);
			} else {
				setError(error.message ?? REQUEST_FAILED);
			}
		} catch {
			setError(REQUEST_FAILED);
		}
		setLoading(false);
	};

	const switchMethod = () => {
		setUseRecoveryCode((value) => !value);
		setCode("");
		setError("");
	};

	return (
		<PasswordPageLayout
			title="Two-factor authentication"
			description={
				useRecoveryCode
					? "Enter one of your recovery codes. Each code works one time."
					: "Enter the 6-digit code from your authenticator app."
			}
			aside={TWO_FACTOR_ASIDE}
		>
			{error && <FormError message={error} />}
			<form onSubmit={handleSubmit} className="space-y-4">
				<IconField
					id={codeId}
					label={useRecoveryCode ? "Recovery code" : "Authentication code"}
					icon={KeyRound}
					type="text"
					autoComplete="one-time-code"
					placeholder={useRecoveryCode ? "xxxxx-xxxxx" : "123456"}
					value={code}
					onChange={setCode}
				/>
				<button type="submit" disabled={loading} className={SUBMIT_CLASS}>
					{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
				</button>
			</form>
			<button
				type="button"
				onClick={switchMethod}
				className="mt-4 block text-xs font-medium text-primary transition-colors hover:text-primary/80"
			>
				{useRecoveryCode ? "Use your authenticator app" : "Use a recovery code"}
			</button>
		</PasswordPageLayout>
	);
}
