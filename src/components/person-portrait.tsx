import Image from "next/image";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

export function PersonPortrait({
  src,
  name,
  sizes,
  priority = false,
  className,
  fit = "cover",
}: {
  src: string | null;
  name: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fit?: "cover" | "contain";
}) {
  return (
    <div className={cn("relative overflow-hidden bg-card-hover", className)}>
      {src ? (
        <Image
          src={src}
          alt={`Retrato de ${name}`}
          fill
          priority={priority}
          sizes={sizes}
          className={fit === "contain" ? "object-contain object-center" : "object-cover"}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted/65" aria-label="Sin retrato">
          <UserRound className="h-1/3 w-1/3" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
