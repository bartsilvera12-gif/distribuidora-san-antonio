import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import AppShell from "../components/AppShell";
import { ThemeProvider } from "../components/ThemeProvider";
import AuthGuard from "../components/AuthGuard";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  // Solo los pesos realmente usados (400/500/600/700). Antes cargaba 6 pesos;
  // el 300 (light) no se usa en ningún lado y el 800 (extrabold) solo en 1 logo
  // que con 700 se ve igual. Menos archivos de fuente = menos payload inicial.
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Distribuidora San Antonio",
  description: "Sistema de gestión — Distribuidora San Antonio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}