import type { Platform } from "@/lib/types";
import { cn } from "@/lib/cn";

type Manufacturer = Platform["manufacturer"] | "other";

const LOGOS: Record<
  Platform["manufacturer"],
  { src: string; alt: string; width: number; height: number }
> = {
  nintendo: {
    src: "/brand/manufacturers/nintendo.svg",
    alt: "Nintendo",
    width: 72,
    height: 14,
  },
  sony: {
    src: "/brand/manufacturers/sony.svg",
    alt: "Sony",
    width: 56,
    height: 14,
  },
  sega: {
    src: "/brand/manufacturers/sega.svg",
    alt: "Sega",
    width: 48,
    height: 14,
  },
};

const LOGO_CLASS: Record<Platform["manufacturer"], string> = {
  nintendo: "h-3.5 w-auto max-w-[76px] object-contain object-left opacity-95",
  sony: "h-3.5 w-auto max-w-[56px] object-contain object-left opacity-80 brightness-0 invert",
  sega: "h-3.5 w-auto max-w-[52px] object-contain object-left opacity-90 brightness-0 invert",
};

/** Logotipo de fabricante — misma altura que la etiqueta textual anterior (~text-xs). */
export function ManufacturerLogo({
  manufacturer,
  className,
}: {
  manufacturer: Manufacturer;
  className?: string;
}) {
  if (manufacturer === "other") {
    return (
      <span
        className={cn(
          "inline-flex h-4 items-center text-[10px] font-medium uppercase tracking-wider text-muted",
          className,
        )}
      >
        Otras
      </span>
    );
  }

  const logo = LOGOS[manufacturer];

  return (
    <span className={cn("inline-flex h-4 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={logo.alt}
        width={logo.width}
        height={logo.height}
        className={LOGO_CLASS[manufacturer]}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
