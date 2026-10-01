"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Workspace } from "@/lib/api/types";

import { SaveWorkButton } from "./guest";
import { JoinJamButton } from "./join-jam";
import { LogoMark } from "./logo";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppHeader({ workspace }: { workspace: Workspace | undefined }) {
  const [searching, setSearching] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href="/app" aria-label="Home" className="shrink-0 text-ink">
          <LogoMark />
        </Link>
        <span className="hidden h-5 w-px bg-hairline sm:block" />
        <div className="min-w-0 shrink">
          <WorkspaceSwitcher current={workspace} />
        </div>
        <div className="hidden flex-1 justify-center px-2 md:flex">
          {workspace && <SearchBox workspaceId={workspace.id} className="w-full max-w-[520px]" />}
        </div>
        <div className="flex-1 md:hidden" />
        {workspace && (
          <button
            type="button"
            aria-label={searching ? "Close search" : "Search"}
            onClick={() => setSearching((v) => !v)}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-fog md:hidden"
          >
            {searching ? <X className="size-[18px]" /> : <Search className="size-[18px]" strokeWidth={1.75} />}
          </button>
        )}
        <SaveWorkButton className="hidden lg:inline-flex" />
        <JoinJamButton />
        <UserMenu />
      </div>
      {searching && workspace && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBox workspaceId={workspace.id} className="w-full" />
        </div>
      )}
    </header>
  );
}
