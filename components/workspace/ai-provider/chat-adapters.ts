import type { AiContextPack } from '../ai-panel/ai-types';
import type { AiChatRequest } from '../workspace-api';
import type { AiProviderConfig, AiProviderModel } from './provider-types';

export interface BuildAiChatRequestInput {
  context: AiContextPack;
  model: AiProviderModel;
  prompt: string;
  provider: AiProviderConfig;
}

export function buildAiChatRequest({
  context,
  model,
  prompt,
  provider,
}: BuildAiChatRequestInput): AiChatRequest {
  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(context, prompt);

  switch (provider.apiStyle) {
    case 'anthropic':
      return {
        body: JSON.stringify({
          max_tokens: 2048,
          messages: [{ content: userPrompt, role: 'user' }],
          model: model.id,
          system: systemPrompt,
        }),
        headers: {
          'anthropic-version': '2023-06-01',
        },
        providerId: provider.id,
        url: joinApiUrl(provider.baseUrl, '/messages'),
      };
    case 'google':
      return {
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userPrompt }],
              role: 'user',
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        }),
        headers: {},
        providerId: provider.id,
        url: joinApiUrl(
          provider.baseUrl,
          `/models/${encodeURIComponent(model.id)}:generateContent`,
        ),
      };
    case 'openai-responses':
      return {
        body: JSON.stringify({
          input: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: model.id,
          stream: false,
        }),
        headers: {},
        providerId: provider.id,
        url: joinApiUrl(provider.baseUrl, '/responses'),
      };
    case 'ollama':
    case 'openai':
    case 'openai-compatible':
      return {
        body: JSON.stringify({
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: model.id,
          stream: false,
        }),
        headers: readSafeCustomHeaders(provider.customHeaders),
        providerId: provider.id,
        url: joinApiUrl(provider.baseUrl, '/chat/completions'),
      };
  }
}

export function parseAiChatText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!isRecord(body)) return '';

  if (typeof body.output_text === 'string') return body.output_text;
  const responseOutput = readOpenAiResponsesOutput(body);
  if (responseOutput) return responseOutput;

  const chatChoice = readOpenAiChatChoice(body);
  if (chatChoice) return chatChoice;

  const anthropicText = readAnthropicText(body);
  if (anthropicText) return anthropicText;

  const googleText = readGoogleText(body);
  if (googleText) return googleText;

  if (typeof body.text === 'string') return body.text;

  return JSON.stringify(body, null, 2);
}

function buildSystemPrompt(context: AiContextPack) {
  return [
    'You are the Refinex Wiki AI assistant.',
    'Answer in the user language. Be concise and practical.',
    'Use the provided Markdown context when it is relevant.',
    `Intent: ${context.intent}`,
  ].join('\n');
}

function buildUserPrompt(context: AiContextPack, prompt: string) {
  const document = context.document;

  if (!document) return prompt;

  return [
    prompt,
    '',
    '<current-document>',
    `Path: ${document.path}`,
    `Title: ${document.title}`,
    `Dirty: ${document.dirty ? 'yes' : 'no'}`,
    '',
    document.markdown,
    '</current-document>',
  ].join('\n');
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

function readOpenAiResponsesOutput(body: Record<string, unknown>) {
  if (!Array.isArray(body.output)) return null;

  return body.output
    .filter(isRecord)
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter(isRecord)
    .map((item) => (typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
}

function readOpenAiChatChoice(body: Record<string, unknown>) {
  const choices = Array.isArray(body.choices) ? body.choices.filter(isRecord) : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice?.message) ? firstChoice.message : null;

  return typeof message?.content === 'string' ? message.content : null;
}

function readAnthropicText(body: Record<string, unknown>) {
  if (!Array.isArray(body.content)) return null;

  return body.content
    .filter(isRecord)
    .map((item) => (typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
}

function readGoogleText(body: Record<string, unknown>) {
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.filter(isRecord)
    : [];
  const firstCandidate = candidates[0];
  const content = isRecord(firstCandidate?.content)
    ? firstCandidate.content
    : null;
  const parts = Array.isArray(content?.parts) ? content.parts.filter(isRecord) : [];

  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function joinApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
