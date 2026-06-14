import Image from "next/image";
import Link from "next/link";
import {
  SITE_LOGO,
  SITE_LOGO_ALT,
  SITE_LOGO_DARK_SRC,
  SITE_LOGO_LIGHT_SRC,
} from "@/lib/site-brand";
import { cn } from "@/lib/cn";

type Props = {
  href?: string;
  className?: string;
  height?: number;
  priority?: boolean;
};

const LOGO_WIDTH = 401;
const LOGO_HEIGHT = 150;

export function SiteLogo({ href = "/", className, height = 43, priority = false }: Props) {
  const imageClass = cn("h-auto w-auto object-contain object-left", className);

  const logos = (
    <>
      <Image
        src={SITE_LOGO_DARK_SRC}
        alt={SITE_LOGO_ALT}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn(imageClass, "hidden dark:block")}
        style={{ height, width: "auto" }}
      />
      <Image
        src={SITE_LOGO_LIGHT_SRC}
        alt={SITE_LOGO_ALT}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn(imageClass, "block dark:hidden")}
        style={{ height, width: "auto" }}
      />
    </>
  );

  if (!href) return logos;

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      aria-label={SITE_LOGO}
    >
      {logos}
    </Link>
  );
}
