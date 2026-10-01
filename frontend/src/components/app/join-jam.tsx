"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ALPHABET = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;

export function normalizeJamCode(value: string): string {
  return value.toUpperCase().replace(ALPHABET, "").slice(0, 6);
}

function display(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function JamCodeForm({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const ready = code.length === 6;
  return (
    <form
      className={cn("flex items-center gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) router.push(`/j/${code}`);
      }}
    >
      <input
        value={display(code)}
        onChange={(e) => setCode(normalizeJamCode(e.target.value))}
        placeholder="ABC-123"
        autoFocus={autoFocus}
        aria-label="Jam code"
        spellCheck={false}
        autoComplete="off"
        className="h-11 w-full min-w-0 rounded-2xl bg-fog px-4 font-mono text-[17px] tracking-[0.18em] text-ink uppercase outline-none placeholder:tracking-[0.18em] placeholder:text-slate-soft focus:bg-paper focus:ring-3 focus:ring-cobalt/25"
      />
      <Button type="submit" size="icon" disabled={!ready} aria-label="Join jam">
        <ArrowRight />
      </Button>
    </form>
  );
}

export function JoinJamButton({ size = "sm" }: { size?: "sm" | "xl" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} className={size === "sm" ? "h-9 shrink-0 px-3 sm:px-3.5" : undefined}>
          <span className="size-2 rounded-full bg-beacon" />
          {size === "sm" ? (
            <>
              <span className="sm:hidden">Join</span>
              <span className="max-sm:hidden">Join a jam</span>
            </>
          ) : (
            "Join a jam"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="px-1 pb-1">
          <div className="text-[15px] font-semibold tracking-tight">Join a jam</div>
          <p className="mt-1 text-[13px] leading-5 text-slate">Enter the 6-character code the host shared with you.</p>
        </div>
        <JamCodeForm autoFocus />
      </PopoverContent>
    </Popover>
  );
}
