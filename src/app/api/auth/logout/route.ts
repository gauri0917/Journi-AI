import { NextRequest, NextResponse } from "next/server";

// Plain form-POST target (see layout.tsx) — returns a redirect rather than
// JSON so a standard HTML <form> works with zero client-side JS.
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("journi_user", "", { path: "/", maxAge: 0 });
  return res;
}
