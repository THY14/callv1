import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Khmer } from "next/font/google";
import "@livekit/components-styles";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Khmer names and messages: only downloaded when Khmer text is on screen
const khmer = Noto_Sans_Khmer({
  subsets: ["khmer"],
  weight: ["400", "500", "600"],
  variable: "--font-khmer",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Voice Community",
  description: "Discord-style voice channels for up to 10 people",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets us pad around the iPhone notch / home bar
  themeColor: "#0e0d0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${khmer.variable}`}>
      <body>{children}</body>
    </html>
  );
}
