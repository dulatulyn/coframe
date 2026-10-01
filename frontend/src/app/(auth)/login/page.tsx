import { redirect } from "next/navigation";
import { Suspense } from "react";

import { safeNext } from "@/lib/next-url";
import { currentUser } from "@/lib/server-session";

import { AuthForm } from "../auth-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const me = await currentUser();
  if (me && !me.isGuest) redirect(safeNext(typeof next === "string" ? next : null));
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
