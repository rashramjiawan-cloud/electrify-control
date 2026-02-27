
-- Invoices table for local billing
CREATE TABLE public.charging_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id integer NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  vehicle_id text,
  charge_point_id text NOT NULL,
  tariff_id uuid REFERENCES public.charging_tariffs(id) ON DELETE SET NULL,
  energy_kwh numeric NOT NULL DEFAULT 0,
  duration_min numeric NOT NULL DEFAULT 0,
  idle_min numeric NOT NULL DEFAULT 0,
  start_fee numeric NOT NULL DEFAULT 0,
  energy_cost numeric NOT NULL DEFAULT 0,
  idle_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(transaction_id)
);

-- RLS
ALTER TABLE public.charging_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoices" ON public.charging_invoices
  FOR SELECT USING (true);
CREATE POLICY "Service can insert invoices" ON public.charging_invoices
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update invoices" ON public.charging_invoices
  FOR UPDATE USING (true);
CREATE POLICY "Authenticated can delete invoices" ON public.charging_invoices
  FOR DELETE USING (true);

-- Function to auto-generate invoice when transaction stops
CREATE OR REPLACE FUNCTION public.generate_invoice_on_transaction_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tariff RECORD;
  v_energy numeric;
  v_duration numeric;
  v_idle numeric;
  v_energy_cost numeric;
  v_idle_cost numeric;
  v_total numeric;
  v_vehicle text;
BEGIN
  -- Only trigger when status changes to 'Completed'
  IF NEW.status <> 'Completed' OR OLD.status = 'Completed' THEN
    RETURN NEW;
  END IF;

  -- Find matching tariff (charge_point specific or default)
  SELECT * INTO v_tariff FROM public.charging_tariffs
    WHERE active = true
      AND (charge_point_id = NEW.charge_point_id OR (charge_point_id IS NULL AND is_default = true))
    ORDER BY
      CASE WHEN charge_point_id = NEW.charge_point_id THEN 0 ELSE 1 END
    LIMIT 1;

  IF v_tariff IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate values
  v_energy := COALESCE(NEW.energy_delivered, 0);
  v_duration := EXTRACT(EPOCH FROM (COALESCE(NEW.stop_time, now()) - NEW.start_time)) / 60.0;
  v_idle := GREATEST(0, v_duration - (v_energy / NULLIF(COALESCE((SELECT max_power FROM charge_points WHERE id = NEW.charge_point_id), 7.4), 0) * 60));
  
  v_energy_cost := ROUND(v_energy * v_tariff.price_per_kwh, 2);
  v_idle_cost := ROUND(GREATEST(0, v_idle) * v_tariff.idle_fee_per_min, 2);
  v_total := ROUND(v_tariff.start_fee + v_energy_cost + v_idle_cost, 2);

  -- Check if vehicle_id matches
  SELECT vehicle_id INTO v_vehicle FROM public.vehicle_whitelist
    WHERE enabled = true AND vehicle_id = NEW.id_tag
    LIMIT 1;

  -- Update transaction cost
  NEW.cost := v_total;

  -- Insert invoice
  INSERT INTO public.charging_invoices (
    transaction_id, vehicle_id, charge_point_id, tariff_id,
    energy_kwh, duration_min, idle_min,
    start_fee, energy_cost, idle_cost, total_cost, currency
  ) VALUES (
    NEW.id, v_vehicle, NEW.charge_point_id, v_tariff.id,
    v_energy, ROUND(v_duration, 1), ROUND(GREATEST(0, v_idle), 1),
    v_tariff.start_fee, v_energy_cost, v_idle_cost, v_total, v_tariff.currency
  ) ON CONFLICT (transaction_id) DO UPDATE SET
    energy_kwh = EXCLUDED.energy_kwh,
    duration_min = EXCLUDED.duration_min,
    idle_min = EXCLUDED.idle_min,
    energy_cost = EXCLUDED.energy_cost,
    idle_cost = EXCLUDED.idle_cost,
    total_cost = EXCLUDED.total_cost,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_generate_invoice
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_invoice_on_transaction_stop();
