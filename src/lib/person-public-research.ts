import publicResearchData from "../../data/research/person-study/public.json";
import type {
  CompanyPersonLink,
  PersonCardData,
  PersonCompanyRelation,
  PersonExpertise,
  PersonPublicData,
  PersonPublicProfile,
  PersonPublicSource,
  PersonPublicView,
  PersonTimelineItem,
  PersonWork,
} from "./person-research-types";

const data = publicResearchData as unknown as PersonPublicData;
const profiles = new Map(data.profiles.map((profile) => [profile.slug, profile]));
const sources = new Map(data.sources.map((source) => [source.id, source]));

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function rowsFor<T extends { personSlug: string }>(rows: T[], personSlug: string): T[] {
  return rows.filter((row) => row.personSlug === personSlug);
}

function expertiseFor(
  profile: PersonPublicProfile,
  relations: PersonCompanyRelation[],
  credits: PersonWork[],
): PersonExpertise[] {
  const haystack = normalize(
    [
      ...profile.occupations.map((item) => item.name),
      ...profile.fieldsOfWork.map((item) => item.name),
      ...relations.flatMap((item) => [item.role, item.roleLabelEs]),
      ...credits.map((item) => item.role),
    ].join(" "),
  );
  const matches: [PersonExpertise, RegExp][] = [
    ["design", /disen|design/],
    ["programming", /program|ingenier|software|motor/],
    ["direction", /direccion|director|directora/],
    ["production", /produccion|productor|productora/],
    ["music", /music|compositor|compositora|sonido/],
    ["art", /arte|artist|ilustr|grafico|grafica/],
    ["founder", /founder|fundador|fundadora/],
    ["executive", /ejecutiv|president|liderazgo empresarial|ceo/],
  ];
  return matches.filter(([, pattern]) => pattern.test(haystack)).map(([value]) => value);
}

export function personLifeLabel(profile: PersonPublicProfile): string | null {
  const birth = profile.birthYear ?? profile.birthDate;
  const death = profile.deathYear ?? profile.deathDate;
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `Nac. ${birth}`;
  if (death) return `Falleció en ${death}`;
  return null;
}

function cardFor(profile: PersonPublicProfile): PersonCardData {
  const relations = rowsFor(data.companyRelations, profile.slug);
  const credits = rowsFor(data.exactCredits, profile.slug);
  const relatedWorks = rowsFor(data.relatedWorks, profile.slug);
  const companies = uniqueBy(
    relations.map((relation) => ({ slug: relation.companySlug, name: relation.companyName })),
    (company) => company.slug,
  );
  const works = uniqueBy([...credits, ...relatedWorks], (work) => work.title)
    .slice(0, 2)
    .map((work) => work.title);
  const occupations = uniqueBy(profile.occupations, (occupation) => occupation.name)
    .slice(0, 3)
    .map((occupation) => occupation.name);
  const searchHaystack = normalize(
    [
      profile.name,
      profile.slug,
      ...profile.aliases,
      ...profile.nativeNames,
      profile.originDisplay ?? "",
      ...profile.citizenships.map((item) => item.name),
      ...profile.occupations.map((item) => item.name),
      ...profile.fieldsOfWork.map((item) => item.name),
      ...companies.map((company) => company.name),
      ...works,
    ].join(" "),
  );
  return {
    slug: profile.slug,
    name: profile.name,
    publicationLevel: profile.publicationLevel,
    portraitPath: profile.portrait?.path ?? null,
    lifeLabel: personLifeLabel(profile),
    origin: profile.originDisplay,
    occupations,
    companies: companies.slice(0, 3),
    works,
    expertise: expertiseFor(profile, relations, credits),
    searchHaystack,
  };
}

function dateLabel(start: string | null, end: string | null, pointInTime: string | null): string {
  if (start && end) return `${start}-${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Hasta ${end}`;
  return pointInTime ?? "Fecha no documentada";
}

function firstYear(...values: (string | number | null)[]): number | null {
  for (const value of values) {
    const match = String(value ?? "").match(/\b(18|19|20)\d{2}\b/);
    if (match) return Number(match[0]);
  }
  return null;
}

