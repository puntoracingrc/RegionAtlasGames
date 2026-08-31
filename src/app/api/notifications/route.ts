import { NextResponse } from "next/server";
import {
  getCommunicationSummary,
  getUserNotificationInbox,
  markNotificationsRead,
} from "@/lib/conversations";
import { marketplaceRateLimitResponse } from "@/lib/marketplace-request-security";
import { getCurrentUser } from "@/lib/users";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 20;
  const { notifications, summary } = await getUserNotificationInbox(user.id, limit);

  return NextResponse.json(
    { notifications, summary },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const rateLimited = await marketplaceRateLimitResponse(request, {
    action: "notification-read",
    userId: user.id,
    limit: 240,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.notificationIds)
    ? body.notificationIds
        .map((value: unknown) => String(value).trim())
        .filter(Boolean)
        .slice(0, 100)
    : undefined;
  const result = await markNotificationsRead({
    userId: user.id,
    notificationIds: ids,
  });
  const summary = await getCommunicationSummary(user.id);

  return NextResponse.json(
    { ...result, summary },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
