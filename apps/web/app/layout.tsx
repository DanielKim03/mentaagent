import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.WEB_ORIGIN?.split(",")[0]?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "MentaAgent — Your AI business analyst",
  description:
    "Connect your business files and get an AI analyst that tells you what your business is lacking and what to improve.",
  openGraph: {
    title: "MentaAgent — Your AI business analyst",
    description:
      "Connect your business files and get an AI analyst that tells you what your business is lacking and what to improve.",
    siteName: "MentaAgent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MentaAgent — Your AI business analyst",
    description:
      "Connect your business files and get an AI analyst that tells you what your business is lacking and what to improve.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
