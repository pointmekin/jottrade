import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useHasPassword } from "@/hooks/use-has-password";
import { authClient } from "@/lib/auth-client";

const REQUEST_FAILED = "The request failed. Try again.";

type AuthResult = { error: { message?: string } | null };

function useAuthRequest() {
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const run = async (request: () => Promise<AuthResult>) => {
		setLoading(true);
		setError("");
		try {
			const { error } = await request();
			if (error) setError(error.message ?? REQUEST_FAILED);
			return !error;
		} catch {
			setError(REQUEST_FAILED);
			return false;
		} finally {
			setLoading(false);
		}
	};

	return { error, loading, run };
}

export function TwoFactorSettings() {
	const hasPassword = useHasPassword();
	const session = authClient.useSession();

	if (hasPassword.isPending || session.isPending) return <Spinner />;
	if (hasPassword.isError) {
		return (
			<p className="text-xs text-destructive">
				Could not load your sign-in methods. Reload the page.
			</p>
		);
	}
	if (!hasPassword.data) {
		return (
			<p className="text-xs text-muted-foreground">
				Two-factor authentication protects the email and password sign-in. To
				add a password, sign out and use "Forgot password?" on the sign-in page.
			</p>
		);
	}
	if (session.data?.user.twoFactorEnabled) return <TwoFactorEnabled />;
	return <TwoFactorSetup />;
}

function PasswordField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>Confirm with your password</Label>
			<Input
				id={id}
				type="password"
				autoComplete="current-password"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				required
			/>
		</div>
	);
}

function FieldError({ message }: { message: string }) {
	if (!message) return null;
	return (
		<p role="alert" className="text-xs text-destructive">
			{message}
		</p>
	);
}

function RecoveryCodes({ codes }: { codes: string[] }) {
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(codes.join("\n"));
			toast.success("Recovery codes copied.");
		} catch {
			toast.error("Could not copy. Select the codes and copy them.");
		}
	};

	return (
		<div className="grid gap-2 border border-border bg-background p-3">
			<p className="text-xs text-muted-foreground">
				Save these recovery codes now. You cannot see them again. Each code
				works one time.
			</p>
			<ul
				aria-label="Recovery codes"
				className="grid grid-cols-2 gap-1 font-data text-sm"
			>
				{codes.map((code) => (
					<li key={code}>{code}</li>
				))}
			</ul>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={copy}
				className="justify-self-start"
			>
				Copy codes
			</Button>
		</div>
	);
}

interface Enrollment {
	totpURI: string;
	backupCodes: string[];
}

function TwoFactorSetup() {
	const [password, setPassword] = useState("");
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
	const request = useAuthRequest();

	const handleStart = async (e: React.FormEvent) => {
		e.preventDefault();
		await request.run(async () => {
			const result = await authClient.twoFactor.enable({ password });
			if (result.data && "totpURI" in result.data) {
				const { totpURI, backupCodes } = result.data;
				setEnrollment({ totpURI, backupCodes });
				setPassword("");
			}
			return result;
		});
	};

	if (enrollment) {
		return (
			<TwoFactorVerify
				enrollment={enrollment}
				onCancel={() => setEnrollment(null)}
			/>
		);
	}

	return (
		<form onSubmit={handleStart} className="grid max-w-sm gap-3">
			<p className="text-xs text-muted-foreground">
				Off. When it is on, a sign-in with email and password also asks for a
				code from an authenticator app. Google sign-in uses the security of your
				Google account.
			</p>
			<FieldError message={request.error} />
			<PasswordField value={password} onChange={setPassword} />
			<Button
				type="submit"
				size="sm"
				disabled={request.loading}
				className="justify-self-start"
			>
				{request.loading && <Spinner />}
				Set up two-factor
			</Button>
		</form>
	);
}

function TwoFactorVerify({
	enrollment,
	onCancel,
}: {
	enrollment: Enrollment;
	onCancel: () => void;
}) {
	const keyId = useId();
	const codeId = useId();
	const [code, setCode] = useState("");
	const request = useAuthRequest();
	const secret = new URL(enrollment.totpURI).searchParams.get("secret");

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();
		const ok = await request.run(() =>
			authClient.twoFactor.verifyTotp({ code: code.trim() }),
		);
		if (ok) toast.success("Two-factor authentication is on.");
	};

	return (
		<form onSubmit={handleVerify} className="grid max-w-md gap-3">
			<p className="text-xs text-muted-foreground">
				Add this key to your authenticator app, or{" "}
				<a href={enrollment.totpURI} className="text-primary underline">
					open it in the app
				</a>
				.
			</p>
			<div className="grid gap-1.5">
				<Label htmlFor={keyId}>Setup key</Label>
				<Input id={keyId} readOnly value={secret ?? ""} className="font-data" />
			</div>
			<RecoveryCodes codes={enrollment.backupCodes} />
			<FieldError message={request.error} />
			<div className="grid gap-1.5">
				<Label htmlFor={codeId}>Code from the app</Label>
				<Input
					id={codeId}
					inputMode="numeric"
					autoComplete="one-time-code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
					required
				/>
			</div>
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={request.loading}>
					{request.loading && <Spinner />}
					Turn on
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function TwoFactorEnabled() {
	const [password, setPassword] = useState("");
	const [codes, setCodes] = useState<string[] | null>(null);
	const request = useAuthRequest();

	const regenerate = () =>
		request.run(async () => {
			const result = await authClient.twoFactor.generateBackupCodes({
				password,
			});
			if (result.data) {
				setCodes(result.data.backupCodes);
				setPassword("");
			}
			return result;
		});

	const disable = async () => {
		const ok = await request.run(() =>
			authClient.twoFactor.disable({ password }),
		);
		if (ok) toast.success("Two-factor authentication is off.");
	};

	return (
		<form onSubmit={(e) => e.preventDefault()} className="grid max-w-sm gap-3">
			<p className="text-xs text-muted-foreground">
				On. A sign-in with email and password asks for a code from your
				authenticator app or a recovery code.
			</p>
			{codes && <RecoveryCodes codes={codes} />}
			<FieldError message={request.error} />
			<PasswordField value={password} onChange={setPassword} />
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={request.loading || !password}
					onClick={regenerate}
				>
					New recovery codes
				</Button>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					disabled={request.loading || !password}
					onClick={disable}
				>
					Turn off
				</Button>
			</div>
		</form>
	);
}
