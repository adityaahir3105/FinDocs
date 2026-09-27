import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import sharp from 'sharp';
import { config } from '../config';
import { extractionSchema, Extraction, Confidence, ExtractedField } from './schema';
import { FIELD_DEFS } from './fields';
import { canonicalize, comparisonKey, Issue } from './normalize';

// Largest long edge the current Claude vision models read at full resolution.
const MAX_IMAGE_EDGE = 2576;

const SYSTEM_PROMPT = `You transcribe photographed Indian road-transport paperwork for a logistics company's records. The records feed accounting, so a wrong digit is far worse than a field marked unreadable.

A photo usually shows one or both of:
- a lorry receipt (LR / consignment note / builty) from a transport contractor: LR number, date, truck number, consignor, consignee, from/to, material, gross/tare/net weight (usually MT with 3 decimals), freight.
- a port or customs gate pass (e.g. "Gate Pass Import" at Deendayal Port / Kandla) from a clearing agent: serial number, date, shift, importer, goods, truck number, bill of entry, wharfage entry, vessel, G.Wt/T.Wt/N.Wt (usually kg).

The paper may be rotated, folded, overlapping, or photographed at an angle, and most values are handwritten.

Rules:
- Transcribe what is written; do not correct, complete, or compute anything. If net weight is blank, leave it null even if gross and tare are present. Do not copy a value from one document into the other.
- Keep numbers exactly as written, including the decimal point and every digit.
- Dates in these documents are day/month/year.
- Handwriting in the wrong row still belongs to the field it was written for; use the printed labels and position to decide, and mention the misplacement in reading_notes.
- When a character could be read two ways (1/7, 0/6, 5/6, 3/8, 4/9, B/8, S/5, O/0), lower the confidence and give both readings in reading_notes.
- Stamps, signatures and printed form text that is not a filled-in value are not field values.`;

export class ExtractionError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.anthropic.apiKey) {
    throw new ExtractionError('ANTHROPIC_API_KEY is not configured on the server', 503);
  }
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

/** Applies EXIF orientation plus an optional manual rotation, and fits the image within the model's full-resolution size. */
export async function prepareImage(input: Buffer, rotateDegrees = 0): Promise<Buffer> {
  try {
    const upright = await sharp(input).rotate().toBuffer();
    return await sharp(upright)
      .rotate(rotateDegrees)
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    throw new ExtractionError('Could not read the image. Upload a JPG, PNG or WEBP photo.', 400);
  }
}

async function extractOnce(image: Buffer): Promise<Extraction> {
  const response = await getClient().beta.messages.parse({
    model: config.anthropic.model,
    max_tokens: 16000,
    ...(config.anthropic.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: betaZodOutputFormat(extractionSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } },
          { type: 'text', text: 'Transcribe the lorry receipt and gate pass in this photo.' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new ExtractionError('The model declined to read this image.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractionError('The model response was cut off. Please try again.');
  }
  if (!response.parsed_output) {
    throw new ExtractionError('The model did not return a valid result. Please try again.');
  }
  return response.parsed_output;
}

export interface FieldResult {
  value: string;
  raw: string | null;
  confidence: Confidence;
  /** Distinct readings when independent passes disagreed (first entry is `value`). */
  alternatives: string[];
}

export interface ExtractionResult {
  fields: Record<string, FieldResult>;
  documents: { lorryReceipt: boolean; gatePass: boolean };
  readingNotes: string[];
  passes: number;
  model: string;
  reviewIssues: Issue[];
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function sourceField(extraction: Extraction, section: 'lr' | 'gp', source: string): ExtractedField {
  const doc = (section === 'lr' ? extraction.lorry_receipt : extraction.gate_pass) as unknown as Record<string, ExtractedField>;
  return doc[source] ?? { value: null, confidence: 'low' };
}

/**
 * Merges independent readings of the same image. Where passes disagree the
 * field is flagged for review with every reading offered, instead of silently
 * picking one.
 */
export function mergePasses(passes: Extraction[]): Omit<ExtractionResult, 'model'> {
  const fields: Record<string, FieldResult> = {};
  const reviewIssues: Issue[] = [];

  for (const def of FIELD_DEFS) {
    const readings = passes.map((p) => sourceField(p, def.section, def.source as string));
    const best = readings.reduce((a, b) => (CONFIDENCE_RANK[b.confidence] > CONFIDENCE_RANK[a.confidence] ? b : a));
    const lowest = readings.reduce((a, b) => (CONFIDENCE_RANK[b.confidence] < CONFIDENCE_RANK[a.confidence] ? b : a));

    const alternatives: string[] = [];
    const seen = new Set<string>();
    for (const r of [best, ...readings]) {
      const key = comparisonKey(def, r.value);
      if (seen.has(key)) continue;
      seen.add(key);
      alternatives.push(canonicalize(def, r.value ?? ''));
    }

    const value = canonicalize(def, best.value ?? '');
    fields[def.key] = { value, raw: best.value, confidence: lowest.confidence, alternatives: alternatives.length > 1 ? alternatives : [] };

    if (alternatives.length > 1) {
      reviewIssues.push({
        id: `review:${def.key}`,
        severity: 'error',
        fields: [def.key],
        message: `${def.label}: independent readings disagree (${alternatives.map((a) => (a ? `"${a}"` : 'blank')).join(' vs ')}) — check the photo`,
      });
    } else if (value && lowest.confidence !== 'high') {
      reviewIssues.push({
        id: `review:${def.key}`,
        severity: lowest.confidence === 'low' ? 'error' : 'warning',
        fields: [def.key],
        message: `${def.label}: ${lowest.confidence} confidence reading "${value}" — check the photo`,
      });
    }
  }

  const notes = new Set<string>();
  passes.forEach((p) => p.reading_notes.forEach((n) => notes.add(n.trim())));

  return {
    fields,
    documents: {
      lorryReceipt: passes.some((p) => p.lorry_receipt.present),
      gatePass: passes.some((p) => p.gate_pass.present),
    },
    readingNotes: [...notes].filter(Boolean),
    passes: passes.length,
    reviewIssues,
  };
}

export async function extractConsignment(image: Buffer, rotateDegrees = 0): Promise<ExtractionResult> {
  const prepared = await prepareImage(image, rotateDegrees);
  const passCount = Math.max(1, config.anthropic.extractionPasses);

  let passes: Extraction[];
  try {
    passes = await Promise.all(Array.from({ length: passCount }, () => extractOnce(prepared)));
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ExtractionError('The server ANTHROPIC_API_KEY was rejected', 503);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractionError('The AI service is busy. Please wait a minute and try again.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', error.status, error.message);
      throw new ExtractionError('The AI service returned an error. Please try again.');
    }
    throw error;
  }

  return { ...mergePasses(passes), model: config.anthropic.model };
}
