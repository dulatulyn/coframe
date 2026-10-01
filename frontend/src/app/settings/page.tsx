"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/editor-chrome/presence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { useMe, useUpdateMe } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const COLORS = ["#E5484D", "#F76B15", "#FFB224", "#30A46C", "#12A594", "#0090FF", "#3E63DD", "#8E4EC6", "#D6409F", "#978365"];

export default function AccountSettings() {
  const { data: me } = useMe();
  const update = useUpdateMe();
  const [color, setColor] = useState<string | null>(null);

  if (!me) return null;
  const current = color ?? me.color;

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-10 sm:px-6">
        <Link href="/app" className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[14px] text-slate hover:text-ink">
          <ArrowLeft className="size-4" /> Back to projects
        </Link>
        <h1 className="display mt-6 text-[44px]">Account</h1>

        <form
          className="mt-10 grid gap-6 rounded-[28px] bg-fog p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
            try {
              await update.mutateAsync({ name, color: current });
              toast.success("Profile saved");
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <div className="flex items-center gap-4">
            <UserAvatar user={{ ...me, color: current }} size={56} ring={false} />
            <div>
              <div className="text-[17px] font-semibold">{me.name}</div>
              <div className="text-[14px] text-slate">{me.isGuest ? "Guest" : me.email}</div>
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-[13px] font-medium">Name</span>
            <Input name="name" defaultValue={me.name} maxLength={200} required className="bg-paper" />
          </label>
          <div className="grid gap-2">
            <span className="text-[13px] font-medium">Cursor color</span>
            <span className="text-[13px] text-slate">Others see your pointer and selections in this color during a jam.</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn("size-8 rounded-full transition-transform hover:scale-110", current.toUpperCase() === c && "ring-2 ring-ink ring-offset-2")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Button type="submit" disabled={update.isPending}>
              Save profile
            </Button>
          </div>
        </form>

        {me.isGuest ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-hairline p-6">
            <div>
              <h2 className="text-[17px] font-semibold">You&apos;re a guest</h2>
              <p className="mt-1 text-[14px] text-slate">Create an account to keep your diagrams and log in from anywhere.</p>
            </div>
            <Button asChild>
              <Link href="/signup?next=/settings">Sign up</Link>
            </Button>
          </div>
        ) : (
        <form
          className="mt-6 grid gap-5 rounded-[28px] border border-hairline p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await update.mutateAsync({
                currentPassword: me.hasPassword ? String(form.get("current") ?? "") : undefined,
                newPassword: String(form.get("next") ?? ""),
              });
              (e.target as HTMLFormElement).reset();
              toast.success(me.hasPassword ? "Password changed" : "Password set");
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <div>
            <h2 className="text-[17px] font-semibold">{me.hasPassword ? "Change password" : "Set a password"}</h2>
            {!me.hasPassword && (
              <p className="mt-1 text-[14px] text-slate">You signed up with Google. Add a password to also log in with your email.</p>
            )}
          </div>
          {me.hasPassword && (
            <label className="grid gap-2">
              <span className="text-[13px] font-medium">Current password</span>
              <Input name="current" type="password" autoComplete="current-password" required />
            </label>
          )}
          <label className="grid gap-2">
            <span className="text-[13px] font-medium">New password</span>
            <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
            <span className="text-[12px] text-slate">At least 8 characters.</span>
          </label>
          <div>
            <Button type="submit" variant="outline" disabled={update.isPending}>
              {me.hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>
        )}
      </main>
    </div>
  );
}
