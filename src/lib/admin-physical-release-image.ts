import type { CatalogPhysicalEvidenceType } from "./catalog-edition-guide-types";
import type { CatalogPhysicalReleaseGroup } from "./types";

export const PHYSICAL_RELEASE_IMAGE_ROLES = ["front", "back", "spine", "contents"] as const;
export type PhysicalReleaseImageRole = (typeof PHYSICAL_RELEASE_IMAGE_ROLES)[number];

const IMAGE_ROLE_LABELS: Record<PhysicalReleaseImageRole, string> = {
  front: "Portada",
  back: "Contraportada",
  spine: "Lomo",
  contents: "Contenido / desplegable",
};

export function isPhysicalReleaseImageRole(value: string): value is PhysicalReleaseImageRole {
  return PHYSICAL_RELEASE_IMAGE_ROLES.includes(value as PhysicalReleaseImageRole);
}

export function buildPhysicalReleaseImageUploadSlug(input: {
  catalogId: string;
  role: PhysicalReleaseImageRole;
  version: string;
}): string {
  return `${input.catalogId}-${input.role}-${input.version}`;
}

export function upsertPhysicalReleaseImage(
  group: CatalogPhysicalReleaseGroup,
  input: {
    role: PhysicalReleaseImageRole;
    url: string;
    width: number;
    height: number;
    evidenceType: CatalogPhysicalEvidenceType;
  },
): CatalogPhysicalReleaseGroup {
  const key = `${group.id}:${input.role}`;
  const caption = IMAGE_ROLE_LABELS[input.role];
  const image = {
    key,
    placement: input.role === "contents" ? "CONTENTS" as const : "GALLERY" as const,
    url: input.url,
    thumbnailUrl: input.url,
    width: input.width,
    height: input.height,
    caption,
    evidenceType: input.evidenceType,
  };
  const images = (group.images ?? []).filter((current) =>
    current.key !== key && current.caption.toLocaleLowerCase("es") !== caption.toLocaleLowerCase("es")
  );

  return {
    ...group,
    coverUrl: input.role === "front" ? input.url : group.coverUrl,
    images: [...images, image],
  };
}
