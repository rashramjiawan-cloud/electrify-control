
CREATE TABLE public.notification_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('webhook', 'slack', 'email')),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read channels" ON public.notification_channels FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert channels" ON public.notification_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update channels" ON public.notification_channels FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete channels" ON public.notification_channels FOR DELETE USING (true);

CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
