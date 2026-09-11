import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return (
			<div className="flex items-center justify-center h-screen w-full">
				<Spinner className="size-10" />
			</div>
		);
	}

	if (!session) {
		return <Navigate to="/sign-in" />;
	}

	return <Outlet />;
}
