"use client";

import { LogIn, LogOut, Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { UserAvatar } from "@/components/editor-chrome/presence";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useMe } from "@/lib/api/hooks";

export function UserMenu() {
  const { data: me } = useMe();
  const logout = useLogout();
  const router = useRouter();
  if (!me) return <span className="size-9 rounded-full bg-fog" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-cobalt/40">
        <UserAvatar user={me} size={36} ring={false} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <UserAvatar user={me} size={36} ring={false} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{me.name}</div>
            <div className="truncate text-[12px] text-slate">{me.isGuest ? "Guest" : me.email}</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        {me.isGuest && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/signup">
                <UserPlus /> Sign up to keep your work
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogIn /> Log in to an account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await logout.mutateAsync();
            router.replace("/login");
          }}
        >
          <LogOut /> {me.isGuest ? "End guest session" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