function timelineFor(view: Omit<PersonPublicView, "timeline">): PersonTimelineItem[] {
  const timeline: PersonTimelineItem[] = [];
  const profile = view.profile;
  if (profile.birthDate || profile.birthYear) {
    timeline.push({
      id: `${profile.slug}-birth`,
      dateLabel: String(profile.birthDate ?? profile.birthYear),
      sortYear: profile.birthYear,
      title: "Nacimiento",
      detail: profile.birthPlace?.name ?? profile.originDisplay,
      kind: "life",
      sourceId: profile.fieldSources.life?.[0] ?? null,
    });
  }
  for (const relation of view.companyRelations) {
    timeline.push({
      id: relation.id,
      dateLabel: dateLabel(relation.start, relation.end, relation.pointInTime),
      sortYear: firstYear(relation.start, relation.pointInTime, relation.end),
      title: relation.roleLabelEs,
      detail: relation.companyName,
      kind: "company",
      sourceId: relation.sourceId,
    });
  }
  for (const position of view.positions) {
    timeline.push({
      id: position.id,
      dateLabel: dateLabel(position.start, position.end, position.pointInTime),
      sortYear: firstYear(position.start, position.pointInTime, position.end),
      title: position.name,
      detail: null,
      kind: "position",
      sourceId: position.sourceId,
    });
  }
  for (const work of view.exactCredits) {
    timeline.push({
      id: work.id,
      dateLabel: work.year != null ? String(work.year) : "Fecha no documentada",
      sortYear: firstYear(work.year),
      title: work.title,
      detail: humanizePersonRole(work.role),
      kind: "work",
      sourceId: work.sourceId,
    });
  }
  for (const award of view.awards) {
    timeline.push({
      id: award.id,
      dateLabel: award.date != null ? String(award.date) : "Fecha no documentada",
      sortYear: firstYear(award.date),
      title: award.name,
      detail: "Premio o reconocimiento documentado",
      kind: "award",
      sourceId: award.sourceId,
    });
  }
  if (profile.deathDate || profile.deathYear) {
    timeline.push({
      id: `${profile.slug}-death`,
      dateLabel: String(profile.deathDate ?? profile.deathYear),
      sortYear: profile.deathYear,
      title: "Fallecimiento",
      detail: null,
      kind: "life",
      sourceId: profile.fieldSources.life?.[0] ?? null,
    });
  }
  return timeline.sort(
    (a, b) =>
      (a.sortYear ?? Number.MAX_SAFE_INTEGER) - (b.sortYear ?? Number.MAX_SAFE_INTEGER) ||
      a.title.localeCompare(b.title, "es"),
  );
}

export function humanizePersonRole(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("es"));
}

export function getPublicPersonProfiles(): PersonPublicProfile[] {
  return data.profiles;
}

export function getPublicPersonSlugs(): string[] {
  return data.profiles.map((profile) => profile.slug);
}

export function getPersonCards(): PersonCardData[] {
  return data.profiles.map(cardFor);
}

export function getPublicPersonView(slug: string): PersonPublicView | undefined {
  const profile = profiles.get(slug);
  if (!profile) return undefined;
  const partial = {
    profile,
    companyRelations: rowsFor(data.companyRelations, slug),
    positions: rowsFor(data.positions, slug),
    exactCredits: rowsFor(data.exactCredits, slug),
    relatedWorks: rowsFor(data.relatedWorks, slug),
    awards: rowsFor(data.awards, slug),
    curiosities: rowsFor(data.curiosities, slug),
    sources: [] as PersonPublicSource[],
  };
  const sourceIds = new Set([
    ...profile.sourceIds,
    profile.portrait?.sourceId,
    ...partial.companyRelations.map((row) => row.sourceId),
    ...partial.positions.map((row) => row.sourceId),
    ...partial.exactCredits.map((row) => row.sourceId),
    ...partial.relatedWorks.map((row) => row.sourceId),
    ...partial.awards.map((row) => row.sourceId),
    ...partial.curiosities.map((row) => row.sourceId),
  ].filter((sourceId): sourceId is string => Boolean(sourceId)));
  partial.sources = [...sourceIds]
    .map((sourceId) => sources.get(sourceId))
    .filter((source): source is PersonPublicSource => Boolean(source));
  return { ...partial, timeline: timelineFor(partial) };
}

export function getPublicPeopleForCompany(companySlug: string): CompanyPersonLink[] {
  const grouped = new Map<string, PersonCompanyRelation[]>();
  for (const relation of data.companyRelations) {
    if (relation.companySlug !== companySlug) continue;
    const current = grouped.get(relation.personSlug) ?? [];
    current.push(relation);
    grouped.set(relation.personSlug, current);
  }
  return [...grouped.entries()]
    .map(([personSlug, relations]) => {
      const profile = profiles.get(personSlug);
      if (!profile) return null;
      return {
        slug: personSlug,
        name: profile.name,
        portraitPath: profile.portrait?.path ?? null,
        roles: [...new Set(relations.map((relation) => relation.roleLabelEs))],
        periods: [...new Set(relations.map((relation) => dateLabel(
          relation.start,
          relation.end,
          relation.pointInTime,
        )).filter((label) => label !== "Fecha no documentada"))],
      };
    })
    .filter((person): person is CompanyPersonLink => Boolean(person))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function getPersonPublicSource(sourceId: string): PersonPublicSource | undefined {
  return sources.get(sourceId);
}
