import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { startModelRefreshLoop } from "../lib/openrouter-models.mjs";

const hostDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamesDir = path.resolve(hostDir, "..");

export const services = [
  {
    name: "scratchpad",
    cwd: "scratchpad",
    args: ["start"],
    portVariable: "SCRATCHPAD_PORT",
    defaultPort: 7410,
    extraEnv: { HOST: "127.0.0.1" }
  },
  {
    name: "the-colluders",
    cwd: "the-colluders",
    args: ["start"],
    portVariable: "COLLUDERS_PORT",
    defaultPort: 7411
  },
  {
    name: "the-debate",
    cwd: "the-debate",
    args: ["run", "preview", "--", "--host", "127.0.0.1"],
    portVariable: "DEBATE_PORT",
    defaultPort: 7412,
    portArgument: true
  },
  {
    name: "turnover",
    cwd: "turnover",
    args: ["run", "serve"],
    portVariable: "TURNOVER_PORT",
    defaultPort: 7413
  }
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startAll();
}

function startAll() {
  const children = new Set();
  let stopping = false;
  const stopModelRefresh = startModelRefreshLoop({
    onRefresh(catalog) {
      if (catalog.source === "openrouter") {
        console.log(`[games-host] refreshed ${catalog.freeModels.length} free OpenRouter models`);
      } else {
        console.warn(`[games-host] model refresh unavailable; using ${catalog.source}`);
      }
    },
    onError(error) {
      console.error(`[games-host] model refresh configuration failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  for (const service of services) {
    const port = parsePort(process.env[service.portVariable], service.defaultPort, service.portVariable);
    const args = service.portArgument ? [...service.args, "--port", String(port), "--strictPort"] : service.args;
    const child = spawn("npm", args, {
      cwd: path.join(gamesDir, service.cwd),
      env: { ...process.env, ...service.extraEnv, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    children.add(child);
    prefixLines(child.stdout, service.name, process.stdout);
    prefixLines(child.stderr, service.name, process.stderr);

    child.once("error", (error) => {
      console.error(`[${service.name}] failed to start: ${error.message}`);
      stopAll(1);
    });
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (!stopping) {
        console.error(`[${service.name}] stopped unexpectedly (${signal ?? `exit ${code}`})`);
        stopAll(code || 1);
      }
    });

    console.log(`[games-host] ${service.name} -> 127.0.0.1:${port}`);
  }

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));

  function stopAll(exitCode) {
    if (stopping) return;
    stopping = true;
    stopModelRefresh();
    for (const child of children) child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
    }, 5_000);
    forceTimer.unref();
    setTimeout(() => process.exit(exitCode), 5_100).unref();
    if (children.size === 0) process.exit(exitCode);
  }
}

function prefixLines(stream, name, output) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => output.write(`[${name}] ${line}\n`));
}

function parsePort(value, fallback, variable) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${variable} must be an integer between 1 and 65535`);
  }
  return port;
}
