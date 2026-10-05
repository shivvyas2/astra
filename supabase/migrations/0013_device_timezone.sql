-- The phone's own timezone, reported when it registers for pushes.
--
-- Notifications follow this clock when it is present, and the birthplace
-- timezone on birth_profiles otherwise: someone born in Ahmedabad and living
-- in New York gets the morning reading at a New York 7am. Written by the
-- device registration route; read by the scheduled job with the service role.

alter table public.device_tokens
  add column if not exists timezone text;
