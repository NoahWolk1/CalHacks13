import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Coordinate: AI agents that research any place",
  description: "Draw a region, ask a question, and watch a swarm of AI agents explore it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0e0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Extensions like Grammarly add attributes to <body> before React hydrates. */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>{children}</body>
    </html>
  );
}
