import {
  OBJECT_TYPES,
  ROOM_TYPES,
  STYLE_TAGS,
  type DetectedObject,
  type ObjectType,
  type RoomType,
  type StyleTag,
} from '@/types/domain';
import type { VisionResult } from '@/lib/vision/provider';
import { quadFromBox } from '@/lib/geometry';

/**
 * Anthropic vision adapter. Server-side only — the API key never leaves here.
 *
 * Structured output is obtained through a tool definition rather than by asking
 * for JSON in prose. The model is then constrained to the schema, and this file
 * still validates every field before it reaches the app: enums are checked
 * against the domain unions, numbers are clamped, boxes are rejected if they
 * fall outside the frame, and the whole list is capped. Model output is treated
 * as untrusted input, because that is what it is.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';

/** Beyond this the room is over-annotated and the ranking stage has enough. */
const MAX_OBJECTS = 18;

const SYSTEM_PROMPT = `You are the perception stage of an interior decoration product.

Your only job is to report what is visible in a photograph of a room and where it is. You do not suggest products, decorating ideas, or improvements — a separate deterministic stage does that from your output.

Report every relevant object you can see, using normalised coordinates where (0,0) is the top-left of the image and (1,1) is the bottom-right.

Be rigorous about these points:
- Only report what is actually visible. Do not infer a sofa from a cushion or a window from a bright patch of wall.
- Set "occupied" to true when a surface already carries the thing it would usually be decorated with: a window that already has curtains, a wall that already has art on it, a floor that already has a rug.
- For walls, floors and windows, report the largest clear extent of that surface, not a tight crop of its centre.
- Confidence is your genuine certainty that the object is what you say it is. Use the full range; do not report everything at 0.9.
- If the image is not an interior space, return an empty objects array and roomType "other" with confidence 0.`;

const TOOL_SCHEMA = {
  name: 'report_room',
  description: 'Report the room type, style, and every object visible in the photograph.',
  input_schema: {
    type: 'object' as const,
    properties: {
      roomType: { type: 'string', enum: [...ROOM_TYPES] },
      roomTypeConfidence: { type: 'number', minimum: 0, maximum: 1 },
      styles: {
        type: 'array',
        items: { type: 'string', enum: [...STYLE_TAGS] },
        maxItems: 3,
        description: 'Decorating styles the room already leans towards, strongest first.',
      },
      objects: {
        type: 'array',
        maxItems: MAX_OBJECTS,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...OBJECT_TYPES] },
            x: { type: 'number', minimum: 0, maximum: 1 },
            y: { type: 'number', minimum: 0, maximum: 1 },
            width: { type: 'number', minimum: 0, maximum: 1 },
            height: { type: 'number', minimum: 0, maximum: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            occupied: {
              type: 'boolean',
              description: 'True if this surface already carries its usual decoration.',
            },
            dominantColor: { type: 'string', description: 'Hex colour, e.g. #d8d2c6.' },
            notes: { type: 'string', description: 'One short clause describing the object.' },
          },
          required: ['type', 'x', 'y', 'width', 'height', 'confidence'],
        },
      },
    },
    required: ['roomType', 'roomTypeConfidence', 'styles', 'objects'],
  },
};

export interface AnthropicVisionConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/* -- Validation ------------------------------------------------------------ */

function clamp01(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function toDetectedObject(raw: unknown, index: number): DetectedObject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const type = asEnum<ObjectType>(record.type, OBJECT_TYPES, 'decor');
  if (record.type !== type) return null; // Unknown label: drop rather than mislabel.

  const x = clamp01(record.x);
  const y = clamp01(record.y);
  // Never let a box run off the frame; downstream geometry assumes it does not.
  const width = Math.min(clamp01(record.width), 1 - x);
  const height = Math.min(clamp01(record.height), 1 - y);
  if (width < 0.01 || height < 0.01) return null;

  const boundingBox = { x, y, width, height };
  const isSurface = type === 'wall' || type === 'floor' || type === 'window' || type === 'ceiling';

  return {
    id: `obj_model_${index}`,
    type,
    boundingBox,
    // A flat quad from the box. The model reports axis-aligned extents, so any
    // perspective here would be invented rather than observed.
    ...(isSurface ? { surface: quadFromBox(boundingBox) } : {}),
    confidence: clamp01(record.confidence, 0.5),
    attributes: {
      coverage: Number((width * height).toFixed(3)),
      ...(typeof record.dominantColor === 'string' && /^#[0-9a-f]{6}$/i.test(record.dominantColor)
        ? { dominantColor: record.dominantColor }
        : {}),
      ...(typeof record.occupied === 'boolean' ? { occupied: record.occupied } : {}),
      ...(typeof record.notes === 'string' ? { notes: record.notes.slice(0, 200) } : {}),
    },
  };
}

function toVisionResult(input: unknown): Omit<VisionResult, 'lighting'> {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  const styles = Array.isArray(record.styles)
    ? record.styles
        .map((style) => asEnum<StyleTag>(style, STYLE_TAGS, 'contemporary'))
        .filter((style, index, all) => all.indexOf(style) === index)
        .slice(0, 3)
    : [];

  const objects = Array.isArray(record.objects)
    ? record.objects
        .slice(0, MAX_OBJECTS)
        .map(toDetectedObject)
        .filter((object): object is DetectedObject => object !== null)
    : [];

  return {
    roomType: asEnum<RoomType>(record.roomType, ROOM_TYPES, 'other'),
    roomTypeConfidence: clamp01(record.roomTypeConfidence),
    styles,
    objects,
  };
}

/* -- Call ------------------------------------------------------------------ */

export class AnthropicVisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AnthropicVisionError';
  }
}

/** Splits a `data:image/jpeg;base64,…` URL into the parts the API expects. */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new AnthropicVisionError('The image was not a supported base64 data URL.', 400, false);
  }
  return { mediaType: match[1], data: match[2] };
}

export async function analyseWithAnthropic(
  imageDataUrl: string,
  config: AnthropicVisionConfig,
  signal?: AbortSignal,
): Promise<Omit<VisionResult, 'lighting'>> {
  const { mediaType, data } = parseDataUrl(imageDataUrl);

  const response = await fetch(`${config.baseUrl ?? API_URL}`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCHEMA],
      // Force the schema: no prose path exists for the model to fall back to.
      tool_choice: { type: 'tool', name: TOOL_SCHEMA.name },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Report every object visible in this room.' },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new AnthropicVisionError(
      `The vision service returned ${response.status}.`,
      response.status,
      retryable,
    );
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };

  const toolUse = payload.content?.find(
    (block) => block.type === 'tool_use' && block.name === TOOL_SCHEMA.name,
  );

  if (!toolUse) {
    throw new AnthropicVisionError('The vision service returned no structured result.', 502, true);
  }

  return toVisionResult(toolUse.input);
}
