// Formulário do supervisor: acesso público, sem login.
// Grava em public.checklists (somente INSERT) e envia fotos ao bucket privado "fotos".
const BUCKET = (window.CHECKLIST_CONFIG||{}).BUCKET_FOTOS || "fotos";
const sb = makeClient();
const S = { ident:null, subId:null, resp:{}, showErrors:false, previews:{} };

function setStatus(html, kind){ $("#status").innerHTML = html ? `<div class="alert ${kind||"warn"}" style="margin-bottom:16px">${html}</div>` : ""; }
function show(v){ for (const id of ["ident","form","done"]) $("#v-"+id).hidden = id!==v; window.scrollTo(0,0); }
const draftKey = loja => "chk:draft:" + loja;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));

/* ---------- Lojas ---------- */
async function carregarLojas(){
  const sel = $("#in-loja");
  if (!sb){ sel.innerHTML = `<option value="">Formulário não configurado</option>`; setStatus("O formulário ainda não foi configurado (arquivo config.js). Avise o responsável de Facilities.","bad"); return; }
  const { data, error } = await sb.from("lojas").select("nome").eq("ativa", true).order("nome");
  if (error || !data?.length){ sel.innerHTML = `<option value="">Não foi possível carregar</option>`; setStatus("Não foi possível carregar a lista de lojas. Verifique sua internet e recarregue a página.","bad"); return; }
  sel.innerHTML = `<option value="">SELECIONE SUA LOJA</option>` + data.map(l=>`<option>${esc(l.nome)}</option>`).join("");
}

/* ---------- Etapa 1 ---------- */
$("#btn-iniciar").onclick = () => {
  const nome = $("#in-nome").value.trim().replace(/\s+/g," "), loja = $("#in-loja").value, err = $("#ident-err");
  let msg = "";
  if (!nome) msg = "Informe seu nome para continuar.";
  else if (nome.length < 3) msg = "Informe nome e sobrenome.";
  else if (!loja) msg = "Selecione a loja que você está vistoriando.";
  if (msg){ err.textContent = msg; err.hidden = false; return; }
  err.hidden = true; lsSet("chk:nome", nome);
  startForm({nome, loja});
};
function startForm(ident){
  S.ident = ident; S.showErrors = false;
  const d = lsGet(draftKey(ident.loja));
  S.resp = d?.resp || {}; S.subId = d?.subId || uuid();
  $("#pg-loja").textContent = ident.loja; $("#pg-nome").textContent = ident.nome;
  renderCats(); updateProgress(); show("form");
  setStatus(d ? "Rascunho recuperado: suas respostas anteriores para esta loja foram restauradas." : "", "ok");
}
$("#btn-trocar").onclick = () => { setStatus(""); show("ident"); };

/* ---------- Etapa 2 ---------- */
const blankAns = () => ({r:"",obs:"",urg:"",chamado:"",fotos:[]});
const ans = id => S.resp[id] || (S.resp[id] = blankAns());
const saveDraft = () => { if (S.ident) lsSet(draftKey(S.ident.loja), {resp:S.resp, subId:S.subId, at:Date.now()}); };
const qid = id => "q-" + id.replace(".","_");

function qHTML(q){
  const a = S.resp[q.id] || blankAns(), prob = isProb(q,a.r);
  const missing = S.showErrors && (!a.r || (prob && (!a.obs.trim() || !a.urg)));
  const good = q.bad==="Não" ? "Sim" : "Não";
  const btn = (val,label,cls) => `<button type="button" class="opt ${cls}" data-q="${q.id}" data-r="${val}" aria-pressed="${a.r===val}">${label}</button>`;
  return `<div class="q ${prob?"prob":""} ${missing?"missing":""}" id="${qid(q.id)}">
    <div class="q-t"><span class="code">${q.id}</span><p>${esc(q.t)}</p></div>
    <div class="opts">${btn("Sim","Sim",good==="Sim"?"good":"badc")}${btn("Não","Não",good==="Não"?"good":"badc")}${btn("NA","Não se aplica","na")}</div>
    ${prob ? `<div class="extra">
      <label class="f">O que foi observado? <span class="note" style="font-weight:400">obrigatório</span>
        <textarea data-obs="${q.id}" maxlength="1000" placeholder="Descreva o problema, local e quantidade">${esc(a.obs)}</textarea></label>
      <div class="fld">Urgência <span class="note" style="font-weight:400;margin-top:-4px">obrigatório</span>
        <div class="urg">${URG.map(([k,l])=>`<button type="button" data-urg="${q.id}" data-v="${k}" aria-pressed="${a.urg===k}">${l}</button>`).join("")}</div></div>
      <label class="f">Número do chamado <span class="note" style="font-weight:400">se já foi aberto</span>
        <input type="text" data-ch="${q.id}" value="${esc(a.chamado)}" maxlength="60" placeholder="Ex.: 48213"></label>
      <div class="fld">Fotos
        <div class="thumbs">${a.fotos.map((p,i)=>`<figure>${S.previews[p]?`<img src="${S.previews[p]}" alt="Foto ${i+1} do item ${q.id}">`:`Foto ${i+1}<br>enviada`}<button type="button" data-rmf="${q.id}" data-i="${i}" aria-label="Remover foto">×</button></figure>`).join("")}</div>
        <label class="btn small file-btn" style="align-self:flex-start"><span>Anexar foto</span><input type="file" accept="image/*" data-foto="${q.id}" multiple></label></div>
    </div>` : ""}
  </div>`;
}
function renderCats(){
  $("#cats").innerHTML = CATS.map(c=>`<section class="cat"><div class="cat-h"><span class="n">${String(c.n).padStart(2,"0")}</span><h2>${esc(c.nome)}</h2></div>${c.q.map(([id])=>qHTML(QMAP[id])).join("")}</section>`).join("");
}
function rerenderQ(id){ const el = document.getElementById(qid(id)); if (el) el.outerHTML = qHTML(QMAP[id]); }
function updateProgress(){
  const done = QS.filter(q=>S.resp[q.id]?.r).length;
  $("#pg-count").textContent = `${done}/${QS.length}`;
  $("#pg-bar").style.width = (done/QS.length*100)+"%";
}

