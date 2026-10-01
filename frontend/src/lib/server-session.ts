import { cookies } from "next/headers";

import type { User } from "@/lib/api/types";

const API_URL = process.env.API_URL ?? "http://localhost:8100";

export async function currentUser(): Promise<User | null> {
  const sid = (await cookies()).get("sid")?.value;
  if (!sid) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { headers: { cookie: `sid=${sid}` }, cache: "no-store" });
    return res.ok ? ((await res.json()) as User) : null;
  } catch {
    return null;
  }
}
