import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PersonPortrait } from "@/components/person-portrait";
import { SiteNav } from "@/components/site-nav";
import { AwardResults, AwardRecipient } from "@/components/award-results";
import { getDirectAwardsForPerson, getWorkAwardsForPerson, getLinkedLegacyAwardIds, getAwardWork } from "@/lib/award-public-research";
import {
  humanizePersonRole,
  personLifeLabel,
} from "@/lib/person-public-research";
import type {
  PersonCompanyRelation,
  PersonPublicSource,
  PersonPublicView,
} from "@/lib/person-research-types";

function relationPeriod(relation: PersonCompanyRelation): string | null {
  if (relation.start && relation.end) return `${relation.start}-${relation.end}`;
  if (relation.start) return `Desde ${relation.start}`;
  if (relation.end) return `Hasta ${relation.end}`;
  return relation.pointInTime;
}

function SourceLink({ source, compact = false }: { source: PersonPublicSource; compact?: boolean }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1.5 font-medium text-accent hover:underline"
    >
      <span className={compact ? "truncate" : ""}>{source.title}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function SectionTitle({ children, detail }: { children: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-xl font-bold text-foreground">{children}</h2>
      {detail && <span className="text-xs font-medium text-muted">{detail}</span>}
    </div>
  );
}

export function PersonProfileDetail({ view }: { view: PersonPublicView }) {
  const { profile } = view;
  const life = personLifeLabel(profile);
  const founded = view.companyRelations.filter((relation) => relation.role === "FOUNDER");
  const directSources = new Map(view.sources.map((source) => [source.id, source]));
  const personalAwards = getDirectAwardsForPerson(profile.slug);
  const workAwards = getWorkAwardsForPerson(profile.slug);
  const linkedLegacyAwards = getLinkedLegacyAwardIds();
  const legacyAwards = view.awards.filter(award => !linkedLegacyAwards.has(award.id));

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1280px] px-4 py-7 md:px-6 md:py-10">
        <Link href="/persona" className="text-sm font-semibold text-accent hover:underline">
          Personas
        </Link>

        <header className="mt-5 grid gap-6 border-b border-border pb-8 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start">
          <figure className="min-w-0">
            <PersonPortrait
              src={profile.portrait?.path ?? null}
              name={profile.name}
              sizes="240px"
              priority
              className="aspect-[4/5] w-full rounded-lg border border-border"
            />
            {profile.portrait && (
              <figcaption className="mt-2 text-[11px] leading-4 text-muted">
                Retrato: {profile.portrait.artist ?? profile.portrait.credit ?? "autor indicado en la fuente"}.{" "}
                <a href={profile.portrait.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  Origen
                </a>
                {profile.portrait.licenseUrl ? (
                  <>
                    {" · "}
                    <a href={profile.portrait.licenseUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                      {profile.portrait.license}
                    </a>
                  </>
                ) : ` · ${profile.portrait.license}`}
              </figcaption>
            )}
          </figure>

          <div className="min-w-0 pt-1">
            <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Perfil revisado editorialmente
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight text-foreground md:text-5xl">{profile.name}</h1>
            {profile.nativeNames.length > 0 && (
              <p className="mt-2 text-base text-muted">{profile.nativeNames.join(" · ")}</p>
            )}
            <p className="mt-3 text-base text-foreground/75">
              {[life, profile.originDisplay, profile.birthPlace?.name].filter(Boolean).join(" · ")}
            </p>
            {profile.occupations.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.occupations.slice(0, 8).map((occupation) => (
                  <span key={occupation.qid || occupation.name} className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/80">
                    {occupation.name}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={`https://www.wikidata.org/wiki/${profile.qid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
                {profile.qid}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              {profile.officialWebsites.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
                  Sitio oficial<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-7 border-b border-border py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
          <div>
            <SectionTitle>Biografía</SectionTitle>
            <p className="mt-4 text-base leading-7 text-foreground/85">{profile.biographyEs}</p>
            {profile.careerSummaryEs && (
              <p className="mt-4 text-sm leading-6 text-muted">{profile.careerSummaryEs}</p>
            )}
          </div>
          <dl className="grid content-start gap-4 border-l-0 border-border lg:border-l lg:pl-7">
            {profile.birthDate && <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Nacimiento</dt><dd className="mt-1 text-sm text-foreground">{profile.birthDate}</dd></div>}
            {profile.deathDate && <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Fallecimiento</dt><dd className="mt-1 text-sm text-foreground">{profile.deathDate}</dd></div>}
            {profile.originDisplay && <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Origen documentado</dt><dd className="mt-1 text-sm text-foreground">{profile.originDisplay}</dd></div>}
            {profile.fieldsOfWork.length > 0 && <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Ámbitos</dt><dd className="mt-1 text-sm leading-6 text-foreground">{profile.fieldsOfWork.map((item) => item.name).join(" · ")}</dd></div>}
            {profile.education.length > 0 && <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Formación documentada</dt><dd className="mt-1 text-sm leading-6 text-foreground">{profile.education.map((item) => item.name).join(" · ")}</dd></div>}
          </dl>
        </section>

        {view.companyRelations.length > 0 && (
          <section className="border-b border-border py-8">
            <SectionTitle detail={`${view.companyRelations.length} relaciones verificadas`}>Compañías y cargos</SectionTitle>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {view.companyRelations.map((relation) => (
                <li key={relation.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                  <Link href={`/compania/${relation.companySlug}`} className="font-semibold text-foreground hover:text-accent">
                    {relation.companyName}
                  </Link>
                  <span className="text-sm text-foreground/75">{relation.roleLabelEs}</span>
                  <span className="text-xs text-muted">{relationPeriod(relation) ?? "Periodo no documentado"}</span>
                </li>
              ))}
            </ul>
            {founded.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                Empresas fundadas: {founded.map((relation) => relation.companyName).join(" · ")}
              </p>
            )}
          </section>
        )}

        {view.timeline.length > 0 && (
          <section className="border-b border-border py-8">
            <SectionTitle detail={`${view.timeline.length} hitos`}>Cronología</SectionTitle>
            <ol className="mt-4 divide-y divide-border border-y border-border">
              {view.timeline.map((item) => {
                const source = item.sourceId ? directSources.get(item.sourceId) : undefined;
                return (
                  <li key={item.id} className="grid gap-2 py-4 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:items-start">
                    <span className="text-sm font-bold text-accent">{item.dateLabel}</span>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      {item.detail && <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>}
                    </div>
                    {source && <SourceLink source={source} compact />}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {(view.exactCredits.length > 0 || view.relatedWorks.length > 0) && (
          <section className="grid gap-8 border-b border-border py-8 lg:grid-cols-2">
            <div>
              <SectionTitle detail={view.exactCredits.length}>Créditos verificados</SectionTitle>
              {view.exactCredits.length > 0 ? (
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {view.exactCredits.map((work) => (
                    <li key={work.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><h3 className="font-semibold text-foreground">{work.title}</h3><p className="mt-1 text-sm text-muted">{humanizePersonRole(work.role)}</p></div>
                        {work.year && <span className="text-xs font-medium text-muted">{work.year}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-muted">No hay créditos de función exacta publicados.</p>}
            </div>
            <div>
              <SectionTitle detail={view.relatedWorks.length}>Obras relacionadas</SectionTitle>
              <p className="mt-2 text-xs leading-5 text-muted">
                Asociación documental de obra destacada. No acredita por sí sola una función profesional concreta.
              </p>
              {view.relatedWorks.length > 0 && (
                <ul className="mt-3 divide-y divide-border border-y border-border">
                  {view.relatedWorks.map((work) => (
                    <li key={work.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="font-medium text-foreground">{work.title}</span>
                      {work.year && <span className="text-xs text-muted">{work.year}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {(profile.industryImpactEs || profile.publicReceptionEs) && (
          <section className="grid gap-8 border-b border-border py-8 lg:grid-cols-2">
            {profile.industryImpactEs && <div><SectionTitle>Impacto</SectionTitle><p className="mt-4 text-sm leading-7 text-foreground/85">{profile.industryImpactEs}</p></div>}
            {profile.publicReceptionEs && <div><SectionTitle>Recepción documentada</SectionTitle><p className="mt-4 text-sm leading-7 text-foreground/85">{profile.publicReceptionEs}</p></div>}
          </section>
        )}

        {(legacyAwards.length > 0 || personalAwards.length > 0 || workAwards.length > 0 || view.curiosities.length > 0) && (
          <section className="grid gap-8 border-b border-border py-8 lg:grid-cols-2">
            {(legacyAwards.length > 0 || personalAwards.length > 0 || workAwards.length > 0) && (
              <div>
                <SectionTitle>Premios y reconocimientos</SectionTitle>
                {(personalAwards.length > 0 || legacyAwards.length > 0) && <h3 className="mt-5 font-semibold">Premios personales y reconocimientos</h3>}
                <AwardResults results={personalAwards} recipients={false} />
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {legacyAwards.map((award) => <li key={award.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="font-medium text-foreground">{award.name}</span><span className="shrink-0 text-xs text-muted">{award.date ?? "Sin fecha"}</span></li>)}
                </ul>
                {workAwards.length > 0 && <div className="mt-6"><h3 className="font-semibold">Premios asociados a sus obras</h3>{workAwards.map(work => <div key={work.workKey} className="mt-4 border-t border-border pt-4"><AwardRecipient recipient={{ type: "game", workKey: work.workKey, displayName: getAwardWork(work.workKey)!.displayName }} /><p className="mt-2 text-sm text-muted">Rol: {work.roles.map(humanizePersonRole).join(" / ")}</p><p className="mt-1 text-xs font-semibold text-muted">Premio concedido a la obra</p><AwardResults results={work.results} recipients={false} /></div>)}</div>}
              </div>
            )}
            {view.curiosities.length > 0 && (
              <div>
                <SectionTitle>Curiosidades contrastadas</SectionTitle>
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {view.curiosities.map((item) => <li key={item.id} className="py-3 text-sm leading-6 text-foreground/80">{item.summaryEs}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="py-8">
          <SectionTitle detail={`Revisión: ${new Date(profile.lastChecked).toLocaleDateString("es-ES")}`}>Fuentes</SectionTitle>
          <ul className="mt-4 grid gap-x-8 gap-y-3 border-y border-border py-4 sm:grid-cols-2">
            {view.sources.map((source) => (
              <li key={source.id} className="min-w-0 text-sm">
                <SourceLink source={source} compact />
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted">{source.reliability}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
