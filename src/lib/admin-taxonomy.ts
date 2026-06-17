import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";
import { slugify } from "./slug";

export type AdminTaxonomyLevel = "main" | "subgenre" | "tag";

export type AdminTaxonomyNode = {
  slug: string;
  name: string;
  level: AdminTaxonomyLevel;
  parentSlug: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
  linkedGenreSlugs: string[];
  createdAt: string;
  updatedAt: string;
};

export type AdminTaxonomyTreeNode = AdminTaxonomyNode & {
  children: AdminTaxonomyTreeNode[];
};

export type AdminTaxonomyFile = {
  version: number;
  updatedAt: string;
  nodes: Record<string, AdminTaxonomyNode>;
};

const DATA_DIR = path.join(appDataDir(), "admin");
const TAXONOMY_FILE = path.join(DATA_DIR, "taxonomy.json");
const TAXONOMY_BLOB_PATH = "region-atlas/admin/taxonomy.json";

const DEFAULT_MAIN_GENRES = [
  "Acción",
  "Aventura",
  "RPG",
  "Deportes",
  "Conducción",
  "Lucha",
  "Estrategia",
  "Simulación",
  "Puzzle",
  "Plataformas",
  "Shooter",
  "Terror",
  "Formato / edición",
];

const DEFAULT_SUBGENRES: Array<{ name: string; parent: string }> = [
  { name: "Fútbol", parent: "deportes" },
  { name: "Baloncesto", parent: "deportes" },
  { name: "Juegos olímpicos", parent: "deportes" },
  { name: "Arcade deportivo", parent: "deportes" },
  { name: "JRPG", parent: "rpg" },
  { name: "Action RPG", parent: "rpg" },
  { name: "Táctico", parent: "rpg" },
  { name: "Point & click", parent: "aventura" },
  { name: "Narrativa", parent: "aventura" },
  { name: "Survival horror", parent: "terror" },
  { name: "Carreras arcade", parent: "conduccion" },
  { name: "Simulación de conducción", parent: "conduccion" },
  { name: "2D", parent: "plataformas" },
  { name: "3D", parent: "plataformas" },
  { name: "FPS", parent: "shooter" },
  { name: "Shoot'em up", parent: "shooter" },
  { name: "Material promocional", parent: "formato-edicion" },
  { name: "Edición comercial", parent: "formato-edicion" },
];

const DEFAULT_TAGS: Array<{ name: string; parent: string }> = [
  { name: "Full Motion Video (FMV)", parent: "narrativa" },
  { name: "Roguelike", parent: "accion" },
  { name: "Metroidvania", parent: "accion" },
  { name: "Party", parent: "accion" },
  { name: "Cooperativo", parent: "accion" },
  { name: "Competitivo", parent: "deportes" },
  { name: "Demo", parent: "material-promocional" },
  { name: "Promo", parent: "material-promocional" },
  { name: "Not For Resale (NFR)", parent: "material-promocional" },
  { name: "Beta / Preview", parent: "material-promocional" },
  { name: "Coleccionista", parent: "edicion-comercial" },
  { name: "Remaster", parent: "edicion-comercial" },
];

function shouldUseTaxonomyBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return blobAuthConfigured();
}

function now(): string {
  return new Date().toISOString();
}

function normalizeSlug(value: string): string {
  return slugify(value).trim();
}

function defaultNode(input: {
  name: string;
  level: AdminTaxonomyLevel;
  parentSlug?: string | null;
  sortOrder: number;
}): AdminTaxonomyNode {
  const timestamp = now();
  return {
    slug: normalizeSlug(input.name),
    name: input.name,
    level: input.level,
    parentSlug: input.parentSlug ?? null,
    description: "",
    active: true,
    sortOrder: input.sortOrder,
    linkedGenreSlugs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultTaxonomy(): AdminTaxonomyFile {
  const nodes: Record<string, AdminTaxonomyNode> = {};
  DEFAULT_MAIN_GENRES.forEach((name, index) => {
    const node = defaultNode({ name, level: "main", sortOrder: (index + 1) * 100 });
    nodes[node.slug] = node;
  });
  DEFAULT_SUBGENRES.forEach((entry, index) => {
    const node = defaultNode({
      name: entry.name,
      level: "subgenre",
      parentSlug: entry.parent,
      sortOrder: (index + 1) * 100,
    });
    nodes[node.slug] = node;
  });
  DEFAULT_TAGS.forEach((entry, index) => {
    const node = defaultNode({
      name: entry.name,
      level: "tag",
      parentSlug: entry.parent,
      sortOrder: (index + 1) * 100,
    });
    nodes[node.slug] = node;
  });
  return { version: 1, updatedAt: now(), nodes };
}

function parseTaxonomy(raw: string): AdminTaxonomyFile {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminTaxonomyFile>;
    if (!parsed.nodes || typeof parsed.nodes !== "object") return defaultTaxonomy();
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? now(),
      nodes: Object.fromEntries(
        Object.entries(parsed.nodes).map(([slug, node]) => [
          slug,
          {
            slug: node.slug ?? slug,
            name: node.name ?? slug,
            level: node.level ?? "main",
            parentSlug: node.parentSlug ?? null,
            description: node.description ?? "",
            active: node.active !== false,
            sortOrder: node.sortOrder ?? 0,
            linkedGenreSlugs: node.linkedGenreSlugs ?? [],
            createdAt: node.createdAt ?? now(),
            updatedAt: node.updatedAt ?? now(),
          },
        ]),
      ),
    };
  } catch {
    return defaultTaxonomy();
  }
}

