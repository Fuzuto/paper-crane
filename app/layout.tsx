import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({
  src: [
    { path: "../public/fonts/cormorant-regular.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/cormorant-italic.woff2", weight: "500", style: "italic" },
  ],
  variable: "--font-display", display: "swap",
});
const sans = localFont({ src: "../public/fonts/dm-sans.woff2", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Paper Crane | A Thousand Folds, A Thousand Wishes",
  description: "A quiet space to fold a digital paper crane, write a wish, and begin your thousand cranes journey. Made by you, one fold at a time.",
  applicationName: "Paper Crane",
};
export const viewport: Viewport = { themeColor: "#f7f5ef", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${sans.variable}`}><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
