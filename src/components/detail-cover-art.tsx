import { CoverArt } from "@/components/cover-art";
import { coverHighlightClass } from "@/lib/card-highlight";
import { coverDetailSizeClass } from "@/lib/cover-aspect";
import { cn } from "@/lib/cn";

type Props = {
  src: string | null;
  alt: string;
  platformSlug?: string | null;
  owned?: boolean;
  grail?: boolean;
  topSegment?: boolean;
};

export function DetailCoverArt({
  src,
  alt,
  platformSlug,
  owned = false,
  grail = false,
  topSegment = false,
}: Props) {
  const glow = coverHighlightClass(owned, grail, topSegment);

  if (!glow) {
    return (
      <CoverArt src={src} alt={alt} platformSlug={platformSlug} variant="detail" />
    );
  }

  return (
    <div
      className={cn(
        "relative inline-flex w-full max-w-full justify-center overflow-hidden rounded-xl",
        coverDetailSizeClass(platformSlug),
        glow,
      )}
    >
      <CoverArt
        src={src}
        alt={alt}
        platformSlug={platformSlug}
        variant="detail"
        className="w-full max-w-none rounded-[10px] border-0 shadow-none ring-0"
      />
    </div>
  );
}
