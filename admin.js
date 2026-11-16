// Painel do administrador: login (Supabase Auth, e-mail e senha) + resultados,
// plano de ação editável (status, valor, prestador, datas) e relatório de gastos.
// Só lê/grava quem está na tabela public.admins (regras RLS do schema.sql).
const BUCKET = (window.CHECKLIST_CONFIG||{}).BUCKET_FOTOS || "fotos";
const sb = makeClient();
const STATUS = [["nao_iniciado","Não iniciado"],["agendado","Agendado"],["em_andamento","Em andamento"],["concluido","Concluído"]];
const ST_LABEL = Object.fromEntries(STATUS);
const ST_COLOR = {nao_iniciado:"--muted", agendado:"--c1", em_andamento:"--c4", concluido:"--c6"};
const S = {
  lojas:[], rows:[], acoes:{}, semTabelaAcoes:false, fotoUrl:{}, falt:[], loading:false, tab:"geral",
  fp:{loja:"",urg:"",cat:"",st:""},
  fg:{loja:"",cat:"",st:"",urg:"",base:"registro",de:"",ate:""},
  pie:{dim:"status",met:"valor"}, bar:{dim:"loja",met:"valor"},
  charts:{}, saving:{}
};
const brl = v => (Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const parseBRL = s => { s = String(s||"").replace(/[^\d,.-]/g,""); if (!s) return null; if (s.includes(",")) s = s.replace(/\./g,"").replace(",","."); const n = Number(s); return isFinite(n) && n>=0 ? Math.round(n*100)/100 : NaN; };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const keyOf = (cid,item) => cid+"|"+item;

function setStatus(html, kind){ $("#status").innerHTML = html ? `<div class="alert ${kind||"warn"}" style="margin-bottom:16px">${html}</div>` : ""; }
function show(v){
  for (const id of ["login","senha","painel"]) $("#v-"+id).hidden = id!==v;
  $("#userbar").hidden = v!=="painel";
  $("#wrap").classList.toggle("wide", v==="painel");
}

/* ---------- Autenticação ---------- */
const AUTH_MSG = {
  "Invalid login credentials":"E-mail ou senha incorretos.",
  "Email not confirmed":"Este e-mail ainda não foi confirmado. Confirme pelo link recebido ou peça para marcá-lo como confirmado no Supabase.",
};
$("#f-login").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("#lg-email").value.trim(), senha = $("#lg-senha").value, err = $("#lg-err"), b = $("#lg-btn");
  if (!email || !senha){ err.textContent = "Informe e-mail e senha."; err.hidden = false; return; }
  b.disabled = true; b.textContent = "Entrando…";
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  b.disabled = false; b.textContent = "Entrar";
  if (error){ err.textContent = AUTH_MSG[error.message] || "Não foi possível entrar. Tente novamente."; err.hidden = false; return; }
  err.hidden = true; $("#lg-senha").value = "";
  entrar();
});
$("#lg-esqueci").onclick = async ()=>{
  const email = $("#lg-email").value.trim(), err = $("#lg-err");
  if (!email){ err.textContent = "Digite seu e-mail no campo acima e clique de novo em \"Esqueci minha senha\"."; err.hidden = false; return; }
  const redirectTo = location.href.split("#")[0].split("?")[0];
  await sb.auth.resetPasswordForEmail(email, { redirectTo });
  err.hidden = true;
  setStatus("Se este e-mail for de um administrador, você vai receber um link para criar uma nova senha.","ok");
};
$("#f-senha").addEventListener("submit", async e=>{
  e.preventDefault();
  const a = $("#ns-1").value, b2 = $("#ns-2").value, err = $("#ns-err");
  if (a.length < 8){ err.textContent = "A senha precisa ter pelo menos 8 caracteres."; err.hidden = false; return; }
  if (a !== b2){ err.textContent = "As duas senhas não são iguais."; err.hidden = false; return; }
  const { error } = await sb.auth.updateUser({ password: a });
  if (error){ err.textContent = "Não foi possível salvar a senha. Peça um novo link e tente de novo."; err.hidden = false; return; }
  history.replaceState(null,"",location.pathname);
  setStatus("Senha alterada.","ok"); entrar();
});
$("#btn-sair").onclick = async ()=>{ await sb.auth.signOut(); S.rows=[]; S.acoes={}; ["geral","plano","gastos"].forEach(t=>$("#t-"+t).innerHTML=""); setStatus(""); show("login"); };
$("#btn-atualizar").onclick = ()=>carregar();

async function entrar(){
  const { data:{ session } } = await sb.auth.getSession();
  if (!session){ show("login"); return; }
  $("#user-email").textContent = session.user.email;
  const { data:isAdmin, error } = await sb.rpc("is_admin");
  if (error || !isAdmin){
    await sb.auth.signOut(); show("login");
    setStatus("Seu usuário não está autorizado a ver o painel. Peça para incluir seu e-mail na tabela de administradores.","bad");
    return;
  }
  setStatus(""); show("painel"); carregar();
}

