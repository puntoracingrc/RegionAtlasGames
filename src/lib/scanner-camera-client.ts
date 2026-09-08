export function prefersNativeCamera(userAgent: string, maxTouchPoints: number) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "No se ha permitido usar la cámara. Puedes autorizarla en el navegador o elegir archivos.";
  if (name === "NotFoundError") return "No se ha encontrado una cámara. Puedes elegir archivos.";
  if (name === "NotReadableError") return "La cámara está ocupada o no se puede abrir. Cierra otras aplicaciones que la estén usando.";
  return "No se pudo abrir la cámara. Puedes volver a intentarlo o elegir archivos.";
}

export async function captureCameraPhoto(video: HTMLVideoElement): Promise<File> {
  if (video.readyState < 2 || video.videoWidth < 256 || video.videoHeight < 256) throw new Error("Espera a que la cámara muestre una imagen nítida.");
  const scale = Math.min(1, 1800 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo capturar la foto.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo capturar la foto.")), "image/jpeg", 0.95));
  return new File([blob], "camara.jpg", { type: "image/jpeg" });
}
