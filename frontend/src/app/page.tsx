import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { TryAsGuestButton } from "@/components/app/guest";
import { JoinJamButton } from "@/components/app/join-jam";
import { Logo } from "@/components/app/logo";
import { CATALOG } from "@/components/bpmn/catalog";
import { Glyph } from "@/components/bpmn/glyphs";
import { FilesPanel } from "@/components/editor-chrome/files-panel";
import { Facepile, RemoteCursor } from "@/components/editor-chrome/presence";
import { JamChip } from "@/components/editor-chrome/status";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { currentUser } from "@/lib/server-session";

import { AIGERIM, DANA, FILES, FOLDERS, ME, PRESENCE, TIMUR } from "./mockups/_components/mock-data";
import { LandingCanvas } from "./landing-canvas";

export default async function Landing() {
  const me = await currentUser();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-4 z-40 px-4">
        <nav className="mx-auto flex h-16 max-w-[880px] items-center gap-4 rounded-full bg-fog/90 pl-5 pr-2 backdrop-blur-md">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            <Link href="#notation" className="hidden rounded-full px-4 py-2 text-[15px] font-medium hover:bg-paper sm:block">
              Notation
            </Link>
            <Link href="#jam" className="hidden rounded-full px-4 py-2 text-[15px] font-medium hover:bg-paper sm:block">
              Jam
            </Link>
            {me ? (
              <Button asChild size="lg" className="h-12">
                <Link href="/app">
                  Open {APP_NAME} <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-4 py-2 text-[15px] font-medium hover:bg-paper">
                  Log in
                </Link>
                <Button asChild size="lg" className="h-12">
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-24 text-center sm:pt-32">
          <div className="mx-auto mb-8 flex w-fit items-center gap-3 rounded-full border border-hairline py-1.5 pl-1.5 pr-4 text-[14px]">
            <Facepile users={[ME, AIGERIM, TIMUR, DANA]} size={26} />
            <span className="text-slate">Four people are editing this diagram</span>
          </div>
          <h1 className="display mx-auto max-w-[980px] text-[56px] sm:text-[88px] lg:text-[104px]">
            Model processes. Together.
          </h1>
          <p className="mx-auto mt-7 max-w-[640px] text-[19px] leading-8 text-slate">
            The BPMN 2.0 editor your whole team can draw in at once. Standard notation, live cursors, and projects
            organized in folders. Everything saves as you go.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="xl">
              <Link href={me ? "/app" : "/signup"}>
                Start modeling <ArrowRight />
              </Link>
            </Button>
            <JoinJamButton size="xl" />
          </div>
          {!me && (
            <div className="mt-4 flex justify-center">
              <TryAsGuestButton variant="ghost" className="text-slate hover:text-ink">
                or try it without an account
              </TryAsGuestButton>
            </div>
          )}
        </section>

        <section className="px-3 sm:px-6">
          <div className="mx-auto max-w-[1360px] rounded-[40px] bg-fog p-2 sm:p-3">
            <div className="dot-grid relative h-[560px] overflow-hidden rounded-[32px] border border-hairline sm:h-[660px]">
              <LandingCanvas presence={PRESENCE} />
              <div className="absolute left-5 top-5 flex h-11 items-center gap-2 rounded-full border border-hairline bg-paper pl-4 pr-3 text-[14px] shadow-float">
                <span className="text-slate">Operations /</span>
                <span className="font-semibold">Order to cash</span>
              </div>
              <div className="absolute right-5 top-5 flex h-11 items-center gap-2 rounded-full border border-hairline bg-paper pl-2 pr-2 shadow-float">
                <Facepile users={[AIGERIM, TIMUR]} size={28} />
                <JamChip code="K7MQ2P" />
              </div>
            </div>
          </div>
        </section>

        <section id="notation" className="mx-auto max-w-[1200px] scroll-mt-28 px-6 pt-32">
          <p className="text-[15px] text-slate">Notation</p>
          <h2 className="display mt-3 max-w-[820px] text-[44px] sm:text-[60px]">Every BPMN 2.0 element, by its proper name.</h2>
          <p className="mt-5 max-w-[640px] text-[17px] leading-7 text-slate">
            Events, activities, gateways, data, pools and lanes, drawn exactly as the standard defines them. Pick
            the precise variant from the toolbar or search all elements with <span className="keycap">N</span>.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.filter((g) => ["start", "intermediate", "end", "gateway", "task", "subprocess"].includes(g.id)).map((group) => (
              <div key={group.id} className="rounded-[28px] bg-fog p-2">
                <div className="px-4 pb-2 pt-3 text-[13px] font-medium text-slate">{group.label}</div>
                <div className="flex flex-col gap-1 rounded-[22px] bg-paper p-2">
                  {group.items.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex h-11 items-center gap-3 rounded-xl px-2 text-[15px]">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-hairline">
                        <Glyph kind={item.glyph} size={22} />
                      </span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="jam" className="mx-auto max-w-[1200px] scroll-mt-28 px-6 pt-32">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[15px] text-slate">Jam</p>
              <h2 className="display mt-3 text-[44px] sm:text-[60px]">Share a code. Draw together.</h2>
              <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-slate">
                Start a jam and anyone with the code or link joins in seconds. You see every cursor with a name and a
                face, and every change as it happens. When the session is over, add the people you worked with to your
                workspace in one click.
              </p>
            </div>
            <div className="relative rounded-[36px] bg-fog p-8 sm:p-10">
              <span className="inline-flex items-center gap-2 text-[14px] font-medium">
                <span className="size-2 rounded-full bg-beacon" /> Live jam
              </span>
              <div className="mt-4 font-mono text-[56px] font-medium tracking-[0.12em] sm:text-[72px]">K7M-Q2P</div>
              <div className="mt-6 flex items-center gap-3 rounded-full bg-paper p-2 pr-4">
                <Facepile users={[ME, AIGERIM, TIMUR]} size={32} />
                <span className="text-[14px] text-slate">3 people in the jam</span>
              </div>
              <RemoteCursor user={AIGERIM} className="absolute right-16 top-10" />
              <RemoteCursor user={TIMUR} className="absolute bottom-24 right-8" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 pt-32">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div className="order-2 rounded-[36px] bg-fog p-3 lg:order-1">
              <FilesPanel
                projectName="Operations"
                folders={FOLDERS}
                files={FILES.slice(0, 4)}
                activeFileId="d1"
                trashCount={2}
                className="h-[520px] rounded-[28px] border border-hairline bg-paper"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-[15px] text-slate">Projects</p>
              <h2 className="display mt-3 text-[44px] sm:text-[60px]">Folders and files, like you&apos;d expect.</h2>
              <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-slate">
                Keep every process of a project in one place. Nest folders, drag diagrams around, switch between a list
                and numbered thumbnails, and restore anything from the trash.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 py-32 text-center">
          <h2 className="display mx-auto max-w-[760px] text-[44px] sm:text-[64px]">Your next process starts here.</h2>
          <div className="mt-10 flex justify-center">
            <Button asChild size="xl">
              <Link href={me ? "/app" : "/signup"}>
                {me ? "Open your projects" : "Create a free account"} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[14px] text-slate">
          <Logo />
          <span>
            © {new Date().getFullYear()} {APP_NAME}. BPMN rendering by bpmn.io.
          </span>
        </div>
      </footer>
    </div>
  );
}
