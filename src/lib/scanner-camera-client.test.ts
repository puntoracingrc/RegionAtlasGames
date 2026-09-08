import assert from "node:assert/strict";
import test from "node:test";
import { cameraErrorMessage, captureCameraPhoto, prefersNativeCamera, stopCamera } from "./scanner-camera-client";

test("native capture is selected on phones and iPad, not a narrow desktop or touch PC", () => {
  for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18)", "Mozilla/5.0 (iPad)", "Mozilla/5.0 (Linux; Android 15)"]) assert.equal(prefersNativeCamera(ua, 1), true);
  assert.equal(prefersNativeCamera("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5), true);
  assert.equal(prefersNativeCamera("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0), false);
  assert.equal(prefersNativeCamera("Mozilla/5.0 (Windows NT 10.0)", 10), false);
});

test("closing a camera stops every track and also accepts no stream", () => {
  let stopped = 0;
  stopCamera({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] } as unknown as MediaStream);
  stopCamera(null);
  assert.equal(stopped, 2);
});

test("camera errors offer a useful permission or hardware explanation", () => {
  assert.match(cameraErrorMessage(new DOMException("", "NotAllowedError")), /permitido/);
  assert.match(cameraErrorMessage(new DOMException("", "NotFoundError")), /encontrado/);
  assert.match(cameraErrorMessage(new DOMException("", "NotReadableError")), /ocupada/);
  assert.match(cameraErrorMessage(null), /elegir archivos/);
});

test("capture requires an available frame of sufficient size", async () => {
  await assert.rejects(captureCameraPhoto({ readyState: 1, videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement), /Espera/);
  await assert.rejects(captureCameraPhoto({ readyState: 2, videoWidth: 128, videoHeight: 128 } as HTMLVideoElement), /Espera/);
});

test("camera captures one unmirrored JPEG, bounded to 1800 pixels, without network or storage", async (t) => {
  const frame = { readyState: 2, videoWidth: 3840, videoHeight: 2160 } as HTMLVideoElement;
  let drawn: unknown[] = [];
  const canvas = { width: 0, height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => { drawn = args; } }),
    toBlob: (callback: (value: Blob) => void, format: string, quality: number) => {
      assert.equal(format, "image/jpeg"); assert.equal(quality, 0.95);
      callback(new Blob(["test frame"], { type: format }));
    },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); });
  const photo = await captureCameraPhoto(frame);
  assert.equal(photo.type, "image/jpeg"); assert.equal(photo.name, "camara.jpg");
  assert.equal(canvas.width, 1800); assert.equal(canvas.height, 1013);
  assert.deepEqual(drawn, [frame, 0, 0, 1800, 1013]);
});
