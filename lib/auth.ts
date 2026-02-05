import { verifyToken } from "@clerk/backend";
import type { VercelRequest } from "@vercel/node";

/** Extract and verify Clerk JWT from the Authorization header. Returns the userId or null. */
export async function authenticateRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return payload.sub; // Clerk user ID
  } catch {
    return null;
  }
}
