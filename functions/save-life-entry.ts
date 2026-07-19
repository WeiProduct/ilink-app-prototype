import { createClient } from 'npm:@insforge/sdk';

const allowedOrigins = new Set([
  'https://weiproduct.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const audioFormats = new Set([
  'flac',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'm4a',
  'ogg',
  'wav',
  'webm',
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin)
      ? origin
      : 'https://weiproduct.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  });
}

function text(value: unknown, maximum: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maximum);
}

function optionalText(value: unknown, maximum: number) {
  const normalized = text(value, maximum);
  return normalized || null;
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export default async function saveLifeEntry(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestTag = crypto.randomUUID();
  try {
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader?.replace(/^Bearer\s+/i, '') || '';
    if (!userToken) return json(req, { error: 'Unauthorized' }, 401);

    const client = createClient({
      baseUrl: Deno.env.get('INSFORGE_BASE_URL') || '',
      accessToken: userToken,
    });
    const { data: userData, error: userError } = await client.auth.getCurrentUser();
    const user = userData?.user;
    if (userError || !user?.id) return json(req, { error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json(req, { error: 'Invalid request body' }, 400);
    }

    const title = text(body.title, 240);
    const transcript = text(body.transcript, 20_000);
    if (!title || !transcript) {
      return json(req, { error: 'Title and transcript are required' }, 400);
    }

    const row: Record<string, unknown> = {
      user_id: user.id,
      title,
      transcript,
      status: 'draft',
    };

    const summary = optionalText(body.ai_summary, 1000);
    if (summary) {
      row.ai_summary = summary;
      row.summary_model = optionalText(body.summary_model, 120) || 'unknown';
      row.summary_request_id = optionalText(body.summary_request_id, 240);
      row.summary_generated_at = text(body.summary_generated_at, 80)
        || new Date().toISOString();
      row.summary_version = Math.max(1, Math.trunc(finiteNumber(body.summary_version) || 1));
    }

    const audioKey = optionalText(body.audio_key, 1024);
    if (audioKey) {
      const audioFormat = text(body.audio_format, 12).toLowerCase();
      const duration = finiteNumber(body.audio_duration_seconds);
      if (
        !audioKey.startsWith(`${user.id}/`)
        || !audioFormats.has(audioFormat)
        || duration === null
        || duration <= 0
        || duration > 900.5
      ) {
        return json(req, { error: 'Invalid audio metadata' }, 400);
      }
      row.audio_key = audioKey;
      row.audio_url = optionalText(body.audio_url, 2048);
      row.audio_format = audioFormat;
      row.audio_duration_seconds = duration;
      row.transcription_model = optionalText(body.transcription_model, 120);
      row.transcription_request_id = optionalText(body.transcription_request_id, 240);
      const transcriptionCost = finiteNumber(body.transcription_cost_usd);
      row.transcription_cost_usd = transcriptionCost !== null && transcriptionCost >= 0
        ? transcriptionCost
        : null;
    }

    const { data, error } = await client.database
      .from('life_entries')
      .insert([row])
      .select('id');
    const entryId = data?.[0]?.id;
    if (error || !entryId) {
      console.error('[save-life-entry] database insert failed', {
        requestTag,
        userId: user.id,
        code: error?.code,
        message: error?.message,
      });
      return json(req, {
        error: 'Life entry could not be saved',
        code: error?.code || 'NO_ROW_RETURNED',
      }, 422);
    }

    console.log('[save-life-entry] entry saved', {
      requestTag,
      userId: user.id,
      entryId,
      hasAudio: Boolean(audioKey),
      hasSummary: Boolean(summary),
    });
    return json(req, { id: entryId }, 201);
  } catch (error) {
    console.error('[save-life-entry] unexpected failure', {
      requestTag,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return json(req, { error: 'Unexpected save failure' }, 500);
  }
}
