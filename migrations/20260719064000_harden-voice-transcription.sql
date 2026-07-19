ALTER TABLE public.life_entries
  RENAME COLUMN transcription_generation_id TO transcription_request_id;

ALTER TABLE public.life_entries
  ADD CONSTRAINT life_entries_audio_format_check
    CHECK (
      audio_format IS NULL
      OR audio_format IN ('flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm')
    ),
  ADD CONSTRAINT life_entries_audio_duration_check
    CHECK (
      audio_duration_seconds IS NULL
      OR (audio_duration_seconds > 0 AND audio_duration_seconds <= 60.5)
    ),
  ADD CONSTRAINT life_entries_audio_key_owner_check
    CHECK (
      audio_key IS NULL
      OR split_part(audio_key, '/', 1) = user_id::text
    ),
  ADD CONSTRAINT life_entries_transcription_cost_check
    CHECK (transcription_cost_usd IS NULL OR transcription_cost_usd >= 0);

CREATE UNIQUE INDEX life_entries_audio_key_unique
  ON public.life_entries (audio_key)
  WHERE audio_key IS NOT NULL;

CREATE TABLE public.voice_transcription_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_key TEXT NOT NULL,
  audio_size_bytes INTEGER NOT NULL CHECK (audio_size_bytes BETWEEN 800 AND 15728640),
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voice_transcription_audio_key_owner_check
    CHECK (split_part(audio_key, '/', 1) = user_id::text),
  CONSTRAINT voice_transcription_user_audio_unique UNIQUE (user_id, audio_key)
);

CREATE INDEX voice_transcription_requests_user_created_idx
  ON public.voice_transcription_requests (user_id, created_at DESC);

ALTER TABLE public.voice_transcription_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_transcription_owner_select ON public.voice_transcription_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY voice_transcription_owner_insert ON public.voice_transcription_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT ON public.voice_transcription_requests TO authenticated;
