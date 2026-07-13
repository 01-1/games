import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamesRoot = path.resolve(serverRoot, "..");
const routesPath = path.join(serverRoot, "games.routes.caddy");
const caddyAvailable = spawnSync("caddy", ["version"], { stdio: "ignore" }).status === 0;

test("imported routes preserve host isolation, landing headers, and legacy redirects", { skip: !caddyAvailable && "caddy is unavailable" }, async () => {
  await assertImportedRoutes("/games");
  await assertImportedRoutes("");
});

async function assertImportedRoutes(prefix) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "games-caddy-test-"));
  const port = await reservePort();
  const configPath = path.join(temporary, "Caddyfile");
  const outsideBody = "unrelated host response ".repeat(128);
  const config = `{
  auto_https off
  admin off
}

http://127.0.0.1:${port} {
  import ${JSON.stringify(routesPath)} ${JSON.stringify(prefix)} ${JSON.stringify(gamesRoot)}
  respond /outside ${JSON.stringify(outsideBody)} 200
  respond 404
}
`;
  await writeFile(configPath, config);

  const child = spawn("caddy", ["run", "--config", configPath, "--adapter", "caddyfile"], {
    cwd: gamesRoot,
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitForServer(port, child, () => stderr);
    const base = `http://127.0.0.1:${port}`;
    const legacyRoot = `${prefix}/money-game`;
    const canonicalRoot = `${prefix}/tragistea/`;
    await assertRedirect(`${base}${legacyRoot}`, canonicalRoot);
    await assertRedirect(`${base}${legacyRoot}/`, canonicalRoot);
    await assertRedirect(`${base}${legacyRoot}/assets/game.js`, `${canonicalRoot}assets/game.js`);
    await assertRedirect(`${base}${legacyRoot}?room=abc`, `${canonicalRoot}?room=abc`);
    await assertRedirect(`${base}${legacyRoot}/?room=abc`, `${canonicalRoot}?room=abc`);
    await assertRedirect(`${base}${legacyRoot}/assets/game.js?room=abc`, `${canonicalRoot}assets/game.js?room=abc`);

    const compressedLanding = await fetch(`${base}${prefix}/`, {
      headers: { "accept-encoding": "gzip" }
    });
    assert.equal(compressedLanding.status, 200);
    assert.equal(compressedLanding.headers.get("content-encoding"), "gzip");

    for (const asset of ["/", "/styles.css", "/app.js"]) {
      const response = await fetch(`${base}${prefix}${asset}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.equal(response.headers.get("permissions-policy"), "geolocation=(), microphone=(), camera=()");
      assert.equal(
        response.headers.get("content-security-policy"),
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      );
    }

    const outside = await fetch(`${base}/outside`, {
      headers: { "accept-encoding": "gzip" }
    });
    assert.equal(outside.status, 200);
    assert.equal(outside.headers.get("content-encoding"), null);
    assert.equal(outside.headers.get("content-security-policy"), null);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(temporary, { recursive: true, force: true });
  }
}

async function assertRedirect(url, location) {
  const response = await fetch(url, { redirect: "manual" });
  assert.equal(response.status, 308, url);
  assert.equal(response.headers.get("location"), location, url);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(port, child, getStderr) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      assert.fail(`caddy exited before startup (${child.exitCode}): ${getStderr()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" });
      await response.body?.cancel();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.fail(`caddy did not start: ${getStderr()}`);
}
