import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useHasPassword } from "@/hooks/use-has-password";
import { authClient } from "@/lib/auth-client";
import { newPasswordError } from "@/lib/password";

const REQUEST_FAILED = "The request failed. Try again.";

export function PasswordSettings() {
	const hasPassword = useHasPassword();

	if (hasPassword.isPending) return <Spinner />;
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
				You sign in with Google, so this account has no password. To add one,
				sign out and use "Forgot password?" on the sign-in page.
			</p>
		);
	}
	return <ChangePasswordForm />;
}

function ChangePasswordForm() {
	const id = useId();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const invalid = newPasswordError(newPassword, confirm);
		if (invalid) {
			setError(invalid);
			return;
		}
		setLoading(true);
		setError("");
		try {
			const { error } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions,
			});
			if (error) {
				setError(error.message ?? REQUEST_FAILED);
				return;
			}
			setCurrentPassword("");
			setNewPassword("");
			setConfirm("");
			toast.success("Your password changed.");
		} catch {
			setError(REQUEST_FAILED);
		} finally {
			setLoading(false);
		}
	};

	const fields = [
		[
			"current",
			"Current password",
			"current-password",
			currentPassword,
			setCurrentPassword,
		],
		["new", "New password", "new-password", newPassword, setNewPassword],
		["confirm", "Confirm new password", "new-password", confirm, setConfirm],
	] as const;

	return (
		<form onSubmit={handleSubmit} className="grid max-w-sm gap-3">
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
			{fields.map(([key, label, autoComplete, value, onChange]) => (
				<div key={key} className="grid gap-1.5">
					<Label htmlFor={`${id}-${key}`}>{label}</Label>
					<Input
						id={`${id}-${key}`}
						type="password"
						autoComplete={autoComplete}
						value={value}
						onChange={(e) => onChange(e.target.value)}
						required
					/>
				</div>
			))}
			<div className="flex items-center gap-2">
				<Checkbox
					id={`${id}-revoke`}
					checked={revokeOtherSessions}
					onCheckedChange={(checked) =>
						setRevokeOtherSessions(checked === true)
					}
				/>
				<Label htmlFor={`${id}-revoke`} className="font-normal">
					Sign out of other devices
				</Label>
			</div>
			<Button
				type="submit"
				size="sm"
				disabled={loading}
				className="justify-self-start"
			>
				{loading && <Spinner />}
				Change password
			</Button>
		</form>
	);
}
