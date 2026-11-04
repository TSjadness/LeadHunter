CREATE TABLE public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  header_name text,
  header_value text,
  results_path text,
  enabled boolean NOT NULL DEFAULT true,
  use_in_search boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_integrations TO authenticated;
GRANT ALL ON public.api_integrations TO service_role;
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own integrations" ON public.api_integrations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());