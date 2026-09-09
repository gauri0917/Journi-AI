import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journi — Journey Builder",
  description: "Self-serve B2B deal journey configuration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading cookies() here (in the root layout) makes every page dynamic —
  // acceptable here since nearly every page already queries Prisma directly
  // and was never a static-generation candidate anyway.
  const guestName = cookies().get("journi_user")?.value;
  const decodedName = guestName ? decodeURIComponent(guestName) : null;

  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-ink antialiased">
        <header className="border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold tracking-tight text-route-700">
                journi<span className="text-route-400">/</span>
              </span>
              <span className="text-xs text-neutral-400">deal journey config</span>
            </Link>
            <div className="flex items-center gap-4">
              {decodedName && (
                <form action="/api/auth/logout" method="POST" className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>
                    Guest: <span className="font-medium text-ink">{decodedName}</span>
                  </span>
                  <button type="submit" className="text-route-600 hover:underline">
                    Switch
                  </button>
                </form>
              )}
              <Link href="/deals" className="text-sm font-medium text-neutral-600 hover:text-route-700">
                Deals
              </Link>
              <Link
                href="/journeys/new"
                className="rounded-md bg-route-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-route-700"
              >
                New journey
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
