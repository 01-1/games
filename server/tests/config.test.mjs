import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { services } from "../scripts/start.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("backend ports and environment variables are unique", () => {
  assert.equal(new Set(services.map((service) => service.defaultPort)).size, services.length);
  assert.equal(new Set(services.map((service) => service.portVariable)).size, services.length);
});

test("Caddy exposes every backend and leaves the base prefix unhandled", async () => {
  const routes = await readFile(path.join(root, "games.routes.caddy"), "utf8");
  const caddyfile = await readFile(path.join(root, "Caddyfile"), "utf8");
  for (const service of services) {
    assert.match(routes, new RegExp(`\\{\\$${service.portVariable}:`));
  }
  assert.match(caddyfile, /respond 404/);
  assert.doesNotMatch(routes, /respond 404/);
  assert.equal((routes.match(/hide \.git \.env/g) ?? []).length, 3);
});
