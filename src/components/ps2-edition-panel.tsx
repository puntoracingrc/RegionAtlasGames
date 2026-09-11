import Image from "next/image";
import { Panel, PanelTitle } from "@/components/ui";
import { RegionFlag } from "@/components/region-flag";
import { Ps1RelatedEditions as RelatedEditions } from "@/components/ps1-related-editions";
import { relatedPs2Editions } from "@/lib/ps2-catalog";
import { getCoverSrc } from "@/lib/cover-url";
import { ps2GraphicLabel } from "@/lib/ps2-regional";
import { languageNames, languageSummary } from "@/lib/ps1-regional";
import type { CatalogGame, GameDetails } from "@/lib/types";

const METADATA_LABELS: Record<string, string> = {
  "Media": "Soporte", "Number Of Players": "Jugadores", "Number Of Memory Card Blocks": "Memoria necesaria",
  "Special Controllers Included Or Supported ( Official Only )": "Periféricos mencionados",
  "Network Adaptor (Ethernet) Compatible": "Juego en red", "Multi-Tap Function Compatible": "Multitap",
};
const displayValue = (value: string) => value.replace(/\bYes\b/g, "Sí").replace(/\bNone\b/g, "Ninguno")
  .replace(/\b1 Player\b/g, "1 jugador").replace(/\bPlayers?\b/g, "jugadores").replace(/\bMinimum\b/g, "mínimo");

