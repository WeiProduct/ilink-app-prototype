import { createClient } from 'npm:@insforge/sdk';

const allowedOrigins = new Set([
  'https://weiproduct.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const requestBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30;
const MAX_TRANSCRIPT_CHARACTERS = 20_000;

const summaryInstructions = `
You summarize private family voice transcripts for busy relatives.

Requirements:
- Write exactly one or two short, natural sentences.
- Use the same language as the transcript. Use Simplified Chinese for Chinese transcripts.
- Preserve the most useful facts: who, what happened, timing, decisions, requests, and next steps.
- Do not invent, diagnose, judge, or add advice that was not present in the transcript.
- Keep Chinese summaries under 90 Chinese characters and English summaries under 55 words when possible.
- Return only the summary. Do not add a title, label, bullets, quotation marks, or commentary.
- If a previous summary is provided, use meaningfully different wording while preserving the same facts.
`.trim();

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

function allowRequest(userId: string) {
  const now = Date.now();
  const recent = (requestBuckets.get(userId) || []).filter(
    (timestamp) => timestamp > now - RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT) {
    requestBuckets.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestBuckets.set(userId, recent);
  return true;
}

function normalizeText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length <= maximum ? text : '';
}

function extractOutputText(result: unknown) {
  if (!result || typeof result !== 'object') return '';
  const output = (result as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  return output.flatMap((item) => {
    if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'message') {
      return [];
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (
        part
        && typeof part === 'object'
        && (part as { type?: unknown }).type === 'output_text'
        && typeof (part as { text?: unknown }).text === 'string'
      ) {
        return [(part as { text: string }).text];
      }
      return [];
    });
  }).join('\n').trim();
}

function cleanSummary(value: string) {
  return value
    .replace(/^\s*(?:AI\s*)?(?:摘要|总结|Summary)\s*[:：]\s*/i, '')
    .replace(/^[“”"']+|[“”"']+$/g, '')
    .trim()
    .slice(0, 1000);
}

export default async function summarizeEntry(req: Request): Promise<Response> {
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
    if (!allowRequest(user.id)) {
      return json(req, { error: 'Too many summary requests; try again shortly' }, 429);
    }

    const body = await req.json().catch(() => null);
    const transcript = normalizeText(body?.transcript, MAX_TRANSCRIPT_CHARACTERS);
    const previousSummary = normalizeText(body?.previousSummary, 1000);
    const language = body?.language === 'en' ? 'en' : 'zh';
    if (!transcript) return json(req, { error: 'Invalid transcript' }, 400);

    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('SUMMARY_MODEL') || 'gpt-5.4-mini';
    if (!openAIKey) {
      console.error('[summarize-entry] OPENAI_API_KEY is missing', { requestTag });
      return json(req, { error: 'Summary service is not configured' }, 503);
    }

    const input = previousSummary
      ? `Transcript:\n${transcript}\n\nPrevious summary to improve and rephrase:\n${previousSummary}`
      : `Transcript:\n${transcript}`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'none' },
        instructions: `${summaryInstructions}\n- Output language: ${language === 'en' ? 'English' : 'Simplified Chinese'}. Follow this requirement even when the transcript is mixed-language.`,
        input,
        max_output_tokens: 180,
        store: false,
        safety_identifier: user.id,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => ({}));
    const summary = cleanSummary(extractOutputText(result));

    if (!response.ok || !summary) {
      console.error('[summarize-entry] OpenAI failed', {
        requestTag,
        status: response.status,
        type: result?.error?.type,
        code: result?.error?.code,
      });
      const status = response.status === 429
        ? 429
        : response.status === 401 || response.status === 403
        ? 503
        : response.status >= 500
        ? 502
        : 422;
      return json(req, { error: 'Summary generation failed' }, status);
    }

    const requestId = response.headers.get('x-request-id');
    console.log('[summarize-entry] summary completed', {
      requestTag,
      requestId,
      model,
      totalTokens: result?.usage?.total_tokens,
    });
    return json(req, {
      summary,
      model,
      provider: 'openai',
      requestId,
      usage: result?.usage || null,
    });
  } catch (error) {
    console.error('[summarize-entry] unexpected failure', {
      requestTag,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return json(
      req,
      { error: timedOut ? 'Summary request timed out' : 'Unexpected summary failure' },
      timedOut ? 504 : 500,
    );
  }
}
