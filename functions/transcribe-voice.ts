import { createClient } from 'npm:@insforge/sdk';

const allowedOrigins = new Set([
  'https://weiproduct.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin)
      ? origin
      : 'https://weiproduct.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

export default async function transcribeVoice(req: Request): Promise<Response> {
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
    const audioKey = typeof body.audioKey === 'string' ? body.audioKey : '';
    const requestedFormat = typeof body.format === 'string' ? body.format.toLowerCase() : '';
    const format = audioKey.split('.').pop()?.toLowerCase() || '';
    const supportedFormats = new Set([
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
    if (
      !audioKey.startsWith(`${user.id}/`)
      || !supportedFormats.has(format)
      || (requestedFormat && requestedFormat !== format)
    ) {
      return json(req, { error: 'Invalid audio reference' }, 400);
    }

    const { data: objectRows, error: metadataError } = await client.database
      .rpc('get_voice_recording_metadata', { p_key: audioKey });
    const objectMetadata = objectRows?.[0];
    if (metadataError || !objectMetadata) {
      console.error('[transcribe-voice] metadata lookup failed', {
        requestTag,
        code: metadataError?.code,
      });
      return json(req, { error: 'Audio file could not be loaded' }, 404);
    }
    if (objectMetadata.size < 800) {
      return json(req, { error: 'Recording is too short' }, 422);
    }
    if (objectMetadata.size > 15 * 1024 * 1024) {
      return json(req, { error: 'Recording is too large' }, 413);
    }

    const allowedMimeTypes: Record<string, Set<string>> = {
      flac: new Set(['audio/flac', 'audio/x-flac']),
      mp3: new Set(['audio/mpeg', 'audio/mp3']),
      mp4: new Set(['audio/mp4']),
      mpeg: new Set(['audio/mpeg']),
      mpga: new Set(['audio/mpeg']),
      m4a: new Set(['audio/mp4', 'audio/x-m4a']),
      ogg: new Set(['audio/ogg']),
      wav: new Set(['audio/wav', 'audio/x-wav']),
      webm: new Set(['audio/webm']),
    };
    const storedMime = String(objectMetadata.mime_type || '').split(';')[0].toLowerCase();
    if (
      storedMime
      && storedMime !== 'application/octet-stream'
      && !allowedMimeTypes[format]?.has(storedMime)
    ) {
      return json(req, { error: 'Audio format does not match the file' }, 400);
    }

    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('STT_MODEL') || 'gpt-4o-transcribe';
    if (!openAIKey) {
      console.error('[transcribe-voice] OPENAI_API_KEY is missing', { requestTag });
      return json(req, { error: 'Transcription service is not configured' }, 503);
    }

    const rateWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentRequestCount, error: rateCheckError } = await client.database
      .from('voice_transcription_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', rateWindowStart);
    if (rateCheckError) {
      console.error('[transcribe-voice] rate check failed', {
        requestTag,
        code: rateCheckError.code,
      });
      return json(req, { error: 'Transcription service is temporarily unavailable' }, 503);
    }
    if ((recentRequestCount || 0) >= 10) {
      return json(req, { error: 'Too many transcription requests; try again shortly' }, 429);
    }
    const { error: requestLogError } = await client.database
      .from('voice_transcription_requests')
      .insert([{
        user_id: user.id,
        audio_key: audioKey,
        audio_size_bytes: objectMetadata.size,
        model,
      }]);
    if (requestLogError) {
      const duplicate = requestLogError.code === '23505';
      console.error('[transcribe-voice] request log failed', {
        requestTag,
        code: requestLogError.code,
      });
      return json(
        req,
        { error: duplicate ? 'This recording was already processed' : 'Transcription service is temporarily unavailable' },
        duplicate ? 409 : 503,
      );
    }

    const { data: audioBlob, error: downloadError } = await client.storage
      .from('voice-recordings')
      .download(audioKey);
    if (downloadError || !audioBlob) {
      console.error('[transcribe-voice] download failed', {
        requestTag,
        code: downloadError?.code,
      });
      return json(req, { error: 'Audio file could not be loaded' }, 404);
    }

    const contentTypes: Record<string, string> = {
      flac: 'audio/flac',
      mp3: 'audio/mpeg',
      mp4: 'audio/mp4',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    };
    const audioFile = new File([audioBlob], `ilink-recording.${format}`, {
      type: contentTypes[format] || audioBlob.type || 'application/octet-stream',
    });
    const form = new FormData();
    form.append('file', audioFile);
    form.append('model', model);
    form.append('language', 'zh');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append(
      'prompt',
      '这是 iLink 产品里的中文生活记录。请忠实转写为简体中文，保留自然标点、人名、时间，以及 iLink、InsForge 等专有名词；不要总结或添加录音中没有的内容。',
    );

    console.log('[transcribe-voice] transcription started', {
      requestTag,
      bytes: audioBlob.size,
      format,
      model,
    });
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.text !== 'string') {
      console.error('[transcribe-voice] OpenAI failed', {
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
      return json(req, { error: 'Transcription failed' }, status);
    }

    const requestId = response.headers.get('x-request-id');
    console.log('[transcribe-voice] transcription completed', {
      requestTag,
      model,
      requestId,
      totalTokens: result.usage?.total_tokens,
    });
    return json(req, {
      text: result.text.trim(),
      model,
      provider: 'openai',
      requestId,
      usage: result.usage || null,
    });
  } catch (error) {
    console.error('[transcribe-voice] unexpected failure', {
      requestTag,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return json(
      req,
      { error: timedOut ? 'Transcription timed out' : 'Unexpected transcription failure' },
      timedOut ? 504 : 500,
    );
  }
}
