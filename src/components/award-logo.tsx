import Image from "next/image";
import { approvedAwardLogo, awardIdentityForYear, getAwardVisualIdentity } from "@/lib/award-visual-identity";

export function AwardLogo({ slug, name, year, small = false }: { slug: string; name: string; year?: number; small?: boolean }) {
  const identity = awardIdentityForYear(getAwardVisualIdentity(slug), year);
  const src = approvedAwardLogo(identity, year);
  if (!src) return null;
  return <div className={`relative shrink-0 rounded bg-white ${small ? "h-10 w-16" : "h-24 w-48"}`}>
    <Image src={src} alt={`Logo de ${name}${identity?.editionYear ? ` ${identity.editionYear}` : ""}`} fill sizes={small ? "64px" : "192px"} className={`object-contain ${small ? "p-2" : "p-4"}`} />
  </div>;
}
