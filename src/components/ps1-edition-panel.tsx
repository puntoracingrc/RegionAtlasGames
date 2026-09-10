import Image from "next/image";
import Link from "next/link";
import { Panel, PanelTitle } from "@/components/ui";
import { RegionFlag } from "@/components/region-flag";
import { catalogGamePath } from "@/lib/catalog-path";
import { getCoverSrc } from "@/lib/cover-url";
import { relatedPs1Editions } from "@/lib/ps1-catalog";
import { getCatalogGame, isPublicCatalogGame } from "@/lib/catalog";
import { getPs1Work } from "@/lib/ps1-edition-data";
import { languageNames, languageSummary } from "@/lib/ps1-regional";
import type { CatalogGame, GameDetails } from "@/lib/types";

const METADATA_LABELS: Record<string, string> = {
  "Genre / Style": "Género y estilo según la fuente",
  "Number Of Players": "Jugadores",
  "Number Of Memory Card Blocks": "Bloques de memoria",
  "Vibration Function Compatible": "Vibración",
  "Multi-Tap Function Compatible": "Multitap",
  "Link Cable Function Compatibile": "Cable Link",
};

function releaseDateLabel(date: NonNullable<NonNullable<GameDetails["ps1Edition"]>["regionalReleaseDate"]>) {
  if (!date.iso) return date.raw;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.iso}T12:00:00Z`));
}

function referenceLabel(roles: string[]) {
  if (roles.includes("front_cover")) return "Portada";
  if (roles.includes("back_cover")) return "Contraportada";
  if (roles.includes("disc_label")) return "Disco";
  if (roles.includes("manual_page")) return "Manual";
  return "Interior de la caja";
}

function metadataValue(value: string) {
  return value.replace(/\bYes\b/g, "Sí").replace(/\bPlayers\b/g, "jugadores").replace(/\bPlayer\b/g, "jugador")
    .replace(/\bBlocks\b/g, "bloques").replace(/\bBlock\b/g, "bloque").replace(/(\d) to (\d)/g, "$1 a $2");
}

export function Ps1EditionPanel({ game, details }: { game: CatalogGame; details?: GameDetails }) {
  const profile = details?.ps1Edition;
  if (game.platformSlug !== "ps1" || !profile) return null;
  const languages = profile.languages;
  const related = relatedPs1Editions(game);
  const contextGames = (getPs1Work(game.workId)?.legacyContextCatalogIds ?? [])
    .filter((id) => id !== game.id).map(getCatalogGame).filter((item): item is CatalogGame => Boolean(item && isPublicCatalogGame(item)));
  const graphics = profile.graphics.filter((asset) => {
    const filename = decodeURIComponent(asset.sourceImageReference.split("/").pop() ?? "").toUpperCase();
    return asset.stored && asset.url && game.canonicalSerials?.some((code) => filename.startsWith(`${code}-`));
  });
  const sources = [...new Map(profile.sources.map((source) => [source.url, source])).values()];

  return (
    <Panel>
      <PanelTitle>Edición, idiomas y documentación</PanelTitle>
      {profile.status === "review" ? (
        <p className="text-sm leading-6 text-muted">
          El mercado de esta ficha está pendiente de confirmar. La información disponible todavía
          no permite asociarla a una única edición. Los códigos de disco, la caja y el manual
          permiten distinguir las variantes documentadas.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Región</dt>
            <dd className="mt-1"><RegionFlag region={game.region} showLabel /></dd>
          </div>
          {languages && languages.all.length > 0 ? (
            <div>
              <dt className="font-semibold">Idiomas</dt>
              <dd className="mt-1 text-muted" title={languageNames(languages.all)}>{languageSummary(languages.all)}</dd>
            </div>
          ) : null}
          {languages && languages.text.length > 0 ? (
            <div><dt className="font-semibold">Textos y menús</dt><dd className="mt-1 text-muted">{languageNames(languages.text)}</dd></div>
          ) : null}
          {languages && languages.audio.length > 0 ? (
            <div><dt className="font-semibold">Voces</dt><dd className="mt-1 text-muted">{languageNames(languages.audio)}</dd></div>
          ) : null}
          {profile.components.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="font-semibold">{profile.serialScope === "packaging" ? "Código de la caja" : profile.components.length > 1 ? `${profile.components.length} discos en esta edición` : "Código del disco"}</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {profile.components.map((component) => <code key={component.serial} className="rounded bg-foreground/5 px-2 py-1 text-xs">{profile.components.length > 1 && !profile.containsMultipleWorks ? `${component.number}: ` : ""}{component.serial}{component.title ? ` · ${component.title}` : ""}</code>)}
              </dd>
              {profile.serialScope === "packaging" ? <dd className="mt-2 text-xs text-muted">La equivalencia con el código del disco está pendiente de verificar.</dd> : null}
            </div>
          ) : null}
          {profile.regionalReleaseDate?.raw ? (
            <div><dt className="font-semibold">Lanzamiento documentado</dt><dd className="mt-1 text-muted">{releaseDateLabel(profile.regionalReleaseDate)}<span className="block text-xs">Según PSX Datacenter{profile.editionLabels?.length ? "; fecha de la reedición por confirmar" : ""}.</span></dd></div>
          ) : null}
          {profile.softwareCategory?.includes("Applications") ? <div><dt className="font-semibold">Tipo de publicación</dt><dd className="mt-1 text-muted">Aplicación para PlayStation</dd></div> : null}
          {Object.entries(profile.softwareMetadata ?? {}).filter(([key]) => METADATA_LABELS[key]).map(([key, value]) => (
            <div key={key}><dt className="font-semibold">{METADATA_LABELS[key]}</dt><dd className="mt-1 text-muted">{metadataValue(value)}</dd></div>
          ))}
        </dl>
      )}
      {languages?.discrepancy ? (
        <p className="mt-4 text-xs leading-5 text-muted">Las fuentes no enumeran los idiomas de la misma forma. Esta ficha conserva el detalle de textos y voces cuando está documentado.</p>
      ) : null}
      {graphics.length > 0 ? (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Portadas y material de referencia ({graphics.length})</summary>
          <p className="mt-2 text-xs leading-5 text-muted">Un mismo disco puede tener cajas de distintos mercados. Cada imagen conserva el mercado indicado por la fuente. Para comprobar un conjunto, contrasta también los códigos de la caja y del manual.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {graphics.map((asset) => {
              const src = getCoverSrc(asset.url);
              if (!src) return null;
              const label = referenceLabel(asset.roles);
              return <figure key={`${asset.assetId}:${asset.group}:${asset.marketHints.join("-")}`} className="min-w-0 rounded-lg border border-border p-2">
                <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar ${label.toLowerCase()} de ${game.title}`}>
                  <Image unoptimized src={src} width={asset.width ?? 400} height={asset.height ?? 400} alt={`${label} de ${game.title} · ${asset.marketHints.join(" / ") || "Mercado por confirmar"}`} className="h-44 w-full object-contain" />
                </a>
                <figcaption className="mt-2 text-xs text-muted">
                  {label} · {asset.marketHints.join(" / ") || "Mercado por confirmar"} · <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Fuente</a>
                  {asset.thumbnailOnly ? <span className="mt-1 block">Miniatura de referencia; escaneo completo no disponible.</span> : null}
                </figcaption>
              </figure>;
            })}
          </div>
        </details>
      ) : null}
      {related.length > 0 ? (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Otras ediciones documentadas ({related.length})</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {related.map((edition) => <li key={edition.id}><Link href={catalogGamePath(edition)} className="hover:underline">{edition.title} · {edition.region}{edition.canonicalSerials?.[0] ? ` · ${edition.canonicalSerials[0]}` : ""}</Link></li>)}
          </ul>
        </details>
      ) : null}
      {contextGames.length > 0 ? (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Historia y relaciones del juego</summary>
          <p className="mt-2 text-xs leading-5 text-muted">Estas fichas de la misma obra conservan su descripción, franquicias, personas y premios. Los créditos específicos de cada edición mantienen su propia procedencia.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {contextGames.map((context) => <li key={context.id}><Link href={catalogGamePath(context)} className="hover:underline">{context.title} · {context.region}</Link></li>)}
          </ul>
        </details>
      ) : null}
      {sources.length > 0 ? (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Consultar fuentes</summary>
          <ul className="mt-3 space-y-2 text-xs">
            {sources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.label}{sources.filter((s) => s.label === source.label).length > 1 ? ` · ${index + 1}` : ""}</a></li>)}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}
