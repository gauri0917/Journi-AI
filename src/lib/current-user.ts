import { cookies } from "next/headers";

export async function currentUserName(): Promise<string> {
  try {
    const store = await cookies();
    const guestName = store.get("journi_user")?.value;
    if (guestName && guestName.trim()) return decodeURIComponent(guestName).trim();
  } catch {
  }
  return process.env.CURRENT_USER_NAME?.trim() || "Demo Owner";
}

export async function currentUserRole(): Promise<string | null> {
  try {
    const store = await cookies();
    const guestRole = store.get("journi_role")?.value;
    if (guestRole && guestRole.trim()) return decodeURIComponent(guestRole).trim();
  } catch {
  }
  return null;
}
