-- =====================================================================
--  Checklist Estrutural das Lojas — estrutura do banco (Supabase)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.lojas (
  nome  text primary key,
  ativa boolean not null default true
);

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.checklists (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  loja            text not null references public.lojas(nome) on update cascade,
  supervisor      text not null check (char_length(supervisor) between 3 and 120),
  respostas       jsonb not null check (jsonb_typeof(respostas) = 'object' and pg_column_size(respostas) < 200000),
  total_problemas integer not null default 0 check (total_problemas between 0 and 200),
  nota            numeric(5,4) check (nota is null or (nota >= 0 and nota <= 1))
);
create index if not exists checklists_loja_data_idx on public.checklists (loja, created_at desc);

-- ---------- Quem é administrador ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Segurança (RLS) ----------
alter table public.lojas      enable row level security;
alter table public.admins     enable row level security;
alter table public.checklists enable row level security;

drop policy if exists "lojas: leitura publica" on public.lojas;
create policy "lojas: leitura publica" on public.lojas
  for select to anon, authenticated using (ativa or public.is_admin());

drop policy if exists "lojas: admin altera" on public.lojas;
create policy "lojas: admin altera" on public.lojas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins: admin le" on public.admins;
create policy "admins: admin le" on public.admins
  for select to authenticated using (public.is_admin());

-- Supervisores (sem login) só podem ENVIAR. Ninguém sem login lê, altera ou apaga.
drop policy if exists "checklists: envio publico" on public.checklists;
create policy "checklists: envio publico" on public.checklists
  for insert to anon, authenticated with check (true);

drop policy if exists "checklists: admin le" on public.checklists;
create policy "checklists: admin le" on public.checklists
  for select to authenticated using (public.is_admin());

drop policy if exists "checklists: admin apaga" on public.checklists;
create policy "checklists: admin apaga" on public.checklists
  for delete to authenticated using (public.is_admin());

grant select on public.lojas to anon, authenticated;
grant insert on public.checklists to anon, authenticated;
grant select, delete on public.checklists to authenticated;

-- ---------- Fotos (Storage) ----------
-- Bucket privado: fotos não ficam abertas na internet. O painel gera links temporários.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "fotos: envio publico" on storage.objects;
create policy "fotos: envio publico" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'fotos');

drop policy if exists "fotos: admin le" on storage.objects;
create policy "fotos: admin le" on storage.objects
  for select to authenticated using (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "fotos: admin apaga" on storage.objects;
create policy "fotos: admin apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and public.is_admin());

-- ---------- Dados iniciais ----------
insert into public.admins (email) values
  ('luiz.ferreira@portalnova.com.br'),
  ('william.rocha@portalnova.com.br')
on conflict (email) do nothing;

insert into public.lojas (nome) values
  ('HELP AFOGADOS'),
  ('HELP AGUA RASA'),
  ('HELP ARTUR ALVIM'),
  ('HELP BARUERI'),
  ('HELP BOM RETIRO'),
  ('HELP CAMBUCI'),
  ('HELP CAMPO LIMPO'),
  ('HELP CARUARU'),
  ('HELP CAVALEIRO'),
  ('HELP CONSOLAÇÃO'),
  ('HELP ESCADA'),
  ('HELP GOIANA'),
  ('HELP GUARULHOS CENTRO'),
  ('HELP GUARULHOS GETULIO VARGAS'),
  ('HELP GUARULHOS PRAÇA OITO'),
  ('HELP GUARULHOS PIMENTAS'),
  ('HELP GUARULHOS VILA GALVAO'),
  ('HELP IMPERADOR'),
  ('HELP IPIRANGA'),
  ('HELP ITAQUA VILA VIRGINIA'),
  ('HELP ITAQUAQUECETUBA'),
  ('HELP ITAQUERA'),
  ('HELP ITAQUERA GREGORIO RAMALHO'),
  ('HELP JARDIM JAPAO'),
  ('HELP LAPA'),
  ('HELP LAPA II'),
  ('HELP LARGO DA BATATA'),
  ('HELP OSASCO'),
  ('HELP OSASCO ALIANÇA'),
  ('HELP OSASCO BELA VISTA'),
  ('HELP OSASCO PESTANA'),
  ('HELP PAULISTA'),
  ('HELP PENHA'),
  ('HELP POA'),
  ('HELP PRAÇA DA ÁRVORE'),
  ('HELP PRAZERES'),
  ('HELP REPÚBLICA'),
  ('HELP ROCHDALE'),
  ('HELP SALVADOR'),
  ('HELP SALVADOR - MIGUEL CALMON'),
  ('HELP SANTANA'),
  ('HELP SANTO AMARO - RIO BRANCO'),
  ('HELP SANTO AMARO - SCHMIDT'),
  ('HELP SAO MATEUS'),
  ('HELP SUMAREZINHO'),
  ('HELP TUCURUVI'),
  ('HELP VILA MARIA'),
  ('HELP VILA SABRINA'),
  ('HELP VILA SOCORRO'),
  ('HELP VILA SONIA'),
  ('HELP VILA LINDA'),
  ('HELP SANTO ANDRÉ NAÇÕES'),
  ('HELP ANDRADAS'),
  ('HELP BARRO PRETO'),
  ('HELP CAMPO BELO'),
  ('HELP FLORESTA'),
  ('HELP ITAUNA'),
  ('HELP PARA DE MINAS'),
  ('HELP VARGINHA')
on conflict (nome) do nothing;

-- ---------- Plano de ação (status, valor, prestador) ----------
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
