-- Additive playback state only. Applied automatically by server startup.
CREATE TABLE IF NOT EXISTS public.overlay_alert_control (station_id uuid PRIMARY KEY, paused boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 0, changed_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS public.overlay_alert_shown (station_id uuid NOT NULL,broadcast_id uuid NOT NULL,event_key text NOT NULL,capture_id uuid,shown_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(station_id,broadcast_id,event_key));
 CREATE INDEX IF NOT EXISTS livecatch_capture_playback_key ON public.donation_capture_candidates(station_id,broadcast_id,(routing->>'playbackKey')) WHERE source='toonie';
 REVOKE ALL ON public.overlay_alert_control,public.overlay_alert_shown FROM PUBLIC;
 ALTER TABLE public.overlay_alert_control ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.overlay_alert_shown ENABLE ROW LEVEL SECURITY;
