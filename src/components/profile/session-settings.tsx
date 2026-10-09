import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "better-auth";
import { format } from "date-fns";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";

// Better Auth lists sessions only for a session that started in the last 24 hours.
const SESSION_NOT_FRESH = "SESSION_NOT_FRESH";
const REQUEST_FAILED = "The request failed. Try again.";
const REVOKE_OTHERS = "Sign out of all other devices";

const BROWSERS = [
	["EdgiOS/", "Edge"],
	["EdgA/", "Edge"],
	["CriOS/", "Chrome"],
	["FxiOS/", "Firefox"],
	["Edg/", "Edge"],
	["OPR/", "Opera"],
	["Firefox/", "Firefox"],
	["Chrome/", "Chrome"],
	["Safari/", "Safari"],
] as const;
const SYSTEMS = [
	["iPhone", "iOS"],
	["iPad", "iOS"],
	["Android", "Android"],
	["Windows", "Windows"],
	["Mac OS X", "macOS"],
	["Linux", "Linux"],
] as const;

type SessionRow = Pick<
	Session,
	"id" | "token" | "userAgent" | "ipAddress" | "createdAt"
>;

function deviceName(userAgent: string | null | undefined) {
	if (!userAgent) return "Unknown device";
	const browser =
		BROWSERS.find(([marker]) => userAgent.includes(marker))?.[1] ??
		"Unknown browser";
	const system = SYSTEMS.find(([marker]) => userAgent.includes(marker))?.[1];
	return system ? `${browser} on ${system}` : browser;
}

export function SessionSettings() {
	const currentId = authClient.useSession().data?.session.id;
	const sessions = useQuery({
		queryKey: [QueryKey.AuthSessions, currentId],
		queryFn: async () => {
			const { data, error } = await authClient.listSessions();
			if (error?.code === SESSION_NOT_FRESH) return null;
			if (error) throw new Error(error.message ?? REQUEST_FAILED);
			return data;
		},
	});

	if (sessions.isPending) return <Spinner />;
	if (sessions.isError) {
		return (
			<p className="text-xs text-destructive">
				Could not load your sessions. Reload the page.
			</p>
		);
	}
	if (sessions.data === null) {
		return (
			<div className="grid gap-3">
				<p className="text-xs text-muted-foreground">
					To see your sessions, sign out and sign in again. The list is
					available for 24 hours after sign-in.
				</p>
				<RevokeOthersButton />
			</div>
		);
	}

	const rows = [...sessions.data].sort(
		(a, b) =>
			Number(b.id === currentId) - Number(a.id === currentId) ||
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	const hasOthers = rows.some((session) => session.id !== currentId);

	return (
		<div className="grid gap-3">
			<ul aria-label="Sessions" className="divide-y divide-border border-y">
				{rows.map((session) => (
					<SessionItem
						key={session.id}
						session={session}
						isCurrent={session.id === currentId}
					/>
				))}
			</ul>
			{hasOthers ? (
				<RevokeOthersButton />
			) : (
				<p className="text-xs text-muted-foreground">
					No other device is signed in.
				</p>
			)}
		</div>
	);
}

interface SessionItemProps {
	session: SessionRow;
	isCurrent: boolean;
}

function SessionItem({ session, isCurrent }: SessionItemProps) {
	const name = deviceName(session.userAgent);
	const details = [
		`Signed in ${format(new Date(session.createdAt), "MMM d, yyyy, h:mm a")}`,
		session.ipAddress,
	].filter(Boolean);

	return (
		<li className="flex flex-wrap items-center justify-between gap-3 py-3">
			<div className="min-w-0">
				<div className="flex items-center gap-2 text-sm font-medium text-foreground">
					{name}
					{isCurrent && <Badge variant="secondary">This device</Badge>}
				</div>
				<p className="text-xs text-muted-foreground">{details.join(" · ")}</p>
			</div>
			{!isCurrent && (
				<ConfirmRevoke
					label="Sign out"
					title={`Sign out ${name}?`}
					description="This device must sign in again to use your journal."
					success="The device is signed out."
					revoke={() => authClient.revokeSession({ token: session.token })}
				/>
			)}
		</li>
	);
}

function RevokeOthersButton() {
	return (
		<ConfirmRevoke
			label={REVOKE_OTHERS}
			title={`${REVOKE_OTHERS}?`}
			description="All devices except this one must sign in again to use your journal."
			success="All other devices are signed out."
			revoke={() => authClient.revokeOtherSessions()}
		/>
	);
}

interface ConfirmRevokeProps {
	label: string;
	title: string;
	description: string;
	success: string;
	revoke: () => Promise<{ error: { message?: string } | null }>;
}

function ConfirmRevoke({
	label,
	title,
	description,
	success,
	revoke,
}: ConfirmRevokeProps) {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async () => {
			const { error } = await revoke();
			if (error) throw new Error(error.message ?? REQUEST_FAILED);
		},
		onSuccess: () => {
			toast.success(success);
			return queryClient.invalidateQueries({
				queryKey: [QueryKey.AuthSessions],
			});
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					disabled={mutation.isPending}
					className="justify-self-start"
				>
					{mutation.isPending && <Spinner />}
					{label}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={() => mutation.mutate()}
					>
						{label}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
