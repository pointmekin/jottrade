import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useHasPassword } from "@/hooks/use-has-password";
import { authClient } from "@/lib/auth-client";

const DELETE_ACCOUNT = "Delete account";
const NOT_DELETED = "Your account was not deleted. Try again.";
const ERROR_MESSAGES: Record<string, string> = {
	INVALID_PASSWORD:
		"The password is not correct. Your account was not deleted.",
	SESSION_EXPIRED:
		"Your account was not deleted. Sign out, sign in again, then try again.",
};
const SCOPE = [
	"Your trading accounts, trades and funding entries",
	"Your strategies, tags and saved views",
	"Your daily and weekly reviews",
	"Your trade screenshots",
	"Your sessions on all devices",
];

export function AccountDeletion() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-4">
			<p className="max-w-prose text-sm text-muted-foreground">
				Delete your user and all the data in your journal. You cannot undo this.
			</p>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="destructive" size="sm">
						{DELETE_ACCOUNT}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete your account?</AlertDialogTitle>
						<AlertDialogDescription>
							This deletes all of the data below. You cannot undo this.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
						{SCOPE.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
					<p className="text-sm text-muted-foreground">
						To keep a copy,{" "}
						<Link to="/settings" className="text-foreground underline">
							download your archive
						</Link>{" "}
						in Settings first. The archive does not include the screenshot
						files.
					</p>
					<DeletionForm />
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function DeletionForm() {
	const id = useId();
	const email = authClient.useSession().data?.user.email ?? "";
	const hasPassword = useHasPassword();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [value, setValue] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	if (hasPassword.isPending) return <Spinner />;
	if (hasPassword.isError) {
		return (
			<p className="text-xs text-destructive">
				Could not load your sign-in methods. Reload the page.
			</p>
		);
	}

	const isPasswordUser = hasPassword.data;
	const canSubmit = isPasswordUser
		? value.length > 0
		: value.trim().toLowerCase() === email.toLowerCase();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			const { error } = await authClient.deleteUser(
				isPasswordUser ? { password: value } : {},
			);
			if (error) {
				setError(ERROR_MESSAGES[error.code ?? ""] ?? NOT_DELETED);
				return;
			}
			toast.success("Your account was deleted.");
			await navigate({ to: "/" });
			queryClient.clear();
		} catch {
			setError(NOT_DELETED);
		} finally {
			setLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			<div className="grid gap-1.5">
				<Label htmlFor={`${id}-confirm`}>
					{isPasswordUser ? "Current password" : `Type ${email} to confirm`}
				</Label>
				<Input
					id={`${id}-confirm`}
					type={isPasswordUser ? "password" : "email"}
					autoComplete={isPasswordUser ? "current-password" : "off"}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					required
				/>
				{!isPasswordUser && (
					<p className="text-xs text-muted-foreground">
						You must have signed in during the last 24 hours.
					</p>
				)}
			</div>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<Button
					type="submit"
					variant="destructive"
					disabled={!canSubmit || loading}
				>
					{loading && <Spinner />}
					{DELETE_ACCOUNT}
				</Button>
			</AlertDialogFooter>
		</form>
	);
}
