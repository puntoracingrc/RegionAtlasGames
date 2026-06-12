import {
  formatRegionEvidenceRuleSummary,
  getEvidenceLabel,
  getRegionEvidenceRule,
  listRequiredEvidenceCodes,
} from "@/lib/region-evidence-rules";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  platformSlug: string;
  catalogRegion: string;
};

export function RegionEvidenceRulesPanel({ platformSlug, catalogRegion }: Props) {
  const rule = getRegionEvidenceRule(platformSlug, catalogRegion);
  const required = listRequiredEvidenceCodes(platformSlug, catalogRegion);
  const summary = formatRegionEvidenceRuleSummary(platformSlug, catalogRegion);

  return (
    <Panel>
      <PanelTitle>Pruebas mínimas de región (IA / ingest)</PanelTitle>
      <p className="text-sm text-muted">{summary}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
        <li>
          Mínimo de pruebas: <strong>{rule.minEvidenceCount ?? 1}</strong>
        </li>
        {rule.minAiConfidence != null && (
          <li>
            Confianza IA mínima:{" "}
            <strong>{Math.round(rule.minAiConfidence * 100)}%</strong>
          </li>
        )}
        {required.length > 0 && (
          <li>
            Al menos una de:
            <ul className="mt-1 list-inside list-disc text-muted">
              {required.map((code) => (
                <li key={code}>{getEvidenceLabel(code)}</li>
              ))}
            </ul>
          </li>
        )}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        Sin cumplir esto, el anuncio no entra en el precio P2P ni en CeX. Config:{" "}
        <code className="text-foreground/70">data/region-evidence-rules.json</code>
      </p>
    </Panel>
  );
}
