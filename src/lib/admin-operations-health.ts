import type { CatalogStagingIndex } from "./catalog-staging-types";
import type { LocalGameRunnerJob } from "./local-game-runner-jobs";

export type AdminHealthLevel = "ok" | "watch" | "action" | "paused" | "unknown";

export type AdminHealthSignal = {
  level: AdminHealthLevel;
  label: string;
  detail: string;
  at?: string | null;
  href?: string;
};

export type AdminWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  headSha: string;
};

const LEVEL_WEIGHT: Record<AdminHealthLevel, number> = {
  ok: 1,
  paused: 2,
  unknown: 2,
  watch: 3,
  action: 4,
};

function parsedTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMs(value: string | null | undefined, now: Date): number | null {
  const parsed = parsedTime(value);
  return parsed === null ? null : Math.max(0, now.getTime() - parsed);
}

export function worstAdminHealthSignal(signals: AdminHealthSignal[]): AdminHealthSignal {
  return signals.reduce((worst, current) =>
    LEVEL_WEIGHT[current.level] > LEVEL_WEIGHT[worst.level] ? current : worst,
  );
}

export function adminHealthTone(level: AdminHealthLevel): "status" | "edit" | "danger" | "neutral" {
  if (level === "action") return "danger";
  if (level === "watch") return "edit";
  if (level === "ok") return "status";
  return "neutral";
}

export function classifyWorkflowRun(
  run: AdminWorkflowRun | null,
  input: { label: string; expectedWithinHours?: number; now?: Date },
): AdminHealthSignal {
  const now = input.now ?? new Date();
  if (!run) {
    return {
      level: "unknown",
      label: `${input.label}: sin lectura`,
      detail: "No se pudo consultar la última ejecución en GitHub.",
    };
  }
  if (run.status !== "completed") {
    return {
      level: "watch",
      label: `${input.label}: en curso`,
      detail: "La automatización todavía no ha terminado.",
      at: run.updatedAt,
      href: run.url,
    };
  }
  if (run.conclusion !== "success") {
    return {
      level: "action",
      label: `${input.label}: falló`,
      detail: `GitHub terminó con estado ${run.conclusion || "desconocido"}.`,
      at: run.updatedAt,
      href: run.url,
    };
  }

  const age = ageMs(run.updatedAt, now);
  if (input.expectedWithinHours && age !== null && age > input.expectedWithinHours * 60 * 60 * 1000) {
    return {
      level: "watch",
      label: `${input.label}: atrasada`,
      detail: `La última ejecución correcta supera ${input.expectedWithinHours} horas.`,
      at: run.updatedAt,
      href: run.url,
    };
  }
  return {
    level: "ok",
    label: `${input.label}: correcta`,
    detail: "La última ejecución terminó sin errores.",
    at: run.updatedAt,
    href: run.url,
  };
}

export function classifyStagingAutomation(
  index: CatalogStagingIndex | null,
  now = new Date(),
): AdminHealthSignal {
  if (!index) {
    return {
      level: "action",
      label: "Staging: no disponible",
      detail: "No se pudo leer el índice de fichas pendientes.",
    };
  }
  const pending = Object.values(index.byPlatform).reduce(
    (total, stats) => total + stats.pendingEnrich,
    0,
  );
  if (pending === 0) {
    return {
      level: "ok",
      label: "Enriquecimiento al día",
      detail: "No hay fichas pendientes de completar.",
      at: index.updatedAt,
    };
  }
  const run = index.lastEnrichmentRun;
  if (!run) {
    return {
      level: "action",
      label: "Enriquecimiento sin telemetría",
      detail: `${pending} fichas pendientes y ningún cron confirmado en el índice.`,
      at: index.updatedAt,
    };
  }
  const runAge = ageMs(run.completedAt, now);
  if (runAge === null || runAge > 36 * 60 * 60 * 1000) {
    return {
      level: "action",
      label: "Enriquecimiento atrasado",
      detail: `${pending} fichas pendientes; el último cron supera 36 horas.`,
      at: run.completedAt,
    };
  }
  if (run.failed > 0 || run.stoppedByBudget) {
    return {
      level: "watch",
      label: "Enriquecimiento parcial",
      detail: `${pending} pendientes · ${run.failed} fallos en la última ejecución.`,
      at: run.completedAt,
    };
  }
  return {
    level: "ok",
    label: "Enriquecimiento activo",
    detail: `${pending} fichas pendientes; el cron está avanzando.`,
    at: run.completedAt,
  };
}

