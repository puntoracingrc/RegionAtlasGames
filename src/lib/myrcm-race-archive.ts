import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { get, list, put } from "@vercel/blob";
import { appDataDir } from "./app-data-dir";
import { blobAuthConfigured, blobAuthOptions } from "./blob-auth";

export type ArchivedDriver = {
  key: string;
  position: number;
  name: string;
  laps: number;
  lastLap: string;
  lastLapSeconds: number | null;
  total: string;
  best: string;
  bestSeconds: number | null;
  average: string;
  averageSeconds: number | null;
  gapFirst: string;
  gapPrevious: string;
  trend: number;
  positionChange: number;
  stateColor: number;
  progress: number;
};

export type ArchivedCircuit = {
  id: string;
  name: string;
  lapLengthMeters: number;
  precisionNote: string;
  map: {
    viewBox: string;
    title: string;
    description: string;
    guidePath: string;
    infieldPaths: string[];
    pitPath: string;
    pitLabels: Array<{ x: number; y: number; text: string }>;
    startGrid: { transform: string; lines: Array<{ x1: number; y1: number; x2: number; y2: number }>; label: { x: number; y: number; text: string } } | null;
    directionPaths: string[];
    timingLine: { transform: string; x1: number; y1: number; x2: number; y2: number; labelX: number; labelY: number; label: string } | null;
  };
};

export type ArchivedFrame = {
  capturedAt: string;
  name: string;
  section: string;
  sectionCode: string;
  category: "NITRO" | "ECO" | null;
  group: string;
  groupKey: string;
  raceState: string;
  raceTime: string;
  currentTime: string;
  remaining: string;
  percentage: number;
  update: string;
  circuit: ArchivedCircuit | null;
  drivers: ArchivedDriver[];
};

export type ArchivedReplay = {
  eventKey: string;
  eventName: string;
  sectionKey: string;
  sectionName: string;
  category: "NITRO" | "ECO";
  group: string;
  reportKey: string;
  reportType: string;
  scheduledSeconds: number;
  circuit: ArchivedCircuit | null;
  drivers: Array<{
    name: string;
    startOffsetSeconds: number;
    laps: Array<{ lap: number; seconds: number }>;
  }>;
};

export type RaceArchive = {
  version: 1;
  raceId: string;
  eventKey: string;
  eventName: string;
  section: string;
  sectionCode: string;
  category: "NITRO" | "ECO" | null;
  group: string;
  groupKey: string;
  circuit: ArchivedCircuit | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  status: "recording" | "complete";
  frames: ArchivedFrame[];
  finalRanking: Array<{ position: number; name: string; points: number | null }>;
  replay: ArchivedReplay | null;
};

export type RaceArchiveUpdate = {
  eventKey: string;
  circuit?: ArchivedCircuit | null;
  frames: ArchivedFrame[];
  finalRanking?: Array<{ position: number; name: string; points: number | null }>;
  replay?: ArchivedReplay | null;
  complete?: boolean;
};

const ARCHIVE_ROOT = "region-atlas/myrcm-race-archive/v1";
const LOCAL_ROOT = process.env.MYRCM_ARCHIVE_DIR ?? path.join(appDataDir(), "myrcm-race-archive");
const MAX_FRAMES = 5_000;

