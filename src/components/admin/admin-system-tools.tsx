"use client";

import { useState } from "react";

type BlobCheck = {
  ok: boolean;
  readStatus?: number | null;
  error?: string;
};

export function AdminSystemTools({ diagnostic }: { diagnostic: string }) {
  const [copyLabel, setCopyLabel] = useState("Copiar diagnóstico");
  const [blobState, setBlobState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [blobMessage, setBlobMessage] = useState("");

  async function copyDiagnostic() {
    await navigator.clipboard.writeText(diagnostic);
    setCopyLabel("Copiado");
    window.setTimeout(() => setCopyLabel("Copiar diagnóstico"), 1800);
  }

  async function checkBlob() {
    setBlobState("loading");
    setBlobMessage("");
    try {
      const response = await fetch("/api/admin/blob-health", { method: "POST" });
      const payload = (await response.json()) as BlobCheck;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "La comprobación no terminó correctamente.");
      }
      setBlobState("ok");
      setBlobMessage(`Escritura, lectura y borrado correctos (HTTP ${payload.readStatus ?? 200}).`);
    } catch (error) {
      setBlobState("error");
      setBlobMessage(error instanceof Error ? error.message : "No se pudo comprobar Blob.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyDiagnostic}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          {copyLabel}
        </button>
        <button
          type="button"
          onClick={checkBlob}
          disabled={blobState === "loading"}
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card-hover disabled:cursor-wait disabled:opacity-60"
        >
          {blobState === "loading" ? "Comprobando..." : "Probar almacenamiento"}
        </button>
      </div>

      {blobMessage ? (
        <p
          role="status"
          className={`rounded-xl border px-3 py-2 text-sm ${
            blobState === "ok"
              ? "border-emerald-300/70 bg-emerald-100/55 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-rose-300/70 bg-rose-100/55 text-rose-800 dark:border-rose-400/30 dark:bg-rose-950/35 dark:text-rose-200"
          }`}
        >
          {blobMessage}
        </p>
      ) : null}

      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background/70 p-4 text-xs leading-5 text-foreground">
        {diagnostic}
      </pre>
    </div>
  );
}
