import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("game cards remain visible when the deferred script does not run", async () => {
  const [index, styles, app] = await Promise.all([
    readFile(path.join(root, "site", "index.html"), "utf8"),
    readFile(path.join(root, "site", "styles.css"), "utf8"),
    readFile(path.join(root, "site", "app.js"), "utf8")
  ]);

  assert.doesNotMatch(index, /<script(?![^>]+src=)/);
  assert.match(app, /^document\.documentElement\.classList\.add\("js"\);/);
  assert.doesNotMatch(styles, /\.js\s+\.game-card:not\(\.is-visible\)/);
  assert.match(styles, /html\.reveal-enabled\s+\.game-card:not\(\.is-visible\)/);
  assert.match(app, /classList\.add\("reveal-enabled"\)/);
  assert.match(app, /catch\s*\{\s*cards\.forEach\(\(card\) => card\.classList\.add\("is-visible"\)\);\s*\}/s);
});

test("landing assets share one deployment cache token", async () => {
  const index = await readFile(path.join(root, "site", "index.html"), "utf8");
  const styleToken = index.match(/styles\.css\?v=([^"&]+)/)?.[1];
  const scriptToken = index.match(/app\.js\?v=([^"&]+)/)?.[1];

  assert.ok(styleToken, "stylesheet must have a cache token");
  assert.equal(scriptToken, styleToken);
});

test("alignment eye tracking is frame-throttled and reset cancels queued work", async () => {
  const app = await readFile(path.join(root, "site", "app.js"), "utf8");

  assert.match(app, /if \(trackingFrame !== null\) return;[\s\S]*trackingFrame = window\.requestAnimationFrame/);
  assert.match(app, /if \(!motionEnabled \|\| !nextEvent\) return;/);
  assert.match(app, /function resetTrackingEye\(\)[\s\S]*window\.cancelAnimationFrame\(trackingFrame\)[\s\S]*pendingTrackingEvent = null;/);
});
