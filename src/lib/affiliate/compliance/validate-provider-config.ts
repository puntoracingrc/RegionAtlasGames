export function hasPublicRakutenEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.keys(env).some((key) => key.startsWith("NEXT_PUBLIC_RAKUTEN_"));
}

export function rakutenProviderIsSafelyDisabledByDefault(): boolean {
  return process.env.RAKUTEN_AFFILIATE_ENABLED !== "true";
}
