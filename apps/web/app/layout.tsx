import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup";

export const metadata: Metadata = {
  title: "MentaAgent — Your AI business analyst",
  description:
    "Connect your business files and get an AI analyst that tells you what your business is lacking and what to improve.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ServiceWorkerCleanup />
        {children}
      </body>
    </html>
  );
}
