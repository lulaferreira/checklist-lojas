// Controle de contratos de locação — Facilities
// Abas: Contratos (painel + lista + novo/editar + aditivos), Cadastro (lojas, garantias, tempo de contrato),
// Minutas padrão (modelos .docx com campos preenchíveis) e Relatórios (filtros, gráficos e exportação).
// Acesso: mesmo login do painel do checklist (tabela public.admins).
const sb = makeClient();
const BK = "documentos";
const STC = [["vigente","Contrato vigente"],["pendente_renovacao","Pendente renovação"],["renovacao_andamento","Renovação em andamento"],["encerrado","Encerrado"]];
const STC_L = Object.fromEntries(STC);
const INDICES = ["IGP-M","IPCA","INPC","IVAR","Outro"];
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const D = { lojas:[], garantias:[], prazos:[], contratos:[], aditivos:[], minutas:[], fotoUrl:{} };
const UI = {
  tab:"contratos", busca:"", fSt:"", fReg:"", fVenc:"", cad:"lojas", buscaLoja:"",
  rel:{reg:"",uf:"",cidade:"",st:"",gar:"",prazo:"",ind:"",fach:"",logo:"",de:"",ate:"",enc:false},
  pie:{dim:"status",met:"qtd"}, bar:{dim:"regional",met:"custo"}, charts:{}, minuta:null, loading:false
};

/* ---------- utilitários ---------- */
const brl = v => v==null || v==="" ? "—" : Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const brlIn = v => v==null || v==="" ? "" : Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const parseBRL = s => { s = String(s??"").replace(/[^\d,.-]/g,""); if (!s) return null; if (s.includes(",")) s = s.replace(/\./g,"").replace(",","."); const n = Number(s); return isFinite(n) && n>=0 ? Math.round(n*100)/100 : NaN; };
const hojeISO = () => new Date().toLocaleDateString("en-CA");
const fmtD = iso => iso ? String(iso).slice(0,10).split("-").reverse().join("/") : "—";
function addMonthsISO(iso, m, menosUmDia){
  const [y,mo,d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo-1+m, 1)); const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth()+1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d,last)); if (menosUmDia) dt.setUTCDate(dt.getUTCDate()-1);
  return dt.toISOString().slice(0,10);
}
const addDaysISO = (iso,n) => { const dt = new Date(iso+"T12:00:00Z"); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); };
const diasAte = iso => Math.round((new Date(iso+"T12:00:00Z") - new Date(hojeISO()+"T12:00:00Z"))/864e5);
const uuid = () => crypto.randomUUID();
const slugify = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const lojaDe = nome => D.lojas.find(l=>l.nome===nome) || {nome};
const prazoDe = id => D.prazos.find(p=>p.id===Number(id));
const garDe = id => D.garantias.find(g=>g.id===Number(id));
const custo = c => ["valor_locacao","valor_condominio","valor_iptu","outros_tributos"].reduce((t,k)=>t+(Number(c[k])||0),0);
const enderecoLoja = l => [l.logradouro && (l.logradouro + (l.numero?", "+l.numero:"")), l.complemento, l.bairro, l.cidade && (l.cidade + (l.uf?"/"+l.uf:"")), l.cep && "CEP "+l.cep].filter(Boolean).join(" – ");
const simNao = v => v===true ? `<span class="pill ok">Sim</span>` : v===false ? `<span class="pill bad">Não</span>` : `<span class="muted">—</span>`;
function situacao(c){
  if (c.status==="encerrado") return {t:"Encerrado", cls:"neutral", ord:9e9};
  if (!c.data_fim) return {t:"Sem vencimento", cls:"neutral", ord:8e9};
  const d = diasAte(c.data_fim);
  if (d < 0) return {t:`Vencido há ${-d} dia(s)`, cls:"bad", ord:d};
  if (d <= 60) return {t:`Vence em ${d} dia(s)`, cls:"bad", ord:d};
  if (d <= 183) return {t:`Vence em ${d} dias`, cls:"warn", ord:d};
  return {t:`Vence em ${d} dias`, cls:"ok", ord:d};
}
function faixaVenc(c){
  if (c.status==="encerrado") return "Encerrado";
  if (!c.data_fim) return "Sem vencimento";
  const d = diasAte(c.data_fim);
  return d<0 ? "Vencido" : d<=60 ? "Até 60 dias" : d<=183 ? "61 dias a 6 meses" : d<=365 ? "6 a 12 meses" : "Mais de 12 meses";
}
function setStatus(html, kind){ $("#status").innerHTML = html ? `<div class="alert ${kind||"warn"}" style="margin-bottom:16px">${html}</div>` : ""; }
function show(v){ $("#v-login").hidden = v!=="login"; $("#v-app").hidden = v!=="app"; $("#userbar").hidden = v!=="app"; }

/* ---------- arquivos ---------- */
async function enviarArquivo(path, file, type){
  const { error } = await sb.storage.from(BK).upload(path, file, { contentType: type || file.type, upsert: true });
  if (error) throw error; return path;
}
async function abrirArquivo(path){
  const w = window.open("", "_blank");
  const { data, error } = await sb.storage.from(BK).createSignedUrl(path, 900);
  if (error || !data){ if (w) w.close(); setStatus("Não foi possível abrir o arquivo. Tente de novo.","bad"); return; }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
function reduzirFoto(file){
  return new Promise(res=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{ const k = Math.min(1, 1800/Math.max(img.width,img.height)); const c = document.createElement("canvas");
      c.width = Math.round(img.width*k); c.height = Math.round(img.height*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url); c.toBlob(b=>res(b||file),"image/jpeg",0.85); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}
function baixarBlob(blob, nome){
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g,""); document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 2000);
}
function baixarCSV(nome, rows){
  const q = v => `"${String(v??"").replace(/"/g,'""')}"`;
  baixarBlob(new Blob(["﻿" + rows.map(r=>r.map(q).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}), nome + "-" + hojeISO() + ".csv");
}
const numCSV = v => v==null || v==="" ? "" : Number(v).toFixed(2).replace(".",",");

/* ---------- diálogo ---------- */
const dlg = $("#dlg");
function abrirDlg(html){ dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); dlg.scrollTop = 0; }
function fecharDlg(){ if (dlg.open) dlg.close(); dlg.innerHTML = ""; }
dlg.addEventListener("click", e=>{ if (e.target.closest("[data-close]")) fecharDlg(); });

/* ---------- autenticação ---------- */
$("#f-login").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("#lg-email").value.trim(), senha = $("#lg-senha").value, err = $("#lg-err"), b = $("#lg-btn");
  if (!email || !senha){ err.textContent = "Informe e-mail e senha."; err.hidden = false; return; }
  b.disabled = true; b.textContent = "Entrando…";
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  b.disabled = false; b.textContent = "Entrar";
  if (error){ err.textContent = error.message==="Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar. Tente novamente."; err.hidden = false; return; }
  err.hidden = true; $("#lg-senha").value = ""; entrar();
});
$("#lg-esqueci").onclick = async ()=>{
  const email = $("#lg-email").value.trim(), err = $("#lg-err");
  if (!email){ err.textContent = "Digite seu e-mail no campo acima e clique de novo em \"Esqueci minha senha\"."; err.hidden = false; return; }
  await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("admin.html", location.href).href });
  err.hidden = true; setStatus("Se este e-mail for de um administrador, você vai receber um link para criar uma nova senha.","ok");
};
$("#btn-sair").onclick = async ()=>{ await sb.auth.signOut(); location.reload(); };
$("#btn-atualizar").onclick = ()=>carregar();
async function entrar(){
  const { data:{ session } } = await sb.auth.getSession();
  if (!session){ show("login"); return; }
  $("#user-email").textContent = session.user.email;
  const { data:isAdmin, error } = await sb.rpc("is_admin");
  if (error || !isAdmin){ await sb.auth.signOut(); show("login"); setStatus("Seu usuário não está autorizado. Peça para incluir seu e-mail na tabela de administradores.","bad"); return; }
  setStatus(""); show("app"); carregar();
}

/* ---------- abas ---------- */
document.querySelectorAll(".tabs [data-tab]").forEach(b=>b.onclick = ()=>abrirAba(b.dataset.tab));
function abrirAba(t){
  UI.tab = t;
  document.querySelectorAll(".tabs [data-tab]").forEach(b=>b.setAttribute("aria-selected", b.dataset.tab===t));
  for (const id of ["contratos","cadastro","minutas","relatorios"]) $("#t-"+id).hidden = id!==t;
  render();
}
function render(){ ({contratos:renderContratos, cadastro:renderCadastro, minutas:renderMinutas, relatorios:renderRelatorios})[UI.tab](); }

/* ---------- dados ---------- */
async function carregar(){
  if (UI.loading) return; UI.loading = true;
  const b = $("#btn-atualizar"); b.disabled = true; b.textContent = "Atualizando…";
  try{
    const r = await Promise.all([
      sb.from("lojas").select("*").order("nome"),
      sb.from("garantias").select("*").order("nome"),
      sb.from("prazos").select("*").order("ordem"),
      sb.from("contratos").select("*").limit(5000),
      sb.from("aditivos").select("*").order("criado_em").limit(10000),
      sb.from("minutas").select("*").order("nome")
    ]);
    const erro = r.find(x=>x.error);
    if (erro){
      const falta = /garantias|prazos|contratos|aditivos|minutas|column/i.test(erro.error.message||"") || ["42P01","PGRST205","42703"].includes(erro.error.code);
      setStatus(falta ? "O banco ainda não tem as tabelas de contratos. Rode o arquivo <b>supabase/migracao-03-contratos.sql</b> no SQL Editor do Supabase e clique em Atualizar." : "Não foi possível carregar os dados. Verifique a internet e clique em Atualizar.","bad");
      return;
    }
    [D.lojas, D.garantias, D.prazos, D.contratos, D.aditivos, D.minutas] = r.map(x=>x.data||[]);
    const paths = D.lojas.map(l=>l.foto_path).filter(Boolean);
    D.fotoUrl = {};
    for (let i=0;i<paths.length;i+=100){
      const { data } = await sb.storage.from(BK).createSignedUrls(paths.slice(i,i+100), 3600*6);
      (data||[]).forEach(d=>{ if (d.signedUrl) D.fotoUrl[d.path] = d.signedUrl; });
    }
    setStatus(""); render();
  }catch(e){ setStatus("Não foi possível carregar os dados. Verifique a internet e clique em Atualizar.","bad"); }
  finally{ UI.loading = false; b.disabled = false; b.textContent = "Atualizar"; }
}

/* =====================================================================
   ABA CONTRATOS
   ===================================================================== */
