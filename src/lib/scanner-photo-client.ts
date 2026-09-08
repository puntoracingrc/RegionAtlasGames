import { SCANNER_MAX_PHOTO_BYTES } from "./game-scanner";

export async function prepareScannerPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error("Usa fotos JPG, PNG o WebP de hasta 12 MB.");
  }
  const image = await createImageBitmap(file).catch(() => { throw new Error("No se pudo abrir una de las fotos."); });
  try {
    if (image.width < 256 || image.height < 256 || image.width * image.height > 24_000_000) throw new Error("Usa fotos de al menos 256 × 256 píxeles y hasta 24 megapíxeles.");
    let scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo preparar la imagen.")), "image/jpeg", Math.max(0.72, 0.94 - attempt * 0.04)));
      if (blob.size <= SCANNER_MAX_PHOTO_BYTES) return new File([blob], "foto.jpg", { type: "image/jpeg" });
      if (attempt >= 4) scale *= 0.86;
    }
    throw new Error("La foto es demasiado grande. Prueba un encuadre más cercano.");
  } finally { image.close(); }
}
