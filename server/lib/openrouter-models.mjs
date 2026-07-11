import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const workspaceRoot = path.resolve(moduleDir, "../..");
export const configPath = path.join(workspaceRoot, "openrouter-models.config.json");
export const cachePath = path.join(workspaceRoot, "server/.cache/openrouter-free-models.json");
export const rootEnvPath = path.join(workspaceRoot, ".env");

const modelsEndpoint = "https://openrouter.ai/api/v1/models?supported_parameters=max_tokens&output_modalities=text";
let refreshInFlight;
let refreshTimer;

export async function getOpenRouterApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readRootEnv();
  return env.OPENROUTER_API_KEY ?? "";
}

export async function getModelCatalog(options = {}) {
  const config = await readModelConfig(options.configPath);
  const now = options.now ?? Date.now();
  let cached = await readCache(options.cachePath);
  const isFresh = cached && now - Date.parse(cached.refreshedAt) < config.freeModelRefreshIntervalMs;
  let source = isFresh ? "cache" : cached ? "stale-cache" : "fallback";
  let refreshError;

  if (options.forceRefresh) {
    try {
      cached = await refreshFreeModels({
        cachePath: options.cachePath,
        fetchImpl: options.fetchImpl,
        now
      });
      source = "openrouter";
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "OpenRouter model refresh failed";
      source = cached ? "stale-cache" : "fallback";
    }
  }

  const freeEntries = cached?.models?.length ? cached.models : config.fallbackFreeModels.map(toFallbackEntry);
  const paidEntries = config.paidModels.map((model) => ({ ...model, tier: "paid" }));
  const models = uniqueModels([
    ...freeEntries.map((model) => ({ ...model, tier: "free" })),
    ...paidEntries
  ]);
  const allowedIds = new Set(models.map((model) => model.id));
  const defaultModel = allowedIds.has(config.defaultModel) ? config.defaultModel : models[0]?.id ?? "";

  return {
    models,
    defaultModel,
    freeModels: models.filter((model) => model.tier === "free").map((model) => model.id),
    paidModels: models.filter((model) => model.tier === "paid").map((model) => model.id),
    refreshIntervalMs: config.freeModelRefreshIntervalMs,
    refreshedAt: cached?.refreshedAt ?? null,
    source,
    ...(refreshError ? { refreshError } : {})
  };
}

export function selectModel(catalog, requestedModel) {
  const selected = typeof requestedModel === "string" && requestedModel.trim()
    ? requestedModel.trim()
    : catalog.defaultModel;
  if (!catalog.models.some((model) => model.id === selected)) {
    throw Object.assign(new Error("The selected model is not in the server model catalog."), { status: 400 });
  }
  return selected;
}

export async function refreshFreeModels(options = {}) {
  if (refreshInFlight && !options.independent) return refreshInFlight;
  const operation = fetchAndCacheFreeModels(options);
  refreshInFlight = operation;
  try {
    return await operation;
  } finally {
    if (refreshInFlight === operation) refreshInFlight = undefined;
  }
}

export function startModelRefreshLoop(options = {}) {
  if (refreshTimer) return () => clearTimeout(refreshTimer);
  let stopped = false;

  const schedule = async () => {
    let retryMs = 5 * 60_000;
    try {
      const catalog = await getModelCatalog({ forceRefresh: true, fetchImpl: options.fetchImpl });
      options.onRefresh?.(catalog);
      retryMs = catalog.source === "openrouter"
        ? catalog.refreshIntervalMs
        : Math.min(catalog.refreshIntervalMs, retryMs);
    } catch (error) {
      options.onError?.(error);
    }
    if (stopped) return;
    refreshTimer = setTimeout(schedule, retryMs);
    refreshTimer.unref?.();
  };

  void schedule();
  return () => {
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = undefined;
  };
}

async function fetchAndCacheFreeModels(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = await getOpenRouterApiKey();
  const response = await fetchImpl(modelsEndpoint, {
    headers: {
      Accept: "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`OpenRouter model refresh returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error("OpenRouter model refresh returned an invalid payload");

  const models = uniqueModels(payload.data
    .filter(isFreeModel)
    .map((model) => ({ id: model.id, name: String(model.name || model.id) }))
    .sort((left, right) => left.name.localeCompare(right.name)));
  if (models.length === 0) throw new Error("OpenRouter model refresh returned no free models");

  const cache = {
    refreshedAt: new Date(options.now ?? Date.now()).toISOString(),
    models
  };
  const destination = options.cachePath ?? cachePath;
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
  return cache;
}

async function readModelConfig(overridePath) {
  const raw = JSON.parse(await readFile(overridePath ?? configPath, "utf8"));
  const interval = Number(raw.freeModelRefreshIntervalMs);
  if (!Number.isInteger(interval) || interval < 60_000) {
    throw new Error("freeModelRefreshIntervalMs must be an integer of at least 60000");
  }
  const fallbackFreeModels = normalizeModelList(raw.fallbackFreeModels, "free");
  if (fallbackFreeModels.length === 0) throw new Error("fallbackFreeModels must contain at least one model");
  const paidModels = normalizeModelList(raw.paidModels, "paid");
  return {
    freeModelRefreshIntervalMs: interval,
    fallbackFreeModels,
    paidModels,
    defaultModel: String(raw.defaultModel || fallbackFreeModels[0].id)
  };
}

function normalizeModelList(values, tier) {
  if (!Array.isArray(values)) throw new Error(`${tier}Models must be an array`);
  return uniqueModels(values.map((value) => {
    const entry = typeof value === "string" ? { id: value, name: value } : value;
    const id = String(entry?.id ?? "").trim();
    if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i.test(id)) {
      throw new Error(`Invalid ${tier} model id: ${id || "(empty)"}`);
    }
    if (tier === "free" && !id.endsWith(":free")) {
      throw new Error(`Fallback free model must end with :free: ${id}`);
    }
    if (tier === "paid" && id.endsWith(":free")) {
      throw new Error(`Paid model must not end with :free: ${id}`);
    }
    return { id, name: String(entry.name || id) };
  }));
}

function isFreeModel(model) {
  return Boolean(model && typeof model.id === "string" && model.id.endsWith(":free"));
}

function uniqueModels(models) {
  const seen = new Set();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function toFallbackEntry(model) {
  return { ...model, name: model.name || model.id };
}

async function readCache(overridePath) {
  try {
    const cache = JSON.parse(await readFile(overridePath ?? cachePath, "utf8"));
    if (!Array.isArray(cache.models) || Number.isNaN(Date.parse(cache.refreshedAt))) return null;
    return {
      refreshedAt: cache.refreshedAt,
      models: uniqueModels(cache.models
        .filter((model) => model && typeof model.id === "string")
        .map((model) => ({ id: model.id, name: String(model.name || model.id) })))
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function readRootEnv() {
  try {
    const source = await readFile(rootEnvPath, "utf8");
    return Object.fromEntries(source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const splitAt = line.indexOf("=");
        const key = line.slice(0, splitAt).trim();
        const value = line.slice(splitAt + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}
