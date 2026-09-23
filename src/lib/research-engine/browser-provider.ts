import { existsSync } from "node:fs";
import { canonicalImageUrl, sourceRecordIdFromUrl } from "./physical-evidence";
import { assertSafeResearchUrl, type ResearchDnsLookup } from "./url-security";
import type { ResearchBrowserProvider, ResearchBrowserResult } from "./v2-types";

type BrowserProviderOptions = {
  executablePath?: string | null;
  headless?: boolean;
  timeoutMs?: number;
  resolver?: ResearchDnsLookup;
};

function browserExecutable(explicit?: string | null): string | undefined {
  const candidates = [
    explicit,
    process.env.RESEARCH_BROWSER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value?.trim()));
  return candidates.find((candidate) => existsSync(candidate));
}

export class PlaywrightResearchBrowserProvider implements ResearchBrowserProvider {
  readonly name = "playwright-chromium";
  private browser: import("playwright-core").Browser | null = null;
  private readonly executablePath: string | undefined;
  private readonly headless: boolean;
  private readonly timeoutMs: number;
  private readonly resolver?: ResearchDnsLookup;

  constructor(options: BrowserProviderOptions = {}) {
    this.executablePath = browserExecutable(options.executablePath);
    this.headless = options.headless ?? true;
    this.timeoutMs = Math.max(2_000, Math.min(60_000, options.timeoutMs ?? 20_000));
    this.resolver = options.resolver;
  }

  private async getBrowser() {
    if (this.browser) return this.browser;
    const { chromium } = await import("playwright-core");
    this.browser = await chromium.launch({
      headless: this.headless,
      ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      args: ["--disable-background-networking", "--disable-component-update", "--disable-sync"],
    });
    return this.browser;
  }

  async browse(value: string): Promise<ResearchBrowserResult> {
    const url = await assertSafeResearchUrl(value, this.resolver);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: "RegionAtlasResearchEngine/2.0 (+https://www.regionatlas.games/)",
      javaScriptEnabled: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      try {
        await assertSafeResearchUrl(route.request().url(), this.resolver);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    try {
      const navigation = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(5_000, this.timeoutMs) }).catch(() => undefined);
      const current = await assertSafeResearchUrl(page.url(), this.resolver);
      const status = navigation?.status() ?? 200;
      if (status < 200 || status >= 400) throw new Error(`RESEARCH_BROWSER_HTTP_${status}`);
      const output = await page.evaluate(() => ({
        title: document.title,
        text: document.body?.innerText ?? "",
        links: Array.from(document.querySelectorAll("a[href]"), (element) => (element as HTMLAnchorElement).href),
        images: Array.from(document.querySelectorAll("img"), (element) => {
          const image = element as HTMLImageElement;
          const figure = image.closest("figure");
          const anchor = image.closest("a[href]") as HTMLAnchorElement | null;
          const linkedImage = anchor && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(anchor.href) ? anchor.href : null;
          const original = image.dataset.imageUrl || image.dataset.original || image.dataset.zoom || image.dataset.zoomImage || image.dataset.large || image.dataset.full || linkedImage;
          return {
            url: original || image.currentSrc || image.src || image.dataset.src || "",
            thumbnailUrl: image.currentSrc || image.src || image.dataset.src || null,
            originalUrl: original || null,
            alt: image.alt || null,
            caption: figure?.querySelector("figcaption")?.textContent?.trim() || image.title || null,
            mechanism: original ? (linkedImage ? "ancestor-a.href" : "img.data-original") : "rendered-img",
          };
        }).concat(Array.from(document.querySelectorAll('meta[property="og:image"],meta[property="og:image:url"],meta[name="twitter:image"],meta[name="twitter:image:src"]'), (element) => ({
          url: (element as HTMLMetaElement).content,
          thumbnailUrl: null,
          originalUrl: (element as HTMLMetaElement).content,
          alt: element.getAttribute("property") || element.getAttribute("name"),
          caption: null,
          mechanism: "rendered-meta-image",
        }))),
      }));
      const links = [...new Set(output.links.filter((link) => /^https?:\/\//i.test(link)))].slice(0, 500);
      const images = [...new Map(output.images.filter((image) => /^https?:\/\//i.test(image.url)).map((image) => {
        const resolvedUrl = image.originalUrl || image.url;
        const canonicalUrl = canonicalImageUrl(resolvedUrl);
        return [canonicalUrl, {
          url: resolvedUrl,
          thumbnailUrl: image.thumbnailUrl,
          originalUrl: image.originalUrl,
          resolvedUrl,
          canonicalUrl,
          alt: image.alt,
          caption: image.caption,
          galleryLabel: image.caption ?? image.alt,
          sourcePageUrl: current.toString(),
          sourceRecordId: sourceRecordIdFromUrl(resolvedUrl),
          listingId: sourceRecordIdFromUrl(current.toString()),
          acquisitionMechanisms: [image.mechanism],
        }];
      })).values()].slice(0, 300);
      return {
        url: current.toString(),
        status,
        title: output.title.slice(0, 500),
        text: output.text.replace(/\s+/g, " ").trim().slice(0, 300_000),
        links,
        images,
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.close();
  }
}
