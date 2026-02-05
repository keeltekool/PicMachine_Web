import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "../../lib/auth.js";
import { listUserImages, getViewUrl, getUploadUrl, deleteImages } from "../../lib/r2.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await authenticateRequest(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // GET /api/images — list user's images with signed view URLs
  if (req.method === "GET") {
    try {
      const objects = await listUserImages(userId);

      const images = await Promise.all(
        objects.map(async (obj) => {
          const key = obj.Key!;
          const name = key.split("/").pop()!;
          const url = await getViewUrl(key);
          return { key, name, url, size: obj.Size, lastModified: obj.LastModified };
        })
      );

      // Sort by last modified descending (newest first)
      images.sort((a, b) => {
        const dateA = a.lastModified?.getTime() ?? 0;
        const dateB = b.lastModified?.getTime() ?? 0;
        return dateB - dateA;
      });

      return res.status(200).json({ images, count: images.length });
    } catch (err) {
      console.error("List images error:", err);
      return res.status(500).json({ error: "Failed to list images" });
    }
  }

  // POST /api/images — generate presigned upload URL
  if (req.method === "POST") {
    try {
      const { filename, contentType } = req.body;
      if (!filename || !contentType) {
        return res.status(400).json({ error: "filename and contentType required" });
      }

      const key = `${userId}/${Date.now()}_${filename}`;
      const uploadUrl = await getUploadUrl(key, contentType);

      return res.status(200).json({ uploadUrl, key });
    } catch (err) {
      console.error("Upload URL error:", err);
      return res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }

  // DELETE /api/images?keys=a,b,c — batch delete
  if (req.method === "DELETE") {
    try {
      const keysParam = req.query.keys;
      if (!keysParam || typeof keysParam !== "string") {
        return res.status(400).json({ error: "keys query parameter required" });
      }

      const keys = keysParam.split(",").filter(Boolean);

      // Security: only allow deleting own images
      const invalid = keys.find((k) => !k.startsWith(`${userId}/`));
      if (invalid) return res.status(403).json({ error: "Cannot delete other users' images" });

      await deleteImages(keys);
      return res.status(200).json({ deleted: keys.length });
    } catch (err) {
      console.error("Batch delete error:", err);
      return res.status(500).json({ error: "Failed to delete images" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
