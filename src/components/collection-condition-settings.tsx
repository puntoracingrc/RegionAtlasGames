"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useMemo, useState } from "react";
import {
  availableCollectionConditions,
  DEFAULT_COLLECTION_CONDITION,
  defaultCollectionConditionForPlatform,
  type CollectionDefaultConditions,
  type PricedCollectionCondition,
} from "@/lib/collection-condition-policy";
import { COLLECTION_CONDITION_LABELS } from "@/lib/condition-prices";

type SettingsPlatform = {
  slug: string;
  name: string;
  manufacturer: string;
  sortOrder: number;
};

const MANUFACTURER_NAMES: Record<string, string> = {
  nintendo: "Nintendo",
  sony: "Sony",
  sega: "Sega",
  snk: "SNK",
  microsoft: "Microsoft",
};

const MANUFACTURER_ORDER = ["nintendo", "sony", "microsoft", "sega", "snk"];

export function CollectionConditionSettings({
  platforms,
  initialPreferences,
}: {
  platforms: SettingsPlatform[];
  initialPreferences: CollectionDefaultConditions;
}) {
  const sortedPlatforms = useMemo(
    () => [...platforms].sort((a, b) => {
      const manufacturerDifference =
        MANUFACTURER_ORDER.indexOf(a.manufacturer) - MANUFACTURER_ORDER.indexOf(b.manufacturer);
      return manufacturerDifference || a.sortOrder - b.sortOrder;
    }),
    [platforms],
  );
  const [preferences, setPreferences] = useState<Record<string, PricedCollectionCondition>>(
    () => Object.fromEntries(
      sortedPlatforms.map((platform) => [
        platform.slug,
        defaultCollectionConditionForPlatform(initialPreferences, platform.slug),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const overrides = Object.fromEntries(
      Object.entries(preferences).filter(([, condition]) => condition !== DEFAULT_COLLECTION_CONDITION),
    );
    const response = await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionDefaultConditions: overrides }),
    });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!response.ok) {
      setError(data?.error ?? "No se pudieron guardar los estados iniciales.");
      return;
    }
    setMessage("Estados iniciales guardados.");
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Cada copia nueva usará el estado elegido para su plataforma. El valor se calculará con el
        precio correspondiente.
      </p>
      <div className="divide-y divide-border/70 border-y border-border/70">
        {sortedPlatforms.map((platform, index) => {
          const showManufacturer =
            platform.manufacturer !== sortedPlatforms[index - 1]?.manufacturer;
          return (
            <div key={platform.slug}>
              {showManufacturer ? (
                <h3 className="bg-card-hover/50 px-1 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {MANUFACTURER_NAMES[platform.manufacturer] ?? platform.manufacturer}
                </h3>
              ) : null}
              <label className="grid items-center gap-2 py-2.5 sm:grid-cols-[minmax(130px,1fr)_minmax(210px,1.2fr)]">
                <span className="text-sm font-medium text-foreground">{platform.name}</span>
                <select
                  className="input h-10 py-2 text-sm"
                  value={preferences[platform.slug] ?? DEFAULT_COLLECTION_CONDITION}
                  disabled={saving}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    [platform.slug]: event.target.value as PricedCollectionCondition,
                  }))}
                >
                  {availableCollectionConditions(platform.slug).map((condition) => (
                    <option key={condition} value={condition}>
                      {COLLECTION_CONDITION_LABELS[condition]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2"
          disabled={saving}
          onClick={save}
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Guardar estados
        </button>
        {message ? <span className="text-sm text-emerald-700 dark:text-emerald-300">{message}</span> : null}
        {error ? <span role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</span> : null}
      </div>
    </div>
  );
}
