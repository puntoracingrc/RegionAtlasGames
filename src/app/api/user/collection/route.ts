import { NextResponse } from "next/server";
import {
  getUserCollectionViews,
  readUserCollection,
  summarizeCollection,
} from "@/lib/collection-store";
import { getCurrentUser } from "@/lib/users";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const file = readUserCollection(user.id);
  const items = getUserCollectionViews(user.id);

  return NextResponse.json({
    items,
    summary: summarizeCollection(file.items),
    importedAt: file.importedAt,
    source: file.source,
  });
}