function text(value: unknown, max = 160): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalSeconds(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clockSeconds(value: string): number | null {
  const parts = value.trim().split(":").map(Number);
  if (!value || parts.some(Number.isNaN) || parts.length > 3) return null;
  const seconds = parts.at(-1)! + (parts.length > 1 ? parts.at(-2)! * 60 : 0) + (parts.length > 2 ? parts.at(-3)! * 3_600 : 0);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function slug(value: string, fallback: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function safeIso(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function svgPath(value: unknown): string {
  return text(value, 12_000);
}

function sanitizeCircuit(input: unknown): ArchivedCircuit | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const rawMap = source.map;
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return null;
  const map = rawMap as Record<string, unknown>;
  const guidePath = svgPath(map.guidePath);
  const lapLengthMeters = finite(source.lapLengthMeters);
  if (!text(source.id, 80) || !text(source.name, 160) || lapLengthMeters <= 0 || !guidePath) return null;
  const start = map.startGrid && typeof map.startGrid === "object" && !Array.isArray(map.startGrid) ? map.startGrid as Record<string, unknown> : null;
  const startLabel = start?.label && typeof start.label === "object" && !Array.isArray(start.label) ? start.label as Record<string, unknown> : null;
  const timing = map.timingLine && typeof map.timingLine === "object" && !Array.isArray(map.timingLine) ? map.timingLine as Record<string, unknown> : null;
  return {
    id: slug(text(source.id, 80), "circuit"),
    name: text(source.name, 160),
    lapLengthMeters,
    precisionNote: text(source.precisionNote, 500),
    map: {
      viewBox: text(map.viewBox, 80) || "0 0 1000 390",
      title: text(map.title, 240),
      description: text(map.description, 500),
      guidePath,
      infieldPaths: Array.isArray(map.infieldPaths) ? map.infieldPaths.slice(0, 40).map(svgPath).filter(Boolean) : [],
      pitPath: svgPath(map.pitPath),
      pitLabels: Array.isArray(map.pitLabels) ? map.pitLabels.slice(0, 20).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const label = entry as Record<string, unknown>;
        return [{ x: finite(label.x), y: finite(label.y), text: text(label.text, 80) }];
      }) : [],
      startGrid: start ? {
        transform: text(start.transform, 160),
        lines: Array.isArray(start.lines) ? start.lines.slice(0, 20).flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const line = entry as Record<string, unknown>;
          return [{ x1: finite(line.x1), y1: finite(line.y1), x2: finite(line.x2), y2: finite(line.y2) }];
        }) : [],
        label: { x: finite(startLabel?.x), y: finite(startLabel?.y), text: text(startLabel?.text, 80) },
      } : null,
      directionPaths: Array.isArray(map.directionPaths) ? map.directionPaths.slice(0, 20).map(svgPath).filter(Boolean) : [],
      timingLine: timing ? {
        transform: text(timing.transform, 160),
        x1: finite(timing.x1), y1: finite(timing.y1), x2: finite(timing.x2), y2: finite(timing.y2),
        labelX: finite(timing.labelX), labelY: finite(timing.labelY), label: text(timing.label, 80),
      } : null,
    },
  };
}

export function sanitizeArchivedFrame(input: unknown): ArchivedFrame | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const drivers = Array.isArray(source.drivers)
    ? source.drivers.slice(0, 120).flatMap((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const driver = entry as Record<string, unknown>;
        const name = text(driver.name, 120);
        if (!name) return [];
        return [{
          key: text(driver.key, 80) || `driver-${index + 1}`,
          position: Math.max(1, Math.round(finite(driver.position, index + 1))),
          name,
          laps: Math.max(0, Math.round(finite(driver.laps))),
          lastLap: text(driver.lastLap, 24),
          lastLapSeconds: optionalSeconds(driver.lastLapSeconds),
          total: text(driver.total, 24),
          best: text(driver.best, 24),
          bestSeconds: optionalSeconds(driver.bestSeconds),
          average: text(driver.average, 24),
          averageSeconds: optionalSeconds(driver.averageSeconds),
          gapFirst: text(driver.gapFirst, 24),
          gapPrevious: text(driver.gapPrevious, 24),
          trend: Math.round(finite(driver.trend)),
          positionChange: Math.round(finite(driver.positionChange)),
          stateColor: Math.round(finite(driver.stateColor)),
          progress: Math.max(0, Math.min(100, finite(driver.progress))),
        } satisfies ArchivedDriver];
      })
    : [];
  if (!drivers.length) return null;
  const category = source.category === "NITRO" || source.category === "ECO" ? source.category : null;
  return {
    capturedAt: safeIso(source.capturedAt),
    name: text(source.name, 160),
    section: text(source.section, 120),
    sectionCode: text(source.sectionCode, 80),
    category,
    group: text(source.group, 160),
    groupKey: text(source.groupKey, 80),
    raceState: text(source.raceState, 48),
    raceTime: text(source.raceTime, 24),
    currentTime: text(source.currentTime, 24),
    remaining: text(source.remaining, 24),
    percentage: Math.max(0, Math.min(100, finite(source.percentage))),
    update: text(source.update, 80),
    circuit: sanitizeCircuit(source.circuit),
    drivers,
  };
}

function sanitizeRanking(input: unknown): RaceArchive["finalRanking"] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 150).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const name = text(row.name, 120);
    if (!name) return [];
    const points = Number(row.points);
    return [{ position: Math.max(1, Math.round(finite(row.position, index + 1))), name, points: Number.isFinite(points) ? points : null }];
  });
}

