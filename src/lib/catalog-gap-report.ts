import {
  getCollectionPlatformShortName,
  groupCollectionByPlatform,
} from "./collection-platform-groups";
import { enrichCollectionItem } from "./catalog";
import type { CollectionItem } from "./types";

export type CatalogGapSection = {
  kind: "pending" | "outOfScope";
  label: string;
  groups: ReturnType<typeof groupCollectionByPlatform>;
  totalItems: number;
  totalUnits: number;
};

export type CatalogGapReport = {
  sections: CatalogGapSection[];
  totalItems: number;
  totalUnits: number;
};

export function buildCatalogGapReport(input: {
  pending: CollectionItem[];
  outOfScope: CollectionItem[];
}): CatalogGapReport | null {
  const sections: CatalogGapSection[] = [];

  if (input.pending.length > 0) {
    const groups = groupCollectionByPlatform(input.pending.map(enrichCollectionItem));
    sections.push({
      kind: "pending",
      label: "Retro sin ficha en Region Atlas",
      groups,
      totalItems: input.pending.length,
      totalUnits: input.pending.reduce((sum, item) => sum + item.quantity, 0),
    });
  }

  if (input.outOfScope.length > 0) {
    const groups = groupCollectionByPlatform(input.outOfScope.map(enrichCollectionItem));
    sections.push({
      kind: "outOfScope",
      label: "Plataformas aún no indexadas (PS5, etc.)",
      groups,
      totalItems: input.outOfScope.length,
      totalUnits: input.outOfScope.reduce((sum, item) => sum + item.quantity, 0),
    });
  }

  if (sections.length === 0) return null;

  return {
    sections,
    totalItems: sections.reduce((sum, section) => sum + section.totalItems, 0),
    totalUnits: sections.reduce((sum, section) => sum + section.totalUnits, 0),
  };
}

function formatItemLine(item: CollectionItem): string {
  const platform = getCollectionPlatformShortName(item.platformSlug);
  const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
  const region = item.region && item.region !== "—" ? ` · ${item.region}` : "";
  return `- ${item.title} (${platform}${qty}${region})`;
}

export function formatCatalogGapReportText(report: CatalogGapReport, meta: {
  userName: string;
  userEmail: string;
  userId: string;
  importSource: string | null;
  importedAt: string | null;
}): string {
  const lines: string[] = [
    "Solicitud de fichas de catálogo — Region Atlas",
    "",
    `Usuario: ${meta.userName} <${meta.userEmail}>`,
    `ID: ${meta.userId}`,
  ];

  if (meta.importSource) lines.push(`Import: ${meta.importSource}`);
  if (meta.importedAt) {
    lines.push(`Fecha import: ${new Date(meta.importedAt).toLocaleString("es-ES")}`);
  }

  lines.push(
    "",
    `Total pendiente: ${report.totalItems} títulos (${report.totalUnits} unidades)`,
    "",
  );

  for (const section of report.sections) {
    lines.push(`== ${section.label} (${section.totalItems} títulos) ==`);
    lines.push("");

    for (const group of section.groups) {
      const units =
        group.units > group.items.length ? ` · ${group.units} uds.` : "";
      lines.push(`[${group.shortName}] ${group.items.length} juegos${units}`);
      for (const item of group.items) {
        lines.push(formatItemLine(item));
      }
      lines.push("");
    }
  }

  lines.push("—");
  lines.push("Generado desde Mi colección en Region Atlas.");

  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCatalogGapReportHtml(report: CatalogGapReport, meta: {
  userName: string;
  userEmail: string;
  userId: string;
  importSource: string | null;
  importedAt: string | null;
}): string {
  const sectionBlocks = report.sections
    .map((section) => {
      const groups = section.groups
        .map((group) => {
          const items = group.items
            .map(
              (item) =>
                `<li style="margin:0 0 6px;color:#d4d4d8;font-size:13px;line-height:1.45;">${escapeHtml(formatItemLine(item).replace(/^- /, ""))}</li>`,
            )
            .join("");
          const units =
            group.units > group.items.length
              ? ` · ${group.units} uds.`
              : "";
          return `<div style="margin:0 0 18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#f4f4f5;">${escapeHtml(group.shortName)} — ${group.items.length} juegos${units}</p>
            <ul style="margin:0;padding-left:18px;">${items}</ul>
          </div>`;
        })
        .join("");

      return `<section style="margin:0 0 24px;padding:16px 18px;background:#121218;border:1px solid #2a2a35;border-radius:12px;">
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#fbbf24;">${escapeHtml(section.label)} (${section.totalItems})</h2>
        ${groups}
      </section>`;
    })
    .join("");

  const importMeta = [
    meta.importSource ? `Import: ${escapeHtml(meta.importSource)}` : null,
    meta.importedAt
      ? `Fecha: ${escapeHtml(new Date(meta.importedAt).toLocaleString("es-ES"))}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 16px;background:#0f0f12;font-family:system-ui,-apple-system,sans-serif;color:#e8e8ec;">
  <div style="max-width:720px;margin:0 auto;">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Region Atlas · catálogo</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f5f5f7;">Solicitud de fichas pendientes</h1>
    <p style="margin:0 0 6px;font-size:14px;color:#a1a1aa;"><strong style="color:#e8e8ec;">${escapeHtml(meta.userName)}</strong> &lt;${escapeHtml(meta.userEmail)}&gt;</p>
    <p style="margin:0 0 6px;font-size:13px;color:#71717a;">ID: ${escapeHtml(meta.userId)}</p>
    ${importMeta ? `<p style="margin:0 0 16px;font-size:13px;color:#71717a;">${importMeta}</p>` : ""}
    <p style="margin:0 0 20px;font-size:14px;color:#d4d4d8;">Total: <strong>${report.totalItems}</strong> títulos (${report.totalUnits} unidades)</p>
    ${sectionBlocks}
    <p style="margin:0;font-size:12px;color:#52525b;">Responde a ${escapeHtml(meta.userEmail)} si necesitas aclarar ediciones o regiones.</p>
  </div>
</body>
</html>`;
}
