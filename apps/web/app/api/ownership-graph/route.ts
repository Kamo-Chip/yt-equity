import { NextRequest, NextResponse } from "next/server";
import { getOwnershipGraph } from "../../../lib/api";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  try { return NextResponse.json(await getOwnershipGraph(search), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Ownership data is unavailable." }, { status: 503 }); }
}
