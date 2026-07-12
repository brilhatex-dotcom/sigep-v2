import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import RegistrarSW from "@/components/RegistrarSW";
import LiveRefresh from "@/components/LiveRefresh";

export const metadata: Metadata = {
  title: "SIGEP 18º BPM",
  description: "Sistema de Gestão de Pessoal — 18º Batalhão de Polícia Militar",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SIGEP",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#08111F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
        <RegistrarSW />
        <LiveRefresh />
      </body>
    </html>
  );
}