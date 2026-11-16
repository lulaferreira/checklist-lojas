-- =====================================================================
--  Atualização 02 — Plano de ação com status, valor e prestador
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode ser executado mais de uma vez sem duplicar nada. Não apaga dados.
-- =====================================================================

create table if not exists public.acoes (
  checklist_id   uuid not null references public.checklists(id) on delete cascade,
  item           text not null,
  status         text not null default 'nao_iniciado'
                 check (status in ('nao_iniciado','agendado','em_andamento','concluido')),
  valor          numeric(12,2) check (valor is null or valor >= 0),
  fornecedor     text check (fornecedor is null or char_length(fornecedor) <= 120),
  data_prevista  date,
  data_conclusao date,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text,
  primary key (checklist_id, item)
);

-- Registra automaticamente quem alterou e quando
create or replace function public.acoes_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em  := now();
  new.atualizado_por := coalesce(auth.jwt() ->> 'email', new.atualizado_por);
  if new.status = 'concluido' and new.data_conclusao is null then
    new.data_conclusao := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end $$;

drop trigger if exists acoes_carimbo on public.acoes;
create trigger acoes_carimbo before insert or update on public.acoes
  for each row execute function public.acoes_carimbo();

-- Segurança: só administradores leem e alteram o plano de ação
alter table public.acoes enable row level security;

drop policy if exists "acoes: admin total" on public.acoes;
create policy "acoes: admin total" on public.acoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.acoes to authenticated;
