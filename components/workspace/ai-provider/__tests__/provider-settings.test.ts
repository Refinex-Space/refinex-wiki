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
