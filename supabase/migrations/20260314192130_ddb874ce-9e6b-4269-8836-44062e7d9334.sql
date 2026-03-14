
-- Table to log project status change notifications
CREATE TABLE public.project_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  recipient_email text,
  old_status text NOT NULL,
  new_status text NOT NULL,
  project_title text NOT NULL,
  email_sent boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can manage all notifications
CREATE POLICY "Admins can manage notifications"
ON public.project_notifications FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Customers can read their own notifications
CREATE POLICY "Customers can read own notifications"
ON public.project_notifications FOR SELECT TO authenticated
USING (customer_id = get_my_customer_id());
