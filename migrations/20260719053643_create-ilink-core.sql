CREATE TABLE public.life_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX life_entries_user_occurred_idx
  ON public.life_entries (user_id, occurred_at DESC);

ALTER TABLE public.life_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_life_entries" ON public.life_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_read_own_life_entries" ON public.life_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_life_entries" ON public.life_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_life_entries" ON public.life_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.life_entries TO authenticated;

CREATE TRIGGER life_entries_updated_at
  BEFORE UPDATE ON public.life_entries
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TABLE public.family_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_label TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '今日近况',
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX family_shares_user_sent_idx
  ON public.family_shares (user_id, sent_at DESC);

ALTER TABLE public.family_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_family_shares" ON public.family_shares
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_read_own_family_shares" ON public.family_shares
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_family_shares" ON public.family_shares
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.family_shares TO authenticated;
