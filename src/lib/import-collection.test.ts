import assert from "node:assert/strict";
import test from "node:test";
import writeExcelFile from "write-excel-file/node";
import type { CollectionItem } from "./types";
import {
  findAvailableCatalogLink,
  importSpreadsheet,
  isSupportedSpreadsheetFilename,
  parseSpreadsheet,
  repairCollectionPlatform,
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

test("preserves the owned copy condition from collection imports", async () => {
  const csv = Buffer.from(
    "Titulo;Plataforma;Cantidad;Condicion\nPrecintado;PS4;2;Sealed\nCompleto;PS4;1;CIB\n",
    "utf8",
  );
  const result = await importSpreadsheet(csv, "coleccion.csv");

  assert.equal(result.items[0]?.collectionCondition, "sealed");
  assert.equal(result.items[1]?.collectionCondition, "complete");
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

test("repairs the catalog scope when an existing platform becomes active", async () => {
  const csv = Buffer.from(
    "Titulo;Plataforma\nJuego PS5 todavía sin ficha;PS5\n",
    "utf8",
  );
  const result = await importSpreadsheet(csv, "coleccion.csv");
  const imported = result.items[0];

  assert.ok(imported);
  const repaired = repairCollectionPlatform({ ...imported, inRetroCatalog: false });

  assert.equal(repaired.platformSlug, "ps5");
  assert.equal(repaired.inRetroCatalog, true);
});

test("matches equal titles to the requested regional variant", () => {
  const base = {
    id: "regional-import",
    catalogId: null,
    catalogMatched: false,
    inRetroCatalog: true,
    title: "102 Dalmatians, Disneys: Puppies to the Rescue",
    platformSlug: "dreamcast",
    region: "PAL Europa",
  } as CollectionItem;

  assert.equal(
    findAvailableCatalogLink(base)?.id,
    "dreamcast-pal-102-dalmatians-disneys-puppies-rescue",
  );
  assert.equal(
    findAvailableCatalogLink({ ...base, region: "USA" })?.id,
    "dreamcast-102-dalmatians-disneys-puppies-rescue",
  );

  assert.equal(
    findAvailableCatalogLink({
      ...base,
      title: "Astro Bot",
      platformSlug: "ps5",
      region: "USA",
    })?.id,
    "ps5-usa-astro-bot",
  );
  assert.equal(
    findAvailableCatalogLink({
      ...base,
      title: "Astro Bot",
      platformSlug: "ps5",
      region: "PAL España",
    })?.id,
    "ps5-astro-bot",
  );
});

test("links legacy apostrophe variants to the surviving catalog record", () => {
  const base = {
    id: "legacy-adam",
    catalogId: null,
    catalogMatched: false,
    inRetroCatalog: true,
    platformSlug: "ps4",
    region: "PAL España",
  } as CollectionItem;

  for (const title of [
    "Adam's Venture Origins",
    "Adam&#39;s Venture Origins",
    "Adam´s Venture Origins",
    "Adam’s Venture Origins",
  ]) {
    assert.equal(
      findAvailableCatalogLink({ ...base, title })?.id,
      "ps4-adam-s-venture-origins",
    );
  }
});

test("repairs collection links using the PriceCharting title and product id", () => {
  const base = {
    id: "legacy-ps5-import",
    catalogId: null,
    catalogMatched: false,
    inRetroCatalog: true,
    title: "Nombre antiguo de la colección",
    titlePc: "Final Fantasy VII Rebirth",
    pcImportId: 6166789,
    platformSlug: "ps5",
    region: "PAL España",
  } as CollectionItem;

  assert.equal(
    findAvailableCatalogLink(base)?.id,
    "ps5-final-fantasy-vii-rebirth",
  );
  assert.equal(
    findAvailableCatalogLink({ ...base, pcImportId: null })?.id,
    "ps5-final-fantasy-vii-rebirth",
  );
});
