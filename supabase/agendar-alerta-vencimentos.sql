-- =====================================================================
--  Agenda o alerta diário de vencimento de contratos (todo dia às 8h de Brasília)
--  Rode SOMENTE depois de publicar a Edge Function "alerta-vencimentos"
--  e cadastrar o secret CRON_SECRET (veja o README).
--
--  ANTES DE RODAR: troque TROQUE_PELO_CRON_SECRET pelo mesmo valor do secret CRON_SECRET.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove agendamento anterior, se existir
select cron.unschedule(jobid) from cron.job where jobname = 'alerta-vencimentos-diario';

select cron.schedule(
  'alerta-vencimentos-diario',
  '0 11 * * *',   -- 11h UTC = 8h em Brasília
  $$
  select net.http_post(
    url     := 'https://faabliorzfeaqhqlnogo.supabase.co/functions/v1/alerta-vencimentos',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','TROQUE_PELO_CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);
