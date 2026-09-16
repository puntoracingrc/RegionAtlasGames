import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonProfileDetail } from "@/components/person-profile-detail";
import {
  getPublicPersonSlugs,
  getPublicPersonView,
  personLifeLabel,
} from "@/lib/person-public-research";
import { readAdminPersonPortraitsSafely } from "@/lib/person-portrait-storage";
import { getSiteUrl } from "@/lib/site-url";

type Props = { params: Promise<{ slug: string }> };

function clip(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function generateStaticParams() {
  return getPublicPersonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = getPublicPersonView(slug);
  if (!view) return { title: "Persona no encontrada" };
  const { profile } = view;
  const uploadedPortrait = (await readAdminPersonPortraitsSafely())[slug];
  const portraitPath = uploadedPortrait?.path ?? profile.portrait?.path ?? null;
  const url = `${getSiteUrl()}/persona/${profile.slug}`;
  const description = clip(profile.biographyEs);
  const title = `${profile.name}${personLifeLabel(profile) ? ` · ${personLifeLabel(profile)}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | Region Atlas`,
      description,
      url,
      type: "profile",
      images: portraitPath ? [{ url: portraitPath, alt: `Retrato de ${profile.name}` }] : undefined,
    },
  };
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params;
  const view = getPublicPersonView(slug);
  if (!view) notFound();
  const uploadedPortrait = (await readAdminPersonPortraitsSafely())[slug] ?? null;
  return <PersonProfileDetail view={view} uploadedPortrait={uploadedPortrait} />;
}
