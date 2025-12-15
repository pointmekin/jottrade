import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({
        to: "/sign-in",
      });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Outlet />
  );
}
