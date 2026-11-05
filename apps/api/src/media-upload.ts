import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_IMAGE_BYTES, type ImageUpload } from "@yt-equity/contracts";
import { ApiFailure } from "./errors.js";

export async function uploadImage(data: ImageUpload) {
  const origin = process.env.MEDIA_PUBLIC_ORIGIN;
  const token = process.env.MEDIA_UPLOAD_SECRET;
  if (!origin || !token) throw new ApiFailure(503, "MEDIA_UNAVAILABLE", "Image uploads are not configured.");
  const bytes = Buffer.from(data.base64, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new ApiFailure(413, "IMAGE_TOO_LARGE", "Choose an image smaller than 5 MB.");
  let image: Buffer;
  try {
    const input = sharp(bytes, { limitInputPixels: 40_000_000 });
    const metadata = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || `image/${metadata.format}` !== data.contentType)
      throw new Error("Unsupported image");
    image = await input.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch {
    throw new ApiFailure(400, "INVALID_IMAGE", "Choose a valid JPG, PNG or WebP image (up to 40 megapixels).");
  }
  const hash = createHash("sha256").update(image).digest("hex");
  const url = `${origin}/uploads/${data.kind}/${hash}.webp`;
  try {
    const response = await fetch(url, {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "image/webp" },
      body: new Uint8Array(image), signal: AbortSignal.timeout(30_000), redirect: "error",
    });
    if (!response.ok) throw new Error("Storage rejected upload");
  } catch {
    throw new ApiFailure(503, "MEDIA_UNAVAILABLE", "Unable to upload the image. Please try again.");
  }
  return { url };
}
