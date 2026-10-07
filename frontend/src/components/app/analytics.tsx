"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ANALYTICS_ENABLED, GA_ID, GTM_ID } from "@/config/analytics";
import { consentDefaults, setConsent, storedConsent, trackPage } from "@/lib/analytics";

function PageViews() {
  const pathname = usePathname();
  const embedded = useSearchParams().get("embed") === "1";
  useEffect(() => {
    const timer = setTimeout(() => trackPage(pathname, document.title, embedded), 300);
    return () => clearTimeout(timer);
  }, [pathname, embedded]);
  return null;
}

function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const embedded = useSearchParams().get("embed") === "1";

  useEffect(() => {
    const timer = setTimeout(() => setVisible(storedConsent() === null), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || embedded) return null;
  const choose = (value: "granted" | "denied") => {
    setConsent(value);
    setVisible(false);
  };
  return (
    <div
      role="dialog"
      aria-label="Analytics"
      className="fixed bottom-3 left-3 z-[70] w-[min(360px,calc(100vw-24px))] rounded-[20px] border border-hairline bg-paper p-4 shadow-pop"
    >
      <p className="text-[13px] leading-5">
        We use Google Analytics to see which pages and features people use, so we know what to improve. No ads, and
        diagram content never leaves Coframe.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => choose("denied")}>
          No thanks
        </Button>
        <Button size="sm" onClick={() => choose("granted")}>
          Allow
        </Button>
      </div>
    </div>
  );
}

export function Analytics() {
  if (!ANALYTICS_ENABLED) return null;
  return (
    <>
      <Script id="gtm-consent" strategy="beforeInteractive">
        {consentDefaults()}
      </Script>
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});`}
      </Script>
      {GA_ID && (
        <>
          <Script id="ga4" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
          <Script id="ga4-config" strategy="afterInteractive">
            {`gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)},{send_page_view:false});`}
          </Script>
        </>
      )}
      <Suspense>
        <PageViews />
        <ConsentBanner />
      </Suspense>
    </>
  );
}

export function AnalyticsNoScript() {
  if (!ANALYTICS_ENABLED) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
