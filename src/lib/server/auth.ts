import { NextResponse, type NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

export type AuthedUser = {
  uid: string;
  email?: string;
};

export async function requireApiUser(
  request: NextRequest,
): Promise<{ user: AuthedUser } | { response: NextResponse }> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    return {
      response: NextResponse.json({ error: "Missing auth token." }, { status: 401 }),
    };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);

    return {
      user: {
        uid: decoded.uid,
        email: decoded.email,
      },
    };
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid auth token." }, { status: 401 }),
    };
  }
}
