import type { Metadata, Viewport } from "next";
import "@livekit/components-styles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Community",
  description: "Discord-style voice channels for up to 10 people",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets us pad around the iPhone notch / home bar
  themeColor: "#1e1f22",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
