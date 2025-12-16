import {
  Calendar,
  ChevronUp,
  Home,
  Inbox,
  LogOut,
  Search,
  Settings,
  User2,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "./ui/separator";
import { Spinner } from "./ui/spinner";

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Journal",
    url: "/journal",
    icon: Inbox,
  },
  {
    title: "Calendar",
    url: "/calendar",
    icon: Calendar,
  },
];

const footerItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const session = authClient.useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.navigate({ to: "/sign-in" });
        },
      },
    });
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {footerItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild>
              <Link to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        <Separator />
        <div className="h-16">
          {session.isPending ||
            (!session.data && (
              <div className="p-4  h-16">
                <Spinner />
              </div>
            ))}
          {!session.isPending && session.data && (
            <>
              <div className="h-16">
                <SidebarMenu className="w-full">
                  <SidebarMenuItem className="w-full">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="w-full min-w-0">
                        <SidebarMenuButton className="h-14">
                          <div className="h-8 w-8 rounded-full bg-linear-to-tr  flex items-center justify-center  font-bold overflow-hidden">
                            {session.data.user.image ? (
                              <img
                                src={session.data.user.image}
                                alt={session.data.user.name || "User"}
                                className="w-8 h-8 object-cover"
                              />
                            ) : (
                              session.data.user.name?.charAt(0) || "U"
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium  truncate">
                              {session.data.user.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {session.data.user.email}
                            </p>
                          </div>
                          <ChevronUp className="ml-auto" />
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg flex flex-col  gap-2 "
                      >
                        <Link to="/profile">
                          <DropdownMenuItem className="w-full min-w-0">
                            Profile
                          </DropdownMenuItem>
                        </Link>

                        <Separator />

                        <Button
                          onClick={handleSignOut}
                          variant="outline"
                          className="w-full flex items-center gap-3 px-4 py-2 text-red-400 rounded-lg transition-colors text-sm"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sign Out</span>
                        </Button>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
