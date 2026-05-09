import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const distDir = join(process.cwd(), "web", "dist");
const assetsDir = join(distDir, "assets");
const indexHtmlPath = join(distDir, "index.html");

const TOTAL_GZIP_BUDGET_BYTES = 160 * 1024;
const TOTAL_BROTLI_BUDGET_BYTES = 150 * 1024;

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function readInitialAssetPaths(html) {
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

function readExternalStyleOrScriptUrls(html) {
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

    const isRelevantTag = tag === "script" || (tag === "link" && rel === "stylesheet");
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

const externalUrls = readExternalStyleOrScriptUrls(indexHtml);
if (externalUrls.length > 0) {
  console.error("FAIL external script/stylesheet URLs detected in web/dist/index.html:");
  for (const url of externalUrls) {
    console.error(`- ${url}`);
  }
  process.exit(1);
}

const initialAssets = readInitialAssetPaths(indexHtml);
if (initialAssets.length === 0) {
  console.error("FAIL no initial JS/CSS assets found in web/dist/index.html");
  process.exit(1);
}

let totalRaw = 0;
let totalGzip = 0;
let totalBrotli = 0;

for (const relativeAssetPath of initialAssets) {
  const absoluteAssetPath = join(distDir, relativeAssetPath);
  const raw = readFileSync(absoluteAssetPath);
  const rawBytes = raw.byteLength;
  const gzipBytes = gzipSync(raw).byteLength;
  const brotliBytes = brotliCompressSync(raw).byteLength;

  totalRaw += rawBytes;
  totalGzip += gzipBytes;
  totalBrotli += brotliBytes;

  console.log(
    `INFO ${relativeAssetPath} raw ${formatKiB(rawBytes)} | gzip ${formatKiB(gzipBytes)} | brotli ${formatKiB(brotliBytes)}`,
  );
}

const gzipPass = totalGzip <= TOTAL_GZIP_BUDGET_BYTES;
const brotliPass = totalBrotli <= TOTAL_BROTLI_BUDGET_BYTES;
const totalPass = gzipPass && brotliPass;

console.log(
  `TOTAL initial assets raw ${formatKiB(totalRaw)} | gzip ${formatKiB(totalGzip)} / budget ${formatKiB(TOTAL_GZIP_BUDGET_BYTES)} | brotli ${formatKiB(totalBrotli)} / budget ${formatKiB(TOTAL_BROTLI_BUDGET_BYTES)} => ${totalPass ? "PASS" : "FAIL"}`,
);

if (!totalPass) {
  process.exit(1);
}
