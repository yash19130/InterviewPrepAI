import { NextResponse, type NextRequest } from "next/server";
import { regenerateKitForUser } from "@/lib/kits/store";
import { requireApiUser } from "@/lib/server/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const updated = await regenerateKitForUser({
    userId: auth.user.uid,
    kitId: id,
  });

  if (!updated) {
    return NextResponse.json({ error: "Kit not found." }, { status: 404 });
  }

  return NextResponse.json({ id, ...updated });
}
