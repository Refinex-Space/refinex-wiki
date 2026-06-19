import type {
  AiProviderApiStyle,
  AiProviderConfig,
  AiProviderModel,
} from './provider-types';

export interface AiProviderJsonRequest {
  headers: Record<string, string>;
  method: 'GET';
  providerId: string;
  url: string;
}

const MODEL_PATH_BY_API_STYLE: Record<AiProviderApiStyle, string> = {
  anthropic: '/models',
  google: '/models',
  ollama: '/models',
  openai: '/models',
  'openai-compatible': '/models',
  'openai-responses': '/models',
};

export function buildAiProviderModelsRequest(
  provider: AiProviderConfig,
): AiProviderJsonRequest {
  const path = MODEL_PATH_BY_API_STYLE[provider.apiStyle];

  return {
    headers: readSafeCustomHeaders(provider.customHeaders),
    method: 'GET',
    providerId: provider.id,
    url: joinApiUrl(provider.baseUrl, path),
  };
}

export function parseAiProviderModels(
  apiStyle: AiProviderApiStyle,
  body: unknown,
): AiProviderModel[] {
  const records = readModelRecords(apiStyle, body);
  const seen = new Set<string>();
  const models: AiProviderModel[] = [];

  for (const record of records) {
    const id = readModelId(apiStyle, record);
    if (!id || seen.has(id) || isEmbeddingModel(id)) continue;

    seen.add(id);
    models.push({
      capabilities: inferCapabilities(id),
      enabled: true,
      id,
      name: readModelName(apiStyle, record, id),
    });
  }

  return models;
}

function readSafeCustomHeaders(raw: string | undefined) {
  if (!raw?.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function joinApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
}

function readModelRecords(apiStyle: AiProviderApiStyle, body: unknown) {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (!isRecord(body)) return [];
  if (Array.isArray(body.data)) return body.data.filter(isRecord);
  if (Array.isArray(body.models)) return body.models.filter(isRecord);
  if (apiStyle === 'google' && Array.isArray(body.models)) return body.models.filter(isRecord);

  return [];
}

function readModelId(apiStyle: AiProviderApiStyle, record: Record<string, unknown>) {
  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;

  if (apiStyle === 'google' && name?.startsWith('models/')) {
    return name.slice('models/'.length);
  }

  return id ?? name;
}

function readModelName(
  apiStyle: AiProviderApiStyle,
  record: Record<string, unknown>,
  id: string,
) {
  if (typeof record.displayName === 'string') return record.displayName;
  if (
    typeof record.name === 'string' &&
    !(apiStyle === 'google' && record.name.startsWith('models/'))
  ) {
    return record.name;
  }

  return id;
}

function inferCapabilities(id: string): AiProviderModel['capabilities'] {
  const lower = id.toLowerCase();
  const capabilities: AiProviderModel['capabilities'] = ['text'];

  if (lower.includes('vision') || lower.includes('gpt-5') || lower.includes('gemini')) {
    capabilities.push('vision');
  }
  if (
    lower.includes('reason') ||
    lower.includes('thinking') ||
    lower.includes('r1') ||
    lower.includes('gpt-5')
  ) {
    capabilities.push('reasoning');
  }
  if (lower.includes('tool') || lower.includes('function')) {
    capabilities.push('tools');
  }

  return Array.from(new Set(capabilities));
}

function isEmbeddingModel(id: string) {
  const lower = id.toLowerCase();

  return lower.includes('embedding') || lower.includes('embed');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
