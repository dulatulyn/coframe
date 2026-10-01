import { cn } from "@/lib/utils";

export type PresenceUser = { id: string; name: string; color: string; avatarUrl?: string | null };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function UserAvatar({
  user,
  size = 28,
  className,
  ring = true,
}: {
  user: PresenceUser;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      title={user.name}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-white",
        ring && "ring-2 ring-paper",
        className,
      )}
      style={{ width: size, height: size, background: user.color, fontSize: Math.round(size * 0.38) }}
    >
      {initials(user.name)}
      {user.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
    </span>
  );
}

export function Facepile({ users, max = 4, size = 28 }: { users: PresenceUser[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <UserAvatar key={u.id} user={u} size={size} />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-fog font-mono text-[11px] text-slate ring-2 ring-paper"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function RemoteCursor({ user, className }: { user: PresenceUser; className?: string }) {
  return (
    <div className={cn("pointer-events-none select-none", className)}>
      <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-sm">
        <path
          d="M2 1.5 16 9.2l-6.3 1.6-3.2 6.1Z"
          fill={user.color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="ml-3 -mt-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-medium leading-4 text-white shadow-sm"
        style={{ background: user.color }}
      >
        <UserAvatar user={user} size={16} ring={false} className="ring-1 ring-white/60" />
        {user.name}
      </span>
    </div>
  );
}
