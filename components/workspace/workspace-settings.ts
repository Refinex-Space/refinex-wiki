import type {
  AiConfiguredProfile,
  AiSettings,
  AppSettings,
} from './workspace-types';
import {
  createDefaultAiProviderSettings,
  normalizeAiProviderSettings,
} from './ai-provider/provider-settings';

export const DEFAULT_AI_PROFILE: AiConfiguredProfile = {
  enabled: true,
  id: 'fake-echo',
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabledProfileId: DEFAULT_AI_PROFILE.id,
  profiles: [DEFAULT_AI_PROFILE],
  providers: createDefaultAiProviderSettings(),
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ai: DEFAULT_AI_SETTINGS,
  appearance: {
    pageWidthMode: 'wide',
  },
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
};

export function withDefaultAppSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    ai: withDefaultAiSettings(settings.ai),
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      ...settings.appearance,
    },
    storage: {
      ...DEFAULT_APP_SETTINGS.storage,
      ...settings.storage,
    },
  };
}

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

function withDefaultAiProfile(
  profile: Partial<AiConfiguredProfile>,
): AiConfiguredProfile {
  const base =
    profile.id === DEFAULT_AI_PROFILE.id ? DEFAULT_AI_PROFILE : undefined;

  return {
    enabled: profile.enabled ?? base?.enabled ?? false,
    id: profile.id ?? base?.id ?? '',
    isTestRuntime: profile.isTestRuntime ?? base?.isTestRuntime ?? false,
    kind: profile.kind ?? base?.kind ?? 'provider',
    label: profile.label ?? base?.label ?? '未命名模型',
    modelId: profile.modelId ?? base?.modelId ?? '',
    modelLabel: profile.modelLabel ?? base?.modelLabel ?? profile.modelId ?? '',
    providerId: profile.providerId ?? base?.providerId ?? '',
    providerLabel:
      profile.providerLabel ?? base?.providerLabel ?? profile.providerId ?? '',
  };
}
