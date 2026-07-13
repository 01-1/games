import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "systemd-service.sh");

function render(extraEnv = {}) {
  return spawnSync("bash", [script, "render"], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv }
  });
}

test("systemd renderer uses the invoking non-root user by default and rejects implicit root", () => {
  const env = { ...process.env };
  delete env.SERVICE_USER;
  delete env.SUDO_USER;
  const result = spawnSync("bash", [script, "render"], { encoding: "utf8", env });

  if (process.getuid?.() === 0) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SERVICE_USER resolved to root implicitly/);
  } else {
    const currentUser = execFileSync("id", ["-un"], { encoding: "utf8" }).trim();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`^User=${currentUser}$`, "m"));
  }
});

test("systemd renderer permits an explicit root service user", () => {
  const result = render({ SERVICE_USER: "root", SUDO_USER: "" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^User=root$/m);
});
