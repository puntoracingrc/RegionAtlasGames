import assert from "node:assert/strict";
import test from "node:test";
import { mergeRaceArchive, raceArchiveSummary, raceDaySummary, raceIdForFrame, replayFromFrames, sanitizeArchivedFrame, sanitizeRaceArchiveUpdate } from "./myrcm-race-archive";

const circuit = {
  id: "cerdanyola",
  name: "Circuit de Modelisme de Cerdanyola",
  lapLengthMeters: 215.15,
  precisionNote: "Medición orientativa",
  map: {
    viewBox: "0 0 1000 390",
    title: "Circuito de Cerdanyola",
    description: "Trazado antihorario",
    guidePath: "M0 0 L100 100 Z",
    infieldPaths: ["M10 10 H20 V20 Z"],
    pitPath: "M5 5 L25 25",
    pitLabels: [{ x: 5, y: 8, text: "BOXES" }],
    startGrid: { transform: "translate(10 20)", lines: [{ x1: 0, y1: 0, x2: 0, y2: 10 }], label: { x: 0, y: -2, text: "SALIDA" } },
    directionPaths: ["M0 0 H20"],
    timingLine: { transform: "translate(90 90)", x1: 0, y1: -5, x2: 0, y2: 5, labelX: -2, labelY: 8, label: "TRANSPONDER" },
  },
};

function frame(at: string, laps: number, lastLapSeconds: number, state = "RUNNING") {
  return sanitizeArchivedFrame({
    capturedAt: at,
    name: "Cerdanyola",
    section: "GT8 NITRO",
    sectionCode: "398202",
    category: "NITRO",
    group: "Final A",
    groupKey: "1150",
    raceState: state,
    raceTime: "30:00",
    currentTime: laps === 1 ? "0:25.000" : "0:42.500",
    remaining: "29:35",
    percentage: 2,
    update: `lap-${laps}`,
    circuit,
    drivers: [{ key: "10", position: 1, name: "MARC GARCIA", laps, lastLap: String(lastLapSeconds), lastLapSeconds }],
  })!;
}

test("sanitizes an archive update and creates a stable race id", () => {
  const first = frame("2026-09-23T10:00:00Z", 1, 17.5);
  const update = sanitizeRaceArchiveUpdate({ eventKey: "100645", frames: [first] });
  assert.equal(update.frames.length, 1);
  assert.equal(update.frames[0].circuit?.name, circuit.name);
  assert.match(raceIdForFrame(first), /^nitro-1150-[a-f0-9]{10}$/);
});

test("deduplicates frames and closes the archive with the final ranking", () => {
  const first = frame("2026-09-23T10:00:00Z", 1, 17.5);
  const second = frame("2026-09-23T10:00:18Z", 2, 17.4, "FINISHED");
  const initial = mergeRaceArchive(null, { eventKey: "100645", frames: [first, first] });
  const complete = mergeRaceArchive(initial, { eventKey: "100645", frames: [second], complete: true, finalRanking: [{ position: 1, name: "Marc García", points: 640 }] });
  assert.equal(complete.frames.length, 2);
  assert.equal(complete.status, "complete");
  assert.equal(complete.finalRanking[0].name, "Marc García");
  assert.equal(complete.replay?.drivers[0].laps.length, 2);
  assert.equal(complete.circuit?.map.guidePath, circuit.map.guidePath);
});

test("reconstructs replay laps and the initial transponder offset from captured frames", () => {
  const replay = replayFromFrames("100645", [frame("2026-09-23T10:00:00Z", 1, 17.5), frame("2026-09-23T10:00:18Z", 2, 17.4)]);
  assert.equal(replay?.drivers[0].startOffsetSeconds, 7.5);
  assert.deepEqual(replay?.drivers[0].laps, [{ lap: 1, seconds: 17.5 }, { lap: 2, seconds: 17.4 }]);
  assert.equal(replay?.circuit?.id, "cerdanyola");
});

test("groups every category and heat under one event jornada", () => {
  const nitro = mergeRaceArchive(null, { eventKey: "100645", frames: [frame("2026-09-23T10:00:00Z", 1, 17.5)] });
  const ecoFrame = frame("2026-09-23T11:00:00Z", 1, 16.9);
  ecoFrame.category = "ECO";
  ecoFrame.section = "GT8 ECO";
  ecoFrame.sectionCode = "398203";
  ecoFrame.group = "Semifinal A";
  ecoFrame.groupKey = "1250";
  const eco = mergeRaceArchive(null, { eventKey: "100645", frames: [ecoFrame], complete: true });
  const jornada = raceDaySummary("100645", [raceArchiveSummary(nitro), raceArchiveSummary(eco)]);
  assert.equal(jornada.raceCount, 2);
  assert.deepEqual(jornada.categories, ["NITRO", "ECO"]);
  assert.equal(jornada.circuit?.id, "cerdanyola");
});

test("treats an idle MyRCM snapshot with completed laps as a finished race", () => {
  const idle = frame("2026-09-23T10:10:00Z", 21, 17.2, "rsIdle");
  idle.currentTime = "0:00";
  const archive = mergeRaceArchive(null, { eventKey: "100645", frames: [idle] });
  assert.equal(archive.status, "complete");
  assert.equal(archive.finishedAt, idle.capturedAt);
});
