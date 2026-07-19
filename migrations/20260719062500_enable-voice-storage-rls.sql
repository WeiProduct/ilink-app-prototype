-- storage.objects does not enable RLS by default in this project. The voice
-- policies created by the previous migration only take effect after this.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
