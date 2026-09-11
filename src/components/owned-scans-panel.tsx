import Image from "next/image";
import { Panel, PanelTitle } from "@/components/ui";
import type { OwnedScanSet } from "@/lib/catalog-owned-scans";

export function OwnedScansPanel({ scans, title }: { scans?: OwnedScanSet; title: string }) {
  if (!scans) return null;
  return (
    <Panel>
      <PanelTitle>Carátula y componentes escaneados</PanelTitle>
      <p className="text-sm leading-6 text-muted">{scans.packaging.marketEvidence}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Idiomas de la carátula</dt><dd className="mt-1 text-muted">{scans.packaging.languages.join(" · ")}</dd></div>
        {scans.packaging.ean ? <div><dt className="font-semibold">EAN de esta caja</dt><dd className="mt-1 font-mono text-muted">{scans.packaging.ean}</dd></div> : null}
        {scans.packaging.discIdentifiers?.map(identifier => <div key={identifier.label}><dt className="font-semibold">{identifier.label}</dt><dd className="mt-1 font-mono text-muted">{identifier.value}</dd></div>)}
        {scans.packaging.productNumber ? <div><dt className="font-semibold">Referencia impresa de la caja</dt><dd className="mt-1 font-mono text-muted">{scans.packaging.productNumber}</dd></div> : null}
        {scans.packaging.languageStatement ? <div><dt className="font-semibold">Indicación de idioma en la caja</dt><dd className="mt-1 text-muted">«{scans.packaging.languageStatement}»</dd></div> : null}
        {scans.softwareLanguagesPrinted ? <>
          <div><dt className="font-semibold">Textos del juego según la caja</dt><dd className="mt-1 text-muted">{scans.softwareLanguagesPrinted.text.join(" · ")}</dd></div>
          <div><dt className="font-semibold">Voces según la caja</dt><dd className="mt-1 text-muted">{scans.softwareLanguagesPrinted.audio.join(" · ")}</dd></div>
        </> : null}
      </dl>
      {scans.notes.map(note => <p key={note} className="mt-3 text-xs leading-5 text-muted">{note}</p>)}
      <details className="mt-4 border-t border-border pt-4" open>
        <summary className="cursor-pointer text-sm font-semibold">Ver portadas y componentes ({scans.images.length})</summary>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {scans.images.map(asset => <figure key={asset.url} className="min-w-0 rounded-lg border border-border p-2">
            <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar ${asset.label.toLowerCase()} de ${title}`}>
              <Image unoptimized src={asset.thumbnailUrl} width={asset.width} height={asset.height} alt={`${asset.label} de ${title} · ${scans.identity.region}`} className="h-44 w-full object-contain" />
            </a>
            <figcaption className="mt-2 break-words text-xs leading-5 text-muted">{asset.label}{asset.redactedCodes ? <span className="block">Códigos de canje ocultos.</span> : null}</figcaption>
          </figure>)}
        </div>
      </details>
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">{scans.sourceLabel} · {new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${scans.capturedAt}T12:00:00Z`))}.</p>
    </Panel>
  );
}
