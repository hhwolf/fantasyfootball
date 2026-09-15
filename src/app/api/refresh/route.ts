import { NextResponse } from "next/server";
import { refreshLeague } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Manual refresh; protected by the session middleware. */
export async function POST() {
  const result = await refreshLeague();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
