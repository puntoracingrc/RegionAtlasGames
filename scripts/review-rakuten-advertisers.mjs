import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CANDIDATES_FILE = path.join(process.cwd(), "data", "rakuten-advertiser-candidates.local.json");
const REVIEW_FILE = path.join(process.cwd(), "data", "rakuten-advertiser-review.local.json");

const ALLOWED_RELEVANCE = new Set(["needs_review", "relevant", "maybe", "not_relevant", "rejected"]);
const ALLOWED_PRIORITY = new Set(["A", "B", "C", "D", "unknown"]);
const ALLOWED_DECISION = new Set(["apply", "maybe_later", "ignore", "undecided"]);

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeExisting(entry) {
  return {
    provider: "rakuten",
    advertiserId: String(entry.advertiserId || "").trim(),
    advertiserName: String(entry.advertiserName || "").trim(),
    queries: normalizeArray(entry.queries),
    partnershipStatus: String(entry.partnershipStatus || "unknown"),
    relevanceStatus: ALLOWED_RELEVANCE.has(entry.relevanceStatus) ? entry.relevanceStatus : "needs_review",
    priority: ALLOWED_PRIORITY.has(entry.priority) ? entry.priority : "unknown",
    decision: ALLOWED_DECISION.has(entry.decision) ? entry.decision : "undecided",
    notes: String(entry.notes || ""),
    reviewedAt: entry.reviewedAt || null,
  };
}

function fromCandidate(candidate) {
  return {
    provider: "rakuten",
    advertiserId: String(candidate.advertiserId || "").trim(),
    advertiserName: String(candidate.advertiserName || "").trim(),
    queries: normalizeArray(candidate.queries),
    partnershipStatus: String(candidate.partnershipStatus || "unknown"),
    relevanceStatus: candidate.relevanceStatus || "needs_review",
    priority: "unknown",
    decision: "undecided",
    notes: "",
    reviewedAt: null,
  };
}

function mergeQueries(a, b) {
  return Array.from(new Set([...normalizeArray(a), ...normalizeArray(b)])).sort((left, right) => left.localeCompare(right));
}

function summarize(entries) {
  return {
    total: entries.length,
    needsReview: entries.filter((entry) => entry.relevanceStatus === "needs_review").length,
    apply: entries.filter((entry) => entry.decision === "apply").length,
    maybeLater: entries.filter((entry) => entry.decision === "maybe_later").length,
    ignore: entries.filter((entry) => entry.decision === "ignore").length,
  };
}

function main() {
  if (!existsSync(CANDIDATES_FILE)) {
    console.log(`Rakuten advertiser review failed: missing_candidates_file`);
    process.exit(1);
  }

  const candidates = readJson(CANDIDATES_FILE, []).map(fromCandidate).filter((entry) => entry.advertiserId);
  const existing = readJson(REVIEW_FILE, []).map(normalizeExisting).filter((entry) => entry.advertiserId);
  const byId = new Map(existing.map((entry) => [entry.advertiserId, entry]));

  for (const candidate of candidates) {
    const current = byId.get(candidate.advertiserId);
    if (!current) {
      byId.set(candidate.advertiserId, candidate);
      continue;
    }
    current.advertiserName = current.advertiserName || candidate.advertiserName;
    current.queries = mergeQueries(current.queries, candidate.queries);
    current.partnershipStatus = current.partnershipStatus || candidate.partnershipStatus;
    if (!current.relevanceStatus) current.relevanceStatus = "needs_review";
    if (!current.priority) current.priority = "unknown";
    if (!current.decision) current.decision = "undecided";
    if (current.reviewedAt === undefined) current.reviewedAt = null;
  }

  const output = Array.from(byId.values()).sort((a, b) => a.advertiserName.localeCompare(b.advertiserName));
  mkdirSync(path.dirname(REVIEW_FILE), { recursive: true });
  writeFileSync(REVIEW_FILE, `${JSON.stringify(output, null, 2)}\n`);

  const summary = summarize(output);
  console.log("Rakuten advertiser review ready");
  console.log(`Total candidates: ${summary.total}`);
  console.log(`Needs review: ${summary.needsReview}`);
  console.log(`Apply: ${summary.apply}`);
  console.log(`Maybe later: ${summary.maybeLater}`);
  console.log(`Ignore: ${summary.ignore}`);
  console.log(`Output file: ${REVIEW_FILE}`);
}

main();