function sanitizeReplay(input: unknown, eventKey: string): ArchivedReplay | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const category = source.category === "ECO" ? "ECO" : "NITRO";
  const drivers = Array.isArray(source.drivers)
    ? source.drivers.slice(0, 120).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const driver = entry as Record<string, unknown>;
        const name = text(driver.name, 120);
        if (!name || !Array.isArray(driver.laps)) return [];
        const laps = driver.laps.slice(0, 2_000).flatMap((lap) => {
          if (!lap || typeof lap !== "object" || Array.isArray(lap)) return [];
          const value = lap as Record<string, unknown>;
          const lapNumber = Math.round(finite(value.lap));
          const seconds = optionalSeconds(value.seconds);
          return lapNumber > 0 && seconds ? [{ lap: lapNumber, seconds }] : [];
        });
        return laps.length ? [{ name, startOffsetSeconds: Math.max(0, finite(driver.startOffsetSeconds)), laps }] : [];
      })
    : [];
  if (!drivers.length) return null;
  return {
    eventKey,
    eventName: text(source.eventName, 160),
    sectionKey: text(source.sectionKey, 80),
    sectionName: text(source.sectionName, 120),
    category,
    group: text(source.group, 160),
    reportKey: text(source.reportKey, 80),
    reportType: text(source.reportType, 32) || "final",
    scheduledSeconds: Math.max(1, finite(source.scheduledSeconds, 1_800)),
    circuit: sanitizeCircuit(source.circuit),
    drivers,
  };
}

export function sanitizeRaceArchiveUpdate(input: unknown): RaceArchiveUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Archivo de carrera no válido.");
  const source = input as Record<string, unknown>;
  const eventKey = text(source.eventKey, 12);
  if (!/^\d{1,12}$/.test(eventKey)) throw new Error("Evento MyRCM no válido.");
  const frames = Array.isArray(source.frames) ? source.frames.map(sanitizeArchivedFrame).filter((frame): frame is ArchivedFrame => Boolean(frame)) : [];
  if (!frames.length && !source.replay && !source.complete) throw new Error("La actualización no contiene datos de carrera.");
  return {
    eventKey,
    circuit: sanitizeCircuit(source.circuit),
    frames,
    finalRanking: sanitizeRanking(source.finalRanking),
    replay: sanitizeReplay(source.replay, eventKey),
    complete: Boolean(source.complete),
  };
}

export function raceIdForFrame(frame: ArchivedFrame): string {
  const identity = [frame.sectionCode || frame.section, frame.groupKey || frame.group].join("|");
  const suffix = createHash("sha1").update(identity).digest("hex").slice(0, 10);
  return `${slug(frame.category || frame.section, "race")}-${slug(frame.groupKey || frame.group, "manga")}-${suffix}`;
}

function frameSignature(frame: ArchivedFrame): string {
  return [frame.currentTime, frame.raceState, frame.update, ...frame.drivers.map((driver) => `${driver.key}:${driver.position}:${driver.laps}:${driver.lastLap}`)].join("|");
}

export function replayFromFrames(eventKey: string, frames: ArchivedFrame[]): ArchivedReplay | null {
  if (!frames.length) return null;
  const ordered = [...frames].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const latest = ordered.at(-1)!;
  const records = new Map<string, { name: string; startOffsetSeconds: number; lastLaps: number; laps: Array<{ lap: number; seconds: number }> }>();
  for (const frame of ordered) {
    const current = clockSeconds(frame.currentTime);
    for (const driver of frame.drivers) {
      const key = normalizeName(driver.name) || driver.key;
      let record = records.get(key);
      if (!record) {
        record = { name: driver.name, startOffsetSeconds: 0, lastLaps: Math.max(0, driver.laps - 1), laps: [] };
        records.set(key, record);
      }
      if (driver.laps === record.lastLaps + 1 && driver.lastLapSeconds) {
        record.laps.push({ lap: driver.laps, seconds: driver.lastLapSeconds });
        if (driver.laps === 1 && current != null) record.startOffsetSeconds = Math.max(0, current - driver.lastLapSeconds);
      }
      record.lastLaps = Math.max(record.lastLaps, driver.laps);
    }
  }
  const drivers = [...records.values()].filter((driver) => driver.laps.length).map((driver) => ({ name: driver.name, startOffsetSeconds: driver.startOffsetSeconds, laps: driver.laps }));
  if (!drivers.length) return null;
  return {
    eventKey,
    eventName: latest.name,
    sectionKey: latest.sectionCode,
    sectionName: latest.section,
    category: latest.category === "ECO" ? "ECO" : "NITRO",
    group: latest.group,
    reportKey: latest.groupKey,
    reportType: /QUAL/i.test(latest.group) ? "qualy" : "final",
    scheduledSeconds: clockSeconds(latest.raceTime) || Math.max(...ordered.map((frame) => clockSeconds(frame.currentTime) || 0), 1),
    circuit: latest.circuit,
    drivers,
  };
}

