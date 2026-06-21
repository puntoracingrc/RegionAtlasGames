import { NextResponse } from "next/server";
import {
  assertLocalGameRunnerToken,
  claimNextLocalGameRunnerJob,
  localGameRunnerTokenConfigured,
} from "@/lib/local-game-runner-jobs";

export async function POST(request: Request) {
  if (!localGameRunnerTokenConfigured()) {
    return NextResponse.json({ ok: false, error: "LOCAL_GAME_RUNNER_TOKEN no configurado." }, { status: 503 });
  }
  if (!assertLocalGameRunnerToken(request)) {
    return NextResponse.json({ ok: false, error: "Token de runner inválido." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const result = await claimNextLocalGameRunnerJob(String(body?.runnerId ?? "mac-local"));
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
