// Painel do administrador: login (Supabase Auth, e-mail e senha) + resultados.
// Só lê dados quem está na tabela public.admins (regras RLS do schema.sql).
const BUCKET = (window.CHECKLIST_CONFIG||{}).BUCKET_FOTOS || "fotos";
const sb = makeClient();
const S = { lojas:[], rows:[], fotoUrl:{}, filt:{loja:"",urg:"",cat:""}, falt:[], loading:false };

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
$("#btn-sair").onclick = async ()=>{ await sb.auth.signOut(); S.rows=[]; $("#v-painel").innerHTML=""; setStatus(""); show("login"); };
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

/* ---------- Dados ---------- */
async function carregar(){
  if (S.loading) return; S.loading = true;
  const b = $("#btn-atualizar"); b.disabled = true; b.textContent = "Atualizando…";
  try{
    const [lj, ck] = await Promise.all([
      sb.from("lojas").select("nome").eq("ativa", true).order("nome"),
      sb.from("checklists").select("id,created_at,loja,supervisor,respostas,total_problemas,nota").order("created_at",{ascending:false}).limit(5000)
    ]);
    if (lj.error || ck.error) throw (lj.error || ck.error);
    S.lojas = lj.data.map(l=>l.nome);
    S.rows = ck.data;
    await assinarFotos();
    renderPainel();
    $("#upd") && ($("#upd").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
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
function problemas(subs){
  const out=[]; for (const s of subs) for (const q of QS){ const a=s.respostas?.[q.id]; if (a && isProb(q,a.r)) out.push({s,q,a}); }
  return out.sort((x,y)=>(URG_ORD[x.a.urg]??3)-(URG_ORD[y.a.urg]??3) || x.s.loja.localeCompare(y.s.loja,"pt-BR") || x.q.id.localeCompare(y.q.id,undefined,{numeric:true}));
}

/* ---------- Painel ---------- */
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
        <ul class="lst">${feitas.map(l=>{const s=by[l];return `<li>${esc(l)}<div class="note">${esc(s.supervisor)} · ${dataBR(s.created_at)} · nota ${pct(scoreOf(s.respostas))}</div></li>`}).join("") || `<li class="muted">Nenhuma loja enviou ainda.</li>`}</ul></div>
    </div>
    <textarea id="cp-area" class="note" style="margin-top:10px;min-height:160px" hidden readonly></textarea>
    <span class="note" id="cp-msg"></span>
  </div>`;
}
function renderPainel(){
  const el = $("#v-painel");
  const subs = ultimos();
  const head = `<p class="note" id="upd" style="margin:-8px 0 14px"></p>`;
  if (!subs.length){
    el.innerHTML = head + acompHTML(subs) + `<div class="empty"><h3 style="color:var(--ink)">Nenhum checklist recebido ainda</h3><p style="margin:8px 0 0">Assim que os supervisores enviarem, este painel mostra a nota de cada loja, os itens mais críticos e o plano de ação por urgência.</p></div>`;
    bindAcomp(); return;
  }
  const probs = problemas(subs);
  const scores = subs.map(s=>({s,p:scoreOf(s.respostas)})).sort((a,b)=>(a.p??2)-(b.p??2));
  const valid = scores.filter(x=>x.p!=null);
  const avg = valid.reduce((t,x)=>t+x.p,0)/Math.max(1,valid.length);
  const imed = probs.filter(x=>x.a.urg==="imediato").length;
  const semCh = probs.filter(x=>!x.a.chamado).length;
  const byQ = {}; probs.forEach(x=>{ (byQ[x.q.id] ||= {q:x.q,n:0}).n++; });
  const top = Object.values(byQ).sort((a,b)=>b.n-a.n).slice(0,10);
  const f = S.filt;
  const fl = probs.filter(x=>(!f.loja||x.s.loja===f.loja)&&(!f.urg||x.a.urg===f.urg)&&(!f.cat||String(x.q.cat)===f.cat));

  el.innerHTML = head + acompHTML(subs) + `
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Lojas vistoriadas</span><div class="v">${subs.length}</div><span class="s">de ${S.lojas.length} lojas da rede</span></div>
    <div class="kpi"><span class="eyebrow">Conformidade média</span><div class="v" style="color:${lvColor(avg)}">${pct(avg)}</div><span class="s">itens sem problema, sem contar N/A</span></div>
    <div class="kpi"><span class="eyebrow">Itens com problema</span><div class="v">${probs.length}</div><span class="s">${semCh} sem chamado aberto</span></div>
    <div class="kpi"><span class="eyebrow">Urgência imediata</span><div class="v" style="color:${imed?"var(--bad)":"var(--ink)"}">${imed}</div><span class="s">para tratar primeiro</span></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="sec-h"><h3>Nota por loja</h3><span class="note">pior para melhor</span></div>
      <div class="rank">${scores.map(({s,p})=>`<div class="r"><span class="nm" title="${esc(s.loja)}">${esc(s.loja)}</span><span class="track"><i style="width:${(p??0)*100}%;background:${lvColor(p??0)}"></i></span><span class="mono" style="text-align:right">${pct(p)}</span></div>`).join("")}</div>
    </div>
    <div class="panel"><div class="sec-h"><h3>Itens mais críticos na rede</h3><span class="note">nº de lojas com problema</span></div>
      ${top.length ? `<table><tbody>${top.map(t=>`<tr><td class="mono muted">${t.q.id}</td><td>${esc(t.q.t)}</td><td class="num"><b>${t.n}</b></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Nenhum problema registrado.</p>`}
    </div>
  </div>
  <div class="panel sec"><div class="sec-h"><h3>Conformidade por loja e área</h3><span class="note">verde ≥ 90% · âmbar 70–89% · vermelho &lt; 70%</span></div>
    <div class="scroll"><table class="heat"><thead><tr><th>Loja</th>${CATS.map(c=>`<th class="num" title="${esc(c.nome)}">${c.n}. ${esc(c.nome.split(/[ /]/)[0])}</th>`).join("")}<th class="num">Geral</th></tr></thead>
    <tbody>${subs.map(s=>`<tr><td>${esc(s.loja)}<div class="note">${esc(s.supervisor)} · ${dataBR(s.created_at)}</div></td>${CATS.map(c=>{const p=scoreOf(s.respostas,c.n);return `<td class="c ${lv(p)}">${pct(p)}</td>`}).join("")}<td class="c ${lv(scoreOf(s.respostas))}">${pct(scoreOf(s.respostas))}</td></tr>`).join("")}</tbody></table></div>
  </div>
  <div class="panel sec"><div class="sec-h"><h3>Plano de ação</h3>
      <div class="row"><button class="btn small" id="exp-plano">Exportar plano (CSV)</button><button class="btn small" id="exp-tudo">Exportar todas as respostas</button></div></div>
    <div class="filters" style="margin-bottom:12px">
      <select id="f-loja" aria-label="Filtrar loja"><option value="">Todas as lojas</option>${subs.map(s=>`<option ${f.loja===s.loja?"selected":""}>${esc(s.loja)}</option>`).join("")}</select>
      <select id="f-urg" aria-label="Filtrar urgência"><option value="">Todas as urgências</option>${URG.map(([k,l])=>`<option value="${k}" ${f.urg===k?"selected":""}>${l}</option>`).join("")}</select>
      <select id="f-cat" aria-label="Filtrar área"><option value="">Todas as áreas</option>${CATS.map(c=>`<option value="${c.n}" ${f.cat===String(c.n)?"selected":""}>${c.n}. ${esc(c.nome)}</option>`).join("")}</select>
      <span class="note" style="align-self:center">${fl.length} ação(ões)</span>
    </div>
    ${fl.length ? `<div class="scroll"><table><thead><tr><th>Urgência</th><th>Loja</th><th>Item</th><th>Observação</th><th>Chamado</th><th>Fotos</th></tr></thead><tbody>
    ${fl.map(x=>`<tr><td><span class="pill ${x.a.urg}">${URG_LABEL[x.a.urg]||"–"}</span></td><td>${esc(x.s.loja)}</td>
      <td><span class="mono muted">${x.q.id}</span> ${esc(x.q.t)}<div class="note">${esc(x.q.catNome)}</div></td>
      <td>${esc(x.a.obs)}</td><td class="mono">${esc(x.a.chamado)||'<span class="muted">—</span>'}</td>
      <td><div class="ph">${(x.a.fotos||[]).map((p,i)=>S.fotoUrl[p]?`<a href="${esc(S.fotoUrl[p])}" target="_blank" rel="noopener"><img src="${esc(S.fotoUrl[p])}" alt="Foto ${i+1}" loading="lazy"></a>`:"").join("")}</div></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">Nenhuma ação para este filtro.</p>`}
  </div>`;
  for (const k of ["loja","urg","cat"]) $("#f-"+k).onchange = e=>{ S.filt[k]=e.target.value; renderPainel(); };
  $("#exp-plano").onclick = ()=>exportCSV("plano", probs);
  $("#exp-tudo").onclick = ()=>exportCSV("tudo", subs);
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
function exportCSV(kind, data){
  const q = v => `"${String(v??"").replace(/"/g,'""')}"`;
  let rows;
  if (kind==="plano"){
    rows = [["Urgência","Loja","Supervisor","Data","Item","Área","Pergunta","Resposta","Observação","Chamado","Fotos"]]
      .concat(data.map(x=>[URG_LABEL[x.a.urg]||"",x.s.loja,x.s.supervisor,dataBR(x.s.created_at),x.q.id,x.q.catNome,x.q.t,x.a.r,x.a.obs,x.a.chamado,(x.a.fotos||[]).length]));
  } else {
    rows = [["Loja","Supervisor","Data","Nota geral","Item","Área","Pergunta","Resposta","Situação","Urgência","Observação","Chamado"]];
    data.forEach(s=>QS.forEach(qq=>{ const a=s.respostas?.[qq.id]||{}; rows.push([s.loja,s.supervisor,dataBR(s.created_at),pct(scoreOf(s.respostas)),qq.id,qq.catNome,qq.t,a.r==="NA"?"Não se aplica":a.r,a.r==="NA"?"N/A":isProb(qq,a.r)?"Com problema":"Conforme",URG_LABEL[a.urg]||"",a.obs,a.chamado]); }));
  }
  const csv = "﻿" + rows.map(r=>r.map(q).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a");
  a.href = url; a.download = (kind==="plano"?"plano-de-acao-lojas":"respostas-checklist-lojas") + "-" + new Date().toISOString().slice(0,10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

/* ---------- Início ---------- */
(async ()=>{
  if (!sb){ show("login"); setStatus("O painel ainda não foi configurado: preencha o arquivo config.js com a URL e a chave pública do Supabase.","bad"); $("#lg-btn").disabled = true; return; }
  sb.auth.onAuthStateChange((event)=>{ if (event === "PASSWORD_RECOVERY"){ setStatus(""); show("senha"); } });
  if (/type=recovery/.test(location.hash)) return; // aguarda o evento de recuperação de senha
  entrar();
  setInterval(()=>{ if (!$("#v-painel").hidden && document.visibilityState==="visible") carregar(); }, 120000);
})();
