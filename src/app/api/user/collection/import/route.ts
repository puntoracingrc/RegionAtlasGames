import { NextResponse } from "next/server";
import {
  getUserCollectionViews,
  saveUserCollectionItems,
  summarizeCollection,
} from "@/lib/collection-store";
import { importSpreadsheet } from "@/lib/import-collection";
import { getCurrentUser } from "@/lib/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para importar tu colección." }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Sube un archivo Excel (.xlsx) o CSV." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return NextResponse.json(
      { error: "Formato no soportado. Usa .xlsx, .xls o .csv." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { items, stats } = importSpreadsheet(buffer, file.name);

  if (stats.warnings.length > 0 && stats.imported === 0) {
    return NextResponse.json({ error: stats.warnings[0], stats }, { status: 400 });
  }

  saveUserCollectionItems(user.id, items, { source: file.name });
  const views = getUserCollectionViews(user.id);

  return NextResponse.json({
    items: views,
    summary: summarizeCollection(items),
    stats,
    importedAt: new Date().toISOString(),
    source: file.name,
  });
}
