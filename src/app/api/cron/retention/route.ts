import { NextResponse } from "next/server";
import { runRetention } from "@/lib/ops/retention";

// Vercel runs this once a day (see vercel.json "crons"). Vercel sends the CRON_SECRET
// environment variable as a Bearer token; without CRON_SECRET set, nothing is deleted.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    const results = await runRetention();
    return NextResponse.json({ processed: results.length, results });
  } catch (e) {
    console.error("retention run failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
