"use client";

import Link from "next/link";

import type { Workspace } from "@/lib/api/types";

import { SaveWorkButton } from "./guest";
import { JoinJamButton } from "./join-jam";
import { LogoMark } from "./logo";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppHeader({ workspace }: { workspace: Workspace | undefined }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href="/app" aria-label="Home" className="shrink-0 text-ink">
          <LogoMark />
        </Link>
        <span className="h-5 w-px bg-hairline" />
        <WorkspaceSwitcher current={workspace} />
        <div className="flex flex-1 justify-center px-2">
          {workspace && <SearchBox workspaceId={workspace.id} className="w-full max-w-[520px]" />}
        </div>
        <SaveWorkButton className="hidden md:inline-flex" />
        <JoinJamButton />
        <UserMenu />
      </div>
    </header>
  );
}
