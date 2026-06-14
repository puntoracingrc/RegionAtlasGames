import { redirect } from "next/navigation";
import { getCurrentUser } from "./users";

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== "production") {
      return [];
    }
    return [];
  }
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const allowed = adminEmails();
  if (allowed.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  return allowed.includes(normalized);
}

export async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/login?next=/admin");
  }
  return user;
}

export async function assertAdminApi(): Promise<{ email: string; id: string } | null> {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return { email: user.email, id: user.id };
}

export function canWriteCatalogFiles(): boolean {
  if (process.env.ADMIN_ALLOW_CATALOG_WRITE === "1") return true;
  return process.env.NODE_ENV !== "production";
}
