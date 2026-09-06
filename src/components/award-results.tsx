import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui";
import { getAwardResultContext, getAwardSources, getAwardWork, getAwardsForWorkKey, getDirectAwardsForCompany, getDevelopedGameAwardsForCompany, getPublishedGameAwardsForCompany } from "@/lib/award-public-research";
import { isWinningAwardResult } from "@/lib/award-domain";
import type { AwardPublicResult, AwardRecipientRef } from "@/lib/award-research-types";
import { getCatalogGame, isPublicCatalogGame } from "@/lib/catalog";
import { catalogGamePath } from "@/lib/catalog-url";
import { getCatalogWorkKey } from "@/lib/catalog-work";
import { getCoverSrc } from "@/lib/cover-url";
import { getPublicPersonView } from "@/lib/person-public-research";
import { getCompany } from "@/lib/indexes";
import { resolveCompanyLogo } from "@/lib/company-logo";
import { getStoredCompanyProfile } from "@/lib/company-profile";
import { approvedAwardLogo, getAwardVisualIdentity } from "@/lib/award-visual-identity";
import { CompanyLogo } from "@/components/company-logo";
import { PersonPortrait } from "@/components/person-portrait";
import { AwardLogo } from "@/components/award-logo";

export function getAwardCatalogGame(workKey: string) {
  return getAwardWork(workKey)?.catalogIdsVerified.map(getCatalogGame).find(g => g && isPublicCatalogGame(g));
}

export function AwardRecipient({ recipient, image = false }: { recipient: AwardRecipientRef; image?: boolean }) {
  const game = recipient.type === "game" && recipient.workKey ? getAwardCatalogGame(recipient.workKey) : undefined;
  const cover = game ? getCoverSrc(game.coverUrl, game.id) : null;
  const person = recipient.type === "person" && recipient.personSlug ? getPublicPersonView(recipient.personSlug)?.profile : undefined;
  const company = recipient.type === "company" && recipient.companySlug ? getCompany(recipient.companySlug) : undefined;
  const logo = company ? resolveCompanyLogo(company.slug, getStoredCompanyProfile(company.slug)?.logoUrl) : null;
  const href = game ? catalogGamePath(game) : person ? `/persona/${person.slug}` : company ? `/compania/${company.slug}` : null;
  const visual = cover ? <Image src={cover} alt={recipient.displayName} width={64} height={88} sizes="64px" unoptimized className="h-[88px] w-16 shrink-0 object-contain" />
    : person ? <PersonPortrait src={person.portrait?.path ?? null} name={person.name} sizes="64px" fit="contain" className="h-[88px] w-16" />
    : company && logo?.url ? <CompanyLogo name={company.name} logoUrl={logo.url} provisional={logo.provisional} /> : null;
  const name = href ? <Link href={href} className="font-semibold hover:text-accent hover:underline">{recipient.displayName}</Link> : <span className="font-semibold">{recipient.displayName}</span>;
  return <div className="flex min-w-0 items-center gap-3">
    {image && visual && href && <Link href={href} className="shrink-0">{visual}</Link>}
    <div className="min-w-0 break-words">{name}</div>
  </div>;
}

const labels = { winner: "Ganador", nominee: "Nominado", finalist: "Finalista", honorable_mention: "Mención de honor", recipient: "Galardonado", special_recognition: "Reconocimiento especial" };

export function AwardResultList({ results, recipients = true, covers = false }: { results: AwardPublicResult[]; recipients?: boolean; covers?: boolean }) {
  if (!results.length) return null;
  return <ul className="divide-y divide-border">
    {results.map(result => {
      const { series, edition, category } = getAwardResultContext(result);
      return <li key={result.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {approvedAwardLogo(getAwardVisualIdentity(series.slug), edition.editionYear) && <Link href={`/premios/${series.slug}`}><AwardLogo slug={series.slug} name={series.canonicalName} year={edition.editionYear} small /></Link>}
            <Link href={`/premios/${series.slug}`} className="hover:text-accent">{series.shortName ?? series.canonicalName}</Link>
            <Link href={`/premios/${series.slug}/${edition.editionYear}`} className="font-semibold hover:text-accent">{series.shortName ?? series.canonicalName} {edition.editionYear}</Link>
            <span>{labels[result.resultType]}{result.shared ? " · Compartido" : ""}</span>
          </div>
          {recipients && result.recipients.map((recipient, index) => <AwardRecipient key={index} recipient={recipient} image={covers} />)}
          <Link href={`/premios/${series.slug}/categoria/${category.slug}`} className="inline-block text-sm text-accent hover:underline">{result.officialLabel ?? category.displayName}</Link>
        </div>
        <div className="flex flex-wrap items-start gap-3 text-xs sm:max-w-48">
          {getAwardSources(result.sourceIds).map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" title={source.title} className="inline-flex items-center gap-1 text-muted hover:text-accent">Fuente oficial<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>)}
        </div>
      </li>;
    })}
  </ul>;
}

export function AwardResults({ results, recipients = true }: { results: AwardPublicResult[]; recipients?: boolean }) {
  const wins = results.filter(isWinningAwardResult);
  const nominations = results.filter(r => !isWinningAwardResult(r));
  const top = wins.filter(r => getAwardResultContext(r).category.categoryType === "top_game");
  const other = wins.filter(r => getAwardResultContext(r).category.categoryType !== "top_game");
  return <>
    <AwardResultList results={top} recipients={recipients} covers />
    <AwardResultList results={other} recipients={recipients} covers />
    {!!nominations.length && <details className="border-t border-border py-3"><summary className="cursor-pointer text-sm font-semibold">Nominaciones y menciones ({nominations.length})</summary><AwardResultList results={nominations} recipients={recipients} /></details>}
  </>;
}

export function CatalogAwards({ catalogId }: { catalogId: string }) {
  const results = getAwardsForWorkKey(getCatalogWorkKey(catalogId));
  if (!results.length) return null;
  return <Panel>
    <PanelTitle>Premios y reconocimientos</PanelTitle>
    <p className="mt-2 text-sm text-muted">Premios concedidos a la obra, no a esta edición comercial.</p>
    <AwardResults results={results} recipients={false} />
  </Panel>;
}

export function CompanyAwards({ companySlug }: { companySlug: string }) {
  const groups = [
    { title: "Premios directos de la compañía", results: getDirectAwardsForCompany(companySlug) },
    { title: "Premios de juegos desarrollados", results: getDevelopedGameAwardsForCompany(companySlug).map(r => r.result) },
    { title: "Premios de juegos publicados", results: getPublishedGameAwardsForCompany(companySlug).map(r => r.result) },
  ].filter(g => g.results.length);
  if (!groups.length) return null;
  return <section className="mb-10 border-y border-border py-6"><h2 className="text-xl font-bold">Premios y reconocimientos</h2>
    <div className="mt-4 grid gap-x-8 lg:grid-cols-2">{groups.map(group => <div key={group.title} className="min-w-0"><h3 className="font-semibold">{group.title}</h3><AwardResults results={[...new Map(group.results.map(r => [r.id, r])).values()]} /></div>)}</div>
  </section>;
}
