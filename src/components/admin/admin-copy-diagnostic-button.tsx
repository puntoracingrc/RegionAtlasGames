"use client";

import { useState } from "react";

export function AdminCopyDiagnosticButton({ diagnostic }: { diagnostic: string }) {
  const [label, setLabel] = useState("Copiar diagnóstico");

  async function copy() {
    await navigator.clipboard.writeText(diagnostic);
    setLabel("Diagnóstico copiado");
    window.setTimeout(() => setLabel("Copiar diagnóstico"), 1800);
  }

  return (
    <button type="button" className="btn-secondary text-xs" onClick={copy}>
      {label}
    </button>
  );
}
