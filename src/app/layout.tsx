import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TORQ Bearings | Customer Account",
  description: "Secure customer account access for TORQ Bearings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
