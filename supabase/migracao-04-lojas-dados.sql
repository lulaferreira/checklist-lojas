-- =====================================================================
--  Atualização 04 — Novos campos no cadastro de lojas
--  CNPJ, Origem, Data de abertura e Cód. Help!
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode ser executado mais de uma vez. Não apaga dados.
-- =====================================================================
alter table public.lojas add column if not exists cnpj          text;
alter table public.lojas add column if not exists origem        text;
alter table public.lojas add column if not exists data_abertura date;
alter table public.lojas add column if not exists codigo_help   text;

-- Origem aceita somente as três opções
alter table public.lojas drop constraint if exists lojas_origem_check;
alter table public.lojas add constraint lojas_origem_check
  check (origem is null or origem in ('Repasse CB','Repasse Franqueado','Loja Nova'));
