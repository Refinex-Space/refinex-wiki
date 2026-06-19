export type AiProviderApiStyle =
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openai'
  | 'openai-compatible'
  | 'openai-responses';

export type AiModelCapability =
  | 'image'
  | 'reasoning'
  | 'text'
  | 'tools'
  | 'vision'
  | 'web';

export type AiProviderSecretStatus =
  | 'configured'
  | 'missing'
  | 'notRequired';

export interface AiProviderModel {
  capabilities: AiModelCapability[];
  enabled: boolean;
  id: string;
  name: string;
}

export interface AiProviderConfig {
  apiStyle: AiProviderApiStyle;
  baseUrl: string;
  customHeaders?: string;
  defaultModelId: string;
  enabled: boolean;
  id: string;
  models: AiProviderModel[];
  name: string;
  secretStatus: AiProviderSecretStatus;
  type: AiProviderApiStyle;
}

export interface AiProviderSettings {
  agentDefaultModelId: string | null;
  agentDefaultProviderId: string | null;
  defaultModelId: string | null;
  defaultProviderId: string | null;
  inlineDefaultModelId: string | null;
  inlineDefaultProviderId: string | null;
  providers: AiProviderConfig[];
}

export interface ResolvedAiModelSelection {
  model: AiProviderModel | null;
  provider: AiProviderConfig | null;
}
