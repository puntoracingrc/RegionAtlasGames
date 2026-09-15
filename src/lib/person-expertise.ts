export const PERSON_EXPERTISE_TAXONOMY = [
  {
    value: "design",
    label: "Diseño",
    patterns: [/\bdisen/, /\bdesign/, /\bconcepto/, /\bconcepcion/],
  },
  {
    value: "programming",
    label: "Programación",
    patterns: [
      /\bprogram/,
      /\bsoftware\b/,
      /\bdeveloper\b/,
      /\bdesarrollador/,
      /\bdesarrollo tecnologico\b/,
      /\bingenier[oa] de sistemas\b/,
      /\barquitect[oa] de sistemas\b/,
      /\barquitectura (?:de )?plataforma\b/,
      /\bmotor(?:es)?\b/,
      /\bemulacion\b/,
      /\binformatic[oa]\b/,
    ],
  },
  {
    value: "hardware",
    label: "Hardware",
    patterns: [
      /\bhardware\b/,
      /\bingenieria electrica\b/,
      /\bingeniero electrico\b/,
      /\barquitectura (?:de )?(?:consola|hardware)\b/,
      /\bhardware engineering\b/,
      /\bsensores\b/,
    ],
  },
  {
    value: "direction",
    label: "Dirección",
    patterns: [/\bdireccion\b/, /\bdirector/, /\bstudio head\b/, /\bhead of\b/],
  },
  {
    value: "production",
    label: "Producción",
    patterns: [/\bproduccion\b/, /\bproductor/, /\bproducer\b/],
  },
  {
    value: "business_marketing",
    label: "Negocio y marketing",
    patterns: [
      /\bmarketing\b/,
      /\bmercado\b/,
      /\bcomercial/,
      /\bnegocio\b/,
      /\bbusiness development\b/,
      /\bempresari/,
      /\bemprendedor/,
      /\bentrepreneur\b/,
      /\blicenc/,
      /\bpublicacion\b/,
      /\bpublishing\b/,
      /\brelaciones con (?:desarrolladores|indies)/,
      /\bcomunidad\b/,
      /\bcommunications?\b/,
      /\bpublicitari/,
      /\bacquisition\b/,
      /\badquisicion\b/,
    ],
  },
  {
    value: "writing_narrative",
    label: "Escritura y narrativa",
    patterns: [
      /\bguion/,
      /\bescritor/,
      /\bwriter\b/,
      /\bnarrativ/,
      /\bstory\b/,
      /\beditorial\b/,
    ],
  },
  {
    value: "research",
    label: "Investigación",
    patterns: [
      /\binvestig/,
      /\bresearch\b/,
      /\bcientific/,
      /\bscience\b/,
      /\bneurocientific/,
      /\bmatematic/,
      /\bprofesor/,
      /\binventor/,
      /\binvencion\b/,
      /\bprototip/,
    ],
  },
  {
    value: "music",
    label: "Música",
    patterns: [/\bmusica\b/, /\bmusic\b/, /\bcompositor/, /\bsonido\b/, /\baudio\b/],
  },
  {
    value: "art",
    label: "Arte",
    patterns: [
      /\barte\b/,
      /\bartista\b/,
      /\bartist/,
      /\bilustr/,
      /\bgrafic[oa]\b/,
      /\bdireccion artistica\b/,
    ],
  },
  {
    value: "founder",
    label: "Fundadores",
    patterns: [/\bfundador/, /\bfundacion\b/, /\bfounder\b/, /\bcofounder\b/],
  },
  {
    value: "executive",
    label: "Gestión",
    patterns: [
      /\bejecutiv/,
      /\bpresident/,
      /\bceo\b/,
      /\bchairman\b/,
      /\bchief (?:operating|financial|content) officer\b/,
      /\bmanaging (?:director|executive|officer)\b/,
      /\bmanager\b/,
      /\bvicepresident/,
      /\bvice president\b/,
      /\bliderazgo (?:empresarial|corporativo|operativo|de estudio|de plataforma)\b/,
      /\bgobierno corporativo\b/,
    ],
  },
  {
    value: "other",
    label: "Otras especialidades",
    patterns: [],
  },
] as const satisfies readonly {
  value: string;
  label: string;
  patterns: readonly RegExp[];
}[];

export type PersonExpertise = (typeof PERSON_EXPERTISE_TAXONOMY)[number]["value"];

export type PersonExpertiseFilterOption = {
  value: PersonExpertise;
  label: string;
  count: number;
};

export function normalizePersonExpertiseText(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("_", " ");
}

export function classifyPersonExpertiseTerms(terms: Iterable<string>): PersonExpertise[] {
  const haystack = normalizePersonExpertiseText([...terms].filter(Boolean).join(" "));
  const matches = PERSON_EXPERTISE_TAXONOMY.filter(
    (definition) =>
      definition.value !== "other" &&
      definition.patterns.some((pattern) => pattern.test(haystack)),
  ).map((definition) => definition.value);

  return matches.length > 0 ? matches : ["other"];
}

export function getAvailablePersonExpertiseFilters(
  people: ReadonlyArray<{ expertise: readonly PersonExpertise[] }>,
): PersonExpertiseFilterOption[] {
  const counts = new Map<PersonExpertise, number>();
  for (const person of people) {
    for (const expertise of new Set(person.expertise)) {
      counts.set(expertise, (counts.get(expertise) ?? 0) + 1);
    }
  }

  return PERSON_EXPERTISE_TAXONOMY.flatMap((definition) => {
    const count = counts.get(definition.value) ?? 0;
    return count > 0 ? [{ value: definition.value, label: definition.label, count }] : [];
  });
}
