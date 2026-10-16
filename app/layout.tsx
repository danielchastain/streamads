import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamAds",
  description: "Sell ad space on your Twitch stream automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
