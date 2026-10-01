export function wsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured.replace(/\/$/, "");
  const { protocol, hostname, port } = window.location;
  if (port === "3100") return `ws://${hostname}:8100`;
  return `${protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}