function readTaxonomyFromDisk(): AdminTaxonomyFile | null {
  try {
    if (!existsSync(TAXONOMY_FILE)) return null;
    return parseTaxonomy(readFileSync(TAXONOMY_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeTaxonomyToDisk(taxonomy: AdminTaxonomyFile): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TAXONOMY_FILE, JSON.stringify(taxonomy, null, 2), "utf-8");
}

async function readTaxonomyFromBlob(): Promise<AdminTaxonomyFile | null> {
  if (!shouldUseTaxonomyBlobStorage()) return null;
  try {
    const auth = await blobAuthOptions("private");
    const result = await get(TAXONOMY_BLOB_PATH, { ...auth, useCache: false });
    if (!result?.stream || result.statusCode !== 200) return null;
    return parseTaxonomy(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

async function writeTaxonomyToBlob(taxonomy: AdminTaxonomyFile): Promise<void> {
  if (!shouldUseTaxonomyBlobStorage()) return;
  const auth = await blobAuthOptions("private");
  await put(TAXONOMY_BLOB_PATH, JSON.stringify(taxonomy, null, 2), {
    ...auth,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}

export async function readAdminTaxonomy(): Promise<AdminTaxonomyFile> {
  const taxonomy = (await readTaxonomyFromBlob()) ?? readTaxonomyFromDisk() ?? defaultTaxonomy();
  if (!readTaxonomyFromDisk()) {
    try {
      writeTaxonomyToDisk(taxonomy);
    } catch {
    }
  }
  return taxonomy;
}

async function writeAdminTaxonomy(taxonomy: AdminTaxonomyFile): Promise<void> {
  const payload = { ...taxonomy, updatedAt: now() };
  try {
    writeTaxonomyToDisk(payload);
  } catch {
  }
  await writeTaxonomyToBlob(payload);
}

function parentLevelFor(level: AdminTaxonomyLevel): AdminTaxonomyLevel | null {
  if (level === "subgenre") return "main";
  if (level === "tag") return "subgenre";
  return null;
}

function ensureValidParent(
  nodes: Record<string, AdminTaxonomyNode>,
  level: AdminTaxonomyLevel,
  parentSlug: string | null,
): { ok: true } | { error: string } {
  const requiredParent = parentLevelFor(level);
  if (!requiredParent) return { ok: true };
  if (!parentSlug) return { error: "Selecciona un padre para este nivel." };
  const parent = nodes[parentSlug];
  if (!parent || parent.level !== requiredParent) {
    return { error: "El padre seleccionado no pertenece al nivel correcto." };
  }
  return { ok: true };
}

export async function upsertAdminTaxonomyNode(input: {
  originalSlug?: string;
  name: string;
  slug?: string;
  level: AdminTaxonomyLevel;
  parentSlug?: string | null;
  description?: string;
  active?: boolean;
  sortOrder?: number;
  linkedGenreSlugs?: string[];
}): Promise<{ ok: true; node: AdminTaxonomyNode } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Falta el nombre." };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { error: "Slug no válido." };
  if (!["main", "subgenre", "tag"].includes(input.level)) return { error: "Nivel no válido." };

  const taxonomy = await readAdminTaxonomy();
  const existing = input.originalSlug ? taxonomy.nodes[input.originalSlug] : null;
  if (!existing && taxonomy.nodes[slug]) return { error: `Ya existe «${slug}».` };
  if (existing && input.originalSlug !== slug && taxonomy.nodes[slug]) {
    return { error: `Ya existe «${slug}».` };
  }

  const parentSlug = input.level === "main" ? null : (input.parentSlug ?? existing?.parentSlug ?? null);
  const parentCheck = ensureValidParent(taxonomy.nodes, input.level, parentSlug);
  if ("error" in parentCheck) return parentCheck;

  const timestamp = now();
  const node: AdminTaxonomyNode = {
    slug,
    name,
    level: input.level,
    parentSlug,
    description: input.description ?? existing?.description ?? "",
    active: input.active ?? existing?.active ?? true,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    linkedGenreSlugs: input.linkedGenreSlugs ?? existing?.linkedGenreSlugs ?? [],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing && input.originalSlug && input.originalSlug !== slug) {
    delete taxonomy.nodes[input.originalSlug];
    for (const child of Object.values(taxonomy.nodes)) {
      if (child.parentSlug === input.originalSlug) child.parentSlug = slug;
    }
  }

  taxonomy.nodes[slug] = node;
  await writeAdminTaxonomy(taxonomy);
  return { ok: true, node };
}

export async function deleteAdminTaxonomyNode(
  slug: string,
): Promise<{ ok: true } | { error: string }> {
  const taxonomy = await readAdminTaxonomy();
  if (!taxonomy.nodes[slug]) return { error: "Elemento no encontrado." };
  const hasChildren = Object.values(taxonomy.nodes).some((node) => node.parentSlug === slug);
  if (hasChildren) return { error: "No se puede borrar: primero mueve o borra sus hijos." };
  delete taxonomy.nodes[slug];
  await writeAdminTaxonomy(taxonomy);
  return { ok: true };
}

export function buildAdminTaxonomyTree(taxonomy: AdminTaxonomyFile): AdminTaxonomyTreeNode[] {
  const nodes = Object.values(taxonomy.nodes)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es", { numeric: true }))
    .map((node) => ({ ...node, children: [] as AdminTaxonomyTreeNode[] }));
  const bySlug = new Map(nodes.map((node) => [node.slug, node]));
  const roots: AdminTaxonomyTreeNode[] = [];

  for (const node of nodes) {
    if (node.parentSlug && bySlug.has(node.parentSlug)) {
      bySlug.get(node.parentSlug)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots.filter((node) => node.level === "main");
}
