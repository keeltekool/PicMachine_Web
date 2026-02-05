import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "../../lib/auth";
import { getViewUrl, deleteImage } from "../../lib/r2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await authenticateRequest(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { key } = req.query;
  if (!key || typeof key !== "string") {
    return res.status(400).json({ error: "key parameter required" });
  }

  // Decode the key (it comes URL-encoded from the path)
  const decodedKey = decodeURIComponent(key);

  // Security: only allow accessing own images
  if (!decodedKey.startsWith(`${userId}/`)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // GET /api/images/[key] — get signed view URL for single image
  if (req.method === "GET") {
    try {
      const url = await getViewUrl(decodedKey);
      return res.status(200).json({ url, key: decodedKey });
    } catch (err) {
      console.error("Get view URL error:", err);
      return res.status(500).json({ error: "Failed to get view URL" });
    }
  }

  // DELETE /api/images/[key] — delete single image
  if (req.method === "DELETE") {
    try {
      await deleteImage(decodedKey);
      return res.status(200).json({ deleted: decodedKey });
    } catch (err) {
      console.error("Delete error:", err);
      return res.status(500).json({ error: "Failed to delete image" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