/* ---------- Abas ---------- */
document.querySelectorAll(".tabs [data-tab]").forEach(b=>b.onclick = ()=>abrirAba(b.dataset.tab));
function abrirAba(t){
  S.tab = t;
  document.querySelectorAll(".tabs [data-tab]").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===t));
  for (const id of ["geral","plano","gastos"]) $("#t-"+id).hidden = id!==t;
  render();
}
function render(){ if (S.tab==="geral") renderGeral(); else if (S.tab==="plano") renderPlano(); else renderGastos(); }

/* ---------- Dados ---------- */
async function carregar(){
  if (S.loading) return; S.loading = true;
  const b = $("#btn-atualizar"); b.disabled = true; b.textContent = "Atualizando…";
  try{
    const [lj, ck, ac] = await Promise.all([
      sb.from("lojas").select("nome").eq("ativa", true).order("nome"),
      sb.from("checklists").select("id,created_at,loja,supervisor,respostas,total_problemas,nota").order("created_at",{ascending:false}).limit(5000),
      sb.from("acoes").select("*").limit(20000)
    ]);
    if (lj.error || ck.error) throw (lj.error || ck.error);
    S.lojas = lj.data.map(l=>l.nome);
    S.rows = ck.data;
    S.semTabelaAcoes = !!ac.error;
    S.acoes = {}; (ac.data||[]).forEach(a=>{ S.acoes[keyOf(a.checklist_id,a.item)] = a; });
    if (S.semTabelaAcoes) setStatus("A tabela do plano de ação ainda não existe no banco. Rode o arquivo <b>supabase/migracao-02-plano-de-acao.sql</b> no SQL Editor do Supabase para liberar status, valores e o relatório de gastos.","warn");
    else setStatus("");
    await assinarFotos();
    render();
    $("#upd").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }catch(e){
    setStatus("Não foi possível carregar os resultados. Verifique a internet e clique em Atualizar.","bad");
  }finally{ S.loading = false; b.disabled = false; b.textContent = "Atualizar"; }
}
// Último envio de cada loja
function ultimos(){
  const best = {};
  for (const r of S.rows) if (!best[r.loja] || r.created_at > best[r.loja].created_at) best[r.loja] = r;
  return Object.values(best).sort((a,b)=>a.loja.localeCompare(b.loja,"pt-BR"));
}
async function assinarFotos(){
  const paths = [];
  for (const r of ultimos()) for (const q of QS){ const a=r.respostas?.[q.id]; if (a && isProb(q,a.r)) (a.fotos||[]).forEach(p=>{ if(!S.fotoUrl[p]) paths.push(p); }); }
  for (let i=0;i<paths.length;i+=100){
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths.slice(i,i+100), 60*60*6);
    (data||[]).forEach(d=>{ if (d.signedUrl) S.fotoUrl[d.path] = d.signedUrl; });
  }
}
function acaoDe(cid,item){ return S.acoes[keyOf(cid,item)] || {checklist_id:cid,item,status:"nao_iniciado",valor:null,fornecedor:"",data_prevista:null,data_conclusao:null}; }
function problemas(subs){
  const out=[];
  for (const s of subs) for (const q of QS){ const a=s.respostas?.[q.id]; if (a && isProb(q,a.r)) out.push({s,q,a,acao:acaoDe(s.id,q.id)}); }
  return out.sort((x,y)=>(URG_ORD[x.a.urg]??3)-(URG_ORD[y.a.urg]??3) || x.s.loja.localeCompare(y.s.loja,"pt-BR") || x.q.id.localeCompare(y.q.id,undefined,{numeric:true}));
}
// Conformidade atual: item com problema cujo plano de ação está "Concluído" passa a contar como conforme
function scoreAtual(s, cat){
  let ok=0, tot=0;
  for (const q of QS){ if (cat && q.cat!==cat) continue; const r=s.respostas?.[q.id]?.r; if(!r||r==="NA") continue; tot++;
    if (!isProb(q,r) || acaoDe(s.id,q.id).status==="concluido") ok++; }
  return tot ? ok/tot : null;
}
const media = arr => { const v = arr.filter(x=>x!=null); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };

