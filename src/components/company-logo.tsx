import Image from "next/image";
import { cn } from "@/lib/cn";

type CompanyLogoSize = "sm" | "md" | "lg";

const sizeClasses: Record<CompanyLogoSize, string> = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-24 w-24",
};

export function CompanyLogo({
  name,
  logoUrl,
  provisional = false,
  size = "md",
  showProvisionalLabel = false,
  className,
}: {
  name: string;
  logoUrl: string | null;
  provisional?: boolean;
  size?: CompanyLogoSize;
  showProvisionalLabel?: boolean;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const alt = provisional ? `Imagen provisional de ${name}` : `Logo de ${name}`;

  return (
    <div className={cn("shrink-0", showProvisionalLabel && "w-24", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-white",
          sizeClasses[size],
        )}
        title={provisional ? "Imagen provisional: logo aún no documentado" : undefined}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={alt}
            fill
            className="object-contain p-1.5"
            sizes={size === "lg" ? "96px" : size === "md" ? "56px" : "40px"}
            unoptimized
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-card text-lg font-bold text-accent"
            aria-hidden
          >
            {initial}
          </span>
        )}
      </div>
      {provisional && showProvisionalLabel && (
        <p className="mt-1 text-center text-[10px] font-semibold text-amber-700 dark:text-amber-200">
          Imagen provisional
        </p>
      )}
    </div>
  );
}
