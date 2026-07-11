import { getModelCatalog } from "../lib/openrouter-models.mjs";

try {
  const catalog = await getModelCatalog({ forceRefresh: true });
  if (catalog.source !== "openrouter") {
    throw new Error(catalog.refreshError || "OpenRouter refresh did not complete");
  }
  console.log(`Refreshed ${catalog.freeModels.length} free OpenRouter models at ${catalog.refreshedAt}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
