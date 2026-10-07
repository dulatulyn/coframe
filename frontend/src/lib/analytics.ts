import { ANALYTICS_ENABLED } from "@/config/analytics";

type Params = Record<string, string | number | boolean | null | undefined>;
type Consent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const CONSENT_KEY = "coframe:analytics-consent";

function push(entry: unknown): void {
  if (!ANALYTICS_ENABLED || typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(entry);
}

function gtag(...args: unknown[]): void {
  if (!ANALYTICS_ENABLED || typeof window === "undefined") return;
  window.gtag?.(...args);
}

export function track(event: string, params: Params = {}): void {
  push({ event, ...params });
}

const PAGE_TYPES: [RegExp, string][] = [
  [/^\/$/, "landing"],
  [/^\/(login|signup)$/, "auth"],
  [/^\/app$/, "home"],
  [/^\/w\/[^/]+\/settings$/, "workspace_settings"],
  [/^\/w\/[^/]+$/, "workspace"],
  [/^\/p\/[^/]+\/map$/, "process_map"],
  [/^\/p\/[^/]+\/[^/]+$/, "diagram"],
  [/^\/p\/[^/]+$/, "project"],
  [/^\/v\/[^/]+$/, "public_view"],
  [/^\/invite\/[^/]+$/, "invite"],
  [/^\/j\/[^/]+$/, "jam_join"],
  [/^\/settings/, "settings"],
];

export function pageType(pathname: string): string {
  return PAGE_TYPES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "other";
}

export function sanitizePath(pathname: string): string {
  return pathname
    .replace(/^\/(v|invite|j)\/[^/]+/, "/$1/:token")
    .replace(/^\/p\/[^/]+\/map$/, "/p/:project/map")
    .replace(/^\/p\/[^/]+\/[^/]+$/, "/p/:project/:diagram")
    .replace(/^\/p\/[^/]+$/, "/p/:project")
    .replace(/^\/w\/[^/]+/, "/w/:workspace");
}

export function trackPage(pathname: string, title: string, embedded: boolean): void {
  const path = sanitizePath(pathname);
  push({
    event: "coframe_page_view",
    page_type: pageType(pathname),
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: title,
    embedded,
  });
}

export function storedConsent(): Consent | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    return;
  }
  gtag("consent", "update", { analytics_storage: value });
  track("consent_update", { analytics_storage: value });
}

export function consentDefaults(): string {
  return `window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};var gtag=window.gtag;
var c=null;try{c=localStorage.getItem(${JSON.stringify(CONSENT_KEY)});}catch(e){}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:c==='granted'?'granted':'denied',wait_for_update:500});
gtag('set','url_passthrough',false);gtag('set','ads_data_redaction',true);`;
}