$("#cats").addEventListener("click", e=>{
  const o = e.target.closest("[data-r]");
  if (o){ const a = ans(o.dataset.q); a.r = a.r===o.dataset.r ? "" : o.dataset.r; rerenderQ(o.dataset.q); updateProgress(); saveDraft(); return; }
  const u = e.target.closest("[data-urg]");
  if (u){ ans(u.dataset.urg).urg = u.dataset.v; rerenderQ(u.dataset.urg); saveDraft(); return; }
  const rm = e.target.closest("[data-rmf]");
  if (rm){ ans(rm.dataset.rmf).fotos.splice(+rm.dataset.i,1); rerenderQ(rm.dataset.rmf); saveDraft(); }
});
$("#cats").addEventListener("input", e=>{
  const t = e.target;
  if (t.dataset.obs){ ans(t.dataset.obs).obs = t.value; saveDraft(); }
  if (t.dataset.ch){ ans(t.dataset.ch).chamado = t.value; saveDraft(); }
});
$("#cats").addEventListener("change", async e=>{
  const t = e.target; if (!t.dataset.foto || !t.files.length) return;
  const id = t.dataset.foto, files = [...t.files];
  t.previousElementSibling.textContent = "Enviando foto…"; t.disabled = true;
  try{
    for (const f of files){
      const blob = await shrink(f);
      const path = `${S.subId}/${id.replace(".","_")}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType:"image/jpeg", upsert:false });
      if (error) throw error;
      S.previews[path] = URL.createObjectURL(blob);
      ans(id).fotos.push(path); saveDraft();
    }
  }catch(err){ setStatus("Não foi possível enviar a foto. Verifique a internet e tente de novo. Se continuar, descreva o problema na observação.","bad"); }
  rerenderQ(id);
});
function shrink(file){
  return new Promise(res=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{
      const max = 1600, k = Math.min(1, max/Math.max(img.width,img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      c.toBlob(b=>res(b||file),"image/jpeg",0.8);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

/* ---------- Envio ---------- */
$("#btn-enviar").onclick = async ()=>{
  const err = $("#form-err");
  const pend = QS.filter(q=>{ const a=S.resp[q.id]; return !a?.r || (isProb(q,a.r) && (!a.obs.trim() || !a.urg)); });
  if (pend.length){
    S.showErrors = true; renderCats();
    err.textContent = `Faltam ${pend.length} item(ns): ${pend.slice(0,8).map(q=>q.id).join(", ")}${pend.length>8?"…":""}. Responda todos e, nos itens com problema, preencha observação e urgência.`;
    err.hidden = false;
    document.getElementById(qid(pend[0].id))?.scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }
  err.hidden = true;
  if (!sb){ err.textContent = "Formulário não configurado. Avise o responsável de Facilities."; err.hidden = false; return; }
  const b = $("#btn-enviar"); b.disabled = true; b.textContent = "Enviando…";
  const respostas = {};
  QS.forEach(q=>{ const a=S.resp[q.id], p=isProb(q,a.r); respostas[q.id] = {r:a.r, obs:p?a.obs.trim():"", urg:p?a.urg:"", chamado:p?a.chamado.trim():"", fotos:p?a.fotos:[]}; });
  const total = QS.filter(q=>isProb(q,respostas[q.id].r)).length;
  const nota = scoreOf(respostas);
  const row = { id:S.subId, loja:S.ident.loja, supervisor:S.ident.nome, respostas, total_problemas:total, nota: nota==null?null:Number(nota.toFixed(4)) };
  const { error } = await sb.from("checklists").insert(row);
  b.disabled = false; b.textContent = "Enviar checklist";
  if (error && error.code !== "23505"){ // 23505 = já enviado (envio repetido do mesmo rascunho)
    err.textContent = "O envio falhou. Verifique a internet e tente de novo. Suas respostas continuam salvas neste aparelho."; err.hidden = false; return;
  }
  lsDel(draftKey(S.ident.loja));
  const first = S.ident.nome.split(" ")[0];
  $("#done-t").textContent = `Checklist da loja ${S.ident.loja} enviado`;
  $("#done-s").textContent = total ? `${total} item(ns) com problema registrados. Obrigado, ${first}.` : `Nenhum problema registrado. Obrigado, ${first}.`;
  setStatus(""); show("done");
};
$("#btn-outra").onclick = ()=>{ S.ident=null; S.resp={}; S.subId=null; $("#in-loja").value=""; show("ident"); };

/* ---------- Início ---------- */
$("#in-nome").value = lsGet("chk:nome") || "";
carregarLojas();
