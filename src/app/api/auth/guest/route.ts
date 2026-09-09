import { NextRequest, NextResponse } from "next/server";

const NAME_COOKIE = "journi_user";
const ROLE_COOKIE = "journi_role";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// This is a GUEST LABEL, not a security credential — no password, no
// server-side session, nothing checked against a user table. It exists so
// a publicly deployed URL isn't a bare, actor-less free-for-all, and so
// created_by/reviewed_by columns have a real name attached. Do not extend
// this into anything that gates access to sensitive data without adding
// real authentication first.
//
// `role` is optional and free text, same convention as owner_role /
// approver_role / reviewerRole elsewhere in this schema (no fixed role
// list, no User table). It exists so the dashboard's "Action needed" tab
// can tell whether a pending review belongs to you — without a role
// captured at login, there's no way to connect a guest identity to a
// review's reviewerRole at all, so this isn't optional in practice if you
// want that feature to work for you specifically.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const role = typeof body?.role === "string" ? body.role.trim().slice(0, 60) : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const res = NextResponse.json({ name, role });
  res.cookies.set(NAME_COOKIE, encodeURIComponent(name), {
    httpOnly: false, // deliberately readable client-side — this labels actions, not a security boundary
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  if (role) {
    res.cookies.set(ROLE_COOKIE, encodeURIComponent(role), {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  } else {
    res.cookies.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
  }
  return res;
}
