import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const distDir = join(process.cwd(), "web", "dist");
const assetsDir = join(distDir, "assets");
const indexHtmlPath = join(distDir, "index.html");

const COMBINED_GZIP_BUDGET_BYTES = 180 * 1024;
const COMBINED_BROTLI_BUDGET_BYTES = 160 * 1024;

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function readSyncAssetPaths(html) {
  const scriptPattern = /<script\b[^>]*src="([^"]+)"[^>]*>/gi;
  const stylesheetPattern = /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi;
  const assetPaths = new Set();

  const collect = (pattern) => {
    while (true) {
      const match = pattern.exec(html);
      if (!match) {
        break;
      }

      const path = match[1];
      if (path.startsWith("/assets/") && (path.endsWith(".js") || path.endsWith(".css"))) {
        assetPaths.add(path.replace(/^\//, ""));
      }
    }
  };

  collect(scriptPattern);
  collect(stylesheetPattern);

  return [...assetPaths].sort();
}

function readPreloadAssetPaths(html) {
  const preloadPattern = /<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"[^>]*>/gi;
  const preloadPaths = new Set();

  while (true) {
    const match = preloadPattern.exec(html);
    if (!match) {
      break;
    }

    const path = match[1];
    if (path.startsWith("/assets/") && path.endsWith(".js")) {
      preloadPaths.add(path.replace(/^\//, ""));
    }
  }

  return [...preloadPaths].sort();
}

function readExternalAssetUrls(html) {
  const externalUrls = new Set();
  const pattern = /<(script|link)\b[^>]*(src|href)="([^"]+)"[^>]*>/gi;

  while (true) {
    const match = pattern.exec(html);
    if (!match) {
      break;
    }

    const tag = match[1].toLowerCase();
    const url = match[3];
    const rel = (match[0].match(/\brel="([^"]+)"/i)?.[1] ?? "").toLowerCase();

    const isRelevantTag = tag === "script" || (tag === "link" && (rel === "stylesheet" || rel === "modulepreload"));
    if (!isRelevantTag) {
      continue;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      externalUrls.add(url);
    }
  }

  return [...externalUrls].sort();
}

readdirSync(assetsDir);
const indexHtml = readFileSync(indexHtmlPath, "utf8");

const externalUrls = readExternalAssetUrls(indexHtml);
if (externalUrls.length > 0) {
  console.error("FAIL external script/stylesheet/modulepreload URLs detected in web/dist/index.html:");
  for (const url of externalUrls) {
    console.error(`- ${url}`);
  }
  process.exit(1);
}

const syncAssets = readSyncAssetPaths(indexHtml);
if (syncAssets.length === 0) {
  console.error("FAIL no initial JS/CSS assets found in web/dist/index.html");
  process.exit(1);
}

const preloadAssets = readPreloadAssetPaths(indexHtml);

function readCompressedSize(relativeAssetPath) {
  const absoluteAssetPath = join(distDir, relativeAssetPath);
  const raw = readFileSync(absoluteAssetPath);
  const rawBytes = raw.byteLength;
  const gzipBytes = gzipSync(raw).byteLength;
  const brotliBytes = brotliCompressSync(raw).byteLength;
  return { rawBytes, gzipBytes, brotliBytes };
}

let syncRaw = 0;
let syncGzip = 0;
let syncBrotli = 0;

for (const relativeAssetPath of syncAssets) {
  const { rawBytes, gzipBytes, brotliBytes } = readCompressedSize(relativeAssetPath);

  syncRaw += rawBytes;
  syncGzip += gzipBytes;
  syncBrotli += brotliBytes;

  console.log(
    `SYNC ${relativeAssetPath} raw ${formatKiB(rawBytes)} | gzip ${formatKiB(gzipBytes)} | brotli ${formatKiB(brotliBytes)}`,
  );
}

let preloadRaw = 0;
let preloadGzip = 0;
let preloadBrotli = 0;

for (const relativeAssetPath of preloadAssets) {
  const { rawBytes, gzipBytes, brotliBytes } = readCompressedSize(relativeAssetPath);

  preloadRaw += rawBytes;
  preloadGzip += gzipBytes;
  preloadBrotli += brotliBytes;

  console.log(
    `PRELOAD ${relativeAssetPath} raw ${formatKiB(rawBytes)} | gzip ${formatKiB(gzipBytes)} | brotli ${formatKiB(brotliBytes)}`,
  );
}

const combinedAssets = [...new Set([...syncAssets, ...preloadAssets])];
let combinedRaw = 0;
let combinedGzip = 0;
let combinedBrotli = 0;

for (const relativeAssetPath of combinedAssets) {
  const { rawBytes, gzipBytes, brotliBytes } = readCompressedSize(relativeAssetPath);
  combinedRaw += rawBytes;
  combinedGzip += gzipBytes;
  combinedBrotli += brotliBytes;
}

const gzipPass = combinedGzip <= COMBINED_GZIP_BUDGET_BYTES;
const brotliPass = combinedBrotli <= COMBINED_BROTLI_BUDGET_BYTES;
const totalPass = gzipPass && brotliPass;

console.log(
  `TOTAL sync raw ${formatKiB(syncRaw)} | gzip ${formatKiB(syncGzip)} | brotli ${formatKiB(syncBrotli)}`,
);
console.log(
  `TOTAL preload raw ${formatKiB(preloadRaw)} | gzip ${formatKiB(preloadGzip)} | brotli ${formatKiB(preloadBrotli)}`,
);
console.log(
  `TOTAL combined raw ${formatKiB(combinedRaw)} | gzip ${formatKiB(combinedGzip)} / budget ${formatKiB(COMBINED_GZIP_BUDGET_BYTES)} | brotli ${formatKiB(combinedBrotli)} / budget ${formatKiB(COMBINED_BROTLI_BUDGET_BYTES)} => ${totalPass ? "PASS" : "FAIL"}`,
);

if (!totalPass) {
  process.exit(1);
}
