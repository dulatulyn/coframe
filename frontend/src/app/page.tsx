import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { TryAsGuestButton } from "@/components/app/guest";
import { JoinJamButton } from "@/components/app/join-jam";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { currentUser } from "@/lib/server-session";

import editorShot from "./landing-editor.png";

export default async function Landing() {
  const me = await currentUser();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <header className="flex h-16 shrink-0 items-center gap-3 px-5 sm:px-8">
        <Logo />
        <nav className="ml-auto flex items-center gap-1">
          {me ? (
            <Button asChild size="sm" className="h-10 px-4">
              <Link href="/app">
                Open {APP_NAME} <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Link href="/login" className="rounded-full px-3.5 py-2 text-[14px] font-medium hover:bg-fog">
                Log in
              </Link>
              <Button asChild size="sm" className="h-10 px-4">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-8 px-5 pb-5 sm:px-8 sm:pb-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:grid-rows-1 lg:gap-12">
        <section className="flex flex-col justify-center pt-4 lg:pt-0">
          <p className="text-[13px] font-medium text-slate">Free · Built on bpmn.io</p>
          <h1 className="display mt-3 text-[44px] sm:text-[56px] xl:text-[72px]">Model processes. Together.</h1>
          <p className="mt-5 max-w-[460px] text-[16px] leading-7 text-slate sm:text-[17px]">
            A free BPMN 2.0 editor for teams. Share a link and draw the same diagram live, with everyone&apos;s cursor on
            the canvas. Diagrams save as you go.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Button asChild size="lg">
              <Link href={me ? "/app" : "/signup"}>
                Start modeling <ArrowRight />
              </Link>
            </Button>
            {me ? <JoinJamButton size="sm" /> : <TryAsGuestButton size="lg" />}
          </div>
          {!me && (
            <div className="mt-4 flex items-center gap-2 text-[14px] text-slate">
              Have a code? <JoinJamButton size="sm" />
            </div>
          )}
        </section>

        <section className="relative min-h-0 overflow-hidden rounded-[24px] border border-hairline bg-canvas shadow-float sm:rounded-[28px]">
          <Image
            src={editorShot}
            alt="The Coframe editor with two collaborators editing an order-to-cash process"
            fill
            priority
            sizes="(min-width: 1024px) 62vw, 100vw"
            className="object-cover object-left-top"
          />
        </section>
      </main>

      <footer className="hidden shrink-0 items-center justify-between px-8 pb-4 text-[12px] text-slate sm:flex">
        <span>
          Diagrams are rendered by{" "}
          <a href="https://bpmn.io" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
            bpmn.io
          </a>
        </span>
        <span>
          © {new Date().getFullYear()} {APP_NAME}
        </span>
      </footer>
    </div>
  );
}
