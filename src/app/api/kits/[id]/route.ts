import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { updateKitForUser, getKitForUser } from "@/lib/kits/store";
import { KitSchema } from "@/lib/schemas";
import { requireApiUser } from "@/lib/server/auth";

const MetadataSchema = z
  .object({
    pinnedQuestionIds: z.array(z.string()),
    pinnedFlashcardIds: z.array(z.string()),
    pinnedScheduleDays: z.array(z.number().int().positive()),
    editedFields: z.record(z.string(), z.literal(true)),
    skippedGeneratedIds: z.array(z.string()),
  })
  .strict();

const UpdateKitSchema = z
  .object({
    kit: KitSchema,
    metadata: MetadataSchema,
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const kit = await getKitForUser(auth.user.uid, id);

  if (!kit) {
    return NextResponse.json({ error: "Kit not found." }, { status: 404 });
  }

  return NextResponse.json({ id, ...kit });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);

  if ("response" in auth) {
    return auth.response;
  }

  const body = UpdateKitSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  const { id } = await context.params;
  const updated = await updateKitForUser({
    userId: auth.user.uid,
    kitId: id,
    kit: body.data.kit,
    metadata: body.data.metadata,
  });

  if (!updated) {
    return NextResponse.json({ error: "Kit not found." }, { status: 404 });
  }

  return NextResponse.json({ id, ...updated });
}
