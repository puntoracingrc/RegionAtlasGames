"use client";

import { ConsoleMascotAvatar } from "@/components/console-mascot-avatar";
import { PlatformProcessMascot } from "@/components/platform-process-mascot";
import type { ImportStats } from "@/lib/import-collection";

type RacePlatform = {
  slug: string;
  name: string;
  shortName: string;
  items: number;
  units: number;
};

const PLATFORM_LABELS: Record<string, { name: string; shortName: string }> = {
  nes: { name: "Nintendo Entertainment System", shortName: "NES" },
  snes: { name: "Super Nintendo", shortName: "SNES" },
  n64: { name: "Nintendo 64", shortName: "N64" },
  gameboy: { name: "Game Boy", shortName: "Game Boy" },
  gameboycolor: { name: "Game Boy Color", shortName: "GBC" },
  gamecube: { name: "GameCube", shortName: "GameCube" },
  wii: { name: "Nintendo Wii", shortName: "Wii" },
  ds: { name: "Nintendo DS", shortName: "DS" },
  "3ds": { name: "Nintendo 3DS", shortName: "3DS" },
  mastersystem: { name: "Master System", shortName: "Master System" },
  megadrive: { name: "Mega Drive", shortName: "Mega Drive" },
  sega32x: { name: "Sega 32X", shortName: "32X" },
  megacd: { name: "Mega CD", shortName: "Mega CD" },
  saturn: { name: "Sega Saturn", shortName: "Saturn" },
  dreamcast: { name: "Dreamcast", shortName: "Dreamcast" },
  gamegear: { name: "Game Gear", shortName: "Game Gear" },
  neogeo: { name: "Neo Geo AES", shortName: "Neo Geo" },
  neogeocd: { name: "Neo Geo CD", shortName: "Neo Geo CD" },
  neogeopocket: { name: "Neo Geo Pocket", shortName: "NG Pocket" },
  ps1: { name: "PlayStation", shortName: "PS1" },
  ps2: { name: "PlayStation 2", shortName: "PS2" },
  ps3: { name: "PlayStation 3", shortName: "PS3" },
  ps4: { name: "PlayStation 4", shortName: "PS4" },
  ps5: { name: "PlayStation 5", shortName: "PS5" },
  switch: { name: "Nintendo Switch", shortName: "Switch" },
  switch2: { name: "Nintendo Switch 2", shortName: "Switch 2" },
  xbox360: { name: "Xbox 360", shortName: "Xbox 360" },
  xboxone: { name: "Xbox One", shortName: "Xbox One" },
  xboxseriess: { name: "Xbox Series S", shortName: "Series S" },
  xboxseriesx: { name: "Xbox Series X", shortName: "Series X" },
  psp: { name: "PSP", shortName: "PSP" },
  psvita: { name: "PS Vita", shortName: "PS Vita" },
};

function labelForPlatform(slug: string) {
  return PLATFORM_LABELS[slug] ?? {
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    shortName: slug.toUpperCase(),
  };
}

function podiumHeight(index: number): string {
  if (index === 0) return "h-28";
  if (index === 1) return "h-24";
  return "h-20";
}

function podiumLabel(index: number): string {
  return ["1º", "2º", "3º"][index] ?? `${index + 1}º`;
}

function podiumTone(index: number): string {
  if (index === 0) return "from-amber-400/35 to-amber-500/10 border-amber-300/50";
  if (index === 1) return "from-slate-300/35 to-slate-400/10 border-slate-300/50";
  return "from-orange-400/30 to-orange-500/10 border-orange-300/50";
}

