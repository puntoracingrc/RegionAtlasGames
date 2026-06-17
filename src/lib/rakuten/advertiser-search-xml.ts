import type { RakutenAdvertiserSearchMerchant } from "./advertiser-search.types";

function decodeXmlEntity(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXmlEntity(match[1].replace(/<[^>]+>/g, "")) : null;
}

export function parseRakutenAdvertiserSearchXml(xml: string): RakutenAdvertiserSearchMerchant[] {
  if (!xml.trim()) return [];
  const merchants: RakutenAdvertiserSearchMerchant[] = [];
  const merchantPattern = /<merchant\b[^>]*>([\s\S]*?)<\/merchant>/gi;
  let match: RegExpExecArray | null;

  while ((match = merchantPattern.exec(xml))) {
    const block = match[1] ?? "";
    const mid = tagValue(block, "mid");
    const merchantName = tagValue(block, "merchantname");
    if (mid && merchantName) merchants.push({ mid, merchantName });
  }

  return merchants;
}
