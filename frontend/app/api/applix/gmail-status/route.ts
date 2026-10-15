import { NextResponse } from "next/server";
import { bearer, gmailFailure, gmailUser, transition } from "../../../../lib/gmailServer";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await gmailUser(bearer(req));
    const status = await transition("status", user.id);
    return NextResponse.json({ ok: true, ...status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return gmailFailure(error); }
}
