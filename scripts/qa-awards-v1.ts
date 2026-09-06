import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalogGamePath } from "../src/lib/catalog-url";
import { getCatalogGame } from "../src/lib/catalog";

const base = process.argv[2];
const output = process.argv[3];
assert.ok(base && output, "Usage: tsx scripts/qa-awards-v1.ts BASE_URL OUTPUT_DIRECTORY");
const out = resolve(output);
mkdirSync(out,{recursive:true});
const session = "awards-v1";
const run = (...args:string[]) => {
  const payload = JSON.parse(execFileSync("npx",["--yes","agent-browser","--session",session,...args,"--json"],{encoding:"utf8",timeout:90000,maxBuffer:8*1024*1024}));
  assert.ok(payload.success,JSON.stringify(payload));
  return payload.data;
};
const routes = ["/premios","/premios/the-game-awards","/premios/game-developers-choice-awards/2024","/premios/the-game-awards/categoria/game-of-the-year","/premios/ultimos-ganadores","/premios/the-game-awards/2026","/persona/hidetaka-miyazaki","/persona/hideo-kojima","/persona/shigeru-miyamoto","/compania/fromsoftware","/compania/sony-interactive-entertainment","/compania/larian-studios",...["ps4-elden-ring","ps5-usa-baldur-s-gate-iii-deluxe-edition","ps5-astro-bot","ps5-clair-obscur-expedition-33"].map(id => {const g=getCatalogGame(id);assert.ok(g,id);return catalogGamePath(g);})];
const results:unknown[] = [];
async function main() {
try {
  for (const [name,width,height] of [["desktop",1440,1000],["mobile",390,844]] as const) {
    run("set","viewport",String(width),String(height));
    for (const [index,path] of routes.entries()) {
      const url = new URL(path,base).href;
      const response = await fetch(url,{headers:{Connection:"close"}}); assert.equal(response.status,200,url);
      run("open",url);
      run("eval",`(async()=>{for(const img of document.images){img.loading='eager';}await Promise.all(Array.from(document.images).map(i=>Promise.race([i.decode().catch(()=>{}),new Promise(r=>setTimeout(r,15000))])));return true;})()`);
      const data = run("eval",`({url:location.href,title:document.title,h1:document.querySelector('h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,broken:Array.from(document.images).filter(i=>i.getClientRects().length&&i.complete&&i.naturalWidth===0).map(i=>i.currentSrc),canonical:document.querySelector('link[rel=canonical]')?.getAttribute('href'),awardHeadings:Array.from(document.querySelectorAll('h2,h3')).filter(e=>e.textContent?.includes('Premios')).map(e=>e.textContent)})`).result;
      const errors = run("errors").errors;
      run("screenshot",`${out}/${name}-${index}.png`);
      if (path.startsWith("/persona/") || path.startsWith("/catalogo/") || path.startsWith("/compania/")) {
        run("eval",`(()=>{const e=Array.from(document.querySelectorAll('h2,h3')).find(e=>e.textContent==='Premios y reconocimientos');e?.scrollIntoView({block:'start'});return !!e;})()`);
        run("screenshot",`${out}/${name}-${index}-awards.png`);
      }
      results.push({viewport:name,path,status:response.status,...data,errors});
      writeFileSync(`${out}/report.json`,JSON.stringify({base,results},null,2)+"\n");
      assert.ok(!data.overflow,`Overflow: ${name} ${path}`);
      assert.deepEqual(errors,[],`Console: ${path}`);
      assert.deepEqual(data.broken,[],`Images: ${path}`);
      if (path.startsWith("/premios")) assert.equal(new URL(data.canonical).pathname,path,`Canonical: ${path}`);
      if (path.startsWith("/persona/") || path.startsWith("/catalogo/") || path.startsWith("/compania/")) assert.equal(data.awardHeadings.filter((h:string) => h === "Premios y reconocimientos").length,1,`Single awards block: ${path}`);
      console.log(`PASS ${name} ${path}`);
    }
  }
  for (const path of ["/persona/sam-lake","/persona/swen-vincke","/persona/guillaume-broche","/premios/not-an-award","/premios/the-game-awards/9999","/data/research/award-study/research.json"]) {
    assert.equal((await fetch(new URL(path,base),{headers:{Connection:"close"}})).status,404,path);
  }
  console.log(`PASS ${results.length} viewport/routes and 6 negative routes`);
} finally {
  run("close");
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
