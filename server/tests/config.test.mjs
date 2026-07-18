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
    assert.match(routes, new RegExp(`reverse_proxy 127\\.0\\.0\\.1:${service.defaultPort}`));
  }
  assert.match(routes, /@landing_no_slash path_regexp landing_no_slash \^\{args\[0\]\}\$/);
  assert.match(routes, /redir @landing_no_slash \{args\[0\]\}\//);
  assert.match(routes, /@landing_root path \{args\[0\]\}\//);
  assert.match(routes, /root \* \{args\[1\]\}\/server\/site/);
  assert.match(routes, /@landing_styles path \{args\[0\]\}\/styles\.css/);
  assert.match(routes, /@landing_app path \{args\[0\]\}\/app\.js/);
  assert.match(routes, /@money_game_root path \{args\[0\]\}\/tragistea/);
  assert.match(routes, /root \* \{args\[1\]\}\/money-game/);
  assert.match(routes, /@money_game_legacy_root path \{args\[0\]\}\/money-game/);
  assert.match(routes, /redir @money_game_legacy_root \{args\[0\]\}\/tragistea\//);
  assert.match(routes, /@still_there_root path \{args\[0\]\}\/still-there/);
  assert.match(routes, /root \* \{args\[1\]\}\/still-there/);
  assert.doesNotMatch(routes, /handle_path \{args\[0\]\}\/\*/);
  assert.doesNotMatch(routes, /\{\$GAMES_/);
  assert.match(caddyfile, /import games\.routes\.caddy \/games \./);
  assert.match(caddyfile, /respond 404/);
  assert.doesNotMatch(routes, /respond 404/);
  assert.equal((routes.match(/hide \.git \.env/g) ?? []).length, 4);
});

test("landing page features the collection and links every game repository from its card", async () => {
  const index = await readFile(path.join(root, "site", "index.html"), "utf8");
  const styles = await readFile(path.join(root, "site", "styles.css"), "utf8");
  const manifest = await readFile(path.join(root, "..", "games.tsv"), "utf8");
  const entries = manifest
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [directory, repository, , publicSlug] = line.split("\t");
      return { repository: repository.replace(/\.git$/, ""), slug: publicSlug || directory };
    });

  const cards = [...index.matchAll(/<article class="game-card[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);

  for (const { repository, slug } of entries) {
    const card = cards.find((markup) => markup.includes(`href="${repository}"`));
    assert.ok(card, `${repository} must be linked from its game card`);
    assert.match(card, new RegExp(`class="status[^"]*game-link" href="\\./${slug}/"`));
  }

  assert.equal(cards.length, entries.length);
  assert.equal((index.match(/<svg /g) ?? []).length, entries.length);
  assert.equal((index.match(/class="game-repo-link"/g) ?? []).length, entries.length);
  assert.match(index, /class="main-repo-link" href="https:\/\/github\.com\/01-1\/games"/);
  assert.doesNotMatch(index, /preview-tag/);
  assert.match(styles, /\.preview svg text\s*\{[^}]*stroke:\s*none;/s);
  assert.match(styles, /\.theme-money\s*\{[^}]*--card-accent:\s*#f7d34e;/s);
  assert.match(styles, /\.money-preview \.preview-bg\s*\{[^}]*fill:\s*#0c1210;/s);
  assert.match(index, /<article class="game-card span-4 theme-still">/);
  assert.match(index, /<h3 id="still-card-title">Still There<\/h3>/);
  assert.match(index, /<section class="collection bonus-collection"/);
  assert.match(index, /<article class="game-card theme-money">/);
  assert.match(index, /This is not the actual game\./);
});

test("landing routes apply browser headers without weakening raw-checkout hides", async () => {
  const routes = await readFile(path.join(root, "games.routes.caddy"), "utf8");

  assert.equal((routes.match(/X-Content-Type-Options "nosniff"/g) ?? []).length, 3);
  assert.equal((routes.match(/Referrer-Policy "strict-origin-when-cross-origin"/g) ?? []).length, 3);
  assert.equal((routes.match(/Permissions-Policy "geolocation=\(\), microphone=\(\), camera=\(\)"/g) ?? []).length, 3);
  assert.equal((routes.match(/Content-Security-Policy /g) ?? []).length, 3);
  assert.match(
    routes,
    /@still_there_root[\s\S]*?hide \.git \.env \.claude \.agents \.codex tests README\.md AGENTS\.md package\.json package-lock\.json/
  );
});
