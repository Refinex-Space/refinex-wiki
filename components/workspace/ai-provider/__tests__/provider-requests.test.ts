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
