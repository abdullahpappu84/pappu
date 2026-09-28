import "server-only";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { badRequest } from "./http";

/** Files live outside /public so private uploads (KYC, payment proofs) are never directly reachable. */
export const STORAGE_ROOT = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(process.cwd(), "storage");

const TYPES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];

export type Visibility = "public" | "private";

export async function saveUpload(file: unknown, opts: { folder: string; visibility: Visibility; maxBytes?: number; allowPdf?: boolean }) {
  if (!(file instanceof File) || file.size === 0) throw badRequest("Please choose a file to upload.");
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  if (file.size > max) throw badRequest(`File is too large (max ${Math.round(max / 1024 / 1024)}MB).`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = TYPES.find((t) => t.test(buf));
  if (!type || (type.ext === "pdf" && !opts.allowPdf)) throw badRequest(opts.allowPdf ? "Only JPG, PNG, WEBP or PDF files are allowed." : "Only JPG, PNG or WEBP images are allowed.");
  const folder = opts.folder.replace(/[^a-z0-9-]/gi, "");
  const name = `${randomUUID()}.${type.ext}`;
  const dir = path.join(STORAGE_ROOT, opts.visibility, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf, { mode: 0o640 });
  return `/api/files/${opts.visibility}/${folder}/${name}`;
}

export async function readUpload(parts: string[]) {
  const [visibility, folder, name] = parts;
  if (!["public", "private"].includes(visibility) || !folder || !name || parts.length !== 3) return null;
  if (!/^[a-z0-9-]+$/i.test(folder) || !/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/i.test(name)) return null;
  const full = path.join(STORAGE_ROOT, visibility, folder, name);
  if (!full.startsWith(STORAGE_ROOT)) return null;
  try {
    const data = await readFile(full);
    const ext = name.split(".").pop()!.toLowerCase();
    const mime = TYPES.find((t) => t.ext === ext)?.mime ?? "application/octet-stream";
    return { data, mime, visibility: visibility as Visibility, folder };
  } catch {
    return null;
  }
}
