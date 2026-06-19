---
owner: refinex
updated: 2026-06-19
status: proposed
referenced_by: docs/README.md#historical-superpowers-plans
---
# AI Provider Runtime Secret Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real AI provider runtime for Refinex Wiki: provider settings, system secret storage, native provider HTTP transport, model management, and read-only streaming chat in the right AI panel.

**Architecture:** Keep the existing Tauri Agent Runtime boundary. React owns settings UI and chat rendering, but provider secrets and network requests are handled by Tauri commands. Markra is only a reference for product shape and architecture; do not copy AGPL source code.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Tauri v2, Rust, `reqwest`, `keyring`, existing `components/ui`, existing `workspace-api.ts`, existing `src-tauri/src/settings.rs`.

---

## Execution Rules

- Do not copy code from `/Users/refinex/Downloads/markra-main`; reimplement behavior in this repo's style.
- Do not store API keys in `settings.json`, localStorage, tests, fixtures, snapshots, logs, or docs examples.
- Do not widen `src-tauri/capabilities/default.json`; provider runtime uses Tauri commands, not shell/process permissions.
- Run the smallest relevant test first, then broader checks.
- Preserve unrelated dirty work. Stage only files from the task being committed.
- If the executor cannot use system Keychain on the current OS, keep the trait and fake backend tests green and document the platform blocker before proceeding to UI/runtime integration.

## File Structure

Create:

- `components/workspace/ai-provider/provider-types.ts`: shared provider/model/settings TypeScript types.
- `components/workspace/ai-provider/provider-catalog.ts`: built-in provider templates, default base URLs, model seeds, capability seeds.
- `components/workspace/ai-provider/provider-settings.ts`: normalization, defaults, selection resolution, secret-field stripping.
- `components/workspace/ai-provider/provider-requests.ts`: model-list request builders and response parsers.
- `components/workspace/ai-provider/chat-adapters.ts`: OpenAI-compatible, OpenAI Responses, Anthropic, Google basic text chat request and stream parsing.
- `components/workspace/ai-provider/__tests__/provider-settings.test.ts`
- `components/workspace/ai-provider/__tests__/provider-requests.test.ts`
- `components/workspace/ai-provider/__tests__/chat-adapters.test.ts`
- `components/workspace/ai-provider/__tests__/secret-safety.test.ts`
- `src-tauri/src/ai_secret.rs`: secret backend trait, keyring backend, validation, Tauri commands.
- `src-tauri/src/ai_http.rs`: provider JSON request, chat request, stream request, URL/header validation.

Modify:

- `components/workspace/workspace-types.ts`: extend `AiSettings` with provider settings.
- `components/workspace/workspace-settings.ts`: merge provider defaults into app settings.
- `components/workspace/workspace-api.ts`: add secret and native AI HTTP wrappers.
- `components/workspace/workspace-settings-dialog.tsx`: replace current AI section with provider manager plus Assistant Accounts.
- `components/workspace/ai-panel/ai-types.ts`: add provider profile/request event types if needed.
- `components/workspace/ai-panel/ai-panel-content.tsx`: use provider runtime when configured; keep `fake-echo` fallback for tests.
- `src-tauri/Cargo.toml`: add `keyring` and `reqwest` dependencies.
- `src-tauri/src/lib.rs`: register `ai_secret` and `ai_http` commands.
- `src-tauri/src/settings.rs`: persist provider metadata, reject secret-like fields, validate custom headers.
- `src-tauri/src/agent_runtime.rs`: expose provider-backed profiles and route provider sessions to native transport.
- `docs/config/reference.md`: document provider settings and secret storage.
- `docs/README.md`: already links the design spec; add this plan.

## Task 1: Provider Types, Catalog, And Settings Normalization

**Files:**
- Create: `components/workspace/ai-provider/provider-types.ts`
- Create: `components/workspace/ai-provider/provider-catalog.ts`
- Create: `components/workspace/ai-provider/provider-settings.ts`
- Test: `components/workspace/ai-provider/__tests__/provider-settings.test.ts`
- Test: `components/workspace/ai-provider/__tests__/secret-safety.test.ts`
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-settings.ts`

- [ ] **Step 1: Write failing provider settings tests**

Create `components/workspace/ai-provider/__tests__/provider-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  createDefaultAiProviderSettings,
  normalizeAiProviderSettings,
  resolveAgentModelSelection,
} from '../provider-settings';

describe('AI provider settings', () => {
  it('creates built-in providers without configured secrets', () => {
    const settings = createDefaultAiProviderSettings();

    expect(settings.providers.map((provider) => provider.id)).toEqual([
      'openai',
      'anthropic',
      'openrouter',
      'google',
      'deepseek',
      'qwen',
      'ollama',
    ]);
    expect(settings.providers.find((provider) => provider.id === 'openai')).toEqual(
      expect.objectContaining({
        apiStyle: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1',
        secretStatus: 'missing',
      }),
    );
    expect(settings.providers.find((provider) => provider.id === 'ollama')).toEqual(
      expect.objectContaining({
        baseUrl: 'http://localhost:11434/v1',
        secretStatus: 'notRequired',
      }),
    );
  });

  it('normalizes legacy or partial settings without losing model defaults', () => {
    const settings = normalizeAiProviderSettings({
      agentDefaultModelId: 'claude-sonnet-4-6',
      agentDefaultProviderId: 'anthropic',
      providers: [
        {
          enabled: true,
          id: 'anthropic',
          models: [
            {
              capabilities: ['text', 'reasoning'],
              enabled: true,
              id: 'claude-sonnet-4-6',
              name: 'Claude Sonnet 4.6',
            },
          ],
          name: 'Anthropic',
          type: 'anthropic',
        },
      ],
    });

    expect(settings.agentDefaultProviderId).toBe('anthropic');
    expect(settings.agentDefaultModelId).toBe('claude-sonnet-4-6');
    expect(settings.providers[0]).toEqual(
      expect.objectContaining({
        apiStyle: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        defaultModelId: 'claude-sonnet-4-6',
      }),
    );
  });

  it('resolves only enabled text models for the right AI panel', () => {
    const settings = normalizeAiProviderSettings({
      agentDefaultProviderId: 'openai',
      agentDefaultModelId: 'gpt-5.4',
      providers: [
        {
          apiStyle: 'openai-responses',
          baseUrl: 'https://api.openai.com/v1',
          defaultModelId: 'gpt-image-2',
          enabled: true,
          id: 'openai',
          models: [
            { capabilities: ['image'], enabled: true, id: 'gpt-image-2', name: 'GPT Image 2' },
            { capabilities: ['text', 'tools'], enabled: true, id: 'gpt-5.4', name: 'GPT-5.4' },
          ],
          name: 'OpenAI',
          secretStatus: 'configured',
          type: 'openai',
        },
      ],
    });

    expect(resolveAgentModelSelection(settings)).toEqual({
      model: expect.objectContaining({ id: 'gpt-5.4' }),
      provider: expect.objectContaining({ id: 'openai' }),
    });
  });
});
```

- [ ] **Step 2: Write failing secret safety tests**

Create `components/workspace/ai-provider/__tests__/secret-safety.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { normalizeAiProviderSettings, stripAiProviderSecrets } from '../provider-settings';