function buildLines(platforms: RacePlatform[]): Array<{ speaker: RacePlatform; text: string }> {
  if (platforms.length === 0) return [];
  const [winner, second, third] = platforms;
  const lines: Array<{ speaker: RacePlatform; text: string }> = [
    {
      speaker: winner,
      text:
        platforms.length === 1
          ? `Hoy corro solo, pero he entrado con ${winner.items} juegos. Victoria por abandono elegante.`
          : `Subo al podio con ${winner.items} juegos. Que alguien me ponga música de jefe final.`,
    },
  ];

  if (second) {
    const diff = winner.items - second.items;
    lines.push({
      speaker: second,
      text:
        diff <= 2
          ? `He quedado a ${diff} de distancia. Esto pide revancha en la próxima importación.`
          : `Vale, vale, me has sacado ${diff}. Pero yo venía calentando cartuchos.`,
    });
  }

  if (third) {
    lines.push({
      speaker: third,
      text: `Tercer puesto y sin despeinar el lector. ${third.items} juegos bien colocados.`,
    });
  }

  if (platforms.length > 3) {
    lines.push({
      speaker: platforms[3],
      text: `Desde boxes confirmo: también hemos traído material. Aquí nadie vino de figurante.`,
    });
  }

  return lines.slice(0, 4);
}

function MascotAvatar({ platform }: { platform: RacePlatform }) {
  return (
    <ConsoleMascotAvatar
      platformSlug={platform.slug}
      fallbackLabel={platform.shortName}
      className="h-16 w-16"
    />
  );
}

export function CollectionImportRace({ stats }: { stats: ImportStats }) {
  const platforms = Object.entries(stats.byPlatform ?? {})
    .map(([slug, value]) => {
      const labels = labelForPlatform(slug);
      return {
        slug,
        name: labels.name,
        shortName: labels.shortName,
        items: value.items,
        units: value.units,
      };
    })
    .filter((platform) => platform.items > 0)
    .sort((a, b) => b.items - a.items || b.units - a.units || a.shortName.localeCompare(b.shortName, "es"));

  if (platforms.length === 0) return null;

  if (platforms.length === 1) {
    const platform = platforms[0];
    return (
      <PlatformProcessMascot
        platformSlug={platform.slug}
        platformName={platform.name}
        platformShortName={platform.shortName}
        title="Logro de importación"
        message={`He colocado ${platform.items} juegos de ${platform.shortName} en tu colección. Sin podio, pero con entrada triunfal.`}
        detail={
          platform.units !== platform.items
            ? `En total son ${platform.units} unidades contando copias repetidas.`
            : "Queda todo preparado para enlazar fichas, precios y mejoras del catálogo."
        }
      />
    );
  }

  const podium = platforms.slice(0, 3);
  const lines = buildLines(platforms);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/70 p-4 shadow-sm shadow-black/5 dark:shadow-black/20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">
            Carrera de importación
          </p>
          <h3 className="mt-1 text-lg font-black text-foreground">Podio de plataformas</h3>
          <p className="mt-1 text-xs text-muted">
            Han competido {platforms.length} plataformas por ver quién trae más juegos.
          </p>
        </div>
        <div className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-semibold text-muted">
          Ganador: {platforms[0].shortName} · {platforms[0].items} juegos
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
        <div className="grid min-h-48 grid-cols-3 items-end gap-3 rounded-2xl border border-border bg-background/45 p-3">
          {podium.map((platform, index) => (
            <article
              key={platform.slug}
              className="import-race-pop flex flex-col items-center"
              style={{ animationDelay: `${index * 140}ms` }}
            >
              <MascotAvatar platform={platform} />
              <div
                className={`mt-2 flex w-full flex-col items-center justify-center rounded-2xl border bg-gradient-to-b px-2 py-3 text-center ${podiumHeight(index)} ${podiumTone(index)}`}
              >
                <span className="text-xs font-black text-foreground">{podiumLabel(index)}</span>
                <span className="mt-1 text-sm font-bold text-foreground">{platform.shortName}</span>
                <span className="mt-1 text-[11px] text-muted">
                  {platform.items} juegos
                  {platform.units !== platform.items ? ` · ${platform.units} uds` : ""}
                </span>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div
              key={`${line.speaker.slug}-${index}`}
              className="import-race-pop rounded-2xl border border-border bg-background/55 p-3"
              style={{ animationDelay: `${420 + index * 220}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 scale-75">
                  <MascotAvatar platform={line.speaker} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-accent">
                    {line.speaker.shortName}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{line.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
