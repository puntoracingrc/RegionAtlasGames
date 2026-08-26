import assert from "node:assert/strict";
import test from "node:test";
import writeExcelFile from "write-excel-file/node";
import {
  importSpreadsheet,
  isSupportedSpreadsheetFilename,
  parseSpreadsheet,
} from "./import-collection";

test("accepts current spreadsheet formats and rejects legacy XLS", () => {
  assert.equal(isSupportedSpreadsheetFilename("coleccion.CSV"), true);
  assert.equal(isSupportedSpreadsheetFilename(" coleccion.xlsx "), true);
  assert.equal(isSupportedSpreadsheetFilename("coleccion.xls"), false);
  assert.equal(isSupportedSpreadsheetFilename("coleccion.xlsx.exe"), false);
});

test("imports semicolon-delimited CSV with quantities", async () => {
  const csv = Buffer.from(
    "Titulo;Plataforma;Cantidad\nJuego de prueba;PS2;2\n",
    "utf8",
  );

  const result = await importSpreadsheet(csv, "coleccion.csv");

  assert.equal(result.stats.imported, 1);
  assert.equal(result.items[0]?.title, "Juego de prueba");
  assert.equal(result.items[0]?.platformSlug, "ps2");
  assert.equal(result.items[0]?.quantity, 2);
});

test("prefers the TODO sheet in a multi-sheet XLSX workbook", async () => {
  const workbook = await writeExcelFile([
    {
      sheet: "Notas",
      data: [["Esta hoja no debe importarse"]],
    },
    {
      sheet: "TODO",
      data: [
        ["Titulo", "Plataforma", "Cantidad"],
        ["Juego desde Excel", "SNES", 3],
      ],
    },
  ]).toBuffer();

  const rows = await parseSpreadsheet(workbook, "coleccion.xlsx");
  const result = await importSpreadsheet(workbook, "coleccion.xlsx");

  assert.deepEqual(rows[0], ["Titulo", "Plataforma", "Cantidad"]);
  assert.equal(result.stats.imported, 1);
  assert.equal(result.items[0]?.title, "Juego desde Excel");
  assert.equal(result.items[0]?.platformSlug, "snes");
  assert.equal(result.items[0]?.quantity, 3);
});

test("rejects unsupported spreadsheet extensions", async () => {
  await assert.rejects(
    () => parseSpreadsheet(Buffer.from("not-a-sheet"), "coleccion.xls"),
    /Formato no soportado/,
  );
});
