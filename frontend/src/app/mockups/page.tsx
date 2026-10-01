import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Editor layouts" };

const OPTIONS = [
  {
    href: "/mockups/a",
    tag: "A",
    title: "Floating",
    text: "The canvas takes the whole screen. Files, inspector and the notation dock float over it as islands and can be hidden.",
    image: "/mockups/a.png",
  },
  {
    href: "/mockups/b",
    tag: "B",
    title: "Studio",
    text: "Docked panels around a framed canvas. Files as numbered thumbnails on the left, notation ribbon on top, inspector on the right.",
    image: "/mockups/b.png",
  },
];

export default function MockupsIndex() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-16">
      <p className="text-[14px] text-slate">Editor layout · pick one</p>
      <h1 className="display mt-3 max-w-3xl text-[56px]">Two ways to arrange the editor.</h1>
      <p className="mt-4 max-w-2xl text-[17px] leading-7 text-slate">
        Both keep the BPMN notation exactly as the standard defines it and the same interactions: drag
        elements in, append next to a shape, keyboard shortcuts. They differ in how the interface sits
        around the canvas. The canvas inside each layout is live: pan and zoom it.
      </p>
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="group flex flex-col rounded-[28px] bg-fog p-2 transition-colors hover:bg-fog-strong"
          >
            <div className="aspect-[16/10] overflow-hidden rounded-[22px] border border-hairline bg-paper">
              <img src={o.image} alt={`${o.title} layout preview`} className="size-full object-cover object-left-top" />
            </div>
            <div className="flex items-start gap-3 px-4 pb-4 pt-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-[13px] text-paper">
                {o.tag}
              </span>
              <div className="flex-1">
                <div className="text-[20px] font-semibold tracking-tight">{o.title}</div>
                <p className="mt-1 text-[15px] leading-6 text-slate">{o.text}</p>
              </div>
              <ArrowUpRight className="size-5 text-slate transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
