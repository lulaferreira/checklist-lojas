// Perguntas do checklist e funções compartilhadas entre formulário e painel.
// Para incluir/alterar perguntas, edite CATS. O 3º item ("Sim") indica pergunta
// em que responder SIM significa problema (ex.: "apresentam defeitos?").
const CATS = [
 {n:1,nome:"Acessos e Esquadrias",q:[
  ["1.1","A porta de esteira abre e fecha completamente sem travamento ou ruído anormal?"],
  ["1.2","A mola da porta de vidro está ajustada (fecha automaticamente em até 5 segundos)?"],
  ["1.3","Loja possui placa de saídas de emergência?"],
  ["1.4","Loja possui luminária de emergência?"]]},
 {n:2,nome:"Instalações Elétricas",q:[
  ["2.1","Todos os interruptores de luz funcionam corretamente e sem folga na placa?"],
  ["2.2","As placas dos interruptores estão íntegras, sem trincas ou manchas de queima?"],
  ["2.3","Todas as tomadas estão funcionando? (testar com equipamento)"],
  ["2.4","A fiação aparente está em eletroduto/canaleta adequada, sem emendas expostas?"]]},
 {n:3,nome:"TI / Rede",q:[
  ["3.1","Cabos de rede nas baias de atendimento estão organizados com passa-cabos ou calhas?"],
  ["3.2","Não há cabos de rede no chão criando risco de tropeço ou dano?"]]},
 {n:4,nome:"Iluminação",q:[
  ["4.1","Todas as luminárias da área de atendimento estão funcionando (0 lâmpadas queimadas)?"],
  ["4.2","A iluminação do banheiro está funcionando?"],
  ["4.3","A iluminação da retaguarda está funcionando?"],
  ["4.4","As luminárias estão limpas, sem acúmulo de poeira ou insetos?"]]},
 {n:5,nome:"Climatização",q:[
  ["5.1","Todos os ar-condicionados ligam e atingem a temperatura programada?"],
  ["5.2","O controle remoto de cada equipamento está funcionando e com bateria?"],
  ["5.3","Não há gotejamento de água pelas unidades internas dos splits?"],
  ["5.4","Não há ruído anormal (chiado, vibração) nos equipamentos de climatização?"]]},
 {n:6,nome:"Hidráulica e Sanitários",q:[
  ["6.1","Não há vazamentos visíveis em torneiras, registros ou conexões hidráulicas?"],
  ["6.2","A torneira da pia do banheiro abre, fecha e possui fluxo de água adequado?"],
  ["6.3","O vaso sanitário descarrega corretamente e não há vazamento na base ou caixa acoplada?"],
  ["6.4","A válvula/caixa de descarga não apresenta vazamento contínuo (som de água correndo)?"],
  ["6.5","O ralo do banheiro está desobstruído e com grelha fixada?"],
  ["6.6","O sifão da pia não apresenta vazamento ou odor de esgoto?"],
  ["6.7","Não há manchas de umidade no piso ou paredes próximas a tubulações?"],
  ["6.8","A pia da copa/cozinha tem fluxo adequado e drena sem acúmulo?"],
  ["6.9","Não há goteiras no teto durante ou após chuvas? (verificar áreas de calhas e rufos)"]]},
 {n:7,nome:"Estrutura Civil e Acabamentos",q:[
  ["7.1","As paredes internas não apresentam trincas, fissuras ou rachaduras?"],
  ["7.2","A pintura interna está sem bolhas, descascamentos ou manchas de umidade?"],
  ["7.3","A pintura externa (fachada) está sem descascamentos ou deterioração?"],
  ["7.4","O piso interno está sem quebras, descolamentos ou peças soltas?"],
  ["7.5","O forro/teto está sem manchas de umidade, peças caídas ou desalinhadas?"],
  ["7.6","A cobertura (telhado/laje) não apresenta sinais de infiltração ou danos?"]]},
 {n:8,nome:"Segurança e Incêndio",q:[
  ["8.1","Há extintores de incêndio dentro da validade e devidamente sinalizados?"],
  ["8.2","Os extintores estão acessíveis (não bloqueados por móveis ou objetos)?"],
  ["8.4","A placa de saída de emergência está visível e em bom estado?"]]},
 {n:9,nome:"Mobiliário e Ergonomia",q:[
  ["9.1","As baias de atendimento estão sem danos estruturais (tampos, divisórias, suportes)?"],
  ["9.2","As cadeiras giratórias apresentam defeitos no assento?","Sim"],
  ["9.3","As cadeiras giratórias apresentam defeitos na base?","Sim"],
  ["9.4","As cadeiras giratórias apresentam defeito nos rodízios?","Sim"],
  ["9.5","As cadeiras fixas de atendimento estão com os assentos fixados?"],
  ["9.6","As cadeiras fixas de atendimento estão com a pintura em bom estado?"],
  ["9.7","As longarinas estão com os assentos fixados?"],
  ["9.8","As longarinas estão com a pintura em bom estado?"]]}
];
const QS = []; CATS.forEach(c=>c.q.forEach(([id,t,bad])=>QS.push({id,t,bad:bad||"Não",cat:c.n,catNome:c.nome})));
const QMAP = Object.fromEntries(QS.map(q=>[q.id,q]));
const URG = [["imediato","Imediato"],["d30","Até 30 dias"],["espera","Pode esperar"]];
const URG_LABEL = Object.fromEntries(URG);
const URG_ORD = {imediato:0,d30:1,espera:2};

const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isProb = (q,r) => !!r && r!=="NA" && r===q.bad;
const lsGet = k => { try{ return JSON.parse(localStorage.getItem(k)||"null"); }catch(e){ return null; } };
const lsSet = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const lsDel = k => { try{ localStorage.removeItem(k); }catch(e){} };

function scoreOf(respostas, cat){
  let ok=0, tot=0;
  for (const q of QS){ if (cat && q.cat!==cat) continue; const r=respostas?.[q.id]?.r; if(!r||r==="NA") continue; tot++; if(!isProb(q,r)) ok++; }
  return tot ? ok/tot : null;
}
const lv = p => p==null ? "lv-na" : p>=.9 ? "lv-ok" : p>=.7 ? "lv-warn" : "lv-bad";
const lvColor = p => p>=.9 ? "var(--ok)" : p>=.7 ? "var(--warn)" : "var(--bad)";
const pct = p => p==null ? "–" : Math.round(p*100)+"%";
const dataBR = iso => new Date(iso).toLocaleDateString("pt-BR");

function makeClient(){
  const cfg = window.CHECKLIST_CONFIG || {};
  if (!cfg.SUPABASE_URL || /SEU-PROJETO/.test(cfg.SUPABASE_URL) || !cfg.SUPABASE_ANON_KEY || /COLE_AQUI/.test(cfg.SUPABASE_ANON_KEY)) return null;
  return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}
