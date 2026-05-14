/**
 * @file Root layout — applies global fonts and metadata to every page.
 *
 * Loads two variable fonts via next/font/google (Fraunces for display text,
 * DM Sans for body copy) and exposes them as CSS custom properties
 * (--font-fraunces, --font-dm-sans) consumed throughout globals.css.
 * The html and body elements are sized to fill the viewport so the single-page
 * chat layout can use h-full without extra wrapper divs.
 */

import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PartSelect AI Assistant",
  description:
    "Get expert help finding refrigerator and dishwasher parts, checking compatibility, and troubleshooting appliance problems.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${fraunces.variable} ${dmSans.variable}`}>
      <body className="h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
