import { DEFAULT_AI_PROVIDERS } from './provider-catalog';
import type {
  AiModelCapability,
  AiProviderApiStyle,
  AiProviderConfig,
  AiProviderModel,
  AiProviderSecretStatus,
  AiProviderSettings,
  ResolvedAiModelSelection,
} from './provider-types';

const AUTH_HEADER_KEYS = new Set([
  'api-key',
  'authorization',
  'x-api-key',
  'x-goog-api-key',
]);

export function createDefaultAiProviderSettings(): AiProviderSettings {
  return {
    agentDefaultModelId: null,
    agentDefaultProviderId: null,
    defaultModelId: null,
    defaultProviderId: null,
    inlineDefaultModelId: null,
    inlineDefaultProviderId: null,
    providers: DEFAULT_AI_PROVIDERS.map(cloneProvider),
  };
}

export function normalizeAiProviderSettings(value: unknown): AiProviderSettings {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return createDefaultAiProviderSettings();
  }

  const providers = value.providers
    .map(normalizeProvider)
    .filter((provider): provider is AiProviderConfig => Boolean(provider));

  if (providers.length === 0) {
    return createDefaultAiProviderSettings();
  }

  const defaultProviderId = normalizeProviderSelection(value.defaultProviderId, providers);
  const defaultModelId = normalizeModelSelection(value.defaultModelId, providers, defaultProviderId);
  const agentDefaultProviderId =
    normalizeProviderSelection(value.agentDefaultProviderId, providers) ?? defaultProviderId;
  const agentDefaultModelId =
    normalizeModelSelection(value.agentDefaultModelId, providers, agentDefaultProviderId) ??
    defaultModelId;
  const inlineDefaultProviderId =
    normalizeProviderSelection(value.inlineDefaultProviderId, providers) ?? defaultProviderId;
  const inlineDefaultModelId =
    normalizeModelSelection(value.inlineDefaultModelId, providers, inlineDefaultProviderId) ??
    defaultModelId;

  return {
    agentDefaultModelId,
    agentDefaultProviderId,
    defaultModelId,
    defaultProviderId,
    inlineDefaultModelId,
    inlineDefaultProviderId,
    providers,
  };
}

export function resolveAgentModelSelection(
  settings: AiProviderSettings,
): ResolvedAiModelSelection {
  return resolveModelSelection({
    modelId: settings.agentDefaultModelId ?? settings.defaultModelId,
    providerId: settings.agentDefaultProviderId ?? settings.defaultProviderId,
    providers: settings.providers,
  });
}

export function stripAiProviderSecrets(
  provider: AiProviderConfig,
): AiProviderConfig {
  return {
    ...provider,
    customHeaders: sanitizeCustomHeaders(provider.customHeaders),
  };
}

function normalizeProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  const template = DEFAULT_AI_PROVIDERS.find((provider) => provider.id === value.id);
  const type = normalizeApiStyle(value.type) ?? template?.type ?? 'openai-compatible';
  const apiStyle = normalizeApiStyle(value.apiStyle) ?? template?.apiStyle ?? type;
  const models = Array.isArray(value.models)
    ? value.models.map(normalizeModel).filter((model): model is AiProviderModel => Boolean(model))
    : [];
  const normalizedModels = models.length > 0 ? models : template?.models.map(cloneModel) ?? [];
  const defaultModelId =
    typeof value.defaultModelId === 'string' &&
    normalizedModels.some((model) => model.id === value.defaultModelId)
      ? value.defaultModelId
      : template?.defaultModelId ?? normalizedModels[0]?.id ?? '';

  return stripAiProviderSecrets({
    apiStyle,
    baseUrl:
      typeof value.baseUrl === 'string' && value.baseUrl.trim()
        ? value.baseUrl.trim()
        : template?.baseUrl ?? '',
    customHeaders: typeof value.customHeaders === 'string' ? value.customHeaders : undefined,
    defaultModelId,
    enabled: value.enabled === true,
    id: value.id,
    models: normalizedModels,
    name: value.name,
    secretStatus: normalizeSecretStatus(value.secretStatus, template?.secretStatus),
    type,
  });
}

function normalizeModel(value: unknown): AiProviderModel | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;

  return {
    capabilities: normalizeCapabilities(value.capabilities),
    enabled: value.enabled !== false,
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : value.id,
  };
}

function resolveModelSelection({
  modelId,
  providerId,
  providers,
}: {
  modelId: string | null;
  providerId: string | null;
  providers: AiProviderConfig[];
}): ResolvedAiModelSelection {
  const enabledProviders = providers.filter((provider) =>
    provider.enabled &&
    (provider.secretStatus === 'configured' || provider.secretStatus === 'notRequired') &&
    provider.models.some(isEnabledTextModel),
  );
  const provider =
    enabledProviders.find((item) => item.id === providerId) ?? enabledProviders[0] ?? null;
  const model =
    provider?.models.find((item) => item.id === modelId && isEnabledTextModel(item)) ??
    provider?.models.find((item) => item.id === provider.defaultModelId && isEnabledTextModel(item)) ??
    provider?.models.find(isEnabledTextModel) ??
    null;

  return { model, provider };
}

function sanitizeCustomHeaders(raw: string | undefined) {
  if (!raw?.trim()) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return undefined;
    const safeHeaders = Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => {
        return typeof value === 'string' && !AUTH_HEADER_KEYS.has(key.toLowerCase());
      }),
    );

    return Object.keys(safeHeaders).length > 0 ? JSON.stringify(safeHeaders) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProviderSelection(value: unknown, providers: AiProviderConfig[]) {
  return typeof value === 'string' && providers.some((provider) => provider.id === value)
    ? value
    : null;
}

function normalizeModelSelection(
  value: unknown,
  providers: AiProviderConfig[],
  providerId: string | null,
) {
  const provider = providers.find((item) => item.id === providerId);

  return typeof value === 'string' && provider?.models.some((model) => model.id === value)
    ? value
    : null;
}

function normalizeApiStyle(value: unknown): AiProviderApiStyle | null {
  return value === 'anthropic' ||
    value === 'google' ||
    value === 'ollama' ||
    value === 'openai' ||
    value === 'openai-compatible' ||
    value === 'openai-responses'
    ? value
    : null;
}

function normalizeSecretStatus(
  value: unknown,
  fallback: AiProviderSecretStatus | undefined,
): AiProviderSecretStatus {
  return value === 'configured' || value === 'missing' || value === 'notRequired'
    ? value
    : fallback ?? 'missing';
}

function normalizeCapabilities(value: unknown): AiModelCapability[] {
  const source = Array.isArray(value) ? value : ['text'];
  const capabilities = source.filter((item): item is AiModelCapability => {
    return item === 'image' ||
      item === 'reasoning' ||
      item === 'text' ||
      item === 'tools' ||
      item === 'vision' ||
      item === 'web';
  });

  return capabilities.length > 0 ? Array.from(new Set(capabilities)) : ['text'];
}

function isEnabledTextModel(model: AiProviderModel) {
  return model.enabled && model.capabilities.includes('text');
}

function cloneProvider(provider: AiProviderConfig): AiProviderConfig {
  return {
    ...provider,
    models: provider.models.map(cloneModel),
  };
}

function cloneModel(model: AiProviderModel): AiProviderModel {
  return {
    ...model,
    capabilities: [...model.capabilities],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
