// Supabase Edge Function: envia e-mail de confirmação a cada checklist recebido.
// Disparada por um Database Webhook (INSERT em public.checklists). Envio via Resend (resend.com).
//
// Variáveis (Edge Functions > Secrets):
//   RESEND_API_KEY   chave da API do Resend
//   EMAIL_REMETENTE  ex.: "Checklist Lojas <checklist@portalnova.com.br>" (domínio verificado no Resend)
//   EMAIL_DESTINO    ex.: "luiz.ferreira@portalnova.com.br,william.rocha@portalnova.com.br"
//   PAINEL_URL       ex.: "https://SEU-USUARIO.github.io/checklist-lojas/admin.html"
//   WEBHOOK_SECRET   um texto aleatório; o mesmo vai no cabeçalho x-webhook-secret do webhook

const URG: Record<string, string> = { imediato: "Imediato", d30: "Até 30 dias", espera: "Pode esperar" };
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("não autorizado", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const r = body?.record;
  if (body?.type !== "INSERT" || !r) return new Response("ignorado");

  const respostas = (r.respostas ?? {}) as Record<string, { r: string; obs: string; urg: string; chamado: string; fotos: string[] }>;
  const problemas = Object.entries(respostas)
    .filter(([, a]) => a && a.urg)
    .sort(([, a], [, b]) => ["imediato", "d30", "espera"].indexOf(a.urg) - ["imediato", "d30", "espera"].indexOf(b.urg));
  const nota = r.nota == null ? "–" : Math.round(Number(r.nota) * 100) + "%";
  const quando = new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const painel = Deno.env.get("PAINEL_URL") ?? "";

  const linhas = problemas.map(([id, a]) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd;font-family:monospace">${esc(id)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(URG[a.urg] ?? a.urg)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(a.obs)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(a.chamado || "—")}</td></tr>`).join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#13201e">
    <h2 style="margin:0 0 8px">Checklist recebido: ${esc(r.loja)}</h2>
    <p style="margin:0 0 4px"><b>Supervisor:</b> ${esc(r.supervisor)}</p>
    <p style="margin:0 0 4px"><b>Enviado em:</b> ${esc(quando)}</p>
    <p style="margin:0 0 12px"><b>Nota:</b> ${nota} · <b>Itens com problema:</b> ${esc(r.total_problemas)}</p>
    ${problemas.length ? `<table style="border-collapse:collapse;font-size:13px"><thead><tr>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Item</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Urgência</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Observação</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #999">Chamado</th></tr></thead><tbody>${linhas}</tbody></table>` : "<p>Nenhum problema registrado.</p>"}
    ${painel ? `<p style="margin-top:16px"><a href="${esc(painel)}">Abrir o painel de resultados</a></p>` : ""}
  </div>`;

  const para = (Deno.env.get("EMAIL_DESTINO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_REMETENTE") ?? "Checklist Lojas <onboarding@resend.dev>",
      to: para,
      subject: `Checklist recebido: ${r.loja} (${r.total_problemas} problema(s))`,
      html,
    }),
  });
  return new Response(await res.text(), { status: res.ok ? 200 : 502 });
});
