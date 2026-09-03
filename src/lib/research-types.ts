export type ResearchSubjectType = "company" | "person";

export type ResearchConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type ResearchPublicationStatus = "blocked" | "draft" | "internal" | "published";

export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  kind: string;
  reliability: string;
  languages: string[];
  subjectSlugs: string[];
  supportsFields: string[];
  retrievedAt: string;
  verifiedPrimary: boolean;
  registryState: "registered" | "missing";
};

export type ResearchFieldProvenance = {
  id: string;
  subjectType: ResearchSubjectType;
  subjectSlug: string;
  fieldPath: string;
  value: string;
  confidence: ResearchConfidence;
  sourceIds: string[];
  lastChecked: string;
  publicationStatus: ResearchPublicationStatus;
};

export type ResearchEntityRef = {
  subjectType: ResearchSubjectType;
  slug: string;
};

export type ResearchRelation = {
  id: string;
  source: ResearchEntityRef;
  target: ResearchEntityRef;
  relationType: string;
  startDate: string | null;
  endDate: string | null;
  pointInTime: string | null;
  sourceIds: string[];
  confidence: ResearchConfidence;
  publicationStatus: ResearchPublicationStatus;
};
