import { NextResponse, type NextRequest } from "next/server";
import { listKitsForUser } from "@/lib/kits/store";
import { requireApiUser } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);

  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({
    kits: await listKitsForUser(auth.user.uid),
  });
}
