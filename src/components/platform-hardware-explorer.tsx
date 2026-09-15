"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  PLATFORM_HARDWARE_GROUPS,
  type PlatformHardwareGroupId,
  type PlatformHardwareItem,
  type PlatformHardwareKind,
} from "@/lib/platform-history-types";

const hardwareLabels: Record<PlatformHardwareKind, string> = {
  BASE_MODEL: "Modelo original",
  HOME_COMPUTER: "Ordenador doméstico",
  SUCCESSOR_PLATFORM: "Plataforma sucesora",
  REGIONAL_MODEL: "Modelo regional",
  HARDWARE_EXPANSION: "Expansión de hardware",
  LICENSED_MODEL: "Modelo licenciado",
  EARLY_REVISION: "Revisión temprana",
  REVISION: "Revisión técnica",
  REDESIGN: "Rediseño",
  DIGITAL_ONLY_REDESIGN: "Rediseño solo digital",
  MICROCONSOLE: "Microconsola",
  DEVELOPMENT_HARDWARE: "Hardware de desarrollo",
  HOBBYIST_HARDWARE: "Desarrollo aficionado",
  MULTIMEDIA_HYBRID: "Híbrido multimedia",
  INTEGRATED_HARDWARE: "Hardware integrado",
  COMPLEMENTARY_HARDWARE: "Hardware complementario",
  COMMEMORATIVE_HARDWARE: "Producto conmemorativo",
  MID_GENERATION_UPGRADE: "Actualización de media generación",
  CONTROLLER: "Mando",
  PRO_CONTROLLER: "Mando profesional",
  PERIPHERAL: "Periférico",
  VR_HEADSET: "Realidad virtual",
  REMOTE_PLAYER: "Reproductor remoto",
  ACCESSIBILITY_CONTROLLER: "Mando accesible",
};

export function PlatformHardwareExplorer({
  hardware,
  personNames,
  initialGroup = "models",
  groups,
}: {
  hardware: PlatformHardwareItem[];
  personNames: Record<string, string>;
  initialGroup?: PlatformHardwareGroupId;
  groups?: PlatformHardwareGroupId[];
}) {
  const availableGroups = useMemo(
    () => PLATFORM_HARDWARE_GROUPS.filter(
      (group) => !groups || groups.includes(group.id),
    ),
    [groups],
  );
  const defaultGroup = availableGroups.some((group) => group.id === initialGroup)
    ? initialGroup
    : (availableGroups[0]?.id ?? "models");
  const [hardwareGroup, setHardwareGroup] = useState<PlatformHardwareGroupId>(defaultGroup);
  const activeHardwareKinds = availableGroups.find(
    (group) => group.id === hardwareGroup,
  )?.kinds ?? [];
  const visibleHardware = hardware.filter((item) =>
    activeHardwareKinds.includes(item.kind),
  );

  useEffect(() => {
    let frame: number | undefined;
    let settleFrame: number | undefined;

    const revealTarget = (targetId: string) => {
      const target = hardware.find((item) => item.id === targetId);
      const targetGroup = target
        ? PLATFORM_HARDWARE_GROUPS.find((group) => group.kinds.includes(target.kind))
        : undefined;

      if (!target || !targetGroup || !availableGroups.some((group) => group.id === targetGroup.id)) return;
      if (targetGroup.id !== hardwareGroup) setHardwareGroup(targetGroup.id);

      frame = window.requestAnimationFrame(() => {
        settleFrame = window.requestAnimationFrame(() => {
          document.getElementById(targetId)?.scrollIntoView({ block: "start" });
        });
      });
    };

    const revealHashTarget = () => revealTarget(window.location.hash.slice(1));
    const revealClickedTarget = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname) return;
      revealTarget(destination.hash.slice(1));
    };

    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    document.addEventListener("click", revealClickedTarget);
    return () => {
      window.removeEventListener("hashchange", revealHashTarget);
      document.removeEventListener("click", revealClickedTarget);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (settleFrame !== undefined) window.cancelAnimationFrame(settleFrame);
    };
  }, [availableGroups, hardware, hardwareGroup]);

  return (
    <>
      {availableGroups.length > 1 ? (
        <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías de hardware">
          {availableGroups.map((group) => (
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
      ) : null}
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
            {item.relatedPersonSlugs.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {item.relatedPersonSlugs.map((slug) => personNames[slug] ? (
                  <Link key={slug} href={`/persona/${slug}`} className="text-xs font-semibold text-accent hover:underline">{personNames[slug]}</Link>
                ) : null)}
              </div>
            ) : null}
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
