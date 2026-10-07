import type { Metadata } from "next";
import { Barlow_Condensed, Georama, Geist, Geist_Mono, IBM_Plex_Mono, Rajdhani } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const georama = Georama({
  variable: "--font-georama",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Tenax judge-journey typography: tall condensed display headings +
// technical monospaced interface voice. Loaded weights match the
// utilities in use (600/700 display, 400–600 mono); heavier utilities
// resolve to the nearest loaded weight without synthesis.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Tenax — Bounded Autonomy for Tokenized Equities",
  description:
    "Give AI permission to act — not unlimited control of your capital. Standing protection mandates with deterministic authority gates for tokenized equities.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${georama.variable} ${rajdhani.variable} ${barlowCondensed.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
