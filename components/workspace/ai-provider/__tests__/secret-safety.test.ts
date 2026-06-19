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
