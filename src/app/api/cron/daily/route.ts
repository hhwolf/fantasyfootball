import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs } from "@/lib/jobs";
import { env } from "@/lib/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!secret && env().NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  const force = req.nextUrl.searchParams.get("jobs")?.split(",").filter(Boolean);
  const results = await runDailyJobs(new Date(), force);
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
