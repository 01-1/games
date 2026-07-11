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

test("Caddy exposes the landing page and every backend without a catch-all route", async () => {
  const routes = await readFile(path.join(root, "games.routes.caddy"), "utf8");
  const caddyfile = await readFile(path.join(root, "Caddyfile"), "utf8");
  for (const service of services) {
    assert.match(routes, new RegExp(`\\{\\$${service.portVariable}:`));
  }
  assert.match(routes, /@landing_no_slash path_regexp landing_no_slash \^\{\$GAMES_PREFIX\}\$/);
  assert.match(routes, /redir @landing_no_slash \{\$GAMES_PREFIX\}\//);
  assert.match(routes, /@landing_root path \{\$GAMES_PREFIX\}\//);
  assert.match(routes, /root \* \{\$GAMES_ROOT\}\/server\/site/);
  assert.match(routes, /@landing_styles path \{\$GAMES_PREFIX\}\/styles\.css/);
  assert.match(routes, /@landing_app path \{\$GAMES_PREFIX\}\/app\.js/);
  assert.match(routes, /@money_game_root path \{\$GAMES_PREFIX\}\/tragistea/);
  assert.match(routes, /root \* \{\$GAMES_ROOT\}\/money-game/);
  assert.match(routes, /@money_game_legacy_root path \{\$GAMES_PREFIX\}\/money-game/);
  assert.match(routes, /redir @money_game_legacy_root \{\$GAMES_PREFIX\}\/tragistea\//);
  assert.match(routes, /@still_there_root path \{\$GAMES_PREFIX\}\/still-there/);
  assert.match(routes, /root \* \{\$GAMES_ROOT\}\/still-there/);
  assert.doesNotMatch(routes, /handle_path \{\$GAMES_PREFIX\}\/\*/);
  assert.match(caddyfile, /respond 404/);
  assert.doesNotMatch(routes, /respond 404/);
  assert.equal((routes.match(/hide \.git \.env/g) ?? []).length, 4);
});

test("landing page features the alignment collection and Still There", async () => {
  const index = await readFile(path.join(root, "site", "index.html"), "utf8");
  const styles = await readFile(path.join(root, "site", "styles.css"), "utf8");
  const manifest = await readFile(path.join(root, "..", "games.tsv"), "utf8");
  const games = manifest
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [directory, , , publicSlug] = line.split("\t");
      return publicSlug || directory;
    });

  for (const game of games.filter((game) => game !== "tragistea")) {
    assert.match(index, new RegExp(`href="\\./${game}/"`));
  }

  assert.equal((index.match(/class="game-card /g) ?? []).length, games.length);
  assert.equal((index.match(/<svg /g) ?? []).length, games.length);
  assert.doesNotMatch(index, /preview-tag/);
  assert.match(styles, /\.preview svg text\s*\{[^}]*stroke:\s*none;/s);
  assert.match(index, /<a class="game-card span-4 theme-still" href="\.\/still-there\//);
  assert.match(index, /<h3 id="still-card-title">Still There<\/h3>/);
  assert.doesNotMatch(index, /href="\.\/tragistea\//);
  assert.match(index, /This is not the actual game\./);
});
