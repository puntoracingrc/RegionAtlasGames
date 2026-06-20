export function cronRequestAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;

  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  const vercelCronHeader = request.headers.get("x-vercel-cron")?.toLowerCase() ?? "";
  const vercelId = request.headers.get("x-vercel-id") ?? "";
  const looksLikeVercelCron =
    userAgent.includes("vercel-cron") ||
    vercelCronHeader === "1" ||
    vercelCronHeader === "true";

  if (process.env.VERCEL && looksLikeVercelCron && vercelId) return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;

  return false;
}
