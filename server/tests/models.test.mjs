import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getModelCatalog, selectModel } from "../lib/openrouter-models.mjs";

test("refreshes and caches free models while merging configured paid models", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "games-models-"));
  const testConfig = path.join(temporary, "models.json");
  const testCache = path.join(temporary, "cache.json");
  await writeFile(testConfig, JSON.stringify({
    freeModelRefreshIntervalMs: 60_000,
    fallbackFreeModels: ["fallback/model:free"],
    paidModels: [{ id: "paid/model", name: "Paid model" }],
    defaultModel: "paid/model"
  }));

  const catalog = await getModelCatalog({
    configPath: testConfig,
    cachePath: testCache,
    forceRefresh: true,
    now: Date.parse("2026-07-11T12:00:00.000Z"),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "provider/explicit:free", name: "Explicit Free", pricing: { prompt: "1", completion: "1" } },
          { id: "provider/zero-price", name: "Zero Price Without Free Variant", pricing: { prompt: "0", completion: "0" } },
          { id: "provider/paid", name: "Not Free", pricing: { prompt: "0.1", completion: "0.2" } }
        ]
      })
    })
  });

  assert.equal(catalog.source, "openrouter");
  assert.deepEqual(catalog.freeModels, ["provider/explicit:free"]);
  assert.deepEqual(catalog.paidModels, ["paid/model"]);
  assert.equal(catalog.defaultModel, "paid/model");
  assert.equal(selectModel(catalog, "provider/explicit:free"), "provider/explicit:free");
  assert.equal(selectModel(catalog, ""), "paid/model");
  assert.throws(() => selectModel(catalog, "unknown/model"), /not in the server model catalog/);
  assert.equal(JSON.parse(await readFile(testCache, "utf8")).models.length, 1);
});

test("uses a fresh cache without querying OpenRouter", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "games-models-cache-"));
  const testConfig = path.join(temporary, "models.json");
  const testCache = path.join(temporary, "cache.json");
  await writeFile(testConfig, JSON.stringify({
    freeModelRefreshIntervalMs: 60_000,
    fallbackFreeModels: ["fallback/model:free"],
    paidModels: [],
    defaultModel: "cached/model:free"
  }));
  await writeFile(testCache, JSON.stringify({
    refreshedAt: "2026-07-11T12:00:00.000Z",
    models: [{ id: "cached/model:free", name: "Cached" }]
  }));

  const catalog = await getModelCatalog({
    configPath: testConfig,
    cachePath: testCache,
    now: Date.parse("2026-07-11T12:00:30.000Z"),
    fetchImpl: async () => assert.fail("fresh cache should not fetch")
  });
  assert.equal(catalog.source, "cache");
  assert.deepEqual(catalog.freeModels, ["cached/model:free"]);
});

test("falls back safely when model discovery is unavailable", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "games-models-fallback-"));
  const testConfig = path.join(temporary, "models.json");
  await writeFile(testConfig, JSON.stringify({
    freeModelRefreshIntervalMs: 60_000,
    fallbackFreeModels: ["fallback/model:free"],
    paidModels: [],
    defaultModel: "fallback/model:free"
  }));
  const catalog = await getModelCatalog({
    configPath: testConfig,
    cachePath: path.join(temporary, "missing-cache.json"),
    forceRefresh: true,
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(catalog.source, "fallback");
  assert.deepEqual(catalog.freeModels, ["fallback/model:free"]);
  assert.equal(catalog.refreshError, "offline");
});
