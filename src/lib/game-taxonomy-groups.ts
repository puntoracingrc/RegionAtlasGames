import { getAllGameFacetTaxonomyEntities } from "@/lib/game-facets/taxonomy";
import type { GameFacetTaxonomyEntity } from "@/lib/game-facets/types";
import { buildGameFacetCounts } from "@/lib/game-facet-profile";
import { getGenre } from "@/lib/indexes";

export type PublicTaxonomyTerm = {
  id: string;
  name: string;
  slug: string;
  type: GameFacetTaxonomyEntity["type"];
  family?: string;
  aliases: string[];
  searchAliases: string[];
  description: string;
  href: string;
  count: number;
};

export type PublicTaxonomyGroup = {
  number: number;
  title: string;
  description: string;
  terms: PublicTaxonomyTerm[];
};

type GroupDef = {
  number: number;
  title: string;
  description: string;
  include: (entity: GameFacetTaxonomyEntity) => boolean;
};

const GROUPS: GroupDef[] = [
  {
    number: 1,
    title: "Géneros principales",
    description: "Los cajones grandes del catálogo: acción, aventura, RPG, deportes, terror, carreras y demás familias base.",
    include: (entity) => entity.type === "genre",
  },
  {
    number: 2,
    title: "Subgéneros",
    description: "Especializaciones jugables como Survival Horror, Metroidvania, JRPG, FPS, Kart Racing o FMV.",
    include: (entity) => entity.type === "subgenre",
  },
  {
    number: 3,
    title: "Visuales / punto de vista",
    description: "Estilo visual, cámara, perspectiva y presentación: pixel art, primera persona, vista cenital o vídeo interactivo.",
    include: (entity) => ["visual", "perspective", "format"].includes("family" in entity ? entity.family : ""),
  },
  {
    number: 4,
    title: "Temas y ambientación",
    description: "Mundos, tono de universo y elementos temáticos: fantasía, ciencia ficción, zombis, militar y licencias.",
    include: (entity) => ["theme", "setting", "content"].includes("family" in entity ? entity.family : ""),
  },
  {
    number: 5,
    title: "Tono y sensaciones",
    description: "Cozy, difícil, oscuro, bonito, atmosférico, humor negro y otras sensaciones editoriales.",
    include: (entity) =>
      ["cozy", "difficult", "dark-humor", "atmospheric", "beautiful", "cute", "addictive"].includes(entity.id),
  },
  {
    number: 6,
    title: "Mecánicas de gameplay",
    description: "Rasgos de cómo se juega: acción RPG, táctico, ritmo, shoot 'em up, beat 'em up y otras estructuras mecánicas.",
    include: (entity) => ["gameplay", "mechanic"].includes("family" in entity ? entity.family : ""),
  },
  {
    number: 7,
    title: "Actividades del jugador",
    description: "Acciones principales como explorar, disparar, conducir, construir, cultivar, bailar, competir o decorar.",
    include: (entity) =>
      ["exploration", "driving", "building", "farming", "dancing", "competition", "collecting", "decorating", "fishing"].includes(entity.id),
  },
  {
    number: 8,
    title: "Modos de jugador",
    description: "Un jugador, multijugador local, cooperativo, online y otras formas de jugar solo o acompañado.",
    include: (entity) => ("family" in entity ? entity.family : "") === "player_mode",
  },
  {
    number: 9,
    title: "Estructura del juego",
    description: "Campaña, episodios, infinito, misiones, rejugabilidad y otras formas de estructurar la partida.",
    include: (entity) =>
      ["campaign", "episodic", "endless", "level-editor", "sandbox", "open-world", "replay-value"].includes(entity.id),
  },
  {
    number: 10,
    title: "Software / contenido no-juego",
    description: "Utilidades, herramientas, benchmark, formación o software creativo. Separado para no mezclarlo con videojuegos.",
    include: (entity) => ["format", "technical"].includes("family" in entity ? entity.family : "") &&
      ["software", "utilities", "benchmark", "software-training", "photo-editing", "video-production", "audio-production", "design-illustration", "animation-modeling", "game-development"].includes(entity.id),
  },
  {
    number: 11,
    title: "Deportes / vehículos / simulación",
    description: "Fútbol, baloncesto, carreras, simulación, conducción y deportes específicos.",
    include: (entity) =>
      ["sports", "racing", "simulation"].includes(entity.id) ||
      ("family" in entity && ["sport"].includes(entity.family)) ||
      ["kart-racing", "sim-racing"].includes(entity.id),
  },
  {
    number: 12,
    title: "Contenido adulto / violencia / terror",
    description: "Terror, Survival Horror, zombis y futuras señales de contenido sensible separadas de los géneros base.",
    include: (entity) => ["horror", "survival-horror", "zombies"].includes(entity.id),
  },
  {
    number: 13,
    title: "Épocas / historia / política",
    description: "Guerra, militar, historia alternativa, épocas históricas, imperios y conflictos.",
    include: (entity) =>
      ["military", "historical", "alternate-history", "ancient", "rome", "cold-war", "world-war-i", "world-war-ii", "modern-era", "empire", "revolution", "colonial"].includes(entity.id),
  },
  {
    number: 14,
    title: "Animales / personajes / criaturas",
    description: "Zombis, monstruos, alienígenas, dragones, ninjas, samuráis y arquetipos de personaje.",
    include: (entity) =>
      ["zombies", "monsters", "aliens", "dragons", "vampires", "samurai", "ninja", "robots", "animals", "cats", "dogs", "dinosaurs"].includes(entity.id),
  },
  {
    number: 15,
    title: "Música / audio",
    description: "Música, ritmo, banda sonora, producción de audio y juegos musicales.",
    include: (entity) => ["music", "rhythm-game"].includes(entity.id),
  },
  {
    number: 16,
    title: "Hardware / controles",
    description: "VR, pistola de luz, volante, alfombrilla, multitap, memory card y periféricos. Pendiente de poblar.",
    include: (entity) => ("family" in entity ? entity.family : "") === "technical",
  },
];

function hrefForEntity(entity: GameFacetTaxonomyEntity): string {
  return entity.type === "genre" ? `/genero/${entity.slug}` : `/etiqueta/${entity.slug}`;
}

function countForEntity(entity: GameFacetTaxonomyEntity, facetCounts: Record<string, number>): number {
  if (entity.type === "genre") {
    return getGenre(entity.slug)?.gameCount ?? getGenre(entity.id)?.gameCount ?? facetCounts[entity.slug] ?? 0;
  }
  return facetCounts[entity.slug] ?? 0;
}

function toTerm(entity: GameFacetTaxonomyEntity, facetCounts: Record<string, number>): PublicTaxonomyTerm {
  return {
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    type: entity.type,
    family: "family" in entity ? entity.family : undefined,
    aliases: entity.aliases ?? [],
    searchAliases: entity.searchAliases ?? [],
    description: entity.description,
    href: hrefForEntity(entity),
    count: countForEntity(entity, facetCounts),
  };
}

export async function getPublicTaxonomyGroups(): Promise<PublicTaxonomyGroup[]> {
  const entities = getAllGameFacetTaxonomyEntities().filter((entity) => entity.status === "approved");
  const facetCounts = await buildGameFacetCounts();

  return GROUPS.map((group) => ({
    number: group.number,
    title: group.title,
    description: group.description,
    terms: entities
      .filter(group.include)
      .map((entity) => toTerm(entity, facetCounts))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es", { sensitivity: "base" })),
  })).filter((group) => group.terms.length > 0);
}
