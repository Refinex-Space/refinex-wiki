import { describe, expect, it } from 'vitest';

import { buildAiChatRequest, parseAiChatText } from '../chat-adapters';

const context = {
  document: {
    contentHash: 'hash',
    dirty: false,
    markdown: '# 指南\n\n正文',
    modifiedAt: null,
    path: '/repo/guide.md',
    title: '指南',
  },
  intent: 'chat' as const,
  workspaceRootPath: '/repo',
};

describe('AI chat adapters', () => {
  it('builds OpenAI Responses requests without auth headers', () => {
    const request = buildAiChatRequest({
      context,
      model: {
        capabilities: ['text'],
        enabled: true,
        id: 'gpt-5.4',
        name: 'GPT-5.4',
      },
      prompt: '总结',
      provider: {
        apiStyle: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-5.4',
        enabled: true,
        id: 'openai',
        models: [],
        name: 'OpenAI',
        secretStatus: 'configured',
        type: 'openai',
      },
    });

    expect(request).toEqual(
      expect.objectContaining({
        headers: {},
        providerId: 'openai',
        url: 'https://api.openai.com/v1/responses',
      }),
    );
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({ model: 'gpt-5.4', stream: false }),
    );
    expect(request.body).toContain('# 指南');
  });

  it('parses common provider response bodies', () => {
    expect(parseAiChatText({ output_text: 'OpenAI text' })).toBe('OpenAI text');
    expect(
      parseAiChatText({
        choices: [{ message: { content: 'Chat text' } }],
      }),
    ).toBe('Chat text');
    expect(parseAiChatText({ content: [{ text: 'Claude text' }] })).toBe(
      'Claude text',
    );
    expect(
      parseAiChatText({
        candidates: [{ content: { parts: [{ text: 'Gemini text' }] } }],
      }),
    ).toBe('Gemini text');
  });
});
