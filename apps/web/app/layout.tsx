import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Studio OS",
  description: "Business management for photographers & videographers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                Studio OS
              </Link>
              <Link
                href="/clients"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Clients
              </Link>
              <Link
                href="/bookings"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Bookings
              </Link>
              <Link
                href="/availability"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Availability
              </Link>
              <Link
                href="/book"
                className="ml-auto text-sm text-slate-400 hover:text-slate-600"
              >
                Public booking page ↗
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
