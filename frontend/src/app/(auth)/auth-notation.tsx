import { RemoteCursor } from "@/components/editor-chrome/presence";

export function AuthNotation() {
  return (
    <div className="relative w-[min(560px,90%)]">
      <svg viewBox="0 0 560 300" className="w-full text-ink" fill="none" stroke="currentColor" strokeWidth="2">
        <defs>
          <marker id="auth-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 10 5 0 10Z" fill="currentColor" stroke="none" />
          </marker>
        </defs>
        <rect x="8" y="30" width="544" height="240" rx="2" strokeWidth="1.6" />
        <path d="M40 30v240" strokeWidth="1.6" />
        <text x="24" y="150" fontSize="13" transform="rotate(-90 24 150)" textAnchor="middle" fill="currentColor" stroke="none">
          Team
        </text>
        <circle cx="84" cy="150" r="17" />
        <path d="M101 150h41" markerEnd="url(#auth-arrow)" />
        <rect x="146" y="120" width="104" height="60" rx="10" fill="var(--paper)" />
        <text x="198" y="155" fontSize="13" textAnchor="middle" fill="currentColor" stroke="none">
          Draft process
        </text>
        <path d="M250 150h40" markerEnd="url(#auth-arrow)" />
        <path d="M318 122l28 28-28 28-28-28Z" fill="var(--paper)" />
        <path d="M308 140l20 20M328 140l-20 20" strokeWidth="3" />
        <path d="M346 150h48" markerEnd="url(#auth-arrow)" />
        <text x="352" y="142" fontSize="12" fill="currentColor" stroke="none">
          approved
        </text>
        <rect x="398" y="120" width="104" height="60" rx="10" fill="var(--paper)" />
        <text x="450" y="155" fontSize="13" textAnchor="middle" fill="currentColor" stroke="none">
          Publish
        </text>
        <path d="M318 178v52h110" />
        <path d="M502 150h14" />
        <circle cx="528" cy="150" r="12" strokeWidth="4" fill="var(--paper)" />
        <text x="332" y="224" fontSize="12" fill="currentColor" stroke="none">
          changes
        </text>
        <path d="M428 230V184" markerEnd="url(#auth-arrow)" />
      </svg>
      <RemoteCursor
        user={{ id: "a", name: "Aigerim", color: "#8E4EC6" }}
        className="absolute left-[46%] top-[60%] animate-[float_6s_ease-in-out_infinite]"
      />
      <RemoteCursor
        user={{ id: "b", name: "Timur", color: "#30A46C" }}
        className="absolute left-[74%] top-[20%] animate-[float_7s_ease-in-out_infinite_reverse]"
      />
      <style>{`@keyframes float { 0%,100% { transform: translate(0,0) } 50% { transform: translate(14px,-10px) } }`}</style>
    </div>
  );
}
