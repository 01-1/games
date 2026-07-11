export interface OpenRouterModelEntry {
  id: string;
  name: string;
  tier: "free" | "paid";
}

export interface OpenRouterModelCatalog {
  models: OpenRouterModelEntry[];
  defaultModel: string;
  freeModels: string[];
  paidModels: string[];
  refreshIntervalMs: number;
  refreshedAt: string | null;
  source: "openrouter" | "cache" | "stale-cache" | "fallback";
  refreshError?: string;
}

export interface CatalogOptions {
  configPath?: string;
  cachePath?: string;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  now?: number;
}

export const workspaceRoot: string;
export const configPath: string;
export const cachePath: string;
export const rootEnvPath: string;
export function getOpenRouterApiKey(): Promise<string>;
export function getModelCatalog(options?: CatalogOptions): Promise<OpenRouterModelCatalog>;
export function selectModel(catalog: OpenRouterModelCatalog, requestedModel?: string): string;
export function refreshFreeModels(options?: CatalogOptions & { independent?: boolean }): Promise<unknown>;
export function startModelRefreshLoop(options?: {
  fetchImpl?: typeof fetch;
  onRefresh?: (catalog: OpenRouterModelCatalog) => void;
  onError?: (error: unknown) => void;
}): () => void;
