ALTER TABLE public.life_entries
  ADD COLUMN ai_summary TEXT,
  ADD COLUMN summary_model TEXT,
  ADD COLUMN summary_request_id TEXT,
  ADD COLUMN summary_generated_at TIMESTAMPTZ,
  ADD COLUMN summary_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.life_entries
  ADD CONSTRAINT life_entries_ai_summary_length_check
    CHECK (
      ai_summary IS NULL
      OR char_length(btrim(ai_summary)) BETWEEN 1 AND 1000
    ),
  ADD CONSTRAINT life_entries_summary_version_check
    CHECK (summary_version >= 0);

ALTER TABLE public.life_entries
  DROP CONSTRAINT IF EXISTS life_entries_audio_duration_check;

ALTER TABLE public.life_entries
  ADD CONSTRAINT life_entries_audio_duration_check
    CHECK (
      audio_duration_seconds IS NULL
      OR (audio_duration_seconds > 0 AND audio_duration_seconds <= 900.5)
    );
