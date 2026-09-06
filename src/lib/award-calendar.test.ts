import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { awardCalendarDay, awardUpdateInstruction, getAwardTemporalState, pendingAwardEditions } from "./award-calendar";
import { approvedAwardLogo, getAwardVisualIdentity } from "./award-visual-identity";
import { createAwardQueries } from "./award-public-research";
import type { AwardPublicData } from "./award-research-types";
import { getPublicPersonView } from "./person-public-research";
import { getCompany } from "./indexes";
import { getCatalogGame } from "./catalog";
import { getCatalogWorkKey } from "./catalog-work";

const read = (path: string) => readFileSync(path, "utf8");
const data = JSON.parse(read("data/research/award-study/public.json")) as AwardPublicData;
const query = createAwardQueries(data);
const edition = { ...data.editions.find(e => e.id === "japan-game-awards:2026")!, ceremonyDate: "2026-09-15", status: "upcoming" as const };
const calendarQuery = createAwardQueries({ ...data, editions: [edition] });

test("future appears publicly before its calendar date", () => {
  assert.ok(calendarQuery.getUpcomingAwardEditions("2026-09-14").some(e => e.id === edition.id));
});
test("ceremony day is no longer upcoming", () => {
  assert.ok(!calendarQuery.getUpcomingAwardEditions("2026-09-15").some(e => e.id === edition.id));
});
test("ceremony date is today in admin", () => {
  assert.equal(getAwardTemporalState(edition,"2026-09-15"),"today");
});
test("following day awaits editorial results without changing JSON", () => {
  assert.equal(getAwardTemporalState(edition,"2026-09-16"),"awaiting_results");
  assert.equal(edition.status,"upcoming");
});
test("completed and corrected disappear from notices", () => {
  for (const status of ["completed","corrected"] as const) assert.deepEqual(pendingAwardEditions([{...edition,status}],"2027-01-01"),[]);
});
test("same data changes on injected clock and public route awaits runtime connection", () => {
  assert.notEqual(getAwardTemporalState(edition,"2026-09-14"),getAwardTemporalState(edition,"2026-09-16"));
  for(const path of ["src/app/premios/page.tsx","src/app/premios/[award]/[year]/page.tsx","src/app/admin/premios/page.tsx"]) assert.match(read(path),/await connection\(\)/);
  assert.equal(awardCalendarDay(new Date("2026-09-14T22:00:00Z")),"2026-09-15");
});
test("upcoming and overdue ceremonies have chronological order", () => {
  for (const rows of [query.getUpcomingAwardEditions("2026-09-06"),query.getPendingAwardEditions("2028-01-01")]) {
    const dates=rows.map(e=>e.ceremonyDate); assert.deepEqual(dates,[...dates].sort());
  }
});
test("confirmed ceremonies remain present and future editions have no invented results", () => {
  const confirmed = ["japan-game-awards:2026", "golden-joystick-awards:2026", "the-game-awards:2026", "dice-awards:2027", "game-developers-choice-awards:2027", "independent-games-festival:2027", "bafta-games-awards:2027"];
  for (const id of confirmed) assert.ok(data.editions.some(e => e.id === id && e.sourceIds.length > 0));
  for(const e of query.getUpcomingAwardEditions("2026-09-06")) assert.equal(data.results.filter(r=>r.editionId===e.id).length,0);
});
test("internal person has no public recipient route", () => {
  assert.equal(getPublicPersonView("sam-lake"),undefined);
  const code=read("src/components/award-results.tsx"); assert.match(code,/getPublicPersonView\(recipient.personSlug\)/); assert.match(code,/person \? `\/persona\/\$\{person.slug\}`/);
});
test("company recipient resolves canonical company and existing logo library", () => {
  assert.ok(getCompany("fromsoftware"));
  const code=read("src/components/award-results.tsx"); assert.match(code,/getCompany\(recipient.companySlug\)/); assert.match(code,/resolveCompanyLogo\(company.slug/); assert.match(code,/`\/compania\/\$\{company.slug\}`/);
});
test("linked award covers use existing work identity and catalog cover resolver", () => {
  for(const work of data.workLinks) for(const id of work.catalogIdsVerified) { assert.ok(getCatalogGame(id)); assert.equal(getCatalogWorkKey(id),work.workKey); }
  assert.match(read("src/components/award-results.tsx"),/getCoverSrc\(game.coverUrl, game.id\)/);
});
test("permission-required assets are not rendered even with an assigned path", () => {
  const identity=getAwardVisualIdentity("the-game-awards")!;
  assert.equal(approvedAwardLogo({...identity,usageStatus:"permission_required"}),null);
});
test("BAFTA fallback has no asset and dated logos cannot label another edition", () => {
  assert.equal(approvedAwardLogo(getAwardVisualIdentity("bafta-games-awards")),null);
  assert.equal(approvedAwardLogo(getAwardVisualIdentity("japan-game-awards"),2025),null);
  for(const series of data.series) { const path=approvedAwardLogo(getAwardVisualIdentity(series.slug)); if(path) assert.ok(existsSync(`public${path}`)); }
});
test("CatalogAwards is between description and details", () => {
  const page=read("src/app/catalogo/[slug]/page.tsx");
  assert.ok(page.indexOf("<PanelTitle>Descripción") < page.indexOf("<CatalogAwards"));
  assert.ok(page.indexOf("<CatalogAwards") < page.indexOf("<PanelTitle>Detalles del juego"));
  assert.equal(page.match(/<CatalogAwards/g)?.length,1);
});
test("awards use Panel and portraits in listing preserve complete images", () => {
  const code=read("src/components/award-results.tsx").split("export function CatalogAwards")[1].split("export function CompanyAwards")[0];
  assert.match(code,/<Panel>/); assert.match(code,/<PanelTitle>Premios y reconocimientos/);
  assert.match(read("src/components/person-explorer.tsx"),/fit="contain"/);
});
test("crosslinks reference actual award entities and instructions retain official context", () => {
  for(const result of data.results) { const context=query.getAwardResultContext(result); assert.ok(context.series && context.edition && context.category); }
  const text=awardUpdateInstruction("Japan Game Awards",edition,"https://awards.cesa.or.jp/");
  for(const value of ["Japan Game Awards","2026","2026-09-15",edition.officialUrl!]) assert.ok(text.includes(value));
});