export function classifyRunnerQueue(
  jobs: LocalGameRunnerJob[] | null,
  now = new Date(),
): AdminHealthSignal {
  if (!jobs) {
    return {
      level: "unknown",
      label: "PC worker: sin lectura",
      detail: "No se pudo consultar la cola pública del PC.",
    };
  }
  const active = jobs.filter((job) => job.status === "pending" || job.status === "running");
  if (active.length === 0) {
    return {
      level: "ok",
      label: "PC worker: cola vacía",
      detail: "No hay trabajos esperando al PC.",
    };
  }
  const oldest = active.reduce((value, job) => {
    const current = parsedTime(job.updatedAt) ?? parsedTime(job.createdAt) ?? now.getTime();
    return Math.min(value, current);
  }, now.getTime());
  const hours = (now.getTime() - oldest) / (60 * 60 * 1000);
  if (hours > 24) {
    return {
      level: "action",
      label: "PC worker: cola detenida",
      detail: `${active.length} trabajo(s) llevan más de 24 horas esperando.`,
      at: new Date(oldest).toISOString(),
    };
  }
  return {
    level: "watch",
    label: "PC worker: trabajo pendiente",
    detail: `${active.length} trabajo(s) esperan a que el PC procese la cola.`,
    at: new Date(oldest).toISOString(),
  };
}

export function classifyHygieneAudit(
  status: { status?: string; updatedAt?: string; finishedAt?: string; error?: string } | null,
  now = new Date(),
): AdminHealthSignal {
  if (!status) {
    return {
      level: "unknown",
      label: "Higiene: sin informe",
      detail: "No se pudo leer el último análisis técnico del catálogo.",
    };
  }
  if (status.status === "pending" || status.status === "running") {
    return {
      level: "watch",
      label: "Higiene: análisis en curso",
      detail: "El PC tiene una revisión técnica pendiente o ejecutándose.",
      at: status.updatedAt,
    };
  }
  if (status.status === "error") {
    return {
      level: "action",
      label: "Higiene: análisis fallido",
      detail: status.error || "El último análisis técnico terminó con error.",
      at: status.updatedAt,
    };
  }
  const finishedAt = status.finishedAt ?? status.updatedAt;
  const age = ageMs(finishedAt, now);
  if (age === null || age > 30 * 24 * 60 * 60 * 1000) {
    return {
      level: "watch",
      label: "Higiene: informe antiguo",
      detail: "Conviene volver a ejecutar la auditoría técnica del catálogo.",
      at: finishedAt,
    };
  }
  return {
    level: "ok",
    label: "Higiene: revisada",
    detail: "El informe técnico tiene menos de 30 días.",
    at: finishedAt,
  };
}

export function classifyCollectors(input: {
  total: number;
  manualActive: number;
  rotationActive: number;
} | null): AdminHealthSignal {
  if (!input) {
    return {
      level: "unknown",
      label: "Recolectores: sin lectura",
      detail: "No se pudo leer la configuración efectiva de fuentes.",
    };
  }
  if (input.manualActive === 0 && input.rotationActive === 0) {
    return {
      level: "paused",
      label: "Recolectores pausados",
      detail: `${input.total} fuentes configuradas; ninguna está habilitada para manual o rueda.`,
    };
  }
  return {
    level: "ok",
    label: "Recolectores disponibles",
    detail: `${input.manualActive} manual(es) · ${input.rotationActive} en rueda.`,
  };
}
