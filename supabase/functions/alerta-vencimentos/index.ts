// Supabase Edge Function: alerta de vencimento de contratos de locação (60 dias).
// Rodada uma vez por dia pelo agendamento (pg_cron) definido em supabase/agendar-alerta-vencimentos.sql.
// Envia UM e-mail com todos os contratos que entraram na janela de 60 dias e ainda não foram avisados.
// Cada contrato é avisado uma única vez por data de vencimento (se o vencimento mudar por aditivo, avisa de novo).
//
// Variáveis (Edge Functions > Secrets) — as mesmas do e-mail do checklist, mais CRON_SECRET:
//   RESEND_API_KEY, EMAIL_REMETENTE, EMAIL_DESTINO, CRON_SECRET
//   CONTRATOS_URL (opcional) ex.: https://lulaferreira.github.io/checklist-lojas/contratos.html
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente nas Edge Functions.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DIAS = 60;
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const brl = (v: unknown) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => d.split("-").reverse().join("/");
const STATUS: Record<string, string> = {
  vigente: "Contrato vigente", pendente_renovacao: "Pendente renovação", renovacao_andamento: "Renovação em andamento",
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("não autorizado", { status: 401 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD
  const hoje = new Date(hojeISO + "T12:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const limite = new Date(hoje); limite.setUTCDate(limite.getUTCDate() + DIAS);

  const { data, error } = await sb.from("contratos")
    .select("id, loja, locador_nome, data_fim, valor_locacao, status, responsavel, alerta_60_ref")
    .neq("status", "encerrado")
    .not("data_fim", "is", null)
    .gte("data_fim", iso(hoje))
    .lte("data_fim", iso(limite))
    .order("data_fim");
  if (error) return new Response("erro ao consultar: " + error.message, { status: 500 });

  const novos = (data ?? []).filter((c) => c.alerta_60_ref !== c.data_fim);
  if (!novos.length) return new Response("nenhum contrato novo na janela de 60 dias");

  const dias = (d: string) => Math.round((new Date(d + "T12:00:00Z").getTime() - hoje.getTime()) / 86400000);
  const linhas = novos.map((c) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd"><b>${esc(c.loja)}</b><br><span style="color:#666">${esc(c.locador_nome)}</span></td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd">${dataBR(c.data_fim)}<br><span style="color:#b33">faltam ${dias(c.data_fim)} dias</span></td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${brl(c.valor_locacao)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(STATUS[c.status] ?? c.status)}<br><span style="color:#666">${esc(c.responsavel || "")}</span></td></tr>`).join("");
  const link = Deno.env.get("CONTRATOS_URL");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#13201e">
    <h2 style="margin:0 0 8px">${novos.length} contrato(s) de locação vencem nos próximos ${DIAS} dias</h2>
    <p style="margin:0 0 12px">Inicie as tratativas de renovação.</p>
    <table style="border-collapse:collapse;font-size:13px"><thead><tr>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Loja / Locador</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Vencimento</th>
      <th align="right" style="padding:6px 8px;border-bottom:2px solid #999">Aluguel</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Status / Responsável</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    ${link ? `<p style="margin-top:16px"><a href="${esc(link)}">Abrir o controle de contratos</a></p>` : ""}
  </div>`;

  const para = (Deno.env.get("EMAIL_DESTINO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_REMETENTE") ?? "Contratos <onboarding@resend.dev>",
      to: para,
      subject: `Alerta: ${novos.length} contrato(s) de locação vencem em até ${DIAS} dias`,
      html,
    }),
  });
  if (!res.ok) return new Response("falha no envio: " + await res.text(), { status: 502 });

  // Marca como avisado (só depois do e-mail sair)
  for (const c of novos) await sb.from("contratos").update({ alerta_60_ref: c.data_fim }).eq("id", c.id);
  return new Response(`alerta enviado: ${novos.length} contrato(s)`);
});
