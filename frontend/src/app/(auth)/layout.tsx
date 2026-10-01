import { Logo } from "@/components/app/logo";
import { AuthNotation } from "./auth-notation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Logo />
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
      </div>
      <aside className="hidden p-3 lg:block">
        <div className="dot-grid relative flex h-full items-center justify-center overflow-hidden rounded-[32px] border border-hairline">
          <AuthNotation />
        </div>
      </aside>
    </div>
  );
}
