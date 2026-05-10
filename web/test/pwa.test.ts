import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldRegisterPwa } from "../src/pwa.js";

test("PWA registration is disabled in dev so stale shell caches cannot own the header", () => {
  assert.equal(
    shouldRegisterPwa({
      isDev: true,
      isSecureContext: true,
      hasServiceWorker: true,
    }),
    false,
  );
});

test("PWA registration remains available in secure production browsers", () => {
  assert.equal(
    shouldRegisterPwa({
      isDev: false,
      isSecureContext: true,
      hasServiceWorker: true,
    }),
    true,
  );
});

test("HTML head uses lightweight bundled favicon and theme-aware manifests", async () => {
  const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(markup, /<meta name="theme-color" content="#050c14"/);
  assert.match(markup, /\/icons\/favicon\.svg/);
  assert.match(markup, /\/favicon\/favicon-transparent-32\.png/);
  assert.match(markup, /\/manifest-light\.webmanifest/);
  assert.match(markup, /\/manifest-dark\.webmanifest/);
  assert.match(markup, /\/icons\/light\/apple-touch-icon-light-180\.png/);
  assert.match(markup, /\/icons\/dark\/apple-touch-icon-dark-180\.png/);
});

test("theme-aware PWA manifests are branded and point to bundled PNG icons", async () => {
  const [lightManifest, darkManifest] = await Promise.all([
    readFile(new URL("../public/manifest-light.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest-dark.webmanifest", import.meta.url), "utf8"),
  ]);

  const light = JSON.parse(lightManifest) as {
    name: string;
    icons: Array<{ src: string; type: string }>;
    display: string;
    orientation: string;
    display_override: string[];
    prefer_related_applications: boolean;
  };
  const dark = JSON.parse(darkManifest) as {
    name: string;
    icons: Array<{ src: string; type: string }>;
    background_color: string;
    theme_color: string;
    display: string;
    orientation: string;
    display_override: string[];
    prefer_related_applications: boolean;
  };

  assert.equal(light.name, "MosaicStacked");
  assert.equal(dark.name, "MosaicStacked");
  assert.equal(light.display, "standalone");
  assert.equal(dark.display, "standalone");
  assert.equal(light.orientation, "portrait");
  assert.equal(dark.orientation, "portrait");
  assert.deepEqual(light.display_override, ["window-controls-overlay"]);
  assert.deepEqual(dark.display_override, ["window-controls-overlay"]);
  assert.equal(light.prefer_related_applications, false);
  assert.equal(dark.prefer_related_applications, false);
  assert.equal(dark.background_color, "#050c14");
  assert.equal(dark.theme_color, "#050c14");
  assert.ok(light.icons.some((icon) => icon.src === "/icons/light/icon-light-192.png" && icon.type === "image/png"));
  assert.ok(dark.icons.some((icon) => icon.src === "/icons/dark/icon-dark-192.png" && icon.type === "image/png"));
});
