import type { SeriesProfile } from "@/lib/series-profile";

export type SagaMascotTone = "elden-ring" | "final-fantasy" | "resident-evil";

export type SagaMascot = {
  id: string;
  tone: SagaMascotTone;
  imageSrc: string;
  alt: string;
  eyebrow: string;
  title: string;
  lines: string[];
  ctaLabel: string;
  sectionClass: string;
  eyebrowClass: string;
  bubbleClass: string;
  ctaClass: string;
};

export const SAGA_MASCOTS: SagaMascot[] = [
  {
    id: "ps5-elden-ring",
    tone: "elden-ring",
    imageSrc: "/mascots/sagas/ps5-elden-ring.png",
    alt: "Mascota PS5 vestida como guardián de una saga fantástica",
    eyebrow: "Guardián de sagas",
    title: "Cruza el umbral de las franquicias",
    ctaLabel: "Seguir la gracia",
    sectionClass:
      "border-amber-300/30 bg-[radial-gradient(circle_at_20%_10%,rgba(245,158,11,0.18),transparent_32%),linear-gradient(135deg,rgba(17,24,39,0.96),rgba(55,34,12,0.92))]",
    eyebrowClass: "text-amber-300",
    bubbleClass: "border-amber-200/20 text-amber-50",
    ctaClass: "bg-amber-300 text-slate-950 hover:bg-amber-200",
    lines: [
      "Alza la mirada, coleccionista: cada saga guarda ediciones, regiones y reliquias que no se entregan al primero que pasa.",
      "Entre carátulas antiguas, plataformas caídas y precios cambiantes, la verdadera ruta se revela ficha a ficha.",
      "Mi espada no corta enemigos; corta el ruido del catálogo para que encuentres el legado completo.",
      "Si buscas una saga completa, prepara inventario, paciencia y unas cuantas runas.",
    ],
  },

  {
    id: "ps5-resident-evil",
    tone: "resident-evil",
    imageSrc: "/mascots/sagas/ps5-resident-evil.png",
    alt: "Mascota PS5 equipada como superviviente de una saga de survival horror",
    eyebrow: "Informe biohazard",
    title: "La zona está en cuarentena",
    ctaLabel: "Abrir informe",
    sectionClass:
      "border-red-400/30 bg-[radial-gradient(circle_at_18%_12%,rgba(239,68,68,0.20),transparent_34%),radial-gradient(circle_at_72%_4%,rgba(251,191,36,0.10),transparent_28%),linear-gradient(135deg,rgba(7,10,16,0.98),rgba(30,41,59,0.94))]",
    eyebrowClass: "text-red-200",
    bubbleClass: "border-red-100/20 text-red-50",
    ctaClass: "bg-red-200 text-slate-950 hover:bg-red-100",
    lines: [
      "Bienvenido, superviviente. Has entrado en una saga clasificada como biohazard.",
      "Inventario preparado: ediciones, regiones, remakes y precios con posible mutación.",
      "No soy policía, pero puedo investigar esta saga ficha a ficha.",
      "Traigo linterna, inventario limitado y cero confianza en Umbrella.",
    ],
  },
  {
    id: "ps5-final-fantasy-cloud",
    tone: "final-fantasy",
    imageSrc: "/mascots/sagas/ps5-final-fantasy-cloud.png",
    alt: "Mascota PS5 inspirada en un héroe de Final Fantasy con espada enorme",
    eyebrow: "Guardián del cristal",
    title: "El cristal marca una nueva aventura",
    ctaLabel: "Seguir el cristal",
    sectionClass:
      "border-sky-300/30 bg-[radial-gradient(circle_at_18%_12%,rgba(56,189,248,0.22),transparent_34%),radial-gradient(circle_at_70%_0%,rgba(250,204,21,0.14),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.97),rgba(30,41,59,0.94))]",
    eyebrowClass: "text-sky-200",
    bubbleClass: "border-sky-100/20 text-sky-50",
    ctaClass: "bg-sky-200 text-slate-950 hover:bg-sky-100",
    lines: [
      "La materia está equipada: nostalgia, búsqueda y presupuesto bajo control.",
      "Cada entrega es un mundo distinto; cada edición, una reliquia que merece su propia partida guardada.",
      "No prometo salvar el mundo, pero sí ayudarte a encontrar la edición correcta.",
      "Trae gil, paciencia y una lista de deseos: esta saga no se completa con una sola invocación.",
    ],
  },
];

const ELDEN_RING_SLUGS = new Set(["elden-ring"]);
const FINAL_FANTASY_SLUGS = new Set(["final-fantasy"]);
const RESIDENT_EVIL_SLUGS = new Set(["resident-evil"]);

export function getSagaMascot(slug?: string): SagaMascot | null {
  if (slug && FINAL_FANTASY_SLUGS.has(slug)) return SAGA_MASCOTS[2];
  if (slug && RESIDENT_EVIL_SLUGS.has(slug)) return SAGA_MASCOTS[1];
  if (slug && ELDEN_RING_SLUGS.has(slug)) return SAGA_MASCOTS[0];
  return null;
}

export function buildSagaMascotLine(
  profile?: Pick<SeriesProfile, "name" | "gameCount" | "platformCount">,
  mascot?: SagaMascot,
) {
  if (!mascot) return "";

  if (!profile) {
    return mascot.lines[0];
  }

  const gameText = `${profile.gameCount.toLocaleString("es-ES")} ${
    profile.gameCount === 1 ? "título" : "títulos"
  }`;
  const platformText = `${profile.platformCount.toLocaleString("es-ES")} ${
    profile.platformCount === 1 ? "plataforma" : "plataformas"
  }`;

  if (mascot.tone === "final-fantasy") {
    return `La saga ${profile.name} reúne ${gameText} en ${platformText}. Revisa cada capítulo con calma: el cristal también mira región, edición y estado.`;
  }

  if (mascot.tone === "resident-evil") {
    return `La saga ${profile.name} contiene ${gameText} repartidos en ${platformText}. Mantén la calma: revisa ediciones, remakes, regiones y precios antes de abrir la siguiente puerta.`;
  }

  return `La saga ${profile.name} ha dejado ${gameText} en ${platformText}. Examina cada edición con cuidado: algunas reliquias brillan menos de lo que valen.`;
}
