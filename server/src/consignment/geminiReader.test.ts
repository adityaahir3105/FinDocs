import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, FinishReason, PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';
import { extractWithGemini } from './geminiReader';
import { ExtractionError } from './errors';
import { parseReaders } from '../config';
import { FIELD_DEFS } from './fields';

const field = (value: string | null) => ({ value, confidence: 'high' });

function validOutput() {
  const lr: Record<string, unknown> = { present: true };
  const gp: Record<string, unknown> = { present: true };
  for (const def of FIELD_DEFS) (def.section === 'lr' ? lr : gp)[def.source as string] = field(null);
  lr.lr_number = field('650');
  lr.net_weight = field('47.220');
  return { lorry_receipt: lr, gate_pass: gp, reading_notes: [] };
}

function fakeClient(reply: () => unknown) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      models: {
        generateContent: async (params: unknown) => {
          calls.push(params);
          return reply();
        },
      },
    } as any,
  };
}

const IMAGE = Buffer.from('fake-jpeg');

test('gemini: sends image at high resolution with JSON schema and parses the reply', async () => {
  const { client, calls } = fakeClient(() => ({
    text: JSON.stringify(validOutput()),
    candidates: [{ finishReason: FinishReason.STOP }],
  }));
  const result = await extractWithGemini(IMAGE, client);
  assert.equal(result.lorry_receipt.lr_number.value, '650');

  const req = calls[0];
  assert.equal(req.model, 'gemini-3.8-flash');
  const [imagePart, textPart] = req.contents[0].parts;
  assert.equal(imagePart.inlineData.mimeType, 'image/jpeg');
  assert.equal(imagePart.inlineData.data, IMAGE.toString('base64'));
  assert.equal(imagePart.mediaResolution.level, PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH);
  assert.match(textPart.text, /Transcribe/);
  assert.equal(req.config.responseMimeType, 'application/json');
  assert.equal(req.config.responseJsonSchema.$schema, undefined);
  assert.ok(JSON.stringify(req.config.responseJsonSchema).includes('lr_number'));
  assert.equal(req.config.thinkingConfig.thinkingLevel, ThinkingLevel.MEDIUM);
  assert.match(req.config.systemInstruction, /wrong digit/);
});

test('gemini: never returns a partial or unsafe result', async () => {
  const cases: [string, () => unknown, RegExp][] = [
    ['cut off', () => ({ text: '{"lorry', candidates: [{ finishReason: FinishReason.MAX_TOKENS }] }), /cut off/],
    ['safety', () => ({ text: '', candidates: [{ finishReason: FinishReason.SAFETY }] }), /stopped early \(SAFETY\)/],
    ['blocked', () => ({ promptFeedback: { blockReason: 'OTHER' }, candidates: [] }), /declined/],
    ['bad json', () => ({ text: 'not json', candidates: [{ finishReason: FinishReason.STOP }] }), /valid JSON/],
    ['wrong shape', () => ({ text: '{"lorry_receipt":{}}', candidates: [{ finishReason: FinishReason.STOP }] }), /incomplete/],
  ];
  for (const [name, reply, message] of cases) {
    const { client } = fakeClient(reply);
    await assert.rejects(extractWithGemini(IMAGE, client), (e: unknown) => e instanceof ExtractionError && message.test(e.message), name);
  }
});

test('gemini: maps Vertex AI errors to clear messages', async () => {
  const cases: [number, RegExp, number][] = [
    [403, /Vertex AI User/, 503],
    [404, /not found in location "global"/, 503],
    [429, /busy/, 429],
    [500, /returned an error/, 502],
  ];
  for (const [status, message, httpStatus] of cases) {
    const { client } = fakeClient(() => {
      throw new ApiError({ message: 'x', status });
    });
    await assert.rejects(
      extractWithGemini(IMAGE, client),
      (e: unknown) => e instanceof ExtractionError && message.test(e.message) && e.status === httpStatus,
      String(status)
    );
  }
});

test('reader configuration', () => {
  assert.deepEqual(parseReaders(undefined, undefined), ['claude', 'claude']);
  assert.deepEqual(parseReaders('', '1'), ['claude']);
  assert.deepEqual(parseReaders('Claude, gemini', '5'), ['claude', 'gemini']);
  assert.deepEqual(parseReaders('gemini,gemini', undefined), ['gemini', 'gemini']);
  assert.throws(() => parseReaders('claude,gpt', undefined), /CONSIGNMENT_READERS/);
});
