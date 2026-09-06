"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function AwardCopyInstruction({ text }: { text: string }) {
  const [message, setMessage] = useState("");
  return <div className="space-y-2">
    <button type="button" className="btn-secondary gap-2" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setMessage("Instrucción copiada"); }
      catch { setMessage("No se pudo copiar. Revisa el permiso del portapapeles."); }
    }}><Copy className="h-4 w-4" aria-hidden="true" />Copiar instrucción</button>
    <p role="status" className="text-xs text-muted">{message}</p>
  </div>;
}
