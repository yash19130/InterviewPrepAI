import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/server/auth";
import { createKitForUser } from "@/lib/kits/store";

const GenerateKitRequestSchema = z
  .object({
    jd: z.string().min(1),
    company_url: z.string().min(1),
    days: z.number().int().positive(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);

  if ("response" in auth) {
    return auth.response;
  }

  const body = GenerateKitRequestSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  try {
    const result = await createKitForUser({
      userId: auth.user.uid,
      jd: body.data.jd,
      companyUrl: body.data.company_url,
      days: body.data.days,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Kit generation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
