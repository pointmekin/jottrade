// src/components/bottom-nav.tsx
import { LogOut } from "lucide-react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function BottomNav() {
  const location = useLocation();
  const router = useRouter();
  const session = authClient.useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(`${url}/`);

  const handleSignOut = async () => {
    setSheetOpen(false);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.navigate({ to: "/sign-in" }),
      },
    });
  };

  const userInitial = session.data?.user.name?.charAt(0).toUpperCase() ?? "U";
  const userImage = session.data?.user.image;

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden border-t border-zinc-800/60 bg-sidebar"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => (
          <Link
            key={item.title}
            to={item.url}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
              isActive(item.url)
                ? "text-sidebar-primary"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] leading-none">{item.title}</span>
          </Link>
        ))}

        {/* User avatar — opens account sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open account menu"
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
            {userImage ? (
              <img
                src={userImage}
                alt={session.data?.user.name ?? "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[8px] font-semibold">{userInitial}</span>
            )}
          </div>
          <span className="text-[10px] leading-none">Account</span>
        </button>
      </nav>

      {/* Account sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="bg-sidebar text-sidebar-foreground border-zinc-800/60">
          <SheetHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
                {userImage ? (
                  <img
                    src={userImage}
                    alt={session.data?.user.name ?? "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold">{userInitial}</span>
                )}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-medium truncate">
                  {session.data?.user.name}
                </SheetTitle>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {session.data?.user.email}
                </p>
              </div>
            </div>
          </SheetHeader>

          <Separator className="bg-zinc-800/60" />

          <div className="flex flex-col gap-1 p-2">
            <Link
              to="/profile"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
            >
              Profile
            </Link>
          </div>

          <Separator className="bg-zinc-800/60" />

          <div className="p-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
