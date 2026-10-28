import type { Metadata } from "next";
import "./globals.css";
import { prisma } from "@/lib/prisma";
import { CurrencyProvider } from "@/lib/currency";
import RouteProgress from "@/components/RouteProgress";
import AnnouncementBar from "@/components/AnnouncementBar";

export const metadata: Metadata = {
  title: "TraTopup — MLBB Diamond Top Up",
  description:
    "Top up Mobile Legends: Bang Bang Diamonds with secure KHQR payment. Fast and convenient top-up service in Cambodia.",
  keywords: [
    "MLBB diamonds",
    "Mobile Legends top up",
    "Mobile Legends Diamonds Cambodia",
    "KHQR",
    "Cambodia top up",
  ],
  openGraph: {
    title: "TraTopup — MLBB Diamond Top Up",
    description: "Instant MLBB diamond top-ups with KHQR",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);
  const exchangeRate = settings?.exchangeRate ?? 4100;

  return (
    <html lang="en">
      <body>
        <RouteProgress />
        <CurrencyProvider exchangeRate={exchangeRate}>
          <AnnouncementBar />
          {children}
        </CurrencyProvider>
      </body>
    </html>
  );
}
