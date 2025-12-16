import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";

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

  return (
    <Outlet />
  );
}