describe('AI provider secret safety', () => {
  it('removes apiKey-like fields from provider settings', () => {
    const settings = normalizeAiProviderSettings({
      providers: [
        {
          apiKey: 'sk-leak',
          baseUrl: 'https://api.openai.com/v1',
          enabled: true,
          id: 'openai',
          models: [{ capabilities: ['text'], enabled: true, id: 'gpt-5.4', name: 'GPT-5.4' }],
          name: 'OpenAI',
          secret: 'secret-leak',
          token: 'token-leak',
          type: 'openai',
        },
      ],
    });

    const json = JSON.stringify(settings);

    expect(json).not.toContain('sk-leak');
    expect(json).not.toContain('secret-leak');
    expect(json).not.toContain('token-leak');
  });

  it('strips custom auth headers before settings are persisted', () => {
    const provider = {
      apiStyle: 'openai-compatible' as const,
      baseUrl: 'https://example.com/v1',
      customHeaders: JSON.stringify({
        Authorization: 'Bearer leak',
        'X-Trace-Id': 'trace-1',
        'x-api-key': 'leak',
      }),
      defaultModelId: 'model',
      enabled: true,
      id: 'custom-openai-compatible-1',
      models: [{ capabilities: ['text' as const], enabled: true, id: 'model', name: 'Model' }],
      name: 'Custom',
      secretStatus: 'configured' as const,
      type: 'openai-compatible' as const,
    };

    expect(stripAiProviderSecrets(provider).customHeaders).toBe(
      JSON.stringify({ 'X-Trace-Id': 'trace-1' }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/provider-settings.test.ts components/workspace/ai-provider/__tests__/secret-safety.test.ts
```

Expected: FAIL because `components/workspace/ai-provider/*` files do not exist.

- [ ] **Step 4: Add provider types**

Create `components/workspace/ai-provider/provider-types.ts` with these exported types:

```ts
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
```

- [ ] **Step 5: Add catalog**

Create `components/workspace/ai-provider/provider-catalog.ts`:

```ts
import type { AiProviderConfig } from './provider-types';

export const DEFAULT_AI_PROVIDERS: AiProviderConfig[] = [
  {
    apiStyle: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    defaultModelId: 'gpt-5.5',
    enabled: false,
    id: 'openai',
    models: [
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'gpt-5.5', name: 'GPT-5.5' },
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'gpt-5.4', name: 'GPT-5.4' },
      { capabilities: ['text', 'vision', 'reasoning', 'tools'], enabled: true, id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
    ],
    name: 'OpenAI',
    secretStatus: 'missing',
    type: 'openai',
  },
  {
    apiStyle: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModelId: 'claude-sonnet-4-6',
    enabled: false,
    id: 'anthropic',
    models: [
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { capabilities: ['text', 'vision', 'tools'], enabled: true, id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    name: 'Anthropic',
    secretStatus: 'missing',
    type: 'anthropic',
  },
  {
    apiStyle: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModelId: 'openrouter/auto',
    enabled: false,
    id: 'openrouter',
    models: [
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'openrouter/auto', name: 'OpenRouter Auto' },
      { capabilities: ['text', 'vision', 'reasoning', 'tools'], enabled: true, id: 'openai/gpt-5.5', name: 'GPT-5.5' },
    ],
    name: 'OpenRouter',
    secretStatus: 'missing',
    type: 'openai-compatible',
  },
  {
    apiStyle: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModelId: 'gemini-3.1-pro-preview',
    enabled: false,
    id: 'google',
    models: [
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
      { capabilities: ['text', 'vision', 'tools'], enabled: true, id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
    ],
    name: 'Google',
    secretStatus: 'missing',
    type: 'google',
  },
  {
    apiStyle: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    defaultModelId: 'deepseek-v4-pro',
    enabled: false,
    id: 'deepseek',
    models: [
      { capabilities: ['text', 'reasoning', 'tools'], enabled: true, id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { capabilities: ['text', 'reasoning', 'tools'], enabled: true, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    ],
    name: 'DeepSeek',
    secretStatus: 'missing',
    type: 'openai-compatible',
  },
  {
    apiStyle: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen3.6-plus',
    enabled: false,
    id: 'qwen',
    models: [
      { capabilities: ['text', 'vision', 'reasoning', 'tools', 'web'], enabled: true, id: 'qwen3.6-plus', name: 'Qwen3.6 Plus' },
      { capabilities: ['text', 'tools'], enabled: true, id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
    ],
    name: 'Qwen',
    secretStatus: 'missing',
    type: 'openai-compatible',
  },
  {
    apiStyle: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    defaultModelId: 'llama3.3',
    enabled: false,
    id: 'ollama',
    models: [
      { capabilities: ['text'], enabled: true, id: 'llama3.3', name: 'Llama 3.3' },
      { capabilities: ['text'], enabled: true, id: 'qwen3:32b', name: 'Qwen3 32B' },
    ],
    name: 'Ollama',
    secretStatus: 'notRequired',
    type: 'ollama',
  },
];
```

- [ ] **Step 6: Add normalization and selection helpers**

Create `components/workspace/ai-provider/provider-settings.ts`:

```ts
import { DEFAULT_AI_PROVIDERS } from './provider-catalog';
import type {
  AiModelCapability,
  AiProviderApiStyle,
  AiProviderConfig,
  AiProviderModel,
  AiProviderSettings,
  AiProviderSecretStatus,
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
    normalizeModelSelection(value.agentDefaultModelId, providers, agentDefaultProviderId) ?? defaultModelId;
  const inlineDefaultProviderId =
    normalizeProviderSelection(value.inlineDefaultProviderId, providers) ?? defaultProviderId;
  const inlineDefaultModelId =
    normalizeModelSelection(value.inlineDefaultModelId, providers, inlineDefaultProviderId) ?? defaultModelId;

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
    baseUrl: typeof value.baseUrl === 'string' && value.baseUrl.trim()
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
```

- [ ] **Step 7: Extend workspace settings types**

Modify `components/workspace/workspace-types.ts`:

```ts
import type { AiProviderSettings } from './ai-provider/provider-types';

export interface AiSettings {
  enabledProfileId: string | null;
  profiles: AiConfiguredProfile[];
  providers: AiProviderSettings;
}
```

Keep the existing `AiConfiguredProfile` fields unchanged.

- [ ] **Step 8: Merge defaults into app settings**

Modify `components/workspace/workspace-settings.ts`:

```ts
import {
  createDefaultAiProviderSettings,
  normalizeAiProviderSettings,
} from './ai-provider/provider-settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabledProfileId: DEFAULT_AI_PROFILE.id,
  profiles: [DEFAULT_AI_PROFILE],
  providers: createDefaultAiProviderSettings(),
};

function withDefaultAiSettings(settings?: Partial<AiSettings>): AiSettings {
  const profiles =
    settings?.profiles && settings.profiles.length > 0
      ? settings.profiles.map(withDefaultAiProfile)
      : DEFAULT_AI_SETTINGS.profiles;
  const requestedEnabledProfileId =
    settings && 'enabledProfileId' in settings
      ? settings.enabledProfileId
      : DEFAULT_AI_SETTINGS.enabledProfileId;
  const selectedProfile = profiles.find(
    (profile) => profile.id === requestedEnabledProfileId && profile.enabled,
  );

  return {
    enabledProfileId: selectedProfile?.id ?? null,
    profiles,
    providers: normalizeAiProviderSettings(settings?.providers),
  };
}
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/provider-settings.test.ts components/workspace/ai-provider/__tests__/secret-safety.test.ts components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit checkpoint**

```bash
git add components/workspace/ai-provider components/workspace/workspace-types.ts components/workspace/workspace-settings.ts
git commit -m "feat(ai): 增加 AI provider 配置模型"
```

## Task 2: Rust Settings Schema And Secret Rejection

**Files:**
- Modify: `src-tauri/src/settings.rs`
- Test: `src-tauri/src/settings.rs`
- Modify: `docs/config/reference.md`

- [ ] **Step 1: Write failing Rust settings tests**

Add tests in `src-tauri/src/settings.rs`:

```rust
#[test]
fn default_settings_include_ai_provider_metadata_without_secrets() {
    let settings = default_app_settings();
    let json = serde_json::to_string(&settings).expect("settings should serialize");
    let value: serde_json::Value = serde_json::from_str(&json).expect("settings should parse");

    assert_eq!(value["ai"]["providers"][0]["id"], "openai");
    assert_eq!(value["ai"]["providers"][0]["secretStatus"], "missing");
    assert!(!json.contains("apiKey"));
    assert!(!json.contains("sk-"));
}

#[test]
fn rejects_ai_provider_secret_fields_in_settings_json() {
    let raw = r#"{
      "schemaVersion": 1,
      "storage": { "defaultProvider": "local" },
      "appearance": { "pageWidthMode": "wide" },
      "ai": {
        "enabledProfileId": "fake-echo",
        "profiles": [
          {
            "enabled": true,
            "id": "fake-echo",
            "isTestRuntime": true,
            "kind": "fake",
            "label": "Fake Echo",
            "modelId": "fake-echo",
            "modelLabel": "fake-echo",
            "providerId": "local",
            "providerLabel": "Local"
          }
        ],
        "providers": [
          {
            "apiKey": "sk-leak",
            "apiStyle": "openai-responses",
            "baseUrl": "https://api.openai.com/v1",
            "defaultModelId": "gpt-5.4",
            "enabled": true,
            "id": "openai",
            "models": [
              {
                "capabilities": ["text"],
                "enabled": true,
                "id": "gpt-5.4",
                "name": "GPT-5.4"
              }
            ],
            "name": "OpenAI",
            "secretStatus": "configured",
            "type": "openai"
          }
        ]
      }
    }"#;

    let parsed: serde_json::Value = serde_json::from_str(raw).expect("json should parse");
    let settings: AppSettings = serde_json::from_value(parsed).expect("settings shape should parse");

    assert_eq!(
        validate_app_settings(&settings),
        Err("AI provider settings must not contain secrets".to_string()),
    );
}

#[test]
fn rejects_ai_provider_custom_auth_headers() {
    let mut settings = default_app_settings();
    settings.ai.providers[0].custom_headers =
        Some(r#"{"Authorization":"Bearer leak","X-Trace-Id":"trace"}"#.to_string());

    assert_eq!(
        validate_app_settings(&settings),
        Err("AI provider custom headers contain protected auth headers".to_string()),
    );
}
```

- [ ] **Step 2: Run Rust test to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings::tests::default_settings_include_ai_provider_metadata_without_secrets settings::tests::rejects_ai_provider_secret_fields_in_settings_json settings::tests::rejects_ai_provider_custom_auth_headers
```

Expected: FAIL because Rust settings do not have provider fields.

- [ ] **Step 3: Add Rust provider settings structs**

Modify `src-tauri/src/settings.rs`:

```rust
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    pub api_style: String,
    pub base_url: String,
    pub custom_headers: Option<String>,
    pub default_model_id: String,
    pub enabled: bool,
    pub id: String,
    pub models: Vec<AiProviderModelSettings>,
    pub name: String,
    pub secret_status: String,
    pub r#type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderModelSettings {
    pub capabilities: Vec<String>,
    pub enabled: bool,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub enabled_profile_id: Option<String>,
    pub profiles: Vec<AiProfileSettings>,
    #[serde(default = "default_ai_provider_settings")]
    pub providers: Vec<AiProviderSettings>,
    pub default_provider_id: Option<String>,
    pub default_model_id: Option<String>,
    pub agent_default_provider_id: Option<String>,
    pub agent_default_model_id: Option<String>,
    pub inline_default_provider_id: Option<String>,
    pub inline_default_model_id: Option<String>,
}
```

Add `default_ai_provider_settings()` returning the same built-ins as Task 1, with concise Rust values for OpenAI, Anthropic, OpenRouter, Google, DeepSeek, Qwen, and Ollama.

- [ ] **Step 4: Add settings validation**

Modify `validate_ai_settings` in `src-tauri/src/settings.rs`:

```rust
fn validate_ai_provider_settings(providers: &[AiProviderSettings]) -> Result<(), String> {
    if providers.is_empty() {
        return Err("AI provider 列表不能为空".to_string());
    }

    for provider in providers {
        validate_ai_provider_id(&provider.id)?;
        if provider.name.trim().is_empty()
            || provider.base_url.trim().is_empty()
            || provider.default_model_id.trim().is_empty()
        {
            return Err("AI provider 配置不完整".to_string());
        }
        if !is_supported_ai_provider_api_style(&provider.api_style)
            || !is_supported_ai_provider_api_style(&provider.r#type)
        {
            return Err("AI provider API style 不支持".to_string());
        }
        if !matches!(
            provider.secret_status.as_str(),
            "configured" | "missing" | "notRequired"
        ) {
            return Err("AI provider secret 状态不支持".to_string());
        }
        if provider.custom_headers_contains_protected_auth_header()? {
            return Err("AI provider custom headers contain protected auth headers".to_string());
        }
        if provider.models.is_empty() {
            return Err("AI provider 模型列表不能为空".to_string());
        }
        for model in &provider.models {
            if model.id.trim().is_empty() || model.name.trim().is_empty() {
                return Err("AI provider 模型配置不完整".to_string());
            }
            if !model.capabilities.iter().any(|capability| capability == "text") {
                return Err("AI provider 模型必须声明 text 能力".to_string());
            }
        }
    }

    Ok(())
}
```

Implement `custom_headers_contains_protected_auth_header` by parsing JSON object and rejecting lower-case keys in `authorization`, `api-key`, `x-api-key`, `x-goog-api-key`.

Because serde ignores unknown JSON fields by default, add `#[serde(deny_unknown_fields)]` to `AiProviderSettings` and `AiProviderModelSettings` so `apiKey`, `token`, and `secret` are rejected during `serde_json::from_value`.

- [ ] **Step 5: Update config docs**

Modify `docs/config/reference.md`:

```md
`ai.providers[]` stores AI provider metadata only: id, name, apiStyle, type, baseUrl, model list, enabled state, default model, custom headers, and `secretStatus`. It must not store API keys or bearer tokens. Provider API keys are stored through the Tauri secret-store commands and should only be surfaced in the UI as configured/missing/notRequired.
```

- [ ] **Step 6: Run focused Rust settings tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings::tests
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint**

```bash
git add src-tauri/src/settings.rs docs/config/reference.md
git commit -m "feat(ai): 扩展 AI provider 设置架构"
```

## Task 3: System Secret Store Commands

**Files:**
- Create: `src-tauri/src/ai_secret.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `components/workspace/workspace-api.ts`
- Test: `src-tauri/src/ai_secret.rs`
- Test: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing Rust secret tests**

Create `src-tauri/src/ai_secret.rs` with test scaffolding first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_secret_provider_ids() {
        assert!(validate_secret_provider_id("openai").is_ok());
        assert!(validate_secret_provider_id("custom-openai-compatible-1").is_ok());
        assert!(validate_secret_provider_id("../openai").is_err());
        assert!(validate_secret_provider_id("openai token").is_err());
        assert!(validate_secret_provider_id("").is_err());
    }

    #[test]
    fn fake_secret_backend_round_trips_status_without_exposing_value() {
        let backend = InMemorySecretBackend::default();

        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus { status: "missing".to_string() },
        );
        save_secret_with_backend(&backend, "openai", "sk-test").expect("save");
        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus { status: "configured".to_string() },
        );
        delete_secret_with_backend(&backend, "openai").expect("delete");
        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus { status: "missing".to_string() },
        );
    }
}
```

- [ ] **Step 2: Run Rust secret tests to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ai_secret::tests
```

Expected: FAIL because `ai_secret` module is not registered and helpers do not exist.

- [ ] **Step 3: Add dependency**

Modify `src-tauri/Cargo.toml`:

```toml
keyring = "3"
```

If Cargo resolves a newer compatible version, keep the generated `Cargo.lock` change and document it in the final implementation summary.

- [ ] **Step 4: Implement secret module**

Create `src-tauri/src/ai_secret.rs`:

```rust
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

const SERVICE_NAME: &str = "refinex-wiki.ai-provider";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSecretStatus {
    pub status: String,
}

trait SecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String>;
    fn exists(&self, provider_id: &str) -> Result<bool, String>;
    fn read(&self, provider_id: &str) -> Result<Option<String>, String>;
    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String>;
}

struct KeyringSecretBackend;

impl SecretBackend for KeyringSecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(sanitize_secret_error(error)),
        }
    }

    fn exists(&self, provider_id: &str) -> Result<bool, String> {
        self.read(provider_id).map(|value| value.is_some())
    }

    fn read(&self, provider_id: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(sanitize_secret_error(error)),
        }
    }

    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        entry.set_password(secret).map_err(sanitize_secret_error)
    }
}

#[derive(Default)]
struct InMemorySecretBackend {
    values: Mutex<HashMap<String, String>>,
}

impl SecretBackend for InMemorySecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String> {
        self.values.lock().map_err(|_| "secret store lock failed".to_string())?.remove(provider_id);
        Ok(())
    }

    fn exists(&self, provider_id: &str) -> Result<bool, String> {
        Ok(self.values.lock().map_err(|_| "secret store lock failed".to_string())?.contains_key(provider_id))
    }

    fn read(&self, provider_id: &str) -> Result<Option<String>, String> {
        Ok(self.values.lock().map_err(|_| "secret store lock failed".to_string())?.get(provider_id).cloned())
    }

    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String> {
        self.values
            .lock()
            .map_err(|_| "secret store lock failed".to_string())?
            .insert(provider_id.to_string(), secret.to_string());
        Ok(())
    }
}

#[tauri::command]
pub fn get_ai_provider_secret_status(provider_id: String) -> Result<AiSecretStatus, String> {
    get_secret_status_with_backend(&KeyringSecretBackend, &provider_id)
}

#[tauri::command]
pub fn save_ai_provider_secret(provider_id: String, secret: String) -> Result<AiSecretStatus, String> {
    save_secret_with_backend(&KeyringSecretBackend, &provider_id, &secret)
}

#[tauri::command]
pub fn delete_ai_provider_secret(provider_id: String) -> Result<AiSecretStatus, String> {
    delete_secret_with_backend(&KeyringSecretBackend, &provider_id)
}

fn get_secret_status_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;

    Ok(AiSecretStatus {
        status: if backend.exists(provider_id)? { "configured" } else { "missing" }.to_string(),
    })
}

fn save_secret_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
    secret: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;
    if secret.trim().is_empty() {
        return Err("AI provider secret 不能为空".to_string());
    }

    backend.write(provider_id, secret.trim())?;
    get_secret_status_with_backend(backend, provider_id)
}

fn delete_secret_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;
    backend.delete(provider_id)?;
    get_secret_status_with_backend(backend, provider_id)
}

fn validate_secret_provider_id(provider_id: &str) -> Result<(), String> {
    let valid = !provider_id.is_empty()
        && provider_id.len() <= 80
        && provider_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.');

    if valid {
        Ok(())
    } else {
        Err("AI provider id 不安全".to_string())
    }
}

fn sanitize_secret_error(error: impl std::fmt::Display) -> String {
    let text = error.to_string();
    if text.trim().is_empty() {
        "system secret store failed".to_string()
    } else {
        format!("system secret store failed: {text}")
    }
}
```

Keep the tests from Step 1 at the bottom of this file.

- [ ] **Step 5: Register Tauri commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod ai_secret;
```

Add commands to `tauri::generate_handler!`:

```rust
ai_secret::get_ai_provider_secret_status,
ai_secret::save_ai_provider_secret,
ai_secret::delete_ai_provider_secret,
```

- [ ] **Step 6: Add frontend API tests**

Modify `components/workspace/__tests__/workspace-api.test.ts` AI command test:

```ts
import {
  deleteAiProviderSecret,
  getAiProviderSecretStatus,
  saveAiProviderSecret,
} from '../workspace-api';

invokeMock
  .mockResolvedValueOnce({ status: 'missing' })
  .mockResolvedValueOnce({ status: 'configured' })
  .mockResolvedValueOnce({ status: 'missing' });

await getAiProviderSecretStatus('openai');
await saveAiProviderSecret('openai', 'sk-test');
await deleteAiProviderSecret('openai');

expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_ai_provider_secret_status', {
  providerId: 'openai',
});
expect(invokeMock).toHaveBeenNthCalledWith(2, 'save_ai_provider_secret', {
  providerId: 'openai',
  secret: 'sk-test',
});
expect(invokeMock).toHaveBeenNthCalledWith(3, 'delete_ai_provider_secret', {
  providerId: 'openai',
});
```

- [ ] **Step 7: Implement frontend API wrappers**

Modify `components/workspace/workspace-api.ts`:

```ts
export interface AiProviderSecretStatus {
  status: 'configured' | 'missing';
}

export async function getAiProviderSecretStatus(providerId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('get_ai_provider_secret_status', {
    providerId,
  });
}

export async function saveAiProviderSecret(providerId: string, secret: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('save_ai_provider_secret', {
    providerId,
    secret,
  });
}

export async function deleteAiProviderSecret(providerId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('delete_ai_provider_secret', {
    providerId,
  });
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ai_secret::tests
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit checkpoint**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ai_secret.rs src-tauri/src/lib.rs components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat(ai): 添加系统密钥存储命令"
```

## Task 4: Native AI HTTP Transport And Provider Request Builders

**Files:**
- Create: `src-tauri/src/ai_http.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `components/workspace/ai-provider/provider-requests.ts`
- Test: `src-tauri/src/ai_http.rs`
- Test: `components/workspace/ai-provider/__tests__/provider-requests.test.ts`
- Modify: `components/workspace/workspace-api.ts`
- Test: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing provider request tests**

Create `components/workspace/ai-provider/__tests__/provider-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildAiProviderModelsRequest,
  parseAiProviderModels,
} from '../provider-requests';

describe('AI provider model requests', () => {
  it('builds OpenAI models request without auth headers', () => {
    expect(
      buildAiProviderModelsRequest({
        apiStyle: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-5.4',
        enabled: true,
        id: 'openai',
        models: [],
        name: 'OpenAI',
        secretStatus: 'configured',
        type: 'openai',
      }),
    ).toEqual({
      headers: {},
      method: 'GET',
      providerId: 'openai',
      url: 'https://api.openai.com/v1/models',
    });
  });

  it('parses OpenAI-compatible model responses', () => {
    expect(
      parseAiProviderModels('openai-compatible', {
        data: [
          { id: 'qwen3.6-plus', object: 'model' },
          { id: 'text-embedding-3-large', object: 'model' },
        ],
      }),
    ).toEqual([
      {
        capabilities: ['text'],
        enabled: true,
        id: 'qwen3.6-plus',
        name: 'qwen3.6-plus',
      },
    ]);
  });
});
```

- [ ] **Step 2: Write failing Rust HTTP tests**

Create `src-tauri/src/ai_http.rs` tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_only_http_provider_urls() {
        assert!(validated_http_url("https://api.openai.com/v1/models").is_ok());
        assert!(validated_http_url("http://localhost:11434/v1/models").is_ok());
        assert!(validated_http_url("file:///tmp/key").is_err());
        assert!(validated_http_url("ftp://example.com/models").is_err());
    }

    #[test]
    fn rejects_protected_headers_from_frontend_request() {
        let mut headers = std::collections::HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer leak".to_string());

        assert_eq!(
            parse_safe_headers(&headers),
            Err("AI request headers contain protected auth headers".to_string()),
        );
    }

    #[test]
    fn splits_stream_chunks_on_valid_utf8_boundaries() {
        let mut pending = Vec::new();
        assert_eq!(take_utf8_text(&mut pending, "你".as_bytes()), Some("你".to_string()));
        assert!(pending.is_empty());
    }
}
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/provider-requests.test.ts
cargo test --manifest-path src-tauri/Cargo.toml ai_http::tests
```

Expected: FAIL because files/helpers do not exist.

- [ ] **Step 4: Add dependencies**

Modify `src-tauri/Cargo.toml`:

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream"] }
```

- [ ] **Step 5: Implement provider request builders**

Create `components/workspace/ai-provider/provider-requests.ts`:

```ts
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

const modelPathByApiStyle: Record<AiProviderApiStyle, string> = {
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
  const path = modelPathByApiStyle[provider.apiStyle];

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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

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

  if (apiStyle === 'google' && name?.startsWith('models/')) return name.slice('models/'.length);
  return id ?? name;
}

function readModelName(
  apiStyle: AiProviderApiStyle,
  record: Record<string, unknown>,
  id: string,
) {
  if (typeof record.displayName === 'string') return record.displayName;
  if (typeof record.name === 'string' && !(apiStyle === 'google' && record.name.startsWith('models/'))) {
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
  if (lower.includes('reason') || lower.includes('thinking') || lower.includes('r1') || lower.includes('gpt-5')) {
    capabilities.push('reasoning');
  }
  if (!lower.includes('embedding')) {
    capabilities.push('tools');
  }

  return Array.from(new Set(capabilities));
}

function isEmbeddingModel(id: string) {
  return id.toLowerCase().includes('embedding') || id.toLowerCase().includes('embed');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

- [ ] **Step 6: Implement native AI HTTP module**

Create `src-tauri/src/ai_http.rs`:

```rust
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::ipc::Channel;

const AI_PROVIDER_REQUEST_TIMEOUT_SECS: u64 = 20;
const AI_CHAT_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderJsonRequest {
    pub headers: HashMap<String, String>,
    pub method: String,
    pub provider_id: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub body: String,
    pub headers: HashMap<String, String>,
    pub provider_id: String,
    pub url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderJsonResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiChatStreamEvent {
    Chunk { chunk: String },
    Done { status: u16 },
}

#[tauri::command]
pub async fn request_ai_provider_json(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    execute_ai_provider_json_request(request).await
}

#[tauri::command]
pub async fn request_ai_chat(request: AiChatRequest) -> Result<AiProviderJsonResponse, String> {
    execute_ai_chat_request(request).await
}

#[tauri::command]
pub async fn request_ai_chat_stream(
    request: AiChatRequest,
    on_event: Channel<AiChatStreamEvent>,
) -> Result<AiProviderJsonResponse, String> {
    execute_ai_chat_stream_request(request, on_event).await
}

async fn execute_ai_provider_json_request(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    if !request.method.eq_ignore_ascii_case("GET") {
        return Err("Only GET requests are supported for AI provider checks.".to_string());
    }

    let url = validated_http_url(&request.url)?;
    let headers = parse_safe_headers(&request.headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_PROVIDER_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;

    Ok(AiProviderJsonResponse {
        body: response_body_json(&text),
        status,
    })
}

async fn execute_ai_chat_request(request: AiChatRequest) -> Result<AiProviderJsonResponse, String> {
    let url = validated_http_url(&request.url)?;
    let headers = parse_safe_headers(&request.headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(url)
        .headers(headers)
        .body(request.body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;

    Ok(AiProviderJsonResponse {
        body: response_body_json(&text),
        status,
    })
}

async fn execute_ai_chat_stream_request(
    request: AiChatRequest,
    on_event: Channel<AiChatStreamEvent>,
) -> Result<AiProviderJsonResponse, String> {
    let url = validated_http_url(&request.url)?;
    let headers = parse_safe_headers(&request.headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .post(url)
        .headers(headers)
        .body(request.body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();

    if !response.status().is_success() {
        let text = response.text().await.map_err(|error| error.to_string())?;
        return Ok(AiProviderJsonResponse {
            body: response_body_json(&text),
            status,
        });
    }

    let mut pending_utf8 = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if let Some(text) = take_utf8_text(&mut pending_utf8, &chunk) {
            on_event
                .send(AiChatStreamEvent::Chunk { chunk: text })
                .map_err(|error| error.to_string())?;
        }
    }

    if !pending_utf8.is_empty() {
        let chunk = String::from_utf8_lossy(&pending_utf8).to_string();
        pending_utf8.clear();
        on_event
            .send(AiChatStreamEvent::Chunk { chunk })
            .map_err(|error| error.to_string())?;
    }

    on_event
        .send(AiChatStreamEvent::Done { status })
        .map_err(|error| error.to_string())?;

    Ok(AiProviderJsonResponse {
        body: Value::Null,
        status,
    })
}

fn validated_http_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|error| error.to_string())?;
    if matches!(parsed.scheme(), "http" | "https") {
        Ok(parsed)
    } else {
        Err("Only HTTP and HTTPS AI provider URLs are supported.".to_string())
    }
}

fn parse_safe_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let protected = ["authorization", "api-key", "x-api-key", "x-goog-api-key"];
    let mut header_map = HeaderMap::new();

    for (name, value) in headers {
        if protected.contains(&name.to_ascii_lowercase().as_str()) {
            return Err("AI request headers contain protected auth headers".to_string());
        }
        header_map.insert(
            HeaderName::from_bytes(name.as_bytes()).map_err(|error| error.to_string())?,
            HeaderValue::from_str(value).map_err(|error| error.to_string())?,
        );
    }

    Ok(header_map)
}

fn take_utf8_text(pending: &mut Vec<u8>, chunk: &[u8]) -> Option<String> {
    pending.extend_from_slice(chunk);

    match std::str::from_utf8(pending) {
        Ok(text) => {
            let text = text.to_string();
            pending.clear();
            (!text.is_empty()).then_some(text)
        }
        Err(error) if error.error_len().is_some() => {
            let text = String::from_utf8_lossy(pending).to_string();
            pending.clear();
            (!text.is_empty()).then_some(text)
        }
        Err(error) => {
            let valid_up_to = error.valid_up_to();
            if valid_up_to == 0 {
                return None;
            }
            let text = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
            *pending = pending[valid_up_to..].to_vec();
            Some(text)
        }
    }
}

fn response_body_json(text: &str) -> Value {
    if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(text).unwrap_or_else(|_| json!({ "message": text }))
    }
}
```

Keep tests from Step 2 at the bottom of this file.

- [ ] **Step 7: Register Tauri commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod ai_http;
```

Add commands:

```rust
ai_http::request_ai_provider_json,
ai_http::request_ai_chat,
ai_http::request_ai_chat_stream,
```

- [ ] **Step 8: Add frontend native HTTP wrappers**

Modify `components/workspace/workspace-api.ts`:

```ts
import { Channel } from '@tauri-apps/api/core';

export interface AiProviderJsonRequest {
  headers: Record<string, string>;
  method: 'GET';
  providerId: string;
  url: string;
}

export interface AiChatRequest {
  body: string;
  headers: Record<string, string>;
  providerId: string;
  url: string;
}

export interface AiProviderJsonResponse {
  body: unknown;
  status: number;
}

export type AiChatStreamEvent =
  | { type: 'chunk'; chunk: string }
  | { type: 'done'; status: number };

export async function requestAiProviderJson(input: AiProviderJsonRequest) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderJsonResponse>('request_ai_provider_json', {
    request: input,
  });
}

export async function requestAiChat(input: AiChatRequest) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderJsonResponse>('request_ai_chat', {
    request: input,
  });
}

export async function requestAiChatStream(
  input: AiChatRequest,
  onEvent: (event: AiChatStreamEvent) => void,
) {
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<AiChatStreamEvent>();

  channel.onmessage = onEvent;

  return invoke<AiProviderJsonResponse>('request_ai_chat_stream', {
    onEvent: channel,
    request: input,
  });
}
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/provider-requests.test.ts components/workspace/__tests__/workspace-api.test.ts
cargo test --manifest-path src-tauri/Cargo.toml ai_http::tests
```

Expected: PASS.

- [ ] **Step 10: Commit checkpoint**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ai_http.rs src-tauri/src/lib.rs components/workspace/ai-provider/provider-requests.ts components/workspace/ai-provider/__tests__/provider-requests.test.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat(ai): 添加原生 AI provider 请求通道"
```

## Task 5: AI Settings Provider Manager UI

**Files:**
- Modify: `components/workspace/workspace-settings-dialog.tsx`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`
- Reuse: `components/workspace/ai-provider/provider-settings.ts`
- Reuse: `components/workspace/workspace-api.ts`

- [ ] **Step 1: Write failing settings UI tests**

Add tests to `components/workspace/__tests__/workspace-layout.test.tsx`:

```ts
it('shows AI provider manager with secret status and model controls', async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  readAppSettingsMock.mockResolvedValue({
    ...defaultAppSettings,
    ai: {
      ...defaultAiSettings,
      providers: {
        agentDefaultModelId: 'gpt-5.4',
        agentDefaultProviderId: 'openai',
        defaultModelId: 'gpt-5.4',
        defaultProviderId: 'openai',
        inlineDefaultModelId: null,
        inlineDefaultProviderId: null,
        providers: [
          {
            apiStyle: 'openai-responses',
            baseUrl: 'https://api.openai.com/v1',
            defaultModelId: 'gpt-5.4',
            enabled: true,
            id: 'openai',
            models: [
              { capabilities: ['text', 'tools'], enabled: true, id: 'gpt-5.4', name: 'GPT-5.4' },
            ],
            name: 'OpenAI',
            secretStatus: 'configured',
            type: 'openai',
          },
        ],
      },
    },
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));
  await user.click(await screen.findByRole('button', { name: 'AI' }));

  expect(await screen.findByText('Providers')).toBeTruthy();
  expect(screen.getByText('OpenAI')).toBeTruthy();
  expect(screen.getByText('Secret configured')).toBeTruthy();
  expect(screen.getByLabelText('API style')).toBeTruthy();
  expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.openai.com/v1');
  expect(screen.getByText('Models')).toBeTruthy();
  expect(screen.getByText('GPT-5.4')).toBeTruthy();
});

it('saves provider metadata without API key text', async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(screen.getByRole('button', { name: '打开设置菜单' }));
  await user.click(screen.getByText('设置...'));
  await user.click(await screen.findByRole('button', { name: 'AI' }));
  await user.click(await screen.findByRole('button', { name: 'Set API key' }));
  await user.type(await screen.findByLabelText('API key'), 'sk-test-secret');
  await user.click(screen.getByRole('button', { name: 'Save API key' }));
  await user.click(screen.getByRole('button', { name: '应用' }));

  expect(saveAiProviderSecretMock).toHaveBeenCalledWith('openai', 'sk-test-secret');
  expect(JSON.stringify(saveAppSettingsMock.mock.calls.at(-1)?.[0])).not.toContain('sk-test-secret');
});
```

Add mocks for `saveAiProviderSecret`, `deleteAiProviderSecret`, `getAiProviderSecretStatus`, `requestAiProviderJson` in the existing `vi.mock('../workspace-api')` block.

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx -t "AI provider manager"
```

Expected: FAIL because the current AI settings section still shows the old Accounts/Models layout.

- [ ] **Step 3: Extract AI settings subcomponents inside settings dialog**

In `components/workspace/workspace-settings-dialog.tsx`, replace the current `AiSettingsSection` body with these local subcomponents:

```ts
function AiSettingsSection(...) {
  const providerSettings = settings.ai.providers;
  const [selectedProviderId, setSelectedProviderId] = React.useState(
    providerSettings.providers[0]?.id ?? '',
  );
  const selectedProvider =
    providerSettings.providers.find((provider) => provider.id === selectedProviderId) ??
    providerSettings.providers[0] ??
    null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] gap-0">
      <AiProviderList
        providers={providerSettings.providers}
        selectedProviderId={selectedProvider?.id ?? null}
        onSelectProvider={setSelectedProviderId}
      />
      {selectedProvider ? (
        <AiProviderDetail
          provider={selectedProvider}
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      ) : null}
    </div>
  );
}
```

Because this file is already large, keep the first implementation as local functions but put a follow-up note in the task summary if the file exceeds maintainable size. Do not introduce a separate design system in this task.

- [ ] **Step 4: Implement API key modal**

Inside `workspace-settings-dialog.tsx`, add a local modal state:

```ts
const [secretDraft, setSecretDraft] = React.useState('');
const [secretProviderId, setSecretProviderId] = React.useState<string | null>(null);
```

The modal must:

- Render password input with label `API key`.
- Call `saveAiProviderSecret(secretProviderId, secretDraft)`.
- Clear `secretDraft` after save or cancel.
- Update selected provider `secretStatus` from returned status.
- Never store `secretDraft` in `settings`.

- [ ] **Step 5: Implement model controls**

For each provider model row render:

```tsx
<button
  aria-pressed={model.enabled}
  type="button"
  onClick={() => toggleModelEnabled(provider.id, model.id)}
>
  {model.enabled ? 'Enabled' : 'Disabled'}
</button>
<span>{model.name}</span>
<span>{model.capabilities.join(' / ')}</span>
```

Add provider default model select with label `Default model`.

- [ ] **Step 6: Implement metadata save behavior**

When applying settings, call `stripAiProviderSecrets` for each provider before `saveAppSettings(settings)`:

```ts
const safeSettings = {
  ...settings,
  ai: {
    ...settings.ai,
    providers: {
      ...settings.ai.providers,
      providers: settings.ai.providers.providers.map(stripAiProviderSecrets),
    },
  },
};
```

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx -t "AI provider"
```

Expected: PASS.

- [ ] **Step 8: Commit checkpoint**

```bash
git add components/workspace/workspace-settings-dialog.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat(ai): 实现 AI provider 设置面板"
```

## Task 6: Provider Chat Adapters And Right AI Panel Read-Only Chat

**Files:**
- Create: `components/workspace/ai-provider/chat-adapters.ts`
- Test: `components/workspace/ai-provider/__tests__/chat-adapters.test.ts`
- Modify: `components/workspace/ai-panel/ai-panel-content.tsx`
- Test: `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`
- Modify: `src-tauri/src/agent_runtime.rs`
- Test: `src-tauri/src/agent_runtime.rs`

- [ ] **Step 1: Write failing chat adapter tests**

Create `components/workspace/ai-provider/__tests__/chat-adapters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  buildProviderChatRequest,
  parseProviderStreamChunk,
} from '../chat-adapters';

describe('AI provider chat adapters', () => {
  it('builds OpenAI-compatible chat request without API key', () => {
    const request = buildProviderChatRequest({
      messages: [
        { content: 'System', role: 'system' },
        { content: 'Hello', role: 'user' },
      ],
      modelId: 'gpt-5.4',
      provider: {
        apiStyle: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-5.4',
        enabled: true,
        id: 'openai',
        models: [],
        name: 'OpenAI',
        secretStatus: 'configured',
        type: 'openai',
      },
      stream: true,
    });

    expect(request).toEqual({
      body: JSON.stringify({
        messages: [
          { content: 'System', role: 'system' },
          { content: 'Hello', role: 'user' },
        ],
        model: 'gpt-5.4',
        stream: true,
      }),
      headers: { 'content-type': 'application/json' },
      providerId: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
    });
  });

  it('parses OpenAI-compatible stream deltas', () => {
    expect(
      parseProviderStreamChunk(
        'openai-compatible',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\\n\\n',
      ),
    ).toEqual([{ contentDelta: 'Hi', done: false }]);
  });
});
```

- [ ] **Step 2: Write failing AI panel test**

Add to `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`:

```ts
it('sends read-only chat through the configured provider runtime', async () => {
  const user = userEvent.setup();
  mocks.readAppSettings.mockResolvedValue({
    ...defaultAppSettings,
    ai: {
      ...defaultAppSettings.ai,
      providers: {
        agentDefaultModelId: 'gpt-5.4',
        agentDefaultProviderId: 'openai',
        defaultModelId: 'gpt-5.4',
        defaultProviderId: 'openai',
        inlineDefaultModelId: null,
        inlineDefaultProviderId: null,
        providers: [
          {
            apiStyle: 'openai-compatible',
            baseUrl: 'https://api.openai.com/v1',
            defaultModelId: 'gpt-5.4',
            enabled: true,
            id: 'openai',
            models: [{ capabilities: ['text'], enabled: true, id: 'gpt-5.4', name: 'GPT-5.4' }],
            name: 'OpenAI',
            secretStatus: 'configured',
            type: 'openai',
          },
        ],
      },
    },
  });
  mocks.requestAiChatStream.mockImplementation(async (_request, onEvent) => {
    onEvent({ chunk: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\\n\\n', type: 'chunk' });
    onEvent({ status: 200, type: 'done' });
    return { body: null, status: 200 };
  });

  render(<AiPanelContent {...defaultProps} />);

  await user.type(await screen.findByPlaceholderText('向 AI 询问当前工作区...'), '你好');
  await user.click(screen.getByRole('button', { name: '发送' }));

  expect(await screen.findByText('Hello')).toBeTruthy();
  expect(mocks.requestAiChatStream).toHaveBeenCalledWith(
    expect.objectContaining({ providerId: 'openai' }),
    expect.any(Function),
  );
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/chat-adapters.test.ts components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx -t "provider runtime|chat adapters"
```

Expected: FAIL because provider chat adapter and AI panel integration do not exist.

- [ ] **Step 4: Implement chat adapter**

Create `components/workspace/ai-provider/chat-adapters.ts`:

```ts
import type { AiChatRequest } from '@/components/workspace/workspace-api';

import type { AiProviderApiStyle, AiProviderConfig } from './provider-types';

export interface ProviderChatMessage {
  content: string;
  role: 'assistant' | 'system' | 'user';
}

export interface ProviderStreamDelta {
  contentDelta?: string;
  done: boolean;
  error?: string;
}

export function buildProviderChatRequest({
  messages,
  modelId,
  provider,
  stream,
}: {
  messages: ProviderChatMessage[];
  modelId: string;
  provider: AiProviderConfig;
  stream: boolean;
}): AiChatRequest {
  if (provider.apiStyle === 'anthropic') {
    const system = messages.find((message) => message.role === 'system')?.content;
    const nonSystemMessages = messages.filter((message) => message.role !== 'system');

    return {
      body: JSON.stringify({
        max_tokens: 4096,
        messages: nonSystemMessages,
        model: modelId,
        ...(stream ? { stream: true } : {}),
        ...(system ? { system } : {}),
      }),
      headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      providerId: provider.id,
      url: joinApiUrl(provider.baseUrl, '/messages'),
    };
  }

  const responsePath = provider.apiStyle === 'openai-responses' ? '/responses' : '/chat/completions';
  const body = provider.apiStyle === 'openai-responses'
    ? {
        input: messages.map((message) => ({
          content: [{ text: message.content, type: 'input_text' }],
          role: message.role === 'assistant' ? 'assistant' : 'user',
        })),
        model: modelId,
        stream,
      }
    : {
        messages,
        model: modelId,
        stream,
      };

  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    providerId: provider.id,
    url: joinApiUrl(provider.baseUrl, responsePath),
  };
}

export function parseProviderStreamChunk(
  apiStyle: AiProviderApiStyle,
  chunk: string,
): ProviderStreamDelta[] {
  return chunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter(Boolean)
    .flatMap((payload) => {
      if (payload === '[DONE]') return [{ done: true }];

      try {
        const parsed = JSON.parse(payload) as unknown;
        return [parseProviderStreamPayload(apiStyle, parsed)];
      } catch {
        return [];
      }
    });
}

function parseProviderStreamPayload(
  apiStyle: AiProviderApiStyle,
  payload: unknown,
): ProviderStreamDelta {
  if (!payload || typeof payload !== 'object') return { done: false };
  const record = payload as Record<string, unknown>;

  if (apiStyle === 'anthropic') {
    const delta = record.delta as Record<string, unknown> | undefined;
    return {
      contentDelta: typeof delta?.text === 'string' ? delta.text : undefined,
      done: record.type === 'message_stop',
    };
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const delta = firstChoice?.delta as Record<string, unknown> | undefined;

  return {
    contentDelta: typeof delta?.content === 'string' ? delta.content : undefined,
    done: firstChoice?.finish_reason === 'stop',
  };
}

function joinApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
}
```

- [ ] **Step 5: Integrate provider runtime into AI panel**

Modify `components/workspace/ai-panel/ai-panel-content.tsx`:

1. Import:

```ts
import {
  buildProviderChatRequest,
  parseProviderStreamChunk,
  type ProviderChatMessage,
} from '@/components/workspace/ai-provider/chat-adapters';
import { resolveAgentModelSelection } from '@/components/workspace/ai-provider/provider-settings';
import { requestAiChatStream } from '@/components/workspace/workspace-api';
```

2. Resolve provider selection:

```ts
const providerSelection = resolveAgentModelSelection(appSettings.ai.providers);
const providerReady =
  Boolean(providerSelection.provider) &&
  Boolean(providerSelection.model);
```

3. Make `canSend` true when `profileReady || providerReady`.

4. In `submitPrompt`, before fake runtime `startAiSession`, route provider chat:

```ts
if (providerSelection.provider && providerSelection.model) {
  const context = buildAiContextPack({ currentDocument, documentPanelData, intent, workspaceRootPath });
  const messages: ProviderChatMessage[] = [
    { role: 'system', content: buildProviderSystemPrompt() },
    { role: 'user', content: buildProviderContextPrompt(context, trimmed) },
  ];
  let assistantText = '';
  const assistantMessageId = `assistant-${Date.now()}`;

  dispatch({ content: trimmed, id: userMessageId, type: 'userMessageSubmitted' });
  dispatch({
    event: {
      delta: '',
      messageId: assistantMessageId,
      sessionId: state.session?.sessionId ?? 'provider-session',
      type: 'messageDelta',
    },
    type: 'runtimeEventReceived',
  });

  await requestAiChatStream(
    buildProviderChatRequest({
      messages,
      modelId: providerSelection.model.id,
      provider: providerSelection.provider,
      stream: true,
    }),
    (event) => {
      if (event.type === 'chunk') {
        for (const delta of parseProviderStreamChunk(providerSelection.provider.apiStyle, event.chunk)) {
          if (delta.contentDelta) {
            assistantText += delta.contentDelta;
            dispatch({
              event: {
                delta: assistantText,
                messageId: assistantMessageId,
                sessionId: 'provider-session',
                type: 'messageDelta',
              },
              type: 'runtimeEventReceived',
            });
          }
        }
      }
    },
  );
  dispatch({
    event: { messageId: assistantMessageId, sessionId: 'provider-session', type: 'messageCompleted' },
    type: 'runtimeEventReceived',
  });
  setPrompt('');
  return;
}
```

5. Add helpers:

```ts
function buildProviderSystemPrompt() {
  return [
    'You are Refinex Wiki AI, a local-first Markdown knowledge-base assistant.',
    'Use only the current Markdown document and workspace context provided in this turn.',
    "Reply in the user's language unless the user asks otherwise.",
    'Do not claim to have read files, searched the web, or changed the document unless the runtime provided that capability.',
    'For edit requests, provide a clear proposed edit in Markdown. Do not imply it has been applied.',
  ].join('\n');
}

function buildProviderContextPrompt(context: AiContextPack, prompt: string) {
  return [
    'Current workspace context:',
    `Workspace root: ${context.workspaceRootPath}`,
    context.document
      ? [
          `Document path: ${context.document.path}`,
          `Document title: ${context.document.title}`,
          `Document dirty: ${context.document.dirty ? 'yes' : 'no'}`,
          'Markdown:',
          context.document.markdown,
        ].join('\n')
      : 'No active document.',
    '',
    `User request:\n${prompt}`,
  ].join('\n');
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider/__tests__/chat-adapters.test.ts components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint**

```bash
git add components/workspace/ai-provider/chat-adapters.ts components/workspace/ai-provider/__tests__/chat-adapters.test.ts components/workspace/ai-panel/ai-panel-content.tsx components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx
git commit -m "feat(ai): 接入 provider 只读对话运行时"
```

## Task 7: Documentation, Full Verification, And Visual QA

**Files:**
- Modify: `docs/config/reference.md`
- Modify: `docs/README.md`
- Test/verification only.

- [ ] **Step 1: Update docs**

Ensure `docs/config/reference.md` includes:

```md
AI provider metadata is stored in `ai.providers[]`. API keys are stored in the system credential store through Tauri commands and must not appear in settings JSON. The right AI panel uses `agentDefaultProviderId` and `agentDefaultModelId` for read-only chat. Local Codex and Claude account detection remains separate from provider API configuration.
```

Ensure `docs/README.md` contains:

```md
- `docs/superpowers/plans/2026-06-19-ai-provider-runtime-secret-store.md`: [open](superpowers/plans/2026-06-19-ai-provider-runtime-secret-store.md)
```

- [ ] **Step 2: Run focused test suites**

Run:

```bash
pnpm test:run -- components/workspace/ai-provider components/workspace/ai-panel components/workspace/__tests__/workspace-api.test.ts components/workspace/__tests__/workspace-layout.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml ai_secret::tests ai_http::tests settings::tests agent_runtime::tests
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test:run
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
pnpm build:desktop:web
pnpm harness:check
git diff --check
```

Expected:

- `pnpm test:run`: all tests pass.
- `cargo test --manifest-path src-tauri/Cargo.toml`: all tests pass.
- `pnpm lint`: 0 errors. Existing warnings must be reported if still present.
- `pnpm build:desktop:web`: completes Next static export.
- `pnpm harness:check`: 0 errors / 0 warnings.
- `git diff --check`: no whitespace errors.

- [ ] **Step 4: Run visual QA**

Start dev server:

```bash
pnpm dev
```

Open the app and verify:

1. Settings opens.
2. AI tab shows Provider list, Connection section, Models section, Defaults section, and Assistant Accounts section.
3. API key modal uses password input and does not show saved secret.
4. Right AI panel shows configured provider/model label.
5. Empty provider state has a clear settings call-to-action.
6. No visible text overlaps at 1280px desktop and 390px mobile viewport widths.

Use Playwright CLI if available:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open http://localhost:3000
"$PWCLI" snapshot
"$PWCLI" screenshot --filename output/playwright/ai-provider-settings.png
```

Delete `.playwright-cli/` and `output/` before final delivery unless screenshots are intentionally kept as artifacts.

- [ ] **Step 5: Commit final docs and verification updates**

```bash
git add docs/config/reference.md docs/README.md docs/superpowers/plans/2026-06-19-ai-provider-runtime-secret-store.md
git commit -m "docs(ai): 记录 provider runtime 实施计划"
```

## Self-Review Checklist

- Spec coverage:
  - Provider catalog: Task 1.
  - No secrets in settings: Task 1 and Task 2.
  - System secret store: Task 3.
  - Native HTTP transport: Task 4.
  - Provider settings UI: Task 5.
  - Right AI panel real read-only chat: Task 6.
  - Docs and verification: Task 7.
- License boundary: plan states not to copy Markra AGPL source.
- Security boundary: no API key in JSON/localStorage/logs/tests; no Tauri shell permission changes.
- Type consistency:
  - TypeScript uses `AiProviderSettings.providers`.
  - Rust uses `AiSettings.providers`.
  - Secret status values are `configured`, `missing`, `notRequired` in settings and `configured`, `missing` in command status.
- Known implementation risk:
  - `keyring` platform behavior can fail on Linux without Secret Service. The implementation must keep unit tests backend-agnostic and report platform verification separately.
