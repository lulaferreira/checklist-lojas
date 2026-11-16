-- =====================================================================
--  Atualização 03 — Controle de contratos de locação
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode ser executado mais de uma vez. Não apaga dados.
--  Requer que o schema.sql (atualização 01) já tenha sido executado.
-- =====================================================================

-- ---------- Cadastro de lojas: endereço, regional, padrão visual e foto ----------
alter table public.lojas add column if not exists cep           text;
alter table public.lojas add column if not exists logradouro    text;
alter table public.lojas add column if not exists numero        text;
alter table public.lojas add column if not exists complemento   text;
alter table public.lojas add column if not exists bairro        text;
alter table public.lojas add column if not exists cidade        text;
alter table public.lojas add column if not exists uf            text check (uf is null or char_length(uf) = 2);
alter table public.lojas add column if not exists regional      text;
alter table public.lojas add column if not exists nova_fachada  boolean;
alter table public.lojas add column if not exists logo_interna  boolean;
alter table public.lojas add column if not exists foto_path     text;
alter table public.lojas add column if not exists foto_data     timestamptz;

-- ---------- Garantias ----------
create table if not exists public.garantias (
  id          bigint generated always as identity primary key,
  nome        text not null unique check (char_length(nome) between 2 and 80),
  exige_valor boolean not null default false,   -- mostra o campo "Valor da garantia" (ex.: caução)
  ativa       boolean not null default true
);

-- ---------- Tempo de contrato ----------
create table if not exists public.prazos (
  id     bigint generated always as identity primary key,
  nome   text not null unique check (char_length(nome) between 2 and 40),
  meses  integer check (meses is null or meses between 1 and 240),  -- vazio = encerrado / indeterminado
  ordem  integer not null default 0,
  ativa  boolean not null default true
);

-- ---------- Contratos ----------
create table if not exists public.contratos (
  id                   uuid primary key default gen_random_uuid(),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  atualizado_por       text,
  loja                 text not null references public.lojas(nome) on update cascade,
  prazo_id             bigint references public.prazos(id),
  garantia_id          bigint references public.garantias(id),
  valor_garantia       numeric(12,2) check (valor_garantia is null or valor_garantia >= 0),
  status               text not null default 'vigente'
                       check (status in ('vigente','pendente_renovacao','renovacao_andamento','encerrado')),
  -- Locador
  locador_nome         text not null check (char_length(locador_nome) between 2 and 200),
  locador_tipo         text check (locador_tipo in ('PF','PJ')),
  locador_documento    text,
  locador_rg           text,
  locador_email        text,
  locador_telefone     text,
  locador_endereco     text,
  locador_representante text,
  locador_banco        text,
  locador_agencia      text,
  locador_conta        text,
  locador_pix          text,
  -- Vigência e valores (mensais)
  data_inicio          date,
  data_fim             date,
  valor_locacao        numeric(12,2) check (valor_locacao is null or valor_locacao >= 0),
  valor_condominio     numeric(12,2) check (valor_condominio is null or valor_condominio >= 0),
  valor_iptu           numeric(12,2) check (valor_iptu is null or valor_iptu >= 0),
  outros_tributos      numeric(12,2) check (outros_tributos is null or outros_tributos >= 0),
  indice_reajuste      text,
  data_ultimo_reajuste date,
  proximo_reajuste     date,
  multa_rescisoria     text,
  responsavel          text,
  observacao           text,
  pdf_path             text,
  alerta_60_ref        date      -- data_fim para a qual o alerta de 60 dias já foi enviado
);
create index if not exists contratos_loja_idx on public.contratos (loja);
create index if not exists contratos_fim_idx  on public.contratos (data_fim);

