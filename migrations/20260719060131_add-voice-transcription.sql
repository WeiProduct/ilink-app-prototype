ALTER TABLE public.life_entries
  ADD COLUMN audio_url TEXT,
  ADD COLUMN audio_key TEXT,
  ADD COLUMN audio_format TEXT,
  ADD COLUMN audio_duration_seconds NUMERIC(10, 3),
  ADD COLUMN transcription_model TEXT,
  ADD COLUMN transcription_generation_id TEXT,
  ADD COLUMN transcription_cost_usd NUMERIC(12, 8);

CREATE POLICY voice_recordings_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket = 'voice-recordings'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY voice_recordings_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket = 'voice-recordings'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY voice_recordings_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket = 'voice-recordings'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket = 'voice-recordings'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

CREATE POLICY voice_recordings_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket = 'voice-recordings'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
    AND (storage.foldername(key))[1] = (SELECT auth.jwt() ->> 'sub')
  );

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
