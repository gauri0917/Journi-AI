import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "journi_user";
const PUBLIC_PATHS = ["/login", "/api/auth/guest"];

// Guest-login gate for the publicly deployed URL. IMPORTANT: this is NOT
// real authentication — no password, no server-side session, just a cookie
// labeling who to attribute actions to (see src/lib/current-user.ts). It
// exists only so a live demo URL isn't a completely open, actor-less
// free-for-all sitting on a real (billed) OpenAI API key. Do not rely on
// this for anything handling real customer data — add real auth first.
//
// NOTE: as of Next.js 16, this file MUST be named exactly `proxy.ts`
// (not `middleware.ts`) and export a function named exactly `proxy`
// (not `middleware`) — Next.js renamed the whole convention in v16.
// A `middleware.ts` file is silently ignored with no build warning,
// which is exactly what happened here.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const hasGuestCookie = req.cookies.has(COOKIE_NAME);
  if (!hasGuestCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
