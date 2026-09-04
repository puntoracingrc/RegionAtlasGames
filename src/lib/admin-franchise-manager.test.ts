import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("administra franquicias y relaciones en un overlay reversible sin tocar los datos base", async () => {
  const previousCwd = process.cwd();
  const previousEnv = {
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    VERCEL: process.env.VERCEL,
  };
  const temporaryCwd = mkdtempSync(path.join(os.tmpdir(), "region-atlas-franchises-"));
  process.chdir(temporaryCwd);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL;

  try {
    const manager = await import("./admin-franchise-manager");
    const initial = await manager.listAdminFranchises();
    assert.equal(initial.length, 9);

    const created = await manager.createAdminFranchise({
      name: "Franquicia de prueba",
      slug: "franquicia-prueba",
      description: "Perfil inicial.",
    });
    assert.ok(!("error" in created));
    assert.equal(created.franchise.id, "franchise:franquicia-prueba");
    assert.equal(created.franchise.status, "draft");
    assert.equal(await manager.getPublicFranchiseEntity("franquicia-prueba"), null);

    const published = await manager.updateAdminFranchise("franquicia-prueba", {
      name: "Franquicia de prueba editada",
      description: "Perfil revisado.",
      status: "published",
    });
    assert.ok(!("error" in published));
    assert.equal(published.franchise.id, "franchise:franquicia-prueba");
    assert.equal(published.franchise.slug, "franquicia-prueba");
    assert.equal((await manager.getPublicFranchiseEntity("franquicia-prueba"))?.name, "Franquicia de prueba editada");

    const seriesOptions = await manager.listAdminSeriesOptions();
    const candidateSeries = seriesOptions.find((series) => series.slug === "super-mario") ?? seriesOptions[0];
    assert.ok(candidateSeries);
    const seriesLinked = await manager.setAdminSeriesFranchise({
      seriesSlug: candidateSeries.slug,
      franchiseSlug: "franquicia-prueba",
      primary: false,
    });
    assert.deepEqual(seriesLinked, { ok: true });

    const withSeries = await manager.getAdminFranchise("franquicia-prueba");
    assert.ok(!("error" in withSeries));
    assert.ok(withSeries.series.some((series) => series.slug === candidateSeries.slug));
    assert.ok(withSeries.games.length > 0);
    assert.ok(withSeries.games.every((game) => game.membership === "inherited"));

    const inheritedGame = withSeries.games[0];
    assert.deepEqual(
      await manager.removeAdminGameFranchise({
        gameId: inheritedGame.id,
        franchiseSlug: "franquicia-prueba",
      }),
      { error: "La pertenencia está heredada de una saga; resuelve primero esa relación." },
    );

    assert.deepEqual(
      await manager.addAdminGameFranchise({
        gameId: inheritedGame.id,
        franchiseSlug: "franquicia-prueba",
        primary: true,
        role: "spin_off",
      }),
      { ok: true },
    );
    assert.deepEqual(
      await manager.updateAdminGameFranchise({
        gameId: inheritedGame.id,
        franchiseSlug: "franquicia-prueba",
        primary: true,
        role: "mainline",
      }),
      { ok: true },
    );
    const withDirect = await manager.getAdminGameFranchiseContext(inheritedGame.id);
    assert.ok(!("error" in withDirect));
    const membership = withDirect.franchises.find((franchise) => franchise.slug === "franquicia-prueba");
    assert.equal(membership?.membership, "direct_and_inherited");
    assert.equal(membership?.role, "mainline");

    const relationshipInput = {
      sourceType: "franchise" as const,
      sourceId: "franchise:franquicia-prueba",
      targetType: "franchise" as const,
      targetId: "franchise:mario",
      relationshipType: "crossover_with" as const,
    };
    assert.deepEqual(await manager.addAdminEntityRelationship(relationshipInput), { ok: true });
    assert.deepEqual(await manager.addAdminEntityRelationship(relationshipInput), { error: "La relación ya existe." });

    assert.deepEqual(
      await manager.removeAdminSeriesFranchise({
        seriesSlug: candidateSeries.slug,
        franchiseSlug: "franquicia-prueba",
      }),
      { ok: true },
    );
    const withoutSeries = await manager.getAdminFranchise("franquicia-prueba");
    assert.ok(!("error" in withoutSeries));
    assert.equal(withoutSeries.series.length, 0);
    assert.equal(withoutSeries.games.find((game) => game.id === inheritedGame.id)?.membership, "direct");

    const overlayPath = path.join(temporaryCwd, "data", "admin", "franchise-system-overlay.json");
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    assert.equal(overlay.schemaVersion, 1);
    assert.equal(overlay.state.franchises["franquicia-prueba"].id, "franchise:franquicia-prueba");
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key as keyof NodeJS.ProcessEnv];
      else process.env[key] = value;
    }
    rmSync(temporaryCwd, { recursive: true, force: true });
  }
});
