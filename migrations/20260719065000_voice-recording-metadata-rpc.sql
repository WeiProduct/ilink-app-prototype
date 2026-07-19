CREATE OR REPLACE FUNCTION public.get_voice_recording_metadata(p_key TEXT)
RETURNS TABLE (size INTEGER, mime_type TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT objects.size, objects.mime_type
  FROM storage.objects AS objects
  WHERE objects.bucket = 'voice-recordings'
    AND objects.key = p_key
    AND objects.uploaded_by = auth.uid()::text
    AND (storage.foldername(objects.key))[1] = auth.uid()::text
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_voice_recording_metadata(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_voice_recording_metadata(TEXT) TO authenticated;
