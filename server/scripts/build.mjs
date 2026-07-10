import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hostDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamesDir = path.resolve(hostDir, "..");

const builds = ["inverse", "the-debate", "turnover", "weak-supervisor"];

for (const game of builds) {
  await run(game, ["run", "build"]);
}

function run(game, args) {
  return new Promise((resolve, reject) => {
    console.log(`[${game}] npm ${args.join(" ")}`);
    const child = spawn("npm", args, {
      cwd: path.join(gamesDir, game),
      env: process.env,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${game} build failed (${signal ?? `exit ${code}`})`));
    });
  });
}
