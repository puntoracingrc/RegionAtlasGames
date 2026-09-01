import { NextResponse } from "next/server";
import {
  getUserCollectionViews,
  redactCollectionViewsForPlan,
  saveUserCollectionItems,
  summarizeCollectionForPlan,
} from "@/lib/collection-store";
import {
  importSpreadsheet,
  isSupportedSpreadsheetFilename,
  MAX_SPREADSHEET_IMPORT_BYTES,
} from "@/lib/import-collection";
import { listAdminPlatforms } from "@/lib/admin-entity-catalog";
import { upsertCatalogStagingFromImport } from "@/lib/catalog-staging";
import { canViewCollectionValue } from "@/lib/plans";
import { getCurrentUser } from "@/lib/users";
import {
  defaultCollectionConditionForPlatform,
  normalizeLegacyCollectionCondition,
} from "@/lib/collection-condition-policy";

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

  if (!isSupportedSpreadsheetFilename(file.name)) {
    return NextResponse.json(
      { error: "Formato no soportado. Usa .xlsx o .csv." },
      { status: 400 },
    );
  }

  if (file.size > MAX_SPREADSHEET_IMPORT_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el límite de 10 MB." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let imported: Awaited<ReturnType<typeof importSpreadsheet>>;
  try {
    imported = await importSpreadsheet(buffer, file.name);
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo. Comprueba que sea un XLSX o CSV válido." },
      { status: 400 },
    );
  }
  const { items, stats } = imported;
  for (const item of items) {
    if (item.collectionCondition === "unknown" || !item.collectionCondition) {
      item.collectionCondition = defaultCollectionConditionForPlatform(
        user.collectionDefaultConditions,
        item.platformSlug,
      );
      item.sealed = item.collectionCondition === "sealed";
    } else {
      item.collectionCondition = normalizeLegacyCollectionCondition(
        item.collectionCondition,
        item.sealed,
      );
    }
  }
  const knownPlatformSlugs = new Set((await listAdminPlatforms()).map((platform) => platform.slug));
  for (const item of items) {
    if (knownPlatformSlugs.has(item.platformSlug)) {
      item.inRetroCatalog = true;
    }
  }
  stats.unmatched = items.filter((item) => item.inRetroCatalog && !item.catalogMatched).length;

  if (stats.warnings.length > 0 && stats.imported === 0) {
    return NextResponse.json({ error: stats.warnings[0], stats }, { status: 400 });
  }

  const saved = await saveUserCollectionItems(user.id, items, { source: file.name });
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  const staging = await upsertCatalogStagingFromImport({
    userId: user.id,
    items,
    importedAt: saved.importedAt ?? new Date().toISOString(),
  });

  const views = redactCollectionViewsForPlan(await getUserCollectionViews(user.id), user.plan);

  return NextResponse.json({
    items: views,
    summary: summarizeCollectionForPlan(saved.items, user.plan),
    canViewCollectionValue: canViewCollectionValue(user.plan),
    stats,
    staging,
    importedAt: new Date().toISOString(),
    source: file.name,
  });
}
