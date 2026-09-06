#!/usr/bin/env node
/**
 * Download Wikimedia Commons images listed in data/fossils.json
 * into public/fossils/ so gameplay never hotlinks at runtime.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FOSSILS_PATH = path.join(ROOT, "data", "fossils.json");
const OUT_DIR = path.join(ROOT, "public", "fossils");
const UA =
  "Fossildle/1.0 (offline fossil cache; https://github.com/scottgriffinm/Fossildle)";

function extensionFor(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (fromUrl) return fromUrl;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  return ".jpg";
}

async function download(fossil) {
  const url = fossil.image_url;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${fossil.id} (${url})`);
  }
  const ext = extensionFor(url, res.headers.get("content-type"));
  const dest = path.join(OUT_DIR, `${fossil.id}${ext}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const info = await stat(dest);
  if (info.size < 1000) {
    throw new Error(`downloaded image too small for ${fossil.id}: ${info.size} bytes`);
  }
  const optimized = await optimizeJpeg(dest, fossil.id);
  return { id: fossil.id, file: `fossils/${path.basename(optimized)}`, bytes: (await stat(optimized)).size, rawBytes: info.size };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function optimizeJpeg(src, id) {
  const dest = path.join(OUT_DIR, `${id}.jpg`);
  const tmp = `${dest}.tmp.jpg`;
  try {
    await run("ffmpeg", [
      "-y",
      "-i",
      src,
      "-vf",
      "scale=min(1400\\,iw):-2",
      "-q:v",
      "3",
      tmp,
    ]);
    if (src !== dest) await unlink(src);
    await rename(tmp, dest);
    return dest;
  } catch {
    if (src !== dest) {
      await rename(src, dest);
    }
    return dest;
  }
}

async function main() {
  const fossils = JSON.parse(await readFile(FOSSILS_PATH, "utf8")).fossils;
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const fossil of fossils) {
    console.log(`download ${fossil.id}`);
    const entry = await download(fossil);
    manifest.push({
      ...entry,
      license: fossil.license,
      attribution: fossil.attribution,
      commons_file: fossil.commons_file,
      source_url: fossil.image_url,
    });
  }
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
