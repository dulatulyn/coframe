import type { Metadata } from "next";
import { Geist_Mono, Onest } from "next/font/google";

import { Analytics, AnalyticsNoScript } from "@/components/app/analytics";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";

import "./globals.css";
import { Providers } from "./providers";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${onest.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AnalyticsNoScript />
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
