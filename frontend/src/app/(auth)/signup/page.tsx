import { redirect } from "next/navigation";
import { Suspense } from "react";

import { safeNext } from "@/lib/next-url";
import { currentUser } from "@/lib/server-session";

import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const me = await currentUser();
  if (me && !me.isGuest) redirect(safeNext(typeof next === "string" ? next : null));
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
