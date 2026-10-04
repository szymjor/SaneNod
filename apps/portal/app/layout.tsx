import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PwaRegistration } from "../components/pwa";
import "./globals.css";
export const metadata: Metadata = {
  title: "SaneNod — Twoja przestrzeń aplikacji",
  description:
    "Jedno konto. Połączone urządzenia. Aplikacje, które współpracują.",
  applicationName: "SaneNod",
  appleWebApp: { capable: true, title: "SaneNod" },
};
export const viewport: Viewport = { themeColor: "#15251f" };
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <header className="nav">
          <Link className="brand" href="/">
            ◉ SaneNod
          </Link>
          <nav aria-label="Główna nawigacja">
            <Link href="/dashboard">Pulpit</Link>
            <Link href="/pair">Urządzenia</Link>
            <Link href="/auth">Konto</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>SaneNod · Jedno konto, wiele możliwości</footer>
        <PwaRegistration />
      </body>
    </html>
  );
}
