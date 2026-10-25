import type { Metadata } from "next";
import localFont from "next/font/local";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";
import { Providers } from "./providers";

// Host Grotesk v1.002 variable (wght 300–800) from Element Type's release; license in app/fonts/OFL.txt.
const hostGrotesk = localFont({
  src: [
    {
      path: "./fonts/HostGrotesk-Variable.woff2",
      weight: "300 800",
      style: "normal",
    },
    {
      path: "./fonts/HostGrotesk-Italic-Variable.woff2",
      weight: "300 800",
      style: "italic",
    },
  ],
  variable: "--font-host-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RollPay",
  description: "It checks the pay before the paycheck.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by THEME_SCRIPT before paint, so React must not own it.
    <html lang="en" className={hostGrotesk.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script, no user input (next docs: preventing flash before hydration). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