-- ---------- Aditivos (renovações) ----------
create table if not exists public.aditivos (
  id                   uuid primary key default gen_random_uuid(),
  contrato_id          uuid not null references public.contratos(id) on delete cascade,
  criado_em            timestamptz not null default now(),
  criado_por           text,
  data_assinatura      date,
  data_inicio          date,
  nova_data_fim        date,
  prazo_id             bigint references public.prazos(id),
  novo_valor_locacao   numeric(12,2) check (novo_valor_locacao is null or novo_valor_locacao >= 0),
  valor_anterior       numeric(12,2),
  data_fim_anterior    date,
  observacao           text,
  pdf_path             text
);
create index if not exists aditivos_contrato_idx on public.aditivos (contrato_id, criado_em);

-- ---------- Minutas padrão (modelos .docx) ----------
create table if not exists public.minutas (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  nome        text not null check (char_length(nome) between 2 and 120),
  descricao   text,
  arquivo_path text not null
);

-- ---------- Carimbos automáticos ----------
create or replace function public.contratos_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em  := now();
  new.atualizado_por := coalesce(auth.jwt() ->> 'email', new.atualizado_por);
  if tg_op = 'UPDATE' and new.data_fim is distinct from old.data_fim then
    new.alerta_60_ref := null;   -- nova data de vencimento: o alerta volta a valer
  end if;
  return new;
end $$;
drop trigger if exists contratos_carimbo on public.contratos;
create trigger contratos_carimbo before insert or update on public.contratos
  for each row execute function public.contratos_carimbo();

-- Ao registrar um aditivo: guarda os valores anteriores e atualiza o contrato
create or replace function public.aditivo_aplica()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contratos;
begin
  select * into c from public.contratos where id = new.contrato_id for update;
  new.criado_por        := coalesce(auth.jwt() ->> 'email', new.criado_por);
  new.valor_anterior    := c.valor_locacao;
  new.data_fim_anterior := c.data_fim;
  update public.contratos set
    valor_locacao        = coalesce(new.novo_valor_locacao, valor_locacao),
    data_fim             = coalesce(new.nova_data_fim, data_fim),
    prazo_id             = coalesce(new.prazo_id, prazo_id),
    data_ultimo_reajuste = case when new.novo_valor_locacao is not null then coalesce(new.data_inicio, new.data_assinatura, current_date) else data_ultimo_reajuste end,
    status               = 'vigente'
  where id = new.contrato_id;
  return new;
end $$;
drop trigger if exists aditivo_aplica on public.aditivos;
create trigger aditivo_aplica before insert on public.aditivos
  for each row execute function public.aditivo_aplica();

-- ---------- Segurança (somente administradores) ----------
alter table public.garantias enable row level security;
alter table public.prazos    enable row level security;
alter table public.contratos enable row level security;
alter table public.aditivos  enable row level security;
alter table public.minutas   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['garantias','prazos','contratos','aditivos','minutas'] loop
    execute format('drop policy if exists "%1$s: admin total" on public.%1$I', t);
    execute format('create policy "%1$s: admin total" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Lojas: administradores podem cadastrar e editar (a leitura pública da lista continua para o checklist)
grant insert, update on public.lojas to authenticated;

-- ---------- Arquivos: contratos, aditivos, minutas e fotos das lojas ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 26214400,
        array['application/pdf','image/jpeg','image/png','image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "documentos: admin total" on storage.objects;
create policy "documentos: admin total" on storage.objects
  for all to authenticated
  using (bucket_id = 'documentos' and public.is_admin())
  with check (bucket_id = 'documentos' and public.is_admin());

-- ---------- Dados iniciais ----------
insert into public.prazos (nome, meses, ordem) values
  ('12 meses', 12, 1), ('24 meses', 24, 2), ('36 meses', 36, 3),
  ('48 meses', 48, 4), ('60 meses', 60, 5),
  ('Tempo indeterminado', null, 6), ('Encerrado', null, 7)
on conflict (nome) do nothing;

insert into public.garantias (nome, exige_valor) values
  ('Caução', true), ('Seguro fiança', false), ('Fiador', false),
  ('Título de capitalização', false), ('Sem garantia', false)
on conflict (nome) do nothing;