function freshArchive(eventKey: string, raceId: string, frame: ArchivedFrame, circuit: ArchivedCircuit | null): RaceArchive {
  return {
    version: 1,
    raceId,
    eventKey,
    eventName: frame.name,
    section: frame.section,
    sectionCode: frame.sectionCode,
    category: frame.category,
    group: frame.group,
    groupKey: frame.groupKey,
    circuit: circuit || frame.circuit,
    startedAt: frame.capturedAt,
    updatedAt: frame.capturedAt,
    finishedAt: null,
    status: "recording",
    frames: [],
    finalRanking: [],
    replay: null,
  };
}

export function mergeRaceArchive(existing: RaceArchive | null, update: RaceArchiveUpdate): RaceArchive {
  const first = update.frames[0];
  if (!existing && !first) throw new Error("No se puede crear un archivo sin una primera captura.");
  const raceId = existing?.raceId ?? raceIdForFrame(first!);
  const archive = existing ? structuredClone(existing) : freshArchive(update.eventKey, raceId, first!, update.circuit || first!.circuit);
  const seen = new Set(archive.frames.map(frameSignature));
  for (const frame of update.frames) {
    const signature = frameSignature(frame);
    if (!seen.has(signature)) {
      archive.frames.push(frame);
      seen.add(signature);
    }
  }
  archive.frames.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  if (archive.frames.length > MAX_FRAMES) archive.frames.splice(0, archive.frames.length - MAX_FRAMES);
  const latest = archive.frames.at(-1) ?? first!;
  archive.eventName = latest.name || archive.eventName;
  archive.section = latest.section || archive.section;
  archive.sectionCode = latest.sectionCode || archive.sectionCode;
  archive.category = latest.category || archive.category;
  archive.group = latest.group || archive.group;
  archive.groupKey = latest.groupKey || archive.groupKey;
  archive.circuit = update.circuit || latest.circuit || update.replay?.circuit || archive.circuit || null;
  archive.updatedAt = safeIso(latest.capturedAt);
  if (update.finalRanking?.length) archive.finalRanking = update.finalRanking;
  const derived = replayFromFrames(update.eventKey, archive.frames);
  if (update.replay) {
    const offsets = new Map((derived?.drivers ?? []).map((driver) => [normalizeName(driver.name), driver.startOffsetSeconds]));
    archive.replay = {
      ...update.replay,
      drivers: update.replay.drivers.map((driver) => ({ ...driver, startOffsetSeconds: driver.startOffsetSeconds || offsets.get(normalizeName(driver.name)) || 0 })),
    };
  } else if (derived) archive.replay = { ...derived, circuit: archive.circuit };
  const idleWithResult = /IDLE/i.test(latest.raceState) && clockSeconds(latest.currentTime) === 0 && latest.drivers.some((driver) => driver.laps > 0);
  const finished = update.complete || /FINISH|COMPLET|FINALIZ/i.test(latest.raceState) || idleWithResult;
  if (finished) {
    archive.status = "complete";
    archive.finishedAt = archive.finishedAt ?? archive.updatedAt;
  }
  return archive;
}

function shouldUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) || blobAuthConfigured();
}

function archivePath(eventKey: string, raceId: string): string {
  return `${ARCHIVE_ROOT}/${eventKey}/${raceId}.json`;
}

function localPath(eventKey: string, raceId: string): string {
  return path.join(/* turbopackIgnore: true */ LOCAL_ROOT, eventKey, `${raceId}.json`);
}

function parseArchive(raw: string): RaceArchive | null {
  try {
    const archive = JSON.parse(raw) as RaceArchive;
    return archive?.version === 1 && /^\d{1,12}$/.test(archive.eventKey) && archive.raceId ? archive : null;
  } catch {
    return null;
  }
}

async function readBlobArchive(eventKey: string, raceId: string): Promise<{ archive: RaceArchive | null; etag: string | null }> {
  const auth = await blobAuthOptions("private");
  const result = await get(archivePath(eventKey, raceId), { ...auth, useCache: false });
  if (!result?.stream || result.statusCode !== 200) return { archive: null, etag: null };
  return { archive: parseArchive(await new Response(result.stream).text()), etag: result.blob.etag };
}

function readLocalArchive(eventKey: string, raceId: string): RaceArchive | null {
  const file = localPath(eventKey, raceId);
  return existsSync(/* turbopackIgnore: true */ file) ? parseArchive(readFileSync(/* turbopackIgnore: true */ file, "utf8")) : null;
}

