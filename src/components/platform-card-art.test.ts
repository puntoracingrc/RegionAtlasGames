import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { getPlatformHistoryData } from "../lib/platform-history";
import { PLATFORM_IMAGE_SLUGS } from "./platform-card-art";

const extensionFor = (slug: string) => {
  if (slug === "hyper-neogeo-64") return "jpg";
  if ([
    "gameandwatch",
    "gba",
    "snes",
    "virtualboy",
    "wiiu",
    "xbox",
    "xbox360",
    "xboxone",
    "xboxseries",
    "ps4",
    "switch",
    "switch2",
  ].includes(slug)) return "webp";
  return "png";
};

test("ships a local console image for every published platform history", () => {
  for (const history of getPlatformHistoryData().platforms) {
    assert.ok(PLATFORM_IMAGE_SLUGS.has(history.platformSlug), history.platformSlug);
    assert.ok(
      existsSync(`public/platform-consoles/${history.platformSlug}.${extensionFor(history.platformSlug)}`),
      history.platformSlug,
    );
  }
});
