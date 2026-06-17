import { AFFILIATE_DISCLOSURE_TEXT } from "@/lib/affiliate/disclosure";

export function AffiliateDisclosure() {
  return (
    <p className="rounded-2xl border border-accent/25 bg-accent/10 p-3 text-sm font-medium leading-6 text-foreground">
      {AFFILIATE_DISCLOSURE_TEXT}
    </p>
  );
}

