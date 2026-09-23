import {
  expandRegionalVariantBatch,
  type AdminRegionalVariantBatchInput,
} from "./admin-regional-variant-batch";

export type SubmissionBody = AdminRegionalVariantBatchInput & { publishNow: boolean } & Record<string, unknown>;
type RowResponse = {
  ok?: boolean;
  error?: string;
  redirect?: string | null;
  rowIndex?: number;
};
type StatusResponse = RowResponse & { status?: "MISSING" | "MATCHING" | "CONFLICT" | "INCOMPLETE" };

async function sendRequest(
  fetcher: typeof fetch,
  body: SubmissionBody,
  action: "row" | "status" | "finalize",
  rowIndex?: number,
): Promise<{ response: Response; data: RowResponse & StatusResponse }> {
  const response = await fetcher("/api/admin/games/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, action, rowIndex }),
  });
  const raw = await response.text();
  let data: RowResponse & StatusResponse;
  try {
    data = JSON.parse(raw) as RowResponse & StatusResponse;
  } catch {
    data = { error: `Admin devolvió HTTP ${response.status} sin una respuesta JSON válida.` };
  }
  return { response, data };
}

export class RegionalBatchSubmissionError extends Error {
  constructor(message: string, readonly rowIndex: number, readonly retryable: boolean) {
    super(message);
    this.name = "RegionalBatchSubmissionError";
  }
}

export async function submitRegionalVariantBatch(
  body: SubmissionBody,
  onProgress: (completed: number, total: number) => void,
  fetcher: typeof fetch = fetch,
  startIndex = 0,
): Promise<{
  physicalVariantCount: number;
  regionalRecordCount: number;
  redirect: string | null;
  warning: string | null;
}> {
  const expanded = expandRegionalVariantBatch(body);
  if ("error" in expanded) throw new Error(expanded.error);
  const total = expanded.rows.length;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= total) {
    throw new Error("El punto de reanudación del lote no es válido.");
  }
  let redirect: string | null = null;
  if (startIndex > 0) {
    if (!body.publishNow) throw new Error("Un lote de borradores no puede reanudarse sin revisar sus fichas de staging.");
    for (let prior = 0; prior < startIndex; prior += 1) {
      const { response, data } = await sendRequest(fetcher, body, "status", prior);
      if (!response.ok || data.ok !== true || data.status !== "MATCHING" || data.rowIndex !== prior) {
        throw new RegionalBatchSubmissionError(
          `La identidad ${prior + 1} ya no coincide con el lote original. No se continuará automáticamente.`,
          prior, false,
        );
      }
      redirect ??= data.redirect ?? null;
    }
  }
  onProgress(startIndex, total);

  for (let rowIndex = startIndex; rowIndex < total; rowIndex += 1) {
    let rowError: string | null = null;
    let uncertain = false;
    let missingAfterFailure = false;
    let terminalHttpFailure = false;
    try {
      const { response, data } = await sendRequest(fetcher, body, "row", rowIndex);
      if (!response.ok || data.ok !== true || data.rowIndex !== rowIndex) {
        rowError = data.error ?? `Admin devolvió HTTP ${response.status}.`;
        uncertain = response.status >= 500 || response.ok;
        terminalHttpFailure = response.status === 500 || response.status === 504;
      } else {
        redirect ??= data.redirect ?? null;
      }
    } catch (error) {
      rowError = error instanceof Error ? error.message : "Error de red.";
      uncertain = true;
    }

    if (rowError && uncertain && body.publishNow) {
      // A 504 may arrive after Blob was written. Only a fresh, exact identity
      // match permits advancing; never send this row again automatically.
      try {
        const { response, data } = await sendRequest(fetcher, body, "status", rowIndex);
        if (response.ok && data.ok === true && data.rowIndex === rowIndex && data.status === "MATCHING") {
          redirect ??= data.redirect ?? null;
          rowError = null;
        } else if (response.ok && data.ok === true && data.rowIndex === rowIndex && data.status === "CONFLICT") {
          rowError = "La identidad existe, pero sus datos no coinciden con este envío.";
        } else if (response.ok && data.ok === true && data.rowIndex === rowIndex && data.status === "INCOMPLETE") {
          rowError = "La escritura aparece incompleta; requiere revisar la ficha antes de continuar.";
        } else if (response.ok && data.ok === true && data.rowIndex === rowIndex && data.status === "MISSING") {
          // A lost connection does not prove the server stopped. Only a
          // terminal HTTP failure permits a deliberate resume of this row.
          missingAfterFailure = terminalHttpFailure;
        }
      } catch {
        // Keep the uncertain result visible; do not retry or continue blindly.
      }
    }

    if (rowError) {
      throw new RegionalBatchSubmissionError(
        `Identidad ${rowIndex + 1} de ${total}: ${rowError} ${rowIndex} identidades completadas. No vuelvas a enviar el lote entero; conserva este formulario y comprueba la ficha antes de continuar.`,
        rowIndex, missingAfterFailure,
      );
    }
    onProgress(rowIndex + 1, total);
  }

  let warning: string | null = null;
  if (body.publishNow) {
    try {
      const { response, data } = await sendRequest(fetcher, body, "finalize");
      if (!response.ok || data.ok !== true) warning = `Todas las identidades están publicadas, pero la actualización final devolvió: ${data.error ?? `HTTP ${response.status}`}`;
    } catch (error) {
      warning = `Todas las identidades están publicadas, pero no se pudo confirmar la actualización final: ${error instanceof Error ? error.message : "error de red"}`;
    }
  }

  return {
    physicalVariantCount: expanded.physicalVariantCount,
    regionalRecordCount: total,
    redirect,
    warning,
  };
}
