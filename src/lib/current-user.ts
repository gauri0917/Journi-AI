import { cookies } from "next/headers";

// Stand-in for auth. Every created_by / published_by / reviewed_by column
// reads from currentUserName(). Reads the guest-login cookies set by
// /api/auth/guest — see middleware.ts for the gate that requires the name
// cookie to exist before any page loads. Falls back to CURRENT_USER_NAME
// (or "Demo Owner") for any context without a request-scoped cookie jar,
// e.g. the eval harness, which calls library functions directly outside the
// Next.js server and would throw if cookies() were called unguarded there.
export function currentUserName(): string {
  try {
    const guestName = cookies().get("journi_user")?.value;
    if (guestName && guestName.trim()) return decodeURIComponent(guestName).trim();
  } catch {
    // No request context available (e.g. called from a script) — fall through.
  }
  return process.env.CURRENT_USER_NAME?.trim() || "Demo Owner";
}

// Optional — guests aren't required to give a role at login (see
// /api/auth/guest). Returns null if none was set. Used ONLY by the
// dashboard's "Action needed" tab to match against JourneyReview.reviewerRole
// — nothing else in the app currently depends on this being present, so a
// guest who skips it just won't see reviewer-based action items, not an error.
export function currentUserRole(): string | null {
  try {
    const guestRole = cookies().get("journi_role")?.value;
    if (guestRole && guestRole.trim()) return decodeURIComponent(guestRole).trim();
  } catch {
    // No request context available — fall through.
  }
  return null;
}
