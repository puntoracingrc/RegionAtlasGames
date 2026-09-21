export type OptionalImageUploadResult<T> = {
  value: T | null;
  warning: string | null;
};

export async function attemptOptionalImageUpload<T>(
  label: string,
  upload: () => Promise<T>,
): Promise<OptionalImageUploadResult<T>> {
  try {
    return { value: await upload(), warning: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido.";
    return {
      value: null,
      warning: `${label}: ${detail}`,
    };
  }
}