export async function readRaceArchive(eventKey: string, raceId: string): Promise<RaceArchive | null> {
  if (!/^\d{1,12}$/.test(eventKey) || !/^[a-z0-9-]{3,180}$/.test(raceId)) return null;
  if (shouldUseBlob()) return (await readBlobArchive(eventKey, raceId)).archive;
  return readLocalArchive(eventKey, raceId);
}

export async function appendRaceArchive(update: RaceArchiveUpdate): Promise<RaceArchive> {
  const first = update.frames[0];
  const raceId = first ? raceIdForFrame(first) : "";
  if (!raceId) throw new Error("Falta la identidad de la manga.");
  if (!shouldUseBlob()) {
    const next = mergeRaceArchive(readLocalArchive(update.eventKey, raceId), update);
    const file = localPath(update.eventKey, raceId);
    mkdirSync(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ file, `${JSON.stringify(next)}\n`, "utf8");
    return next;
  }
  const auth = await blobAuthOptions("private");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readBlobArchive(update.eventKey, raceId);
    const next = mergeRaceArchive(current.archive, update);
    try {
      await put(archivePath(update.eventKey, raceId), JSON.stringify(next), {
        ...auth,
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 5,
        maximumSizeInBytes: 15 * 1024 * 1024,
        ...(current.etag ? { ifMatch: current.etag } : { allowOverwrite: false }),
      });
      return next;
    } catch {
      // Otro espectador pudo guardar el mismo cruce. Se vuelve a mezclar.
    }
  }
  throw new Error("No se pudo consolidar el archivo compartido de la manga.");
}

export type RaceArchiveSummary = Pick<RaceArchive, "raceId" | "eventKey" | "eventName" | "section" | "category" | "group" | "startedAt" | "updatedAt" | "finishedAt" | "status" | "circuit"> & { frameCount: number; replayAvailable: boolean };

export function raceArchiveSummary(archive: RaceArchive): RaceArchiveSummary {
  return {
    raceId: archive.raceId,
    eventKey: archive.eventKey,
    eventName: archive.eventName,
    section: archive.section,
    category: archive.category,
    group: archive.group,
    circuit: archive.circuit,
    startedAt: archive.startedAt,
    updatedAt: archive.updatedAt,
    finishedAt: archive.finishedAt,
    status: archive.status,
    frameCount: archive.frames.length,
    replayAvailable: Boolean(archive.replay?.drivers.length),
  };
}

export type RaceDaySummary = {
  id: string;
  eventKey: string;
  title: string;
  date: string;
  circuit: ArchivedCircuit | null;
  categories: Array<"NITRO" | "ECO">;
  raceCount: number;
  completedRaceCount: number;
};

export function raceDaySummary(eventKey: string, archives: RaceArchiveSummary[]): RaceDaySummary {
  const ordered = [...archives].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const representative = ordered.find((item) => item.eventName) ?? ordered[0];
  const categories = [...new Set(ordered.map((item) => item.category).filter((value): value is "NITRO" | "ECO" => value === "NITRO" || value === "ECO"))];
  return {
    id: eventKey,
    eventKey,
    title: representative?.eventName || `Jornada MyRCM ${eventKey}`,
    date: representative?.startedAt?.slice(0, 10) || "",
    circuit: ordered.find((item) => item.circuit)?.circuit || null,
    categories,
    raceCount: ordered.length,
    completedRaceCount: ordered.filter((item) => item.status === "complete").length,
  };
}

export async function listRaceArchives(eventKey: string): Promise<RaceArchiveSummary[]> {
  if (!/^\d{1,12}$/.test(eventKey)) return [];
  const archives: RaceArchive[] = [];
  if (shouldUseBlob()) {
    const auth = await blobAuthOptions("private");
    const result = await list({ ...auth, prefix: `${ARCHIVE_ROOT}/${eventKey}/`, limit: 100 });
    for (const blob of result.blobs.filter((item) => item.pathname.endsWith(".json"))) {
      const raceId = blob.pathname.split("/").at(-1)!.replace(/\.json$/, "");
      const archive = await readRaceArchive(eventKey, raceId);
      if (archive) archives.push(archive);
    }
  } else {
    const directory = path.join(/* turbopackIgnore: true */ LOCAL_ROOT, eventKey);
    if (existsSync(/* turbopackIgnore: true */ directory)) {
      for (const file of readdirSync(/* turbopackIgnore: true */ directory).filter((name) => name.endsWith(".json"))) {
        const archive = readLocalArchive(eventKey, file.replace(/\.json$/, ""));
        if (archive) archives.push(archive);
      }
    }
  }
  return archives.map(raceArchiveSummary).sort((a, b) => Date.parse(b.finishedAt || b.updatedAt) - Date.parse(a.finishedAt || a.updatedAt));
}