/* ---------- Aba: Visão geral ---------- */
function acompHTML(subs){
  const by = Object.fromEntries(subs.map(s=>[s.loja,s]));
  const feitas = S.lojas.filter(l=>by[l]), falt = S.lojas.filter(l=>!by[l]);
  S.falt = falt;
  const p = S.lojas.length ? feitas.length/S.lojas.length : 0;
  return `<div class="panel" style="margin-bottom:18px">
    <div class="sec-h"><h3>Acompanhamento de envio</h3><span class="mono"><b>${feitas.length}</b> de ${S.lojas.length} lojas concluíram · ${Math.round(p*100)}%</span></div>
    <div class="bar" style="height:10px;margin:0 0 18px"><i style="width:${p*100}%"></i></div>
    <div class="grid2">
      <div><div class="sec-h" style="margin-bottom:6px"><span class="eyebrow" style="color:var(--bad)">Faltam enviar · ${falt.length}</span>${falt.length?`<button class="btn small" id="cp-falt">Copiar lista para cobrança</button>`:""}</div>
        <ul class="lst">${falt.map(l=>`<li>${esc(l)}</li>`).join("") || `<li class="muted">Todas as lojas enviaram.</li>`}</ul></div>
      <div><div class="sec-h" style="margin-bottom:6px"><span class="eyebrow" style="color:var(--ok)">Concluídas · ${feitas.length}</span></div>
        <ul class="lst">${feitas.map(l=>{const s=by[l];return `<li>${esc(l)}<div class="note">${esc(s.supervisor)} · ${dataBR(s.created_at)} · nota atual ${pct(scoreAtual(s))}</div></li>`}).join("") || `<li class="muted">Nenhuma loja enviou ainda.</li>`}</ul></div>
    </div>
    <textarea id="cp-area" class="note" style="margin-top:10px;min-height:160px" hidden readonly></textarea>
    <span class="note" id="cp-msg"></span>
  </div>`;
}
function renderGeral(){
  const el = $("#t-geral"), subs = ultimos();
  if (!subs.length){
    el.innerHTML = acompHTML(subs) + `<div class="empty"><h3 style="color:var(--ink)">Nenhum checklist recebido ainda</h3><p style="margin:8px 0 0">Assim que os supervisores enviarem, este painel mostra a nota de cada loja, os itens mais críticos e o plano de ação por urgência.</p></div>`;
    bindAcomp(); return;
  }
  const probs = problemas(subs);
  const pend = probs.filter(x=>x.acao.status!=="concluido");
  const concl = probs.length - pend.length;
  const avgIni = media(subs.map(s=>scoreOf(s.respostas)));
  const avgAtu = media(subs.map(s=>scoreAtual(s)));
  const imed = pend.filter(x=>x.a.urg==="imediato").length;
  const scores = subs.map(s=>({s,p:scoreAtual(s),p0:scoreOf(s.respostas)})).sort((a,b)=>(a.p??2)-(b.p??2));
  const byQ = {}; pend.forEach(x=>{ (byQ[x.q.id] ||= {q:x.q,n:0}).n++; });
  const top = Object.values(byQ).sort((a,b)=>b.n-a.n).slice(0,10);

  el.innerHTML = acompHTML(subs) + `
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Lojas vistoriadas</span><div class="v">${subs.length}</div><span class="s">de ${S.lojas.length} lojas da rede</span></div>
    <div class="kpi"><span class="eyebrow">Conformidade atual</span><div class="v" style="color:${lvColor(avgAtu??0)}">${pct(avgAtu)}</div><span class="s">na vistoria: ${pct(avgIni)} · sobe com cada ação concluída</span></div>
    <div class="kpi"><span class="eyebrow">Ações concluídas</span><div class="v">${concl}<span style="font-size:18px;color:var(--muted)"> / ${probs.length}</span></div><span class="s">${pend.length} pendente(s)</span></div>
    <div class="kpi"><span class="eyebrow">Urgência imediata pendente</span><div class="v" style="color:${imed?"var(--bad)":"var(--ink)"}">${imed}</div><span class="s">para tratar primeiro</span></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="sec-h"><h3>Nota atual por loja</h3><span class="note">pior para melhor</span></div>
      <div class="rank">${scores.map(({s,p,p0})=>`<div class="r" title="Na vistoria: ${pct(p0)} · Atual: ${pct(p)}"><span class="nm">${esc(s.loja)}</span><span class="track"><i style="width:${(p??0)*100}%;background:${lvColor(p??0)}"></i></span><span class="mono" style="text-align:right">${pct(p)}</span></div>`).join("")}</div>
    </div>
    <div class="panel"><div class="sec-h"><h3>Itens mais críticos pendentes</h3><span class="note">nº de lojas</span></div>
      ${top.length ? `<table><tbody>${top.map(t=>`<tr><td class="mono muted">${t.q.id}</td><td>${esc(t.q.t)}</td><td class="num"><b>${t.n}</b></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Nenhum item pendente.</p>`}
    </div>
  </div>
  <div class="panel sec"><div class="sec-h"><h3>Conformidade por loja e área</h3><span class="note">atual, contando as ações concluídas · verde ≥ 90% · âmbar 70–89% · vermelho &lt; 70%</span></div>
    <div class="scroll"><table class="heat"><thead><tr><th>Loja</th>${CATS.map(c=>`<th class="num" title="${esc(c.nome)}">${c.n}. ${esc(c.nome.split(/[ /]/)[0])}</th>`).join("")}<th class="num">Geral</th><th class="num">Vistoria</th></tr></thead>
    <tbody>${subs.map(s=>`<tr><td>${esc(s.loja)}<div class="note">${esc(s.supervisor)} · ${dataBR(s.created_at)}</div></td>${CATS.map(c=>{const p=scoreAtual(s,c.n),p0=scoreOf(s.respostas,c.n);return `<td class="c ${lv(p)}" title="Na vistoria: ${pct(p0)}">${pct(p)}${p0!=null&&p!=null&&p>p0?`<div style="font-size:10.5px;font-weight:500">▲ de ${pct(p0)}</div>`:""}</td>`}).join("")}<td class="c ${lv(scoreAtual(s))}">${pct(scoreAtual(s))}</td><td class="c lv-na">${pct(scoreOf(s.respostas))}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
  bindAcomp();
}
function bindAcomp(){
  const b = $("#cp-falt"); if (!b) return;
  b.onclick = ()=>{
    const txt = `Lojas pendentes no Checklist Estrutural (${S.falt.length}):\n` + S.falt.map(l=>"- "+l).join("\n");
    const ok = ()=>{ $("#cp-msg").textContent = "Lista copiada. Cole no e-mail ou na mensagem de cobrança."; };
    const fallback = ()=>{ const a=$("#cp-area"); a.hidden=false; a.value=txt; a.select(); $("#cp-msg").textContent = "Selecione o texto acima e copie (Ctrl+C)."; };
    try{ navigator.clipboard.writeText(txt).then(ok, fallback); }catch(e){ fallback(); }
  };
}

/* ---------- Aba: Plano de ação ---------- */
function renderPlano(){
  const el = $("#t-plano"), subs = ultimos();
  if (!subs.length){ el.innerHTML = `<div class="empty">Nenhum checklist recebido ainda.</div>`; return; }
  const probs = problemas(subs), f = S.fp;
  const fl = probs.filter(x=>(!f.loja||x.s.loja===f.loja)&&(!f.urg||x.a.urg===f.urg)&&(!f.cat||String(x.q.cat)===f.cat)&&(!f.st||x.acao.status===f.st));
  const ro = S.semTabelaAcoes ? "disabled" : "";
  el.innerHTML = `<div class="panel"><div class="sec-h"><h3>Plano de ação</h3>
      <div class="row"><button class="btn small" id="exp-plano">Exportar plano (CSV)</button><button class="btn small" id="exp-tudo">Exportar todas as respostas</button></div></div>
    <div class="filters" style="margin-bottom:12px">
      <select id="fp-loja" aria-label="Filtrar loja"><option value="">Todas as lojas</option>${subs.map(s=>`<option ${f.loja===s.loja?"selected":""}>${esc(s.loja)}</option>`).join("")}</select>
      <select id="fp-urg" aria-label="Filtrar urgência"><option value="">Todas as urgências</option>${URG.map(([k,l])=>`<option value="${k}" ${f.urg===k?"selected":""}>${l}</option>`).join("")}</select>
      <select id="fp-cat" aria-label="Filtrar área"><option value="">Todas as áreas</option>${CATS.map(c=>`<option value="${c.n}" ${f.cat===String(c.n)?"selected":""}>${c.n}. ${esc(c.nome)}</option>`).join("")}</select>
      <select id="fp-st" aria-label="Filtrar status"><option value="">Todos os status</option>${STATUS.map(([k,l])=>`<option value="${k}" ${f.st===k?"selected":""}>${l}</option>`).join("")}</select>
      <span class="note" style="align-self:center">${fl.length} ação(ões)</span>
    </div>
    ${fl.length ? `<div class="scroll"><table class="plano"><thead><tr><th>Urgência</th><th>Loja</th><th>Item</th><th>Observação</th><th>Chamado</th><th>Fotos</th><th>Status</th><th class="num">Valor do serviço</th><th>Prestador</th><th>Previsão</th></tr></thead><tbody>
    ${fl.map(x=>{ const k=keyOf(x.s.id,x.q.id), ac=x.acao; return `<tr data-k="${esc(k)}" class="${ac.status==="concluido"?"done":""}">
      <td><span class="pill ${x.a.urg}">${URG_LABEL[x.a.urg]||"–"}</span></td><td>${esc(x.s.loja)}</td>
      <td style="min-width:240px"><span class="mono muted">${x.q.id}</span> ${esc(x.q.t)}<div class="note">${esc(x.q.catNome)}</div></td>
      <td style="min-width:180px">${esc(x.a.obs)}</td><td class="mono">${esc(x.a.chamado)||'<span class="muted">—</span>'}</td>
      <td><div class="ph">${(x.a.fotos||[]).map((p,i)=>S.fotoUrl[p]?`<a href="${esc(S.fotoUrl[p])}" target="_blank" rel="noopener"><img src="${esc(S.fotoUrl[p])}" alt="Foto ${i+1}" loading="lazy"></a>`:"").join("")}</div></td>
      <td><select class="ctl" data-f="status" data-st="${ac.status}" aria-label="Status" ${ro}>${STATUS.map(([v,l])=>`<option value="${v}" ${ac.status===v?"selected":""}>${l}</option>`).join("")}</select>
        <span class="saved" data-saved>${ac.status==="concluido"&&ac.data_conclusao?"Concluído em "+dataBR(ac.data_conclusao+"T12:00:00"):""}</span></td>
      <td><input class="ctl money" data-f="valor" inputmode="decimal" placeholder="R$ 0,00" value="${ac.valor!=null?brl(ac.valor):""}" aria-label="Valor do serviço" ${ro}></td>
      <td><input class="ctl" data-f="fornecedor" maxlength="120" placeholder="Empresa ou técnico" value="${esc(ac.fornecedor||"")}" aria-label="Prestador" ${ro}></td>
      <td><input class="ctl date" type="date" data-f="data_prevista" value="${ac.data_prevista||""}" aria-label="Data prevista" ${ro}></td>
    </tr>`; }).join("")}
    <tr class="sum-row"><td colspan="7">Total das ações filtradas</td><td class="num" id="sum-valor">${brl(fl.reduce((t,x)=>t+(Number(x.acao.valor)||0),0))}</td><td colspan="2"></td></tr>
    </tbody></table></div>` : `<p class="muted">Nenhuma ação para este filtro.</p>`}
    <p class="note" style="margin:10px 0 0">As alterações são salvas automaticamente. Ao marcar "Concluído", a data de conclusão é registrada e o item passa a contar como conforme na Visão geral.</p>
  </div>`;
  for (const k of ["loja","urg","cat","st"]) $("#fp-"+k).onchange = e=>{ S.fp[k]=e.target.value; renderPlano(); };
  $("#exp-plano").onclick = ()=>exportCSV("plano", probs);
  $("#exp-tudo").onclick = ()=>exportCSV("tudo", subs);
  S._plano = fl;
}
$("#t-plano").addEventListener("change", e=>{
  const ctl = e.target.closest("[data-f]"); if (!ctl) return;
  const tr = ctl.closest("tr[data-k]"), k = tr.dataset.k, [cid,item] = k.split("|");
  const ac = {...acaoDe(cid,item)}, f = ctl.dataset.f, msg = tr.querySelector("[data-saved]");
  if (f==="valor"){
    const v = parseBRL(ctl.value);
    if (Number.isNaN(v)){ msg.textContent = "Valor inválido. Use o formato 1.250,00"; msg.className = "saved err"; return; }
    ac.valor = v; ctl.value = v==null ? "" : brl(v);
  } else if (f==="status"){
    ac.status = ctl.value; ctl.dataset.st = ctl.value;
    if (ac.status!=="concluido") ac.data_conclusao = null;
  } else if (f==="fornecedor"){ ac.fornecedor = ctl.value.trim() || null; }
  else if (f==="data_prevista"){ ac.data_prevista = ctl.value || null; }
  salvarAcao(k, ac, tr, msg);
});
function salvarAcao(k, ac, tr, msg){
  S.acoes[k] = ac; // atualização otimista
  if (ac.status==="concluido") tr.classList.add("done"); else tr.classList.remove("done");
  $("#sum-valor") && ($("#sum-valor").textContent = brl((S._plano||[]).reduce((t,x)=>t+(Number(acaoDe(x.s.id,x.q.id).valor)||0),0)));
  msg.className = "saved"; msg.textContent = "Salvando…";
  const row = {checklist_id:ac.checklist_id, item:ac.item, status:ac.status, valor:ac.valor, fornecedor:ac.fornecedor||null, data_prevista:ac.data_prevista||null, data_conclusao:ac.data_conclusao||null};
  // uma gravação por vez em cada ação
  S.saving[k] = (S.saving[k]||Promise.resolve()).then(async ()=>{
    const { data, error } = await sb.from("acoes").upsert(row, {onConflict:"checklist_id,item"}).select().single();
    if (error){ msg.className = "saved err"; msg.textContent = "Não foi salvo. Verifique a internet e altere de novo."; return; }
    S.acoes[k] = data;
    msg.textContent = data.status==="concluido" && data.data_conclusao ? "Concluído em " + dataBR(data.data_conclusao+"T12:00:00") : "Salvo";
  });
}

/* ---------- Aba: Gastos e relatórios ---------- */
function linhasGasto(){
  // Todas as ações (itens com problema) dos últimos envios, com dados do plano
  return problemas(ultimos()).map(x=>({
    loja:x.s.loja, cat:x.q.cat, area:x.q.catNome, item:x.q.id, pergunta:x.q.t, urg:x.a.urg,
    status:x.acao.status, valor:Number(x.acao.valor)||0, temValor:x.acao.valor!=null,
    fornecedor:(x.acao.fornecedor||"").trim(), registro:x.s.created_at.slice(0,10), conclusao:x.acao.data_conclusao||"",
    prevista:x.acao.data_prevista||""
  }));
}
function filtrarGastos(L){
  const f = S.fg;
  return L.filter(r=>{
    if (f.loja && r.loja!==f.loja) return false;
    if (f.cat && String(r.cat)!==f.cat) return false;
    if (f.st && r.status!==f.st) return false;
    if (f.urg && r.urg!==f.urg) return false;
    const d = f.base==="conclusao" ? r.conclusao : r.registro;
    if ((f.de || f.ate) && !d) return false;
    if (f.de && d < f.de) return false;
    if (f.ate && d > f.ate) return false;
    return true;
  });
}
const DIMS = {
  status:{label:"Status", get:r=>ST_LABEL[r.status], order:r=>STATUS.findIndex(s=>s[0]===r.status)},
  area:{label:"Área", get:r=>r.area, order:r=>r.cat},
  urg:{label:"Urgência", get:r=>URG_LABEL[r.urg]||"Sem urgência", order:r=>URG_ORD[r.urg]??9},
  loja:{label:"Loja", get:r=>r.loja},
  fornecedor:{label:"Prestador", get:r=>r.fornecedor||"Sem prestador"},
  mes:{label:"Mês de conclusão", get:r=>r.conclusao? r.conclusao.slice(5,7)+"/"+r.conclusao.slice(0,4) : "Não concluído", order:r=>r.conclusao? r.conclusao.slice(0,7) : "9999"}
};
function agrupar(L, dim, met){
  const d = DIMS[dim], g = {};
  for (const r of L){ const k = d.get(r); (g[k] ||= {k, v:0, n:0, o:d.order?d.order(r):null}); g[k].v += r.valor; g[k].n++; }
  let arr = Object.values(g).map(x=>({...x, m: met==="valor"?x.v:x.n}));
  if (d.order) arr.sort((a,b)=> (a.o>b.o?1:a.o<b.o?-1:0)); else arr.sort((a,b)=>b.m-a.m);
  return arr;
}
function renderGastos(){
  const el = $("#t-gastos");
  const all = linhasGasto();
  if (!all.length){ el.innerHTML = `<div class="empty">Ainda não há ações no plano. Elas aparecem aqui quando os checklists registrarem itens com problema.</div>`; return; }
  const L = filtrarGastos(all), f = S.fg;
  const soma = fn => L.filter(fn).reduce((t,r)=>t+r.valor,0);
  const total = soma(()=>true), gasto = soma(r=>r.status==="concluido"), exec = soma(r=>r.status==="agendado"||r.status==="em_andamento"), aIni = soma(r=>r.status==="nao_iniciado");
  const semValor = L.filter(r=>!r.temValor).length;
  const lojas = [...new Set(all.map(r=>r.loja))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const segBtns = (grp, cur) => `<span class="seg" role="group" aria-label="Medida">${[["valor","Valor (R$)"],["qtd","Quantidade"]].map(([v,l])=>`<button data-met="${grp}" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`).join("")}</span>`;
  const dimSel = (id, cur, opts) => `<select id="${id}" aria-label="Agrupar por">${opts.map(k=>`<option value="${k}" ${cur===k?"selected":""}>${DIMS[k].label}</option>`).join("")}</select>`;

  el.innerHTML = `
  <div class="panel" style="margin-bottom:16px"><div class="ctl-row">
    <label>Loja<select id="fg-loja"><option value="">Todas</option>${lojas.map(l=>`<option ${f.loja===l?"selected":""}>${esc(l)}</option>`).join("")}</select></label>
    <label>Área<select id="fg-cat"><option value="">Todas</option>${CATS.map(c=>`<option value="${c.n}" ${f.cat===String(c.n)?"selected":""}>${c.n}. ${esc(c.nome)}</option>`).join("")}</select></label>
    <label>Status<select id="fg-st"><option value="">Todos</option>${STATUS.map(([k,l])=>`<option value="${k}" ${f.st===k?"selected":""}>${l}</option>`).join("")}</select></label>
    <label>Urgência<select id="fg-urg"><option value="">Todas</option>${URG.map(([k,l])=>`<option value="${k}" ${f.urg===k?"selected":""}>${l}</option>`).join("")}</select></label>
    <label>Período por<select id="fg-base"><option value="registro" ${f.base==="registro"?"selected":""}>Data da vistoria</option><option value="conclusao" ${f.base==="conclusao"?"selected":""}>Data de conclusão</option></select></label>
    <label>De<input type="date" id="fg-de" value="${f.de}"></label>
    <label>Até<input type="date" id="fg-ate" value="${f.ate}"></label>
    <button class="btn small" id="fg-limpar" style="align-self:flex-end">Limpar filtros</button>
    <button class="btn small" id="fg-exp" style="align-self:flex-end">Exportar relatório (CSV)</button>
  </div></div>

  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Valor total das ações</span><div class="v">${brl(total)}</div><span class="s">${L.length} ação(ões) no filtro</span></div>
    <div class="kpi"><span class="eyebrow">Gasto (concluído)</span><div class="v" style="color:var(--ok)">${brl(gasto)}</div><span class="s">${L.filter(r=>r.status==="concluido").length} serviço(s) concluído(s)</span></div>
    <div class="kpi"><span class="eyebrow">Em execução</span><div class="v">${brl(exec)}</div><span class="s">agendado + em andamento</span></div>
    <div class="kpi"><span class="eyebrow">A iniciar</span><div class="v">${brl(aIni)}</div><span class="s">${semValor} ação(ões) ainda sem valor</span></div>
  </div>

  <div class="grid2">
    <div class="panel"><div class="sec-h"><h3>Distribuição</h3><div class="ctl-row">${dimSel("pie-dim",S.pie.dim,["status","area","urg","loja","fornecedor"])}${segBtns("pie",S.pie.met)}</div></div>
      <div class="chart-box"><canvas id="ch-pie" role="img" aria-label="Gráfico de pizza"></canvas></div>
      <div class="legend" id="pie-legend"></div>
    </div>
    <div class="panel"><div class="sec-h"><h3>Comparativo</h3><div class="ctl-row">${dimSel("bar-dim",S.bar.dim,["loja","area","status","urg","fornecedor","mes"])}${segBtns("bar",S.bar.met)}</div></div>
      <div class="chart-box tall" id="bar-box"><canvas id="ch-bar" role="img" aria-label="Gráfico de barras"></canvas></div>
    </div>
  </div>

  <div class="grid2 sec">
    <div class="panel"><div class="sec-h"><h3>Por área</h3></div>${tabelaResumo(L,"area")}</div>
    <div class="panel"><div class="sec-h"><h3>Por loja</h3></div>${tabelaResumo(L,"loja")}</div>
  </div>`;

  const bind = (id,key)=>{ $(id).onchange = e=>{ S.fg[key]=e.target.value; renderGastos(); }; };
  bind("#fg-loja","loja"); bind("#fg-cat","cat"); bind("#fg-st","st"); bind("#fg-urg","urg"); bind("#fg-base","base"); bind("#fg-de","de"); bind("#fg-ate","ate");
  $("#fg-limpar").onclick = ()=>{ S.fg = {loja:"",cat:"",st:"",urg:"",base:"registro",de:"",ate:""}; renderGastos(); };
  $("#fg-exp").onclick = ()=>exportGastos(L);
  $("#pie-dim").onchange = e=>{ S.pie.dim = e.target.value; renderGastos(); };
  $("#bar-dim").onchange = e=>{ S.bar.dim = e.target.value; renderGastos(); };
  el.querySelectorAll("[data-met]").forEach(b=>b.onclick = ()=>{ S[b.dataset.met].met = b.dataset.v; renderGastos(); });
  desenharGraficos(L);
}
function tabelaResumo(L, dim){
  const g = {};
  for (const r of L){ const k = DIMS[dim].get(r); const x = (g[k] ||= {k,n:0,total:0,gasto:0,exec:0,ini:0,o:DIMS[dim].order?DIMS[dim].order(r):0});
    x.n++; x.total+=r.valor; if (r.status==="concluido") x.gasto+=r.valor; else if (r.status==="nao_iniciado") x.ini+=r.valor; else x.exec+=r.valor; }
  const arr = Object.values(g).sort((a,b)=> dim==="area" ? a.o-b.o : b.total-a.total || a.k.localeCompare(b.k,"pt-BR"));
  if (!arr.length) return `<p class="muted">Nenhuma ação neste filtro.</p>`;
  const t = arr.reduce((s,x)=>({n:s.n+x.n,total:s.total+x.total,gasto:s.gasto+x.gasto,exec:s.exec+x.exec,ini:s.ini+x.ini}),{n:0,total:0,gasto:0,exec:0,ini:0});
  return `<div class="scroll" style="max-height:420px;overflow-y:auto"><table><thead><tr><th>${DIMS[dim].label}</th><th class="num">Ações</th><th class="num">Valor total</th><th class="num">Gasto</th><th class="num">Em execução</th><th class="num">A iniciar</th></tr></thead><tbody>
    ${arr.map(x=>`<tr><td>${esc(x.k)}</td><td class="num">${x.n}</td><td class="num">${brl(x.total)}</td><td class="num">${brl(x.gasto)}</td><td class="num">${brl(x.exec)}</td><td class="num">${brl(x.ini)}</td></tr>`).join("")}
    <tr class="sum-row"><td>Total</td><td class="num">${t.n}</td><td class="num">${brl(t.total)}</td><td class="num">${brl(t.gasto)}</td><td class="num">${brl(t.exec)}</td><td class="num">${brl(t.ini)}</td></tr>
  </tbody></table></div>`;
}
function desenharGraficos(L){
  if (!window.Chart) return;
  Object.values(S.charts).forEach(c=>c.destroy()); S.charts = {};
  const ink = cssVar("--ink"), muted = cssVar("--muted"), surface = cssVar("--surface"), grid = cssVar("--chart-grid");
  const pal = ["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"].map(cssVar);
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = muted;
  const fmt = (met,v) => met==="valor" ? brl(v) : `${v} ação(ões)`;

  // Pizza: até 7 fatias + "Outros"
  let P = agrupar(L, S.pie.dim, S.pie.met).filter(x=>x.m>0);
  if (!DIMS[S.pie.dim].order) P.sort((a,b)=>b.m-a.m);
  if (P.length > 8){ const rest = P.slice(7); P = P.slice(0,7).concat([{k:"Outros ("+rest.length+")", m:rest.reduce((t,x)=>t+x.m,0)}]); }
  const colors = P.map((x,i)=> S.pie.dim==="status" ? cssVar(ST_COLOR[Object.keys(ST_LABEL).find(k=>ST_LABEL[k]===x.k)]||"--c8") : (x.k.startsWith("Outros")? muted : pal[i%8]));
  const totP = P.reduce((t,x)=>t+x.m,0);
  const leg = $("#pie-legend");
  if (!P.length){ leg.innerHTML = `<p class="muted">${S.pie.met==="valor"?"Nenhum valor lançado neste filtro. Lance os valores na aba Plano de ação.":"Nenhuma ação neste filtro."}</p>`; }
  else {
    leg.innerHTML = P.map((x,i)=>`<div class="li"><span class="sw" style="background:${colors[i]}"></span><span>${esc(x.k)}</span><span class="v">${fmt(S.pie.met,x.m)}</span><span class="pc">${Math.round(x.m/totP*100)}%</span></div>`).join("");
    S.charts.pie = new Chart($("#ch-pie"), { type:"pie",
      data:{ labels:P.map(x=>x.k), datasets:[{ data:P.map(x=>x.m), backgroundColor:colors, borderColor:surface, borderWidth:2, hoverOffset:6 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:c=>` ${c.label}: ${fmt(S.pie.met,c.parsed)} (${Math.round(c.parsed/totP*100)}%)` } } } } });
  }

  // Barras horizontais: uma cor, ordenadas
  const B = agrupar(L, S.bar.dim, S.bar.met);
  if (!DIMS[S.bar.dim].order) B.sort((a,b)=>b.m-a.m);
  const box = $("#bar-box");
  box.style.height = Math.max(220, B.length*30 + 50) + "px";
  if (!B.length){ box.innerHTML = `<p class="muted">Nenhuma ação neste filtro.</p>`; return; }
  S.charts.bar = new Chart($("#ch-bar"), { type:"bar",
    data:{ labels:B.map(x=>x.k), datasets:[{ data:B.map(x=>x.m), backgroundColor:pal[0], borderRadius:4, borderSkipped:"start", barThickness:16, maxBarThickness:18 }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>" "+fmt(S.bar.met,c.parsed.x) } } },
      scales:{ x:{ beginAtZero:true, grid:{color:grid}, border:{display:false}, ticks:{ color:muted, maxRotation:0, autoSkip:true, maxTicksLimit:5, callback:v=> S.bar.met==="valor" ? (v>=1000? "R$ "+(v/1000).toLocaleString("pt-BR")+" mil" : "R$ "+v) : v, precision:0 } },
               y:{ grid:{display:false}, border:{color:grid}, ticks:{ color:ink, autoSkip:false, font:{size:12} } } } } });
}

/* ---------- Exportações ---------- */
function baixarCSV(nome, rows){
  const q = v => `"${String(v??"").replace(/"/g,'""')}"`;
  const csv = "﻿" + rows.map(r=>r.map(q).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a");
  a.href = url; a.download = nome + "-" + new Date().toISOString().slice(0,10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 2000);
}
const valCSV = v => v==null || v==="" ? "" : Number(v).toFixed(2).replace(".",",");
const dCSV = d => d ? dataBR(d+"T12:00:00") : "";
function exportCSV(kind, data){
  if (kind==="plano"){
    baixarCSV("plano-de-acao-lojas", [["Urgência","Loja","Supervisor","Data vistoria","Item","Área","Pergunta","Observação","Chamado","Fotos","Status","Valor (R$)","Prestador","Previsão","Conclusão"]]
      .concat(data.map(x=>[URG_LABEL[x.a.urg]||"",x.s.loja,x.s.supervisor,dataBR(x.s.created_at),x.q.id,x.q.catNome,x.q.t,x.a.obs,x.a.chamado,(x.a.fotos||[]).length,ST_LABEL[x.acao.status],valCSV(x.acao.valor),x.acao.fornecedor||"",dCSV(x.acao.data_prevista),dCSV(x.acao.data_conclusao)])));
  } else {
    const rows = [["Loja","Supervisor","Data","Nota vistoria","Nota atual","Item","Área","Pergunta","Resposta","Situação","Urgência","Observação","Chamado","Status da ação","Valor (R$)"]];
    data.forEach(s=>QS.forEach(qq=>{ const a=s.respostas?.[qq.id]||{}, p=isProb(qq,a.r), ac=p?acaoDe(s.id,qq.id):null;
      rows.push([s.loja,s.supervisor,dataBR(s.created_at),pct(scoreOf(s.respostas)),pct(scoreAtual(s)),qq.id,qq.catNome,qq.t,a.r==="NA"?"Não se aplica":a.r,a.r==="NA"?"N/A":p?"Com problema":"Conforme",URG_LABEL[a.urg]||"",a.obs,a.chamado,ac?ST_LABEL[ac.status]:"",ac?valCSV(ac.valor):""]); }));
    baixarCSV("respostas-checklist-lojas", rows);
  }
}
function exportGastos(L){
  baixarCSV("relatorio-gastos-lojas", [["Loja","Área","Item","Pergunta","Urgência","Status","Valor (R$)","Prestador","Data vistoria","Previsão","Conclusão"]]
    .concat(L.map(r=>[r.loja,r.area,r.item,r.pergunta,URG_LABEL[r.urg]||"",ST_LABEL[r.status],r.temValor?valCSV(r.valor):"",r.fornecedor,dCSV(r.registro),dCSV(r.prevista),dCSV(r.conclusao)])));
}

/* ---------- Início ---------- */
(async ()=>{
  if (!sb){ show("login"); setStatus("O painel ainda não foi configurado: preencha o arquivo config.js com a URL e a chave pública do Supabase.","bad"); $("#lg-btn").disabled = true; return; }
  sb.auth.onAuthStateChange((event)=>{ if (event === "PASSWORD_RECOVERY"){ setStatus(""); show("senha"); } });
  if (/type=recovery/.test(location.hash)) return; // aguarda o evento de recuperação de senha
  entrar();
  // Atualiza sozinho a cada 2 min, exceto enquanto você edita o plano de ação
  setInterval(()=>{ if (!$("#v-painel").hidden && document.visibilityState==="visible" && !(S.tab==="plano" && $("#t-plano").contains(document.activeElement))) carregar(); }, 120000);
})();
