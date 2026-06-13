import { NextResponse } from "next/server";
import {
  getUserCollectionViews,
  readUserCollection,
  redactCollectionViewsForPlan,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import { canViewCollectionValue } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const file = await readUserCollection(user.id);
  const items = redactCollectionViewsForPlan(await getUserCollectionViews(user.id), user.plan);
  const showValues = canViewCollectionValue(user.plan);

  return NextResponse.json({
    items,
    summary: summarizeCollectionForPlan(file.items, user.plan),
    canViewCollectionValue: showValues,
    importedAt: file.importedAt,
    source: file.source,
  });
}