function renderContratos(){
  const el = $("#t-contratos"), hoje = hojeISO(), l6 = addMonthsISO(hoje,6), l12 = addMonthsISO(hoje,12), l60 = addDaysISO(hoje,60);
  const ativos = D.contratos.filter(c=>c.status!=="encerrado");
  const vig = ativos.filter(c=>!c.data_fim || c.data_fim>=hoje);
  const v6 = ativos.filter(c=>c.data_fim && c.data_fim>=hoje && c.data_fim<=l6);
  const v12 = ativos.filter(c=>c.data_fim && c.data_fim>=hoje && c.data_fim<=l12);
  const venc = ativos.filter(c=>c.data_fim && c.data_fim<hoje);
  const a60 = ativos.filter(c=>c.data_fim && c.data_fim>=hoje && c.data_fim<=l60).sort((a,b)=>a.data_fim.localeCompare(b.data_fim));
  const regs = [...new Set(D.lojas.map(l=>l.regional).filter(Boolean))].sort();
  const atencao = [...venc.sort((a,b)=>a.data_fim.localeCompare(b.data_fim)), ...a60];
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Contratos vigentes</span><div class="v">${vig.length}</div><span class="s">custo mensal ${brl(vig.reduce((t,c)=>t+custo(c),0))}</span></div>
    <div class="kpi"><span class="eyebrow">Vencem em até 6 meses</span><div class="v" style="color:${v6.length?"var(--warn)":"var(--ink)"}">${v6.length}</div><span class="s">até ${fmtD(l6)}</span></div>
    <div class="kpi"><span class="eyebrow">Vencem em até 12 meses</span><div class="v">${v12.length}</div><span class="s">até ${fmtD(l12)}</span></div>
    <div class="kpi"><span class="eyebrow">Vencidos sem renovação</span><div class="v" style="color:${venc.length?"var(--bad)":"var(--ink)"}">${venc.length}</div><span class="s">${a60.length} vencem em até 60 dias</span></div>
  </div>
  ${atencao.length ? `<div class="panel" style="margin-bottom:16px"><div class="sec-h" style="margin-bottom:8px"><h3>Atenção: vencidos e próximos 60 dias</h3><span class="note">clique para abrir</span></div>
    <div class="chips">${atencao.map(c=>{const s=situacao(c);return `<button class="btn small" data-abrir="${c.id}"><b>${esc(c.loja)}</b> · <span class="pill ${s.cls}">${s.t}</span></button>`}).join("")}</div></div>` : ""}
  <div class="panel">
    <div class="toolbar">
      <input type="search" id="ct-busca" placeholder="Buscar loja, locador ou cidade" value="${esc(UI.busca)}" aria-label="Buscar">
      <select id="ct-st" aria-label="Status"><option value="">Todos os status</option>${STC.map(([k,l])=>`<option value="${k}" ${UI.fSt===k?"selected":""}>${l}</option>`).join("")}</select>
      <select id="ct-reg" aria-label="Regional"><option value="">Todas as regionais</option>${regs.map(r=>`<option ${UI.fReg===r?"selected":""}>${esc(r)}</option>`).join("")}</select>
      <select id="ct-venc" aria-label="Vencimento"><option value="">Qualquer vencimento</option>${[["vencido","Vencidos"],["60","Até 60 dias"],["6m","Até 6 meses"],["12m","Até 12 meses"]].map(([k,l])=>`<option value="${k}" ${UI.fVenc===k?"selected":""}>${l}</option>`).join("")}</select>
      <span class="note" id="ct-count"></span>
      <button class="btn primary" id="btn-novo" style="margin-left:auto">Novo contrato</button>
    </div>
    <div class="scroll"><table><thead><tr><th>Loja</th><th>Regional</th><th>Locador</th><th>Vigência</th><th>Situação</th><th class="num">Aluguel</th><th class="num">Custo mensal</th><th>Status</th><th>PDF</th></tr></thead><tbody id="ct-tbody"></tbody></table></div>
  </div>`;
  $("#ct-busca").oninput = e=>{ UI.busca = e.target.value; tabelaContratos(); };
  $("#ct-st").onchange = e=>{ UI.fSt = e.target.value; tabelaContratos(); };
  $("#ct-reg").onchange = e=>{ UI.fReg = e.target.value; tabelaContratos(); };
  $("#ct-venc").onchange = e=>{ UI.fVenc = e.target.value; tabelaContratos(); };
  $("#btn-novo").onclick = ()=>formContrato(null);
  el.querySelectorAll("[data-abrir]").forEach(b=>b.onclick = ()=>abrirDetalhe(b.dataset.abrir));
  tabelaContratos();
}
function tabelaContratos(){
  const hoje = hojeISO(), q = UI.busca.trim().toLowerCase();
  const lim = {"60":addDaysISO(hoje,60), "6m":addMonthsISO(hoje,6), "12m":addMonthsISO(hoje,12)};
  const L = D.contratos.filter(c=>{
    const l = lojaDe(c.loja);
    if (q && !`${c.loja} ${c.locador_nome} ${l.cidade||""} ${l.bairro||""}`.toLowerCase().includes(q)) return false;
    if (UI.fSt && c.status!==UI.fSt) return false;
    if (UI.fReg && l.regional!==UI.fReg) return false;
    if (UI.fVenc){
      if (c.status==="encerrado" || !c.data_fim) return false;
      if (UI.fVenc==="vencido"){ if (c.data_fim>=hoje) return false; }
      else if (c.data_fim<hoje || c.data_fim>lim[UI.fVenc]) return false;
    }
    return true;
  }).sort((a,b)=>situacao(a).ord - situacao(b).ord || a.loja.localeCompare(b.loja,"pt-BR"));
  $("#ct-count").textContent = `${L.length} contrato(s)`;
  $("#ct-tbody").innerHTML = L.length ? L.map(c=>{ const l = lojaDe(c.loja), s = situacao(c); return `<tr class="click" data-id="${c.id}">
    <td><b>${esc(c.loja)}</b><div class="note">${esc([l.cidade,l.uf].filter(Boolean).join("/"))}</div></td>
    <td>${esc(l.regional||"—")}</td><td>${esc(c.locador_nome)}</td>
    <td style="white-space:nowrap">${fmtD(c.data_inicio)} a ${fmtD(c.data_fim)}<div class="note">${esc(prazoDe(c.prazo_id)?.nome||"")}</div></td>
    <td><span class="pill ${s.cls}">${s.t}</span></td>
    <td class="num">${brl(c.valor_locacao)}</td><td class="num">${brl(custo(c))}</td>
    <td>${esc(STC_L[c.status]||c.status)}</td>
    <td>${c.pdf_path?`<button class="btn small" data-pdf="${esc(c.pdf_path)}">Abrir</button>`:'<span class="muted">—</span>'}</td></tr>`; }).join("")
    : `<tr><td colspan="9"><div class="empty" style="margin:8px 0">${D.contratos.length ? "Nenhum contrato para este filtro." : "Nenhum contrato cadastrado ainda. Clique em <b>Novo contrato</b> para começar."}</div></td></tr>`;
  $("#ct-tbody").querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick = e=>{
    const p = e.target.closest("[data-pdf]"); if (p){ e.stopPropagation(); abrirArquivo(p.dataset.pdf); return; }
    abrirDetalhe(tr.dataset.id);
  });
}

/* ---------- formulário de contrato ---------- */
const fI = (name,label,val,o={}) => `<label class="${o.cls||""}">${label}<input name="${name}" type="${o.type||"text"}" value="${esc(val??"")}" ${o.attrs||""}></label>`;
const fM = (name,label,val,o={}) => `<label class="${o.cls||""}">${label}<input name="${name}" data-money inputmode="decimal" placeholder="0,00" value="${brlIn(val)}" ${o.attrs||""}></label>`;
const fS = (name,label,opts,val,o={}) => `<label class="${o.cls||""}">${label}<select name="${name}" ${o.attrs||""}>${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(val??"")===String(v)?"selected":""}>${esc(l)}</option>`).join("")}</select></label>`;
const fT = (name,label,val,o={}) => `<label class="${o.cls||"wall"}">${label}<textarea name="${name}" rows="3">${esc(val??"")}</textarea></label>`;

function formContrato(c){
  const novo = !c; c = c || {status:"vigente", locador_tipo:"PJ"};
  if (!D.lojas.length || !D.prazos.length){ setStatus("Cadastre lojas e tempos de contrato na aba Cadastro antes de criar contratos.","warn"); return; }
  const g = garDe(c.garantia_id);
  abrirDlg(`<form id="f-ct" novalidate>
  <div class="dlg-h"><h2>${novo?"Novo contrato":"Editar contrato · "+esc(c.loja)}</h2><button type="button" class="btn small" data-close>Fechar</button></div>
  <div class="dlg-b">
    <div class="fsec"><h3>Loja, prazo e status</h3><div class="fgrid">
      ${fS("loja","Loja *",[["","Selecione a loja"],...D.lojas.map(l=>[l.nome,l.nome])],c.loja,{cls:"w2"})}
      ${fS("prazo_id","Tempo de contrato",[["","Selecione"],...D.prazos.filter(p=>p.ativa||p.id===c.prazo_id).map(p=>[p.id,p.nome])],c.prazo_id)}
      ${fS("status","Status do contrato",STC,c.status)}
      ${fI("data_inicio","Início da vigência",c.data_inicio,{type:"date"})}
      ${fI("data_fim","Fim da vigência",c.data_fim,{type:"date"})}
      ${fI("responsavel","Responsável pela renovação",c.responsavel)}
    </div><p class="note" style="margin:6px 0 0">O fim da vigência é calculado pelo início e pelo tempo de contrato. Você pode ajustar.</p></div>

    <div class="fsec"><h3>Garantia</h3><div class="fgrid">
      ${fS("garantia_id","Tipo de garantia",[["","Selecione"],...D.garantias.filter(x=>x.ativa||x.id===c.garantia_id).map(x=>[x.id,x.nome])],c.garantia_id)}
      <span id="wrap-vg" ${g?.exige_valor?"":"hidden"}>${fM("valor_garantia","Valor da garantia (R$)",c.valor_garantia)}</span>
    </div></div>

    <div class="fsec"><h3>Locador</h3><div class="fgrid">
      ${fS("locador_tipo","Tipo",[["PJ","Pessoa jurídica"],["PF","Pessoa física"]],c.locador_tipo)}
      ${fI("locador_nome","Nome / Razão social *",c.locador_nome,{cls:"w2",attrs:'maxlength="200"'})}
      ${fI("locador_documento","CPF / CNPJ",c.locador_documento)}
      ${fI("locador_rg","RG / Inscrição estadual",c.locador_rg)}
      ${fI("locador_representante","Representante legal",c.locador_representante)}
      ${fI("locador_email","E-mail",c.locador_email,{type:"email"})}
      ${fI("locador_telefone","Telefone",c.locador_telefone,{type:"tel"})}
      ${fI("locador_endereco","Endereço do locador",c.locador_endereco,{cls:"w2"})}
      ${fI("locador_banco","Banco",c.locador_banco)}
      ${fI("locador_agencia","Agência",c.locador_agencia)}
      ${fI("locador_conta","Conta",c.locador_conta)}
      ${fI("locador_pix","Chave PIX",c.locador_pix)}
    </div></div>

    <div class="fsec"><h3>Valores mensais</h3><div class="fgrid">
      ${fM("valor_locacao","Valor da locação (R$)",c.valor_locacao)}
      ${fM("valor_condominio","Condomínio (R$)",c.valor_condominio)}
      ${fM("valor_iptu","IPTU (R$/mês)",c.valor_iptu)}
      ${fM("outros_tributos","Outros tributos (R$)",c.outros_tributos)}
      <div><span class="eyebrow">Total mensal</span><div id="ct-total" style="font-family:var(--f-display);font-size:22px;font-weight:800">${brl(custo(c))}</div></div>
    </div></div>

    <div class="fsec"><h3>Reajuste e rescisão</h3><div class="fgrid">
      ${fS("indice_reajuste","Índice de reajuste",[["","Selecione"],...INDICES.map(i=>[i,i])],c.indice_reajuste)}
      ${fI("data_ultimo_reajuste","Último reajuste",c.data_ultimo_reajuste,{type:"date"})}
      ${fI("proximo_reajuste","Próximo reajuste",c.proximo_reajuste,{type:"date"})}
      ${fI("multa_rescisoria","Multa rescisória",c.multa_rescisoria,{attrs:'placeholder="Ex.: 3 aluguéis"'})}
    </div></div>

    <div class="fsec"><h3>Observação e documento</h3><div class="fgrid">
      ${fT("observacao","Observação",c.observacao)}
      <label class="w2">Contrato em PDF<input type="file" name="pdf" accept="application/pdf"></label>
      <div class="note" style="align-self:end">${c.pdf_path?`Arquivo atual: <button type="button" class="linkbtn" data-pdf="${esc(c.pdf_path)}">abrir PDF</button>. Envie outro para substituir.`:"Nenhum PDF anexado."}</div>
    </div></div>
  </div>
  <div class="dlg-f"><span class="note" id="ct-msg" role="status"></span><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar contrato</button></div>
  </form>`);
  const f = $("#f-ct");
  const recalcFim = ()=>{ const m = prazoDe(f.prazo_id.value)?.meses; if (m && f.data_inicio.value) f.data_fim.value = addMonthsISO(f.data_inicio.value, m, true); };
  const recalcReaj = ()=>{ const base = f.data_ultimo_reajuste.value || f.data_inicio.value; if (base && !f.proximo_reajuste.dataset.manual) f.proximo_reajuste.value = addMonthsISO(base, 12); };
  f.prazo_id.onchange = recalcFim;
  f.data_inicio.onchange = ()=>{ recalcFim(); recalcReaj(); };
  f.data_ultimo_reajuste.onchange = recalcReaj;
  f.proximo_reajuste.oninput = ()=>{ f.proximo_reajuste.dataset.manual = "1"; };
  f.garantia_id.onchange = ()=>{ $("#wrap-vg").hidden = !garDe(f.garantia_id.value)?.exige_valor; };
  f.querySelectorAll("[data-money]").forEach(i=>{
    i.addEventListener("blur", ()=>{ const v = parseBRL(i.value); if (!Number.isNaN(v)) i.value = brlIn(v); });
    i.addEventListener("input", ()=>{ const t = ["valor_locacao","valor_condominio","valor_iptu","outros_tributos"].reduce((s,k)=>s+(parseBRL(f[k].value)||0),0); $("#ct-total").textContent = brl(t); });
  });
  f.querySelectorAll("[data-pdf]").forEach(b=>b.onclick = ()=>abrirArquivo(b.dataset.pdf));
  f.onsubmit = e=>{ e.preventDefault(); salvarContrato(f, novo ? null : c); };
}
async function salvarContrato(f, c){
  const msg = $("#ct-msg"), btn = f.querySelector("[type=submit]");
  const err = t => { msg.textContent = t; msg.style.color = "var(--bad)"; };
  const row = {};
  for (const el of f.elements){
    if (!el.name || el.type==="file") continue;
    let v = el.value.trim();
    if (el.hasAttribute("data-money")){ v = parseBRL(v); if (Number.isNaN(v)) return err(`Valor inválido em "${el.closest("label").childNodes[0].textContent.trim()}". Use o formato 1.250,00`); }
    else if (v==="") v = null;
    row[el.name] = v;
  }
  row.prazo_id = row.prazo_id ? Number(row.prazo_id) : null;
  row.garantia_id = row.garantia_id ? Number(row.garantia_id) : null;
  if (!garDe(row.garantia_id)?.exige_valor) row.valor_garantia = null;
  if (!row.loja) return err("Selecione a loja.");
  if (!row.locador_nome || row.locador_nome.length < 2) return err("Informe o nome do locador.");
  if (row.data_inicio && row.data_fim && row.data_fim < row.data_inicio) return err("O fim da vigência não pode ser antes do início.");
  const id = c?.id || uuid(), file = f.pdf.files[0];
  if (file && file.type!=="application/pdf") return err("O contrato precisa ser um arquivo PDF.");
  btn.disabled = true; msg.style.color = ""; msg.textContent = "Salvando…";
  try{
    if (file) row.pdf_path = await enviarArquivo(`contratos/${id}/contrato-${Date.now()}.pdf`, file, "application/pdf");
    const { error } = c ? await sb.from("contratos").update(row).eq("id", id) : await sb.from("contratos").insert({ id, ...row });
    if (error) throw error;
    fecharDlg(); await carregar(); abrirDetalhe(id);
  }catch(e){ btn.disabled = false; err("Não foi possível salvar. Verifique a internet e tente de novo."); }
}

/* ---------- detalhe do contrato + aditivos ---------- */
function abrirDetalhe(id, aba="dados"){
  const c = D.contratos.find(x=>x.id===id); if (!c) return;
  const l = lojaDe(c.loja), s = situacao(c), g = garDe(c.garantia_id), p = prazoDe(c.prazo_id);
  const ads = D.aditivos.filter(a=>a.contrato_id===id);
  const dd = (t,v) => `<div><dt>${t}</dt><dd>${v==null||v===""?"—":v}</dd></div>`;
  const dados = `
    <div class="fsec"><h3>Loja</h3><dl class="dl">
      ${dd("Loja",esc(c.loja))}${dd("Regional",esc(l.regional))}${dd("Endereço",esc(enderecoLoja(l)))}
      ${dd("Nova fachada",simNao(l.nova_fachada))}${dd("Logo interna",simNao(l.logo_interna))}</dl></div>
    <div class="fsec"><h3>Contrato</h3><dl class="dl">
      ${dd("Tempo de contrato",esc(p?.nome))}${dd("Vigência",`${fmtD(c.data_inicio)} a ${fmtD(c.data_fim)}`)}${dd("Situação",`<span class="pill ${s.cls}">${s.t}</span>`)}
      ${dd("Status",esc(STC_L[c.status]))}${dd("Garantia",esc(g?.nome))}${g?.exige_valor?dd("Valor da garantia",brl(c.valor_garantia)):""}
      ${dd("Índice de reajuste",esc(c.indice_reajuste))}${dd("Último reajuste",fmtD(c.data_ultimo_reajuste))}${dd("Próximo reajuste",fmtD(c.proximo_reajuste))}
      ${dd("Multa rescisória",esc(c.multa_rescisoria))}${dd("Responsável",esc(c.responsavel))}${dd("Aditivos",ads.length)}</dl></div>
    <div class="fsec"><h3>Valores mensais</h3><dl class="dl">
      ${dd("Locação",brl(c.valor_locacao))}${dd("Condomínio",brl(c.valor_condominio))}${dd("IPTU",brl(c.valor_iptu))}${dd("Outros tributos",brl(c.outros_tributos))}
      ${dd("Total mensal",`<b>${brl(custo(c))}</b>`)}${dd("Total anual",brl(custo(c)*12))}</dl></div>
    <div class="fsec"><h3>Locador</h3><dl class="dl">
      ${dd("Nome / Razão social",esc(c.locador_nome))}${dd("Tipo",c.locador_tipo==="PF"?"Pessoa física":c.locador_tipo==="PJ"?"Pessoa jurídica":"")}${dd("CPF / CNPJ",esc(c.locador_documento))}
      ${dd("RG / IE",esc(c.locador_rg))}${dd("Representante",esc(c.locador_representante))}${dd("E-mail",esc(c.locador_email))}${dd("Telefone",esc(c.locador_telefone))}
      ${dd("Endereço",esc(c.locador_endereco))}${dd("Banco / Agência / Conta",esc([c.locador_banco,c.locador_agencia,c.locador_conta].filter(Boolean).join(" · ")))}${dd("PIX",esc(c.locador_pix))}</dl></div>
    ${c.observacao?`<div class="fsec"><h3>Observação</h3><p style="margin:0;white-space:pre-wrap">${esc(c.observacao)}</p></div>`:""}
    <p class="note" style="margin-top:18px">Atualizado em ${new Date(c.atualizado_em).toLocaleString("pt-BR")}${c.atualizado_por?" por "+esc(c.atualizado_por):""}</p>`;
  const ultimo = ads[ads.length-1];
  const aditivos = `
    ${ads.length ? `<div class="scroll"><table><thead><tr><th>Registrado</th><th>Assinatura</th><th>Nova vigência</th><th class="num">Valor anterior</th><th class="num">Novo valor</th><th>Prazo</th><th>PDF</th></tr></thead><tbody>
      ${ads.map(a=>`<tr><td>${fmtD(a.criado_em)}<div class="note">${esc(a.criado_por||"")}</div></td><td>${fmtD(a.data_assinatura)}</td>
        <td>${fmtD(a.data_inicio)} a ${fmtD(a.nova_data_fim)}<div class="note">antes: até ${fmtD(a.data_fim_anterior)}</div></td>
        <td class="num">${brl(a.valor_anterior)}</td><td class="num"><b>${brl(a.novo_valor_locacao)}</b></td><td>${esc(prazoDe(a.prazo_id)?.nome||"—")}</td>
        <td>${a.pdf_path?`<button type="button" class="btn small" data-pdf="${esc(a.pdf_path)}">Abrir</button>`:'<span class="muted">—</span>'}</td></tr>
        ${a.observacao?`<tr><td></td><td colspan="6" class="note" style="padding-top:0">${esc(a.observacao)}</td></tr>`:""}`).join("")}
    </tbody></table></div>` : `<p class="muted" style="margin-top:0">Nenhum aditivo registrado.</p>`}
    <form id="f-ad" class="fsec" novalidate style="border-top:1px solid var(--line);padding-top:16px"><h3>Registrar aditivo de renovação</h3>
      <div class="fgrid">
        ${fI("data_assinatura","Data de assinatura",hojeISO(),{type:"date"})}
        ${fI("data_inicio","Início da nova vigência",c.data_fim?addDaysISO(c.data_fim,1):"",{type:"date"})}
        ${fS("prazo_id","Novo prazo",[["","Selecione"],...D.prazos.filter(x=>x.ativa).map(x=>[x.id,x.nome])],"")}
        ${fI("nova_data_fim","Nova data de vencimento","",{type:"date"})}
        ${fM("novo_valor_locacao","Novo valor da locação (R$)",ultimo?.novo_valor_locacao ?? c.valor_locacao)}
        <label class="w2">Aditivo em PDF<input type="file" name="pdf" accept="application/pdf"></label>
        ${fT("observacao","Observação","")}
      </div>
      <p class="note">Ao salvar, o contrato passa a ter o novo valor, a nova data de vencimento e o status "Contrato vigente". O histórico fica guardado aqui.</p>
      <div class="row"><button class="btn primary" type="submit">Salvar aditivo</button><span class="note" id="ad-msg" role="status"></span></div>
    </form>`;
  abrirDlg(`
  <div class="dlg-h"><div><span class="eyebrow">Contrato de locação</span><h2>${esc(c.loja)} <span class="pill ${s.cls}" style="vertical-align:middle">${s.t}</span></h2></div>
    <div class="row"><nav class="subtabs" style="margin:0;border:0">
      <button type="button" data-aba="dados" aria-selected="${aba==="dados"}">Dados</button>
      <button type="button" data-aba="aditivos" aria-selected="${aba==="aditivos"}">Aditivo${ads.length?" ("+ads.length+")":""}</button></nav>
      <button type="button" class="btn small" data-close>Fechar</button></div></div>
  <div class="dlg-b">${aba==="dados"?dados:aditivos}</div>
  ${aba==="dados"?`<div class="dlg-f"><span class="confirm" id="del-area"><button type="button" class="btn" id="btn-del" style="color:var(--bad)">Excluir</button></span>
    <span style="flex:1"></span>${c.pdf_path?`<button type="button" class="btn" data-pdf="${esc(c.pdf_path)}">Abrir contrato (PDF)</button>`:""}
    <button type="button" class="btn primary" id="btn-edit">Editar</button></div>`:""}`);
  dlg.querySelectorAll("[data-aba]").forEach(b=>b.onclick = ()=>abrirDetalhe(id, b.dataset.aba));
  dlg.querySelectorAll("[data-pdf]").forEach(b=>b.onclick = ()=>abrirArquivo(b.dataset.pdf));
  if (aba==="dados"){
    $("#btn-edit").onclick = ()=>formContrato(c);
    $("#btn-del").onclick = ()=>{
      $("#del-area").innerHTML = `<span class="note" style="color:var(--bad)">Excluir este contrato e seus aditivos?</span><button type="button" class="btn small" id="del-sim" style="color:var(--bad)">Sim, excluir</button><button type="button" class="btn small" id="del-nao">Cancelar</button>`;
      $("#del-nao").onclick = ()=>abrirDetalhe(id);
      $("#del-sim").onclick = async ()=>{ const { error } = await sb.from("contratos").delete().eq("id", id); if (error){ setStatus("Não foi possível excluir.","bad"); return; } fecharDlg(); carregar(); };
    };
  } else {
    const f = $("#f-ad");
    const recalc = ()=>{ const m = prazoDe(f.prazo_id.value)?.meses; if (m && f.data_inicio.value) f.nova_data_fim.value = addMonthsISO(f.data_inicio.value, m, true); };
    f.prazo_id.onchange = recalc; f.data_inicio.onchange = recalc;
    f.novo_valor_locacao.addEventListener("blur", ()=>{ const v = parseBRL(f.novo_valor_locacao.value); if (!Number.isNaN(v)) f.novo_valor_locacao.value = brlIn(v); });
    f.onsubmit = async e=>{
      e.preventDefault();
      const msg = $("#ad-msg"), err = t=>{ msg.textContent = t; msg.style.color = "var(--bad)"; };
      const valor = parseBRL(f.novo_valor_locacao.value);
      if (Number.isNaN(valor)) return err("Novo valor inválido. Use o formato 1.250,00");
      if (!f.nova_data_fim.value && valor==null) return err("Informe a nova data de vencimento ou o novo valor.");
      if (f.data_inicio.value && f.nova_data_fim.value && f.nova_data_fim.value < f.data_inicio.value) return err("O vencimento não pode ser antes do início.");
      const file = f.pdf.files[0];
      if (file && file.type!=="application/pdf") return err("O aditivo precisa ser um arquivo PDF.");
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; msg.style.color = ""; msg.textContent = "Salvando…";
      try{
        const aid = uuid(), row = { id:aid, contrato_id:id, data_assinatura:f.data_assinatura.value||null, data_inicio:f.data_inicio.value||null,
          prazo_id:f.prazo_id.value?Number(f.prazo_id.value):null, nova_data_fim:f.nova_data_fim.value||null, novo_valor_locacao:valor, observacao:f.observacao.value.trim()||null };
        if (file) row.pdf_path = await enviarArquivo(`contratos/${id}/aditivo-${Date.now()}.pdf`, file, "application/pdf");
        const { error } = await sb.from("aditivos").insert(row);
        if (error) throw error;
        await carregar(); abrirDetalhe(id, "aditivos");
      }catch(e2){ btn.disabled = false; err("Não foi possível salvar o aditivo. Tente de novo."); }
    };
  }
}

/* =====================================================================
   ABA CADASTRO
   ===================================================================== */
function renderCadastro(){
  const el = $("#t-cadastro");
  el.innerHTML = `<nav class="subtabs" aria-label="Cadastros">
      ${[["lojas","Lojas"],["garantias","Garantias"],["prazos","Tempo de contrato"]].map(([k,l])=>`<button data-cad="${k}" aria-selected="${UI.cad===k}">${l}</button>`).join("")}
    </nav><div id="cad-body"></div>`;
  el.querySelectorAll("[data-cad]").forEach(b=>b.onclick = ()=>{ UI.cad = b.dataset.cad; renderCadastro(); });
  ({lojas:cadLojas, garantias:cadGarantias, prazos:cadPrazos})[UI.cad]();
}
function cadLojas(){
  const body = $("#cad-body"), tot = D.lojas.length;
  const fach = D.lojas.filter(l=>l.nova_fachada===true).length, logo = D.lojas.filter(l=>l.logo_interna===true).length;
  const semEnd = D.lojas.filter(l=>!l.cidade).length;
  body.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Lojas cadastradas</span><div class="v">${tot}</div><span class="s">${D.lojas.filter(l=>l.ativa).length} ativas no checklist</span></div>
    <div class="kpi"><span class="eyebrow">Nova fachada</span><div class="v">${fach}</div><span class="s">${tot?Math.round(fach/tot*100):0}% das lojas</span></div>
    <div class="kpi"><span class="eyebrow">Logo interna</span><div class="v">${logo}</div><span class="s">${tot?Math.round(logo/tot*100):0}% das lojas</span></div>
    <div class="kpi"><span class="eyebrow">Cadastro incompleto</span><div class="v" style="color:${semEnd?"var(--warn)":"var(--ink)"}">${semEnd}</div><span class="s">lojas sem endereço</span></div>
  </div>
  <div class="panel"><div class="toolbar">
    <input type="search" id="lj-busca" placeholder="Buscar loja, cidade ou regional" value="${esc(UI.buscaLoja)}" aria-label="Buscar loja">
    <button class="btn primary" id="lj-nova" style="margin-left:auto">Nova loja</button></div>
    <div class="scroll"><table><thead><tr><th>Foto</th><th>Loja</th><th>Cidade/UF</th><th>Regional</th><th>Nova fachada</th><th>Logo interna</th><th>Foto atualizada</th><th class="num">Contratos</th></tr></thead><tbody id="lj-tbody"></tbody></table></div>
  </div>`;
  $("#lj-busca").oninput = e=>{ UI.buscaLoja = e.target.value; tabelaLojas(); };
  $("#lj-nova").onclick = ()=>formLoja(null);
  tabelaLojas();
}
function tabelaLojas(){
  const q = UI.buscaLoja.trim().toLowerCase();
  const L = D.lojas.filter(l=>!q || `${l.nome} ${l.cidade||""} ${l.regional||""} ${l.bairro||""}`.toLowerCase().includes(q));
  $("#lj-tbody").innerHTML = L.map(l=>`<tr class="click" data-nome="${esc(l.nome)}">
    <td>${l.foto_path && D.fotoUrl[l.foto_path] ? `<img class="thumb" src="${esc(D.fotoUrl[l.foto_path])}" alt="" loading="lazy">` : `<div class="thumb"></div>`}</td>
    <td><b>${esc(l.nome)}</b>${l.ativa?"":' <span class="pill neutral">inativa</span>'}<div class="note">${esc([l.logradouro,l.numero].filter(Boolean).join(", "))}</div></td>
    <td>${esc([l.cidade,l.uf].filter(Boolean).join("/")||"—")}</td><td>${esc(l.regional||"—")}</td>
    <td>${simNao(l.nova_fachada)}</td><td>${simNao(l.logo_interna)}</td>
    <td>${l.foto_data?fmtD(l.foto_data):'<span class="muted">sem foto</span>'}</td>
    <td class="num">${D.contratos.filter(c=>c.loja===l.nome).length}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhuma loja encontrada.</td></tr>`;
  $("#lj-tbody").querySelectorAll("tr[data-nome]").forEach(tr=>tr.onclick = ()=>formLoja(tr.dataset.nome));
}
function formLoja(nome){
  const l = nome ? lojaDe(nome) : {ativa:true}, nova = !nome;
  const regs = [...new Set(D.lojas.map(x=>x.regional).filter(Boolean))].sort();
  const radio = (name, v) => `<div class="radios">${[["true","Sim"],["false","Não"]].map(([val,t])=>`<label><input type="radio" name="${name}" value="${val}" ${String(v)===val?"checked":""}> ${t}</label>`).join("")}</div>`;
  abrirDlg(`<form id="f-lj" novalidate>
  <div class="dlg-h"><h2>${nova?"Nova loja":esc(l.nome)}</h2><button type="button" class="btn small" data-close>Fechar</button></div>
  <div class="dlg-b">
    <div class="fsec"><h3>Identificação</h3><div class="fgrid">
      ${fI("nome","Nome da loja *",l.nome,{cls:"w2",attrs:'maxlength="120"'})}
      <label>Regional<input name="regional" list="dl-reg" value="${esc(l.regional||"")}" placeholder="Ex.: Nordeste"><datalist id="dl-reg">${regs.map(r=>`<option value="${esc(r)}">`).join("")}</datalist></label>
      <label>Ativa no checklist${radio("ativa", l.ativa)}</label>
    </div>${nova?"":`<p class="note" style="margin:6px 0 0">Se mudar o nome, ele é atualizado também nos checklists e contratos desta loja.</p>`}</div>
    <div class="fsec"><h3>Endereço</h3><div class="fgrid">
      <label>CEP<span class="row" style="gap:6px;flex-wrap:nowrap"><input name="cep" value="${esc(l.cep||"")}" inputmode="numeric" placeholder="00000-000" style="flex:1;min-width:0;width:auto"><button type="button" class="btn small" id="btn-cep">Buscar</button></span></label>
      ${fI("logradouro","Logradouro",l.logradouro,{cls:"w2"})}
      ${fI("numero","Número",l.numero)}
      ${fI("complemento","Complemento",l.complemento)}
      ${fI("bairro","Bairro",l.bairro)}
      ${fI("cidade","Cidade",l.cidade)}
      ${fS("uf","UF",[["",""],...UFS.map(u=>[u,u])],l.uf)}
    </div><span class="note" id="cep-msg"></span></div>
    <div class="fsec"><h3>Padrão visual</h3><div class="fgrid">
      <label>Nova fachada${radio("nova_fachada", l.nova_fachada)}</label>
      <label>Logo interna${radio("logo_interna", l.logo_interna)}</label>
    </div></div>
    <div class="fsec"><h3>Foto da loja</h3>
      ${l.foto_path && D.fotoUrl[l.foto_path] ? `<img class="foto-loja" src="${esc(D.fotoUrl[l.foto_path])}" alt="Foto da loja ${esc(l.nome||"")}"><p class="note">Foto inserida em ${new Date(l.foto_data).toLocaleString("pt-BR")}</p>` : `<p class="note">Nenhuma foto ainda.</p>`}
      <label class="btn small file-btn" style="display:inline-block;margin-top:6px"><span id="foto-lbl">${l.foto_path?"Enviar foto atualizada":"Inserir foto"}</span><input type="file" name="foto" accept="image/*"></label>
    </div>
  </div>
  <div class="dlg-f"><span class="note" id="lj-msg" role="status"></span><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar loja</button></div>
  </form>`);
  const f = $("#f-lj");
  f.foto.onchange = ()=>{ $("#foto-lbl").textContent = f.foto.files[0] ? "Foto selecionada: " + f.foto.files[0].name : "Inserir foto"; };
  $("#btn-cep").onclick = async ()=>{
    const cep = f.cep.value.replace(/\D/g,""), m = $("#cep-msg");
    if (cep.length!==8){ m.textContent = "Digite um CEP com 8 números."; return; }
    m.textContent = "Buscando…";
    try{ const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const j = await r.json();
      if (j.erro){ m.textContent = "CEP não encontrado. Preencha o endereço manualmente."; return; }
      f.cep.value = cep.replace(/(\d{5})(\d{3})/,"$1-$2"); f.logradouro.value = j.logradouro||""; f.bairro.value = j.bairro||""; f.cidade.value = j.localidade||""; f.uf.value = j.uf||"";
      m.textContent = "Endereço preenchido. Confira e complete o número."; f.numero.focus();
    }catch(e){ m.textContent = "Não foi possível consultar o CEP agora. Preencha manualmente."; }
  };
  f.onsubmit = async e=>{
    e.preventDefault();
    const msg = $("#lj-msg"), err = t=>{ msg.textContent = t; msg.style.color = "var(--bad)"; };
    const val = n => { const x = f.elements[n]; return x ? (x.value||"").trim() || null : null; };
    const radioVal = n => { const r = f.querySelector(`[name=${n}]:checked`); return r ? r.value==="true" : null; };
    const row = { nome:val("nome"), regional:val("regional"), cep:val("cep"), logradouro:val("logradouro"), numero:val("numero"), complemento:val("complemento"),
      bairro:val("bairro"), cidade:val("cidade"), uf:val("uf"), nova_fachada:radioVal("nova_fachada"), logo_interna:radioVal("logo_interna"), ativa:radioVal("ativa") ?? true };
    if (!row.nome || row.nome.length<2) return err("Informe o nome da loja.");
    if (nova && D.lojas.some(x=>x.nome.toLowerCase()===row.nome.toLowerCase())) return err("Já existe uma loja com esse nome.");
    const btn = f.querySelector("[type=submit]"); btn.disabled = true; msg.style.color = ""; msg.textContent = "Salvando…";
    try{
      const file = f.foto.files[0];
      if (file){ const blob = await reduzirFoto(file); row.foto_path = await enviarArquivo(`lojas/${slugify(row.nome)}/foto-${Date.now()}.jpg`, blob, "image/jpeg"); row.foto_data = new Date().toISOString(); }
      const { error } = nova ? await sb.from("lojas").insert(row) : await sb.from("lojas").update(row).eq("nome", l.nome);
      if (error) throw error;
      fecharDlg(); await carregar();
    }catch(e2){ btn.disabled = false; err(e2?.code==="23505" ? "Já existe uma loja com esse nome." : "Não foi possível salvar. Tente de novo."); }
  };
}
function cadGarantias(){
  const body = $("#cad-body");
  body.innerHTML = `<div class="panel narrow" style="max-width:720px">
    <p class="note" style="margin-top:0">Marque "Pede valor" nas garantias em que o contrato precisa informar um valor (ex.: caução). Desative as que não usa mais. Elas continuam nos contratos antigos.</p>
    <table><thead><tr><th>Garantia</th><th>Pede valor</th><th>Ativa</th><th class="num">Contratos</th><th></th></tr></thead><tbody>
    ${D.garantias.map(g=>`<tr data-id="${g.id}"><td><input class="ctl" data-f="nome" value="${esc(g.nome)}" maxlength="80" style="min-width:200px;padding:7px 9px"></td>
      <td><input type="checkbox" data-f="exige_valor" ${g.exige_valor?"checked":""} aria-label="Pede valor"></td>
      <td><input type="checkbox" data-f="ativa" ${g.ativa?"checked":""} aria-label="Ativa"></td>
      <td class="num">${D.contratos.filter(c=>c.garantia_id===g.id).length}</td><td><span class="saved"></span></td></tr>`).join("")}
    </tbody></table>
    <form id="f-gar" class="row" style="margin-top:14px" novalidate><input name="nome" placeholder="Nova garantia" maxlength="80" style="flex:1;min-width:180px">
      <label class="row" style="gap:6px;font-size:13.5px"><input type="checkbox" name="exige_valor" style="width:auto"> Pede valor</label>
      <button class="btn primary" type="submit">Adicionar</button><span class="note" id="gar-msg"></span></form></div>`;
  ligarEdicaoTabela(body, "garantias", r=>({nome:r.querySelector('[data-f=nome]').value.trim(), exige_valor:r.querySelector('[data-f=exige_valor]').checked, ativa:r.querySelector('[data-f=ativa]').checked}), x=>x.nome.length>=2);
  $("#f-gar").onsubmit = async e=>{ e.preventDefault(); const f = e.target, nome = f.nome.value.trim();
    if (nome.length<2){ $("#gar-msg").textContent = "Digite o nome da garantia."; return; }
    const { error } = await sb.from("garantias").insert({ nome, exige_valor:f.exige_valor.checked });
    if (error){ $("#gar-msg").textContent = error.code==="23505" ? "Essa garantia já existe." : "Não foi possível adicionar."; return; }
    await carregar(); };
}
function cadPrazos(){
  const body = $("#cad-body");
  body.innerHTML = `<div class="panel narrow" style="max-width:760px">
    <p class="note" style="margin-top:0">"Meses" é usado para calcular o vencimento automaticamente. Deixe em branco para "Encerrado" e "Tempo indeterminado". "Ordem" define a posição na lista.</p>
    <table><thead><tr><th>Tempo de contrato</th><th>Meses</th><th>Ordem</th><th>Ativo</th><th class="num">Contratos</th><th></th></tr></thead><tbody>
    ${D.prazos.map(p=>`<tr data-id="${p.id}"><td><input class="ctl" data-f="nome" value="${esc(p.nome)}" maxlength="40" style="min-width:180px;padding:7px 9px"></td>
      <td><input class="ctl" data-f="meses" type="number" min="1" max="240" value="${p.meses??""}" style="width:90px;padding:7px 9px"></td>
      <td><input class="ctl" data-f="ordem" type="number" value="${p.ordem??0}" style="width:70px;padding:7px 9px"></td>
      <td><input type="checkbox" data-f="ativa" ${p.ativa?"checked":""} aria-label="Ativo"></td>
      <td class="num">${D.contratos.filter(c=>c.prazo_id===p.id).length}</td><td><span class="saved"></span></td></tr>`).join("")}
    </tbody></table>
    <form id="f-pz" class="row" style="margin-top:14px" novalidate><input name="nome" placeholder="Ex.: 18 meses" maxlength="40" style="flex:1;min-width:160px">
      <input name="meses" type="number" min="1" max="240" placeholder="Meses" style="width:110px"><button class="btn primary" type="submit">Adicionar</button><span class="note" id="pz-msg"></span></form></div>`;
  ligarEdicaoTabela(body, "prazos", r=>{ const m = r.querySelector('[data-f=meses]').value; return {nome:r.querySelector('[data-f=nome]').value.trim(), meses:m?Number(m):null, ordem:Number(r.querySelector('[data-f=ordem]').value)||0, ativa:r.querySelector('[data-f=ativa]').checked}; }, x=>x.nome.length>=2 && (x.meses==null || (x.meses>=1 && x.meses<=240)));
  $("#f-pz").onsubmit = async e=>{ e.preventDefault(); const f = e.target, nome = f.nome.value.trim();
    if (nome.length<2){ $("#pz-msg").textContent = "Digite o nome do prazo."; return; }
    const { error } = await sb.from("prazos").insert({ nome, meses:f.meses.value?Number(f.meses.value):null, ordem:D.prazos.length+1 });
    if (error){ $("#pz-msg").textContent = error.code==="23505" ? "Esse prazo já existe." : "Não foi possível adicionar."; return; }
    await carregar(); };
}
function ligarEdicaoTabela(body, tabela, ler, valido){
  body.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.addEventListener("change", async ()=>{
      const msg = tr.querySelector(".saved"), row = ler(tr);
      if (!valido(row)){ msg.className = "saved err"; msg.textContent = "Valor inválido"; return; }
      msg.className = "saved"; msg.textContent = "Salvando…";
      const { error } = await sb.from(tabela).update(row).eq("id", Number(tr.dataset.id));
      if (error){ msg.className = "saved err"; msg.textContent = error.code==="23505" ? "Nome repetido" : "Não salvo"; return; }
      const alvo = D[tabela].find(x=>x.id===Number(tr.dataset.id)); Object.assign(alvo, row);
      msg.textContent = "Salvo";
    });
  });
}

/* =====================================================================
   ABA MINUTAS PADRÃO
   ===================================================================== */
const TAGS_PADRAO = [
  ["LOJA","Nome da loja"],["LOJA_ENDERECO","Endereço completo da loja"],["LOJA_LOGRADOURO","Logradouro"],["LOJA_NUMERO","Número"],["LOJA_COMPLEMENTO","Complemento"],
  ["LOJA_BAIRRO","Bairro"],["LOJA_CIDADE","Cidade"],["LOJA_UF","UF"],["LOJA_CEP","CEP"],
  ["LOCADOR_NOME","Nome / razão social"],["LOCADOR_TIPO","Pessoa física / jurídica"],["LOCADOR_DOCUMENTO","CPF / CNPJ"],["LOCADOR_RG","RG / IE"],["LOCADOR_REPRESENTANTE","Representante"],
  ["LOCADOR_EMAIL","E-mail"],["LOCADOR_TELEFONE","Telefone"],["LOCADOR_ENDERECO","Endereço do locador"],["LOCADOR_BANCO","Banco"],["LOCADOR_AGENCIA","Agência"],["LOCADOR_CONTA","Conta"],["LOCADOR_PIX","PIX"],
  ["PRAZO","Tempo de contrato"],["PRAZO_MESES","Meses"],["DATA_INICIO","Início"],["DATA_FIM","Fim"],
  ["VALOR_LOCACAO","Aluguel (R$)"],["VALOR_LOCACAO_EXTENSO","Aluguel por extenso"],["VALOR_CONDOMINIO","Condomínio"],["VALOR_IPTU","IPTU"],["OUTROS_TRIBUTOS","Outros tributos"],
  ["GARANTIA","Garantia"],["VALOR_GARANTIA","Valor da garantia"],["VALOR_GARANTIA_EXTENSO","Garantia por extenso"],
  ["INDICE_REAJUSTE","Índice de reajuste"],["MULTA_RESCISORIA","Multa rescisória"],["DATA_HOJE","Data de hoje"],["DATA_HOJE_EXTENSO","Data de hoje por extenso"]
];
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const dataExtenso = iso => { if (!iso) return ""; const [y,m,d] = iso.split("-").map(Number); return `${d} de ${MESES[m-1]} de ${y}`; };
function porExtenso(n){
  const u = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const d = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const c = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  const ate999 = x => { if (x===100) return "cem"; const p = [], ce = Math.floor(x/100), r = x%100; if (ce) p.push(c[ce]);
    if (r){ if (r<20) p.push(u[r]); else { const de = Math.floor(r/10), un = r%10; p.push(un ? d[de]+" e "+u[un] : d[de]); } } return p.join(" e "); };
  if (n===0) return "zero";
  const g = []; let x = n; while (x>0){ g.push(x%1000); x = Math.floor(x/1000); }
  const esc_ = [["",""],["mil","mil"],["milhão","milhões"],["bilhão","bilhões"]], partes = [];
  for (let i=g.length-1;i>=0;i--){ const v = g[i]; if (!v) continue;
    partes.push({ t: i===0 ? ate999(v) : i===1 ? (v===1?"mil":ate999(v)+" mil") : ate999(v)+" "+(v===1?esc_[i][0]:esc_[i][1]), v, i }); }
  return partes.map((p,k)=> k===0 ? p.t : (k===partes.length-1 && (p.v<100 || p.v%100===0) ? "e "+p.t : p.t)).join(" ");
}
function extensoBRL(v){
  if (v==null || v==="" || isNaN(v)) return "";
  v = Math.round(Number(v)*100)/100; const r = Math.floor(v), ct = Math.round((v-r)*100);
  let s = r ? porExtenso(r) + (r%1000000===0 ? " de reais" : r===1 ? " real" : " reais") : "";
  if (ct) s += (s?" e ":"") + porExtenso(ct) + (ct===1?" centavo":" centavos");
  return s || "zero reais";
}
const moeda = v => v==null || v==="" ? "" : Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
function valoresPadrao(c, lojaNome){
  const l = lojaDe(c?.loja || lojaNome || ""), p = prazoDe(c?.prazo_id), g = garDe(c?.garantia_id), h = hojeISO();
  return { LOJA:l.nome||"", LOJA_ENDERECO:enderecoLoja(l), LOJA_LOGRADOURO:l.logradouro||"", LOJA_NUMERO:l.numero||"", LOJA_COMPLEMENTO:l.complemento||"",
    LOJA_BAIRRO:l.bairro||"", LOJA_CIDADE:l.cidade||"", LOJA_UF:l.uf||"", LOJA_CEP:l.cep||"",
    LOCADOR_NOME:c?.locador_nome||"", LOCADOR_TIPO:c?.locador_tipo==="PF"?"pessoa física":c?.locador_tipo==="PJ"?"pessoa jurídica":"", LOCADOR_DOCUMENTO:c?.locador_documento||"",
    LOCADOR_RG:c?.locador_rg||"", LOCADOR_REPRESENTANTE:c?.locador_representante||"", LOCADOR_EMAIL:c?.locador_email||"", LOCADOR_TELEFONE:c?.locador_telefone||"",
    LOCADOR_ENDERECO:c?.locador_endereco||"", LOCADOR_BANCO:c?.locador_banco||"", LOCADOR_AGENCIA:c?.locador_agencia||"", LOCADOR_CONTA:c?.locador_conta||"", LOCADOR_PIX:c?.locador_pix||"",
    PRAZO:p?.nome||"", PRAZO_MESES:p?.meses?String(p.meses):"", DATA_INICIO:c?.data_inicio?fmtD(c.data_inicio):"", DATA_FIM:c?.data_fim?fmtD(c.data_fim):"",
    VALOR_LOCACAO:moeda(c?.valor_locacao), VALOR_LOCACAO_EXTENSO:extensoBRL(c?.valor_locacao), VALOR_CONDOMINIO:moeda(c?.valor_condominio), VALOR_IPTU:moeda(c?.valor_iptu),
    OUTROS_TRIBUTOS:moeda(c?.outros_tributos), GARANTIA:g?.nome||"", VALOR_GARANTIA:moeda(c?.valor_garantia), VALOR_GARANTIA_EXTENSO:extensoBRL(c?.valor_garantia),
    INDICE_REAJUSTE:c?.indice_reajuste||"", MULTA_RESCISORIA:c?.multa_rescisoria||"", DATA_HOJE:fmtD(h), DATA_HOJE_EXTENSO:dataExtenso(h) };
}
function renderMinutas(){
  const el = $("#t-minutas"), m = UI.minuta;
  el.innerHTML = `<div class="grid2">
  <div class="panel"><div class="sec-h"><h3>Modelos de minuta</h3></div>
    ${D.minutas.length ? `<table><tbody>${D.minutas.map(x=>`<tr><td><b>${esc(x.nome)}</b><div class="note">${esc(x.descricao||"")}${x.descricao?" · ":""}enviado em ${fmtD(x.criado_em)}</div></td>
      <td style="text-align:right;white-space:nowrap"><button class="btn small" data-baixar="${esc(x.arquivo_path)}">Baixar modelo</button> <span data-delarea="${x.id}"><button class="btn small" data-delmin="${x.id}" style="color:var(--bad)">Excluir</button></span></td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">Nenhum modelo enviado ainda.</p>`}
    <form id="f-min" class="fsec" novalidate style="border-top:1px solid var(--line);padding-top:14px"><h3>Enviar novo modelo (.docx)</h3>
      <div class="fgrid">${fI("nome","Nome do modelo *","",{cls:"w2",attrs:'placeholder="Ex.: Contrato de locação comercial"'})}${fI("descricao","Descrição","",{cls:"w2"})}
        <label class="wall">Arquivo do Word (.docx)<input type="file" name="arquivo" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="submit">Enviar modelo</button><span class="note" id="min-msg"></span></div></form>
    <details class="help" style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Como preparar o modelo no Word</summary>
      <p>No seu arquivo do Word, escreva os campos variáveis entre chaves, em letras maiúsculas e sem espaços. Exemplo: <code>LOCADOR: {LOCADOR_NOME}, inscrito no CPF/CNPJ {LOCADOR_DOCUMENTO}</code>.</p>
      <p>Os campos abaixo são preenchidos automaticamente com os dados do contrato e da loja. Você também pode criar campos próprios (ex.: <code>{TESTEMUNHA_1}</code>), que aparecem para preencher na hora.</p>
      <div class="tags">${TAGS_PADRAO.map(([t,l])=>`<code title="${esc(l)}">{${t}}</code>`).join("")}</div></details>
  </div>
  <div class="panel"><div class="sec-h"><h3>Gerar minuta</h3></div>
    <div class="fgrid">
      ${fS("g-modelo","Modelo",[["","Selecione o modelo"],...D.minutas.map(x=>[x.id,x.nome])],m?.modeloId,{attrs:'id="g-modelo"'})}
      ${fS("g-contrato","Preencher com os dados do contrato",[["","Nenhum (preencher manualmente)"],...[...D.contratos].sort((a,b)=>a.loja.localeCompare(b.loja,"pt-BR")).map(c=>[c.id,`${c.loja} · ${c.locador_nome}`])],m?.contratoId,{attrs:'id="g-contrato"'})}
      ${fS("g-loja","Ou só com os dados da loja",[["","Nenhuma"],...D.lojas.map(l=>[l.nome,l.nome])],m?.loja,{attrs:'id="g-loja"'})}
    </div>
    <div class="row" style="margin-top:12px"><button class="btn" id="g-carregar">Carregar campos do modelo</button><span class="note" id="g-msg"></span></div>
    <div id="g-campos"></div>
  </div></div>`;
  el.querySelectorAll("[data-baixar]").forEach(b=>b.onclick = ()=>abrirArquivo(b.dataset.baixar));
  el.querySelectorAll("[data-delmin]").forEach(b=>b.onclick = ()=>{
    const id = b.dataset.delmin, area = el.querySelector(`[data-delarea="${id}"]`);
    area.innerHTML = `<button class="btn small" id="dm-sim" style="color:var(--bad)">Confirmar exclusão</button> <button class="btn small" id="dm-nao">Cancelar</button>`;
    $("#dm-nao").onclick = renderMinutas;
    $("#dm-sim").onclick = async ()=>{ const x = D.minutas.find(z=>z.id===id); await sb.from("minutas").delete().eq("id", id); if (x) await sb.storage.from(BK).remove([x.arquivo_path]); if (UI.minuta?.modeloId===id) UI.minuta = null; carregar(); };
  });
  $("#f-min").onsubmit = async e=>{
    e.preventDefault(); const f = e.target, msg = $("#min-msg"), file = f.arquivo.files[0], nome = f.nome.value.trim();
    if (nome.length<2){ msg.textContent = "Dê um nome ao modelo."; return; }
    if (!file || !/\.docx$/i.test(file.name)){ msg.textContent = "Escolha um arquivo do Word no formato .docx."; return; }
    msg.textContent = "Enviando…";
    try{ const id = uuid(); const path = await enviarArquivo(`minutas/${id}.docx`, file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const { error } = await sb.from("minutas").insert({ id, nome, descricao:f.descricao.value.trim()||null, arquivo_path:path }); if (error) throw error;
      UI.minuta = { modeloId:id }; await carregar();
    }catch(e2){ msg.textContent = "Não foi possível enviar o modelo. Tente de novo."; }
  };
  $("#g-carregar").onclick = carregarCamposMinuta;
  if (m?.tags) desenharCamposMinuta();
}
function tagsDoModelo(zip){
  const arquivos = Object.keys(zip.files).filter(n=>/^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  const set = new Set();
  for (const n of arquivos){
    const xml = zip.file(n).asText().replace(/<w:p[ >]/g, "\n$&").replace(/<[^>]+>/g, "");
    for (const mt of xml.matchAll(/\{([^{}\n]+)\}/g)){ const t = mt[1].trim(); if (t && !/^[#/^]/.test(t)) set.add(t); }
  }
  return [...set];
}
async function carregarCamposMinuta(){
  const msg = $("#g-msg"), modeloId = $("#g-modelo").value, contratoId = $("#g-contrato").value, loja = $("#g-loja").value;
  if (!modeloId){ msg.textContent = "Selecione um modelo."; return; }
  const modelo = D.minutas.find(x=>x.id===modeloId);
  msg.textContent = "Lendo o modelo…";
  try{
    const { data, error } = await sb.storage.from(BK).download(modelo.arquivo_path); if (error) throw error;
    const buf = await data.arrayBuffer(), zip = new PizZip(buf), tags = tagsDoModelo(zip);
    const c = D.contratos.find(x=>x.id===contratoId), base = valoresPadrao(c, loja);
    UI.minuta = { modeloId, contratoId, loja, buf, tags, valores: Object.fromEntries(tags.map(t=>[t, base[t] ?? ""])), nomeModelo:modelo.nome, rotulo: c ? `${c.loja} - ${c.locador_nome}` : (loja || "preenchida") };
    msg.textContent = tags.length ? `${tags.length} campo(s) encontrado(s).` : "";
    desenharCamposMinuta();
  }catch(e){ msg.textContent = "Não foi possível ler o modelo. Confira se o arquivo é um .docx válido."; }
}
function desenharCamposMinuta(){
  const m = UI.minuta, box = $("#g-campos");
  if (!m.tags.length){ box.innerHTML = `<div class="alert warn" style="margin-top:12px">Nenhum campo {ENTRE_CHAVES} foi encontrado neste modelo. Veja em "Como preparar o modelo no Word".</div>`; return; }
  const rot = Object.fromEntries(TAGS_PADRAO);
  box.innerHTML = `<form id="f-gerar" class="fsec" novalidate style="border-top:1px solid var(--line);padding-top:14px"><h3>Campos da minuta</h3>
    <p class="note" style="margin-top:0">Confira e edite os dados antes de gerar. Campos em branco ficam vazios no documento.</p>
    <div class="fgrid">${m.tags.map(t=>`<label class="${/ENDERECO|EXTENSO|OBS/.test(t)?"w2":""}">${esc(rot[t] ? rot[t] : t.replace(/_/g," ").toLowerCase().replace(/^./,ch=>ch.toUpperCase()))} <span class="mono note" style="font-weight:400">{${esc(t)}}</span>
      <input data-tag="${esc(t)}" value="${esc(m.valores[t]??"")}"></label>`).join("")}</div>
    <div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Gerar minuta (.docx)</button><span class="note" id="gerar-msg"></span></div></form>`;
  const f = $("#f-gerar");
  f.addEventListener("input", e=>{ const t = e.target.dataset.tag; if (t) m.valores[t] = e.target.value; });
  f.onsubmit = e=>{
    e.preventDefault(); const msg = $("#gerar-msg");
    try{
      const doc = new window.docxtemplater(new PizZip(m.buf), { paragraphLoop:true, linebreaks:true, nullGetter(){ return ""; } });
      doc.render(m.valores);
      const blob = doc.getZip().generate({ type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      baixarBlob(blob, `${m.nomeModelo} - ${m.rotulo}.docx`.replace(/[\\/:*?"<>|]+/g,"-"));
      msg.textContent = "Minuta gerada. Confira no Word e salve em PDF para assinatura, se preferir.";
    }catch(err){
      const det = err?.properties?.errors?.map(x=>x.properties?.explanation).filter(Boolean).slice(0,3).join(" · ");
      msg.textContent = "O modelo tem uma marcação inválida" + (det ? ": " + det : ". Confira se todas as chaves { } estão abertas e fechadas.");
    }
  };
}

/* =====================================================================
   ABA RELATÓRIOS
   ===================================================================== */
function linhasRel(){
  return D.contratos.map(c=>{ const l = lojaDe(c.loja);
    return { c, loja:c.loja, regional:l.regional||"Sem regional", uf:l.uf||"Sem UF", cidade:l.cidade||"Sem cidade", status:c.status, statusL:STC_L[c.status]||c.status,
      garantia:garDe(c.garantia_id)?.nome||"Sem garantia", exigeValor:!!garDe(c.garantia_id)?.exige_valor, prazo:prazoDe(c.prazo_id)?.nome||"Sem prazo", indice:c.indice_reajuste||"Sem índice",
      fach:l.nova_fachada===true?"Nova fachada":l.nova_fachada===false?"Fachada antiga":"Fachada não informada",
      logo:l.logo_interna===true?"Com logo interna":l.logo_interna===false?"Sem logo interna":"Logo não informada",
      faixa:faixaVenc(c), fim:c.data_fim||"", custo:custo(c), aluguel:Number(c.valor_locacao)||0 }; });
}
function filtrarRel(L){
  const f = UI.rel;
  return L.filter(r=>(f.enc || r.status!=="encerrado") && (!f.reg||r.regional===f.reg) && (!f.uf||r.uf===f.uf) && (!f.cidade||r.cidade===f.cidade) && (!f.st||r.status===f.st)
    && (!f.gar||r.garantia===f.gar) && (!f.prazo||r.prazo===f.prazo) && (!f.ind||r.indice===f.ind) && (!f.fach||r.fach===f.fach) && (!f.logo||r.logo===f.logo)
    && (!f.de || (r.fim && r.fim>=f.de)) && (!f.ate || (r.fim && r.fim<=f.ate)));
}
const FAIXAS = ["Vencido","Até 60 dias","61 dias a 6 meses","6 a 12 meses","Mais de 12 meses","Sem vencimento","Encerrado"];
const RDIMS = {
  status:{label:"Status", get:r=>r.statusL, ord:r=>STC.findIndex(s=>s[0]===r.status)},
  faixa:{label:"Prazo para vencer", get:r=>r.faixa, ord:r=>FAIXAS.indexOf(r.faixa)},
  regional:{label:"Regional", get:r=>r.regional}, uf:{label:"UF", get:r=>r.uf}, cidade:{label:"Cidade", get:r=>r.cidade}, loja:{label:"Loja", get:r=>r.loja},
  garantia:{label:"Garantia", get:r=>r.garantia}, prazo:{label:"Tempo de contrato", get:r=>r.prazo}, indice:{label:"Índice de reajuste", get:r=>r.indice},
  fach:{label:"Nova fachada", get:r=>r.fach}, logo:{label:"Logo interna", get:r=>r.logo},
  mes:{label:"Mês de vencimento", get:r=>r.fim ? r.fim.slice(5,7)+"/"+r.fim.slice(0,4) : "Sem vencimento", ord:r=>r.fim ? r.fim.slice(0,7) : "9999"}
};
const METS = [["qtd","Quantidade"],["custo","Custo mensal"],["aluguel","Aluguel"]];
function agruparRel(L, dim, met){
  const d = RDIMS[dim], g = {};
  for (const r of L){ const k = d.get(r); const x = (g[k] ||= {k, qtd:0, custo:0, aluguel:0, o:d.ord?d.ord(r):0}); x.qtd++; x.custo += r.custo; x.aluguel += r.aluguel; }
  const arr = Object.values(g).map(x=>({...x, m:x[met]}));
  return d.ord ? arr.sort((a,b)=>a.o>b.o?1:a.o<b.o?-1:0) : arr.sort((a,b)=>b.m-a.m || a.k.localeCompare(b.k,"pt-BR"));
}
function renderRelatorios(){
  const el = $("#t-relatorios"), all = linhasRel(), L = filtrarRel(all), f = UI.rel;
  const uniq = k => [...new Set(all.map(r=>r[k]))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const sel = (id,label,key,opts) => `<label>${label}<select id="${id}"><option value="">Todos</option>${opts.map(o=>Array.isArray(o)?o:[o,o]).map(([v,l])=>`<option value="${esc(v)}" ${f[key]===v?"selected":""}>${esc(l)}</option>`).join("")}</select></label>`;
  const totM = L.reduce((t,r)=>t+r.custo,0), totA = L.reduce((t,r)=>t+r.aluguel,0), caucao = L.filter(r=>r.exigeValor).reduce((t,r)=>t+(Number(r.c.valor_garantia)||0),0);
  const seg = (grp,cur) => `<span class="seg" role="group" aria-label="Medida">${METS.map(([v,l])=>`<button data-met="${grp}" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`).join("")}</span>`;
  const dimSel = (id,cur,keys) => `<select id="${id}" aria-label="Agrupar por">${keys.map(k=>`<option value="${k}" ${cur===k?"selected":""}>${RDIMS[k].label}</option>`).join("")}</select>`;
  el.innerHTML = `
  <div class="panel" style="margin-bottom:16px"><div class="ctl-row">
    ${sel("rf-reg","Regional","reg",uniq("regional"))}${sel("rf-uf","UF","uf",uniq("uf"))}${sel("rf-cidade","Cidade","cidade",uniq("cidade"))}
    ${sel("rf-st","Status","st",STC)}${sel("rf-gar","Garantia","gar",uniq("garantia"))}${sel("rf-prazo","Tempo de contrato","prazo",uniq("prazo"))}
    ${sel("rf-ind","Índice","ind",uniq("indice"))}${sel("rf-fach","Fachada","fach",["Nova fachada","Fachada antiga","Fachada não informada"])}${sel("rf-logo","Logo interna","logo",["Com logo interna","Sem logo interna","Logo não informada"])}
    <label>Vencimento de<input type="date" id="rf-de" value="${f.de}"></label><label>até<input type="date" id="rf-ate" value="${f.ate}"></label>
    <label style="flex-direction:row;align-items:center;gap:6px;align-self:flex-end;padding-bottom:8px"><input type="checkbox" id="rf-enc" ${f.enc?"checked":""} style="width:auto"> Incluir encerrados</label>
    <button class="btn small" id="rf-limpar" style="align-self:flex-end">Limpar filtros</button>
    <button class="btn small" id="rf-exp" style="align-self:flex-end">Exportar (CSV)</button>
  </div></div>
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Contratos no filtro</span><div class="v">${L.length}</div><span class="s">${L.filter(r=>["Vencido","Até 60 dias"].includes(r.faixa)).length} vencidos ou vencendo em 60 dias</span></div>
    <div class="kpi"><span class="eyebrow">Custo mensal total</span><div class="v">${brl(totM)}</div><span class="s">locação + condomínio + IPTU + tributos</span></div>
    <div class="kpi"><span class="eyebrow">Custo anual</span><div class="v">${brl(totM*12)}</div><span class="s">aluguel médio ${brl(L.length?totA/L.length:0)}</span></div>
    <div class="kpi"><span class="eyebrow">Caução depositada</span><div class="v">${brl(caucao)}</div><span class="s">garantias que pedem valor</span></div>
  </div>
  ${L.length ? `<div class="grid2">
    <div class="panel"><div class="sec-h"><h3>Distribuição</h3><div class="ctl-row">${dimSel("pie-dim",UI.pie.dim,["status","faixa","regional","uf","garantia","prazo","indice","fach","logo"])}${seg("pie",UI.pie.met)}</div></div>
      <div class="chart-box"><canvas id="ch-pie" role="img" aria-label="Gráfico de pizza"></canvas></div><div class="legend" id="pie-legend"></div></div>
    <div class="panel"><div class="sec-h"><h3>Comparativo</h3><div class="ctl-row">${dimSel("bar-dim",UI.bar.dim,["regional","uf","cidade","loja","garantia","status","faixa","indice","prazo","mes"])}${seg("bar",UI.bar.met)}</div></div>
      <div class="chart-box tall" id="bar-box"><canvas id="ch-bar" role="img" aria-label="Gráfico de barras"></canvas></div></div>
  </div>
  <div class="panel sec"><div class="sec-h"><h3>Contratos no filtro</h3></div>
    <div class="scroll" style="max-height:520px;overflow-y:auto"><table><thead><tr><th>Loja</th><th>Regional</th><th>Cidade/UF</th><th>Locador</th><th>Vencimento</th><th>Situação</th><th class="num">Aluguel</th><th class="num">Condomínio</th><th class="num">IPTU</th><th class="num">Outros</th><th class="num">Total mensal</th><th>Garantia</th><th>Status</th></tr></thead><tbody>
    ${L.sort((a,b)=>(a.fim||"9999").localeCompare(b.fim||"9999")).map(r=>{const s=situacao(r.c);return `<tr class="click" data-id="${r.c.id}"><td><b>${esc(r.loja)}</b></td><td>${esc(r.regional)}</td><td>${esc([lojaDe(r.loja).cidade,lojaDe(r.loja).uf].filter(Boolean).join("/")||"—")}</td><td>${esc(r.c.locador_nome)}</td><td>${fmtD(r.fim)}</td><td><span class="pill ${s.cls}">${s.t}</span></td>
      <td class="num">${brl(r.c.valor_locacao)}</td><td class="num">${brl(r.c.valor_condominio)}</td><td class="num">${brl(r.c.valor_iptu)}</td><td class="num">${brl(r.c.outros_tributos)}</td><td class="num"><b>${brl(r.custo)}</b></td><td>${esc(r.garantia)}</td><td>${esc(r.statusL)}</td></tr>`}).join("")}
    <tr class="sum-row"><td colspan="6">Total</td><td class="num">${brl(totA)}</td><td class="num">${brl(L.reduce((t,r)=>t+(Number(r.c.valor_condominio)||0),0))}</td><td class="num">${brl(L.reduce((t,r)=>t+(Number(r.c.valor_iptu)||0),0))}</td><td class="num">${brl(L.reduce((t,r)=>t+(Number(r.c.outros_tributos)||0),0))}</td><td class="num">${brl(totM)}</td><td colspan="2"></td></tr>
    </tbody></table></div></div>` : `<div class="empty">${D.contratos.length ? "Nenhum contrato para estes filtros." : "Cadastre contratos para ver os relatórios."}</div>`}`;
  const bind = (id,key,ev="change") => { const x = $(id); if (x) x.addEventListener(ev, e=>{ UI.rel[key] = e.target.type==="checkbox" ? e.target.checked : e.target.value; renderRelatorios(); }); };
  [["#rf-reg","reg"],["#rf-uf","uf"],["#rf-cidade","cidade"],["#rf-st","st"],["#rf-gar","gar"],["#rf-prazo","prazo"],["#rf-ind","ind"],["#rf-fach","fach"],["#rf-logo","logo"],["#rf-de","de"],["#rf-ate","ate"],["#rf-enc","enc"]].forEach(([i,k])=>bind(i,k));
  $("#rf-limpar").onclick = ()=>{ UI.rel = {reg:"",uf:"",cidade:"",st:"",gar:"",prazo:"",ind:"",fach:"",logo:"",de:"",ate:"",enc:false}; renderRelatorios(); };
  $("#rf-exp").onclick = ()=>baixarCSV("relatorio-contratos-locacao", [["Loja","Regional","Cidade","UF","Locador","CPF/CNPJ","Início","Vencimento","Situação","Status","Tempo de contrato","Garantia","Valor garantia","Aluguel","Condomínio","IPTU","Outros tributos","Total mensal","Índice","Próximo reajuste","Responsável","Nova fachada","Logo interna","Aditivos"]]
    .concat(L.map(r=>[r.loja,r.regional,r.cidade,r.uf,r.c.locador_nome,r.c.locador_documento||"",fmtD(r.c.data_inicio),fmtD(r.fim),situacao(r.c).t,r.statusL,r.prazo,r.garantia,numCSV(r.c.valor_garantia),numCSV(r.c.valor_locacao),numCSV(r.c.valor_condominio),numCSV(r.c.valor_iptu),numCSV(r.c.outros_tributos),numCSV(r.custo),r.c.indice_reajuste||"",fmtD(r.c.proximo_reajuste),r.c.responsavel||"",r.fach,r.logo,D.aditivos.filter(a=>a.contrato_id===r.c.id).length])));
  el.querySelectorAll("tr[data-id]").forEach(tr=>tr.onclick = ()=>abrirDetalhe(tr.dataset.id));
  if (!L.length) return;
  $("#pie-dim").onchange = e=>{ UI.pie.dim = e.target.value; renderRelatorios(); };
  $("#bar-dim").onchange = e=>{ UI.bar.dim = e.target.value; renderRelatorios(); };
  el.querySelectorAll("[data-met]").forEach(b=>b.onclick = ()=>{ UI[b.dataset.met].met = b.dataset.v; renderRelatorios(); });
  graficosRel(L);
}
function graficosRel(L){
  if (!window.Chart) return;
  Object.values(UI.charts).forEach(c=>c.destroy()); UI.charts = {};
  const ink = cssVar("--ink"), muted = cssVar("--muted"), surface = cssVar("--surface"), grid = cssVar("--chart-grid");
  const pal = ["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"].map(cssVar);
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = muted;
  const fmt = (met,v) => met==="qtd" ? `${v} contrato(s)` : brl(v);
  let P = agruparRel(L, UI.pie.dim, UI.pie.met).filter(x=>x.m>0);
  if (P.length > 8){ const rest = P.slice(7); P = P.slice(0,7).concat([{k:`Outros (${rest.length})`, m:rest.reduce((t,x)=>t+x.m,0)}]); }
  const cores = P.map((x,i)=> x.k.startsWith("Outros") ? muted : pal[i%8]), tot = P.reduce((t,x)=>t+x.m,0);
  const leg = $("#pie-legend");
  if (!P.length) leg.innerHTML = `<p class="muted">Sem valores lançados para esta medida.</p>`;
  else {
    leg.innerHTML = P.map((x,i)=>`<div class="li"><span class="sw" style="background:${cores[i]}"></span><span>${esc(x.k)}</span><span class="v">${fmt(UI.pie.met,x.m)}</span><span class="pc">${Math.round(x.m/tot*100)}%</span></div>`).join("");
    UI.charts.pie = new Chart($("#ch-pie"), { type:"pie", data:{ labels:P.map(x=>x.k), datasets:[{ data:P.map(x=>x.m), backgroundColor:cores, borderColor:surface, borderWidth:2, hoverOffset:6 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${c.label}: ${fmt(UI.pie.met,c.parsed)} (${Math.round(c.parsed/tot*100)}%)` } } } } });
  }
  const B = agruparRel(L, UI.bar.dim, UI.bar.met), box = $("#bar-box");
  box.style.height = Math.max(220, B.length*30 + 50) + "px";
  UI.charts.bar = new Chart($("#ch-bar"), { type:"bar",
    data:{ labels:B.map(x=>x.k), datasets:[{ data:B.map(x=>x.m), backgroundColor:pal[0], borderRadius:4, borderSkipped:"start", barThickness:16, maxBarThickness:18 }] },
    options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>" "+fmt(UI.bar.met,c.parsed.x) } } },
      scales:{ x:{ beginAtZero:true, grid:{color:grid}, border:{display:false}, ticks:{ color:muted, maxRotation:0, maxTicksLimit:5, precision:0,
                 callback:v=> UI.bar.met==="qtd" ? v : (v>=1000 ? "R$ "+(v/1000).toLocaleString("pt-BR")+" mil" : "R$ "+v) } },
               y:{ grid:{display:false}, border:{color:grid}, ticks:{ color:ink, autoSkip:false, font:{size:12} } } } } });
}

/* ---------- início ---------- */
(async ()=>{
  if (!sb){ show("login"); setStatus("O sistema ainda não foi configurado: preencha o arquivo config.js.","bad"); $("#lg-btn").disabled = true; return; }
  entrar();
})();
