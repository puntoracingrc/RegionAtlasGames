import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scanResearchCatalog } from "../src/lib/research-engine/catalog-scanner";

type Args = {
  platformSlug: string | null;
  query: string | null;
  limit: number | null;
  write: boolean;
  includeClean: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    platformSlug: null,
    query: null,
    limit: 250,
    write: false,
    includeClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--platform") args.platformSlug = argv[++index] ?? null;
    else if (value === "--query") args.query = argv[++index] ?? null;
    else if (value === "--limit") {
      const raw = argv[++index] ?? "250";
      args.limit = raw === "all" || raw === "0" ? null : Math.max(1, Number.parseInt(raw, 10) || 250);
    } else if (value === "--write") args.write = true;
    else if (value === "--include-clean") args.includeClean = true;
    else if (value === "--help" || value === "-h") {
      console.log(`RegionAtlas Research Engine catalog scanner\n\nUsage:\n  npx tsx scripts/research-engine-scan.ts [options]\n\nOptions:\n  --platform <slug>     Filter by platform (ps3, ps5, switch, xbox360, ...)\n  --query <text>        Filter by title/edition/barcode/identifier\n  --limit <n|all>       Return top research-debt items (default: 250)\n  --include-clean       Include records without detected risks\n  --write               Save JSON under artifacts/research-engine/\n`);
      process.exit(0);
    }
  }
  return args;
}

function timestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

const args = parseArgs(process.argv.slice(2));
const result = scanResearchCatalog({
  platformSlug: args.platformSlug,
  query: args.query,
  limit: args.limit,
  includeClean: args.includeClean,
});

const output = JSON.stringify(result, null, 2);
if (args.write) {
  const directory = path.join(process.cwd(), "artifacts", "research-engine");
  mkdirSync(directory, { recursive: true });
  const filename = `catalog-scan-${timestamp(result.generatedAt)}.json`;
  const target = path.join(directory, filename);
  writeFileSync(target, `${output}\n`, "utf8");
  console.error(`[research-engine] wrote ${path.relative(process.cwd(), target)}`);
}

console.error(
  `[research-engine] scanned=${result.summary.scanned} flagged=${result.summary.flagged} ` +
  `P0=${result.summary.p0} P1=${result.summary.p1} P2=${result.summary.p2} debt=${result.summary.totalDebt}`,
);
console.log(output);