export function Ps2EditionPanel({ game, details }: { game: CatalogGame; details?: GameDetails }) {
  const profile = details?.ps2Edition;
  if (game.platformSlug !== "ps2" || !profile) return null;
  const graphics = profile.graphics.filter((asset) => asset.stored && asset.url && !asset.identifierDifference);
  const sources = [...new Map(profile.sources.map((source) => [source.url, source])).values()];
  const related = relatedPs2Editions(game);
  const languageConflict = profile.findings?.some((f) => /contradicci[oó]n|texto de la ficha puede ser incompleto|afirmaci[oó]n textual puede ser incompleta/i.test(`${f.observation} ${f.engineRule}`));
  const language = profile.languages;
  const releaseNeedsReview = profile.sourceWarnings?.includes("release_date_precedes_ps2_retail_launch");
  return <Panel>
    <PanelTitle>Edición, idiomas y documentación</PanelTitle>
    {profile.status === "review" ? <p className="text-sm leading-6 text-muted">Esta ficha conserva su dirección y su historial. Su mercado o presentación concreta todavía necesita contraste. Las ediciones documentadas del mismo juego permiten comparar sus códigos y carátulas.</p> : <>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Mercado del software</dt><dd className="mt-1"><RegionFlag region={game.region} showLabel /></dd></div>
        <div><dt className="font-semibold">Familia regional</dt><dd className="mt-1 text-muted">{game.regionFamily}</dd></div>
        {profile.editionLabels?.length ? <div><dt className="font-semibold">Presentación documentada</dt><dd className="mt-1 text-muted">{profile.editionLabels.join(" · ")}</dd></div> : null}
        {language?.all.length ? <div><dt className="font-semibold">Idiomas declarados{languageConflict ? " · por contrastar" : ""}</dt><dd className="mt-1 text-muted" title={languageNames(language.all)}>{languageSummary(language.all)}</dd></div> : null}
        {language?.text.length ? <div><dt className="font-semibold">Textos y menús según la ficha</dt><dd className="mt-1 text-muted">{languageNames(language.text)}</dd></div> : null}
        {language?.audio.length ? <div><dt className="font-semibold">Voces según la ficha</dt><dd className="mt-1 text-muted">{languageNames(language.audio)}</dd></div> : null}
        {profile.components.length ? <div className="sm:col-span-2"><dt className="font-semibold">Códigos documentados de disco</dt><dd className="mt-2 flex flex-wrap gap-2">{profile.components.map((piece) => <code key={`${piece.serial}:${piece.number}`} className="break-all rounded bg-foreground/5 px-2 py-1 text-xs">{profile.components.length > 1 ? `${piece.number}: ` : ""}{piece.serial}{piece.title ? ` · ${piece.title}` : ""}</code>)}</dd></div> : null}
        {profile.regionalReleaseDate?.raw ? <div><dt className="font-semibold">{releaseNeedsReview ? "Lanzamiento por contrastar" : "Lanzamiento documentado"}</dt><dd className="mt-1 text-muted">{releaseNeedsReview ? "La fecha de la fuente es anterior al lanzamiento de PS2 y necesita revisión." : <>{profile.regionalReleaseDate.iso ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${profile.regionalReleaseDate.iso}T12:00:00Z`)) : profile.regionalReleaseDate.raw}<span className="block text-xs">Según la ficha de PSX Data Center; las reediciones de la galería pueden tener otra fecha.</span></>}</dd></div> : null}
        {Object.entries(profile.softwareMetadata ?? {}).filter(([key]) => METADATA_LABELS[key]).map(([key, value]) => <div key={key}><dt className="font-semibold">{METADATA_LABELS[key]}</dt><dd className="mt-1 text-muted">{displayValue(value)}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted">La región del disco y el país de su carátula pueden tener distinto alcance. El idioma del juego no confirma el de la caja o el manual. Los periféricos citados pueden ser compatibles sin estar incluidos.</p>
    </>}
    {language?.discrepancy || languageConflict ? <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm">Las fuentes no coinciden en todos los idiomas. Consulta los detalles y las imágenes antes de atribuirlos a una edición concreta.</p> : null}
    <RelatedEditions game={game} editions={related} />
    {profile.findings?.length ? <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Detalles para coleccionistas ({profile.findings.length})</summary><ul className="mt-3 space-y-4 text-sm">{profile.findings.map((finding) => <li key={finding.id}><p className="font-semibold">{finding.title}</p><p className="mt-1 leading-6 text-muted">{finding.observation}</p><p className="mt-1 leading-6 text-muted">{finding.engineRule}</p><a href={finding.evidence[0]?.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline">Referencia documental</a></li>)}</ul></details> : null}
    {graphics.length ? <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold">Portadas, contraportadas y componentes ({graphics.length})</summary>
      <p className="mt-2 text-xs leading-5 text-muted">La galería puede reunir papeles de varios países y reediciones. Cada imagen conserva la etiqueta y el mercado indicado por la fuente; no constituye una combinación de fábrica certificada.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">{graphics.map((asset) => {
        const src = getCoverSrc(asset.url);
        if (!src) return null;
        const side = ps2GraphicLabel(asset);
        const edition = (asset.label ?? "").replace(/\bFRONT\b|\bBACK\b/gi, "").replace(/^[\s-]+|[\s-]+$/g, "");
        return <figure key={`${asset.assetId}:${asset.group}:${asset.marketHints.join("-")}`} className="min-w-0 rounded-lg border border-border p-2"><a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar ${side.toLowerCase()} de ${game.title}`}><Image unoptimized src={src} width={asset.width ?? 400} height={asset.height ?? 560} alt={`${side} de ${game.title} · ${asset.marketHints.join(" / ")}`} className="h-44 w-full object-contain" /></a><figcaption className="mt-2 break-words text-xs text-muted">{side}{edition ? ` · ${edition}` : ""} · {asset.marketHints.join(" / ") || "Mercado por confirmar"} · <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Fuente</a>{asset.thumbnailOnly ? <span className="block">Miniatura; original completo no disponible.</span> : null}</figcaption></figure>;
      })}</div>
    </details> : null}
    {sources.length ? <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-xs font-semibold text-muted">Consultar fuentes</summary><ul className="mt-3 space-y-2 text-xs">{sources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.label} · {index + 1}</a></li>)}</ul></details> : null}
  </Panel>;
}
