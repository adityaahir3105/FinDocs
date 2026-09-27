import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  createPartFromBase64,
} from '@google/genai';
import { z } from 'zod';
import { config } from '../config';
import { extractionSchema, Extraction } from './schema';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt';
import { ExtractionError } from './errors';

// Gemini accepts standard JSON Schema via responseJsonSchema; drop the draft marker.
const { $schema: _draft, ...RESPONSE_SCHEMA } = z.toJSONSchema(extractionSchema) as Record<string, unknown>;

const MEDIA_RESOLUTION: Record<string, PartMediaResolutionLevel> = {
  high: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  ultra_high: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
};

const THINKING_LEVEL: Record<string, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

type GenAIClient = Pick<GoogleGenAI, 'models'>;

let client: GenAIClient | null = null;
function getClient(): GenAIClient {
  if (!config.gemini.project) {
    throw new ExtractionError('GOOGLE_CLOUD_PROJECT is not configured on the server (needed for Gemini on Vertex AI)', 503);
  }
  // Credentials come from Application Default Credentials: `gcloud auth application-default login`
  // locally, or GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key in production.
  client ??= new GoogleGenAI({ vertexai: true, project: config.gemini.project, location: config.gemini.location });
  return client;
}

/** Reads a prepared JPEG with Gemini on Vertex AI. `genai` is injectable for tests. */
export async function extractWithGemini(image: Buffer, genai: GenAIClient = getClient()): Promise<Extraction> {
  let response;
  try {
    response = await genai.models.generateContent({
      model: config.gemini.model,
      contents: [
        {
          role: 'user',
          parts: [
            createPartFromBase64(
              image.toString('base64'),
              'image/jpeg',
              MEDIA_RESOLUTION[config.gemini.mediaResolution] ?? PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH
            ),
            { text: USER_PROMPT },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL[config.gemini.thinkingLevel] ?? ThinkingLevel.MEDIUM },
        maxOutputTokens: 16000,
      },
    });
  } catch (error: any) {
    if (error?.status === 401 || error?.status === 403) {
      if (/BILLING_DISABLED/i.test(error?.message || '') || /billing/i.test(error?.message || '')) {
        throw new ExtractionError(
          'Vertex AI requires billing to be enabled on your Google Cloud project. Please link a billing account in GCP Console (service account needs "Vertex AI User" role too).',
          503
        );
      }
      throw new ExtractionError(
        'Vertex AI refused the request. Check the service account has the "Vertex AI User" role and the Vertex AI API and billing are enabled.',
        503
      );
    }
    if (error?.status === 404) {
      throw new ExtractionError(`Gemini model "${config.gemini.model}" was not found in location "${config.gemini.location}".`, 503);
    }
    if (error?.status === 429) {
      throw new ExtractionError('The AI service is busy. Please wait a minute and try again.', 429);
    }
    if (/default credentials|Could not load the default credentials|ENOENT.*vertex-key\.json/i.test(error?.message || '')) {
      throw new ExtractionError('Google Cloud credentials are not configured correctly. Check GOOGLE_APPLICATION_CREDENTIALS.', 503);
    }
    throw new ExtractionError('The Gemini service returned an error. Please try again.', 502);
  }

  const blocked = response.promptFeedback?.blockReason;
  if (blocked) {
    throw new ExtractionError(`Gemini declined to read this image (${blocked}).`);
  }
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) {
    throw new ExtractionError('The Gemini response was cut off. Please try again.');
  }
  if (finish && finish !== FinishReason.STOP) {
    throw new ExtractionError(`Gemini stopped early (${finish}). Please try again.`);
  }

  let json: unknown;
  try {
    json = JSON.parse(response.text ?? '');
  } catch {
    throw new ExtractionError('Gemini did not return valid JSON. Please try again.');
  }
  const parsed = extractionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExtractionError('Gemini returned an incomplete result. Please try again.');
  }
  return parsed.data;
}
