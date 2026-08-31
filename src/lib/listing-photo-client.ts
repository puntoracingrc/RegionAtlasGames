const MAX_UPLOAD_BYTES = 3_500_000;
const MAX_UPLOAD_DIMENSION = 2_400;
const MIN_JPEG_QUALITY = 0.62;

export const LISTING_PHOTO_UPLOAD_TIMEOUT_MS = 45_000;

export type PreparedListingPhoto = {
  file: File;
  resized: boolean;
};

function loadBrowserImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se ha podido abrir esta imagen en el navegador."));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se ha podido preparar la foto para subirla."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function safeJpegName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "foto-juego";
  return `${stem}.jpg`;
}

export function listingPhotoUploadError(status: number, serverMessage?: string): string {
  if (serverMessage?.trim()) return serverMessage.trim();
  if (status === 413) {
    return "La foto es demasiado grande. Prueba otra vez: la reduciremos antes de enviarla.";
  }
  if (status === 401) return "La sesión ha caducado. Vuelve a iniciar sesión.";
  if (status === 429) return "Has realizado muchas subidas seguidas. Espera un momento y reintenta.";
  return "No se pudo subir la foto. Comprueba la conexión y vuelve a intentarlo.";
}

export async function prepareListingPhoto(file: File): Promise<PreparedListingPhoto> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }

  if (file.size <= MAX_UPLOAD_BYTES) {
    return { file, resized: false };
  }

  const image = await loadBrowserImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("No se ha podido leer el tamaño de la foto.");
  }

  let scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(sourceWidth, sourceHeight));
  let quality = 0.9;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no permite preparar esta foto.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToJpeg(canvas, quality);
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return {
        file: new File([blob], safeJpegName(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
        resized: true,
      };
    }

    if (quality > MIN_JPEG_QUALITY) quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08);
    else scale *= 0.82;
  }

  throw new Error("La foto sigue siendo demasiado grande después de reducirla.");
}
