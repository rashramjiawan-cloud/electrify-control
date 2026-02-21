
-- Reservations table for OCPP ReserveNow / CancelReservation
CREATE TABLE public.reservations (
  id SERIAL PRIMARY KEY,
  charge_point_id TEXT NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL DEFAULT 0,
  id_tag TEXT NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Reserved', -- Reserved, Accepted, Rejected, Occupied, Expired, Cancelled, Used
  parent_id_tag TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reservations"
  ON public.reservations FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert reservations"
  ON public.reservations FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can update reservations"
  ON public.reservations FOR UPDATE USING (true);

CREATE POLICY "Authenticated can delete reservations"
  ON public.reservations FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
