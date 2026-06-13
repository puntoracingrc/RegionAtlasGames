"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserPlan } from "@/lib/marketplace-types";
import { PLAN_LIMITS, planLabel } from "@/lib/plans";

export function PlanPanel({
  plan,
  aiQuotaRemaining,
}: {
  plan: UserPlan;
  aiQuotaRemaining?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const limits = PLAN_LIMITS[plan];

  async function upgrade() {
    setLoading(true);
    await fetch("/api/user/plan/upgrade", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted">Plan actual</dt>
        <dd className="font-medium text-foreground">{planLabel(plan)}</dd>
      </div>
      <div>
        <dt className="text-muted">Valor de colección</dt>
        <dd className="font-medium text-foreground">
          {limits.canViewCollectionValue
            ? "Total y por plataforma"
            : "Solo plan Pro"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Mercado entre usuarios</dt>
        <dd className="font-medium text-foreground">
          {limits.canTrade ? "Activo (comprar y vender)" : "No incluido"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Análisis IA / mes</dt>
        <dd className="font-medium text-foreground">
          {plan === "pro" && aiQuotaRemaining != null
            ? `${aiQuotaRemaining} restantes de ${limits.aiAnalysisPerMonth}`
            : limits.aiAnalysisPerMonth}
        </dd>
      </div>
      {plan === "pro" && (
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          <a href="/mis-anuncios" className="text-accent hover:underline">
            Mis anuncios →
          </a>
          <a href="/mensajes" className="text-accent hover:underline">
            Mensajes →
          </a>
        </div>
      )}
      {plan === "free" && (
        <button type="button" className="btn-primary mt-2" disabled={loading} onClick={upgrade}>
          {loading ? "Activando…" : "Activar Pro (demo)"}
        </button>
      )}
    </dl>
  );
}
