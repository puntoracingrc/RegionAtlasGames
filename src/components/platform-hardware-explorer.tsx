"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  PLATFORM_HARDWARE_GROUPS,
  type PlatformHardwareGroupId,
  type PlatformHardwareItem,
  type PlatformHardwareKind,
} from "@/lib/platform-history-types";

const hardwareLabels: Record<PlatformHardwareKind, string> = {
  EARLY_REVISION: "Revisión temprana",
  REVISION: "Revisión técnica",
  REDESIGN: "Rediseño",
  DEVELOPMENT_HARDWARE: "Hardware de desarrollo",
  HOBBYIST_HARDWARE: "Desarrollo aficionado",
  MULTIMEDIA_HYBRID: "Híbrido multimedia",
  INTEGRATED_HARDWARE: "Hardware integrado",
  COMPLEMENTARY_HARDWARE: "Hardware complementario",
  COMMEMORATIVE_HARDWARE: "Producto conmemorativo",
  CONTROLLER: "Mando",
  PERIPHERAL: "Periférico",
  ACCESSIBILITY_CONTROLLER: "Mando accesible",
};

export function PlatformHardwareExplorer({
  hardware,
  personNames,
  initialGroup = "models",
}: {
  hardware: PlatformHardwareItem[];
  personNames: Record<string, string>;
  initialGroup?: PlatformHardwareGroupId;
}) {
  const [hardwareGroup, setHardwareGroup] = useState<PlatformHardwareGroupId>(initialGroup);
  const activeHardwareKinds = PLATFORM_HARDWARE_GROUPS.find(
    (group) => group.id === hardwareGroup,
  )?.kinds ?? [];
  const visibleHardware = hardware.filter((item) =>
    activeHardwareKinds.includes(item.kind),
  );

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    const target = hardware.find((item) => item.id === targetId);
    const targetGroup = target
      ? PLATFORM_HARDWARE_GROUPS.find((group) => group.kinds.includes(target.kind))
      : undefined;
    if (!target || targetGroup?.id !== hardwareGroup) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hardware, hardwareGroup]);

  return (
    <>
      <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías de hardware">
        {PLATFORM_HARDWARE_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={hardwareGroup === group.id}
            onClick={() => setHardwareGroup(group.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-lg border px-4 text-sm font-semibold transition",
              hardwareGroup === group.id
                ? "border-accent bg-accent text-[var(--accent-fg)]"
                : "border-border bg-card text-foreground hover:bg-card-hover",
            )}
          >
            {group.label}
          </button>
        ))}
      </div>
      <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleHardware.map((item) => (
          <li id={item.id} key={item.id} className="scroll-mt-24 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{hardwareLabels[item.kind]}</p>
                <h4 className="mt-1 font-bold text-foreground">{item.name}</h4>
                {item.manufacturerCompanySlug && item.manufacturerCompanyName ? (
                  <Link href={`/compania/${item.manufacturerCompanySlug}`} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
                    {item.manufacturerCompanyName}
                  </Link>
                ) : item.manufacturerCompanyName ? (
                  <p className="mt-1 text-xs text-muted">{item.manufacturerCompanyName}</p>
                ) : null}
              </div>
              {item.yearLabel ? <span className="shrink-0 text-xs font-bold text-accent">{item.yearLabel}</span> : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground/75">{item.summaryEs}</p>
            {item.modelNumbers.length > 0 ? <p className="mt-3 font-mono text-xs text-muted">{item.modelNumbers.join(" · ")}</p> : null}
            {item.features.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-border pt-3">
                {item.features.slice(0, 4).map((feature) => <li key={feature} className="text-xs leading-5 text-foreground/70">{feature}</li>)}
              </ul>
            ) : null}
            {item.relatedPersonSlugs.map((slug) => personNames[slug] ? (
              <Link key={slug} href={`/persona/${slug}`} className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">{personNames[slug]}</Link>
            ) : null)}
            {item.relatedCatalogEntries && item.relatedCatalogEntries.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {item.relatedCatalogEntries.map((game) => <Link key={game.id} href={`/catalogo/${game.id}`} className="text-xs font-medium text-accent hover:underline">{game.title}</Link>)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
