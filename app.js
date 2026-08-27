// ══════════════════════════════════════════════════════
//  SPPC_ARLAG — app.js
console.log('%c[SPPC] app.js v2608 carregado', 'color:#7c6af7;font-weight:bold;font-size:14px');
// ══════════════════════════════════════════════════════
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail }
                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
         onSnapshot, serverTimestamp, query, orderBy, where }
                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import firebaseConfig       from "./firebase-config.js";
import EMAILJS_CONFIG       from "./emailjs-config.js";

// ── INIT ──────────────────────────────────────────────
const fbApp  = initializeApp(firebaseConfig, 'main');
const fbApp2 = initializeApp(firebaseConfig, 'secondary');
const auth   = getAuth(fbApp);
const auth2  = getAuth(fbApp2);
const db     = getFirestore(fbApp);


// ── GLOBAL ERROR HANDLER ─────────────────────────────
window.addEventListener('error', e => {
  console.error('SPPC_ARLAG Error:', e.message, e.filename, e.lineno);
  const dc = document.getElementById('dashContent');
  if(dc && dc.innerHTML.includes('Carregando')) {
    dc.innerHTML = `<div style="padding:24px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#EF4444;font-size:12px">
      <strong>Erro detectado:</strong> ${e.message} (linha ${e.lineno})<br>
      <small>Verifique o console do navegador (F12) para detalhes.</small>
    </div>`;
  }
});
window.addEventListener('unhandledrejection', e => {
  console.error('SPPC_ARLAG Promise Error:', e.reason);
});

// EmailJS
try { emailjs.init(EMAILJS_CONFIG.publicKey); } catch(e) { console.warn('EmailJS não configurado'); }

// ── CONSTANTES ────────────────────────────────────────
const COLORS = ['#00e5a0','#7c6af7','#ff6b35','#f5c542','#ff4d6d','#38bdf8','#a3e635','#fb7185','#e879f9','#67e8f9'];
const fColor = {}; let cIdx = 0;
function gc(k){ if(!fColor[k]) fColor[k]=COLORS[cIdx++%COLORS.length]; return fColor[k]; }
function ini(n){ return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

// ── ESTADO ────────────────────────────────────────────
let me=null, obras=[], users=[], empreiteiras=[], unsubObras=null;
let _filtroRapidoAtivo=null;
let _sortCol=null, _sortDir=1; // Fix #6: column sort state
let _obrasTipoTab='RD';         // Fix #4: 'RD' | 'ODI' // módulo-level quick filter (not window-scoped)

// ── HELPERS DE DATA ───────────────────────────────────
function hoje(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function parseD(s){ return s? new Date(s+'T00:00:00') : null; }
function fmt(s){ if(!s) return '<span style="color:var(--muted)">—</span>'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function fmtTxt(s){ if(!s) return '—'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function diff(a,b){ if(!a||!b) return null; return Math.round((parseD(b)-parseD(a))/86400000); }
function addDias(dateStr,dias){ if(!dateStr||!dias) return null; const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+parseInt(dias)); return d.toISOString().split('T')[0]; }
function ultimoDiaMesSeginte(dateStr){ if(!dateStr) return null; const d=new Date(dateStr+'T00:00:00'); return new Date(d.getFullYear(), d.getMonth()+2, 0).toISOString().split('T')[0]; }
function diasRestantes(limiteStr){ if(!limiteStr) return null; return Math.round((parseD(limiteStr)-hoje())/86400000); }

function dHtml(v){
  if(v===null) return '<span class="delta d-none">—</span>';
  if(v<=3) return `<span class="delta d-ok">${v}d</span>`;
  if(v<=10) return `<span class="delta d-warn">${v}d</span>`;
  return `<span class="delta d-late">${v}d</span>`;
}
function diasHtml(dias){
  if(dias===null) return '<span class="d-none">—</span>';
  if(dias<0) return `<span class="dias-venc">Vencida há ${Math.abs(dias)}d</span>`;
  if(dias<=1) return `<span class="dias-crit">${dias}d restante</span>`;
  if(dias<=15) return `<span class="dias-warn">${dias}d restantes</span>`;
  return `<span class="dias-ok">${dias}d restantes</span>`;
}

// ── STATUS ────────────────────────────────────────────
const STATUS_DEF = {
  'Cancelada':                    { cor:'#6B7280', bg:'rgba(107,114,128,.15)' },
  'Obra Paralisada':              { cor:'#DC2626', bg:'rgba(220,38,38,.2)'    },
  'Encerrada':                    { cor:'#16A34A', bg:'rgba(22,163,74,.15)'   },
  'Aguard. Armazenamento':        { cor:'#84CC16', bg:'rgba(132,204,22,.15)'  },
  'Aguard. Medida 280':           { cor:'#22C55E', bg:'rgba(34,197,94,.15)'   },
  'Aguard. Medida 230':           { cor:'#10B981', bg:'rgba(16,185,129,.15)'  },
  'Aguard. Medida 70':            { cor:'#14B8A6', bg:'rgba(20,184,166,.15)'  },
  'Aguard. Medição':              { cor:'#6366F1', bg:'rgba(99,102,241,.15)'  },
  'Aguardando Kaffa':             { cor:'#A855F7', bg:'rgba(168,85,247,.15)'  },
  'Encaminhar Cadastro Urgente':  { cor:'#EF4444', bg:'rgba(239,68,68,.15)'   },
  'Ag. Conf. Pend. Fiscal':       { cor:'#F59E0B', bg:'rgba(245,158,11,.15)'  },
  'Pendência':                    { cor:'#F97316', bg:'rgba(249,115,22,.15)'  },
  'Fiscalizado':                  { cor:'#8B5CF6', bg:'rgba(139,92,246,.15)'  },
  'Prob. Executivo – Celesc':     { cor:'#B91C1C', bg:'rgba(185,28,28,.18)'   },
  'Aguard. Fiscalização':         { cor:'#EAB308', bg:'rgba(234,179,8,.15)'   },
  'Atrasada':                     { cor:'#EF4444', bg:'rgba(239,68,68,.15)'   },
  'Em encerramento':              { cor:'#06B6D4', bg:'rgba(6,182,212,.15)'   },
  'Encerramento atrasado':        { cor:'#EF4444', bg:'rgba(239,68,68,.15)'   },
  'Em Execução':                  { cor:'#3B82F6', bg:'rgba(59,130,246,.15)'  },
};

function statusOf(o){
  if(o.cancelado)    return 'Cancelada';
  if(o.paralisada)   return 'Obra Paralisada';
  if(o.armazenado)   return 'Encerrada';
  if(o.medida280)    return 'Aguard. Armazenamento';
  // Fix #7: medidas só avançam o status SE a fiscalização já foi confirmada
  if(o.conclusao && !o.fiscalizacao) return 'Aguard. Fiscalização'; // persiste até fiscal confirmar
  if(o.medida230)    return 'Aguard. Medida 280';
  if(o.medida70)     return 'Aguard. Medida 230';
  // R2: não exige Med.70 — medicao vai direto para "Aguard. Medida 230"
  if(o.medicao)      return o.tipo==='R2' ? 'Aguard. Medida 230' : 'Aguard. Medida 70';
  if(o.fiscalizacao && !o.dataCadastro){
    const d=diff(o.fiscalizacao, new Date().toISOString().split('T')[0]);
    if(d!==null && d>7) return 'Encaminhar Cadastro Urgente';
  }
  if(o.kaffa)        return 'Aguard. Medição';
  if(o.fiscalizacao) return 'Aguardando Kaffa';
  if(o.impedimento)  return 'Prob. Executivo – Celesc';
  if(o.dataLimite && hoje()>parseD(o.dataLimite)) return 'Atrasada';
  return 'Em Execução';
}

// Segundo status: pendência com regularização aguardando conf. fiscal, ou pendência ativa
function statusSecundario(o){
  if(o.pendencia && !o.pendenciaResolvida){
    if(o.regularizacaoData)
      return `<span class="st" style="color:#F59E0B;background:rgba(245,158,11,.15);border-color:#F59E0B44;margin-left:4px"><span style="background:#F59E0B"></span>Ag. Conf. Pend.</span>`;
    return `<span class="st" style="color:#F97316;background:rgba(249,115,22,.15);border-color:#F9731644;margin-left:4px"><span style="background:#F97316"></span>Pendência</span>`;
  }
  return '';
}

function statusHtml(o){
  const s=statusOf(o), d=STATUS_DEF[s]||{cor:'#888',bg:'rgba(128,128,128,.15)'};
  return `<span class="st" style="color:${d.cor};background:${d.bg};border-color:${d.cor}44">
    <span style="background:${d.cor}"></span>${s}</span>${statusSecundario(o)}`;
}


// ── TOAST ─────────────────────────────────────────────
function toast(msg,type='ok'){
  const el=document.createElement('div');
  el.className=`toast-item toast-${type}`;
  el.innerHTML=(type==='ok'?'✅':type==='warn'?'⚠️':'❌')+' '+msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>el.remove(),4500);
}

// ── AUTH ──────────────────────────────────────────────
onAuthStateChanged(auth, async user=>{
  if(user){
    const snap=await getDoc(doc(db,'usuarios',user.uid));
    if(!snap.exists()){ await signOut(auth); return; }
    me={uid:user.uid,email:user.email,...snap.data()};
    iniciarApp();
    // verificarNotificacoes removido — controle de prazos via dashboard do fiscal
  } else {
    me=null;
    document.getElementById('loginScreen').style.display='flex';
    document.getElementById('appScreen').style.display='none';
    if(unsubObras){ unsubObras(); unsubObras=null; }
  }
});

async function doLogin(){
  const email=document.getElementById('lgEmail').value.trim();
  const senha=document.getElementById('lgPass').value;
  const btn=document.getElementById('btnLogin');
  const err=document.getElementById('lgErr');
  err.style.display='none'; btn.disabled=true; btn.textContent='Entrando…';
  try{ await signInWithEmailAndPassword(auth,email,senha); }
  catch(e){ err.textContent='E-mail ou senha incorretos.'; err.style.display='block'; }
  finally{ btn.disabled=false; btn.textContent='Entrar'; }
}
document.getElementById('lgPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
window.doLogin=doLogin;
window.doLogout=()=>signOut(auth);

// ── APP INIT ──────────────────────────────────────────
async function iniciarApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('hName').textContent=me.nome;
  const rb=document.getElementById('hRole');
  const perfilLabels={'gerente':'Gerente','fiscal':'Fiscal','empreiteira':'Empreiteira','genesis':'Genesis','estagiario':'Estagiário'};
  rb.textContent=perfilLabels[me.perfil]||me.perfil;
  rb.className='role-badge role-'+me.perfil;
  // Ensure role badge color for new profiles
  if(!['gerente','fiscal','empreiteira'].includes(me.perfil)){
    rb.style.background='rgba(6,182,212,.15)'; rb.style.color='#06B6D4'; rb.style.border='1px solid rgba(6,182,212,.3)';
  }

  await loadEmpreiteiras();
  popularSelectEmpreiteiras();

  // pgAbertura e pgAnalise somente para gerente e fiscais
  const canSeeFinanceiro = me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm';
  const canSeeProgramas = ['gerente','fiscal','fiscal_adm','empreiteira'].includes(me.perfil);
  const tabs=[
    ['pgDash','📊 Dashboard'],
    ['pgObras','🏗️ Obras'],
    ...(canSeeFinanceiro?[['pgAbertura','📊 Abertura de Obras'],['pgAnalise','💰 Análise Financeira']]:[]),
    ...(canSeeProgramas?[['pgProgramas','📋 Programas']]:[]),
    ...(me.perfil==='gerente'?[['pgCarteiraFutura','📅 Carteira Futura']]:[]),
    ['pgDesligamentos','🔌 Desligamentos'],
  ];
  // Otimização tabs
  const isEmpComOtim = me.perfil==='empreiteira' && EMP_COM_OTIMIZACAO.some(e=>me.vinculo?.toUpperCase().includes(e.split(' ')[0]));
  if(isEmpComOtim) tabs.push(['pgOtimizacao','⚡ Otimização']);
  if(['gerente','fiscal','fiscal_adm'].includes(me.perfil)) tabs.push(['pgOtimizacaoPort','🌐 Portfólio']);
  if(me.perfil==='gerente'){ tabs.push(['pgCarteira','📈 Carteira']); tabs.push(['pgEmpreiteiras','🏢 Empreiteiras']); tabs.push(['pgUsers','👥 Usuários']); }
  // genesis e estagiario: só dash e obras (read-only + ação específica)
  document.getElementById('tabBar').innerHTML =
    tabs.map(([id,lbl])=>`<div class="tab" data-page="${id}" onclick="showPage('${id}')">${lbl}</div>`).join('');

  document.getElementById('btnNovaObra').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnImport').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnBulkDelete').style.display='none'; // shown by filtroRapido when encerradas selected
  const btnApagarTodas=document.getElementById('btnApagarTodas');
  if(btnApagarTodas) btnApagarTodas.style.display=me.perfil==='gerente'?'inline-flex':'none';
  // Fix #2: bulk medidas button
  // Botões de operação em lote por perfil
  const isFiscalAll = ['gerente','fiscal','fiscal_adm'].includes(me.perfil);
  const isEmpMain = me.perfil==='empreiteira';
  const setBtn = (id, show) => { const el=document.getElementById(id); if(el) el.style.display=show?'inline-flex':'none'; };
  setBtn('btnBulkMedidas', isFiscalAll);
  setBtn('btnBulkFisc',    isFiscalAll);
  setBtn('btnBulkMed',     isFiscalAll);
  setBtn('btnBulkCad',     isFiscalAll);
  setBtn('btnBulkConfCad', me.perfil==='gerente'||me.perfil==='genesis'||me.perfil==='estagiario');
  setBtn('btnBulkKaffa',   isEmpMain);
  setBtn('btnBulkConc',    isEmpMain);
  buildTableHeader();

  const q=query(collection(db,'obras'),orderBy('criadaEm','desc'));
  unsubObras=onSnapshot(q,snap=>{
    obras=snap.docs.map(d=>({id:d.id,...d.data()}));
    migrarProgramaR1(); // só roda 1x, tem re-entry guard
    const active=document.querySelector('.page.active');
    if(active?.id==='pgDash'){ renderDash(); }
    if(active?.id==='pgObras') window.renderObras();
    if(active?.id==='pgCarteira') renderCarteira();
  });

  loadEquipDBFromStorage(); // Restore equipment database from localStorage
  aplicarTemaSalvo(); // Restore theme preference
  showPage('pgDash');
}
window.showPage=function(id){
  if(id==='pgObras') _obrasTipoTab='RD';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.page===id));
  document.getElementById(id)?.classList.add('active');
  if(id==='pgDash') renderDash();
  if(id==='pgObras') window.renderObras();
  if(id==='pgCarteira') renderCarteira();
  if(id==='pgUsers') renderUsers();
  if(id==='pgEmpreiteiras') renderEmpreiteiras();
  if(id==='pgAbertura') renderAberturaObras();
  if(id==='pgAnalise'){ loadParamsFinanceiros().then(()=>renderAnaliseFinanceira()); }
  if(id==='pgProgramas') renderProgramas();
  if(id==='pgCarteiraFutura') renderCarteiraFutura();
  if(id==='pgDesligamentos') renderDesligamentos();
  if(id==='pgOtimizacao') renderOtimizacao();
  if(id==='pgOtimizacaoPort') renderOtimizacaoPortfolio();
};
// Sub-tab toggle for RD/ODI inside pgObras (single page, no routing conflict)
window.switchObrasSubTab = function(tipo){
  // Store in DOM — no JS scope issues possible
  const obrasEl = document.getElementById('obrasBody');
  if(obrasEl) obrasEl.setAttribute('data-tab', tipo);
  _obrasTipoTab = tipo; // also keep JS var in sync
  window.renderObras();
};

// ── FILTRO POR PERFIL ─────────────────────────────────
function visibleObras(){
  if(me.perfil==='gerente') return obras;
  if(me.perfil==='fiscal')  return obras;
  if(me.perfil==='genesis') return obras;   // só visualiza
  if(me.perfil==='estagiario') return obras; // visualiza + confirma armazenamento
  if(me.perfil==='empreiteira') return obras.filter(o=>o.empreiteira===me.vinculo);
  return [];
}

// ── EMPREITEIRAS ──────────────────────────────────────
async function loadEmpreiteiras(){
  const snap=await getDocs(collection(db,'empreiteiras'));
  empreiteiras=snap.docs.map(d=>({id:d.id,...d.data()}));
  // seed padrão
  if(!empreiteiras.length){
    await setDoc(doc(db,'empreiteiras','cs'), {nome:'CS ELETRICIDADE',email:''});
    await setDoc(doc(db,'empreiteiras','el'), {nome:'ELETELSUL',email:''});
    const snap2=await getDocs(collection(db,'empreiteiras'));
    empreiteiras=snap2.docs.map(d=>({id:d.id,...d.data()}));
  }
}
function popularSelectEmpreiteiras(){
  const sel=document.getElementById('oEmp');
  sel.innerHTML='<option value="">— selecione —</option>'+
    empreiteiras.map(e=>`<option value="${e.nome}">${e.nome}</option>`).join('');
  const sel2=document.getElementById('uVincEmp');
  sel2.innerHTML='<option value="">— selecione —</option>'+
    empreiteiras.map(e=>`<option value="${e.nome}">${e.nome}</option>`).join('');
}
async function renderEmpreiteiras(){
  await loadEmpreiteiras();
  document.getElementById('empList').innerHTML=empreiteiras.length
    ? empreiteiras.map(e=>`<div class="ut-row">
        <div class="ut-name">${e.nome}</div>
        <div class="ut-email">${e.email||'—'}</div>
        <div class="ut-acts">
          <button class="btn btn-secondary btn-sm" onclick="openEmpModal('${e.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="delEmp('${e.id}')">🗑️</button>
        </div>
      </div>`).join('')
    : '<div class="empty"><div class="ico">🏢</div><p>Nenhuma empreiteira.</p></div>';
}
window.renderEmpreiteiras=renderEmpreiteiras;
window.openEmpModal=function(id){
  const e=id?empreiteiras.find(x=>x.id===id):null;
  document.getElementById('empModalTit').textContent=e?'Editar Empreiteira':'Nova Empreiteira';
  document.getElementById('empId').value=id||'';
  document.getElementById('eNome').value=e?.nome||'';
  document.getElementById('eEmail').value=e?.email||'';
  document.getElementById('ovEmp').classList.add('open');
};
window.closeEmpModal=function(){ document.getElementById('ovEmp').classList.remove('open'); };
window.saveEmp=async function(){
  const btn=document.getElementById('btnSalvarEmp');
  btn.disabled=true; btn.textContent='Salvando…';
  try{
    const id=document.getElementById('empId').value;
    const nome=document.getElementById('eNome').value.trim();
    const email=document.getElementById('eEmail').value.trim();
    if(!nome){ toast('Informe o nome da empreiteira.','err'); return; }
    if(id) await updateDoc(doc(db,'empreiteiras',id),{nome,email});
    else   await addDoc(collection(db,'empreiteiras'),{nome,email});
    toast('Empreiteira salva!');
    closeEmpModal();
    await loadEmpreiteiras();
    popularSelectEmpreiteiras();
    renderEmpreiteiras();
  }catch(e){ toast('Erro: '+e.message,'err'); }
  finally{ btn.disabled=false; btn.textContent='Salvar'; }
};
window.delEmp=async function(id){
  if(!confirm('Remover esta empreiteira?')) return;
  await deleteDoc(doc(db,'empreiteiras',id));
  await loadEmpreiteiras(); popularSelectEmpreiteiras(); renderEmpreiteiras();
  toast('Empreiteira removida.','warn');
};

// ── DASHBOARD ─────────────────────────────────────────
// Estado para seleção de perspectiva no dashboard do gerente
let dashPerspectiva = 'gerente'; // 'gerente' | 'fiscal:Nome' | 'empreiteira:Nome'

let _renderDashTimer=null;
function renderDashDebounced(){ clearTimeout(_renderDashTimer); _renderDashTimer=setTimeout(renderDash,80); }

function renderDash(){
  if(window._migrando) return; // não renderiza durante migração para evitar flickering
  const listAll = obras; // todas as obras (sem filtro de perfil para o gerente navegar)
  const list = visibleObras();
  let html = '';
  html += '<div id="dashFavoritosSlot"></div>';
  // Favoritos: carrega async mas só atualiza se o slot ainda existir
  const slotId = 'dashFavoritosSlot_'+Date.now();
  html = html.replace('id="dashFavoritosSlot"', `id="${slotId}"`);
  const _curSlot = slotId;
  renderDashFavoritos().then(h=>{
    const d=document.getElementById(_curSlot);
    if(d&&h) d.innerHTML=h;
  });

  if(me.perfil === 'gerente'){
    // Seletor de perspectiva
    const fiscaisDisponiveis = [...new Set(obras.map(o=>o.fiscal).filter(Boolean))].sort();
    const empDisponiveis = empreiteiras.map(e=>e.nome);
    html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--muted)">Visualizando como:</span>
      <button class="btn btn-sm ${dashPerspectiva==='gerente'?'btn-primary':'btn-secondary'}"
        onclick="setDashPerspectiva('gerente')">👔 Gerente</button>
      <button class="btn btn-sm ${dashPerspectiva==='genesis'?'btn-primary':'btn-secondary'}"
        onclick="setDashPerspectiva('genesis')" style="font-size:10px">🔷 Genesis</button>
      <button class="btn btn-sm ${dashPerspectiva==='estagiario'?'btn-primary':'btn-secondary'}"
        onclick="setDashPerspectiva('estagiario')" style="font-size:10px">🎓 Estagiário</button>
      <select id="selFiscalDash" onchange="setDashPerspectiva('fiscal:'+this.value)"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px;">
        <option value="">👷 Ver como Fiscal…</option>
        ${fiscaisDisponiveis.map(f=>`<option value="${f}" ${dashPerspectiva==='fiscal:'+f?'selected':''}>${f}</option>`).join('')}
      </select>
      <select id="selEmpDash" onchange="setDashPerspectiva('empreiteira:'+this.value)"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px;">
        <option value="">🏗️ Ver como Empreiteira…</option>
        ${empDisponiveis.map(e=>`<option value="${e}" ${dashPerspectiva==='empreiteira:'+e?'selected':''}>${e}</option>`).join('')}
      </select>
    </div>`;

    if(dashPerspectiva === 'gerente'){
      html += renderDashGerente(list, listAll);
    } else if(dashPerspectiva === 'genesis'){
      html += '<div class="modal-note" style="margin-bottom:16px">👁️ Perspectiva <strong>Genesis</strong></div>';
      html += renderDashGenesis(listAll);
    } else if(dashPerspectiva === 'estagiario'){
      html += '<div class="modal-note" style="margin-bottom:16px">👁️ Perspectiva <strong>Estagiário</strong></div>';
      html += renderDashEstagiario(listAll);
    } else if(dashPerspectiva.startsWith('fiscal:')){
      const nome = dashPerspectiva.replace('fiscal:','');
      html += '<div class="modal-note" style="margin-bottom:16px">👁️ Perspectiva do fiscal <strong>'+nome+'</strong></div>';
      html += renderDashFiscal(listAll, nome);
    } else if(dashPerspectiva.startsWith('empreiteira:')){
      const nome = dashPerspectiva.replace('empreiteira:','');
      html += '<div class="modal-note" style="margin-bottom:16px">👁️ Perspectiva da empreiteira <strong>'+nome+'</strong></div>';
      html += renderDashEmpreiteira(listAll.filter(o=>o.empreiteira===nome));
    }
  }
  else if(me.perfil === 'fiscal'){
    html += renderDashFiscal(list, me.vinculo);
  }
  else if(me.perfil === 'fiscal_adm'){
    // fiscal_adm dashboard: mostra SUAS obras (vinculo), igual ao fiscal normal
    // Protege contra vinculo vazio — sem vinculo, não mostra obras de outros
    const vincAdm = me.vinculo?.trim();
    const minhasFiscalAdm = vincAdm
      ? obras.filter(o=>o.fiscal===vincAdm&&!o.cancelado)
      : [];
    if(!vincAdm) toast('⚠️ Fiscal Administrativo sem vínculo cadastrado. Configure o vínculo no perfil do usuário.','warn');
    html += renderDashFiscal(minhasFiscalAdm, vincAdm||'(sem vínculo)');
  }
  else if(me.perfil === 'empreiteira'){
    html += renderDashEmpreiteira(list);
  }
  else if(me.perfil === 'genesis'){
    html += renderDashGenesis(obras); // genesis sees ALL obras
  }
  else if(me.perfil === 'estagiario'){
    html += renderDashEstagiario(obras); // estagiário sees ALL obras
  }

  try{
    document.getElementById('dashContent').innerHTML = html;
  // Render pendência charts after DOM is updated
  setTimeout(() => {
    if(me.perfil === 'gerente' && dashPerspectiva === 'gerente')
      renderChartPendencias(visibleObras(), 'pendenciasChartGerente');
    else if(me.perfil === 'fiscal' || me.perfil === 'fiscal_adm')
      renderChartPendencias(obras.filter(o=>o.fiscal===me.vinculo), 'pendenciasChartFiscal');
    else if(me.perfil === 'gerente' && dashPerspectiva.startsWith('fiscal:'))
      renderChartPendencias(obras.filter(o=>o.fiscal===dashPerspectiva.replace('fiscal:','')), 'pendenciasChartFiscal');
  }, 100);
  }catch(e){
    console.error('renderDash error:',e);
    document.getElementById('dashContent').innerHTML='<div style="padding:20px;color:#EF4444">Erro ao renderizar dashboard: '+e.message+'</div>';
  }
}

window.setDashPerspectiva = function(p){
  if(!p || p.endsWith(':')) return;
  dashPerspectiva = p;
  renderDash();
};

function renderDashGerente(list, listAll){
  let html = '';
  html += `<div class="kpi-strip">
    ${kpiCard('Total',list.length,'obras','#00e5a0')}
    ${kpiCard('Em Execução',list.filter(o=>statusOf(o)==='Em Execução').length,'no prazo','#3B82F6')}
    ${kpiCard('Atrasadas',list.filter(o=>statusOf(o)==='Atrasada').length,'fora do prazo','#EF4444')}
    ${kpiCard('Paralisadas',list.filter(o=>o.paralisada).length,'paralisadas','#DC2626')}
    ${kpiCard('Prob. Executivo',list.filter(o=>o.impedimento&&!o.conclusao).length,'Celesc verificar','#B91C1C')}
    ${kpiCard('Pendências Ativas',list.filter(o=>o.pendencia&&!o.pendenciaResolvida).length,'aguardando resolução','#F97316')}
    ${kpiCard('Ag. Conf. Pend.',list.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData).length,'fiscal conferir','#F59E0B')}
    ${kpiCard('Cadastro Urgente',list.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente').length,'+7d sem cadastro','#EF4444')}
    ${kpiCard('Encerradas',list.filter(o=>statusOf(o)==='Encerrada').length,'armazenadas','#16A34A')}
  </div>`;

  // Tabela resumo por fiscal
  html += '<div class="sect-title" style="margin-bottom:10px">Painel de Fiscais</div>';
  html += tabelaResumoFiscais(list);
  // ── Painel de Programas ─────────────────────────────────────────────
  {
    const progsDisp=['Regulatório','PODI','Mono-Tri','Melhoria'];
    const corsP={'Regulatório':'#22C55E','PODI':'#7c6af7','Mono-Tri':'#F59E0B','Melhoria':'#3B82F6'};
    const ativos=list.filter(o=>!o.cancelado&&!o.armazenado);
    const emps=[...new Set(ativos.map(o=>o.empreiteira).filter(Boolean))].sort();
    const bgs=pool=>progsDisp.filter(p=>pool.filter(o=>o.programa===p).length>0).map(p=>`<span style="background:${corsP[p]};color:#fff;padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700">${p}: ${pool.filter(o=>o.programa===p).length}</span>`).join(' ');
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <div class="sect-title" style="margin-bottom:10px">📋 PROGRAMAS</div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:5px;font-weight:700">🌐 Geral — ${ativos.length} obras</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">${bgs(ativos)||'<span style="font-size:10px;color:var(--muted)">Nenhum programa definido</span>'}</div>
      </div>
      ${emps.map(emp=>{const obEmp=ativos.filter(o=>o.empreiteira===emp);const b=bgs(obEmp);return b?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><div style="font-size:10px;color:var(--muted);margin-bottom:4px">🏢 ${emp} (${obEmp.length})</div><div style="display:flex;flex-wrap:wrap;gap:5px">${b}</div></div>`:''}).join('')}
    </div>`;
  }
  html += '<div class="sect-title" style="margin-bottom:10px;margin-top:20px">Painel de Empreiteiras</div>';
  html += tabelaResumoEmpreiteiras(list);
  html += renderMonitorPrazos(list);
  html += '<div class="sect-title" style="margin-bottom:12px;margin-top:20px">Velocidade Média por Fiscal</div>';
  html += '<div class="vel-grid">' + velCards(list) + '</div>';
  // Gráfico mensal de pendências
  html += '<div class="sect-title" style="margin-bottom:10px;margin-top:20px">📊 Pendências por Mês</div>';
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto" id="pendenciasChartGerente"></div>';
  return html;
}

function tabelaResumoFiscais(list){
  const fiscais = [...new Set(list.map(o=>o.fiscal).filter(Boolean))].sort();
  if(!fiscais.length) return '<div class="empty"><p>Nenhum fiscal com obras.</p></div>';
  const rows = fiscais.map(f => {
    const minhas = list.filter(o=>o.fiscal===f);
    const pend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida).length;
    const agConf = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData).length;
    const paraFisc = minhas.filter(o=>o.conclusao&&!o.fiscalizacao).length;
    const paraMedir = minhas.filter(o=>o.kaffa&&!o.medicao).length;
    const cadUrg = minhas.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente').length;
    const atrasadas = minhas.filter(o=>statusOf(o)==='Atrasada').length;
    const c = gc(f);
    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>
        <strong>${f}</strong></span></td>
      <td style="text-align:center">${minhas.length}</td>
      <td style="text-align:center;color:${paraFisc>0?'var(--yellow)':'var(--muted)'}">${paraFisc}</td>
      <td style="text-align:center;color:${paraMedir>0?'var(--accent3)':'var(--muted)'}">${paraMedir}</td>
      <td style="text-align:center;color:${pend>0?'var(--accent2)':'var(--muted)'}">${pend}${agConf>0?` <span style="font-size:9px;color:#F59E0B">(${agConf} ag. conf.)</span>`:''}</td>
      <td style="text-align:center;color:${cadUrg>0?'var(--red)':'var(--muted)'}">${cadUrg}</td>
      <td style="text-align:center;color:${atrasadas>0?'var(--red)':'var(--muted)'}">${atrasadas}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="setDashPerspectiva('fiscal:${f.replace(/'/g,"\'")}')">👁️ Ver</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="max-height:none"><table>
    <thead><tr>
      <th>Fiscal</th><th style="text-align:center">Total</th><th style="text-align:center">Para Fiscalizar</th>
      <th style="text-align:center">Para Medir</th><th style="text-align:center">Pendências</th>
      <th style="text-align:center;color:#14B8A6" title="Obras sem Med.70 vencidas ou críticas (≤5d)">⏱ Med.70</th>
      <th style="text-align:center;color:#10B981" title="Obras sem Med.230 vencidas ou críticas (≤5d)">⏱ Med.230</th>
      <th style="text-align:center;color:#22C55E" title="Obras sem Med.280 vencidas ou críticas (≤5d)">⏱ Med.280</th>
      <th style="text-align:center">Cad. Urgente</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function tabelaResumoEmpreiteiras(list){
  if(!empreiteiras.length) return '<div class="empty"><p>Nenhuma empreiteira.</p></div>';
  const rows = empreiteiras.map(e => {
    const minhas = list.filter(o=>o.empreiteira===e.nome);
    const pend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida).length;
    const agConf = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData).length;
    const aguardKaffa = minhas.filter(o=>o.conclusao&&!o.kaffa).length;
    const impedimentos = minhas.filter(o=>o.impedimento&&!o.conclusao).length;
    const atrasadas = minhas.filter(o=>statusOf(o)==='Atrasada').length;
    const c = gc(e.nome);
    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>
        <strong>${e.nome}</strong></span></td>
      <td style="text-align:center">${minhas.length}</td>
      <td style="text-align:center;color:${aguardKaffa>0?'var(--accent3)':'var(--muted)'}">${aguardKaffa}</td>
      <td style="text-align:center;color:${pend>0?'var(--accent2)':'var(--muted)'}">${pend}${agConf>0?` <span style="font-size:9px;color:#F59E0B">(${agConf} reg.)</span>`:''}</td>
      <td style="text-align:center;color:${impedimentos>0?'var(--red)':'var(--muted)'}">${impedimentos}</td>
      <td style="text-align:center;color:${atrasadas>0?'var(--red)':'var(--muted)'}">${atrasadas}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="setDashPerspectiva('empreiteira:${e.nome.replace(/'/g,"\'")}')">👁️ Ver</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="max-height:none"><table>
    <thead><tr>
      <th>Empreiteira</th><th style="text-align:center">Total</th><th style="text-align:center">Aguard. Kaffa</th>
      <th style="text-align:center">Pendências</th><th style="text-align:center">Impedimentos</th>
      <th style="text-align:center">Atrasadas</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderDashFiscal(list, meuNome){
  const minhas = list.filter(o=>o.fiscal===meuNome);
  const uscTotal = minhas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const ulvTotal = minhas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
  const comPend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida);
  const agConfPend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData);
  const paraFisc = list.filter(o=>o.conclusao&&!o.fiscalizacao&&o.fiscal===meuNome);
  const paraMedir = list.filter(o=>o.kaffa&&!o.medicao&&o.fiscal===meuNome);
  const cadUrgente = minhas.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente');
  const mesAtual = new Date().getMonth(), anoAtual = new Date().getFullYear();
  const fiscMes = minhas.filter(o=>{ if(!o.fiscalizacao) return false; const d=new Date(o.fiscalizacao+'T00:00:00'); return d.getMonth()===mesAtual&&d.getFullYear()===anoAtual; });
  const tempoFisc = avgDiff(minhas,'conclusao','fiscalizacao');
  const tempoMed = avgDiffKaffaMedicao(minhas); // pareia kaffa parcial/final com medição parcial/final
  const tempoCad = avgDiff(minhas,'fiscalizacao','dataCadastro');
  let html = `<div class="kpi-strip">
    ${kpiCard('Obras',minhas.length,'atribuídas','#00e5a0')}
    ${kpiCard('USC Total',uscTotal.toFixed(1),'unidades','#7c6af7')}
    ${kpiCard('ULV Total',ulvTotal.toFixed(1),'unidades','#ff6b35')}
    ${kpiCard('Para Fiscalizar',paraFisc.length,'aguardando vistoria','#EAB308')}
    ${kpiCard('Para Medir',paraMedir.length,'kaffa sem medição','#6366F1')}
    ${kpiCard('Pendências Ativas',comPend.length,'não resolvidas','#F97316')}
    ${kpiCard('Ag. Conf. Pend.',agConfPend.length,'regularizadas p/ conferir','#F59E0B')}
    ${kpiCard('Cadastro Urgente',cadUrgente.length,'+7d sem enviar','#EF4444')}
    ${kpiCard('Fiscalizadas/Mês',fiscMes.length,'mês corrente','#38bdf8')}
    ${kpiCard('Tempo Médio Fisc.',tempoFisc!==null?tempoFisc+'d':'—','conclusão→fiscalização','#a3e635')}
    ${kpiCard('Tempo Médio Med.',tempoMed!==null?tempoMed+'d':'—','kaffa→medição','#fb7185')}
    ${kpiCard('Tempo Médio Cadastro',tempoCad!==null?tempoCad+'d':'—','fiscalização→cadastro','#f5c542')}
  </div>`;
  html += renderMonitorPrazos(minhas);
  html += '<div class="sect-title" style="margin-bottom:12px">Pendências por Empreiteira</div>';
  html += pendenciaRankingPorEmpreiteira(minhas);
  html += '<div class="sect-title" style="margin-bottom:12px;margin-top:16px">Obras por Empreiteira</div>';
  html += '<div class="kpi-strip">' + emprKpis(minhas) + '</div>';
  html += '<div class="sect-title" style="margin-bottom:10px;margin-top:20px">📊 Pendências por Mês</div>';
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto" id="pendenciasChartFiscal"></div>';
  html += '<div style="margin-top:16px">' + renderDashSummaryFiscal(minhas) + '</div>';
    setTimeout(()=>renderChartPendencias(list,'pendenciasChartFiscal'),100);
    return html;
}

function renderDashEmpreiteira(minhas){
  const uscTotal = minhas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const ulvTotal = minhas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
  const aguardKaffa = minhas.filter(o=>o.conclusao&&!(o.kaffaEntries||[]).some(k=>k.tipo==='final')); // aguarda kaffa FINAL
  const aguardMed = minhas.filter(o=>o.kaffa&&!o.medicao);
  const comPend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida);
  const tempoKaffa = avgDiffConclusaoKaffaFinal(minhas); // só kaffa FINAL conta para este KPI
  const tempoReg = avgDiff(minhas.filter(o=>o.pendencia&&o.regularizacaoData),'prazoPendencia','regularizacaoData');

  // Estatística: tempo médio para informar conclusão por prazo
  const prazoGroups = {};
  minhas.filter(o=>o.dataAbertura&&o.conclusao&&o.prazoExecucao).forEach(o=>{
    const prazo = String(o.prazoExecucao);
    if(!prazoGroups[prazo]) prazoGroups[prazo]={label:prazo+'d',vals:[]};
    const d = diff(o.dataAbertura, o.conclusao);
    if(d!==null) prazoGroups[prazo].vals.push(d);
  });
  const avgArr = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : null;

  let html = `<div class="kpi-strip">
    ${kpiCard('Total de Obras',minhas.length,'da empresa','#00e5a0')}
    ${kpiCard('USC Total',uscTotal.toFixed(1),'unidades','#7c6af7')}
    ${kpiCard('ULV Total',ulvTotal.toFixed(1),'unidades','#ff6b35')}
    ${kpiCard('Aguard. Kaffa',aguardKaffa.length,'concluídas sem kaffa','#A855F7')}
    ${kpiCard('Aguard. Medição',aguardMed.length,'kaffa sem medição','#6366F1')}
    ${kpiCard('Com Pendência',comPend.length,'não resolvidas','#F97316')}
    ${kpiCard('Tempo Médio Kaffa',tempoKaffa!==null?tempoKaffa+'d':'—','conclusão→kaffa','#a3e635')}
    ${kpiCard('Tempo Médio Regulariz.',tempoReg!==null?tempoReg+'d':'—','pendência→regularização','#fb7185')}
  </div>`;

  // Tempo médio de conclusão por prazo contratual
  if(Object.keys(prazoGroups).length){
    html += '<div class="sect-title" style="margin-bottom:10px;margin-top:4px">Tempo Médio para Concluir — por Prazo Contratual</div>';
    html += '<div class="vel-grid">';
    Object.entries(prazoGroups).sort((a,b)=>+a[0]-+b[0]).forEach(([prazo,g])=>{
      const avg = avgArr(g.vals);
      const pct = avg !== null ? Math.min(100, Math.round((avg/+prazo)*100)) : 0;
      const cor = pct<=85?'var(--accent)':pct<=100?'var(--yellow)':'var(--red)';
      html += `<div class="vel-card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span class="vc-name">Prazo ${g.label}</span>
          <span style="font-size:11px;color:var(--muted)">${g.vals.length} obras</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;color:var(--muted)">Média real:</span>
          <span style="font-size:18px;font-weight:700;color:${cor}">${avg!==null?avg+'d':'—'}</span>
        </div>
        <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${cor}"></div></div>
        <div style="font-size:9px;color:var(--muted);margin-top:4px;text-align:right">${pct}% do prazo</div>
      </div>`;
    });
    html += '</div>';
  }

  html += '<div class="sect-title" style="margin-bottom:12px;margin-top:8px">Obras por Tipo</div>';
  html += `<div class="kpi-strip">${['R1','R2','ODI'].map(t=>kpiCard(t,minhas.filter(o=>o.tipo===t).length,'obras',gc(t))).join('')}</div>`;
  html += '<div class="sect-title" style="margin-bottom:12px;margin-top:8px">Principais Pendências</div>';
  html += pendenciaRanking(minhas);
  html += '<div class="sect-title" style="margin-bottom:10px;margin-top:20px">📊 Pendências por Mês</div>';
  html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto" id="pendenciasChartEmp"></div>';

  // Análise mensal somente para CS Eletricidade e Eletelsul
  const isEmpPrincipal = EMP_COM_OTIMIZACAO.some(e=>me.vinculo?.toUpperCase().includes(e.split(' ')[0]));
  if(isEmpPrincipal){
    html += '<div class="sect-title" style="margin-bottom:10px;margin-top:20px">📅 Análise Mensal — Obras em Mãos</div>';
    // Build mini bar chart for this empreiteira (same logic as Carteira)
    const ativas_emp = minhas.filter(o=>!o.conclusao&&!o.cancelado&&(o.tipo==='R1'||o.tipo==='R2'));
    const hojeD2=new Date(), hsEmp=hojeStr();
    const mV=m=>{const[mm,yy]=m.split('/');return +yy*100+ +mm;};
    const mS=s=>{if(!s)return null;const[y,m]=s.split('-');return `${m}/${y}`;};
    const meses12e=[];
    for(let i=0;i<=12;i++){const d=new Date(hojeD2.getFullYear(),hojeD2.getMonth()+i,1);meses12e.push(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);}
    const atrE=ativas_emp.filter(o=>o.dataLimite&&o.dataLimite<hsEmp);
    const colsE=[
      {lbl:'⚠️ Atras.',q:atrE.length,usc:atrE.reduce((s,o)=>s+(parseFloat(o.usc)||0),0),cor:'#EF4444'},
      ...meses12e.map((m,i)=>({
        lbl:m,
        q:i===0?ativas_emp.filter(o=>mS(o.dataLimite)===m&&o.dataLimite>=hsEmp).length:ativas_emp.filter(o=>mS(o.dataLimite)===m).length,
        usc:(i===0?ativas_emp.filter(o=>mS(o.dataLimite)===m&&o.dataLimite>=hsEmp):ativas_emp.filter(o=>mS(o.dataLimite)===m)).reduce((s,o)=>s+(parseFloat(o.usc)||0),0),
        cor:i===0?'#22C55E':'#7c6af7'
      }))
    ];
    const maxQe=Math.max(...colsE.map(c=>c.q),1);
    const cwE=58,bHe=90,tPe=48,bPe=28,plE=6;
    let svgE=`<svg xmlns="http://www.w3.org/2000/svg" width="${plE+colsE.length*cwE+plE}" height="${tPe+bHe+bPe}" style="font-family:'DM Mono',monospace;display:block">`;
    svgE+=`<line x1="${plE}" y1="${tPe+bHe}" x2="${plE+colsE.length*cwE}" y2="${tPe+bHe}" stroke="#374151" stroke-width="1"/>`;
    colsE.forEach((c,i)=>{
      const x=plE+i*cwE,cx=x+cwE/2,bh=c.q>0?Math.max(6,Math.round((c.q/maxQe)*bHe)):0,by=tPe+bHe-bh;
      if(bh>0){svgE+=`<rect x="${x+3}" y="${by}" width="${cwE-6}" height="${bh}" rx="4" fill="${c.cor}" opacity="0.85"/>`;} 
      if(c.q>0){
        const u=c.usc>=1000?(c.usc/1000).toFixed(1).replace('.0','')+'k USC':c.usc.toFixed(0)+' USC';
        svgE+=`<text x="${cx}" y="${by-26}" text-anchor="middle" font-size="8" fill="${c.cor}bb">${u}</text>`;
        svgE+=`<text x="${cx}" y="${by-12}" text-anchor="middle" font-size="11" font-weight="800" fill="${c.cor}">${c.q}</text>`;
      }
      svgE+=`<text x="${cx}" y="${tPe+bHe+16}" text-anchor="middle" font-size="8" font-weight="${i<=1?700:400}" fill="${c.cor==='#EF4444'?'#EF4444':i===1?'#22C55E':'#9ca3af'}">${c.lbl}</text>`;
    });
    svgE+='</svg>';
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto">${svgE}
      <div style="display:flex;gap:20px;margin-top:8px;font-size:10px;color:var(--muted)">
        <span><span style="color:#EF4444">⚠️</span> Atrasadas: ${atrE.length}</span>
        <span>Total em mãos: ${ativas_emp.length}</span>
        <span>USC em mãos: ${ativas_emp.reduce((s,o)=>s+(parseFloat(o.usc)||0),0).toFixed(1)}</span>
      </div>
    </div>`;
  }

  // Fix #1: Lista de obras atrasadas no dashboard da empreiteira
  const empAtrasadas = minhas.filter(o=>!o.conclusao&&o.dataLimite&&o.dataLimite<hojeStr());
  if(empAtrasadas.length){
    html += `<div class="sect-title" style="margin-bottom:10px;margin-top:20px;color:#EF4444">⚠️ Obras Atrasadas (${empAtrasadas.length})</div>`;
    html += '<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Tipo</th><th>Cidade</th><th>Fiscal</th><th>Vencimento</th><th>Dias Atraso</th><th>USC</th><th>Status</th></tr></thead><tbody>';
    html += empAtrasadas.sort((a,b)=>a.dataLimite>b.dataLimite?1:-1).map(o=>{
      const da=diff(o.dataLimite,hojeStr());
      return `<tr style="background:rgba(239,68,68,.07)">
        <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
        <td><span class="chip">${o.tipo||'—'}</span></td>
        <td>${o.cidade||'—'}</td>
        <td>${o.fiscal||'—'}</td>
        <td style="color:#EF4444">${fmt(o.dataLimite)}</td>
        <td style="color:#EF4444;font-weight:700">${da!==null?da+'d':'—'}</td>
        <td>${o.usc||'—'}</td>
        <td>${statusHtml(o)}</td>
      </tr>`;
    }).join('');
    html += '</tbody></table></div>';
  } else {
    html += '<div class="modal-note" style="margin-top:16px;color:#22C55E">✅ Nenhuma obra atrasada!</div>';
  }
  html += '<div style="margin-top:16px">' + renderDashSummaryEmpreiteira(minhas) + '</div>';
    setTimeout(()=>renderChartPendencias(minhas,'pendenciasChartEmp'),100);
    return html;
}


// ── DASHBOARD GENESIS ─────────────────────────────────────────────────
function renderDashGenesis(list){
  const aguardando = list.filter(o => o.dataCadastro && !o.cadastroConfirmado && !o.cancelado);
  const confirmados = list.filter(o => o.cadastroConfirmado);
  const hoje_s = hojeStr();
  // Avg time: dataCadastro → dataCadastroConfirmado
  const tempos = confirmados.filter(o=>o.dataCadastro&&o.dataCadastroConfirmado).map(o=>diff(o.dataCadastro,o.dataCadastroConfirmado));
  const avgTempo = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;
  let html = `<div class="kpi-strip">
    ${kpiCard('Aguardando Cadastro',aguardando.length,'enviadas pelo fiscal, sem confirmar','#F59E0B')}
    ${kpiCard('Cadastros Confirmados',confirmados.length,'já confirmados','#22C55E')}
    ${kpiCard('Tempo Médio Confirmação',avgTempo!==null?avgTempo+'d':'—','envio → confirmação','#06B6D4')}
    ${kpiCard('Total Obras',list.filter(o=>!o.cancelado).length,'no sistema','#00e5a0')}
  </div>`;
  html += '<div class="sect-title" style="margin-bottom:10px">Monitor — Obras Aguardando Confirmação de Cadastro</div>';
  if(!aguardando.length){
    html += '<div class="empty" style="padding:24px"><div class="ico">✅</div><p>Nenhuma obra aguardando confirmação de cadastro.</p></div>';
  } else {
    const rows = [...aguardando].sort((a,b)=>a.dataCadastro>b.dataCadastro?1:-1).map(o=>{
      const diasAg = diff(o.dataCadastro, hoje_s);
      const corDias = diasAg===null?'var(--muted)':diasAg>30?'var(--red)':diasAg>15?'var(--yellow)':'var(--text)';
      return `<tr>
        <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
        <td>${o.cidade||'—'}</td>
        <td>${o.fiscal||'—'}</td>
        <td>${fmt(o.dataCadastro)}</td>
        <td style="color:${corDias};font-weight:600">${diasAg!==null?diasAg+'d':'—'}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openObraModal('${o.id}')">Confirmar Cadastro</button></td>
      </tr>`;
    }).join('');
    html += `<div class="tbl-wrap"><table>
      <thead><tr><th>Nº Obra</th><th>Cidade</th><th>Fiscal</th><th>Enviado em</th><th>Dias Aguardando</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }
  return html;
}

// ── DASHBOARD ESTAGIÁRIO ───────────────────────────────────────────────
function renderDashEstagiario(list){
  const semArm   = list.filter(o => o.medida280 && !o.armazenado && !o.cancelado);
  const armOk    = list.filter(o => o.armazenado);
  const semContr = list.filter(o => o.medida280 && !o.armazenado && !o.contratosAssinado);
  const semMed   = list.filter(o => o.medida280 && !o.armazenado && !o.medicoesAssinadas);
  const semProj  = list.filter(o => o.medida280 && !o.armazenado && !o.projetosAsBuilt);
  let html = `<div class="kpi-strip">
    ${kpiCard('Aguard. Armazenamento',semArm.length,'com Med.280, sem armazenar','#F59E0B')}
    ${kpiCard('Armazenadas',armOk.length,'concluídas','#22C55E')}
    ${kpiCard('Sem Contratos',semContr.length,'faltando assinar','#EF4444')}
    ${kpiCard('Sem Medições Assin.',semMed.length,'faltando assinar','#EF4444')}
    ${kpiCard('Sem As-Built',semProj.length,'faltando assinar','#EF4444')}
  </div>`;
  html += '<div class="sect-title" style="margin-bottom:10px">Monitor — Obras para Armazenar</div>';
  if(!semArm.length){
    html += '<div class="empty" style="padding:24px"><div class="ico">✅</div><p>Nenhuma obra pendente de armazenamento.</p></div>';
  } else {
    const rows = semArm.map(o=>{
      const itens = [
        o.contratosAssinado?null:'Contratos',
        o.medicoesAssinadas?null:'Medições',
        o.projetosAsBuilt?null:'As-Built',
        o.caixaArmazenada?null:'Caixa',
      ].filter(Boolean);
      return `<tr>
        <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
        <td>${o.cidade||'—'}</td>
        <td>${o.fiscal||'—'}</td>
        <td>${fmt(o.medida280)}</td>
        <td>${itens.length?`<span class="chip chip-red">${itens.join(', ')}</span>`:'<span class="chip chip-green">Pronto p/ confirmar</span>'}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openObraModal('${o.id}')">Armazenar</button></td>
      </tr>`;
    }).join('');
    html += `<div class="tbl-wrap"><table>
      <thead><tr><th>Nº Obra</th><th>Cidade</th><th>Fiscal</th><th>Med.280</th><th>Faltando</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }
  return html;
}

// ── GRÁFICO MENSAL DE PENDÊNCIAS ─────────────────────────────────────
function renderChartPendencias(list, containerId){
  const cont = document.getElementById(containerId);
  if(!cont) return;

  // Conta pendências por mês (usa dataPendencia — quando a pendência foi registrada)
  const meses = {};
  list.forEach(o=>{
    const dp = o.dataPendencia||o.prazoPendencia;
    if(!dp) return;
    const [y,m] = dp.split('-');
    if(!y||!m) return;
    const key = `${m}/${y}`;
    meses[key] = (meses[key]||0) + 1;
  });

  const entries = Object.entries(meses)
    .sort((a,b)=>{ const[ma,ya]=a[0].split('/'); const[mb,yb]=b[0].split('/');
      return (+ya*100+ +ma)-(+yb*100+ +mb); });

  if(!entries.length){
    cont.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">Nenhuma pendência registrada.</div>';
    return;
  }

  const maxV = Math.max(...entries.map(e=>e[1]), 1);
  const colW = 60, barH = 100, topP = 40, botP = 24, padL = 8;
  const svgW = padL + entries.length * colW + padL;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${topP+barH+botP}" style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
  svg += `<line x1="${padL}" y1="${topP+barH}" x2="${svgW-padL}" y2="${topP+barH}" stroke="#374151" stroke-width="1"/>`;

  entries.forEach(([mes, qtd], i)=>{
    const x = padL + i*colW;
    const cx = x + colW/2;
    const bh = Math.max(6, Math.round((qtd/maxV)*barH));
    const by = topP + barH - bh;
    svg += `<rect x="${x+4}" y="${by}" width="${colW-8}" height="${bh}" rx="4" fill="#F59E0B" opacity="0.85"/>`;
    svg += `<text x="${cx}" y="${by-14}" text-anchor="middle" font-size="12" font-weight="800" fill="#F59E0B">${qtd}</text>`;
    svg += `<text x="${cx}" y="${topP+barH+16}" text-anchor="middle" font-size="9" fill="#9ca3af">${mes}</text>`;
  });
  svg += '</svg>';
  cont.innerHTML = svg;
}

function kpiCard(lbl,val,sub,cor){
  return `<div class="kpi-card" style="--card-color:${cor}">
    <div class="kpi-lbl">${lbl}</div>
    <div class="kpi-val">${val}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}

// ── KPI: tempo médio kaffa parcial/final → medição parcial/final ──────
// Faz pareamento individual: kaffa_parcial[0]→med_parcial[0], kaffa_final→med_final
function avgDiffKaffaMedicao(list){
  const allDiffs = [];
  list.forEach(o => {
    const kaffas  = (o.kaffaEntries||[]).slice().sort((a,b)=>a.data>b.data?1:-1);
    const meds    = (o.medicoes||[]).slice().sort((a,b)=>a.data>b.data?1:-1);
    if(!kaffas.length || !meds.length) return;

    // Parear parciais em ordem cronológica
    const kParciais = kaffas.filter(k=>k.tipo==='parcial');
    const mParciais = meds.filter(m=>m.tipo==='parcial');
    const nParciais = Math.min(kParciais.length, mParciais.length);
    for(let i=0;i<nParciais;i++){
      const d=diff(kParciais[i].data, mParciais[i].data);
      if(d!==null && d>=0) allDiffs.push(d);
    }

    // Parear kaffa final → medição final
    const kFinal = kaffas.find(k=>k.tipo==='final');
    const mFinal = meds.find(m=>m.tipo==='final');
    if(kFinal && mFinal){
      const d=diff(kFinal.data, mFinal.data);
      if(d!==null && d>=0) allDiffs.push(d);
    }
  });
  return allDiffs.length ? Math.round(allDiffs.reduce((a,b)=>a+b,0)/allDiffs.length) : null;
}

// ── KPI: tempo conclusão → kaffa FINAL (exclui parciais) ──────────────
function avgDiffConclusaoKaffaFinal(list){
  const vals = list
    .filter(o => o.conclusao && o.kaffaEntries?.some(k=>k.tipo==='final'))
    .map(o => {
      const kFinal = (o.kaffaEntries||[]).find(k=>k.tipo==='final');
      return diff(o.conclusao, kFinal?.data);
    })
    .filter(v=>v!==null && v>=0);
  return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
}

function avgDiff(list,a,b){
  const vals=list.map(o=>diff(o[a],o[b])).filter(v=>v!==null);
  return vals.length? Math.round(vals.reduce((x,y)=>x+y,0)/vals.length) : null;
}
function velCards(list){
  const fis={};
  list.forEach(o=>{ if(!o.fiscal) return;
    if(!fis[o.fiscal]) fis[o.fiscal]={t:0,df:[],dk:[],dm:[],dc:[]};
    const f=fis[o.fiscal]; f.t++;
    const df=diff(o.conclusao,o.fiscalizacao), dk=diff(o.fiscalizacao,o.kaffa);
    const dm=diff(o.kaffa,o.medicao), dc=diff(o.fiscalizacao,o.dataCadastro);
    if(df!==null) f.df.push(df); if(dk!==null) f.dk.push(dk);
    if(dm!==null) f.dm.push(dm); if(dc!==null) f.dc.push(dc);
  });
  // Use pair-matched kaffa→medição for each fiscal
  const kafMedMap={};
  list.forEach(o=>{
    if(!o.fiscal) return;
    if(!kafMedMap[o.fiscal]) kafMedMap[o.fiscal]=[];
    kafMedMap[o.fiscal].push(o);
  });
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  const bar=v=>v===null?0:Math.min(100,Math.round((v/30)*100));
  return Object.entries(fis).sort().map(([name,d])=>{
    const c=gc(name),af=avg(d.df),ak=avg(d.dk),am=avgDiffKaffaMedicao(kafMedMap[name]||[]),ac=avg(d.dc);
    return `<div class="vel-card">
      <div class="vc-hd"><div class="avatar" style="background:${c}22;color:${c}">${ini(name)}</div>
      <div><div class="vc-name">${name}</div><div class="vc-ct">${d.t} obras</div></div></div>
      <div class="vc-row"><span class="vc-rl">Concl→Fisc.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(af)}%;background:${c}"></div></div><span class="vc-rv" style="color:${c}">${af!==null?af+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Fisc→Kaffa</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(ak)}%;background:var(--yellow)"></div></div><span class="vc-rv" style="color:var(--yellow)">${ak!==null?ak+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Kaffa→Med.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(am)}%;background:var(--accent2)"></div></div><span class="vc-rv" style="color:var(--accent2)">${am!==null?am+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Fisc→Cadastro</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(ac)}%;background:var(--accent3)"></div></div><span class="vc-rv" style="color:var(--accent3)">${ac!==null?ac+'d':'—'}</span></div>
    </div>`;
  }).join('')||'<div class="empty"><div class="ico">📊</div><p>Sem dados ainda.</p></div>';
}
function emprKpis(list){
  return empreiteiras.map(e=>{
    const sub=list.filter(o=>o.empreiteira===e.nome);
    return kpiCard(e.nome,sub.length,'obras',gc(e.nome));
  }).join('');
}
function pendenciaRanking(list){
  const cnt={};
  list.filter(o=>o.pendencia).forEach(o=>{
    const tipos=o.tiposPendencia||(o.tipoPendencia?[o.tipoPendencia]:[]);
    tipos.forEach(t=>{
      const k=t==='Outro'?(o.pendenciaOutro||'Outro'):t;
      cnt[k]=(cnt[k]||0)+1;
    });
  });
  const sorted=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
  if(!sorted.length) return '<div class="empty" style="padding:20px"><p>Sem pendências registradas.</p></div>';
  const max=sorted[0][1];
  return '<div class="vel-grid">'+sorted.map(([t,n])=>`
    <div class="vel-card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600">${t}</span>
        <span style="font-size:14px;font-weight:700;color:var(--accent2)">${n}</span>
      </div>
      <div class="bar-wrap" style="height:6px"><div class="bar-fill" style="width:${Math.round((n/max)*100)}%;background:var(--accent2)"></div></div>
    </div>`).join('')+'</div>';
}
function pendenciaRankingPorEmpreiteira(list){
  if(!empreiteiras.length) return pendenciaRanking(list);
  return empreiteiras.map(e=>{
    const sub=list.filter(o=>o.empreiteira===e.nome);
    const temPend=sub.filter(o=>o.pendencia);
    if(!temPend.length) return `<div class="sect-title" style="margin:10px 0 6px;color:var(--muted)">${e.nome} — sem pendências</div>`;
    return `<div class="sect-title" style="margin:14px 0 6px">${e.nome}</div>`+pendenciaRanking(sub);
  }).join('');
}



// ── USC / ULV PENDENTE (considera medições parciais e final) ──────────
function calcUSCPendente(obra){
  const base = parseFloat(obra.usc) || 0;
  if(!base) return 0;
  const meds = obra.medicoes || [];
  if(meds.some(m=>m.tipo==='final')) return 0;
  // Se gerente informou USC medido, usa esse valor prioritariamente
  if(obra.uscMedidoGerente != null) return Math.max(0, base - (parseFloat(obra.uscMedidoGerente)||0));
  // Fallback: soma uscMedido das parciais (legado)
  const medido = meds.filter(m=>m.tipo==='parcial').reduce((s,m)=>s+(parseFloat(m.uscMedido)||0), 0);
  return Math.max(0, base - medido);
}
function calcULVPendente(obra){
  const base = parseFloat(obra.ulv) || 0;
  if(!base) return 0;
  const meds = obra.medicoes || [];
  if(meds.some(m=>m.tipo==='final')) return 0;
  // Se gerente informou ULV medido, usa esse valor prioritariamente
  if(obra.ulvMedidoGerente != null) return Math.max(0, base - (parseFloat(obra.ulvMedidoGerente)||0));
  const medido = meds.filter(m=>m.tipo==='parcial').reduce((s,m)=>s+(parseFloat(m.ulvMedido)||0), 0);
  return Math.max(0, base - medido);
}
function tipoMedicao(obra){
  const meds = obra.medicoes || [];
  if(meds.some(m=>m.tipo==='final')) return 'final';
  if(meds.length > 0) return 'parcial';
  return null;
}

// ── HELPERS MONITOR DE PRAZOS ────────────────────────────────────────
function prazoMedida70e230(o)  { return o.dataLimite || null; }
function prazoMedida280(o)      { return o.medida230 ? ultimoDiaMesSeginte(o.medida230) : null; }

function diasParaMedida(o, tipo){
  if(tipo === 'med70')  return (o.medida70 || o.tipo==='R2') ? null : diasRestantes(prazoMedida70e230(o));
  if(tipo === 'med230') return o.medida230 ? null : diasRestantes(prazoMedida70e230(o));
  if(tipo === 'med280') return o.medida280 ? null : diasRestantes(prazoMedida280(o));
  return null;
}

// Retorna classe de cor baseada nos dias restantes
function corPrazo(dias, threshold={ ok:15, warn:5 }){
  if(dias === null) return null; // já tem a data
  if(dias < 0)                   return { cor:'#6B7280', bg:'rgba(107,114,128,.15)', label:'Vencida há '+Math.abs(dias)+'d' };
  if(dias === 0)                  return { cor:'#EF4444', bg:'rgba(239,68,68,.18)',   label:'Vence HOJE' };
  if(dias <= threshold.warn)      return { cor:'#EF4444', bg:'rgba(239,68,68,.15)',   label:dias+'d restantes' };
  if(dias <= threshold.ok)        return { cor:'#F59E0B', bg:'rgba(245,158,11,.15)', label:dias+'d restantes' };
  return                               { cor:'#22C55E', bg:'rgba(34,197,94,.12)',    label:dias+'d restantes' };
}

function celulaPrazo(dias){
  if(dias === null) return '<span class="chip chip-green" style="font-size:9px">✓</span>';
  const c = corPrazo(dias);
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${c.bg};color:${c.cor};white-space:nowrap;border:1px solid ${c.cor}33">${c.label}</span>`;
}

// ── MONITOR DE PRAZOS ─────────────────────────────────────────────────
function renderMonitorPrazos(list){
  const ativas    = list.filter(o => !o.cancelado && !o.armazenado);
  const ativasRD  = ativas.filter(o => o.tipo !== 'ODI');
  const ativasODI = ativas.filter(o => o.tipo === 'ODI');
  if(ativasRD.length && ativasODI.length){
    return renderMonitorPrazosTipo(ativasRD,  '🏗️ Obras RD (R1 + R2)', '#7c6af7') +
           renderMonitorPrazosTipo(ativasODI, '🔧 Obras ODI',           '#ff6b35');
  }
  return renderMonitorPrazosTipo_inner(ativas);
}

function renderMonitorPrazosTipo(list, titulo, cor){
  return `<div style="margin-bottom:8px;padding:10px 14px;background:${cor}18;border-left:3px solid ${cor};border-radius:6px;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:${cor}">${titulo}</div>` +
    renderMonitorPrazosTipo_inner(list);
}

function renderMonitorPrazosTipo_inner(list){
  const ativas = list.filter(o => !o.cancelado && !o.armazenado);

  function listaOrdenada(obrasArr, tipo){
    return obrasArr
      .map(o => ({ o, dias: diasParaMedida(o, tipo) }))
      .filter(x => x.dias !== null)
      .sort((a,b) => {
        if(a.dias < 0 && b.dias >= 0) return -1;
        if(a.dias >= 0 && b.dias < 0) return 1;
        return a.dias - b.dias;
      });
  }

  const sem70  = ativas.filter(o => o.conclusao && !o.medida70 && o.tipo !== 'R2');
  const sem230 = ativas.filter(o => o.conclusao && !o.medida230);
  const sem280 = ativas.filter(o => o.medida230 && !o.medida280);

  const ord70  = listaOrdenada(sem70,  'med70');
  const ord230 = listaOrdenada(sem230, 'med230');
  const ord280 = listaOrdenada(sem280, 'med280');

  const mesAtualFim = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().split('T')[0];
  function splitMes(lista){
    return {
      atual:   lista.filter(x => x.dias <= 0 || (diasRestantes(mesAtualFim) >= 0 && x.dias <= diasRestantes(mesAtualFim))),
      proximo: lista.filter(x => x.dias > 0 && x.dias > diasRestantes(mesAtualFim))
    };
  }
  const sp70 = splitMes(ord70), sp230 = splitMes(ord230), sp280 = splitMes(ord280);

  function contadores(lista){
    const venc  = lista.filter(x => x.dias < 0).length;
    const hoje  = lista.filter(x => x.dias === 0).length;
    const breve = lista.filter(x => x.dias > 0 && x.dias <= 5).length;
    return { venc, hoje, breve, total: lista.length };
  }

  function renderPainelMonitor(titulo, subtitulo, lista, tipo, cor, fnPrazo){
    if(!lista.length) return '';
    const cnt = contadores(lista);
    const badges = [
      cnt.venc  ? `<span style="background:#EF4444;color:#fff;padding:1px 7px;border-radius:10px;font-size:9px">⏰ ${cnt.venc} vencidas</span>` : '',
      cnt.hoje  ? `<span style="background:#F97316;color:#fff;padding:1px 7px;border-radius:10px;font-size:9px">❗ ${cnt.hoje} hoje</span>` : '',
      cnt.breve ? `<span style="background:#FBBF24;color:#000;padding:1px 7px;border-radius:10px;font-size:9px">⚡ ${cnt.breve} ≤5d</span>` : '',
    ].filter(Boolean).join(' ');
    const linhas = lista.slice(0,12).map(x => {
      const d = x.dias;
      const cor2 = d < 0 ? '#EF4444' : d === 0 ? '#F97316' : d <= 5 ? '#FBBF24' : d <= 15 ? '#F59E0B' : '#6b7280';
      const txt  = d < 0 ? `⚠️ Vencida há ${Math.abs(d)}d` : d === 0 ? '🔴 Vence hoje!' : `${d}d restantes`;
      const prazoData = fnPrazo(x.o);
      const prazoFmt  = prazoData ? fmtTxt(prazoData) : '—';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:5px 10px;font-size:11px;font-weight:600;color:var(--accent);white-space:nowrap">${x.o.numero}</td>
        <td style="padding:5px 10px;font-weight:700;font-size:12px;color:${cor2};white-space:nowrap">${prazoFmt}</td>
        <td style="padding:5px 10px;font-size:10px;color:${cor2};white-space:nowrap">${txt}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.cidade||'—'}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.fiscal||'—'}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.empreiteira||'—'}</td>
      </tr>`;
    }).join('');
    const maisTxt = lista.length > 12 ? `<tr><td colspan="6" style="padding:5px 10px;font-size:10px;color:var(--muted)">... e mais ${lista.length-12} obra(s)</td></tr>` : '';
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow-x:auto">
        <div style="padding:10px 14px;background:${cor}12;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div>
            <span style="font-weight:700;font-size:12px">${titulo}</span>
            ${subtitulo ? `<span style="font-size:9px;color:var(--muted);margin-left:6px">${subtitulo}</span>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${badges}</div>
        </div>
        ${!linhas
          ? `<div style="padding:10px 14px;font-size:11px;color:var(--muted)">Nenhuma obra pendente.</div>`
          : `<table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--surface2)">
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Nº Obra</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;color:#EF4444">Data Lim.</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Situação</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Cidade</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Fiscal</th>
                <th style="padding:7px 10px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Empreiteira</th>
              </tr></thead>
              <tbody>${linhas}${maisTxt}</tbody>
            </table>`
        }
      </div>`;
  }

  return `
    <div class="sect-title" style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      ⏱️ Monitor de Prazos das Medidas
      <span style="font-size:9px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">
        — prazo da execução corre até a Medida 230; encerramento corre até último dia do mês seguinte à Med. 230
      </span>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:28px">
      <div style="grid-column:1/-1">
        <div style="font-size:11px;font-weight:700;color:#EF4444;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          🚨 Atrasadas + Vencem Este Mês
          <span style="font-size:9px;color:var(--muted);font-weight:400">Ação urgente necessária</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:20px">
          ${renderPainelMonitor('Medida 70','Prazo = Data Limite',sp70.atual,'med70','#14B8A6',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 230','Prazo = Data Limite',sp230.atual,'med230','#10B981',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 280','Prazo = último dia mês seguinte à Med.230',sp280.atual,'med280','#22C55E',prazoMedida280)}
        </div>
      </div>
      <div style="grid-column:1/-1">
        <div style="font-size:11px;font-weight:700;color:#06B6D4;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          📅 Vencem nos Próximos Meses
          <span style="font-size:9px;color:var(--muted);font-weight:400">Planejamento antecipado</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px">
          ${renderPainelMonitor('Medida 70','',sp70.proximo,'med70','#14B8A6',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 230','',sp230.proximo,'med230','#10B981',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 280','',sp280.proximo,'med280','#22C55E',prazoMedida280)}
        </div>
      </div>
    </div>`;
}


// ── TABELA HEADERS ────────────────────────────────────
function buildTableHeader(){
  const hdr = document.getElementById('obrasHead') || document.getElementById('thRow');
  if(!hdr) return;

  const sortIcon = col => _sortCol===col ? (_sortDir>0?'▲':'▼') : '↕';
  const sth = (lbl, col, tip='') =>
    `<th onclick="window.sortObras('${col}')"
        style="cursor:pointer;user-select:none;white-space:nowrap"
        title="${tip||'Clique para ordenar'}">${lbl} <span style="font-size:8px;opacity:.6">${sortIcon(col)}</span></th>`;
  const th  = (lbl, tip='') =>
    `<th title="${tip||lbl}" style="white-space:nowrap">${lbl}</th>`;

  const isGer = me?.perfil==='gerente';
  const isFis = me?.perfil==='fiscal';
  const isEmp = me?.perfil==='empreiteira';

  // Colunas fixas (frozen/congeladas)
  const stickyStyle = 'position:sticky;z-index:2;background:var(--surface)';
  // Coluna de checkbox no modo lote
  const chkTh = window._bulkMode ? `<th style="width:32px;padding:4px 8px;text-align:center"><input type="checkbox" id="chkTodos" onchange="document.querySelectorAll('.chk-obra').forEach(c=>c.checked=this.checked);const n=document.querySelectorAll('.chk-obra:checked').length;const el=document.getElementById('bulkCount');if(el)el.textContent=n+' obra(s) selecionada(s)';" title="Selecionar todas"></th>` : '';
  const frozen1 = (window._bulkMode?'':'')+`<th style="${stickyStyle};left:0;min-width:120px" title="Status atual da obra">Status</th>`;
  const frozen2 = `<th style="${stickyStyle};left:120px;min-width:100px;cursor:pointer" onclick="window.sortObras('numero')" title="Número da obra — clique para ordenar">Nº <span style="font-size:8px;opacity:.6">${sortIcon('numero')}</span></th>`;

  let cols = `<tr>
    ${chkTh}
    ${frozen1}
    ${frozen2}
    ${sth('Tipo','tipo','Tipo da obra: R1, R2 ou ODI')}
    ${sth('Enquadramento','enquadramento','Enquadramento da obra (R1): Universalização, PF ou Grupo A')}
    ${sth('Programa','programa','Programa orçamentário: PODI, Mono-Tri, Regulatório ou Melhoria')}
    ${sth('Descrição','descricao','Descrição resumida da obra')}
    ${sth('Equip. Ref.','equipamentoRef','Número do Equipamento de Referência (transformador/ponto de trabalho)')}
    ${sth('Cidade','cidade','Município onde a obra será executada')}
    ${th('Empreiteira','Empresa responsável pela execução')}
    ${th('Fiscal','Fiscal responsável pela obra')}
    ${sth('Dt. Abertura','dataAbertura','Data de abertura/criação da obra')}
    ${th('Prazo (dias)','Prazo contratual de execução em dias')}
    ${sth('Dt. Limite','dataLimite','Data limite para conclusão — clique para ordenar')}
    ${th('Dias Exec.','Dias decorridos desde a abertura')}
    ${th('Dt. Desligamento','Data programada para o desligamento de energia')}
    ${sth('Dt. Conclusão','conclusao','Data em que a empreiteira informou a conclusão')}
    ${th('Dt. Fiscalização','Data em que o fiscal realizou a vistoria')}
    ${th('Pendência','Indica se existe pendência registrada e seu status')}
    ${th('Dt. Kaffa','Data do kaffa (parcial ou final) registrado pela empreiteira')}
    ${th('Dt. Cadastro','Data de envio ao cadastro CELESC')}
    ${th('Dt. Medição','Data da medição realizada pelo fiscal')}
    ${sth('USC','usc','USC previsto — clique para ordenar do maior para o menor')}
    ${sth('ULV','ulv','ULV previsto — clique para ordenar')}
    ${th('Tipo Medição','Tipo da última medição registrada: Parcial ou Final')}`;

  if(!isEmp){
    cols += `
    ${sth('Dt. Med. 70','medida70','Data da Medida 70 — prazo igual à data limite da obra')}
    ${th('Prazo Med.70','Dias restantes (ou vencimento) para a Medida 70')}
    ${sth('Dt. Med. 230','medida230','Data da Medida 230 — prazo igual à data limite da obra')}
    ${th('Prazo Med.230','Dias restantes (ou vencimento) para a Medida 230')}
    ${sth('Dt. Med. 280','medida280','Data da Medida 280 — aguarda medição de campo')}
    ${th('Motivo Med.280','Motivo registrado para a Medida 280')}`;
  }

  if(isGer || isFis){
    cols += `
    ${th('Armazenado','Indica se a obra foi armazenada/encerrada')}`;
  }

  if(isGer){
    cols += `
    ${th('USC Medido','USC efetivamente medido pelo gerente')}
    ${th('ULV Medido','ULV efetivamente medido pelo gerente')}`;
  }

  cols += `<th>Ação</th></tr>`;
  hdr.innerHTML = cols;
}

// Fix #6: sort obras by column
window.sortObras = function(col){
  if(_sortCol===col) _sortDir*=-1; else { _sortCol=col; _sortDir=1; }
  window.renderObras();
};

function renderObras(){
  if(!document.getElementById('obrasBody')) return;
  try{
  buildTableHeader(); // Fix #6: rebuild headers so sort icons are always current

  // Declarar _tabAtual ANTES de usar nos botões
  const _tabAtual = document.getElementById('obrasBody')?.getAttribute('data-tab') || _obrasTipoTab || 'RD';

  // Renderizar botões de sub-aba RD / ODI
  const subTabEl = document.getElementById('subTabObras');
  if(subTabEl){
    const rdAct = _tabAtual !== 'ODI';
    const s = (active, cor) => `padding:7px 18px;border-radius:6px 6px 0 0;border:1px solid var(--border);border-bottom:${active?'2px solid '+cor:'none'};margin-bottom:${active?'-1px':'0'};background:${active?'var(--surface2)':'var(--surface)'};color:${active?cor:'var(--muted)'};font-weight:${active?700:400};font-size:12px;cursor:pointer`;
    subTabEl.innerHTML =
      `<button onclick="window.switchObrasSubTab('RD')" style="${s(rdAct,'var(--accent)')}">\n        🏗️ Obras RD <span style="font-size:9px;opacity:.7">(R1+R2)</span>\n       </button>\n       <button onclick="window.switchObrasSubTab('ODI')" style="${s(!rdAct,'#ff6b35')}">\n        🔧 Obras ODI <span style="font-size:9px;opacity:.7">(execução cliente)</span>\n       </button>`;
  }
  // Apply module-level quick filter first, then form filters
  let baseList = (() => {
    let b = obras;
    if(me.perfil==='empreiteira') b = b.filter(o => o.empreiteira===me.vinculo);
    else if(me.perfil==='fiscal' && !window._bulkMode) b = b.filter(o => o.fiscal===me.vinculo);
    // fiscal_adm vê TODAS as obras (sem filtro por vinculo) — acesso administrativo
    // Tab filter — read from DOM attribute for reliability
    if(_tabAtual === 'RD')  b = b.filter(o => o.tipo !== 'ODI');
    if(_tabAtual === 'ODI') b = b.filter(o => o.tipo === 'ODI');
    return b;
  })();
  if(_filtroRapidoAtivo === 'sem_medida70')    baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.medida70);
  else if(_filtroRapidoAtivo === 'sem_medida230') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.medida230);
  else if(_filtroRapidoAtivo === 'med230_sem280') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.medida230&&!o.medida280);
  else if(_filtroRapidoAtivo === 'sem_conclusao') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&!o.conclusao);
  else if(_filtroRapidoAtivo === 'fisc_sem_cad')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.dataCadastro);
  else if(_filtroRapidoAtivo === 'fisc_sem_med')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.medicao&&o.tipo!=='ODI');
  else if(_filtroRapidoAtivo === 'conc_sem_med')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!temMedicaoFinal(o));
  else if(_filtroRapidoAtivo === 'conc_sem_fisc') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.fiscalizacao);
  else if(_filtroRapidoAtivo === 'pend_exec')     baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.pendencia&&!o.pendenciaResolvida&&!o.regularizacaoData);
  else if(_filtroRapidoAtivo === 'pend_ag_conf')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData);
  else if(_filtroRapidoAtivo === 'encerradas')          baseList = baseList.filter(o=>o.armazenado);
  else if(_filtroRapidoAtivo === 'proc_cancelamento')   baseList = baseList.filter(o=>o.processoCancelamento&&!o.cancelado);
  let list = aplicarFiltros(baseList);
  // Fix #6: apply column sort
  if(_sortCol){
    const DATE_COLS = new Set(['dataLimite','conclusao','dataAbertura','fiscalizacao',
      'medida70','medida230','medida280','kaffa','medicao','descricao']);
    list = [...list].sort((a,b)=>{
      let va=a[_sortCol]??'', vb=b[_sortCol]??'';
      // USC/ULV: numérico
      if(_sortCol==='usc'||_sortCol==='ulv'){ va=parseFloat(va)||0; vb=parseFloat(vb)||0; }
      // Dias (prazo): numérico
      if(_sortCol==='dias'){ va=a.dataLimite?diff(hojeStr(),a.dataLimite):9999; vb=b.dataLimite?diff(hojeStr(),b.dataLimite):9999; va=va||0; vb=vb||0; }
      // Numérico
      if(typeof va==='number') return _sortDir*(va-vb);
      // Datas ISO (YYYY-MM-DD) e strings: nulos sempre vão para o final
      if(!va && vb) return 1;   // nulo → final, independente da direção
      if(va && !vb) return -1;  // nulo → final
      if(!va && !vb) return 0;
      // Datas: comparação direta de string ISO (lexicográfico = cronológico)
      if(DATE_COLS.has(_sortCol)) return _sortDir*(va<vb?-1:va>vb?1:0);
      // Strings genéricas
      return _sortDir*String(va).localeCompare(String(vb),'pt');
    });
  }
  const ativos = contarFiltrosAtivos() + (_filtroRapidoAtivo?1:0);
  const btnLimpar = document.getElementById('btnLimparFiltros');
  if(btnLimpar) btnLimpar.style.display = ativos>0?'inline-flex':'none';
  const resumo = document.getElementById('filtrosResumo');
  if(resumo){
    const total = visibleObras().length;
    resumo.textContent = ativos>0
      ? `Mostrando ${list.length} de ${total} obras — ${ativos} filtro(s) ativo(s)`
      : `${total} obras no total`;
  }
  const body = document.getElementById('obrasBody');
  if(!list.length){
    body.innerHTML=`<tr><td colspan="29"><div class="empty"><div class="ico">🔍</div><p>Nenhuma obra encontrada.</p></div></td></tr>`;
    return;
  }
  body.innerHTML=list.map(o=>{
    const fc=o.fiscal?gc(o.fiscal):'var(--muted)';
    const limDias=diasRestantes(o.dataLimite);
    const canEdit=me.perfil==='gerente'||me.perfil==='genesis'||me.perfil==='estagiario'
      ||(me.perfil==='fiscal'&&o.fiscal===me.vinculo)
      ||(me.perfil==='empreiteira'&&o.empreiteira===me.vinculo);
    const acts=canEdit
      ?`<button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">✏️</button>
        <button onclick="toggleFavorito('${o.id}')" title="Favoritar" style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer;font-size:12px;color:#F59E0B">⭐</button>
        ${me.perfil==='gerente'?`<button class="btn btn-danger btn-sm" onclick="delObra('${o.id}')">🗑️</button>`:''}`
      :'';
    const pendChip=o.pendencia
      ?(o.pendenciaResolvida?'<span class="chip chip-green">Resolvida</span>'
        :`<span class="chip chip-red">${Array.isArray(o.tiposPendencia)?o.tiposPendencia.join(', '):(o.tipoPendencia||'Pendência')}</span>`)
      :'<span class="chip">—</span>';
    const armChip=o.armazenado?'<span class="chip chip-green">✓</span>':'<span class="chip">—</span>';
    const kaffaDisp=o.kaffaEntries?.length
      ?`${fmtTxt((o.kaffaEntries||[]).slice(-1)[0]?.data)} <span class="chip ${(o.kaffaEntries||[]).slice(-1)[0]?.tipo==='final'?'chip-green':'chip-yellow'}" style="font-size:9px">${(o.kaffaEntries||[]).slice(-1)[0]?.tipo==='final'?'Final':'Parc.'}</span>`
      :fmt(o.kaffa);
    // Row background color based on status
    const isChkMode = !!window._bulkMode; // qualquer modo de lote ativo
    const rowBg = o.processoCancelamento && !o.cancelado
      ? 'background:rgba(168,85,247,.08);border-left:2px solid #A855F7;'
      : (o.pendencia&&!o.pendenciaResolvida)
        ? 'background:rgba(249,115,22,.07);'
        : (statusOf(o)==='Atrasada'||statusOf(o)==='Encaminhar Cadastro Urgente')
          ? 'background:rgba(239,68,68,.07);'
          : '';
    const procCancBadge = o.processoCancelamento && !o.cancelado
      ? '<span style="font-size:8px;background:rgba(168,85,247,.2);color:#A855F7;border:1px solid rgba(168,85,247,.4);padding:1px 5px;border-radius:4px;margin-left:4px">⏸ CANC.</span>'
      : '';
    const stk = 'position:sticky;z-index:1;background:' + (rowBg.includes('EF4444')?'rgba(20,5,5,1)':rowBg.includes('A855F7')?'rgba(15,5,20,1)':rowBg.includes('F97316')?'rgba(20,10,0,1)':'var(--surface)');
    return `<tr style="${rowBg}">
      <td class="col-chk" style="display:${isChkMode?'table-cell':'none'};width:32px;padding:4px 8px;text-align:center">
        <input type="checkbox" class="chk-obra" data-id="${o.id}"
          onchange="(()=>{ const n=document.querySelectorAll('.chk-obra:checked').length; const el=document.getElementById('bulkCount'); if(el) el.textContent=n+' obra(s) selecionada(s)'; })()">
      </td>
      <td style="${stk};left:0;min-width:120px">${statusHtml(o)}${procCancBadge}</td>
      <td style="${stk};left:120px;min-width:100px"><strong style="color:var(--accent);cursor:pointer" onclick="openObraModal('${o.id}')">${o.numero||'—'}</strong></td>
      <td>${o.tipo?`<span class="chip">${o.tipo}</span>`:'—'}</td>
      <td style="font-size:10px;color:var(--muted)">${o.enquadramento||'—'}</td>
      <td style="font-size:10px">${o.programa?`<span style="background:${{'PODI':'#7c6af7','Mono-Tri':'#F59E0B','Regulatório':'#22C55E','Melhoria':'#3B82F6'}[o.programa]||'#6b7280'};color:#fff;padding:1px 7px;border-radius:8px;font-size:9px">${o.programa}</span>`:'—'}</td>
      <td style="font-size:11px;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.descricao||''}"><span>${o.descricao||'—'}</span></td>
      <td style="font-size:11px;color:var(--muted)">${o.equipamentoRef||'—'}</td>
      <td>${o.cidade||'—'}</td>
      <td style="font-size:10px">${o.empreiteira||'—'}</td>
      <td>${o.fiscal?`<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${fc};display:inline-block"></span>${o.fiscal}</span>`:'—'}</td>
      <td>${fmt(o.dataAbertura)}</td>
      <td>${o.prazoExecucao?o.prazoExecucao+'d':'—'}</td>
      <td>${fmt(o.dataLimite)}</td>
      <td>${!o.conclusao?diasHtml(limDias):'<span class="chip chip-green">Concluída</span>'}</td>
      <td>${o.dataDesligamento?`<span style="color:${o.desligamentoConfirmado?'var(--green)':o.desligamentoCancelado?'var(--red)':'var(--text)'}">${fmtTxt(o.dataDesligamento)}${o.desligamentoConfirmado?' ✓':o.desligamentoCancelado?' ✗':''}</span>`:'—'}</td>
      <td>${fmt(o.conclusao)}</td>
      <td>${fmt(o.fiscalizacao)}</td>
      <td>${pendChip}</td>
      <td>${kaffaDisp}</td>
      <td>${o.dataCadastro?`<span style="color:${o.cadastroConfirmado?'var(--green)':'var(--text)'}">${fmtTxt(o.dataCadastro)}${o.cadastroConfirmado?' ✓':''}</span>`:'—'}</td>
      <td>${fmt(o.medicao)||'—'}</td>
      <td>${o.usc||'—'}</td>
      <td>${o.ulv||'—'}</td>
      <td>${tipoMedicao(o)?`<span class="chip ${tipoMedicao(o)==='final'?'chip-green':'chip-yellow'}" style="font-size:9px">${tipoMedicao(o)==='final'?'✓ Final':'~ Parcial'}</span>`:'<span class="chip">—</span>'}</td>
      <td>${o.tipo==='R2'?'<span style="color:var(--muted);font-size:10px">N/A</span>':fmt(o.medida70)}</td>
      <td>${o.tipo==='R2'?'<span style="color:var(--muted)">—</span>':celulaPrazo(diasParaMedida(o,'med70'))}</td>
      <td>${fmt(o.medida230)}</td>
      <td>${celulaPrazo(diasParaMedida(o,'med230'))}</td>
      <td>${fmt(o.medida280)}</td>
      <td style="font-size:10px;color:var(--muted)">${o.medida280Motivo||'—'}</td>
      <td>${armChip}</td>
      <td><div style="display:flex;gap:4px">${acts}</div></td>
    </tr>`;
  }).join('');
  }catch(e){ console.error('renderObras error:',e); document.getElementById('obrasBody').innerHTML=`<tr><td colspan="29"><div class="empty"><p style="color:#EF4444">Erro: ${e.message}</p></div></td></tr>`; }
}
window.renderObras=renderObras;

// ── MODAL OBRA ────────────────────────────────────────
window.openObraModal=function(obraId){
  try{
  const obra=obraId?obras.find(o=>o.id===obraId):null;
  const isEdit=!!obra;
  document.getElementById('obraModalTit').textContent = isEdit
    ? `Obra ${obra.numero||obraId}` : 'Nova Obra';
  document.getElementById('obraId').value=obraId||'';
  // reset
  ['oNum','oFiscalNome','oAbertura','oPrazo','oUSC','oULV','oDesligamento','oConclusao','oPlacas','oSAP','oSerie',
   'oFabricante','oKaffa','oCadastro','oFiscalizacao','oPrazoPendencia','oRegularizacao','oMedicao',
   'oMedida70','oMedida230','oMedida280','oMedida280Motivo','oImpedimentoOutro','oPendenciaOutro',
   'oDataCancelamento','oMotivoCancelamento','oDesligMotivo','oMotivoParalisada','oCaixaArmazenada'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['oTipo','oCidade','oEmp','oTipoImpedimento','oPrazoOpcao'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const prazoInp=document.getElementById('oPrazo'); if(prazoInp) prazoInp.style.display='none';
  ['oTemImpedimento','oTemPendencia','oPendenciaResolvida','oArmazenado','oCancelado',
   'oDesligConfirmado','oDesligCancelado','oCadastroConfirmado','oParalisada',
   'oContratosAssinado','oMedicoesAssinadas','oProjetosAsBuilt'].forEach(id=>{ const el=document.getElementById(id); if(el) el.checked=false; });
  // reset prazo pendência
  const selPrazoPend=document.getElementById('oPrazoPendenciaOpcao'); if(selPrazoPend) selPrazoPend.value='';
  const infoPrazoPend=document.getElementById('infoPrazoPendencia'); if(infoPrazoPend) infoPrazoPend.style.display='none';
  // reset fiscal
  const selFiscal=document.getElementById('oFiscalSelect'); if(selFiscal){ selFiscal.value=''; }
  const inpFiscal=document.getElementById('oFiscalNome'); if(inpFiscal){ inpFiscal.style.display='none'; inpFiscal.value=''; }
  // reset checkboxes de pendência
  document.querySelectorAll('.chk-pendencia').forEach(el=>el.checked=false);
  // reset medições e kaffas pendentes
  _medicoesPendentes=[];
  _kaffasPendentes=[];
  // reset oArmazenado to disabled (will be re-enabled by checkArmazenamentoDeps)
  const armEl=document.getElementById('oArmazenado'); if(armEl) armEl.disabled=true;

  // Restrições de data: passado para campos normais, futuro para desligamento
  const hoje_s=hojeStr();
  ['oAbertura','oConclusao','oKaffa','oFiscalizacao','oCadastro','oMedicao',
   'oMedida70','oMedida230','oMedida280'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.max=hoje_s; el.removeAttribute('min'); }
  });
  // Desligamento: presente ou futuro (pode ser hoje ou futuro)
  const desEl=document.getElementById('oDesligamento');
  if(desEl){ desEl.min=hoje_s; desEl.removeAttribute('max'); }

  if(isEdit){
    const set=(id,v)=>{ const el=document.getElementById(id); if(el&&v!==undefined&&v!==null) el.value=v; };
    const setChk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=!!v; };
    set('oNum',obra.numero); set('oTipo',obra.tipo); set('oCidade',obra.cidade);
    set('oEmp',obra.empreiteira); set('oFiscalNome',obra.fiscal);
    set('oAbertura',obra.dataAbertura);
    // Prazo: preenche dropdown e campo numérico
    if(obra.prazoExecucao){
      const predefined=['60','120','150','365'];
      const prazoStr=String(obra.prazoExecucao);
      const selPrazo=document.getElementById('oPrazoOpcao');
      const inpPrazo=document.getElementById('oPrazo');
      if(predefined.includes(prazoStr)){ selPrazo.value=prazoStr; inpPrazo.style.display='none'; inpPrazo.value=prazoStr; }
      else { selPrazo.value='outro'; inpPrazo.style.display='block'; inpPrazo.value=prazoStr; }
    }
    set('oUSC',obra.usc); set('oULV',obra.ulv); set('oEquipRef',obra.equipamentoRef||''); set('oDescricao',obra.descricao||''); set('oEnquadramento',obra.enquadramento||''); set('oPrograma',obra.programa||(obra.tipo==='R1'?'Regulatório':'')); toggleEnquadramento();
    // Transformer fields
    set('oPotencia',obra.potencia||''); set('oDataTransf',obra.dataTransf||''); set('oPotenciaRet',obra.potenciaRet||'');
    set('oSAPRet',obra.sapRet||''); set('oSerieRet',obra.serieRet||''); set('oFabricanteRet',obra.fabricanteRet||'');
    const retChk=document.getElementById('oTemRetirado'); if(retChk){ retChk.checked=!!obra.temRetirado; toggleRetirado(); } set('oDesligamento',obra.dataDesligamento);
    set('oConclusao',obra.conclusao); set('oPlacas',obra.placas); set('oSAP',obra.sap);
    set('oSerie',obra.serie); set('oFabricante',obra.fabricante);
    // kaffaEntries rendered via renderListaKaffas above
    set('oCadastro',obra.dataCadastro);
    set('oFiscalizacao',obra.fiscalizacao);
    // checkboxes de pendência (suporta array novo e string legada)
    const tipos = obra.tiposPendencia || (obra.tipoPendencia ? [obra.tipoPendencia] : []);
    document.querySelectorAll('.chk-pendencia').forEach(el => { el.checked = tipos.includes(el.value); });
    set('oPendenciaOutro',obra.pendenciaOutro); set('oPrazoPendencia',obra.prazoPendencia);
    set('oRegularizacao',obra.regularizacaoData); set('oMedicao',obra.medicao);
    set('oMedida70',obra.medida70); set('oMedida230',obra.medida230); set('oMedida280',obra.medida280);
    // R2 não exige Med.70: desabilitar campo e mostrar aviso
    const m70el=document.getElementById('oMedida70');
    if(m70el){ m70el.disabled=(obra.tipo==='R2'); m70el.title=(obra.tipo==='R2'?'Medida 70 não se aplica a obras R2':''); }
    set('oMedida280Motivo',obra.medida280Motivo);
    set('oTipoImpedimento',obra.tipoImpedimento); set('oImpedimentoOutro',obra.impedimentoOutro);
    set('oDataCancelamento',obra.dataCancelamento); set('oMotivoCancelamento',obra.motivoCancelamento);
    set('oDesligMotivo',obra.desligamentoCanceladoMotivo);
    set('oMotivoParalisada',obra.motivoParalisada);
    setChk('oTemImpedimento',obra.impedimento); setChk('oTemPendencia',obra.pendencia);
    setChk('oPendenciaResolvida',obra.pendenciaResolvida); setChk('oArmazenado',obra.armazenado);
    // Mostra botão de devolução de pendência para fiscal quando empreiteira já regularizou
    setTimeout(()=>atualizarVisibilidadeDevoPend(obra), 50);
    setChk('oCancelado',obra.cancelado); setChk('oParalisada',obra.paralisada);
    // Restore USC/ULV medido — visível para fiscal/fiscal_adm/gerente
    const uscMedEl=document.getElementById('oUSCMedidoGerente');
    const ulvMedEl=document.getElementById('oULVMedidoGerente');
    if(uscMedEl){ uscMedEl.value=obra.uscMedidoGerente!=null?obra.uscMedidoGerente:'';
      const fgUsc=document.getElementById('fgUSCMedido');
      if(fgUsc) fgUsc.style.display=(me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm')?'flex':'none'; }
    if(ulvMedEl){ ulvMedEl.value=obra.ulvMedidoGerente!=null?obra.ulvMedidoGerente:'';
      const fgUlv=document.getElementById('fgULVMedido');
      if(fgUlv) fgUlv.style.display=(me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm')?'flex':'none'; }
    setChk('oContratosAssinado',obra.contratosAssinado); setChk('oMedicoesAssinadas',obra.medicoesAssinadas);
    setChk('oProjetosAsBuilt',obra.projetosAsBuilt); set('oCaixaArmazenada',obra.caixaArmazenada);
    // Enable oArmazenado if all deps met (delayed to allow DOM update)
    setTimeout(checkArmazenamentoDeps, 50);
    // Prazo pendência
    if(obra.prazoPendencia){
      const infoPP=document.getElementById('infoPrazoPendencia');
      if(infoPP){ infoPP.style.display='block'; infoPP.textContent='Prazo: '+(obra.prazoPendenciaLabel||'')+' → '+fmtTxt(obra.prazoPendencia); }
      // Restore select option
      const selPP=document.getElementById('oPrazoPendenciaOpcao');
      const hidLbl=document.getElementById('oPrazoPendenciaLabel');
      if(selPP&&obra.prazoPendenciaLabel){
        const map={'Urgente – Imediato (2 dias)':'2','15 dias':'15','30 dias':'30','60 dias':'60'};
        selPP.value=map[obra.prazoPendenciaLabel]||'';
        if(hidLbl) hidLbl.value=obra.prazoPendenciaLabel||'';
      }
    }
    // Fiscal dropdown
    const predFiscais=['Thiago','Jorge','Ezequiel','Marcio','Diego'];
    const selF=document.getElementById('oFiscalSelect');
    const inpF=document.getElementById('oFiscalNome');
    if(selF&&inpF&&obra.fiscal){
      if(predFiscais.includes(obra.fiscal)){ selF.value=obra.fiscal; inpF.style.display='none'; }
      else { selF.value='outro'; inpF.style.display='block'; inpF.value=obra.fiscal; }
    }
    // Render medições e kaffas list
    renderListaMedicoes();
    renderListaKaffas();
    // pendenciaDentroPrazo info
    const infoPP2=document.getElementById('infoPendenciaPrazo');
    if(infoPP2){
      if(obra.pendenciaResolvida&&obra.pendenciaDentroPrazo!==undefined){
        infoPP2.style.display='block';
        infoPP2.style.background=obra.pendenciaDentroPrazo?'rgba(0,229,160,.08)':'rgba(255,77,109,.08)';
        infoPP2.style.border='1px solid '+(obra.pendenciaDentroPrazo?'rgba(0,229,160,.25)':'rgba(255,77,109,.25)');
        infoPP2.style.color=obra.pendenciaDentroPrazo?'var(--accent)':'var(--red)';
        infoPP2.textContent='Pendência resolvida '+(obra.pendenciaDentroPrazo?'dentro':'fora')+' do prazo (reg: '+fmtTxt(obra.regularizacaoData)+', prazo: '+fmtTxt(obra.prazoPendencia)+')';
      } else { infoPP2.style.display='none'; }
    }
    setChk('oDesligConfirmado',obra.desligamentoConfirmado); setChk('oDesligCancelado',obra.desligamentoCancelado);
    setChk('oCadastroConfirmado',obra.cadastroConfirmado);
    // Preenche view-only do transformador para fiscal e gerente
    // Preenche campos de visualização do transformador
    // Multi-equipment view: show all installed
    const transf_vals=[obra.placas,obra.potencia,obra.sap,obra.serie,obra.fabricante,obra.dataTransf];
    ['oPlacasView','oPotenciaView','oSAPView','oSerieView','oFabricanteView'].forEach((id,i)=>{
      const el=document.getElementById(id); if(el) el.value=transf_vals[i]||'';
    });
    // Retirado
    if(obra.temRetirado&&(obra.sapRet||obra.potenciaRet)){
      const retView=document.getElementById('secRetiradoView');
      if(retView) retView.style.display='block';
      ['oPotenciaRetView','oSAPRetView','oSerieRetView','oFabricanteRetView'].forEach((id,i)=>{
        const el=document.getElementById(id);
        if(el) el.value=[obra.potenciaRet,obra.sapRet,obra.serieRet,obra.fabricanteRet][i]||'';
      });
    }
    // Mostra data de regularização na confirmação fiscal
    const infoReg=document.getElementById('infoRegularizacao');
    if(infoReg){
      if(obra.regularizacaoData&&!obra.pendenciaResolvida){
        infoReg.style.display='block';
        infoReg.textContent='Empreiteira informou regularização em: '+fmtTxt(obra.regularizacaoData);
      } else { infoReg.style.display='none'; }
    }
  }

  // visibilidade e habilitação por perfil
  const p=me.perfil;
  // Genesis: só mostra seção de cadastro
  // Estagiário: só mostra seção de armazenamento
  // ── VISIBILIDADE POR PERFIL (reescrito limpo) ────────────────────
  const isGenesis    = p === 'genesis';
  const isEstagiario = p === 'estagiario';
  const isBasico     = isGenesis || isEstagiario;

  // 1. Ocultar TODAS as modal-section via querySelectorAll (robusto, não depende de lista)
  document.querySelectorAll('.modal-section').forEach(el => { el.style.display = 'none'; });

  // 2. Mostrar só o que cada perfil precisa
  function showSec(id){ const el=document.getElementById(id); if(el) el.style.display='block'; }

  if(isGenesis){
    // Genesis: SOMENTE secCadastro (data envio + toggle confirmação)
    showSec('secCadastro');
    // Toggle de confirmação só aparece se já existe dataCadastro
    if(obra?.dataCadastro) showSec('secCadastroConfirm');

  } else if(isEstagiario){
    // Estagiário: SOMENTE secArmazenamento
    showSec('secArmazenamento');
    setTimeout(checkArmazenamentoDeps, 100);

  } else {
    // Perfis normais: gerente, fiscal, empreiteira

    if(p === 'gerente'){
      showSec('secIdentif');
      // Show USC/ULV medido field only for gerente when there are partial medicoes
      const hasMedicoes=(obra?.medicoes||[]).length > 0; // 'obra' é a variável correta aqui (openObraModal)
      const secUscEl=document.getElementById('secUSCMedidoGerente');
      if(secUscEl) secUscEl.style.display=hasMedicoes?'grid':'none';
    }
    if(p !== 'fiscal')      showSec('secExec');
    // #5 fiscal vê dados da empreiteira (placas, SAP, série, fabricante) sempre em modo edição
    // Dados do transformador: mostra para fiscal/gerente apenas quando empreiteira já preencheu
    if((p === 'fiscal' || p === 'fiscal_adm' || p === 'gerente') && isEdit && (obra?.placas || obra?.sap || obra?.potencia)){
      showSec('secTransfView');
    }
    if(p === 'empreiteira') showSec('secImpedimento');

    // Fiscalização: só fiscal e gerente
    if(p === 'fiscal'||p === 'fiscal_adm'||p === 'gerente'){
      showSec('secFisc');
      if(isEdit){
        showSec('secLocaisTrabalho');
        _locaisPendentes = [];
        renderLocais();
      }
    }

    // Desligamento: fiscal, empreiteira e gerente preenchem a data
    if(p !== 'gerente' || true) showSec('secDesligData'); // todos veem
    if(['gerente','fiscal'].includes(p) && isEdit && obra?.dataDesligamento) showSec('secDesligConfirm');
    toggleDesligamento();

    // Cadastro (data de envio): fiscal e gerente preenchem
    if(p === 'fiscal' || p === 'gerente') showSec('secCadastro');

    // Confirmação de cadastro: SOMENTE gerente (genesis tratado acima)
    if(p === 'gerente' && isEdit && obra?.dataCadastro) showSec('secCadastroConfirm');

    // Pendência
    if(p === 'empreiteira' && isEdit && obra?.pendencia && !obra?.pendenciaResolvida) showSec('secRegularizacao');
    if(p !== 'empreiteira' && isEdit && obra?.pendencia && !obra?.pendenciaResolvida)  showSec('secConfPendencia');

    // Medições e medidas: fiscal e gerente
    if(p !== 'empreiteira'){ showSec('secMedicao'); showSec('secMedidas'); }

    // Armazenamento: gerente sempre; fiscal após Med.280
    if(p === 'gerente' && isEdit) showSec('secArmazenamento');
    if(p === 'fiscal' && isEdit && obra?.medida280) showSec('secArmazenamento');

    // Cancelamento e paralização: somente gerente
    if(p === 'gerente'){ showSec('secCancelamento'); showSec('secParalisada'); }
  }

  // 3. Habilitar/desabilitar campos por perfil
  if(!isBasico){
    // Empreiteira não edita campos fiscais
    ['oFiscalizacao','oPrazoPendencia','oMedida70','oMedida230','oMedida280','oMedida280Motivo','oCadastro'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.disabled = (p==='empreiteira');
    });
    // Fiscal não edita conclusão/dados de execução
    ['oConclusao','oPlacas','oSAP','oSerie','oFabricante'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.disabled = (p==='fiscal');
    });
    // Pendência checkboxes: empreiteira não mexe
    document.querySelectorAll('.chk-pendencia').forEach(el=>{ el.disabled = (p==='empreiteira'); });
  }

  // 4. Botões de ação específicos
  const btnMedEl   = document.getElementById('btnNovaMedicao');
  const btnKaffaEl = document.getElementById('btnNovoKaffa');
  if(btnMedEl)   btnMedEl.style.display   = (!isBasico && p !== 'empreiteira') ? 'inline-flex' : 'none';
  if(btnKaffaEl) btnKaffaEl.style.display = (p === 'empreiteira' || p === 'gerente') ? 'inline-flex' : 'none';

  // 5. Listener do oCadastro para mostrar/ocultar confirmação
  const cadEl = document.getElementById('oCadastro');
  if(cadEl){
    const newCadEl = cadEl.cloneNode(true);
    cadEl.parentNode.replaceChild(newCadEl, cadEl);
    newCadEl.addEventListener('change', ()=>{
      // Confirmação só para gerente e genesis
      const canConfirm = ['gerente','genesis'].includes(p);
      document.getElementById('secCadastroConfirm').style.display = (newCadEl.value && canConfirm) ? 'block' : 'none';
    });
  }

  // 6. Mensagem de pendência
  if(obra?.pendencia){
    const tipos = (obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', ');
    const msgEl = document.getElementById('msgPendencia');
    if(msgEl) msgEl.textContent = 'Pendência: '+tipos+'. Prazo: '+fmtTxt(obra.prazoPendencia);
  }

  // 7. Armazenamento: habilita confirm só se todos deps marcados
  if(isEdit) setTimeout(checkArmazenamentoDeps, 80);

  // atualiza toggles
  toggleImpedimento(); togglePendencia(); toggleCancelamento(); toggleParalisada();
  // secConclusaoExtra: controlado pelo botão kaffa, não pela data de conclusão
  // info data limite
  atualizarInfoLimite();
  document.getElementById('oAbertura').addEventListener('input',atualizarInfoLimite);
  document.getElementById('oPrazo').addEventListener('input',atualizarInfoLimite);
  if(isEdit&&obra?.medida230) atualizarInfoMedida280(obra.medida230);

  // Always render medição list (empty for new obra)
  if(!isEdit){ renderListaMedicoes(); renderListaKaffas(); }
  document.getElementById('ovObra').classList.add('open');
  }catch(err){ console.error('openObraModal error:',err); alert('Erro ao abrir modal: '+err.message+' (linha '+err.stack?.split('\n')[1]+')'); }
};
window.closeObraModal=function(){ document.getElementById('ovObra').classList.remove('open'); };

function atualizarInfoLimite(){
  const ab=document.getElementById('oAbertura').value;
  const pr=document.getElementById('oPrazo').value;
  const info=document.getElementById('dataLimiteInfo');
  if(ab&&pr){
    const lim=addDias(ab,pr);
    const dias=diasRestantes(lim);
    info.style.display='block';
    info.innerHTML=`Data limite: <strong>${fmtTxt(lim)}</strong> — ${diasHtml(dias)}`;
  } else { info.style.display='none'; }
}

function atualizarInfoMedida280(med230){
  const lim=ultimoDiaMesSeginte(med230);
  const info=document.getElementById('medida280PrazoInfo');
  if(lim) info.textContent=`Prazo limite para Medida 280: ${fmtTxt(lim)} (último dia do mês seguinte à Medida 230)`;
}

window.checkMedida280=function(){
  const m280=document.getElementById('oMedida280').value;
  const m230=document.getElementById('oMedida230').value||obras.find(o=>o.id===document.getElementById('obraId').value)?.medida230;
  if(!m280||!m230){ document.getElementById('secMedida280Motivo').style.display='none'; return; }
  const prazoLim=ultimoDiaMesSeginte(m230);
  const foraDoPrazo=prazoLim&&m280>prazoLim;
  document.getElementById('secMedida280Motivo').style.display=foraDoPrazo?'block':'none';
  atualizarInfoMedida280(m230);
};

window.toggleImpedimento=function(){
  const tem=document.getElementById('oTemImpedimento').checked;
  document.getElementById('secImpedimentoDetalhe').style.display=tem?'block':'none';
  if(tem){ document.getElementById('oTipoImpedimento').addEventListener('change',()=>{
    document.getElementById('fgImpedimentoOutro').style.display=
      document.getElementById('oTipoImpedimento').value==='Outro'?'flex':'none';
  });}
};
window.togglePendencia=function(){
  const tem=document.getElementById('oTemPendencia').checked;
  document.getElementById('secPendenciaDetalhe').style.display=tem?'block':'none';
};
window.togglePendenciaOutro=function(){
  const outroChk=document.querySelector('.chk-pendencia[value="Outro"]');
  document.getElementById('fgPendenciaOutro').style.display=outroChk?.checked?'flex':'none';
};

window.toggleFiscalOutro=function(){
  const sel=document.getElementById('oFiscalSelect');
  const inp=document.getElementById('oFiscalNome');
  if(!sel||!inp) return;
  if(sel.value==='outro'){ inp.style.display='block'; inp.focus(); inp.value=''; }
  else { inp.style.display='none'; inp.value=sel.value; }
};
window.calcularPrazoPendencia=function(){
  const sel=document.getElementById('oPrazoPendenciaOpcao');
  const hid=document.getElementById('oPrazoPendencia');
  const hidLbl=document.getElementById('oPrazoPendenciaLabel');
  const info=document.getElementById('infoPrazoPendencia');
  if(!sel||!hid||!info) return;
  const dias=parseInt(sel.value);
  if(!dias){ hid.value=''; if(hidLbl) hidLbl.value=''; info.style.display='none'; return; }
  const d=new Date(); d.setDate(d.getDate()+dias);
  const prazo=d.toISOString().split('T')[0];
  hid.value=prazo;
  const lbl=dias===2?'Urgente – Imediato (2 dias)':dias+' dias';
  if(hidLbl) hidLbl.value=lbl;
  info.style.display='block';
  info.textContent='Prazo: '+lbl+' → '+fmtTxt(prazo);
};


// ── ARMAZENAMENTO: habilita confirm só se todos deps marcados ─────────
window.checkArmazenamentoDeps = function(){
  const deps = ['oContratosAssinado','oMedicoesAssinadas','oProjetosAsBuilt'];
  const allChk = deps.every(id => { const el=document.getElementById(id); return el&&el.checked; });
  const caixa  = (document.getElementById('oCaixaArmazenada')?.value||'').trim();
  const final  = document.getElementById('oArmazenado');
  if(!final) return;
  final.disabled = !(allChk && caixa);
  if(final.disabled && final.checked) final.checked = false;
};

// ── MEDIÇÕES MÚLTIPLAS ────────────────────────────────────────────────
let _medicoesPendentes = [];
let _kaffasPendentes = [];

// ── KAFFA ENTRIES (parcial/final) ─────────────────────────────────────
function tipoKaffa(obra){
  const ks = obra?.kaffaEntries||[];
  if(ks.some(k=>k.tipo==='final')) return 'final';
  if(ks.length > 0) return 'parcial';
  return null;
}
window.abrirNovoKaffa = function(){
  const obraId=document.getElementById('obraId').value;
  const obra=obras.find(o=>o.id===obraId);
  const hasFinal=(obra?.kaffaEntries||[]).concat(_kaffasPendentes).some(k=>k.tipo==='final');
  if(hasFinal){ toast('Esta obra já possui kaffa final registrado.','warn'); return; }
  document.getElementById('frmNovoKaffa').style.display='block';
  document.getElementById('btnNovoKaffa').style.display='none';
  // Inicializa listas de equipamentos
  if(me.perfil==='empreiteira'){
    const obraAtualEq=obras.find(o=>o.id===document.getElementById('obraId')?.value);
    initEquipFromObra(obraAtualEq);
  }
  // Campos do transformador: só para empreiteira, só no 1° kaffa
  if(me.perfil==='empreiteira'){
    const secExtra=document.getElementById('secConclusaoExtra');
    if(secExtra){
      const obraAtual=obras.find(o=>o.id===document.getElementById('obraId')?.value);
      const jaSet=obraAtual?.placas||obraAtual?.sap;
      const jaTemKaffa=(obraAtual?.kaffaEntries?.length||0)+(_kaffasPendentes?.length||0);
      // Mostrar somente se: (dados ainda não preenchidos) OU (dados preenchidos mas 1° kaffa)
      // Para kaffas subsequentes (já existe kaffa parcial), não mostrar
      if(!jaSet || jaTemKaffa===0){
        // Primeiro kaffa ou dados ainda não preenchidos → mostrar para preencher
        secExtra.style.display='block';
        const nota=document.getElementById('transDataNota');
        ['oPlacas','oSAP','oSerie','oFabricante'].forEach((id,i)=>{
          const el=document.getElementById(id); if(!el) return;
          el.value=[obraAtual?.placas,obraAtual?.sap,obraAtual?.serie,obraAtual?.fabricante][i]||'';
          el.disabled=false;
        });
        if(nota) nota.innerHTML=jaSet
          ?'🔩 Dados do Transformador — confirme ou corrija os dados.'
          :'🔩 Dados do Transformador — preencha uma única vez.';
      } else {
        // Kaffa subsequente e dados já preenchidos → ocultar (não solicitar novamente)
        secExtra.style.display='none';
      }
    }
  }
  document.getElementById('oKaffaData').value='';
  document.getElementById('oKaffaTipo').value='';
  const d=document.getElementById('oKaffaData'); if(d) d.max=hojeStr();
};
window.cancelarNovoKaffa = function(){
  document.getElementById('frmNovoKaffa').style.display='none';
  document.getElementById('btnNovoKaffa').style.display='inline-flex';
};
window.adicionarKaffa = function(){
  const data=document.getElementById('oKaffaData').value;
  const tipo=document.getElementById('oKaffaTipo').value;
  if(!data||!tipo){ toast('Preencha data e tipo do kaffa.','err'); return; }
  if(data>hojeStr()){ toast('Data do kaffa não pode ser futura.','err'); return; }
  _kaffasPendentes.push({id:'k_'+Date.now(), data, tipo});
  renderListaKaffas();
  cancelarNovoKaffa();
};
window.removerKaffaPendente = function(id){
  _kaffasPendentes=_kaffasPendentes.filter(k=>k.id!==id);
  renderListaKaffas();
};
function renderListaKaffas(){
  const obra=obras.find(o=>o.id===document.getElementById('obraId').value);
  const existing=obra?.kaffaEntries||[];
  const all=[...existing,..._kaffasPendentes];
  const cont=document.getElementById('listaKaffas'); if(!cont) return;
  if(!all.length){ cont.innerHTML='<div style="font-size:11px;color:var(--muted);padding:6px 0">Nenhum kaffa registrado.</div>'; return; }
  const sorted=[...all].sort((a,b)=>a.data>b.data?-1:1);
  cont.innerHTML=sorted.map(k=>{
    const isPend=_kaffasPendentes.some(p=>p.id===k.id);
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${isPend?'rgba(0,229,160,.06)':'var(--surface2)'};border-radius:6px;margin-bottom:5px;border:1px solid ${isPend?'rgba(0,229,160,.2)':'var(--border)'}">
      <span style="font-size:10px;color:var(--muted);min-width:70px">${fmtTxt(k.data)}</span>
      <span class="chip ${k.tipo==='final'?'chip-green':'chip-yellow'}" style="font-size:9px">${k.tipo==='final'?'✓ Kaffa Final':'~ Kaffa Parcial'}</span>
      ${isPend?`<span style="font-size:9px;color:var(--accent);margin-left:auto">novo</span>
        <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" onclick="removerKaffaPendente('${k.id}')">✕</button>`:''}
    </div>`;
  }).join('');
}

window.abrirNovaMedicao = function(){
  const obra = obras.find(o=>o.id===document.getElementById('obraId').value);
  const hasFinal = (obra?.medicoes||[]).concat(_medicoesPendentes).some(m=>m.tipo==='final');
  if(hasFinal){ toast('Esta obra já possui uma medição final registrada.','warn'); return; }
  document.getElementById('frmNovaMedicao').style.display='block';
  document.getElementById('btnNovaMedicao').style.display='none';
  document.getElementById('oMedicaoData').value='';
  document.getElementById('oMedicaoTipo').value='';
  document.getElementById('secMedicaoParcialFields').style.display='none';
  const d=document.getElementById('oMedicaoData');
  if(d) d.max=hojeStr();
};
window.cancelarNovaMedicao = function(){
  document.getElementById('frmNovaMedicao').style.display='none';
  document.getElementById('btnNovaMedicao').style.display='inline-flex';
};
window.toggleMedicaoTipo = function(){
  const tipo=document.getElementById('oMedicaoTipo').value;
  document.getElementById('secMedicaoParcialFields').style.display=tipo==='parcial'?'block':'none';
};
window.adicionarMedicao = function(){
  const data=document.getElementById('oMedicaoData').value;
  const tipo=document.getElementById('oMedicaoTipo').value;
  if(!data||!tipo){ toast('Preencha data e tipo.','err'); return; }
  if(data>hojeStr()){ toast('Data de medição não pode ser futura.','err'); return; }
  const uscMedido = tipo==='parcial' ? (parseFloat(document.getElementById('oMedUSCParcial')?.value)||0) : 0;
  const ulvMedido = tipo==='parcial' ? (parseFloat(document.getElementById('oMedULVParcial')?.value)||0) : 0;
  const med={ id:'med_'+Date.now(), data, tipo, uscMedido, ulvMedido };
  _medicoesPendentes.push(med);
  // Limpa campos parciais
  if(document.getElementById('oMedUSCParcial')) document.getElementById('oMedUSCParcial').value='';
  if(document.getElementById('oMedULVParcial')) document.getElementById('oMedULVParcial').value='';
  renderListaMedicoes();
  cancelarNovaMedicao();
};

window.excluirMedicaoSalva = async function(obraId, medId){
  if(!confirm('Excluir esta medição do Firestore?')) return;
  try{
    const obra = obras.find(o=>o.id===obraId);
    if(!obra){ toast('Obra não encontrada.','err'); return; }
    const novas = (obra.medicoes||[]).filter(m=>String(m.id)!==String(medId));
    console.log('[ExcluirMed] total antes:', obra.medicoes?.length, '→ depois:', novas.length, 'medId:', medId);
    // Só atualiza medicao (data) se houver medição FINAL restante
    const finalRestantes = novas.filter(m=>m.tipo==='final');
    const lastFinalDate = finalRestantes.map(m=>m.data).sort().slice(-1)[0]||null;
    await updateDoc(doc(db,'obras',obraId),{
      medicoes: novas,
      medicao: lastFinalDate,
      atualizadaEm: serverTimestamp()
    });
    toast('✓ Medição excluída.');
    // Refresh modal list
    setTimeout(()=>{ if(document.getElementById('listaMedicoes')) renderListaMedicoes(); }, 300);
  }catch(e){
    console.error('[ExcluirMed] erro:', e);
    toast('Erro ao excluir: '+e.message,'err');
  }
};
window.removerMedicaoPendente = function(id){
  _medicoesPendentes=_medicoesPendentes.filter(m=>m.id!==id);
  renderListaMedicoes();
};
function renderListaMedicoes(){
  const obra=obras.find(o=>o.id===document.getElementById('obraId').value);
  const existing=obra?.medicoes||[];
  const all=[...existing,..._medicoesPendentes];
  const cont=document.getElementById('listaMedicoes');
  if(!cont) return;
  if(!all.length){
    cont.innerHTML='<div style="font-size:11px;color:var(--muted);padding:6px 0">Nenhuma medição registrada.</div>';
    return;
  }
  // Calculate pendentes
  const uscPrev=parseFloat(obra?.usc)||0, ulvPrev=parseFloat(obra?.ulv)||0;
  const hasFinal=all.some(m=>m.tipo==='final');
  const uscMedTotal=all.filter(m=>m.tipo==='parcial').reduce((s,m)=>s+(parseFloat(m.uscMedido)||0),0);
  const ulvMedTotal=all.filter(m=>m.tipo==='parcial').reduce((s,m)=>s+(parseFloat(m.ulvMedido)||0),0);
  const uscPend=hasFinal?0:Math.max(0,uscPrev-uscMedTotal);
  const ulvPend=hasFinal?0:Math.max(0,ulvPrev-ulvMedTotal);
  const sorted=[...all].sort((a,b)=>a.data>b.data?-1:1);
  cont.innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:10px;padding:3px 9px;border-radius:4px;background:rgba(124,106,247,.1);color:var(--accent3);border:1px solid rgba(124,106,247,.2)">USC previsto: ${uscPrev} | <strong>pendente estimado: ${uscPend}</strong>${obra?.uscMedidoGerente!=null?' (definido pelo gerente)':''}</span>
      <span style="font-size:10px;padding:3px 9px;border-radius:4px;background:rgba(255,107,53,.1);color:var(--accent2);border:1px solid rgba(255,107,53,.2)">ULV previsto: ${ulvPrev} | <strong>pendente estimado: ${ulvPend}</strong>${obra?.ulvMedidoGerente!=null?' (definido pelo gerente)':''}</span>
    </div>
    ${sorted.map(m=>{
      const isPend=_medicoesPendentes.some(p=>p.id===m.id);
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${isPend?'rgba(0,229,160,.06)':'var(--surface2)'};border-radius:6px;margin-bottom:5px;border:1px solid ${isPend?'rgba(0,229,160,.2)':'var(--border)'}">
        <span style="font-size:10px;color:var(--muted);min-width:70px">${fmtTxt(m.data)}</span>
        <span class="chip ${m.tipo==='final'?'chip-green':'chip-yellow'}" style="font-size:9px">${m.tipo==='final'?'✓ Final':'~ Parcial'}</span>
        ${m.tipo==='final'?'<span style="font-size:10px;color:var(--accent)">Encerra a medição</span>':'<span style="font-size:10px;color:var(--muted)">Parcial</span>'}
        ${isPend?`<span style="font-size:9px;color:var(--accent);margin-left:auto">novo</span>
          <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" onclick="removerMedicaoPendente('${m.id}')">✕</button>`:
         (me.perfil==='gerente'||me.perfil==='fiscal_adm')?`<button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px;margin-left:auto" onclick="excluirMedicaoSalva('${obra?.id}','${m.id}')">✕</button>`:''}
      </div>`;
    }).join('')}`;
}
window.toggleCancelamento=function(){
  document.getElementById('secCancelamentoDetalhe').style.display=
    document.getElementById('oCancelado').checked?'block':'none';
};
window.toggleParalisada=function(){
  document.getElementById('secParalisadaDetalhe').style.display=
    document.getElementById('oParalisada').checked?'block':'none';
};
window.togglePrazoCustom=function(){
  const sel=document.getElementById('oPrazoOpcao');
  const inp=document.getElementById('oPrazo');
  if(sel.value==='outro'){
    inp.style.display='block'; inp.value='';
  } else {
    inp.style.display='none'; inp.value=sel.value;
  }
  atualizarInfoLimite();
};
window.toggleDesligamento=function(){
  const conf=document.getElementById('oDesligConfirmado')?.checked;
  const canc=document.getElementById('oDesligCancelado')?.checked;
  // se confirmou, desmarcar cancelado e vice-versa
  if(conf) { const el=document.getElementById('oDesligCancelado'); if(el) el.checked=false; }
  if(canc) { const el=document.getElementById('oDesligConfirmado'); if(el) el.checked=false; }
  document.getElementById('secDesligMotivo').style.display=
    document.getElementById('oDesligCancelado')?.checked?'block':'none';
};

// Lê os checkboxes de tipos de pendência
function getTiposPendencia(){
  return Array.from(document.querySelectorAll('.chk-pendencia:checked')).map(el=>el.value);
}

// Helper: data de hoje no formato YYYY-MM-DD
function hojeStr(){ return new Date().toISOString().split('T')[0]; }

// Valida que uma data não é futura (exceto desligamento)
function validarDataPassada(val, label){
  if(!val) return null;
  if(val > hojeStr()) return `${label} não pode ser uma data futura.`;
  return null;
}
// Valida que desligamento é presente ou futuro
function validarDataFutura(val, label){
  if(!val) return null;
  if(val < hojeStr()) return `${label} deve ser hoje ou data futura.`;
  return null;
}

window.saveObra=async function(){
  const btn=document.getElementById('btnSalvarObra');
  btn.disabled=true; btn.textContent='Salvando…';
  const g=id=>{ const el=document.getElementById(id); return el?el.value:''; };
  const gChk=id=>{ const el=document.getElementById(id); return el?el.checked:false; };
  try{
    const obraId=document.getElementById('obraId').value;
    const isEdit=!!obraId;
    const obraAntiga=isEdit?obras.find(o=>o.id===obraId):null;

    const ab=g('oAbertura'), pr=g('oPrazo');
    const dataLimite=ab&&pr?addDias(ab,parseInt(pr)):null;

    // ── VALIDAÇÕES — skip entirely for genesis and estagiário ──
    const erros=[];
    const skipValidations = ['genesis','estagiario'].includes(me.perfil);

    if(!skipValidations){
      // Datas não podem ser futuras (exceto desligamento)
      const datasPassadas=[
        [g('oAbertura'),'Data de Abertura'],
        [g('oConclusao'),'Data de Conclusão'],
        [g('oFiscalizacao'),'Data de Fiscalização'],
        [g('oCadastro'),'Data Envio para Cadastro'],
        [g('oMedicao'),'Data de Medição'],
        [g('oMedida70'),'Data Medida 70'],
        [g('oMedida230'),'Data Medida 230'],
        [g('oMedida280'),'Data Medida 280'],
      ];
      datasPassadas.forEach(([v,l])=>{ const e=validarDataPassada(v,l); if(e) erros.push(e); });
      const errDes=validarDataFutura(g('oDesligamento'),'Data de Desligamento');
      if(errDes) erros.push(errDes);
      const concl=g('oConclusao')||(obraAntiga?.conclusao||'');
      const fisc=g('oFiscalizacao')||(obraAntiga?.fiscalizacao||'');
      if(fisc&&concl&&fisc<concl) erros.push('Fiscalização não pode ser anterior à Conclusão.');
      const kaffa=g('oKaffa')||(obraAntiga?.kaffa||'');
      const med=g('oMedicao')||(obraAntiga?.medicao||'');
      if(med&&kaffa&&med<kaffa) erros.push('Medição não pode ser anterior ao Kaffa.');
      // Dados do transformador (SAP, Série, Fabricante) são coletados no kaffa — não obrigatórios aqui
      const med230=g('oMedida230')||(obraAntiga?.medida230||'');
      if(g('oMedida280')&&!med230) erros.push('Medida 280 só pode ser preenchida após a Medida 230.');
      if(g('oRegularizacao')&&g('oRegularizacao')>hojeStr())
        erros.push('Data de Regularização não pode ser futura.');
    }

    if(erros.length){ toast(erros[0],'err'); return; }

    // Verificar número de obra duplicado (apenas na criação, não para genesis/estagiario)
    if(!isEdit&&!skipValidations){
      const numero=g('oNum').trim();
      if(numero && obras.some(o=>o.numero===numero)){
        toast(`Obra ${numero} já existe no sistema!`,'err'); return;
      }
    }

    let patch={};
    if(me.perfil==='gerente'){
      // Build kaffaEntries and medicoes inline (same pattern as empreiteira/fiscal)
      const existingKaffasG = obraAntiga?.kaffaEntries||[];
      const allKaffasG = [...existingKaffasG, ..._kaffasPendentes];
      const lastKaffaG = allKaffasG.map(k=>k.data).filter(Boolean).sort().slice(-1)[0] || obraAntiga?.kaffa || '';
      const existingMedsG = obraAntiga?.medicoes||[];
      const allMedsG = [...existingMedsG, ..._medicoesPendentes];
      const lastMedG = allMedsG.map(m=>m.data).filter(Boolean).sort().slice(-1)[0] || obraAntiga?.medicao || '';
      patch={
        numero:g('oNum'), tipo:g('oTipo'), cidade:g('oCidade'), empreiteira:g('oEmp'),
        fiscal:g('oFiscalNome'), dataAbertura:ab, prazoExecucao:pr?parseInt(pr):null,
        dataLimite, usc:g('oUSC')?parseFloat(g('oUSC')):null, ulv:g('oULV')?parseFloat(g('oULV')):null,
        uscMedidoGerente:g('oUSCMedidoGerente')?parseFloat(g('oUSCMedidoGerente')):null,
        ulvMedidoGerente:g('oULVMedidoGerente')?parseFloat(g('oULVMedidoGerente')):null,
        dataDesligamento:g('oDesligamento'),
        desligamentoConfirmado:gChk('oDesligConfirmado'), desligamentoCancelado:gChk('oDesligCancelado'),
        desligamentoCanceladoMotivo:g('oDesligMotivo'),
        conclusao:g('oConclusao'), placas:g('oPlacas'), sap:g('oSAP'), serie:g('oSerie'), fabricante:g('oFabricante'),
        // Reset ciente do fiscal quando empreiteira informa kaffa/conclusão
        cienFisc: false,
        potencia:g('oPotencia')?parseFloat(g('oPotencia'))||null:null,
        dataTransf:g('oDataTransf')||null,
        equipamentosInstalados:_equipInstalados,
        equipamentosRetirados:_equipRetirados,
        temRetirado:document.getElementById('oTemRetirado')?.checked||false,
        potenciaRet:g('oPotenciaRet')?parseFloat(g('oPotenciaRet'))||null:null,
        sapRet:g('oSAPRet')||null, serieRet:g('oSerieRet')||null, fabricanteRet:g('oFabricanteRet')||null,
        kaffaEntries: allKaffasG,
        kaffa: lastKaffaG,
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        locaisTrabalho:(obraAntiga?.locaisTrabalho||[]).concat(_locaisPendentes),
        // Reset cienMed quando fiscal confirma nova fiscalização (spread condicional evita undefined)
        ...(g('oFiscalizacao') && g('oFiscalizacao')!==(obraAntiga?.fiscalizacao||'') ? {cienMed: false} : {}),
        ...(document.getElementById('oUSCMedidoGerente')?.value!==''?{uscMedidoGerente:parseFloat(document.getElementById('oUSCMedidoGerente')?.value)||null}:{}),
        tiposPendencia:getTiposPendencia(), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'), prazoPendenciaLabel:document.getElementById('oPrazoPendenciaLabel')?.value||'',
        pendenciaResolvida:gChk('oPendenciaResolvida'),
        // Devolução: fiscal devolve para empreiteira regularizar de novo
        ...(gChk('oPendenciaNaoResolvida') ? {
          pendenciaResolvida: false,
          regularizacaoData: null,  // limpa regularização anterior
          pendenciaDevolvidaEm: hojeStr(),
          pendenciaDevolvida: true,
        } : {}),
        dataCadastro:g('oCadastro'), cadastroConfirmado:gChk('oCadastroConfirmado'),
        medicoes: allMedsG,
        medicao: lastMedG,
        medida70:g('oMedida70'), medida230:g('oMedida230'),
        medida280:g('oMedida280'), medida280Motivo:g('oMedida280Motivo'),
        armazenado:gChk('oArmazenado'), contratosAssinado:gChk('oContratosAssinado'),
        medicoesAssinadas:gChk('oMedicoesAssinadas'), projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'),
        descricao:g('oDescricao')||null,
        enquadramento:g('oEnquadramento')||null,
        programa: g('oTipo')==='R1' ? 'Regulatório' : (g('oPrograma')||null),
        locaisTrabalho:(obraAntiga?.locaisTrabalho||[]).concat(_locaisPendentes),
        equipamentoRef:g('oEquipRef')?parseInt(g('oEquipRef'))||null:null,
        dataTransf:g('oDataTransf')||null,
        equipamentosInstalados:_equipInstalados,
        equipamentosRetirados:_equipRetirados,
        potencia: g('oPotencia')?parseFloat(g('oPotencia'))||null:null,
        temRetirado: document.getElementById('oTemRetirado')?.checked||false,
        potenciaRet: g('oPotenciaRet')?parseFloat(g('oPotenciaRet'))||null:null,
        sapRet: g('oSAPRet')||null,
        serieRet: g('oSerieRet')||null,
        fabricanteRet: g('oFabricanteRet')||null,
        paralisada:gChk('oParalisada'), motivoParalisada:g('oMotivoParalisada'),
        processoCancelamento:gChk('oProcessoCancelamento'),
        cancelado:gChk('oCancelado'), dataCancelamento:g('oDataCancelamento'), motivoCancelamento:g('oMotivoCancelamento'),
        atualizadaEm:serverTimestamp()
      };
      if(_kaffasPendentes.length>0)  _kaffasPendentes=[];
      if(_medicoesPendentes.length>0) _medicoesPendentes=[];
    } else if(me.perfil==='empreiteira'){
      // Build kaffaEntries right here for empreiteira
      const existingKaffasEmp = obraAntiga?.kaffaEntries||[];
      const allKaffasEmp = [...existingKaffasEmp, ..._kaffasPendentes];
      const lastKaffaDate = allKaffasEmp.map(k=>k.data).filter(Boolean).sort().slice(-1)[0]||'';
      patch={
        conclusao:g('oConclusao'), placas:g('oPlacas'), sap:g('oSAP'), serie:g('oSerie'), fabricante:g('oFabricante'),
        // Reset ciente do fiscal quando empreiteira informa kaffa/conclusão
        cienFisc: false,
        potencia:g('oPotencia')?parseFloat(g('oPotencia'))||null:null,
        dataTransf:g('oDataTransf')||null,
        equipamentosInstalados:_equipInstalados,
        equipamentosRetirados:_equipRetirados,
        temRetirado:document.getElementById('oTemRetirado')?.checked||false,
        potenciaRet:g('oPotenciaRet')?parseFloat(g('oPotenciaRet'))||null:null,
        sapRet:g('oSAPRet')||null, serieRet:g('oSerieRet')||null, fabricanteRet:g('oFabricanteRet')||null,
        dataDesligamento:g('oDesligamento'),
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        regularizacaoData:g('oRegularizacao'),
        // Reset flag de devolução quando empreiteira informa regularização novamente
        // Reset devolução se obra estava devolvida (empreiteira regularizou novamente)
        ...(obraAntiga?.pendenciaDevolvida ? {pendenciaDevolvida:false, pendenciaDevolvidaEm:null} : {}),
        kaffaEntries: allKaffasEmp,
        kaffa: lastKaffaDate || g('oKaffa') || obraAntiga?.kaffa || '',
        atualizadaEm:serverTimestamp()
      };
      if(_kaffasPendentes.length > 0) _kaffasPendentes=[];
    } else if(me.perfil==='fiscal'||me.perfil==='fiscal_adm'){
      console.log('[SPPC] salvando como fiscal/fiscal_adm:', me.perfil);
      // Build medicoes array directly in the patch (same as empreiteira kaffa pattern)
      const existingMedsF = obraAntiga?.medicoes||[];
      const allMedsF = [...existingMedsF, ..._medicoesPendentes];
      // medicao (data) só é atualizado pela medição FINAL — parcial não muda status da obra
      const finalMedsF = allMedsF.filter(m=>m.tipo==='final');
      const lastMedDate = finalMedsF.map(m=>m.data).filter(Boolean).sort().slice(-1)[0] || obraAntiga?.medicao || '';
      patch={
        dataDesligamento:g('oDesligamento'),
        desligamentoConfirmado:gChk('oDesligConfirmado'), desligamentoCancelado:gChk('oDesligCancelado'),
        desligamentoCanceladoMotivo:g('oDesligMotivo'),
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        locaisTrabalho:(obraAntiga?.locaisTrabalho||[]).concat(_locaisPendentes),
        // Reset cienMed quando fiscal confirma nova fiscalização (spread condicional evita undefined)
        ...(g('oFiscalizacao') && g('oFiscalizacao')!==(obraAntiga?.fiscalizacao||'') ? {cienMed: false} : {}),
        tiposPendencia:getTiposPendencia(), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'), prazoPendenciaLabel:document.getElementById('oPrazoPendenciaLabel')?.value||'',
        pendenciaResolvida:gChk('oPendenciaResolvida'),
        // Devolução: fiscal devolve para empreiteira regularizar de novo
        ...(gChk('oPendenciaNaoResolvida') ? {
          pendenciaResolvida: false,
          regularizacaoData: null,  // limpa regularização anterior
          pendenciaDevolvidaEm: hojeStr(),
          pendenciaDevolvida: true,
        } : {}),
        dataCadastro:g('oCadastro'),
        // cadastroConfirmado only valid for gerente/genesis, fiscal cannot confirm
        medida70:g('oMedida70'), medida230:g('oMedida230'),
        medida280:g('oMedida280'), medida280Motivo:g('oMedida280Motivo'),
        medicoes: allMedsF,
        medicao: lastMedDate || obraAntiga?.medicao || '',
        armazenado:gChk('oArmazenado'), contratosAssinado:gChk('oContratosAssinado'),
        medicoesAssinadas:gChk('oMedicoesAssinadas'), projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'),
        atualizadaEm:serverTimestamp()
      };
      if(_medicoesPendentes.length > 0) _medicoesPendentes=[];
    }

    // Patches para genesis (só confirmar cadastro) e estagiario (só armazenamento)
    if(me.perfil==='genesis'){
      const cadData = g('oCadastro') || obraAntiga?.dataCadastro || '';
      const cadConf = gChk('oCadastroConfirmado');
      patch = { 
        dataCadastro: cadData,
        cadastroConfirmado: cadConf,
        atualizadaEm: serverTimestamp()
      };
      // Record confirmation timestamp
      if(cadConf && !obraAntiga?.cadastroConfirmado) patch.dataCadastroConfirmado = hojeStr();
    }
    if(me.perfil==='estagiario'){
      const finalCheckEl=document.getElementById('oArmazenado');
      patch={ armazenado:finalCheckEl&&!finalCheckEl.disabled?gChk('oArmazenado'):obraAntiga?.armazenado||false,
        contratosAssinado:gChk('oContratosAssinado'),
        medicoesAssinadas:gChk('oMedicoesAssinadas'), projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'), atualizadaEm:serverTimestamp() };
    }

    if(isEdit){
      await updateDoc(doc(db,'obras',obraId),patch);
      // disparo de e-mails por evento
      // Save new medições: gerente (fiscal handles inline, empreiteira doesn't use medicoes)
      // Also handles case where medicoes weren't added inline for any reason
      if(_medicoesPendentes.length > 0 && (me.perfil==='gerente' || !patch.medicoes)){
        const existingMeds = obraAntiga?.medicoes||[];
        patch.medicoes = [...existingMeds, ..._medicoesPendentes];
        // medicao (campo de data) só é setado pela medição FINAL
        const finalMeds = patch.medicoes.filter(m=>m.tipo==='final');
        const lastFinalDate = finalMeds.map(m=>m.data).filter(Boolean).sort().slice(-1)[0];
        if(lastFinalDate) patch.medicao = lastFinalDate;
        else patch.medicao = obraAntiga?.medicao||null; // mantém medicao anterior se havia
        _medicoesPendentes = [];
      }
      // Save kaffaEntries for non-empreiteira profiles (empreiteira handled in patch above)
      if(_kaffasPendentes.length > 0 && me.perfil !== 'empreiteira'){
        const existingKaffas = obraAntiga?.kaffaEntries||[];
        patch.kaffaEntries = [...existingKaffas, ..._kaffasPendentes];
        const allKDates = patch.kaffaEntries.map(k=>k.data).filter(Boolean).sort();
        if(allKDates.length) patch.kaffa = allKDates[allKDates.length-1];
        _kaffasPendentes = [];
      }
      // dataCadastroConfirmado: record timestamp when confirmed
      if(patch.cadastroConfirmado && !obraAntiga?.cadastroConfirmado){
        patch.dataCadastroConfirmado = hojeStr();
      }
      // Email: kaffa registrado pela empreiteira → avisa fiscal
      if(me.perfil==='empreiteira' && _kaffasPendentes.length > 0 && patch.kaffaEntries){
        // Apenas os kaffas realmente novos (proteção contra slice(-0) que retorna array completo)
        const qtdAntigos = (obraAntiga?.kaffaEntries||[]).length;
        const qtdNovos   = patch.kaffaEntries.length - qtdAntigos;
        if(qtdNovos > 0){
          const novosKaffas = patch.kaffaEntries.slice(-qtdNovos);
          for(const k of novosKaffas)
            await enviarEmailKaffa({...obraAntiga,...patch}, k.tipo, k.data);
        }
      }
      // Email: obra concluída pela empreiteira → avisa fiscal
      // Email: conclusão informada ou atualizada por empreiteira OU gerente
      // Dispara sempre que a data de conclusão MUDAR (primeira vez ou atualização)
      if(patch.conclusao &&
         patch.conclusao !== (obraAntiga?.conclusao||'') &&
         (me.perfil==='empreiteira'||me.perfil==='gerente'))
        await enviarEmailConclusao({...obraAntiga,...patch});
      if((me.perfil==='fiscal'||me.perfil==='fiscal_adm')&&!obraAntiga?.pendencia&&patch.pendencia){
        patch.dataPendencia = hojeStr(); // registra a data em que a pendência foi cadastrada
        await enviarEmailPendencia({...obraAntiga,...patch});
      }
      if(me.perfil==='gerente'&&!obraAntiga?.pendencia&&patch.pendencia){
        patch.dataPendencia = hojeStr(); // gerente também pode registrar pendência
      }
      // Registrar se pendência foi resolvida dentro do prazo
      if((me.perfil==='fiscal'||me.perfil==='fiscal_adm'||me.perfil==='gerente')&&patch.pendenciaResolvida&&!obraAntiga?.pendenciaResolvida){
        const prazoLim=obraAntiga?.prazoPendencia;
        const dataReg=obraAntiga?.regularizacaoData;
        if(prazoLim&&dataReg) patch.pendenciaDentroPrazo=(dataReg<=prazoLim);
      }
      // E-mail quando empreiteira regulariza pendência
      if(me.perfil==='empreiteira'&&!obraAntiga?.regularizacaoData&&patch.regularizacaoData)
        await enviarEmailRegularizacao({...obraAntiga,...patch});
      toast('Obra atualizada!');
    } else {
      if(!patch.numero||!patch.cidade){ toast('Preencha número e cidade.','err'); return; }
      patch.criadaEm=serverTimestamp(); patch.criadaPor=me.uid;
      await addDoc(collection(db,'obras'),patch);
      toast('Obra cadastrada!');
    }
    closeObraModal();
  }catch(e){ toast('Erro: '+e.message,'err'); }
  finally{ btn.disabled=false; btn.textContent='Salvar'; }
};

window.delObra=async function(id){
  if(!confirm('Remover esta obra permanentemente?')) return;
  try{ await deleteDoc(doc(db,'obras',id)); toast('Obra removida.','warn'); }
  catch(e){ toast('Erro: '+e.message,'err'); }
};

// ── USUÁRIOS ──────────────────────────────────────────
async function loadUsers(){ const s=await getDocs(collection(db,'usuarios')); users=s.docs.map(d=>({uid:d.id,...d.data()})); }
async function renderUsers(){
  await loadUsers();
  const list=document.getElementById('usersList');
  list.innerHTML=users.length
    ?users.map(u=>{
        const rc=`role-${u.perfil==='estagiario'?'estagiario':u.perfil==='genesis'?'genesis':u.perfil}`;
        return `<div class="ut-row">
          <div class="ut-name">${u.nome}</div>
          <div class="ut-email">${u.email||'—'}</div>
          <div class="ut-role"><span class="role-badge ${rc}">${u.perfil}</span></div>
          <div class="ut-vinc">${u.vinculo||'—'}</div>
          <div class="ut-acts">
            <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.uid}')" title="Editar">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="resetSenhaUsuario('${u.email||''}')" title="Enviar redefinição de senha" style="font-size:10px">🔑</button>
            ${u.uid!==me.uid?`<button class="btn btn-danger btn-sm" onclick="delUser('${u.uid}')">🗑️</button>`:''}
          </div>
        </div>`;
      }).join('')
    :'<div class="empty"><div class="ico">👥</div><p>Nenhum usuário.</p></div>';
}
window.renderUsers=renderUsers;

window.openUserModal=async function(uid){
  const isEdit=!!uid;
  document.getElementById('userModalTit').textContent=isEdit?'Editar Usuário':'Novo Usuário';
  document.getElementById('userId').value=uid||'';
  document.getElementById('btnSalvarUser').textContent=isEdit?'Salvar':'Criar Usuário';
  ['uNome','uEmail','uSenha','uVincFis'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('uPerfil').value='';
  document.getElementById('uVincEmp').value='';
  document.getElementById('fgVincEmp').style.display='none';
  document.getElementById('fgVincFis').style.display='none';
  const note=document.getElementById('userNote');
  if(isEdit){
    await loadUsers();
    const u=users.find(x=>x.uid===uid);
    if(u){
      document.getElementById('uNome').value=u.nome||'';
      document.getElementById('uEmail').value=u.email||'';
      document.getElementById('uPerfil').value=u.perfil||'';
      onPerfilChange();
      if(u.perfil==='empreiteira') document.getElementById('uVincEmp').value=u.vinculo||'';
      if(u.perfil==='fiscal'||u.perfil==='fiscal_adm') document.getElementById('uVincFis').value=u.vinculo||'';
    }
    note.style.display='block';
  } else { note.style.display='none'; }
  document.getElementById('ovUser').classList.add('open');
};
window.closeUserModal=function(){ document.getElementById('ovUser').classList.remove('open'); };
window.onPerfilChange=function(){
  const p=document.getElementById('uPerfil').value;
  document.getElementById('fgVincEmp').style.display=p==='empreiteira'?'flex':'none';
  // fiscal E fiscal_adm precisam do campo "Nome do Fiscal (igual ao cadastro nas obras)"
  document.getElementById('fgVincFis').style.display=(p==='fiscal'||p==='fiscal_adm')?'flex':'none';
  // genesis e estagiário: sem vínculo necessário
};
window.saveUser=async function(){
  const btn=document.getElementById('btnSalvarUser');
  btn.disabled=true; btn.textContent='Salvando…';
  try{
    const uid=document.getElementById('userId').value;
    const isEdit=!!uid;
    const nome=document.getElementById('uNome').value.trim();
    const email=document.getElementById('uEmail').value.trim().toLowerCase();
    const senha=document.getElementById('uSenha').value;
    const perfil=document.getElementById('uPerfil').value;
    const vinculo=perfil==='empreiteira'?document.getElementById('uVincEmp').value
      :(perfil==='fiscal'||perfil==='fiscal_adm')?document.getElementById('uVincFis').value.trim():'';
    if(!nome||!email||!perfil){ toast('Preencha todos os campos.','err'); return; }

    if(isEdit){
      // Atualiza Firestore (nome, perfil, vínculo)
      await setDoc(doc(db,'usuarios',uid),{nome,email,perfil,vinculo},{merge:true});

      // Se senha foi preenchida: envia e-mail de redefinição
      if(senha && senha.length>=6){
        await sendPasswordResetEmail(auth, email);
        toast(`Dados atualizados! E-mail de redefinição de senha enviado para ${email}.`);
      } else {
        // Verifica se o e-mail mudou comparando com o que estava no Firestore
        const snap=await getDoc(doc(db,'usuarios',uid));
        const emailAntigo=snap.data()?.email||'';
        if(emailAntigo && emailAntigo!==email){
          // E-mail mudou: precisa recriar a conta no Firebase Auth
          // 1. Cria nova conta Auth com novo e-mail
          if(!senha||senha.length<6){
            toast('Para alterar o e-mail, preencha também uma nova senha (mín. 6 caracteres).','err');
            return;
          }
        }
        toast('Usuário atualizado!');
      }
    } else {
      // Novo usuário: cria no Firebase Auth + Firestore
      if(!senha||senha.length<6){ toast('Senha: mínimo 6 caracteres.','err'); return; }
      const cred=await createUserWithEmailAndPassword(auth2,email,senha);
      await signOut(auth2);
      await setDoc(doc(db,'usuarios',cred.user.uid),{nome,email,perfil,vinculo,criadoEm:serverTimestamp()});
      toast(`✓ Usuário ${nome} criado! Login: ${email}`);
    }
    closeUserModal(); await renderUsers();
  }catch(e){
    const msgs={
      'auth/email-already-in-use':'E-mail já cadastrado no sistema.',
      'auth/weak-password':'Senha fraca (mínimo 6 caracteres).',
      'auth/invalid-email':'E-mail inválido.',
    };
    toast('Erro: '+(msgs[e.code]||e.message),'err');
  }finally{ btn.disabled=false; btn.textContent=document.getElementById('userId').value?'Salvar':'Criar Usuário'; }
};

// Envia e-mail de redefinição de senha para um usuário
window.resetSenhaUsuario=async function(email){
  if(!email){ toast('Usuário sem e-mail cadastrado.','err'); return; }
  if(!confirm(`Enviar e-mail de redefinição de senha para:\n${email}?`)) return;
  try{
    await sendPasswordResetEmail(auth, email);
    toast(`E-mail de redefinição enviado para ${email}!`);
  }catch(e){
    const msgs={'auth/user-not-found':'Usuário não encontrado no sistema de autenticação.'};
    toast('Erro: '+(msgs[e.code]||e.message),'err');
  }
};

// Recria conta Auth com novo e-mail (mantém dados do Firestore)
window.recriarContaUsuario=async function(uid, novoEmail, novaSenha, nome, perfil, vinculo){
  try{
    const cred=await createUserWithEmailAndPassword(auth2, novoEmail, novaSenha);
    await signOut(auth2);
    // Atualiza Firestore com novo UID e novo e-mail
    await deleteDoc(doc(db,'usuarios',uid));
    await setDoc(doc(db,'usuarios',cred.user.uid),{nome,email:novoEmail,perfil,vinculo,criadoEm:serverTimestamp()});
    toast(`✓ Conta recriada com e-mail ${novoEmail}. A conta antiga foi desativada.`);
  }catch(e){
    const msgs={'auth/email-already-in-use':'Novo e-mail já está em uso.'};
    toast('Erro ao recriar: '+(msgs[e.code]||e.message),'err');
  }
};
window.delUser=async function(uid){
  if(uid===me.uid){ toast('Não pode remover a si mesmo.','err'); return; }
  if(!confirm('Remover este usuário?')) return;
  await deleteDoc(doc(db,'usuarios',uid)); toast('Usuário removido.','warn'); await renderUsers();
};

// ── EMAILS ────────────────────────────────────────────
function emailJSAtivo(){
  if(typeof emailjs === 'undefined'){
    console.warn('[SPPC Email] EmailJS library não carregada');
    return false;
  }
  const cfg = EMAILJS_CONFIG;
  if(!cfg?.publicKey || cfg.publicKey.startsWith('COLE_AQUI')){
    return false; // não configurado ainda
  }
  if(!cfg?.tplGeral || cfg.tplGeral.startsWith('COLE_AQUI')){
    console.warn('[SPPC Email] tplGeral não configurado em emailjs-config.js');
    return false;
  }
  return true;
}
async function jaEnviou(chave){
  try{
    const s=await getDocs(query(collection(db,'notificacoes'),where('chave','==',chave)));
    return !s.empty;
  }catch(e){
    console.warn('[SPPC Email] jaEnviou:', e.message);
    return false;
  }
}

async function marcarEnviado(chave){
  try{ await addDoc(collection(db,'notificacoes'),{chave,ts:serverTimestamp()}); }catch(e){}
}
// ── FUNÇÃO GENÉRICA: 1 único template para todos os tipos ──────────
// O template no EmailJS usa apenas: {{to_email}}, {{cc_email}}, {{assunto}}, {{mensagem}}
async function enviarEmail(assunto, mensagem, toEmail, ccEmail){
  if(!emailJSAtivo()) { console.warn('[SPPC Email] EmailJS inativo — e-mail não enviado.'); return; }
  const tpl = EMAILJS_CONFIG.tplGeral;
  if(!tpl || tpl.startsWith('COLE_AQUI')) { console.warn('[SPPC Email] Template não configurado.'); return; }
  if(!toEmail) { console.warn('[SPPC Email] Sem destinatário — e-mail ignorado.'); return; }
  console.log('[SPPC Email] Enviando para:', toEmail, '| Assunto:', assunto);
  try{
    const resp = await emailjs.send(EMAILJS_CONFIG.serviceId, tpl, {
      to_email: toEmail,
      cc_email: ccEmail || EMAILJS_CONFIG.emailGerente || '',
      assunto, mensagem,
    });
    console.log('[SPPC Email] ✅ Enviado! Status:', resp.status);
  }catch(e){
    // EmailJS retorna {status, text} — não é um Error padrão
    const msg = e?.text || e?.message || JSON.stringify(e);
    console.error('[SPPC Email] ❌ Falhou:', msg);
    console.error('[SPPC Email] → serviceId:', EMAILJS_CONFIG.serviceId, '| tpl:', tpl, '| para:', toEmail);
    // Detecta limite de cota
    if(msg?.includes('quota') || msg?.includes('limit') || e?.status===429){
      toast('⚠️ Limite de e-mails atingido (200/mês). Upgrade necessário no EmailJS.','warn');
    }
  }
}

async function enviarEmailKaffa(obra, tipoKaffa, dataKaffa){
  if(!obra.fiscal){ console.warn('[Email Kaffa] Obra sem fiscal.'); return; }
  const fiscal = users.find(u=>u.vinculo===obra.fiscal&&(u.perfil==='fiscal'||u.perfil==='fiscal_adm'));
  if(!fiscal?.email){
    console.warn('[Email Kaffa] Fiscal não encontrado ou sem email. fiscal vinculo=',obra.fiscal,'users=',users.map(u=>u.vinculo+'('+u.perfil+')'));
    toast('⚠️ Email não enviado: fiscal sem email cadastrado.','warn');
    return;
  }
  console.log('[Email Kaffa] Enviando para fiscal:', fiscal.email);
  // E-mail imediato (kaffa é um evento — a combinação tipo+data é única)
  const tipoLabel = tipoKaffa==='final' ? 'KAFFA FINAL ✅' : 'Kaffa Parcial';
  await enviarEmail(
    `SPPC ARLAG – ${tipoLabel} registrado | Obra ${obra.numero} – ${obra.cidade}`,
    `Olá, Fiscal!

A empreiteira ${obra.empreiteira} registrou o seguinte:

• Tipo: ${tipoLabel}
• Data: ${fmtTxt(dataKaffa)}
• Obra: ${obra.numero}
• Cidade: ${obra.cidade}

Aguarda medição correspondente.`,
    fiscal.email, EMAILJS_CONFIG.emailGerente
  );
  // (kaffa tipo+data é naturalmente único — sem marcarEnviado)
}

async function enviarEmailConclusao(obra){
  if(!obra.fiscal) return;
  const fiscal = users.find(u=>u.vinculo===obra.fiscal&&u.perfil==='fiscal');
  if(!fiscal?.email) return;
  // E-mail imediato — sem verificação de duplicata (disparado por mudança de estado)
  await enviarEmail(
    `SPPC ARLAG – Obra concluída | ${obra.numero} – ${obra.cidade}`,
    `Olá, Fiscal!

A empreiteira ${obra.empreiteira} informou conclusão da obra.

• Obra: ${obra.numero}
• Cidade: ${obra.cidade}
• Data de Conclusão: ${fmtTxt(obra.conclusao)}

Aguarda fiscalização.`,
    fiscal.email, EMAILJS_CONFIG.emailGerente
  );
  // (sem marcarEnviado — condição !obraAntiga?.conclusao previne reenvio)
}

async function enviarEmailPendencia(obra){
  const emp = empreiteiras.find(e=>e.nome===obra.empreiteira);
  if(!emp?.email) return;
  const chave = `pendencia_${obra.id}`;
  if(await jaEnviou(chave)) return;
  const tipos = (obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', ');
  await enviarEmail(
    `SPPC ARLAG – Pendência registrada | Obra ${obra.numero} – ${obra.cidade}`,
    `Atenção, Empreiteira!

Foi registrada uma pendência na sua obra.

• Obra: ${obra.numero} – ${obra.cidade}
• Tipo: ${tipos}
• Prazo para regularização: ${fmtTxt(obra.prazoPendencia)}

Acesse o sistema SPPC ARLAG para regularizar.`,
    emp.email, EMAILJS_CONFIG.emailGerente
  );
  // (sem marcarEnviado)
}

async function enviarEmailRegularizacao(obra){
  const fiscal = users.find(u=>u.vinculo===obra.fiscal&&u.perfil==='fiscal');
  if(!fiscal?.email) return;
  const chave = `regularizacao_${obra.id}`;
  if(await jaEnviou(chave)) return;
  const tipos = (obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', ');
  await enviarEmail(
    `SPPC ARLAG – Pendência regularizada | Obra ${obra.numero} – ${obra.cidade}`,
    `Olá, Fiscal!

A empreiteira regularizou a pendência da obra.

• Obra: ${obra.numero} – ${obra.cidade}
• Pendência: ${tipos}
• Regularizada em: ${fmtTxt(obra.regularizacaoData)}

Verifique no sistema SPPC ARLAG.`,
    fiscal.email, EMAILJS_CONFIG.emailGerente
  );
  await marcarEnviado(chave);
}

async function verificarNotificacoes(){
  if(!emailJSAtivo()) return;
  await loadUsers();
  const hoje_d=hoje();
  for(const o of obras){
    if(o.cancelado||o.armazenado||o.conclusao) continue;
    if(!o.dataLimite) continue;
    const dias=diasRestantes(o.dataLimite);
    // Obra próxima de vencer
    if(dias<=EMAILJS_CONFIG.diasAvisoObra){
      const emp=empreiteiras.find(e=>e.nome===o.empreiteira);
      if(emp?.email){
        const tipo=dias<=0?'vencida':dias<=EMAILJS_CONFIG.diasCritico?'critica':'aviso';
        const hoje_key = hojeStr().replace(/-/g,''); // chave diária — envia 1x/dia por obra
        const chave=`prazo_${o.id}_${tipo}_${hoje_key}`;
        if(!await jaEnviou(chave)){
          const emoji = tipo==='critica'?'⚠️ URGENTE:':'🔔';
          await enviarEmail(
            `${emoji} SPPC ARLAG – Prazo da obra | ${o.numero} – ${o.cidade}`,
            `Atenção, Empreiteira!

A obra abaixo está com prazo${dias<=0?' VENCIDO':' próximo do vencimento'}:

• Obra: ${o.numero} – ${o.cidade}
• Vencimento: ${fmtTxt(o.dataLimite)}
• Situação: ${dias<=0?'Vencida há '+Math.abs(dias)+' dias':dias+' dias restantes'}

Acesse o sistema SPPC ARLAG para verificar.`,
            emp.email, EMAILJS_CONFIG.emailGerente
          );
          await marcarEnviado(chave);
        }
      }
    }
    // Medida 70 próxima de vencer (somente R1 e ODI)
    if(!o.medida70&&o.dataLimite&&o.tipo!=='R2'){
      const diasM=diasRestantes(o.dataLimite);
      if(diasM<=EMAILJS_CONFIG.diasAvisoMedida){
        const fiscal=users.find(u=>u.vinculo===o.fiscal&&u.perfil==='fiscal');
        if(fiscal?.email){
          const tipo=diasM<=0?'vencida':diasM<=EMAILJS_CONFIG.diasCritico?'critica':'aviso';
          const chave=`medida70_${o.id}_${tipo}_${o.dataLimite}`;
          if(!await jaEnviou(chave)){
            await enviarEmail(
              `SPPC ARLAG – Medida 70 próxima | Obra ${o.numero} – ${o.cidade}`,
              `Olá, Fiscal!

A Medida 70 da obra abaixo está próxima do vencimento:

• Obra: ${o.numero} – ${o.cidade}
• Vencimento: ${fmtTxt(o.dataLimite)}
• Situação: ${diasM<=0?'Vencida':diasM+'d restantes'}

Atualize no sistema SPPC ARLAG.`,
              fiscal.email, EMAILJS_CONFIG.emailGerente
            );
            await marcarEnviado(chave);
          }
        }
      }
    }
    // Cadastro urgente: fiscalizado há mais de 30 dias sem enviar para cadastro
    if(o.fiscalizacao && !o.dataCadastro){
      const diasSemCad = diff(o.fiscalizacao, new Date().toISOString().split('T')[0]);
      if(diasSemCad !== null && diasSemCad > 30){
        const fiscal=users.find(u=>u.vinculo===o.fiscal&&u.perfil==='fiscal');
        if(fiscal?.email){
          const chave=`cad_urgente_${o.id}_${o.fiscalizacao}`;
          if(!await jaEnviou(chave)){
            await enviarEmail(
              `⚠️ SPPC ARLAG – Cadastro urgente | Obra ${o.numero} – ${o.cidade}`,
              `Olá, Fiscal!

A obra abaixo foi fiscalizada há ${diasSemCad} dias e ainda não foi enviada para cadastro:

• Obra: ${o.numero} – ${o.cidade}
• Data fiscalização: ${fmtTxt(o.fiscalizacao)}

Envie para cadastro com urgência.`,
              fiscal.email, EMAILJS_CONFIG.emailGerente
            );
            await marcarEnviado(chave);
          }
        }
      }
    }
    if(!o.medida230&&o.dataLimite){
      const diasM=diasRestantes(o.dataLimite);
      if(diasM<=EMAILJS_CONFIG.diasAvisoMedida){
        const fiscal=users.find(u=>u.vinculo===o.fiscal&&u.perfil==='fiscal');
        if(fiscal?.email){
          const tipo=diasM<=0?'vencida':diasM<=EMAILJS_CONFIG.diasCritico?'critica':'aviso';
          const chave=`medida230_${o.id}_${tipo}_${o.dataLimite}`;
          if(!await jaEnviou(chave)){
            await enviarEmail(
              `SPPC ARLAG – Medida 230 próxima | Obra ${o.numero} – ${o.cidade}`,
              `Olá, Fiscal!

A Medida 230 da obra abaixo está próxima do vencimento:

• Obra: ${o.numero} – ${o.cidade}
• Vencimento: ${fmtTxt(o.dataLimite)}
• Situação: ${diasM<=0?'Vencida':diasM+'d restantes'}

Atualize no sistema SPPC ARLAG.`,
              fiscal.email, EMAILJS_CONFIG.emailGerente
            );
            await marcarEnviado(chave);
          }
        }
      }
    }
  }
}

// ── CSV ───────────────────────────────────────────────
window.exportCSV=function(){
  const rows=[['Status','Nº','Tipo','Descrição','Cidade','Empreiteira','Fiscal','Equip.Ref.','Abertura','Prazo','Data Limite','Conclusão','Fiscalização','Pendência','Kaffa','Cadastro','Medição','USC','ULV','Medida 70','Medida 230','Medida 280','Armazenado','Cancelado']];
  visibleObras().forEach(o=>rows.push([
    statusOf(o),o.numero,o.tipo,o.cidade,o.empreiteira,o.fiscal,
    o.dataAbertura,o.prazoExecucao,o.dataLimite,o.conclusao,o.fiscalizacao,
    o.pendencia?(o.tipoPendencia||'Sim'):'Não',o.kaffa,o.dataCadastro,o.medicao,
    o.descricao||'',o.equipamentoRef||'',o.usc,o.ulv,o.medida70,o.medida230,o.medida280,o.armazenado?'Sim':'Não',o.cancelado?'Sim':'Não'
  ]));
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF'+rows.map(r=>r.map(v=>v??'').join(';')).join('\n'));
  a.download='obras_track.csv'; a.click();
};

// ── FECHAR MODAIS ─────────────────────────────────────
['ovObra','ovUser','ovEmp'].forEach(id=>{
  document.getElementById(id).addEventListener('click',e=>{
    if(e.target===document.getElementById(id)) document.getElementById(id).classList.remove('open');
  });
});

// ══════════════════════════════════════════════════════
//  FILTROS AVANÇADOS
// ══════════════════════════════════════════════════════
let filtrosPanelAberto = false;

window.toggleFiltros = function() {
  filtrosPanelAberto = !filtrosPanelAberto;
  document.getElementById('painelFiltros').style.display = filtrosPanelAberto ? 'block' : 'none';
  popularSelectsFiltros();
};

function popularSelectsFiltros() {
  // Empreiteiras
  const selEmp = document.getElementById('fEmpreiteira');
  const atualEmp = selEmp.value;
  selEmp.innerHTML = '<option value="">Todas</option>' +
    empreiteiras.map(e => `<option value="${e.nome}">${e.nome}</option>`).join('');
  selEmp.value = atualEmp;

  // Fiscais
  const fiscaisSet = [...new Set(obras.map(o => o.fiscal).filter(Boolean))].sort();
  const selFis = document.getElementById('fFiscal');
  const atualFis = selFis.value;
  selFis.innerHTML = '<option value="">Todos</option>' +
    fiscaisSet.map(f => `<option value="${f}">${f}</option>`).join('');
  selFis.value = atualFis;
}

function getFiltros() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    status:      g('fStatus'),
    tipo:        g('fTipo'),
    empreiteira: g('fEmpreiteira'),
    fiscal:      g('fFiscal'),
    cidade:      g('fCidade'),
    pendencia:   g('fPendencia'),
    aberturaIni: g('fAberturaIni'),
    aberturaFim: g('fAberturaFim'),
    limiteIni:   g('fLimiteIni'),
    limiteFim:   g('fLimiteFim'),
    diasVencer:  g('fDiasVencer'),
    armazenado:  g('fArmazenado'),
    srch:        g('srch').toLowerCase(),
  };
}

function aplicarFiltros(list) {
  const f = getFiltros();
  const h = hoje();
  return list.filter(o => {
    // _filtroRapidoAtivo is applied in renderObras before calling aplicarFiltros
    if (f.srch) {
      const t = f.srch;
      const found =
        (o.numero||'').toLowerCase().includes(t) ||
        (o.descricao||'').toLowerCase().includes(t) ||
        (o.cidade||'').toLowerCase().includes(t) ||
        (o.empreiteira||'').toLowerCase().includes(t) ||
        (o.fiscal||'').toLowerCase().includes(t) ||
        (o.programa||'').toLowerCase().includes(t) ||
        (o.enquadramento||'').toLowerCase().includes(t) ||
        (o.locaisTrabalho||[]).some(l=>(l.descricao||'').toLowerCase().includes(t));
      if(!found) return false;
    } // busca por número, descrição, cidade, empreiteira, fiscal, programa
    if (f.status && statusOf(o) !== f.status) return false;
    if (f.tipo && o.tipo !== f.tipo) return false;
    if (f.empreiteira && o.empreiteira !== f.empreiteira) return false;
    if (f.fiscal && o.fiscal !== f.fiscal) return false;
    if (f.cidade && o.cidade !== f.cidade) return false;
    if (f.pendencia === 'com' && !(o.pendencia && !o.pendenciaResolvida)) return false;
    if (f.pendencia === 'resolvida' && !(o.pendencia && o.pendenciaResolvida)) return false;
    if (f.pendencia === 'sem' && o.pendencia) return false;
    if (f.aberturaIni && o.dataAbertura && o.dataAbertura < f.aberturaIni) return false;
    if (f.aberturaFim && o.dataAbertura && o.dataAbertura > f.aberturaFim) return false;
    if (f.limiteIni && o.dataLimite && o.dataLimite < f.limiteIni) return false;
    if (f.limiteFim && o.dataLimite && o.dataLimite > f.limiteFim) return false;
    if (f.diasVencer && o.dataLimite && !o.conclusao) {
      const dias = diasRestantes(o.dataLimite);
      if (f.diasVencer === 'vencida' && dias >= 0) return false;
      if (f.diasVencer !== 'vencida' && dias > parseInt(f.diasVencer)) return false;
    } else if (f.diasVencer) return false;
    if (f.armazenado === 'sim' && !o.armazenado) return false;
    if (f.armazenado === 'nao' && o.armazenado) return false;
    return true;
  });
}

function contarFiltrosAtivos() {
  const f = getFiltros();
  return [f.status,f.tipo,f.empreiteira,f.fiscal,f.cidade,f.pendencia,
          f.aberturaIni,f.aberturaFim,f.limiteIni,f.limiteFim,f.diasVencer,f.armazenado]
    .filter(Boolean).length;
}

window.filtroRapido=function(tipo){
  ['fStatus','fTipo','fEmpreiteira','fFiscal','fCidade','fPendencia',
   'fAberturaIni','fAberturaFim','fLimiteIni','fLimiteFim','fDiasVencer','fArmazenado','srch']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  _filtroRapidoAtivo=tipo;
  const btnBulk=document.getElementById('btnBulkDelete');
  if(btnBulk) btnBulk.style.display=(tipo==='encerradas'&&me&&me.perfil==='gerente')?'inline-flex':'none';
  const btnLimpar=document.getElementById('btnLimparFiltros');
  if(btnLimpar) btnLimpar.style.display=tipo?'inline-flex':'none';
  const resumo=document.getElementById('filtrosResumo');
  const labels={'sem_medida70':'Sem Medida 70','sem_medida230':'Sem Medida 230','med230_sem280':'Med.230 sem 280','encerradas':'Encerradas completas','proc_cancelamento':'Processo de Cancelamento'};
  if(resumo) resumo.textContent=tipo?'Filtro rápido: '+(labels[tipo]||tipo):'';
  renderObras();
};

window.limparFiltros = function() {
  ['fStatus','fTipo','fEmpreiteira','fFiscal','fCidade','fPendencia',
   'fAberturaIni','fAberturaFim','fLimiteIni','fLimiteFim','fDiasVencer','fArmazenado','srch']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  _filtroRapidoAtivo = null;
  const btnBulk=document.getElementById('btnBulkDelete'); if(btnBulk) btnBulk.style.display='none';
  const btnLimpar=document.getElementById('btnLimparFiltros');
  if(btnLimpar) btnLimpar.style.display = 'none';
  renderObras();
};

// Exportar somente o que está filtrado
window.exportCSVFiltrado = function() {
  const list = aplicarFiltros(visibleObras());
  const rows = [['Status','Nº','Tipo','Cidade','Empreiteira','Fiscal','Abertura','Prazo','Data Limite',
    'Conclusão','Fiscalização','Pendência','Kaffa','Cadastro','Medição','USC','ULV','Medida 70','Medida 230','Medida 280','Armazenado']];
  list.forEach(o => rows.push([
    statusOf(o),o.numero,o.tipo,o.cidade,o.empreiteira,o.fiscal,
    o.dataAbertura,o.prazoExecucao,o.dataLimite,o.conclusao,o.fiscalizacao,
    o.pendencia?(o.tipoPendencia||'Sim'):'Não',o.kaffa,o.dataCadastro,o.medicao,
    o.descricao||'',o.equipamentoRef||'',o.usc,o.ulv,o.medida70,o.medida230,o.medida280,o.armazenado?'Sim':'Não'
  ]));
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF'+rows.map(r=>r.map(v=>v??'').join(';')).join('\n'));
  a.download = 'obras_filtradas.csv'; a.click();
  toast(`${list.length} obras exportadas!`);
};

// renderObras is now consolidated — see function above



// ══ SISTEMA DE OPERAÇÕES EM LOTE (UNIFICADO) ═══════════════════════
window._bulkMode = null; // 'medidas'|'fisc'|'medicao'|'kaffa'|'conclusao'
window._bulkMedidasMode = false; // legado — mantido para compatibilidade

const BULK_CONFIG = {
  medidas:  { titulo:'📐 Medidas em Lote',          campos:'bulkCamposMedidas', perfis:['gerente','fiscal','fiscal_adm'] },
  fisc:     { titulo:'🔍 Fiscalização em Lote',     campos:null,                perfis:['gerente','fiscal','fiscal_adm'] },
  medicao:  { titulo:'📏 Medição em Lote',           campos:null,                perfis:['gerente','fiscal','fiscal_adm'] },
  cadastro: { titulo:'📋 Envio ao Cadastro em Lote',campos:null,                perfis:['gerente','fiscal','fiscal_adm'] },
  confcad:  { titulo:'✅ Confirmar Cadastro em Lote',campos:null,               perfis:['gerente','genesis'] },
  conclusao:{ titulo:'✓ Conclusão em Lote',          campos:null,               perfis:['empreiteira'] },
};

window.abrirBulk = function(modo){
  if(window._bulkMode === modo){ fecharBulk(); return; } // toggle
  window._bulkMode = modo;
  window._bulkMedidasMode = (modo==='medidas'); // legado
  const cfg = BULK_CONFIG[modo];
  // Esconde todos os campos específicos
  ['bulkCamposMedidas','bulkCamposKaffa'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  // Mostra campos do modo
  if(cfg.campos){ const el=document.getElementById(cfg.campos); if(el) el.style.display='flex'; }
  document.getElementById('bulkBarTitulo').textContent = cfg.titulo;
  document.getElementById('bulkBar').style.display = 'block';
  document.getElementById('bulkData').value = '';
  document.getElementById('bulkCount').textContent = '0 obras selecionadas';
  window.renderObras();
};

function fecharBulk(){
  window._bulkMode = null;
  window._bulkMedidasMode = false;
  document.getElementById('bulkBar').style.display = 'none';
  window.renderObras();
}
window.fecharBulk = fecharBulk;
window.abrirBulkMedidas = ()=>window.abrirBulk('medidas'); // legado
window.fecharBulkMedidas = fecharBulk; // legado

function bulkSelecionadas(){ return [...document.querySelectorAll('.chk-obra:checked')].map(el=>el.dataset.id); }

window.confirmarBulk = async function(){
  const modo = window._bulkMode;
  if(!modo){ toast('Nenhum modo de lote ativo.','err'); return; }
  const ids = bulkSelecionadas();
  if(!ids.length){ toast('Selecione pelo menos uma obra.','err'); return; }
  const data = document.getElementById('bulkData').value;
  if(!data){ toast('Informe a data.','err'); return; }
  if(data > hojeStr()){ toast('Data não pode ser futura.','err'); return; }

  let count=0, erros=0;

  for(const id of ids){
    const obra = obras.find(o=>o.id===id);
    const patch = {atualizadaEm:serverTimestamp()};
    try{
      if(modo==='medidas'){
        const tipos=[...document.querySelectorAll('.chk-med-tipo:checked')].map(el=>el.value);
        if(!tipos.length){ toast('Selecione pelo menos um tipo de medida.','err'); return; }
        if(tipos.includes('70'))  patch.medida70=data;
        if(tipos.includes('230')) patch.medida230=data;
        if(tipos.includes('280')) patch.medida280=data;
      }
      else if(modo==='fisc'){
        patch.fiscalizacao=data;
        patch.cienFisc=true; // fiscal já está ciente
      }
      else if(modo==='medicao'){
        patch.medicao=data;
      }
      else if(modo==='cadastro'){
        patch.dataCadastro=data;
      }
      else if(modo==='confcad'){
        patch.dataCadastro=obraAntiga?.dataCadastro||data;
        patch.cadastroConfirmado=true;
      }
      else if(modo==='conclusao'){
        patch.conclusao=data;
        patch.cienFisc=false;
        if(obra) await enviarEmailConclusao({...obra,...patch});
      }
      await updateDoc(doc(db,'obras',id),patch);
      count++;
    }catch(e){ console.error('[Bulk]',modo,id,e.message); erros++; }
  }

  toast(erros?`${count} atualizada(s), ${erros} com erro.`:`✓ ${count} obras atualizadas!`,(erros?'err':''));
  fecharBulk();
};

// Legado
window.confirmarBulkMedidas = ()=>window.confirmarBulk();


// ══════════════════════════════════════════════════════════════════════
//  BASE DE EQUIPAMENTOS — carrega do Excel, persiste em localStorage
// ══════════════════════════════════════════════════════════════════════
window._equipDB = new Map(); // Map<NR_EQUIPAMENTO, {ant,feed,lat,lon,mun,sg,sub,ch}>

// Chaves de manobra manual (podem ser abertas para desligar um trecho)
// CE=chave c/ elo, RE=religador, SE=seccionalizador, CP=chave pedestal, BC/BR=chaves
const MANUAL_SWITCH = new Set(['CE','SE','CP','BC','BR']); // apenas chaves de campo operáveis manualmente
// RE (religador) é SOMENTE o limite do trecho — nunca usado como ponto de agrupamento
const SWITCH_SG = MANUAL_SWITCH; // compatibilidade

function parseCoord(s){
  if(!s) return null;
  const n = parseFloat(String(s).replace(/^'/,'').replace(',','.'));
  return isNaN(n)?null:n;
}

function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,toR=Math.PI/180;
  const dLat=(lat2-lat1)*toR, dLon=(lon2-lon1)*toR;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Constrói a cadeia de chaves de manobra manual subindo a árvore
// Retorna array [{nr, sg, feed}] do mais próximo ao mais distante
// Para quando encontra RE (religador) — ele é o limite do trecho
function findSwitchChain(nrEquip, maxDepth=40){
  // Cadeia de TODOS os ancestrais do equipamento de referência, em ordem de proximidade.
  // Nível 1 = pai direto (NR_EQPTO_ANTERIOR), Nível 2 = avô, Nível 3 = bisavô...
  // Para ao encontrar um RE (religador) — ele NÃO entra na cadeia.
  // Não filtra por tipo: qualquer ponto upstream é um potencial ponto de desligamento.
  const chain = [];
  const start = window._equipDB.get(parseInt(nrEquip));
  if(!start || !start.ant) return chain;

  let curr = start.ant; // começa pelo pai direto
  const visited = new Set();

  while(curr && chain.length < maxDepth && !visited.has(curr)){
    visited.add(curr);
    const eq = window._equipDB.get(curr);
    if(!eq) break;
    if(eq.sg === 'RE') break; // limite do trecho — para antes de incluir o RE
    chain.push({ nr: curr, sg: eq.sg, feed: eq.feed, mun: eq.mun });
    if(!eq.ant) break;
    curr = eq.ant;
  }
  return chain;
  // Exemplo para 10533: [{81094,FR}, {1922,CD}, {1921,CD}, {41002,AL}, {41000,SE}]
}

// buildPath mantido para compatibilidade com busca de proximidade
function buildPath(nrEquip, maxDepth=40){
  const path=[];
  let curr=parseInt(nrEquip), depth=0;
  const visited=new Set();
  while(curr && depth<maxDepth && !visited.has(curr)){
    path.push(curr);
    visited.add(curr);
    const eq=window._equipDB.get(curr);
    if(!eq||!eq.ant) break;
    curr=eq.ant;
    depth++;
  }
  return path;
}

function findLCA(path1, path2){
  const set1=new Set(path1);
  for(const node of path2) if(set1.has(node)) return node;
  return null;
}

function findChave(nrEquip){
  const chain = findSwitchChain(nrEquip, 1);
  return chain.length > 0 ? chain[0].nr : (window._equipDB.get(parseInt(nrEquip))?.feed||null);
}

// Carrega localStorage ao iniciar
function loadEquipDBFromStorage(){
  try{
    const raw=localStorage.getItem('sppc_equipdb');
    if(!raw) return;
    const data=JSON.parse(raw);
    window._equipDB=new Map(Object.entries(data).map(([k,v])=>[parseInt(k),v]));
    const meta=JSON.parse(localStorage.getItem('sppc_equipdb_meta')||'{}');
    console.log('[EquipDB] Loaded from localStorage:',window._equipDB.size,'rows. Updated:',meta.date||'?');
    updateEquipDBStatus();
  }catch(e){ console.warn('[EquipDB] localStorage load failed:',e.message); }
}

function updateEquipDBStatus(){
  const meta=JSON.parse(localStorage.getItem('sppc_equipdb_meta')||'{}');
  const el=document.getElementById('equipDBStatus');
  if(el) el.textContent=window._equipDB.size>0
    ?`Base carregada: ${window._equipDB.size.toLocaleString('pt-BR')} equipamentos (ref: ${meta.date||'?'})`
    :'⚠️ Base não carregada — faça upload do arquivo de equipamentos';
}

window.uploadEquipDB=function(){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.xlsx,.xls';
  inp.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const btn=document.getElementById('btnEquipDB');
    if(btn){ btn.disabled=true; btn.textContent='Carregando…'; }
    try{
      const XLSX=window.XLSX; if(!XLSX){ toast('Biblioteca Excel não disponível','err'); return; }
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1});
      const hdr=rows[0];
      const ci=name=>hdr.findIndex(h=>String(h||'').toUpperCase().includes(name.toUpperCase()));
      const iEq=ci('NR_EQUIPAMENTO'), iAnt=ci('NR_EQPTO_ANTERIOR'), iFeed=ci('NR_ALIMENTADOR');
      const iLat=ci('VL_LAT'), iLon=ci('VL_LON'), iMun=ci('NM_MUNICIPIO');
      const iSg=ci('SG_EQUIPAMENTO'), iSub=ci('SG_SUBESTACAO'), iCh=ci('TP_CHAVE');
      const db={};
      for(let r=1;r<rows.length;r++){
        const row=rows[r];
        const nr=parseInt(row[iEq]); if(!nr) continue;
        db[nr]={
          ant:parseInt(row[iAnt])||null,
          feed:parseInt(row[iFeed])||null,
          lat:parseCoord(row[iLat]),
          lon:parseCoord(row[iLon]),
          mun:row[iMun]||null,
          sg:row[iSg]||null,
          sub:row[iSub]||null,
          ch:row[iCh]||null,
        };
      }
      window._equipDB=new Map(Object.entries(db).map(([k,v])=>[parseInt(k),v]));
      localStorage.setItem('sppc_equipdb',JSON.stringify(db));
      const meta={date:new Date().toLocaleDateString('pt-BR'),size:window._equipDB.size};
      localStorage.setItem('sppc_equipdb_meta',JSON.stringify(meta));
      toast(`✓ Base carregada: ${window._equipDB.size.toLocaleString('pt-BR')} equipamentos!`);
      updateEquipDBStatus();
    }catch(err){ toast('Erro ao processar: '+err.message,'err'); console.error(err); }
    finally{ if(btn){ btn.disabled=false; btn.textContent='📡 Base Equipamentos'; } }
  };
  inp.click();
};


// ══ TEMA CLARO / ESCURO ════════════════════════════════════════════
window.toggleTema = function(){
  const light = document.body.classList.toggle('light-theme');
  localStorage.setItem('sppc_tema', light ? 'light' : 'dark');
  document.getElementById('btnTema').textContent = light ? '☀️' : '🌙';
};

function aplicarTemaSalvo(){
  const tema = localStorage.getItem('sppc_tema') || 'dark';
  if(tema === 'light'){
    document.body.classList.add('light-theme');
    const btn = document.getElementById('btnTema');
    if(btn) btn.textContent = '☀️';
  }
}


window.toggleRetirado = function(){
  const chk = document.getElementById('oTemRetirado');
  document.getElementById('secRetirado').style.display = chk?.checked ? 'block' : 'none';
};

// ══ CIENTE — Fiscal marca como "visto" em cada fila do dashboard ════
// tipos: 'fisc' (aguardando fiscalização), 'med' (aguardando medição), 'med280'
window.marcarCiente = async function(obraId, tipo){
  try{
    const campo = {fisc:'cienFisc', med:'cienMed', med280:'cienMed280'}[tipo];
    if(!campo) return;
    await updateDoc(doc(db,'obras',obraId), {[campo]: true, atualizadaEm: serverTimestamp()});
    toast('✓ Ciente registrado.','ok');
    renderDash(); // atualiza dashboard
  }catch(e){
    console.error('[Ciente]', e.message);
    toast('Erro ao registrar ciente.','err');
  }
};


// ══ PENDÊNCIA — DEVOLUÇÃO PELO FISCAL ══════════════════════════════
// Exibe a opção de devolução somente quando a empreiteira já regularizou
window.togglePendNaoResolvida = function(){
  const chk = document.getElementById('oPendenciaNaoResolvida');
  if(chk?.checked){
    // Desmarcar "pendência resolvida" se marcou devolução
    const res = document.getElementById('oPendenciaResolvida');
    if(res) res.checked = false;
  }
};

// Mostra botão de devolução quando empreiteira já regularizou
function atualizarVisibilidadeDevoPend(obra){
  const row = document.getElementById('rowDevolvePend');
  if(!row) return;
  const podeDevolver = (me.perfil==='fiscal'||me.perfil==='fiscal_adm'||me.perfil==='gerente')
    && !!obra?.regularizacaoData && !obra?.pendenciaResolvida && !!obra?.pendencia;
  row.style.display = podeDevolver ? 'flex' : 'none';
  if(podeDevolver) console.log('[Pend] Mostrando botão de devolução. regularizacaoData=', obra.regularizacaoData);
}


// ══ EQUIPAMENTOS DO KAFFA — múltiplos instalados e retirados ════════
let _equipInstalados = [];   // [{id,placas,potencia,sap,serie,fabricante,dataTransf}]
let _equipRetirados  = [];   // [{id,potencia,sap,serie,fabricante,dataTransf}]

window.adicionarEquipInstalado = function(){
  const id = `ei_${Date.now()}`;
  _equipInstalados.push({id,placas:'',potencia:'',sap:'',serie:'',fabricante:'',dataTransf:''});
  renderEquipInstalados();
};
window.adicionarEquipRetirado = function(){
  const id = `er_${Date.now()}`;
  _equipRetirados.push({id,potencia:'',sap:'',serie:'',fabricante:'',dataTransf:''});
  renderEquipRetirados();
};
window.removerEquipInstalado = function(id){
  _equipInstalados = _equipInstalados.filter(e=>e.id!==id);
  renderEquipInstalados();
};
window.removerEquipRetirado = function(id){
  _equipRetirados = _equipRetirados.filter(e=>e.id!==id);
  renderEquipRetirados();
};
window.toggleEquipItem = function(id){
  const body = document.getElementById('body_'+id);
  const icon = document.getElementById('icon_'+id);
  if(!body) return;
  const isOpen = body.style.display!=='none';
  body.style.display = isOpen ? 'none' : 'block';
  if(icon) icon.textContent = isOpen ? '▶' : '▼';
};

function renderEquipInstalados(){
  const cont = document.getElementById('listaEquipInstalados'); if(!cont) return;
  if(!_equipInstalados.length){ cont.innerHTML='<div style="font-size:10px;color:var(--muted)">Nenhum equipamento instalado adicionado.</div>'; return; }
  cont.innerHTML = _equipInstalados.map((e,i)=>`
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);cursor:pointer" onclick="toggleEquipItem('ins${e.id}')">
        <span id="icon_ins${e.id}" style="font-size:10px">▼</span>
        <span style="font-size:11px;font-weight:700">Transformador Instalado #${i+1}</span>
        <button onclick="event.stopPropagation();removerEquipInstalado('${e.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:auto;font-size:11px">✕</button>
      </div>
      <div id="body_ins${e.id}" style="padding:10px">
        <div class="fg-grid">
          <div class="fg"><label style="font-size:9px">Placas Instaladas</label><input type="text" id="ins_placas_${e.id}" value="${e.placas}" placeholder="Quantidade" onchange="syncEquip('ins','${e.id}','placas',this.value)"></div>
          <div class="fg"><label style="font-size:9px">Potência (kVA)</label><input type="number" id="ins_pot_${e.id}" value="${e.potencia}" placeholder="Ex: 30" onchange="syncEquip('ins','${e.id}','potencia',this.value)"></div>
        </div>
        <div class="fg-grid">
          <div class="fg"><label style="font-size:9px">Nº SAP</label><input type="text" id="ins_sap_${e.id}" value="${e.sap}" placeholder="Nº SAP" onchange="syncEquip('ins','${e.id}','sap',this.value)"></div>
          <div class="fg"><label style="font-size:9px">Nº Série</label><input type="text" id="ins_serie_${e.id}" value="${e.serie}" placeholder="Nº Série" onchange="syncEquip('ins','${e.id}','serie',this.value)"></div>
        </div>
        <div class="fg-grid">
          <div class="fg"><label style="font-size:9px">Fabricante</label><input type="text" id="ins_fab_${e.id}" value="${e.fabricante}" placeholder="Fabricante" onchange="syncEquip('ins','${e.id}','fabricante',this.value)"></div>
          <div class="fg"><label style="font-size:9px">Data Transformador</label><input type="text" id="ins_dat_${e.id}" value="${e.dataTransf}" placeholder="Ex: 01/2024" onchange="syncEquip('ins','${e.id}','dataTransf',this.value)"></div>
        </div>
      </div>
    </div>`).join('');
}

function renderEquipRetirados(){
  const cont = document.getElementById('listaEquipRetirados'); if(!cont) return;
  if(!_equipRetirados.length){ cont.innerHTML='<div style="font-size:10px;color:var(--muted)">Nenhum equipamento retirado adicionado.</div>'; return; }
  cont.innerHTML = _equipRetirados.map((e,i)=>`
    <div style="border:1px solid rgba(239,68,68,.3);border-radius:6px;margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(239,68,68,.06);cursor:pointer" onclick="toggleEquipItem('ret${e.id}')">
        <span id="icon_ret${e.id}" style="font-size:10px">▼</span>
        <span style="font-size:11px;font-weight:700;color:#EF4444">Transformador Retirado #${i+1}</span>
        <button onclick="event.stopPropagation();removerEquipRetirado('${e.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;margin-left:auto;font-size:11px">✕</button>
      </div>
      <div id="body_ret${e.id}" style="padding:10px">
        <div class="fg-grid">
          <div class="fg"><label style="font-size:9px">Potência (kVA)</label><input type="number" id="ret_pot_${e.id}" value="${e.potencia}" placeholder="Ex: 15" onchange="syncEquip('ret','${e.id}','potencia',this.value)"></div>
          <div class="fg"><label style="font-size:9px">Nº SAP</label><input type="text" id="ret_sap_${e.id}" value="${e.sap}" placeholder="Nº SAP" onchange="syncEquip('ret','${e.id}','sap',this.value)"></div>
        </div>
        <div class="fg-grid">
          <div class="fg"><label style="font-size:9px">Nº Série</label><input type="text" id="ret_serie_${e.id}" value="${e.serie}" placeholder="Nº Série" onchange="syncEquip('ret','${e.id}','serie',this.value)"></div>
          <div class="fg"><label style="font-size:9px">Fabricante</label><input type="text" id="ret_fab_${e.id}" value="${e.fabricante}" placeholder="Fabricante" onchange="syncEquip('ret','${e.id}','fabricante',this.value)"></div>
        </div>
        <div class="fg"><label style="font-size:9px">Data Transformador</label><input type="text" id="ret_dat_${e.id}" value="${e.dataTransf}" placeholder="Ex: 01/2024" onchange="syncEquip('ret','${e.id}','dataTransf',this.value)"></div>
      </div>
    </div>`).join('');
}

window.syncEquip = function(tipo, id, campo, valor){
  const arr = tipo==='ins'?_equipInstalados:_equipRetirados;
  const item = arr.find(e=>e.id===id);
  if(item) item[campo]=valor;
};

function initEquipFromObra(obra){
  _equipInstalados = obra?.equipamentosInstalados?.length ? [...obra.equipamentosInstalados] : [];
  _equipRetirados  = obra?.equipamentosRetirados?.length  ? [...obra.equipamentosRetirados]  : [];
  // Se obra tem os campos antigos (único equip), migra para array
  if(!_equipInstalados.length && (obra?.sap||obra?.potencia)){
    _equipInstalados = [{id:'ei_legacy',placas:obra.placas||'',potencia:obra.potencia||'',sap:obra.sap||'',serie:obra.serie||'',fabricante:obra.fabricante||'',dataTransf:obra.dataTransf||''}];
  }
  if(!_equipRetirados.length && (obra?.sapRet||obra?.potenciaRet)){
    _equipRetirados = [{id:'er_legacy',potencia:obra.potenciaRet||'',sap:obra.sapRet||'',serie:obra.serieRet||'',fabricante:obra.fabricanteRet||'',dataTransf:''}];
  }
  renderEquipInstalados();
  renderEquipRetirados();
}


window._salvarFiltroPrograma = function(){
  const progs = ['PODI','Mono-Tri','Regulatório','Melhoria'];
  const f = {};
  progs.forEach(prog=>{
    const el = document.getElementById('filtProg_'+prog);
    f[prog] = el ? el.checked : true;
  });
  const semEl = document.getElementById('filtProg__semProg');
  f['_semProg'] = semEl ? semEl.checked : true;
  localStorage.setItem('analise_prog_filtro', JSON.stringify(f));
  renderAnaliseFinanceira();
};

// ══ MIGRAÇÃO: seta programa=Regulatório em todas as obras R1 sem programa ════
async function migrarProgramaR1(){
  if(localStorage.getItem('sppc_migr_prog_r1')) return; // já rodou
  if(window._migrando) return; // re-entry guard
  if(me.perfil !== 'gerente') return;
  const semProg = obras.filter(o=>o.tipo==='R1' && !o.programa);
  if(!semProg.length){
    localStorage.setItem('sppc_migr_prog_r1','1');
    return;
  }
  // Seta flag e lock ANTES do loop para evitar re-entrada via onSnapshot
  window._migrando = true;
  localStorage.setItem('sppc_migr_prog_r1','1');
  console.log('[Migração] Atualizando', semProg.length, 'obras R1 → Regulatório (em lote)');
  try{
    // Atualizar em lote: máx 10 por vez para não sobrecarregar
    for(let i=0;i<semProg.length;i+=10){
      const lote = semProg.slice(i,i+10);
      await Promise.all(lote.map(o=>updateDoc(doc(db,'obras',o.id),{
        programa:'Regulatório', atualizadaEm:serverTimestamp()
      })));
    }
    toast(`✓ ${semProg.length} obras R1 atualizadas para Regulatório.`, 'ok');
  }catch(e){
    console.warn('[Migração] erro:', e.message);
  }finally{
    window._migrando = false;
  }
}


// Verifica se obra tem medição FINAL registrada
function temMedicaoFinal(o){
  return !!(o.medicoes||[]).some(m=>m.tipo==='final');
}

// ── USC Média por Programa por Empreiteira — inserido em renderCarteira ──
function renderUSCMediaPorPrograma(pool){
  const EMPS = ['CS ELETRICIDADE','ELETELSUL'];
  const PROGS = ['Regulatório','PODI','Mono-Tri','Melhoria'];
  const CORS = {Regulatório:'#22C55E',PODI:'#7c6af7','Mono-Tri':'#F59E0B',Melhoria:'#3B82F6'};

  const rows = EMPS.map(emp=>{
    // Somente obras EM EXECUÇÃO (sem conclusão informada)
    const obEmp = pool.filter(o=>o.empreiteira===emp&&!o.cancelado&&!o.conclusao&&(o.tipo==='R1'||o.tipo==='R2'));
    const cols = PROGS.map(prog=>{
      const obProg = obEmp.filter(o=>o.programa===prog);
      if(!obProg.length) return `<td style="padding:6px 10px;text-align:center;color:var(--muted)">—</td>`;
      const totalUSC = obProg.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
      const media = totalUSC/obProg.length;
      return `<td style="padding:6px 10px;text-align:center">
        <div style="font-weight:700;color:${CORS[prog]}">${media.toFixed(1)}</div>
        <div style="font-size:9px;color:var(--muted)">${obProg.length} obras</div>
      </td>`;
    }).join('');
    const totUSC = obEmp.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const mediaGeral = obEmp.length>0 ? (totUSC/obEmp.length).toFixed(1) : '—';
    return `<tr>
      <td style="padding:6px 10px;font-weight:700">${emp}</td>
      ${cols}
      <td style="padding:6px 10px;text-align:center;font-weight:700">${mediaGeral} <span style="font-size:9px;color:var(--muted)">(${obEmp.length}ob)</span></td>
    </tr>`;
  }).join('');

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:20px">
      <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;margin-bottom:12px">📊 USC Média por Obra — por Empreiteira e Programa</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:7px 10px;text-align:left">Empreiteira</th>
            ${PROGS.map(p=>`<th style="padding:7px 10px;text-align:center;color:${CORS[p]}">${p}</th>`).join('')}
            <th style="padding:7px 10px;text-align:center">Geral</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}


function renderCarteiraFutura(){
  const cont=document.getElementById('pgCarteiraFuturaContent');
  if(!cont) return;
  cont.innerHTML=`
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">📅 Carteira de Obras Futura</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">📊</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">Em desenvolvimento</div>
      <div style="font-size:12px;color:var(--muted)">Aguardando base de dados do cliente para otimizar a abertura de obras futuras.</div>
    </div>`;
}
window.renderCarteiraFutura = renderCarteiraFutura;

// ══ EXPORTAR EXCEL ════════════════════════════════════
const XLSX_EXPORT_HEADERS=['Status','Nº','Tipo','Cidade','Empreiteira','Fiscal','Abertura','Prazo','Data Limite',
  'Conclusão','Fiscalização','Kaffa (último)','Tipo Kaffa','Medição','Tipo Med.','USC','ULV',
  'USC Pendente','ULV Pendente','Med.70','Dias p/70','Med.230','Dias p/230','Med.280','Armazenado',
  'Cadastro Confirmado','Paralisada','Cancelada'];

function obraParaLinha(o){
  const d70=diasParaMedida(o,'med70'), d230=diasParaMedida(o,'med230');
  const statusDias=d=>d===null?'OK':d<0?'VENCIDA HÁ '+Math.abs(d)+'d':d<=5?'CRÍTICO '+d+'d':d<=15?'ATENÇÃO '+d+'d':'OK '+d+'d';
  const ultimoKaffa=(o.kaffaEntries||[]).slice(-1)[0];
  // Datas em DD/MM/YYYY para o Excel
  const xd=s=>fmtTxt(s)||'';
  return [
    statusOf(o),o.numero,o.tipo,o.cidade,o.empreiteira,o.fiscal,xd(o.dataAbertura),o.prazoExecucao,xd(o.dataLimite),
    xd(o.conclusao),xd(o.fiscalizacao),
    xd(ultimoKaffa?.data||o.kaffa||''), ultimoKaffa?.tipo||'',
    xd(o.medicao||((o.medicoes||[]).slice(-1)[0]?.data)||''),
    tipoMedicao(o)||'',
    o.usc,o.ulv,calcUSCPendente(o).toFixed(1),calcULVPendente(o).toFixed(1),
    xd(o.medida70),statusDias(d70),xd(o.medida230),statusDias(d230),xd(o.medida280),
    o.armazenado?'Sim':'Não',o.cadastroConfirmado?'Sim':'Não',
    o.paralisada?'Sim':'Não',o.cancelado?'Sim':'Não'
  ];
}

function exportCSVFallback(list, filename){
  toast('Exportando como CSV...','warn');
  const rows=[XLSX_EXPORT_HEADERS,...list.map(obraParaLinha)];
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF'+rows.map(r=>r.map(v=>v??'').join(';')).join('\n'));
  a.download=filename; a.click();
  toast(`${list.length} obras exportadas!`);
}

function gerarXLSX(list, filename){
  const XLSXLib = window.XLSX;
  if(!XLSXLib){
    exportCSVFallback(list, filename.replace('.xlsx','.csv'));
    return;
  }
  try{
    const rows=[XLSX_EXPORT_HEADERS,...list.map(obraParaLinha)];
    const ws=XLSXLib.utils.aoa_to_sheet(rows);
    ws['!cols']=XLSX_EXPORT_HEADERS.map((_,i)=>{
      const max=rows.reduce((m,r)=>Math.max(m,String(r[i]||'').length),XLSX_EXPORT_HEADERS[i].length);
      return {wch:Math.min(max+2,40)};
    });
    const wb=XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb,ws,'Obras');
    XLSXLib.writeFile(wb,filename);
    toast(`${list.length} obras exportadas!`);
  }catch(e){
    console.error('XLSX error:',e);
    exportCSVFallback(list, filename.replace('.xlsx','.csv'));
  }
}

window.exportXLSX=function(){
  gerarXLSX(visibleObras(),'obras_track.xlsx');
};
window.exportXLSXFiltrado=function(){
  let base=visibleObras();
  if(_filtroRapidoAtivo==='sem_medida70')     base=base.filter(o=>o.conclusao&&!o.medida70);
  else if(_filtroRapidoAtivo==='sem_medida230') base=base.filter(o=>o.conclusao&&!o.medida230);
  else if(_filtroRapidoAtivo==='med230_sem280') base=base.filter(o=>o.medida230&&!o.medida280);
  else if(_filtroRapidoAtivo==='encerradas')          base=base.filter(o=>o.armazenado);
  else if(_filtroRapidoAtivo==='proc_cancelamento')   base=base.filter(o=>o.processoCancelamento&&!o.cancelado);
  gerarXLSX(aplicarFiltros(base),'obras_filtradas.xlsx');
};
window.exportCSV=window.exportXLSX;
window.exportCSVFiltrado=window.exportXLSXFiltrado;

// ══════════════════════════════════════════════════════

// Converte qualquer formato de data → YYYY-MM-DD (formato interno)
function parseDateBR(s){
  if(!s && s !== 0) return '';
  // Excel serial number (ex: 45844 = uma data em 2025)
  const n = typeof s === 'number' ? s : (String(s).trim().match(/^\d{4,5}$/) ? parseInt(s) : null);
  if(n && n > 1000){
    // Epoch do Excel: 30/12/1899 (considera bug do ano bissexto 1900)
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  s = String(s).trim();
  if(!s) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // já correto
  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
}



// ══ EXCLUIR TODAS AS OBRAS ═══════════════════════════════════════════
window.apagarTodasObras = async function(){
  if(me?.perfil !== 'gerente'){ toast('Somente o gerente pode excluir todas as obras.','err'); return; }
  if(!obras.length){ toast('Nenhuma obra para excluir.','warn'); return; }
  // Confirmação dupla com digitação
  const conf1 = confirm(`⚠️ ATENÇÃO\n\nIsso irá excluir PERMANENTEMENTE todas as ${obras.length} obras do sistema.\n\nEsta ação NÃO pode ser desfeita!\n\nClique OK para continuar ou Cancelar para abortar.`);
  if(!conf1) return;
  const digitado = prompt(`Para confirmar, digite exatamente:\n\nAPAGAR TUDO\n`);
  if((digitado||'').trim().toUpperCase() !== 'APAGAR TUDO'){
    toast('Confirmação inválida. Operação cancelada.','warn'); return;
  }
  const total = obras.length;
  toast(`Excluindo ${total} obras...`,'warn');
  let count=0, erros=0;
  for(const o of [...obras]){
    try{ await deleteDoc(doc(db,'obras',o.id)); count++; }
    catch(e){ console.error('Erro ao excluir',o.numero,e.message); erros++; }
  }
  if(erros) toast(`${count} excluídas, ${erros} com erro.`,'warn');
  else toast(`✓ ${count} obras excluídas com sucesso.`,'warn');
};

window.bulkDeleteEncerradas=async function(){
  const list=visibleObras().filter(o=>o.armazenado);
  if(!list.length){ toast('Nenhuma obra encerrada encontrada.','warn'); return; }
  if(!confirm('⚠️ Excluir permanentemente '+list.length+' obras encerradas?\nEsta ação NÃO pode ser desfeita.')) return;
  const btn=document.getElementById('btnBulkDelete');
  if(btn){ btn.disabled=true; btn.textContent='Excluindo…'; }
  let count=0, err=0;
  for(const o of list){
    try{ await deleteDoc(doc(db,'obras',o.id)); count++; }
    catch(e){ console.error('Erro:',o.numero,e.message); err++; }
  }
  if(btn){ btn.disabled=false; btn.textContent='🗑️ Excluir seleção'; btn.style.display='none'; }
  _filtroRapidoAtivo=null;
  toast(err ? count+'excluídas, '+err+' com erro.':'✓ '+count+' obras excluídas.',(err?'warn':'warn'));
};

//  IMPORTAÇÃO EXCEL
// ══════════════════════════════════════════════════════

// Colunas do sistema e seus aliases reconhecidos na planilha
const COLUNAS_SISTEMA = [
  { campo:'numero',        label:'Nº da Obra',         aliases:['numero','nº','obra','número da obra','nro','num'] },
  { campo:'tipo',          label:'Tipo',                aliases:['tipo'] },
  { campo:'descricao',       label:'Descrição',           aliases:['descricao','descrição','desc','description'] },
  { campo:'equipamentoRef',label:'Equip. Referência',   aliases:['equip','equipamento','equipamento ref','equip ref','equipamentoref','nr_equipamento'] },
  { campo:'cidade',        label:'Cidade',              aliases:['cidade','municipio','município','localidade'] },
  { campo:'empreiteira',   label:'Empreiteira',         aliases:['empreiteira','empresa','contratada'] },
  { campo:'fiscal',        label:'Fiscal',              aliases:['fiscal','responsável','responsavel','inspetor'] },
  { campo:'dataAbertura',  tipo:'data', label:'Data Abertura',       aliases:['abertura','data abertura','data_abertura','dt_abertura','dataabertura'] },
  { campo:'prazoExecucao', label:'Prazo (dias)',         aliases:['prazo','prazo execucao','prazo_execucao','dias','prazo de execução'] },
  { campo:'usc',           label:'USC',                  aliases:['usc'] },
  { campo:'ulv',           label:'ULV',                  aliases:['ulv'] },
  { campo:'dataDesligamento', label:'Dt. Desligamento', aliases:['desligamento','data desligamento','dt desligamento'] },
  { campo:'conclusao',     label:'Dt. Conclusão',        aliases:['conclusao','conclusão','data conclusao','data conclusão','dt conclusao'] },
  { campo:'kaffa',         label:'Dt. Kaffa',            aliases:['kaffa','data kaffa','dt kaffa'] },
  { campo:'fiscalizacao',  label:'Dt. Fiscalização',     aliases:['fiscalizacao','fiscalização','data fiscalizacao','dt fiscalizacao'] },
  { campo:'medicao',       label:'Dt. Medição',          aliases:['medicao','medição','data medicao','dt medicao'] },
  { campo:'medida70',      label:'Dt. Medida 70',        aliases:['medida70','medida 70','data medida 70','m70'] },
  { campo:'medida230',     label:'Dt. Medida 230',       aliases:['medida230','medida 230','data medida 230','m230'] },
  { campo:'medida280',     label:'Dt. Medida 280',       aliases:['medida280','medida 280','data medida 280','m280'] },
];

let xlsxDados = [];     // linhas brutas do Excel
let xlsxHeaders = [];   // cabeçalhos detectados
let mapeamento = {};    // campo_sistema -> índice coluna Excel

window.openImportModal = function() {
  xlsxDados = []; xlsxHeaders = []; mapeamento = {};
  document.getElementById('importStep1').style.display = 'block';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';
  document.getElementById('btnImportStep2').style.display = 'none';
  document.getElementById('xlsxInput').value = '';
  document.getElementById('ovImport').classList.add('open');
};
window.closeImportModal = function() { document.getElementById('ovImport').classList.remove('open'); };

// Baixar modelo Excel
window.downloadModelo = function() {
  const wb = (window.XLSX||XLSX).utils.book_new();
  const headers = COLUNAS_SISTEMA.map(c => c.label);
  const exemplo = [
    ['2024-001','R1','Lages','CS ELETRICIDADE','João Silva','2024-01-15','60','10','5','','','','','','','',''],
    ['2024-002','R2','Curitibanos','ELETELSUL','Maria Santos','2024-02-01','45','8','3','','','','','','','',''],
  ];
  const ws = (window.XLSX||XLSX).utils.aoa_to_sheet([headers, ...exemplo]);
  // Larguras das colunas
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  (window.XLSX||XLSX).utils.book_append_sheet(wb, ws, 'Obras');
  (window.XLSX||XLSX).writeFile(wb, 'modelo_obras_track.xlsx');
};

// Converter data do Excel para string YYYY-MM-DD
function excelDateToStr(val) {
  if(val === null || val === undefined || val === '') return '';
  // JS Date object (cellDates:true or pre-parsed)
  if(val instanceof Date){
    if(isNaN(val.getTime())) return '';
    const y=val.getUTCFullYear(),m=String(val.getUTCMonth()+1).padStart(2,'0'),d=String(val.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if(typeof val === 'number') {
    // Número serial do Excel (epoch 30/12/1899)
    const date = new Date(Date.UTC(1899,11,30) + val * 86400000);
    if(isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }
  if(typeof val === 'string') {
    const s = val.trim();
    if(!s) return '';
    // ISO com hora: "2025-07-05T00:00:00.000Z"
    if(s.includes('T')) return s.split('T')[0];
    // YYYY-MM-DD
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY ou DD-MM-YYYY
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if(m){
      const y = m[3].length===2?'20'+m[3]:m[3];
      return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
  }
  return '';
}

window.handleXlsxUpload = function(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5*1024*1024) { toast('Arquivo muito grande (máx. 5MB).','err'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = (window.XLSX||XLSX).read(e.target.result, { type:'array', cellDates:false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = (window.XLSX||XLSX).utils.sheet_to_json(ws, { header:1, defval:'' });
      if (rows.length < 2) { toast('Planilha vazia ou sem dados.','err'); return; }

      xlsxHeaders = rows[0].map(h => String(h||'').trim());
      xlsxDados   = rows.slice(1).filter(r => r.some(c => c !== ''));

      // Auto-mapeamento — normaliza ambos os lados (remove acentos + chars especiais)
      const _norm = s => (s||'').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // remove diacríticos
        .replace(/[^a-z0-9 ]/g,'')                          // remove pontuação/º/%...
        .replace(/\s+/g,' ').trim();
      mapeamento = {};
      COLUNAS_SISTEMA.forEach(col => {
        const candidatos = [col.label, ...col.aliases].map(a => _norm(a));
        const idx = xlsxHeaders.findIndex(h => candidatos.includes(_norm(h)));
        if (idx >= 0) mapeamento[col.campo] = idx;
      });

      renderImportStep2(rows);
    } catch(err) {
      toast('Erro ao ler o arquivo: '+err.message,'err');
    }
  };
  reader.readAsArrayBuffer(file);
};

function renderImportStep2(rows) {
  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = 'block';
  document.getElementById('btnImportStep2').style.display = 'inline-flex';

  document.getElementById('importInfo').textContent =
    `Arquivo lido: ${xlsxDados.length} linha(s) de dados, ${xlsxHeaders.length} coluna(s) detectadas.`;

  // Mapeamento — dropdowns
  const grid = document.getElementById('mappingGrid');
  grid.innerHTML = COLUNAS_SISTEMA.map(col => {
    const atualIdx = mapeamento[col.campo] !== undefined ? mapeamento[col.campo] : -1;
    const options = `<option value="-1">— ignorar —</option>` +
      xlsxHeaders.map((h,i) => `<option value="${i}" ${i===atualIdx?'selected':''}>${h||'(col. '+(i+1)+')'}</option>`).join('');
    return `<div class="fg">
      <label>${col.label}</label>
      <select data-campo="${col.campo}" onchange="atualizarMapeamento(this)">
        ${options}
      </select>
    </div>`;
  }).join('');

  // Prévia
  const preview = document.getElementById('previewTable');
  const previewRows = rows.slice(0, 6); // header + 5 linhas
  // Convert dates in preview (serial numbers → DD/MM/YYYY)
  const _normP = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
  const dateCols = new Set(COLUNAS_SISTEMA.filter(c=>c.tipo==='data').map(c=>mapeamento[c.campo]).filter(i=>i!=null));
  preview.innerHTML =
    `<thead><tr>${xlsxHeaders.map(h=>`<th>${h||'—'}</th>`).join('')}</tr></thead>` +
    `<tbody>${previewRows.slice(1).map(r=>`<tr>${xlsxHeaders.map((_,i)=>{
      const v=r[i]??'';
      if(dateCols.has(i)){
        const converted=excelDateToStr(v);
        if(converted) return `<td style="color:var(--accent)">${fmtTxt(converted)}</td>`;
      }
      return `<td>${v}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
}

window.atualizarMapeamento = function(sel) {
  const campo = sel.dataset.campo;
  const idx   = parseInt(sel.value);
  if (idx === -1) delete mapeamento[campo];
  else mapeamento[campo] = idx;
};

window.confirmarImport = async function() {
  const btn = document.getElementById('btnImportStep2');
  btn.disabled = true; btn.textContent = 'Importando…';

  let importados = 0, erros = [];
  const addDias = (dateStr, dias) => {
    if (!dateStr || !dias) return null;
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + parseInt(dias));
    return d.toISOString().split('T')[0];
  };

  for (let i = 0; i < xlsxDados.length; i++) {
    const row = xlsxDados[i];
    const get = campo => {
      const idx = mapeamento[campo];
      return idx !== undefined ? String(row[idx] ?? '').trim() : '';
    };
    const getDate = campo => excelDateToStr(mapeamento[campo] !== undefined ? row[mapeamento[campo]] : '');

    const numero = get('numero');
    if (!numero) { erros.push(`Linha ${i+2}: sem Nº de obra.`); continue; }

    const dataAbertura   = getDate('dataAbertura');
    const prazoExecucao  = get('prazoExecucao') ? parseInt(get('prazoExecucao')) : null;
    const dataLimite     = (dataAbertura && prazoExecucao) ? addDias(dataAbertura, prazoExecucao) : null;

    try {
      await addDoc(collection(db, 'obras'), {
        numero,
        tipo:            get('tipo')          || '',
        descricao:       get('descricao') || null,
        equipamentoRef:  get('equipamentoRef') ? parseInt(get('equipamentoRef')) || null : null,
        cidade:          get('cidade')        || '',
        empreiteira:     get('empreiteira')   || '',
        fiscal:          get('fiscal')        || '',
        dataAbertura,
        prazoExecucao,
        dataLimite,
        usc:             get('usc') ? parseFloat(get('usc')) : null,
        ulv:             get('ulv') ? parseFloat(get('ulv')) : null,
        dataDesligamento: getDate('dataDesligamento'),
        conclusao:       getDate('conclusao'),
        kaffa:           getDate('kaffa'),
        fiscalizacao:    getDate('fiscalizacao'),
        medicao:         getDate('medicao'),
        medida70:        getDate('medida70'),
        medida230:       getDate('medida230'),
        medida280:       getDate('medida280'),
        criadaEm:        serverTimestamp(),
        criadaPor:       me.uid,
        importada:       true,
      });
      importados++;
    } catch(err) {
      erros.push(`Linha ${i+2} (${numero}): ${err.message}`);
    }
  }

  // Resultado
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'block';
  btn.style.display = 'none';
  document.getElementById('importResultMsg').textContent =
    `${importados} obra(s) importada(s) com sucesso!`;
  document.getElementById('importResultSub').textContent =
    erros.length ? `${erros.length} erro(s): ${erros.slice(0,3).join(' | ')}` : 'Nenhum erro encontrado.';
  toast(`${importados} obras importadas!`);
  btn.disabled = false;
};

// Drag & drop no upload
document.addEventListener('DOMContentLoaded', () => {
  const drop = document.getElementById('uploadDrop');
  if (!drop) return;
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor='var(--accent)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor=''; });
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.style.borderColor='';
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.getElementById('xlsxInput');
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      handleXlsxUpload(input);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
//  CARTEIRA DE OBRAS — Dashboard estratégico (somente Gerente)
// ══════════════════════════════════════════════════════════════════════
function renderCarteira(){
  const cont = document.getElementById('carteiraContent');
  if(!cont) return;
  if(me.perfil !== 'gerente'){ cont.innerHTML='<div class="empty"><p>Acesso restrito ao Gerente.</p></div>'; return; }

  const ativas = obras.filter(o=>!o.cancelado);
  const hoje_s = hojeStr();

  // ── helpers ──────────────────────────────────────────────────────
  const mesStr = s => { if(!s) return null; const [y,m]=s.split('-'); return `${m}/${y}`; };
  const mesOrd  = s => { if(!s) return ''; const [y,m]=s.split('-'); return `${y}${m}`; };
  const ultimosMeses = n => {
    const res=[]; const d=new Date();
    for(let i=n-1;i>=0;i--){
      const dd=new Date(d.getFullYear(), d.getMonth()-i, 1);
      const m=String(dd.getMonth()+1).padStart(2,'0');
      res.push(`${m}/${dd.getFullYear()}`);
    }
    return res;
  };
  const MESES = ultimosMeses(12);
  // Formata número: >= 1000 → "1.5k", inteiro → sem decimal
  // Formata número compacto: 1500 → "1.5k", 15000 → "15k"
  const fmtNum = v => {
    if(!v || v===0) return '0';
    if(v >= 10000) return Math.round(v/1000)+'k';
    if(v >= 1000)  return (v/1000).toFixed(1).replace('.0','')+'k';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  // Gráfico combinado: barra = nº de obras, rótulo duplo (obras + USC) por mês
  const svgBarDuplo = (qtdMap, uscMap, titulo, cor) => {
    const qtds = MESES.map(m => qtdMap[m]||0);
    const uscs = MESES.map(m => uscMap[m]||0);
    const maxQ  = Math.max(...qtds, 1);
    const totQ  = qtds.reduce((a,b)=>a+b, 0);
    const totU  = uscs.reduce((a,b)=>a+b, 0);

    const w=54, h=100, topPad=32, botPad=44, colW=w+10;
    const pad=8, totalW = pad + MESES.length*colW + pad;
    const svgH = topPad + h + botPad;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${svgH}"
      style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;

    // Linha de base
    svg += `<line x1="${pad}" y1="${topPad+h}" x2="${totalW-pad}" y2="${topPad+h}"
      stroke="#374151" stroke-width="1"/>`;

    qtds.forEach((q, i) => {
      const x  = pad + i * colW;
      const cx = x + w/2;
      const usc = uscs[i];

      // —— barra ——
      const bh   = q > 0 ? Math.max(8, Math.round((q/maxQ)*h)) : 0;
      const barY = topPad + h - bh;
      if(bh > 0) {
        svg += `<rect x="${x}" y="${barY}" width="${w}" height="${bh}" rx="5"
          fill="${cor}" opacity="0.82"/>`;
        // gradiente de brilho no topo da barra
        svg += `<rect x="${x}" y="${barY}" width="${w}" height="${Math.min(bh,8)}" rx="5"
          fill="white" opacity="0.12"/>`;
      }

      // —— rótulo QTD acima da barra (sempre visível) ——
      const lblQ = q > 0 ? `${q} obra${q!==1?'s':''}` : '—';
      const lblY = barY - 6;
      // fundo pill
      const pillW = Math.max(lblQ.length*6.5+10, 44);
      svg += `<rect x="${cx-pillW/2}" y="${lblY-14}" width="${pillW}" height="16" rx="8"
        fill="${q>0?cor:'#374151'}" opacity="${q>0?'0.22':'0.15'}"/>`;
      svg += `<text x="${cx}" y="${lblY}" text-anchor="middle"
        font-size="${q>0?10:9}" font-weight="800"
        fill="${q>0?cor:'#6b7280'}">${lblQ}</text>`;

      // —— linha de USC abaixo do rótulo QTD ——
      if(q > 0 && usc > 0) {
        const uscLbl = fmtNum(usc)+' USC';
        svg += `<text x="${cx}" y="${lblY-18}" text-anchor="middle"
          font-size="9" font-weight="600" fill="${cor}cc">${uscLbl}</text>`;
      }

      // —— mês no eixo X ——
      svg += `<text x="${cx}" y="${topPad+h+14}" text-anchor="middle"
        font-size="10" fill="#9ca3af" font-weight="600">${MESES[i]}</text>`;
    });

    svg += '</svg>';

    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">
      <div style="font-weight:700;font-size:12px;color:${cor};margin-bottom:10px;
        text-transform:uppercase;letter-spacing:.8px">${titulo}</div>
      <div style="overflow-x:auto">${svg}</div>
      <div style="display:flex;gap:20px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div>
          <div style="font-size:10px;color:var(--muted)">TOTAL OBRAS (12 meses)</div>
          <div style="font-size:20px;font-weight:800;color:${cor}">${totQ}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted)">TOTAL USC (12 meses)</div>
          <div style="font-size:20px;font-weight:800;color:${cor}cc">${fmtNum(totU)} USC</div>
        </div>
      </div>
    </div>`;
  };

  // ── 1. KPIs globais ───────────────────────────────────────────────
  const totalUSC = ativas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const totalULV = ativas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
  const emNoPrazo = ativas.filter(o=>!o.conclusao&&o.dataLimite&&hoje_s<=o.dataLimite).length;
  const atrasadas = ativas.filter(o=>!o.conclusao&&o.dataLimite&&hoje_s>o.dataLimite).length;
  const conclNoP  = ativas.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao<=o.dataLimite).length;
  const conclForaP= ativas.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao>o.dataLimite).length;
  const encerradas= ativas.filter(o=>o.armazenado).length;

  let html = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:8px;flex-wrap:wrap">
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:4px">📈 Carteira de Obras</div>
      <div style="font-size:11px;color:var(--muted)">Foto atual da carteira · ${ativas.length} obras ativas · gerado em ${fmtTxt(hoje_s)}</div>
    </div>
    <button onclick="abrirModalRelatorio()"
      style="flex-shrink:0;padding:10px 18px;background:linear-gradient(135deg,#7c6af7,#00e5a0);color:#0d1117;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:8px">
      📄 Gerar Relatório de Empreiteira
    </button>
  </div>
  <div class="kpi-strip" style="margin-bottom:24px">
    ${kpiCard('Total de Obras',ativas.length,'na carteira','#00e5a0')}
    ${kpiCard('USC Total',totalUSC.toFixed(1),'previsto','#7c6af7')}
    ${kpiCard('ULV Total',totalULV.toFixed(1),'previsto','#ff6b35')}
    ${kpiCard('Em Execução no Prazo',emNoPrazo,'dentro do prazo','#3B82F6')}
    ${kpiCard('Atrasadas',atrasadas,'sem Med.230 após vencimento','#EF4444')}
    ${kpiCard('Concluídas no Prazo',conclNoP,'dentro do prazo','#22C55E')}
    ${kpiCard('Concluídas Fora do Prazo',conclForaP,'após vencimento','#DC2626')}
    ${kpiCard('Encerradas',encerradas,'armazenadas','#16A34A')}
  </div>`;

  // ── 2. Distribuição por Empreiteira (R1 / R2 / ODI / USC) ────────
  // ── GRÁFICOS POR TIPO: RD (R1+R2) e ODI separados ──────────────────
  const _buildTipoChart = (pool, titulo, cor, labelTipo) => {
    const semConcl = pool.filter(o=>!o.conclusao&&!o.cancelado);
    if(!semConcl.length) return '';
    const hoje_str2=hojeStr(), hoje_d2=new Date();
    const mV2=m=>{const[mm,yy]=m.split('/');return +yy*100+ +mm;};
    const mS2=s=>{if(!s)return null;const[y,m]=s.split('-');return `${m}/${y}`;};
    const prox12g=[];
    for(let i=0;i<=12;i++){const d=new Date(hoje_d2.getFullYear(),hoje_d2.getMonth()+i,1);prox12g.push(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);}
    const atr=semConcl.filter(o=>o.dataLimite&&o.dataLimite<hoje_str2);
    const m12M={};
    prox12g.forEach((m,i)=>{
      if(i===0) m12M[m]=semConcl.filter(o=>mS2(o.dataLimite)===m&&o.dataLimite>=hoje_str2);
      else      m12M[m]=semConcl.filter(o=>mS2(o.dataLimite)===m);
    });
    const alem={};
    semConcl.forEach(o=>{const m=mS2(o.dataLimite);if(!m||mV2(m)<=mV2(prox12g[12]))return;if(!alem[m])alem[m]=[];alem[m].push(o);});
    const alemM=Object.keys(alem).sort((a,b)=>mV2(a)-mV2(b));
    const colsG=[
      {lbl:'⚠️ Atras.',q:atr.length,usc:atr.reduce((s,o)=>s+(parseFloat(o.usc)||0),0),cor:'#EF4444',isAtras:true},
      ...prox12g.map((m,i)=>({lbl:m,q:(m12M[m]||[]).length,usc:(m12M[m]||[]).reduce((s,o)=>s+(parseFloat(o.usc)||0),0),cor:i===0?'#22C55E':cor,isMesAtual:i===0})),
      ...alemM.map(m=>({lbl:m+'*',q:alem[m].length,usc:alem[m].reduce((s,o)=>s+(parseFloat(o.usc)||0),0),cor:cor+'66'}))
    ];
    const maxQg=Math.max(...colsG.map(c=>c.q),1);
    const colWg=64,barHg=120,topPadg=56,botPadg=30,padLg=8;
    const svgWg=padLg+colsG.length*colWg+padLg;
    let svgG=`<svg xmlns="http://www.w3.org/2000/svg" width="${svgWg}" height="${topPadg+barHg+botPadg}" style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
    svgG+=`<line x1="${padLg}" y1="${topPadg+barHg}" x2="${svgWg-padLg}" y2="${topPadg+barHg}" stroke="#374151" stroke-width="1"/>`;
    colsG.forEach((col,i)=>{
      const x=padLg+i*colWg,cx=x+colWg/2-4,wg=colWg-10;
      const bh=col.q>0?Math.max(8,Math.round((col.q/maxQg)*barHg)):0;
      const barY=topPadg+barHg-bh;
      if(bh>0){svgG+=`<rect x="${x+4}" y="${barY}" width="${wg}" height="${bh}" rx="5" fill="${col.cor}" opacity="0.85"/>`;svgG+=`<rect x="${x+4}" y="${barY}" width="${wg}" height="${Math.min(bh,8)}" rx="5" fill="white" opacity="0.1"/>`;}
      if(col.q>0){const u=col.usc;const uLbl=u>=1000?(u/1000).toFixed(1).replace('.0','')+'k':u.toFixed(0);svgG+=`<text x="${cx}" y="${barY-30}" text-anchor="middle" font-size="9" font-weight="600" fill="${col.cor}bb">${uLbl} USC</text>`;svgG+=`<text x="${cx}" y="${barY-14}" text-anchor="middle" font-size="13" font-weight="800" fill="${col.cor}">${col.q}</text>`;}
      else{svgG+=`<text x="${cx}" y="${topPadg+barHg-8}" text-anchor="middle" font-size="9" fill="#374151">—</text>`;}
      const lc=col.isAtras?'#EF4444':col.isMesAtual?'#22C55E':'#9ca3af';
      svgG+=`<text x="${cx}" y="${topPadg+barHg+18}" text-anchor="middle" font-size="9" font-weight="${col.isAtras||col.isMesAtual?700:400}" fill="${lc}">${col.lbl}</text>`;
    });
    svgG+='</svg>';
    const fN=v=>v>=1000?(v/1000).toFixed(1).replace('.0','')+'k':v.toFixed(1);
    return `<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800;margin-bottom:4px">${titulo}</div>
          <div style="font-size:10px;color:var(--muted)">
            <span style="color:#EF4444">⚠️ Atrasadas</span> &nbsp;|&nbsp;
            <span style="color:#22C55E">Mês atual</span> &nbsp;|&nbsp;
            <span style="color:${cor}">Próximos 12 meses</span> &nbsp;|&nbsp;
            <span style="color:var(--muted)">*Além de 12m</span>
          </div>
        </div>
        <div style="display:flex;gap:24px;flex-shrink:0">
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:${cor}">${semConcl.length}</div><div style="font-size:9px;color:var(--muted)">${labelTipo} EM MÃOS</div></div>
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:${cor}">${fN(semConcl.reduce((s,o)=>s+(parseFloat(o.usc)||0),0))} USC</div><div style="font-size:9px;color:var(--muted)">USC EM MÃOS</div></div>
          <div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#EF4444">${atr.length}</div><div style="font-size:9px;color:var(--muted)">ATRASADAS</div></div>
        </div>
      </div>
      <div style="overflow-x:auto">${svgG}</div>
    </div>`;
  };

  // Gráfico 1: Obras RD (R1 + R2) — execução CELESC
  const poolRD  = ativas.filter(o=>o.tipo==='R1'||o.tipo==='R2');
  const poolODI = ativas.filter(o=>o.tipo==='ODI');
  html += `<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">📅 Monitor de Prazos — Por Tipo de Obra</div>`;
  html += _buildTipoChart(poolRD,  '🏗️ Obras RD (R1 + R2) — Execução CELESC',   '#7c6af7', 'OBRAS RD');
  html += _buildTipoChart(poolODI, '🔧 Obras ODI — Execução Cliente', '#ff6b35', 'OBRAS ODI');


  html += `<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">Distribuição por Empreiteira</div>`;
  const emprNames = [...new Set(ativas.map(o=>o.empreiteira).filter(Boolean))].sort();
  const tipos = ['R1','R2','ODI'];
  const corTipo = {'R1':'#7c6af7','R2':'#ff6b35','ODI':'#00e5a0'};
  let tblEmp = `<div class="tbl-wrap" style="margin-bottom:24px;max-height:none"><table>
    <thead><tr>
      <th>Empreiteira</th>
      ${tipos.map(t=>`<th style="text-align:center;color:${corTipo[t]}">${t}</th>`).join('')}
      <th style="text-align:center">Total</th>
      <th style="text-align:center;color:#7c6af7">USC</th>
      <th style="text-align:center;color:#ff6b35">ULV</th>
      <th style="text-align:center;color:#00e5a0">USC em Mãos</th>
      <th style="text-align:center">Atrasadas</th>
      <th style="text-align:center">Conc. Prazo</th>
      <th style="text-align:center">Conc. Fora</th>
    </tr></thead><tbody>`;
  emprNames.forEach(e=>{
    const sub = ativas.filter(o=>o.empreiteira===e);
    const usc = sub.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const ulv = sub.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
    const uscMaos = sub.reduce((s,o)=>s+calcUSCPendente(o),0);
    const atr = sub.filter(o=>!o.conclusao&&o.dataLimite&&hoje_s>o.dataLimite).length; // atrasada = sem conclusão após vencimento
    const cnp = sub.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao<=o.dataLimite).length;
    const cfp = sub.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao>o.dataLimite).length;
    const c = gc(e);
    tblEmp += `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${c}"></span><strong>${e}</strong></span></td>
      ${tipos.map(t=>`<td style="text-align:center">${sub.filter(o=>o.tipo===t).length}</td>`).join('')}
      <td style="text-align:center;font-weight:700">${sub.length}</td>
      <td style="text-align:center;color:#7c6af7">${usc.toFixed(1)}</td>
      <td style="text-align:center;color:#ff6b35">${ulv.toFixed(1)}</td>
      <td style="text-align:center;color:#00e5a0">${uscMaos.toFixed(1)}</td>
      <td style="text-align:center;color:${atr>0?'#EF4444':'var(--muted)'}"><strong>${atr}</strong></td>
      <td style="text-align:center;color:#22C55E">${cnp}</td>
      <td style="text-align:center;color:${cfp>0?'#DC2626':'var(--muted)'}">${cfp}</td>
    </tr>`;
  });
  tblEmp += `</tbody><tfoot><tr style="background:var(--surface2);font-weight:700">
    <td>TOTAL</td>
    ${tipos.map(t=>`<td style="text-align:center">${ativas.filter(o=>o.tipo===t).length}</td>`).join('')}
    <td style="text-align:center">${ativas.length}</td>
    <td style="text-align:center;color:#7c6af7">${totalUSC.toFixed(1)}</td>
    <td style="text-align:center;color:#ff6b35">${totalULV.toFixed(1)}</td>
    <td style="text-align:center;color:#00e5a0">${ativas.reduce((s,o)=>s+calcUSCPendente(o),0).toFixed(1)}</td>
    <td style="text-align:center;color:#EF4444">${atrasadas}</td>
    <td style="text-align:center;color:#22C55E">${conclNoP}</td>
    <td style="text-align:center;color:#DC2626">${conclForaP}</td>
  </tr></tfoot></table></div>`;
  html += tblEmp;

  // ── 3. Gráficos mensais por empreiteira (vencimento + conclusão) ──
  // Detecta as duas principais empreiteiras (CS e ELETELSUL)
  // Análise mensal: SOMENTE para CS ELETRICIDADE e ELETELSUL (empreiteiras de obras RD)
  const EMP_ANALISE = ['CS ELETRICIDADE', 'ELETELSUL'];
  const empPrincipais = emprNames.filter(e =>
    EMP_ANALISE.some(ref => e.toUpperCase().includes(ref))
  );

  if(empPrincipais.length){
    html += `<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Análise Mensal por Empreiteira</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(580px,1fr));gap:20px;margin-bottom:24px">`;

    empPrincipais.forEach(e=>{
      // Somente R1 e R2 para o gráfico de empreiteira
      const sub = ativas.filter(o=>o.empreiteira===e && (o.tipo==='R1'||o.tipo==='R2'));
      const cor = gc(e);

      // ── helpers ──────────────────────────────────────────────────
      const mesVal  = m => { const [mm,yy]=m.split('/'); return +yy*100 + +mm; };
      const hoje_d  = new Date();
      const hoje_s_chart = hoje_s; // YYYY-MM-DD string do dia de hoje

      // próximos 12 meses a partir do mês atual (índice 0 = mês atual)
      const prox12 = [];
      for(let i=0;i<=12;i++){
        const d=new Date(hoje_d.getFullYear(), hoje_d.getMonth()+i, 1);
        prox12.push(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
      }

      // ── GRÁFICO 1: Obras SEM conclusão por linha do tempo ────────
      const semConcl = sub.filter(o=>!o.conclusao);

      // ATRASADAS: sem conclusão E dataLimite ANTERIOR a HOJE (comparação diária exata)
      // Obras que venceram ontem ou antes, mesmo que seja dentro do mês atual
      const atrasadasCol = semConcl.filter(o => o.dataLimite && o.dataLimite < hoje_s_chart);

      // MÊS ATUAL: sem conclusão, dataLimite >= hoje (ainda não venceu), vence este mês
      const prox12Map = {};
      prox12.forEach((m, i) => {
        if(i === 0){
          // Mês atual: só obras que ainda NÃO venceram (dataLimite >= hoje)
          prox12Map[m] = semConcl.filter(o => mesStr(o.dataLimite)===m && o.dataLimite >= hoje_s_chart);
        } else {
          // Meses futuros: todas as obras desse mês (nenhuma pode estar vencida)
          prox12Map[m] = semConcl.filter(o => mesStr(o.dataLimite)===m);
        }
      });

      // além dos 12 meses: somente se tiver obra
      const alem12Map = {};
      semConcl.forEach(o=>{
        const m=mesStr(o.dataLimite); if(!m) return;
        if(mesVal(m) > mesVal(prox12[12])){
          if(!alem12Map[m]) alem12Map[m]=[];
          alem12Map[m].push(o);
        }
      });
      const alem12Meses = Object.keys(alem12Map).sort((a,b)=>mesVal(a)-mesVal(b));

      // Montar colunas
      const cols = [
        { lbl:'⚠️ Atras.', obras:atrasadasCol, cor:'#EF4444', isAtras:true },
        ...prox12.map(m=>({ lbl:m, obras:prox12Map[m]||[], cor:m===prox12[0]?'#22C55E':cor, isMesAtual:m===prox12[0] })),
        ...alem12Meses.map(m=>({ lbl:m+'*', obras:alem12Map[m], cor:cor+'88' })),
      ];

      // SVG da linha do tempo
      const colW2=62, barH2=110, topPad2=52, botPad2=36, padL=8;
      const svgW = padL + cols.length*colW2 + padL;
      const svgH2 = topPad2 + barH2 + botPad2;
      const maxQ2 = Math.max(...cols.map(c=>c.obras.length), 1);

      let svgVenc = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH2}"
        style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
      svgVenc += `<line x1="${padL}" y1="${topPad2+barH2}" x2="${svgW-padL}" y2="${topPad2+barH2}" stroke="#374151" stroke-width="1"/>`;

      // Separador visual entre prox12 e além
      if(alem12Meses.length){
        const sepX = padL + (1+13)*colW2 - 4;
        svgVenc += `<line x1="${sepX}" y1="${topPad2}" x2="${sepX}" y2="${topPad2+barH2+24}" stroke="#374151" stroke-dasharray="4,3" stroke-width="1"/>`;
        svgVenc += `<text x="${sepX+4}" y="${topPad2-4}" font-size="8" fill="#6b7280">além de 12m</text>`;
      }

      cols.forEach((col,i)=>{
        const x = padL + i*colW2;
        const cx = x + colW2/2 - 4;
        const q = col.obras.length;
        const usc = col.obras.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
        const bh = q>0 ? Math.max(8, Math.round((q/maxQ2)*barH2)) : 0;
        const barY = topPad2 + barH2 - bh;
        const w2 = colW2-10;

        if(bh>0){
          svgVenc += `<rect x="${x+4}" y="${barY}" width="${w2}" height="${bh}" rx="5" fill="${col.cor}" opacity="0.85"/>`;
          if(bh>12) svgVenc += `<rect x="${x+4}" y="${barY}" width="${w2}" height="${Math.min(bh,8)}" rx="5" fill="white" opacity="0.12"/>`;
        }

        if(q>0){
          // USC acima (menor)
          svgVenc += `<text x="${cx}" y="${barY-28}" text-anchor="middle" font-size="9" font-weight="600" fill="${col.cor}cc">${fmtNum(usc)} USC</text>`;
          // Qtd obras (grande, bold)
          svgVenc += `<text x="${cx}" y="${barY-14}" text-anchor="middle" font-size="12" font-weight="800" fill="${col.cor}">${q} obra${q!==1?'s':''}</text>`;
        } else {
          svgVenc += `<text x="${cx}" y="${topPad2+barH2-6}" text-anchor="middle" font-size="9" fill="#374151">—</text>`;
        }

        // Label mês
        const lblColor = col.isAtras ? '#EF4444' : col.isMesAtual ? '#22C55E' : '#9ca3af';
        svgVenc += `<text x="${cx}" y="${topPad2+barH2+14}" text-anchor="middle" font-size="9" fill="${lblColor}" font-weight="${col.isMesAtual||col.isAtras?'700':'400'}">${col.lbl}</text>`;
      });
      svgVenc += '</svg>';

      const totVencQ = cols.reduce((s,c)=>s+c.obras.length,0);
      const totVencUSC = cols.reduce((s,c)=>s+c.obras.reduce((ss,o)=>ss+(parseFloat(o.usc)||0),0),0);

      // ── GRÁFICO 2: Conclusões — barras empilhadas por urgência ──
      const comConcl = sub.filter(o=>o.conclusao&&o.dataLimite);
      const meses12back = [];
      for(let i=11;i>=0;i--){
        const d=new Date(hoje_d.getFullYear(), hoje_d.getMonth()-i, 1);
        meses12back.push(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
      }

      const stackCols = meses12back.map(m=>{
        const obras_m = comConcl.filter(o=>mesStr(o.conclusao)===m);
        const atras   = obras_m.filter(o=>o.conclusao>o.dataLimite);
        const noPrazo = obras_m.filter(o=>o.conclusao<=o.dataLimite && diff(o.conclusao,o.dataLimite)<=30);
        const comFolga= obras_m.filter(o=>o.conclusao<=o.dataLimite && diff(o.conclusao,o.dataLimite)>30);
        return { m, atras, noPrazo, comFolga, total:obras_m.length,
          uscAtras:atras.reduce((s,o)=>s+(parseFloat(o.usc)||0),0),
          uscPrazo:noPrazo.reduce((s,o)=>s+(parseFloat(o.usc)||0),0),
          uscFolga:comFolga.reduce((s,o)=>s+(parseFloat(o.usc)||0),0) };
      });

      const maxStack = Math.max(...stackCols.map(c=>c.total), 1);
      const colWS=62, barHS=110, topPadS=44, botPadS=36;
      const svgWS = padL + stackCols.length*colWS + padL;
      const svgHS = topPadS + barHS + botPadS;

      let svgConcl = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWS}" height="${svgHS}"
        style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
      svgConcl += `<line x1="${padL}" y1="${topPadS+barHS}" x2="${svgWS-padL}" y2="${topPadS+barHS}" stroke="#374151" stroke-width="1"/>`;

      stackCols.forEach((col,i)=>{
        const x  = padL + i*colWS;
        const cx = x + colWS/2 - 4;
        const wS = colWS-10;
        const tot= col.total;
        if(tot===0){
          svgConcl += `<text x="${cx}" y="${topPadS+barHS-6}" text-anchor="middle" font-size="9" fill="#374151">—</text>`;
        } else {
          // Calcular alturas de cada segmento (proporcional ao total geral)
          const scale = v => Math.round((v/maxStack)*barHS);
          const hA = col.atras.length   > 0 ? Math.max(4, scale(col.atras.length))   : 0;
          const hP = col.noPrazo.length > 0 ? Math.max(4, scale(col.noPrazo.length)) : 0;
          const hF = col.comFolga.length> 0 ? Math.max(4, scale(col.comFolga.length)): 0;
          const hTot = hA+hP+hF;
          let curY = topPadS + barHS - hTot;

          // 🟢 COM FOLGA (fundo)
          if(hF>0){
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hF}" rx="3" fill="#22C55E" opacity="0.85"/>`;
            curY += hF;
          }
          // 🟡 NO PRAZO
          if(hP>0){
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hP}" fill="#F59E0B" opacity="0.85"/>`;
            curY += hP;
          }
          // 🔴 ATRASADA (topo)
          if(hA>0){
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hA}" rx="3" fill="#EF4444" opacity="0.85"/>`;
          }

          // Label total acima
          const lblY = topPadS + barHS - hTot - 5;
          svgConcl += `<text x="${cx}" y="${lblY}" text-anchor="middle" font-size="12" font-weight="800" fill="#e8eaf0">${tot}</text>`;
          // USC total acima do número
          const totUSC = col.uscAtras+col.uscPrazo+col.uscFolga;
          svgConcl += `<text x="${cx}" y="${lblY-14}" text-anchor="middle" font-size="9" font-weight="600" fill="#9ca3af">${fmtNum(totUSC)} USC</text>`;
        }
        // Mês
        svgConcl += `<text x="${cx}" y="${topPadS+barHS+14}" text-anchor="middle" font-size="9" fill="#9ca3af">${col.m}</text>`;
      });

      // Legenda
      const legY = topPadS+barHS+28;
      svgConcl += `
        <rect x="${padL}" y="${legY}" width="10" height="10" rx="2" fill="#EF4444"/>
        <text x="${padL+14}" y="${legY+9}" font-size="9" fill="#9ca3af">Concluiu atrasada</text>
        <rect x="${padL+130}" y="${legY}" width="10" height="10" rx="2" fill="#F59E0B"/>
        <text x="${padL+144}" y="${legY+9}" font-size="9" fill="#9ca3af">No prazo (≤30d)</text>
        <rect x="${padL+260}" y="${legY}" width="10" height="10" rx="2" fill="#22C55E"/>
        <text x="${padL+274}" y="${legY+9}" font-size="9" fill="#9ca3af">Com folga (>30d)</text>`;
      svgConcl += '</svg>';

      const totConclQ = stackCols.reduce((s,c)=>s+c.total,0);

      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;border-top:3px solid ${cor}">
        <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:${cor};margin-bottom:16px">${e}</div>

        <!-- Gráfico 1: Obras em mãos (sem conclusão) por linha do tempo -->
        <div style="margin-bottom:20px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
            📅 Obras em Mãos — sem conclusão, por data de vencimento
          </div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:10px">
            <span style="color:#EF4444">⚠️ Atrasadas</span> &nbsp;|&nbsp;
            <span style="color:#22C55E">Mês atual</span> &nbsp;|&nbsp;
            Próximos 12 meses &nbsp;|&nbsp; <span style="color:#9ca3af">*Além de 12 meses (apenas meses com obra)</span>
          </div>
          <div style="overflow-x:auto">${svgVenc}</div>
          <div style="display:flex;gap:20px;margin-top:10px;padding:8px 12px;background:var(--surface2);border-radius:8px">
            <div><span style="font-size:10px;color:var(--muted)">OBRAS EM MÃOS:</span>
              <span style="font-size:16px;font-weight:800;color:${cor};margin-left:8px">${totVencQ}</span></div>
            <div><span style="font-size:10px;color:var(--muted)">USC EM MÃOS:</span>
              <span style="font-size:16px;font-weight:800;color:${cor};margin-left:8px">${fmtNum(totVencUSC)} USC</span></div>
          </div>
        </div>

        <!-- Gráfico 2: Conclusões com urgência empilhada -->
        <div style="border-top:1px solid var(--border);padding-top:16px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
            ✅ Obras Concluídas — últimos 12 meses (por urgência)
          </div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:10px">
            Cada barra mostra se a empreiteira priorizou obras urgentes ou obras com folga de prazo
          </div>
          <div style="overflow-x:auto">${svgConcl}</div>
          <div style="display:flex;gap:20px;margin-top:10px;padding:8px 12px;background:var(--surface2);border-radius:8px">
            <div><span style="font-size:10px;color:var(--muted)">TOTAL CONCLUÍDAS (12m):</span>
              <span style="font-size:16px;font-weight:800;color:#22C55E;margin-left:8px">${totConclQ}</span></div>
            <div><span style="font-size:10px;color:#EF4444">🔴 Atrasadas:</span>
              <span style="font-weight:700;color:#EF4444;margin-left:4px">${stackCols.reduce((s,c)=>s+c.atras.length,0)}</span></div>
            <div><span style="font-size:10px;color:#F59E0B">🟡 No prazo:</span>
              <span style="font-weight:700;color:#F59E0B;margin-left:4px">${stackCols.reduce((s,c)=>s+c.noPrazo.length,0)}</span></div>
            <div><span style="font-size:10px;color:#22C55E">🟢 Com folga:</span>
              <span style="font-weight:700;color:#22C55E;margin-left:4px">${stackCols.reduce((s,c)=>s+c.comFolga.length,0)}</span></div>
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // ── 4. Obras Atrasadas (tabela detalhada) ─────────────────────────
  const listaAtrasadas = ativas.filter(o=>!o.conclusao&&o.dataLimite&&hoje_s>o.dataLimite)
    .sort((a,b)=>a.dataLimite>b.dataLimite?1:-1);

  html += `<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">
    ⚠️ Obras Atrasadas (${listaAtrasadas.length})
    <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0"> — sem Medida 230 após vencimento</span>
  </div>`;

  if(!listaAtrasadas.length){
    html += `<div class="empty" style="padding:20px"><div class="ico">✅</div><p>Nenhuma obra atrasada!</p></div>`;
  } else {
    const rows = listaAtrasadas.map(o=>{
      const diasAtr = diff(o.dataLimite, hoje_s);
      const etapa = statusOf(o);
      const etCor = STATUS_DEF[etapa]?.cor||'var(--muted)';
      return `<tr style="background:rgba(239,68,68,.05)">
        <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
        <td><span class="chip">${o.tipo||'—'}</span></td>
        <td>${o.cidade||'—'}</td>
        <td>${o.empreiteira||'—'}</td>
        <td>${o.fiscal||'—'}</td>
        <td style="color:#EF4444;font-weight:700">${fmt(o.dataLimite)}</td>
        <td style="color:#EF4444;font-weight:700">${diasAtr!==null?diasAtr+'d':'—'}</td>
        <td>${o.usc||'—'}</td>
        <td><span style="color:${etCor};font-size:10px;font-weight:600">${etapa}</span></td>
        <td>${o.conclusao?`<span style="color:${o.conclusao>o.dataLimite?'#EF4444':'#22C55E'}">${fmt(o.conclusao)}</span>`:'<span class="chip chip-red">Pendente</span>'}</td>
      </tr>`;
    }).join('');
    html += `<div class="tbl-wrap" style="max-height:none"><table>
      <thead><tr>
        <th>Nº Obra</th><th>Tipo</th><th>Cidade</th><th>Empreiteira</th><th>Fiscal</th>
        <th>Vencimento</th><th>Dias Atraso</th><th>USC</th><th>Status Atual</th><th>Conclusão</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  html += renderUSCMediaPorPrograma(obras);
  cont.innerHTML = html;
}
// ══════════════════════════════════════════════════════════════════════
window.abrirModalRelatorio = function(){
  // Populate empreiteiras
  const sel = document.getElementById('relEmpreiteira');
  const emps = [...new Set(obras.filter(o=>!o.cancelado).map(o=>o.empreiteira).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Selecione a empreiteira...</option>' +
    emps.map(e=>`<option value="${e}">${e}</option>`).join('');

  // Default custom period to last month
  const d = new Date();
  const ateM = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const deD  = new Date(d.getFullYear(), d.getMonth()-1, 1);
  const deM  = `${deD.getFullYear()}-${String(deD.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('relDe').value  = deM;
  document.getElementById('relAte').value = ateM;

  document.getElementById('ovRelatorio').style.display = 'flex';

  document.getElementById('relPeriodo').onchange = function(){
    document.getElementById('relCustomPeriodo').style.display =
      this.value === 'custom' ? 'grid' : 'none';
  };
};

window.fecharModalRelatorio = function(){
  document.getElementById('ovRelatorio').style.display = 'none';
};

window.gerarRelatorio = function(){
  const empNome = document.getElementById('relEmpreiteira').value;
  if(!empNome){ alert('Selecione uma empreiteira.'); return; }

  try {
  const hoje_s  = hojeStr(); // YYYY-MM-DD de hoje (era indefinido aqui antes)
  const periodo = document.getElementById('relPeriodo').value;
  const hoje_d  = new Date();
  let de, ate, periodoLabel;

  if(periodo === 'mesAnterior'){
    de  = new Date(hoje_d.getFullYear(), hoje_d.getMonth()-1, 1);
    ate = new Date(hoje_d.getFullYear(), hoje_d.getMonth(),   0); // último dia mês anterior
    const m = de.toLocaleString('pt-BR', {month:'long',year:'numeric'});
    periodoLabel = m.charAt(0).toUpperCase()+m.slice(1);
  } else if(periodo === 'mesAtual'){
    de  = new Date(hoje_d.getFullYear(), hoje_d.getMonth(), 1);
    ate = hoje_d;
    const m = de.toLocaleString('pt-BR', {month:'long',year:'numeric'});
    periodoLabel = m.charAt(0).toUpperCase()+m.slice(1)+' (em andamento)';
  } else if(periodo === 'ultimos30'){
    ate = hoje_d;
    de  = new Date(hoje_d.getTime() - 30*86400000);
    periodoLabel = 'Últimos 30 dias';
  } else if(periodo === 'ultimos90'){
    ate = hoje_d;
    de  = new Date(hoje_d.getTime() - 90*86400000);
    periodoLabel = 'Últimos 90 dias';
  } else {
    const deVal  = document.getElementById('relDe').value;
    const ateVal = document.getElementById('relAte').value;
    if(!deVal||!ateVal){ alert('Preencha o período.'); return; }
    de  = new Date(deVal+'-01');
    const [ay,am] = ateVal.split('-');
    ate = new Date(+ay, +am, 0); // último dia do mês "até"
    periodoLabel = `${fmtTxt(deVal+'-01')} a ${fmtTxt(ateVal+'-'+String(new Date(+ay,+am,0).getDate()).padStart(2,'0'))}`;
  }

  const deStr  = de.toISOString().split('T')[0];
  const ateStr = ate.toISOString().split('T')[0];

  // Obras da empreiteira concluídas no período
  const subAll    = obras.filter(o=>o.empreiteira===empNome&&!o.cancelado);
  const concluidas= subAll.filter(o=>o.conclusao&&o.conclusao>=deStr&&o.conclusao<=ateStr);
  const em_mao    = subAll.filter(o=>!o.conclusao);

  // ── Métricas de tempo ──────────────────────────────────────────
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  const lbl = v => v===null ? '—' : v+'d';

  // 1. Tempo abertura → conclusão
  const tConc = concluidas.map(o=>diff(o.dataAbertura,o.conclusao)).filter(v=>v!==null&&v>0);

  // 2. Tempo conclusão → kaffa final
  const tKaffa = concluidas
    .map(o=>{
      const kf=(o.kaffaEntries||[]).find(k=>k.tipo==='final');
      return kf&&o.conclusao ? diff(o.conclusao,kf.data) : null;
    }).filter(v=>v!==null&&v>=0);

  // 3. Tempo kaffa → medição (par-a-par)
  const tMedicao = [];
  concluidas.forEach(o=>{
    const kaffas = (o.kaffaEntries||[]).slice().sort((a,b)=>a.data>b.data?1:-1);
    const meds   = (o.medicoes||[]).slice().sort((a,b)=>a.data>b.data?1:-1);
    const kP = kaffas.filter(k=>k.tipo==='parcial');
    const mP = meds.filter(m=>m.tipo==='parcial');
    Math.min(kP.length,mP.length) && [...Array(Math.min(kP.length,mP.length))].forEach((_,i)=>{
      const d=diff(kP[i].data,mP[i].data); if(d!==null&&d>=0) tMedicao.push(d);
    });
    const kF=kaffas.find(k=>k.tipo==='final'), mF=meds.find(m=>m.tipo==='final');
    if(kF&&mF){ const d=diff(kF.data,mF.data); if(d!==null&&d>=0) tMedicao.push(d); }
  });

  // 4. Pontualidade
  const noPrazo  = concluidas.filter(o=>o.dataLimite&&o.conclusao<=o.dataLimite).length;
  const foraPrazo= concluidas.filter(o=>o.dataLimite&&o.conclusao>o.dataLimite).length;
  const semLimite= concluidas.filter(o=>!o.dataLimite).length;

  // USC
  const uscConc  = concluidas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const uscMao   = em_mao.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);

  // R1/R2/ODI breakdown
  const byTipo   = t => concluidas.filter(o=>o.tipo===t).length;

  // ── Montar HTML do relatório ───────────────────────────────────
  const cor = gc(empNome)||'#00e5a0';
  const dataGer = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

  // ── Dados para tabelas das seções 3a, 5, 6 ──────────────────────
  const _mS2 = s => { if(!s) return null; const [y,m]=s.split('-'); return m+'/'+y; };
  const _mV2 = m => { if(!m) return 0; const p=m.split('/'); return +p[1]*100 + +p[0]; };
  const hd2 = new Date(), hs2 = hojeStr();
  const rSemC = subAll.filter(o=>!o.conclusao);
  const rAtr  = rSemC.filter(o=>o.dataLimite && o.dataLimite < hs2);

  // Agrupar obras em mãos por mês de vencimento (próximos 24 meses + além)
  const rMesMap = {};
  rSemC.forEach(o => {
    const m = _mS2(o.dataLimite);
    if(!m) return;
    if(!rMesMap[m]) rMesMap[m] = [];
    rMesMap[m].push(o);
  });
  // Próximos 24 meses (0 = mês atual)
  const rMeses24 = [];
  for(let i=0;i<=24;i++){
    const d = new Date(hd2.getFullYear(), hd2.getMonth()+i, 1);
    rMeses24.push(String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear());
  }
  // Meses além dos 24 que têm obra
  const r24set = new Set(rMeses24);
  const rAlemMeses = Object.keys(rMesMap).filter(m=>!r24set.has(m) && _mV2(m)>_mV2(rMeses24[24])).sort((a,b)=>_mV2(a)-_mV2(b));
  // Todas as entradas da tabela
  const rTodasCols = [
    ...rMeses24.filter(m=>rMesMap[m]||rMeses24.indexOf(m)<=1).map(m=>({m, obras:(rMesMap[m]||[]) })),
    ...rAlemMeses.map(m=>({m, obras:rMesMap[m], além:true}))
  ];

  // Obras com vencimento no mês atual (para seção 5)
  const mesAtualStr = String(hd2.getMonth()+1).padStart(2,'0')+'/'+hd2.getFullYear();
  const rVencMesAtual = rSemC.filter(o => _mS2(o.dataLimite)===mesAtualStr);

  const fNr = v => !v ? '0' : v>=1000 ? (v/1000).toFixed(1).replace('.0','')+'k' : v.toFixed(1);
  const rTotQ = rSemC.length;
  const rTotU = rSemC.reduce((s,o)=>s+(parseFloat(o.usc)||0), 0);

  const rowsObras = concluidas
    .sort((a,b)=>a.conclusao>b.conclusao?1:-1)
    .map(o=>{
      const kf=(o.kaffaEntries||[]).find(k=>k.tipo==='final');
      const dias_prazo = o.dataLimite ? diff(o.conclusao,o.dataLimite) : null;
      const status_prazo = dias_prazo===null?'—':dias_prazo>=0?`✅ +${dias_prazo}d`:`❌ ${dias_prazo}d`;
      return `<tr>
        <td>${o.numero||'—'}</td>
        <td>${o.tipo||'—'}</td>
        <td>${o.cidade||'—'}</td>
        <td>${fmtTxt(o.conclusao)}</td>
        <td>${fmtTxt(o.dataLimite)||'—'}</td>
        <td style="text-align:center">${status_prazo}</td>
        <td style="text-align:right">${o.usc||'—'}</td>
        <td>${fmtTxt(kf?.data)||'—'}</td>
        <td>${o.fiscal||'—'}</td>
      </tr>`;
    }).join('');

  const relHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório — ${empNome} — ${periodoLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Mono',monospace;font-size:11px;color:#1a1a2e;background:#fff;padding:28px 36px}
  .header{border-bottom:3px solid ${cor};padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
  .header-left h1{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:${cor}}
  .header-left h2{font-size:14px;font-weight:700;margin-top:4px}
  .header-right{text-align:right;font-size:10px;color:#666;line-height:1.6}
  .secao{margin-bottom:24px}
  .secao-titulo{font-family:'Syne',sans-serif;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#666;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
  .kpi{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;border-left:3px solid ${cor}}
  .kpi-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:${cor}}
  .kpi-lbl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .kpi-sub{font-size:10px;color:#374151;margin-top:4px}
  .kpi-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .kpi-tempo{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .kpi-tempo .val{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#1a1a2e}
  .kpi-tempo .lbl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .kpi-tempo .desc{font-size:10px;color:#374151;margin-top:6px;line-height:1.4}
  .prazo-bar{display:flex;gap:0;border-radius:6px;overflow:hidden;height:20px;margin:8px 0}
  .prazo-bar span{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#f1f5f9;text-align:left;padding:7px 10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:9px;color:#374151;border-bottom:2px solid #e5e7eb}
  td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#fafafa}
  .badge-prazo{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700}
  .footer{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:9px;color:#9ca3af;display:flex;justify-content:space-between}
  .em-maos{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;display:flex;gap:24px;margin-top:8px}
  .em-maos .item{display:flex;flex-direction:column}
  .em-maos .vv{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:#16a34a}
  .em-maos .ll{font-size:9px;color:#15803d;text-transform:uppercase}
  @media print{body{padding:16px 24px}.no-print{display:none!important}}
  .btn-print{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:${cor};color:#0d1117;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;margin-bottom:20px}
</style>
</head>
<body>

<div class="no-print" style="margin-bottom:16px;display:flex;gap:12px;align-items:center">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <span style="font-size:11px;color:#666">Use "Salvar como PDF" na impressora para exportar em PDF</span>
</div>

<div class="header">
  <div class="header-left">
    <h1>${empNome}</h1>
    <h2>Relatório de Desempenho Mensal · Período: ${periodoLabel}</h2>
  </div>
  <div class="header-right">
    <div style="font-weight:700">CELESC Distribuição S.A.</div>
    <div>ARLAG — Agência Regional de Lages</div>
    <div>DVPC / DVTC</div>
    <div style="margin-top:4px">Gerado em ${dataGer}</div>
  </div>
</div>

<!-- Seção 1: Resumo de Produção -->
<div class="secao">
  <div class="secao-titulo">1. Resumo de Produção no Período</div>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-val">${concluidas.length}</div>
      <div class="kpi-lbl">Obras Concluídas</div>
      <div class="kpi-sub">R1: ${byTipo('R1')} · R2: ${byTipo('R2')} · ODI: ${byTipo('ODI')}</div>
    </div>
    <div class="kpi">
      <div class="kpi-val">${uscConc.toFixed(1)}</div>
      <div class="kpi-lbl">USC Concluída</div>
      <div class="kpi-sub">no período</div>
    </div>
    <div class="kpi" style="border-left-color:#22C55E">
      <div class="kpi-val" style="color:#22C55E">${noPrazo}</div>
      <div class="kpi-lbl">Concluídas no Prazo</div>
      <div class="kpi-sub">${concluidas.length>0?Math.round(noPrazo/concluidas.length*100):0}% do total</div>
    </div>
    <div class="kpi" style="border-left-color:#EF4444">
      <div class="kpi-val" style="color:#EF4444">${foraPrazo}</div>
      <div class="kpi-lbl">Concluídas Fora do Prazo</div>
      <div class="kpi-sub">${concluidas.length>0?Math.round(foraPrazo/concluidas.length*100):0}% do total</div>
    </div>
  </div>

  ${concluidas.length>0?`
  <div style="margin-bottom:6px;font-size:10px;color:#666">Pontualidade de entregas</div>
  <div class="prazo-bar">
    <span style="background:#22C55E;width:${Math.round(noPrazo/concluidas.length*100)}%">
      ${noPrazo>0?noPrazo+'':''}
    </span>
    <span style="background:#EF4444;width:${Math.round(foraPrazo/concluidas.length*100)}%;${foraPrazo===0?'display:none':''}">
      ${foraPrazo>0?foraPrazo:''}
    </span>
    ${semLimite>0?`<span style="background:#9ca3af;width:${Math.round(semLimite/concluidas.length*100)}%">${semLimite}</span>`:''}
  </div>
  <div style="display:flex;gap:16px;font-size:9px;color:#666">
    <span>🟢 No prazo: ${noPrazo}</span>
    <span>🔴 Fora do prazo: ${foraPrazo}</span>
    ${semLimite>0?`<span>⚪ Sem data limite: ${semLimite}</span>`:''}
  </div>
  `:''}
</div>

<!-- Seção 2: Indicadores de Tempo -->
<div class="secao">
  <div class="secao-titulo">2. Indicadores de Tempo (média do período)</div>
  <div class="kpi-grid-3">
    <div class="kpi-tempo">
      <div class="val">${lbl(avg(tConc))}</div>
      <div class="lbl">Tempo de Execução</div>
      <div class="desc">Média: abertura da obra → conclusão informada pela empreiteira</div>
    </div>
    <div class="kpi-tempo">
      <div class="val">${lbl(avg(tKaffa))}</div>
      <div class="lbl">Tempo para Kaffa Final</div>
      <div class="desc">Média: conclusão da obra → registro do kaffa final</div>
    </div>
    <div class="kpi-tempo">
      <div class="val">${lbl(avg(tMedicao))}</div>
      <div class="lbl">Tempo para Medição (Fiscal)</div>
      <div class="desc">Média: kaffa (parcial/final) → medição correspondente do fiscal</div>
    </div>
  </div>
  ${tConc.length===0&&concluidas.length>0?'<p style="margin-top:8px;font-size:10px;color:#9ca3af">⚠️ Datas de abertura não disponíveis para cálculo de tempo de execução.</p>':''}
</div>

<!-- Seção 3: Obras em Mãos -->
<div class="secao">
  <div class="secao-titulo">3. Obras Ainda em Execução (sem conclusão)</div>
  <div class="em-maos">
    <div class="item"><div class="vv">${em_mao.length}</div><div class="ll">Obras em mãos</div></div>
    <div class="item"><div class="vv">${uscMao.toFixed(1)}</div><div class="ll">USC em mãos</div></div>
    <div class="item"><div class="vv">${em_mao.filter(o=>o.dataLimite&&o.dataLimite<hoje_s).length}</div><div class="ll" style="color:#dc2626">Atrasadas</div></div>
    <div class="item"><div class="vv">${em_mao.filter(o=>o.dataLimite&&o.dataLimite>=hoje_s).length}</div><div class="ll" style="color:#0284c7">No prazo / futuras</div></div>
  </div>
</div>

<!-- Seção 4: Lista de Obras Concluídas -->
<div class="secao">
  <div class="secao-titulo">4. Lista de Obras Concluídas no Período (${concluidas.length})</div>
  ${concluidas.length===0
    ? '<p style="color:#9ca3af;font-size:11px">Nenhuma obra concluída neste período.</p>'
    : `<table>
    <thead><tr>
      <th>Nº Obra</th><th>Tipo</th><th>Cidade</th><th>Conclusão</th>
      <th>Vencimento</th><th style="text-align:center">Prazo</th>
      <th style="text-align:right">USC</th><th>Kaffa Final</th><th>Fiscal</th>
    </tr></thead>
    <tbody>${rowsObras}</tbody>
  </table>`}
</div>

<div class="footer">
  <span>SPPC ARLAG · ${empNome} · ${periodoLabel}</span>
  <span>Relatório g<!-- Seção 3a: Obras em Mãos por Mês (Tabela) -->
<div class="secao">
  <div class="secao-titulo">3a. Obras em Mãos — Por Mês de Vencimento (sem conclusão)</div>
  <table>
    <thead><tr>
      <th>Mês de Vencimento</th>
      <th style="text-align:center">R1</th>
      <th style="text-align:center">R2</th>
      <th style="text-align:center;font-weight:800">Total</th>
      <th style="text-align:right">USC</th>
      <th>Obs.</th>
    </tr></thead>
    <tbody>
      <tr style="background:#fef2f2">
        <td><strong style="color:#EF4444">⚠️ Atrasadas</strong></td>
        <td style="text-align:center;color:#EF4444">${rAtr.filter(o=>o.tipo==='R1').length}</td>
        <td style="text-align:center;color:#EF4444">${rAtr.filter(o=>o.tipo==='R2').length}</td>
        <td style="text-align:center;font-weight:800;color:#EF4444">${rAtr.length}</td>
        <td style="text-align:right;color:#EF4444">${fNr(rAtr.reduce((s,o)=>s+(parseFloat(o.usc)||0),0))} USC</td>
        <td style="font-size:9px;color:#EF4444">Prazo vencido</td>
      </tr>
      ${rTodasCols.map((col,idx)=>{
        const r1=col.obras.filter(o=>o.tipo==='R1').length;
        const r2=col.obras.filter(o=>o.tipo==='R2').length;
        const tot=r1+r2;
        const usc=col.obras.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
        const isAtual=col.m===mesAtualStr;
        const bg=isAtual?'background:#f0fdf4':'';
        const lbl=col.além?col.m+'*':col.m;
        const obs=isAtual?'<span style="color:#16a34a;font-size:9px">← Mês atual</span>':col.além?'<span style="color:#9ca3af;font-size:9px">*Além de 12m</span>':'';
        if(!tot && idx>1) return '<tr><td style="color:#d1d5db">'+lbl+'</td><td colspan="3" style="text-align:center;color:#d1d5db">—</td><td style="color:#d1d5db">—</td><td>'+obs+'</td></tr>';
        return '<tr style="'+bg+'"><td><strong>'+lbl+'</strong></td><td style="text-align:center">'+r1+'</td><td style="text-align:center">'+r2+'</td><td style="text-align:center;font-weight:700">'+tot+'</td><td style="text-align:right">'+fNr(usc)+' USC</td><td>'+obs+'</td></tr>';
      }).join('')}
      <tr style="background:#f1f5f9;font-weight:800;border-top:2px solid #cbd5e1">
        <td>TOTAL</td>
        <td style="text-align:center">${rSemC.filter(o=>o.tipo==='R1').length}</td>
        <td style="text-align:center">${rSemC.filter(o=>o.tipo==='R2').length}</td>
        <td style="text-align:center;color:#7c6af7">${rTotQ}</td>
        <td style="text-align:right;color:#7c6af7">${fNr(rTotU)} USC</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Seção 5: Obras com vencimento no mês atual -->
<div class="secao">
  <div class="secao-titulo">5. Obras com Vencimento em ${mesAtualStr}</div>
  ${rVencMesAtual.length===0
    ? '<p style="color:#9ca3af;font-size:11px">Nenhuma obra com vencimento neste mês.</p>'
    : '<table><thead><tr><th>Nº Obra</th><th>Tipo</th><th>Cidade</th><th>Fiscal</th><th>Vencimento</th><th style="text-align:right">USC</th><th>Kaffa Final</th><th>Status</th></tr></thead><tbody>'
      + rVencMesAtual.sort((a,b)=>a.dataLimite>b.dataLimite?1:-1).map(o=>{
          const kf=(o.kaffaEntries||[]).find(k=>k.tipo==='final');
          const dr=diff(hoje_s,o.dataLimite);
          const pl=dr!==null&&dr>=0?'<span style="color:#16a34a">+'+dr+'d</span>':'<span style="color:#EF4444;font-weight:700">'+Math.abs(dr||0)+'d atraso</span>';
          return '<tr><td><strong>'+o.numero+'</strong></td><td>'+o.tipo+'</td><td>'+o.cidade+'</td><td>'+o.fiscal+'</td><td>'+fmtTxt(o.dataLimite)+' '+pl+'</td><td style="text-align:right">'+(o.usc||'—')+'</td><td>'+(kf?fmtTxt(kf.data):'—')+'</td><td style="font-size:9px">'+statusOf(o)+'</td></tr>';
        }).join('')
      + '</tbody></table>'
  }
</div>

<!-- Seção 6: Obras Atrasadas -->
<div class="secao">
  <div class="secao-titulo" style="color:#EF4444">6. Obras Atrasadas — Sem Conclusão (${rAtr.length})</div>
  ${rAtr.length===0
    ? '<p style="color:#16a34a;font-weight:700">✅ Nenhuma obra atrasada!</p>'
    : '<table><thead><tr><th>Nº Obra</th><th>Tipo</th><th>Cidade</th><th>Fiscal</th><th>Vencimento</th><th style="color:#EF4444">Atraso</th><th style="text-align:right">USC</th></tr></thead><tbody>'
      + rAtr.sort((a,b)=>a.dataLimite>b.dataLimite?1:-1).map(o=>{
          const da=diff(o.dataLimite,hoje_s);
          return '<tr style="background:#fef2f2"><td><strong style="color:#EF4444">'+o.numero+'</strong></td><td>'+o.tipo+'</td><td>'+o.cidade+'</td><td>'+o.fiscal+'</td><td>'+fmtTxt(o.dataLimite)+'</td><td style="color:#EF4444;font-weight:800">'+(da!==null?da+'d':'—')+'</td><td style="text-align:right">'+(o.usc||'—')+'</td></tr>';
        }).join('')
      + '<tfoot><tr style="font-weight:800;background:#fee2e2"><td colspan="6">Total: '+rAtr.length+' obras</td><td style="text-align:right">'+fNr(rAtr.reduce((s,o)=>s+(parseFloat(o.usc)||0),0))+' USC</td></tr></tfoot></table>'
  }
</div>

<div class="footer">
  <span>SPPC ARLAG · ${empNome} · ${periodoLabel}</span>
  <span>Relatório gerado em ${dataGer} via SPPC_ARLAG</span>
</div>

</body></html>`;

  // Abrir em nova janela (handle popup blocker)
  const win = window.open('', '_blank', 'width=1100,height=850,scrollbars=yes,resizable=yes');
  if(!win || win.closed || typeof win.closed === 'undefined'){
    // Popup bloqueado — copiar para clipboard e avisar
    toast('Popup bloqueado pelo navegador. Permita popups para este site e tente novamente.', 'err');
    return;
  }
  win.document.open();
  win.document.write(relHtml);
  win.document.close();
  fecharModalRelatorio();

  } catch(err) {
    console.error('Erro ao gerar relatório:', err);
    alert('Erro ao gerar relatório: ' + err.message);
  }
};

// ══════════════════════════════════════════════════════════════════════
//  OTIMIZAÇÃO DE OBRAS — Empreiteira (CS Eletricidade e Eletelsul)
// ══════════════════════════════════════════════════════════════════════
const EMP_COM_OTIMIZACAO = ['CS ELETRICIDADE','ELETELSUL'];

function renderOtimizacao(){
  const cont=document.getElementById('pgOtimizacaoContent'); if(!cont) return;
  if(me.perfil!=='empreiteira'||!EMP_COM_OTIMIZACAO.some(e=>me.vinculo?.toUpperCase().includes(e.split(' ')[0]))){
    cont.innerHTML='<div class="empty"><p>Acesso restrito.</p></div>'; return;
  }
  window._minhasObras = obras.filter(o=>o.empreiteira===me.vinculo&&!o.cancelado); // reset pool
  window._nivelDeslig = 1;
  window._tabAtiva = 'prox';
  const minhas=window._minhasObras.filter(o=>o.equipamentoRef);
  const dbReady=window._equipDB.size>0;
  cont.innerHTML=`
    <div style="margin-bottom:16px">
      <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:4px">⚡ Otimização de Obras</div>
      <div id="equipDBStatus" style="font-size:11px;color:var(--muted);margin-bottom:12px"></div>
      ${!dbReady?`<div style="padding:12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#EF4444;font-size:11px;margin-bottom:12px">
        ⚠️ Base de equipamentos não carregada. Solicite ao gerente que faça o upload do arquivo de equipamentos.
      </div>`:''}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button onclick="showOtimTab('prox')" id="tabOtimProx"
        style="padding:8px 18px;border-radius:6px;border:2px solid var(--accent);background:var(--accent);color:#000;font-weight:700;font-size:12px;cursor:pointer">
        📍 Proximidade Geográfica
      </button>
      <button onclick="showOtimTab('deslig')" id="tabOtimDeslig"
        style="padding:8px 18px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12px;cursor:pointer">
        🔌 Otimização de Desligamento
      </button>
    </div>
    <div id="otimTabContent">
      ${renderOtimProx(minhas)}
    </div>
  `;
  updateEquipDBStatus();
}

window.showOtimTab=function(tab, nivel){
  // Always set both state variables from parameters
  if(tab)   window._tabAtiva    = tab;
  if(nivel) window._nivelDeslig = parseInt(nivel);
  const tabAtiva   = window._tabAtiva    || 'prox';
  const nivelAtual = window._nivelDeslig || 1;
  // Always use fresh obras data (don't use stale cache)
  const minhas = obras.filter(o=>o.empreiteira===me.vinculo&&!o.cancelado);
  window._minhasObras = minhas;
  const cont = document.getElementById('otimTabContent');
  if(!cont){ console.warn('[Otim] otimTabContent não encontrado'); return; }
  try{
    cont.innerHTML = tabAtiva==='prox'
      ? renderOtimProx(minhas)
      : renderOtimDeslig(minhas.filter(o=>o.equipamentoRef), nivelAtual);
  }catch(err){
    console.error('[Otim] Erro ao renderizar:', err.message);
    cont.innerHTML = '<div class="modal-note" style="color:#EF4444">Erro: '+err.message+'</div>';
  }
  // Update tab button styles
  ['tabOtimProx','tabOtimDeslig'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const isProx = id==='tabOtimProx';
    const active = (tabAtiva==='prox')===isProx;
    el.style.background = active ? (isProx?'var(--accent)':'#ff6b35') : 'var(--surface)';
    el.style.color = active ? '#000' : 'var(--muted)';
  });
};

function renderOtimProx(obras_list){
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">📍 Encontrar obras próximas</div>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
        <div class="fg" style="margin:0;min-width:200px">
          <label>Equipamento de Referência (Obra)</label>
          <select id="selEquipProx" style="width:100%">
            <option value="">Selecione uma obra…</option>
            ${obras_list.map(o=>`<option value="${o.equipamentoRef}">${o.numero} — Equip. ${o.equipamentoRef} (${o.cidade})</option>`).join('')}
          </select>
        </div>
        <div class="fg" style="margin:0">
          <label>Raio (km)</label>
          <input type="number" id="inpRaio" value="2" min="0.1" max="50" step="0.1" style="width:80px">
        </div>
        <button onclick="buscarProximas()" class="btn btn-primary btn-sm">🔍 Buscar</button>
      </div>
      <div id="resultProx" style="font-size:11px;color:var(--muted)">Selecione um equipamento e defina o raio para buscar obras próximas.</div>
    </div>`;
}

window.buscarProximas=function(nrEquipParam, raioParam, todosParam){
  const nr=nrEquipParam||parseInt(document.getElementById('selEquipProx')?.value);
  const raio=raioParam||parseFloat(document.getElementById('inpRaio')?.value)||2;
  const eq=window._equipDB.get(nr);
  if(!eq||!eq.lat||!eq.lon){
    const el=document.getElementById('resultProx')||document.getElementById('resultProxPort');
    if(el) el.innerHTML='<span style="color:#EF4444">Equipamento não encontrado ou sem coordenadas na base.</span>';
    return;
  }
  const pool = todosParam
    || (me.perfil==='empreiteira'
        // Empreiteira: busca somente dentro das suas próprias obras
        ? obras.filter(o=>!o.cancelado&&o.equipamentoRef&&o.equipamentoRef!==nr&&o.empreiteira===me.vinculo)
        // Gerente/Fiscal: busca em todo o portfólio
        : obras.filter(o=>!o.cancelado&&o.equipamentoRef&&o.equipamentoRef!==nr));
  const resultados=[];
  pool.forEach(o=>{
    const eq2=window._equipDB.get(parseInt(o.equipamentoRef));
    if(!eq2||!eq2.lat||!eq2.lon) return;
    const dist=haversineKm(eq.lat,eq.lon,eq2.lat,eq2.lon);
    if(dist<=raio) resultados.push({o,dist:dist.toFixed(2),eq2});
  });
  resultados.sort((a,b)=>parseFloat(a.dist)-parseFloat(b.dist));
  const elId=todosParam?'resultProxPort':'resultProx';
  const cont=document.getElementById(elId); if(!cont) return;
  if(!resultados.length){
    cont.innerHTML=`<div style="color:var(--muted)">Nenhuma obra encontrada no raio de ${raio}km do equipamento ${nr}.</div>`;
    return;
  }
  cont.innerHTML=`<div style="margin-bottom:8px;font-weight:700;color:var(--accent)">${resultados.length} obra(s) no raio de ${raio}km:</div>
    <div class="tbl-wrap"><table>
    <thead><tr><th>Distância</th><th>Nº Obra</th><th>Equip. Ref.</th><th>Cidade</th><th>Empreiteira</th><th>Status</th><th>Alimentador</th></tr></thead>
    <tbody>${resultados.map(r=>`<tr>
      <td><strong style="color:var(--accent)">${r.dist}km</strong></td>
      <td><strong>${r.o.numero}</strong></td>
      <td>${r.o.equipamentoRef}</td>
      <td>${r.o.cidade||'—'}</td>
      <td>${r.o.empreiteira||'—'}</td>
      <td>${statusOf(r.o)}</td>
      <td style="color:var(--muted)">${r.eq2.feed||'—'}</td>
    </tr>`).join('')}</tbody>
    </table></div>`;
};

// Agrupa obras pela Nth chave de manobra mais próxima ao equipamento de referência
// nivel=1 → chave mais próxima (menor impacto); nivel=2 → próxima acima; etc.
function calcGruposDesligamento(obras_list, nivel=1){
  // Apenas obras SEM conclusão — não faz sentido otimizar obras já executadas
  const ativas = obras_list.filter(o => !o.conclusao && !o.cancelado);
  const obrasSwitches = [];
  ativas.forEach(o=>{
    if(!o.equipamentoRef) return;
    const chain = findSwitchChain(o.equipamentoRef);
    if(!chain.length) return; // sem ancestrais antes do RE (conectado diretamente)
    const idx = nivel - 1;
    if(idx >= chain.length) return; // nível solicitado além da profundidade disponível
    const sw = chain[idx]; // ponto de desligamento exato para este nível
    obrasSwitches.push({ o, sw, chain });
  });
  if(!obrasSwitches.length) return [];

  // Agrupa pelo nr da chave no nível selecionado
  const grupos = {};
  obrasSwitches.forEach(({o, sw, chain})=>{
    const key = sw.nr;
    if(!grupos[key]) grupos[key] = { sw, obras: [], chains:[] };
    grupos[key].obras.push(o);
    grupos[key].chains.push(chain);
  });

  // Retorna grupos com ≥1 obra (incluindo solos), ordenados por qtd
  return Object.values(grupos)
    .sort((a,b)=>b.obras.length-a.obras.length);
}

window._nivelDeslig = window._nivelDeslig || 1; // level state

function renderOtimDeslig(obras_list, nivel){
  if(nivel) window._nivelDeslig = nivel;
  const nivelAtual = window._nivelDeslig;
  // Seletor de nível sempre visível (não depende do DB)
  const btnNivelEarly = (n) =>
    `<button onclick="showOtimTab('deslig',${n})"
      style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:11px;font-weight:${nivelAtual===n?700:400};
        background:${nivelAtual===n?'var(--accent)':'var(--surface)'};color:${nivelAtual===n?'#000':'var(--muted)'}">
      ${n}ª Chave
    </button>`;
  const nivelSelectorHtml = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--muted);margin-right:4px">Nível de análise:</span>
    ${[1,2,3,4,5].map(btnNivelEarly).join('')}
    <span style="font-size:10px;color:var(--muted);margin-left:4px">↑ 1=mais próximo · 5=mais distante do ponto de trabalho</span>
  </div>`;

  if(!window._equipDB.size)
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px">
      ${nivelSelectorHtml}
      <div class="modal-note" style="color:#EF4444">⚠️ Base de equipamentos não carregada. Clique em "📡 Base Equipamentos" na barra de ferramentas.</div>
    </div>`;

  const grupos=calcGruposDesligamento(obras_list, nivelAtual);
  const sem_equip=obras_list.filter(o=>!o.equipamentoRef).length;
  const sem_db=obras_list.filter(o=>o.equipamentoRef&&!window._equipDB.get(parseInt(o.equipamentoRef))).length;

  const gruposMulti = grupos.filter(g=>g.obras.length>1);
  const gruposSolo  = grupos.filter(g=>g.obras.length===1);
  const semChave    = obras_list.filter(o=>!o.conclusao&&!o.cancelado&&o.equipamentoRef&&!findSwitchChain(o.equipamentoRef).length).length;
  const semEquipRef = obras_list.filter(o=>!o.conclusao&&!o.cancelado&&!o.equipamentoRef).length;
  const semNivel    = obras_list.filter(o=>{
    if(o.conclusao||o.cancelado||!o.equipamentoRef) return false;
    const chain=findSwitchChain(o.equipamentoRef);
    return chain.length>0 && (nivelAtual-1)>=chain.length;
  }).length;

  const btnNivel = btnNivelEarly; // reusa o seletor já definido acima

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px">
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">🔌 Otimização de Desligamento</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:12px">
        Nível 1 = pai direto do equipamento de referência (menor impacto).
        Subindo de nível, o trecho desligado aumenta — e mais obras podem ser agrupadas.
        Limite: primeiro Religador (RE) acima na hierarquia.
      </div>

      <!-- Seletor de nível (gerado acima e reutilizado) -->
      ${nivelSelectorHtml}
      <!-- Busca por chave de abertura -->
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;padding:10px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
        <div class="fg" style="margin:0;min-width:160px">
          <label style="font-size:10px">🔎 Buscar por Chave de Abertura (Nº Equipamento)</label>
          <input type="number" id="inpChaveBusca" placeholder="ex: 81094">
        </div>
        <button onclick="buscarPorChave()" class="btn btn-secondary btn-sm">Buscar</button>
      </div>
      <div id="resultChave" style="font-size:11px;color:var(--muted);margin-bottom:12px"></div>

      ${!gruposMulti.length
        ? `<div style="padding:14px;background:rgba(124,106,247,.07);border-radius:8px;border:1px solid var(--border)">
            <div style="font-weight:700;margin-bottom:6px">Nenhuma oportunidade de otimização no ${nivelAtual}° nível</div>
            <div style="font-size:11px;color:var(--muted)">
              Não há duas obras com a mesma ${nivelAtual}ª chave de manobra no caminho até o religador.
              ${nivelAtual<5?'Tente aumentar o nível de análise para ampliar o trecho analisado.':'Você atingiu o limite máximo de análise.'}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:8px">
              ${semChave>0?semChave+' obra(s) conectadas diretamente ao religador (sem chave de campo no caminho).':''}
              ${semEquipRef>0?' | '+semEquipRef+' obra(s) sem equipamento de referência.':''}
            </div>
           </div>`
        : `<div style="font-size:11px;color:var(--accent);font-weight:700;margin-bottom:12px">
            ${gruposMulti.length} agrupamento(s) encontrado(s) — ${gruposMulti.reduce((s,g)=>s+g.obras.length,0)} obras podem ser otimizadas
           </div>
           ${gruposMulti.map(g=>{
            const swEq = window._equipDB.get(g.sw.nr)||{};
            const swInfo = `Equip. ${g.sw.nr} (${g.sw.sg})${swEq.mun?' · '+swEq.mun:''}`;
            return `<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;border-left:3px solid var(--accent)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">
                <div>
                  <span style="font-weight:700;color:var(--accent)">${g.obras.length} obras</span>
                  <span style="background:rgba(124,106,247,.15);color:var(--accent);font-size:10px;padding:2px 8px;border-radius:4px;margin-left:8px">
                    🔌 Abrir: <strong>${swInfo}</strong>
                  </span>
                  ${g.sw.sg==='RE'?'<span style="font-size:9px;color:#EF4444;margin-left:6px">⚠️ Religador — limite do trecho</span>':''}
                </div>
                <div style="font-size:10px;color:var(--muted)">Alimentador: ${g.sw.feed||'—'}</div>
              </div>
              <div class="tbl-wrap"><table>
                <thead><tr><th>Nº Obra</th><th>Equip. Ref.</th><th>Cidade</th><th>Status</th><th>USC</th><th>Cadeia de chaves</th></tr></thead>
                <tbody>${g.obras.map((o,oi)=>{
                  const chain = g.chains[oi]||[];
                  const chainStr = chain.map(c=>`${c.nr}(${c.sg})`).join(' → ');
                  return `<tr>
                    <td><strong>${o.numero}</strong></td>
                    <td>${o.equipamentoRef}</td>
                    <td>${o.cidade||'—'}</td>
                    <td>${statusOf(o)}</td>
                    <td>${o.usc||'—'}</td>
                    <td style="font-size:9px;color:var(--muted)">${chainStr||'—'}</td>
                  </tr>`;
                }).join('')}</tbody>
              </table></div>
            </div>`;
          }).join('')}`
      }
      <div style="font-size:10px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        ${gruposSolo.length>0?gruposSolo.length+' obra(s) sem par de agrupamento neste nível. ':''}
        ${semNivel>0?semNivel+' obra(s) com cadeia mais curta que o nível '+nivelAtual+' (tente nível menor). ':''}
        ${semChave>0?semChave+' obra(s) conectadas diretamente ao RE (sem ancestral). ':''}
        ${semEquipRef>0?semEquipRef+' obra(s) sem equipamento de referência. ':''}
        ${obras_list.filter(o=>o.conclusao).length>0?obras_list.filter(o=>o.conclusao).length+' obra(s) concluídas (excluídas). ':''}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
//  OTIMIZAÇÃO DE PORTFÓLIO — Gerente/Fiscal
// ══════════════════════════════════════════════════════════════════════
function renderOtimizacaoPortfolio(){
  const cont=document.getElementById('pgOtimPortContent'); if(!cont) return;
  if(!['gerente','fiscal','fiscal_adm'].includes(me.perfil)){
    cont.innerHTML='<div class="empty"><p>Acesso restrito.</p></div>'; return;
  }
  const ativas=obras.filter(o=>!o.cancelado);
  cont.innerHTML=`
    <div style="margin-bottom:16px">
      <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:4px">🌐 Otimização de Portfólio</div>
      <div id="equipDBStatus" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
    </div>

    <!-- Busca por equipamento -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">🔍 Buscar por Equipamento de Referência</div>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
        <div class="fg" style="margin:0;min-width:160px">
          <label>Nº Equipamento</label>
          <input type="number" id="inpEquipBusca" placeholder="ex: 28403">
        </div>
        <div class="fg" style="margin:0">
          <label>Raio (km)</label>
          <input type="number" id="inpRaioPort" value="2" min="0.1" max="50" step="0.1" style="width:80px">
        </div>
        <button onclick="buscarPortfolio()" class="btn btn-primary btn-sm">🔍 Buscar</button>
      </div>
      <div id="resultProxPort" style="font-size:11px;color:var(--muted)">Digite um número de equipamento para encontrar obras próximas em todo o portfólio.</div>
    </div>

    <!-- Busca por chave de abertura -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">🔎 Buscar por Chave de Abertura</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
        <div class="fg" style="margin:0;min-width:180px">
          <label>Nº do Equipamento de Abertura</label>
          <input type="number" id="inpChaveBuscaPort" placeholder="ex: 81094">
        </div>
        <button onclick="buscarPorChave()" class="btn btn-primary btn-sm">🔍 Buscar no Portfólio</button>
      </div>
      <div id="resultChavePort" style="font-size:11px;color:var(--muted)">Digite o número do equipamento (chave, seccionalizador, etc.) para encontrar obras que dependem dele.</div>
    </div>

    <!-- Desligamento geral -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px">
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">🔌 Agrupamentos por Desligamento — Todo o Portfólio</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:16px">
        Obras de diferentes empreiteiras que compartilham o mesmo alimentador
      </div>
      ${renderDesligamentoPortfolio(ativas, window._nivelPort||1)}
    </div>
  `;
  updateEquipDBStatus();
}

window.buscarPortfolio=function(){
  const nr=parseInt(document.getElementById('inpEquipBusca')?.value);
  const raio=parseFloat(document.getElementById('inpRaioPort')?.value)||2;
  if(!nr){ toast('Digite um número de equipamento.','err'); return; }
  buscarProximas(nr, raio, obras.filter(o=>!o.cancelado&&o.equipamentoRef));
};

window._nivelPort = window._nivelPort || 1;

function renderDesligamentoPortfolio(obras_list, nivel){
  if(nivel) window._nivelPort = nivel;
  const nivelAtual = window._nivelPort;
  const com_ref=obras_list.filter(o=>o.equipamentoRef);
  if(!com_ref.length) return '<div class="modal-note">Nenhuma obra com equipamento de referência cadastrado.</div>';
  if(!window._equipDB.size) return '<div class="modal-note" style="color:#EF4444">Base de equipamentos não carregada.</div>';

  const grupos=calcGruposDesligamento(com_ref, nivelAtual);
  const multi=grupos.filter(g=>g.obras.length>1);

  const btnN=(n)=>`<button onclick="window._nivelPort=${n};renderOtimizacaoPortfolio()"
    style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:11px;font-weight:${nivelAtual===n?700:400};
      background:${nivelAtual===n?'#ff6b35':'var(--surface)'};color:${nivelAtual===n?'#000':'var(--muted)'}">
    ${n}ª Chave</button>`;

  return `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--muted)">Nível de análise:</span>
      ${[1,2,3,4,5].map(btnN).join('')}
    </div>
    ${!multi.length
      ? '<div class="modal-note">Nenhum agrupamento encontrado neste nível.</div>'
      : multi.map(g=>{
          const emps=[...new Set(g.obras.map(o=>o.empreiteira).filter(Boolean))];
          const swEq=window._equipDB.get(g.sw.nr)||{};
          return `<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;border-left:3px solid #ff6b35">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">
              <div>
                <span style="font-weight:700;color:#ff6b35">${g.obras.length} obras</span>
                <span style="background:rgba(255,107,53,.15);color:#ff6b35;font-size:10px;padding:2px 8px;border-radius:4px;margin-left:8px">
                  🔌 Abrir: Equip. ${g.sw.nr} (${g.sw.sg})${swEq.mun?' · '+swEq.mun:''}
                </span>
                <span style="font-size:10px;color:var(--muted);margin-left:8px">${emps.join(' + ')}</span>
                ${g.sw.sg==='RE'?'<span style="font-size:9px;color:#EF4444;margin-left:6px">⚠️ Religador</span>':''}
              </div>
            </div>
            <div class="tbl-wrap"><table>
              <thead><tr><th>Nº Obra</th><th>Equip. Ref.</th><th>Cidade</th><th>Empreiteira</th><th>Status</th><th>USC</th><th>Cadeia</th></tr></thead>
              <tbody>${g.obras.map((o,oi)=>{
                const chain=g.chains[oi]||[];
                return `<tr>
                  <td><strong>${o.numero}</strong></td>
                  <td>${o.equipamentoRef}</td>
                  <td>${o.cidade||'—'}</td>
                  <td style="color:var(--accent)">${o.empreiteira||'—'}</td>
                  <td>${statusOf(o)}</td>
                  <td>${o.usc||'—'}</td>
                  <td style="font-size:9px;color:var(--muted)">${chain.map(c=>c.nr+'('+c.sg+')').join(' → ')||'—'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>
          </div>`;
        }).join('')
    }`;
}

// ══════════════════════════════════════════════════════════════════════
//  LOCAL DE TRABALHO — registrado pelo fiscal
// ══════════════════════════════════════════════════════════════════════
let _locaisPendentes = [];

window.adicionarLocal = function(){
  const desc = document.getElementById('oLocalDesc')?.value?.trim();
  if(!desc){ toast('Descreva o local de trabalho.','err'); return; }
  const id = `loc_${Date.now()}`;
  _locaisPendentes.push({ id, data: hojeStr(), descricao: desc });
  document.getElementById('oLocalDesc').value = '';
  document.getElementById('frmNovoLocal').style.display = 'none';
  document.getElementById('btnNovoLocal').style.display = 'inline-flex';
  renderLocais();
};

function renderLocais(){
  const container = document.getElementById('listaLocais'); if(!container) return;
  const obraId = document.getElementById('obraId')?.value;
  const obra = obras.find(o=>o.id===obraId);
  const todos = [...(obra?.locaisTrabalho||[]), ..._locaisPendentes];
  if(!todos.length){ container.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Nenhum local registrado.</div>'; return; }
  container.innerHTML = todos.map(l=>`
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;margin-bottom:4px">
      <span style="font-size:10px;color:var(--muted);white-space:nowrap">${fmtTxt(l.data)}</span>
      <span style="font-size:11px;flex:1">${l.descricao}</span>
      ${_locaisPendentes.some(p=>p.id===l.id)?`<button onclick="removerLocal('${l.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px">✕</button>`:''}
    </div>`).join('');
}

window.removerLocal = function(id){
  _locaisPendentes = _locaisPendentes.filter(l=>l.id!==id);
  renderLocais();
};

// ══════════════════════════════════════════════════════════════════════
//  BUSCA POR CHAVE DE ABERTURA no Portfólio e Otimização
// ══════════════════════════════════════════════════════════════════════
window.buscarPorChave = function(poolParam){
  const nr = parseInt(document.getElementById('inpChaveBusca')?.value || document.getElementById('inpChaveBuscaPort')?.value);
  if(!nr || isNaN(nr)){ toast('Digite o número do equipamento de abertura.','err'); return; }
  if(!window._equipDB.size){
    toast('⚠️ Base de equipamentos não carregada. Clique em "📡 Base Equipamentos" para carregar.','warn');
    return;
  }
  // Verifica se o equipamento digitado existe na base
  if(!window._equipDB.get(nr)){
    toast(`Equipamento ${nr} não encontrado na base de equipamentos.`,'warn');
    return;
  }
  // Empreiteira: somente suas obras. Fiscal/Gerente/FiscalAdm: todo o portfólio
  const pool = poolParam || (
    me.perfil==='empreiteira'
      ? obras.filter(o=>!o.cancelado&&o.equipamentoRef&&o.empreiteira===me.vinculo)
      : obras.filter(o=>!o.cancelado&&o.equipamentoRef)
  );
  const resultado = [];
  let semEquipRef=0, semChain=0, comChain=0;
  pool.forEach(o=>{
    if(!o.equipamentoRef){ semEquipRef++; return; }
    const chain = findSwitchChain(o.equipamentoRef);
    if(!chain.length){ semChain++; return; }
    comChain++;
    if(chain.some(c=>c.nr===nr)) resultado.push({o, chain, nivel: chain.findIndex(c=>c.nr===nr)+1});
  });
  console.log(`[BuscaChave] Equip ${nr}: pool=${pool.length} semEquipRef=${semEquipRef} semChain=${semChain} comChain=${comChain} resultado=${resultado.length}`);
  // Usa o elemento que existir no DOM atual (dependendo da aba ativa)
  const cont = document.getElementById('resultChave') || document.getElementById('resultChavePort');
  if(!cont){ console.warn('[BuscaChave] Nenhum elemento de resultado encontrado.'); return; }
  if(!resultado.length){
    cont.innerHTML = `<div style="color:var(--muted);font-size:11px">Nenhuma obra encontrada na cadeia de desligamento do equipamento ${nr}.</div>`;
    return;
  }
  cont.innerHTML = `
    <div style="font-weight:700;color:var(--accent);margin-bottom:8px">${resultado.length} obra(s) desligadas pela chave <strong>${nr}</strong>:</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Nº Obra</th><th>Equip. Ref.</th><th>Cidade</th><th>Empreiteira</th><th>Status</th><th>Nível</th></tr></thead>
      <tbody>${resultado.map(r=>`<tr>
        <td><strong>${r.o.numero}</strong></td>
        <td>${r.o.equipamentoRef}</td>
        <td>${r.o.cidade||'—'}</td>
        <td style="color:var(--accent)">${r.o.empreiteira||'—'}</td>
        <td>${statusOf(r.o)}</td>
        <td><span style="background:var(--accent);color:#000;padding:1px 8px;border-radius:10px;font-size:9px">${r.nivel}° nível</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
};

// ══════════════════════════════════════════════════════════════════════
//  DASHBOARD SUMMARIES — Fiscal e Empreiteira
// ══════════════════════════════════════════════════════════════════════
function renderDashSummaryFiscal(minhas){
  const fimMes = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().split('T')[0];
  const ativas = minhas.filter(o=>!o.cancelado&&!o.armazenado);
  // Bug 5: obra aparece em apenas 1 card (maior prioridade ganha)
  // Prioridade: med280urg > agMed > agFisc
  const agFisc_all  = ativas.filter(o=>o.conclusao&&!o.fiscalizacao);
  const agMed_all   = ativas.filter(o=>o.fiscalizacao&&!o.medicao&&o.tipo!=='ODI');
  const med280urg   = ativas.filter(o=>{
    if(!o.medida230||!o.kaffa||o.medicao||o.medida280) return false;
    const p=prazoMedida280(o);
    return p && p<=fimMes;
  });

  // Prioridade: obra aparece em apenas 1 card (mais urgente ganha)
  const med280Ids = new Set(med280urg.map(o=>o.id));
  const agMed_allIds = new Set(agMed_all.map(o=>o.id));
  const agMed  = agMed_all.filter(o=>!med280Ids.has(o.id));
  const agFisc = agFisc_all.filter(o=>!med280Ids.has(o.id)&&!agMed_allIds.has(o.id));

  const cardStyle = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px';

  function hexRgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)].join(','); }

  function listaComCiente(list, campo, tipo, cor){
    if(!list.length) return `<div style="font-size:11px;color:var(--muted)">Nenhuma obra. ✓</div>`;
    // Mostra TODAS as obras (sem limite) — Bug 3 fix
    return list.map(o=>{
      const visto = !!o[campo];
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;
        background:${visto?'rgba(34,197,94,.08)':'rgba('+hexRgb(cor)+',.07)'};
        border:1px solid ${visto?'#22C55E55':cor+'55'};border-radius:6px;
        transition:background .3s">
        <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${visto?'#22C55E':cor}"></span>
        <strong style="color:var(--accent);font-size:11px;cursor:pointer" onclick="showPage('pgObras')">${o.numero}</strong>
        <span style="font-size:10px;color:var(--muted);flex:1">${o.cidade||'—'} · ${o.empreiteira||'—'}</span>
        ${!visto
          ?`<button onclick="marcarCiente('${o.id}','${tipo}')"
              style="background:${cor};color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap">
              ✓ Ciente
            </button>`
          :`<span style="font-size:9px;color:#22C55E;font-weight:700;white-space:nowrap">✓ Ciente</span>`}
      </div>`;
    }).join('');
  }

  function badge(n, cor){ return n>0?`<span style="background:#EF4444;color:#fff;padding:1px 7px;border-radius:8px;font-size:9px;margin-left:6px">${n} nova(s)</span>`:''; }

  return `
    <div style="${cardStyle};border-left:3px solid #3B82F6">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-weight:700;font-size:12px">🔍 Aguardando Fiscalização</span>${badge(agFisc.filter(o=>!o.cienFisc).length,'#3B82F6')}</div>
        <span style="background:#3B82F6;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${agFisc.length}</span>
      </div>
      ${listaComCiente(agFisc,'cienFisc','fisc','#3B82F6')}
    </div>
    <div style="${cardStyle};border-left:3px solid #F59E0B">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-weight:700;font-size:12px">📐 Aguardando Medição</span>${badge(agMed.filter(o=>!o.cienMed).length,'#F59E0B')}</div>
        <span style="background:#F59E0B;color:#000;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${agMed.length}</span>
      </div>
      ${listaComCiente(agMed,'cienMed','med','#F59E0B')}
    </div>
    <div style="${cardStyle};border-left:3px solid #EF4444">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-weight:700;font-size:12px">🚨 Med.280 — Fechar Este Mês — Pendente Medição</span>${badge(med280urg.filter(o=>!o.cienMed280).length,'#EF4444')}</div>
        <span style="background:#EF4444;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${med280urg.length}</span>
      </div>
      ${listaComCiente(med280urg,'cienMed280','med280','#EF4444')}
    </div>`;
}

function renderDashSummaryEmpreiteira(minhas){
  const fimMes = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().split('T')[0];
  const ativas = minhas.filter(o=>!o.cancelado&&!o.armazenado&&!o.conclusao);
  // agKaffa vem de 'minhas' (não de 'ativas' que exclui obras com conclusão)
  // Lógica: obra COM conclusão informada + SEM kaffa registrado = fiscal deve ser avisado
  const agKaffa = minhas.filter(o => !o.cancelado && !o.armazenado && o.conclusao && !o.kaffa);
  // Kaffa urgente PENDENTE KAFFA: obra com medida 230, sem kaffa registrado, sem med.280, prazo vence este mês
  const kaffaUrgente = minhas.filter(o=>{
    if(!o.medida230 || o.medida280 || o.armazenado) return false;
    if(o.kaffa) return false; // kaffa já registrado → não incluir
    const prazo280 = prazoMedida280(o);
    return prazo280 && prazo280 <= fimMes;
  });

  const cardStyle = "background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px";
  const listaObras = list => list.length===0
    ? `<div style="font-size:11px;color:var(--muted)">Nenhuma obra nesta situação. ✓</div>`
    : `<div style="display:flex;flex-direction:column;gap:4px">${list.map(o=>
        `<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 8px;background:var(--bg);border-radius:4px;cursor:pointer" onclick="showPage('pgObras')">
          <strong style="color:var(--accent)">${o.numero}</strong>
          <span style="color:var(--muted)">${o.cidade||'—'}</span>
          <span style="color:var(--muted)">${statusOf(o)}</span>
        </div>`).join('')}
    </div>`;

  return `
    <div style="${cardStyle};border-left:3px solid #7c6af7">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:700;font-size:12px">⚡ Aguardando Registro de Kaffa</div>
        <span style="background:#7c6af7;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${agKaffa.length}</span>
      </div>
      ${listaObras(agKaffa)}
    </div>
    <div style="${cardStyle};border-left:3px solid #EF4444">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:700;font-size:12px">🚨 Medida 280 — Fechar Este Mês — Pendente Kaffa</div>
        <span style="background:#EF4444;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${kaffaUrgente.length}</span>
      </div>
      ${listaObras(kaffaUrgente)}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
//  ENQUADRAMENTO — mostra/oculta conforme tipo
// ══════════════════════════════════════════════════════════════════════
window.toggleEnquadramento = function(){
  const tipo = document.getElementById('oTipo')?.value;
  // Enquadramento: apenas R1
  const fg = document.getElementById('fgEnquadramento');
  if(fg) fg.style.display = tipo === 'R1' ? 'flex' : 'none';
  // Programa: R1 → automático (Regulatório, campo oculto); R2 → usuário escolhe
  const fgProg = document.getElementById('fgPrograma');
  const sel    = document.getElementById('oPrograma');
  if(tipo === 'R1'){
    if(sel) sel.value = 'Regulatório';
    if(fgProg) fgProg.style.display = 'none';
  } else if(tipo === 'R2'){
    if(fgProg) fgProg.style.display = 'flex';
    // Remove Regulatório from options for R2
    if(sel && sel.querySelector('option[value="Regulatório"]')){
      [...sel.querySelectorAll('option')].forEach(o=>{
        o.style.display = o.value === 'Regulatório' ? 'none' : '';
      });
      if(sel.value === 'Regulatório') sel.value = '';
    }
  } else {
    if(fgProg) fgProg.style.display = 'none';
  }
};

// ══════════════════════════════════════════════════════════════════════
//  FAVORITOS — cada usuário pode favoritar obras com nota
// ══════════════════════════════════════════════════════════════════════
window.toggleFavorito = async function(obraId){
  const favs = await getFavoritos();
  const jaFav = favs.some(f=>f.obraId===obraId);
  if(jaFav){
    const novos = favs.filter(f=>f.obraId!==obraId);
    await saveFavoritos(novos);
  } else {
    favs.push({obraId, nota:'', favoritadoEm: hojeStr()});
    await saveFavoritos(favs);
  }
  renderDash();
};

window.salvarNotaFavorito = async function(obraId){
  try{
    const favs = await getFavoritos();
    const fav = favs.find(f=>f.obraId===obraId);
    const nota = document.getElementById('notaFav_'+obraId)?.value||'';
    if(fav){ fav.nota=nota; await saveFavoritos(favs); toast('✓ Nota salva.','ok'); }
    else { toast('Obra não está nos favoritos.','warn'); }
  }catch(e){ toast('Erro ao salvar: '+e.message,'err'); }
};

async function getFavoritos(){
  try{
    const snap = await getDoc(doc(db,'usuarios',me.uid));
    return Array.isArray(snap.data()?.favoritos) ? snap.data().favoritos : [];
  }catch(e){ console.warn('[Favoritos] getFavoritos error:',e.message); return []; }
}

async function saveFavoritos(favs){
  try{
    // Use setDoc with merge to handle both create and update
    await setDoc(doc(db,'usuarios',me.uid),{favoritos:favs},{merge:true});
  }catch(e){
    console.error('[Favoritos] saveFavoritos error:',e.message);
    throw e;
  }
}

async function renderDashFavoritos(html_ref){
  const favs = await getFavoritos();
  if(!favs.length) return '';
  const obrasFav = favs.map(f=>({...obras.find(o=>o.id===f.obraId), _nota:f.nota, _favId:f.obraId})).filter(o=>o.id);
  if(!obrasFav.length) return '';
  return `
    <div style="background:var(--surface);border:1px solid #F59E0B55;border-left:3px solid #F59E0B;border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:#F59E0B;margin-bottom:12px">⭐ Obras Favoritas</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${obrasFav.map(o=>`
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
              <strong style="color:var(--accent);cursor:pointer;font-size:12px" onclick="openObraModal('${o.id}')">${o.numero}</strong>
              <span style="font-size:10px;color:var(--muted)">${o.cidade||'—'} · ${o.tipo||'—'}</span>
              <span style="font-size:10px;background:var(--surface2);padding:1px 8px;border-radius:8px">${statusOf(o)}</span>
              <button onclick="toggleFavorito('${o.id}')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:11px;margin-left:auto">✕ Remover</button>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <textarea id="notaFav_${o.id}" style="flex:1;font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);resize:none;height:40px" placeholder="Adicione uma nota sobre esta obra...">${o._nota||''}</textarea>
              <button onclick="salvarNotaFavorito('${o.id}')" class="btn btn-secondary btn-sm" style="font-size:10px">Salvar</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
//  ABA "ABERTURA DE OBRAS" — Gerente
// ══════════════════════════════════════════════════════════════════════
function renderAberturaObras(){
  const cont = document.getElementById('pgAberturaContent');
  if(!cont) return;

  const EMP = ['CS ELETRICIDADE','ELETELSUL'];
  const hoje = new Date();
  const meses12 = [];
  for(let i=11;i>=0;i--){
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    meses12.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const mLabel = ym => { const [y,m]=ym.split('-'); return `${m}/${y.slice(2)}`; };

  // Filter apenas obras RD (R1+R2)
  const obrasRD = obras.filter(o=>(o.tipo==='R1'||o.tipo==='R2')&&!o.cancelado);

  // Build data: {empreiteira: {tipo: {mes: {qtd,usc}}}}
  function buildData(pool){
    const data = {};
    pool.forEach(o=>{
      const emp = EMP.includes(o.empreiteira?.toUpperCase()) ? o.empreiteira : 'Outros';
      const tipo = o.tipo||'R1';
      const ab = o.dataAbertura||'';
      const mes = ab.slice(0,7); // YYYY-MM
      if(!meses12.includes(mes)) return;
      if(!data[emp]) data[emp]={};
      if(!data[emp][tipo]) data[emp][tipo]={};
      if(!data[emp][tipo][mes]) data[emp][tipo][mes]={qtd:0,usc:0};
      data[emp][tipo][mes].qtd++;
      data[emp][tipo][mes].usc += parseFloat(o.usc)||0;
    });
    return data;
  }

  function renderGrafico(data, titulo, cor, pool){
    const tipos = ['R1','R2'];
    const cores = {R1:cor, R2:cor+'88'};
    const colW = 52, barH = 90, topP = 44, botP = 24, padL = 6;
    const svgW = padL + meses12.length * colW * 2 + padL;

    const totaisMes = meses12.map(m=>{
      let qtd=0, usc=0, r1q=0, r2q=0, r1u=0, r2u=0;
      tipos.forEach(t=>{
        const v=data?.[t]?.[m]; if(!v) return;
        qtd+=v.qtd; usc+=v.usc;
        if(t==='R1'){r1q+=v.qtd;r1u+=v.usc;}else{r2q+=v.qtd;r2u+=v.usc;}
      });
      return {m,qtd,usc,r1q,r2q,r1u,r2u};
    });
    const maxQ = Math.max(...totaisMes.map(t=>t.qtd),1);

    const svgH = topP+barH+botP;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
    svg += `<line x1="${padL}" y1="${topP+barH}" x2="${svgW-padL}" y2="${topP+barH}" stroke="#374151" stroke-width="1"/>`;

    // BARRAS: obras por tipo
    meses12.forEach((m,i)=>{
      tipos.forEach((tipo,ti)=>{
        const v=data?.[tipo]?.[m]; const qtd=v?.qtd||0;
        const x=padL+i*colW*2+ti*colW; const cx=x+colW/2;
        const bh=qtd>0?Math.max(5,Math.round((qtd/maxQ)*barH)):0;
        const by=topP+barH-bh;
        if(bh>0){
          svg+=`<rect x="${x+2}" y="${by}" width="${colW-4}" height="${bh}" rx="3" fill="${cores[tipo]}" opacity="0.85"/>`;
          svg+=`<text x="${cx}" y="${by-4}" text-anchor="middle" font-size="10" font-weight="800" fill="${cores[tipo]}">${qtd}</text>`;
        }
        svg+=`<text x="${cx}" y="${topP+barH+12}" text-anchor="middle" font-size="7.5" fill="#9ca3af">${tipo}</text>`;
      });
      const cx=padL+i*colW*2+colW;
      svg+=`<text x="${cx}" y="${topP+barH+22}" text-anchor="middle" font-size="8" font-weight="600" fill="#9ca3af">${mLabel(m)}</text>`;
    });

    // LINHAS USC: R1=laranja, R2=vermelho, Total=verde
    const maxUSC = Math.max(...totaisMes.map(t=>t.usc), 1);
    function uscY(u){ return topP+barH - Math.round((u/maxUSC)*barH); }
    function mCx(i){ return padL + i*colW*2 + colW; }

    const ptsR1=meses12.map((m,i)=>`${mCx(i)},${uscY(totaisMes[i].r1u)}`).join(' ');
    const ptsR2=meses12.map((m,i)=>`${mCx(i)},${uscY(totaisMes[i].r2u)}`).join(' ');
    const ptsTot=meses12.map((m,i)=>`${mCx(i)},${uscY(totaisMes[i].usc)}`).join(' ');

    svg+=`<polyline points="${ptsR1}" fill="none" stroke="#F97316" stroke-width="2" stroke-dasharray="4 2" opacity="0.9"/>`;
    svg+=`<polyline points="${ptsR2}" fill="none" stroke="#EF4444" stroke-width="2" stroke-dasharray="4 2" opacity="0.9"/>`;
    svg+=`<polyline points="${ptsTot}" fill="none" stroke="#22C55E" stroke-width="2.5" opacity="0.95"/>`;

    // Pontos nas linhas
    meses12.forEach((m,i)=>{
      const cx=mCx(i);
      if(totaisMes[i].r1u>0){svg+=`<circle cx="${cx}" cy="${uscY(totaisMes[i].r1u)}" r="3" fill="#F97316"/><text x="${cx}" y="${uscY(totaisMes[i].r1u)-6}" text-anchor="middle" font-size="8" fill="#F97316">${Math.round(totaisMes[i].r1u)}</text>`;}
      if(totaisMes[i].r2u>0){svg+=`<circle cx="${cx}" cy="${uscY(totaisMes[i].r2u)}" r="3" fill="#EF4444"/>`;}
      if(totaisMes[i].usc>0){svg+=`<circle cx="${cx}" cy="${uscY(totaisMes[i].usc)}" r="3" fill="#22C55E"/>`;}
    });

    // Legenda linhas USC
    const lx=svgW-150;
    svg+=`<rect x="${lx}" y="4" width="148" height="34" rx="4" fill="var(--surface)" opacity="0.9"/>`;
    svg+=`<line x1="${lx+6}" y1="14" x2="${lx+24}" y2="14" stroke="#F97316" stroke-width="2" stroke-dasharray="4 2"/><text x="${lx+28}" y="17" font-size="8" fill="#F97316">USC R1</text>`;
    svg+=`<line x1="${lx+6}" y1="24" x2="${lx+24}" y2="24" stroke="#EF4444" stroke-width="2" stroke-dasharray="4 2"/><text x="${lx+28}" y="27" font-size="8" fill="#EF4444">USC R2</text>`;
    svg+=`<line x1="${lx+80}" y1="14" x2="${lx+98}" y2="14" stroke="#22C55E" stroke-width="2.5"/><text x="${lx+102}" y="17" font-size="8" fill="#22C55E">USC Total</text>`;
    svg+='</svg>';

    const totalQ=totaisMes.reduce((s,t)=>s+t.qtd,0);
    const totalUSC=totaisMes.reduce((s,t)=>s+t.usc,0);
    const r1Q=totaisMes.reduce((s,t)=>s+t.r1q,0); const r1USC=totaisMes.reduce((s,t)=>s+t.r1u,0);
    const r2Q=totaisMes.reduce((s,t)=>s+t.r2q,0); const r2USC=totaisMes.reduce((s,t)=>s+t.r2u,0);

    // USC monthly table
    const uscTable = `<div style="overflow-x:auto;margin-top:14px"><table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr style="background:var(--surface2)">
        <th style="padding:5px 8px;text-align:left">Mês</th>
        <th style="padding:5px 8px;text-align:right;color:${cor}">R1 Obras</th>
        <th style="padding:5px 8px;text-align:right;color:${cor}">R1 USC</th>
        <th style="padding:5px 8px;text-align:right;color:${cor}88">R2 Obras</th>
        <th style="padding:5px 8px;text-align:right;color:${cor}88">R2 USC</th>
        <th style="padding:5px 8px;text-align:right;font-weight:700">Total USC</th>
        <th style="padding:5px 8px;text-align:right;color:#22C55E">ULV Med.</th>
      </tr></thead>
      <tbody>${totaisMes.filter(t=>t.qtd>0).map(t=>`
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 8px;font-weight:600">${mLabel(t.m)}</td>
          <td style="padding:4px 8px;text-align:right">${t.r1q}</td>
          <td style="padding:4px 8px;text-align:right;color:${cor}">${t.r1u.toFixed(1)}</td>
          <td style="padding:4px 8px;text-align:right">${t.r2q}</td>
          <td style="padding:4px 8px;text-align:right;color:${cor}88">${t.r2u.toFixed(1)}</td>
          <td style="padding:4px 8px;text-align:right;font-weight:700">${t.usc.toFixed(1)}</td>
        </tr>`).join('')}
        <tr style="background:var(--surface2);font-weight:700">
          <td style="padding:5px 8px">TOTAL</td>
          <td style="padding:5px 8px;text-align:right">${r1Q}</td>
          <td style="padding:5px 8px;text-align:right;color:${cor}">${r1USC.toFixed(1)}</td>
          <td style="padding:5px 8px;text-align:right">${r2Q}</td>
          <td style="padding:5px 8px;text-align:right;color:${cor}88">${r2USC.toFixed(1)}</td>
          <td style="padding:5px 8px;text-align:right">${totalUSC.toFixed(1)}</td>
        </tr>
      </tbody></table></div>`;

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:800">${titulo}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">
              <span style="color:${cor}">■ R1</span> &nbsp; <span style="color:${cor}88">■ R2</span> &nbsp;—&nbsp; últimos 12 meses
            </div>
          </div>
          <div style="display:flex;gap:16px;flex-shrink:0;flex-wrap:wrap">
            <div style="text-align:center"><div style="font-size:22px;font-weight:800;color:${cor}">${totalQ}</div><div style="font-size:9px;color:var(--muted)">OBRAS TOTAL</div></div>
            <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:${cor}">${totalUSC.toFixed(0)}</div><div style="font-size:9px;color:var(--muted)">USC TOTAL</div></div>
            <div style="text-align:center"><div style="font-size:13px;font-weight:700;color:${cor}">${r1Q}<br><span style="font-size:9px">obras R1</span></div><div style="font-size:9px;color:var(--muted)">${r1USC.toFixed(0)} USC</div></div>
            <div style="text-align:center"><div style="font-size:13px;font-weight:700;color:${cor}88">${r2Q}<br><span style="font-size:9px">obras R2</span></div><div style="font-size:9px;color:var(--muted)">${r2USC.toFixed(0)} USC</div></div>
          </div>
        </div>
        <div style="overflow-x:auto">${svg}</div>
        ${uscTable}
      </div>`;
  }

  const data = buildData(obrasRD);
  const geral = buildData(obrasRD); // same pool, all empreiteiras

  // Build "geral" consolidated per mes
  const geralPorTipo = {R1:{},R2:{}};
  obrasRD.forEach(o=>{
    const tipo = o.tipo||'R1';
    const mes  = (o.dataAbertura||'').slice(0,7);
    if(!meses12.includes(mes)) return;
    if(!geralPorTipo[tipo][mes]) geralPorTipo[tipo][mes]={qtd:0,usc:0};
    geralPorTipo[tipo][mes].qtd++;
    geralPorTipo[tipo][mes].usc += parseFloat(o.usc)||0;
  });

  let html = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">📊 Abertura de Obras — Últimos 12 Meses</div>
    ${renderGrafico(geralPorTipo,'🌐 Geral — Todas as Empreiteiras','#7c6af7', obrasRD)}
  `;

  EMP.forEach((emp,i)=>{
    const cor = i===0?'#3B82F6':'#22C55E';
    const empData = {};
    ['R1','R2'].forEach(t=>{
      empData[t] = {};
      meses12.forEach(m=>{
        const v = data[emp]?.[t]?.[m];
        if(v) empData[t][m]=v;
      });
    });
    html += renderGrafico(empData, `🏢 ${emp}`, cor, obrasRD.filter(o=>o.empreiteira===emp));
  });

  cont.innerHTML = html;
}

window.renderAberturaObras = renderAberturaObras;

// ══════════════════════════════════════════════════════════════════════
//  ABA "ANÁLISE FINANCEIRA" — Gerente
// ══════════════════════════════════════════════════════════════════════
// ── PARÂMETROS FINANCEIROS: gerente escreve no Firestore, fiscais leem ──
let _paramsFinCache = null;
async function loadParamsFinanceiros(){
  try{
    const snap = await getDoc(doc(db,'config','financeiro'));
    if(snap.exists()){
      _paramsFinCache = snap.data();
      // Sync to localStorage for offline use
      Object.entries(_paramsFinCache).forEach(([k,v])=>localStorage.setItem('sppc_'+k,v));
    }
  }catch(e){ console.warn('[Params] erro ao carregar:', e.message); }
}

function getParamsFinanceiros(){
  return {
    valorUSC:        parseFloat(localStorage.getItem('sppc_valorUSC')||'0'),
    ajusteLM:        parseFloat(localStorage.getItem('sppc_ajusteLM')||'18'),
    valorULV:        parseFloat(localStorage.getItem('sppc_valorULV')||'0'),
    ajusteLV:        parseFloat(localStorage.getItem('sppc_ajusteLV')||'18'),
    meta:            parseFloat(localStorage.getItem('sppc_metaMensal')||'0'),
    // Valor de projeto por empreiteira (sem ajuste %)
    valorProjetoCS:  parseFloat(localStorage.getItem('sppc_valorProjetoCS')||'0'),
    valorProjetoEL:  parseFloat(localStorage.getItem('sppc_valorProjetoEL')||'0'),
  };
}
function saveParamsFinanceiros(){
  if(me.perfil!=='gerente'){ toast('Apenas o gerente pode alterar os parâmetros.','warn'); return; }
  const get = id => parseFloat(document.getElementById(id)?.value||'0');
  const p = {
    valorUSC: get('pfValorUSC'), ajusteLM: get('pfAjusteLM'),
    valorULV: get('pfValorULV'), ajusteLV: get('pfAjusteLV'),
    metaMensal: get('pfMetaMensal'),
    valorProjetoCS: get('pfValorProjetoCS'),
    valorProjetoEL: get('pfValorProjetoEL'),
  };
  localStorage.setItem('sppc_valorUSC', p.valorUSC);
  localStorage.setItem('sppc_ajusteLM', p.ajusteLM);
  localStorage.setItem('sppc_valorULV', p.valorULV);
  localStorage.setItem('sppc_ajusteLV', p.ajusteLV);
  localStorage.setItem('sppc_metaMensal', p.metaMensal);
  localStorage.setItem('sppc_valorProjetoCS', p.valorProjetoCS||0);
  localStorage.setItem('sppc_valorProjetoEL', p.valorProjetoEL||0);
  // Persist to Firestore for fiscal sync
  setDoc(doc(db,'config','financeiro'), p).then(()=>toast('✓ Parâmetros salvos e sincronizados.','ok')).catch(e=>toast('Erro: '+e.message,'err'));
  renderAnaliseFinanceira();
}
window.saveParamsFinanceiros = saveParamsFinanceiros;

function calcFinanceiro(obrasLista, p){
  // USC pendente = previsto − soma(uscMedido das medições parciais), cap no previsto
  // Medição final: obra já tem o.medicao → excluída antes desta função (não entra aqui)
  // Fonte: apenas o.medicoes[].uscMedido (qualquer perfil que registrar)
  const totalUSC = obrasLista.reduce((s,o)=>{
    const previsto = parseFloat(o.usc)||0;
    const acumParcial = (o.medicoes||[])
      .filter(m=>m.tipo==='parcial')
      .reduce((a,m)=>a+(parseFloat(m.uscMedido)||0), 0);
    const jaMedido = Math.min(acumParcial, previsto); // cap no previsto
    return s + Math.max(0, previsto - jaMedido);
  },0);
  const totalULV = obrasLista.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
  const valLM    = totalUSC * p.valorUSC * (1 + p.ajusteLM/100);
  const valLV    = totalULV * p.valorULV * (1 + p.ajusteLV/100);
  return { totalUSC, totalULV, valLM, valLV, total: valLM+valLV, qtd: obrasLista.length };
}

function brlFmt(n){ return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0,maximumFractionDigits:0}); }
function fimDoMes(anoMes){ const [y,m]=anoMes.split('-'); return `${y}-${m}-${new Date(+y,+m,0).getDate()}`; }

function buildFuturoPorMes(obrasPool, p, nMeses=12){
  const hoje = new Date();
  const iniMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
  const meses = [];
  for(let i=0;i<nMeses;i++){
    const dt = new Date(hoje.getFullYear(), hoje.getMonth()+i, 1);
    const ym = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    const fim = fimDoMes(ym); const ini = `${ym}-01`;
    // Mês atual (i=0): inclui obras ATRASADAS (prazo vencido) + obras do mês corrente
    // Demais meses: apenas obras com prazo naquele mês
    const obMes = obrasPool.filter(o=>{
      if(o.cancelado||o.conclusao||temMedicaoFinal(o)) return false;
      if(o.tipo!=='R1'&&o.tipo!=='R2') return false;
      if(!o.dataLimite) return false;
      if(i===0) return o.dataLimite<=fim; // mês atual + atrasadas
      return o.dataLimite>=ini && o.dataLimite<=fim;
    });
    const atrasadas = i===0 ? obMes.filter(o=>o.dataLimite<iniMesAtual).length : 0;
    const label = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][dt.getMonth()]+'/'+String(dt.getFullYear()).slice(2);
    meses.push({ ym, label: i===0&&atrasadas>0?`${label}*`:label, obMes, calc: calcFinanceiro(obMes,p), atrasadas });
  }
  return meses;
}

function renderGraficoFinanceiro(meses, titulo, cor, p){
  const values = meses.map(m=>m.calc.total);
  const maxVal = Math.max(...values, p.meta||1, 1);
  const colW=55, barH=110, topP=36, botP=36, padL=52;
  const svgW = padL + meses.length*colW + 10;
  const svgH = topP+barH+botP;
  const toY = v => topP + barH - Math.round((v/maxVal)*barH);

  // Y axis labels
  const yTicks = [0,.25,.5,.75,1].map(f=>maxVal*f);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
  // Grid + Y labels
  yTicks.forEach(v=>{
    const y = toY(v);
    svg+=`<line x1="${padL}" y1="${y}" x2="${svgW-4}" y2="${y}" stroke="#37415122" stroke-width="1"/>`;
    svg+=`<text x="${padL-4}" y="${y+3}" text-anchor="end" font-size="8" fill="#9ca3af">${brlFmt(v).replace('R$','')}</text>`;
  });
  svg+=`<line x1="${padL}" y1="${topP}" x2="${padL}" y2="${topP+barH}" stroke="#374151" stroke-width="1"/>`;
  svg+=`<line x1="${padL}" y1="${topP+barH}" x2="${svgW-4}" y2="${topP+barH}" stroke="#374151" stroke-width="1"/>`;

  // BARRAS
  meses.forEach((m,i)=>{
    const x = padL + i*colW;
    const cx = x+colW/2;
    const val = m.calc.total;
    const bh = val>0 ? Math.max(4, Math.round((val/maxVal)*barH)) : 0;
    const by = topP+barH-bh;
    const overMeta = p.meta>0 && val>p.meta;
    const temAtrasadas = m.atrasadas>0;
    const barCor = overMeta ? '#EF4444' : cor;
    const barCor2 = temAtrasadas && !overMeta ? cor : barCor; // kept same, asterisk shows in label
    if(bh>0){
      svg+=`<rect x="${x+4}" y="${by}" width="${colW-8}" height="${bh}" rx="3" fill="${barCor}" opacity="0.85"/>`;
      svg+=`<text x="${cx}" y="${by-4}" text-anchor="middle" font-size="8" fill="${barCor}" font-weight="700">${brlFmt(val).replace('R$','R$ ')}</text>`;
    }
    // LM e LV separados abaixo
    svg+=`<text x="${cx}" y="${topP+barH+14}" text-anchor="middle" font-size="7.5" fill="${m.atrasadas>0?'#EF4444':'#9ca3af'}" font-weight="${m.atrasadas>0?'700':'400'}">${m.label}</text>`;
    if(m.atrasadas>0) svg+=`<text x="${cx}" y="${topP+barH+23}" text-anchor="middle" font-size="7" fill="#EF4444">${m.atrasadas} atr.</text>`;
    if(m.calc.qtd>0) svg+=`<text x="${cx}" y="${topP+barH+24}" text-anchor="middle" font-size="7" fill="${barCor}aa">${m.calc.qtd}obs</text>`;
  });

  // LINHA META
  if(p.meta>0){
    const metaY = toY(p.meta);
    svg+=`<line x1="${padL}" y1="${metaY}" x2="${svgW-4}" y2="${metaY}" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3"/>`;
    svg+=`<text x="${svgW-6}" y="${metaY-4}" text-anchor="end" font-size="8" fill="#F59E0B" font-weight="700">🎯 META ${brlFmt(p.meta)}/mês</text>`;
  }
  svg+='</svg>';
  return svg;
}

function renderBlocoEmpreiteira(nome, cor, obrasPool, p){
  // Saldo Devedor
  // devOp: obras concluídas SEM medição final
  // Usa o array medicoes (não o campo o.medicao que pode ter dado antigo de parciais)
  const devOp = obrasPool.filter(o=>
    !o.cancelado && !o.armazenado &&
    o.conclusao &&
    !temMedicaoFinal(o) &&
    (o.tipo==='R1'||o.tipo==='R2')
  );
  const dev   = calcFinanceiro(devOp, p);
  // Futuro 12 meses
    // Projeto: USC imputado × valorUSC sem ajuste (por empreiteira: proporção do pool)
  // Projeto por empreiteira
  const isCS = nome.toUpperCase().includes('CS');
  const saldoProjeto = isCS ? (p.valorProjetoCS||0)*p.valorUSC : (p.valorProjetoEL||0)*p.valorUSC;

  const meses  = buildFuturoPorMes(obrasPool, p, 12);
  const futTotal = meses.reduce((s,m)=>s+m.calc.total,0);

  const cardS = `background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:12px;padding:16px;margin-bottom:12px`;

  return `
    <div style="${cardS}">
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:${cor};margin-bottom:14px">${nome}</div>

      <!-- Saldo Devedor -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div style="flex:1;min-width:160px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">🔴 Saldo Devedor (${dev.qtd} obras)</div>
          <div style="font-size:20px;font-weight:900;color:#EF4444">${brlFmt(dev.total)}</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <div style="font-size:10px"><span style="color:var(--muted)">LM (USC ${dev.totalUSC.toFixed(0)})</span><br><strong style="color:#EF4444">${brlFmt(dev.valLM)}</strong></div>
            <div style="font-size:10px"><span style="color:var(--muted)">LV (ULV ${dev.totalULV.toFixed(0)})</span><br><strong style="color:#EF4444">${brlFmt(dev.valLV)}</strong></div>
          </div>
        </div>
        <div style="flex:1;min-width:160px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">⏳ Projeção Futura (12 meses)</div>
          <div style="font-size:20px;font-weight:900;color:#F59E0B">${brlFmt(futTotal)}</div>
          <div style="margin-top:4px;font-size:10px;color:var(--muted)">${meses.reduce((s,m)=>s+m.calc.qtd,0)} obras previstas</div>
        </div>
      </div>

      <!-- Lista obras saldo devedor (expansível) -->
      ${devOp.length?`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:10px;color:#EF4444;font-weight:700">📋 ${devOp.length} obras no saldo devedor ▼</summary>
        <div style="overflow-x:auto;margin-top:6px"><table style="width:100%;border-collapse:collapse;font-size:9px">
          <thead><tr style="background:var(--surface2)"><th style="padding:4px 6px;text-align:left">Nº</th><th style="padding:4px 6px">Tipo</th><th style="padding:4px 6px">Prog.</th><th style="padding:4px 6px;text-align:right">USC Prev.</th><th style="padding:4px 6px;text-align:right">Parc.Med.</th><th style="padding:4px 6px;text-align:right;color:#EF4444">Pendente</th><th style="padding:4px 6px;text-align:right">LM(R$)</th></tr></thead>
          <tbody>${devOp.map(o=>{const bruto=parseFloat(o.usc)||0;const parcs=(o.medicoes||[]).filter(m=>m.tipo==='parcial').reduce((a,m)=>a+(parseFloat(m.uscMedido)||0),0);const jaMed=Math.min(parcs,bruto);const pend=Math.max(0,bruto-jaMed);return `<tr style="border-bottom:1px solid var(--border)"><td style="padding:3px 6px;font-weight:600;color:var(--accent);cursor:pointer" onclick="openObraModal('${o.id}')">${o.numero}</td><td style="padding:3px 6px;text-align:center">${o.tipo||'—'}</td><td style="padding:3px 6px">${o.programa||'—'}</td><td style="padding:3px 6px;text-align:right">${bruto.toFixed(1)}</td><td style="padding:3px 6px;text-align:right;color:#7c6af7">${jaMed>0?jaMed.toFixed(1):'—'}</td><td style="padding:3px 6px;text-align:right;color:#EF4444;font-weight:700">${pend.toFixed(1)}</td><td style="padding:3px 6px;text-align:right;color:#EF4444">${pend>0?brlFmt(pend*p.valorUSC*(1+p.ajusteLM/100)):'—'}</td></tr>`;}).join('')}</tbody>
        </table></div></details>`:''}

      <!-- Gráfico financeiro 12 meses -->
      <div style="font-size:10px;color:var(--muted);margin-bottom:6px">📊 Projeção Mensal — ${meses.filter(m=>m.calc.qtd>0).length} meses com obras</div>
      <div style="overflow-x:auto">${renderGraficoFinanceiro(meses, nome, cor, p)}</div>

      <!-- Tabela LM e LV por mês -->
      <div style="overflow-x:auto;margin-top:12px">
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:5px 8px;text-align:left">Mês</th>
            <th style="padding:5px 8px;text-align:right">Obras</th>
            <th style="padding:5px 8px;text-align:right;color:#7c6af7">USC</th>
            <th style="padding:5px 8px;text-align:right;color:#7c6af7">LM (USC×ValorUSC×(1+Aj.))</th>
            <th style="padding:5px 8px;text-align:right;color:#22C55E">ULV</th>
            <th style="padding:5px 8px;text-align:right;color:#22C55E">LV (ULV×ValorULV×(1+Aj.))</th>
            <th style="padding:5px 8px;text-align:right;font-weight:700">Total</th>
          </tr></thead>
          <tbody>${meses.filter(m=>m.calc.qtd>0).map(m=>{
            const over = p.meta>0&&m.calc.total>p.meta;
            return `<tr style="border-bottom:1px solid var(--border);${over?'background:rgba(239,68,68,.04)':''}">
              <td style="padding:4px 8px;font-weight:600">${m.label}</td>
              <td style="padding:4px 8px;text-align:right">${m.calc.qtd}</td>
              <td style="padding:4px 8px;text-align:right">${m.calc.totalUSC.toFixed(1)}</td>
              <td style="padding:4px 8px;text-align:right;color:#7c6af7">${brlFmt(m.calc.valLM)}</td>
              <td style="padding:4px 8px;text-align:right">${m.calc.totalULV.toFixed(1)}</td>
              <td style="padding:4px 8px;text-align:right;color:#22C55E">${brlFmt(m.calc.valLV)}</td>
              <td style="padding:4px 8px;text-align:right;font-weight:700;${over?'color:#EF4444':''}">${brlFmt(m.calc.total)}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
      <!-- USC medido por mês -->
      ${renderGraficoUSCMedido(obrasPool,cor)}
    </div>`;
}

function renderAnaliseFinanceira(){
  const cont = document.getElementById('pgAnaliseContent');
  if(!cont) return;
  const p = getParamsFinanceiros();
  const EMP = ['CS ELETRICIDADE','ELETELSUL'];

  // Filtro por programa
  const progFiltros = JSON.parse(localStorage.getItem('analise_prog_filtro')||'{}');
  function obrasComFiltro(pool){
    return pool.filter(o=>!o.programa ? progFiltros['_semProg']!==false : progFiltros[o.programa]!==false);
  }
  const isGerente = me.perfil==='gerente'; // controla campos editáveis
  const obrasRDtodas = obras.filter(o=>(o.tipo==='R1'||o.tipo==='R2')&&!o.cancelado);
  const obrasRD = obrasComFiltro(obrasRDtodas);
  const cores = {'CS ELETRICIDADE':'#3B82F6', 'ELETELSUL':'#22C55E', 'Geral':'#7c6af7'};

  const paramBlock = `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid #7c6af7;border-radius:12px;padding:18px;margin-bottom:20px">
      <div style="font-weight:800;font-size:14px;margin-bottom:14px">⚙️ Parâmetros de Cálculo</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:14px">
        <div class="fg"><label>Valor Unitário USC (R$/USC)</label><input type="number" id="pfValorUSC" value="${p.valorUSC}" ${isGerente?'':' disabled title="Definido pelo gerente"'} placeholder="0.00" step="0.01" min="0"></div>
        <div class="fg"><label>Ajuste LM (%)</label><input type="number" id="pfAjusteLM" value="${p.ajusteLM}" ${isGerente?'':' disabled'} placeholder="18" step="0.1"></div>
        <div class="fg"><label>Valor Unitário ULV (R$/ULV)</label><input type="number" id="pfValorULV" value="${p.valorULV}" ${isGerente?'':' disabled'} placeholder="0.00" step="0.01" min="0"></div>
        <div class="fg"><label>Ajuste LV (%)</label><input type="number" id="pfAjusteLV" value="${p.ajusteLV}" ${isGerente?'':' disabled'} placeholder="18" step="0.1"></div>
        <div class="fg-grid">
          <div class="fg"><label>📐 Projeto USC — CS Eletricidade</label>
            <input type="number" id="pfValorProjetoCS" value="${p.valorProjetoCS||0}" ${isGerente?'':' disabled'} placeholder="0" min="0" step="0.1">
          </div>
          <div class="fg"><label>📐 Projeto USC — Eletelsul</label>
            <input type="number" id="pfValorProjetoEL" value="${p.valorProjetoEL||0}" ${isGerente?'':' disabled'} placeholder="0" min="0" step="0.1">
          </div>
        </div>
        <div class="fg"><label>🎯 Meta Mensal de Custo <span style="color:#F59E0B;font-weight:700">(valor em R$)</span></label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:#F59E0B;font-weight:700">R$</span>
            <input type="number" id="pfMetaMensal" value="${p.meta}" placeholder="Ex: 500000" step="10000" min="0" style="border-color:#F59E0B;flex:1">
          </div>
          <div style="font-size:9px;color:var(--muted)">Ex: se quer limitar custo mensal em R$ 500.000 → digite 500000</div>
        </div>
      </div>
      ${isGerente?`<button onclick="saveParamsFinanceiros()" class="btn btn-primary btn-sm">💾 Salvar e Calcular</button>`:`<div style="font-size:10px;color:#F59E0B">⚙️ Parâmetros definidos pelo gerente</div>`}
      <div style="font-size:10px;color:var(--muted);margin-top:8px">
        LM = USC × Valor USC × (1 + Ajuste LM%) &nbsp;|&nbsp; LV = ULV × Valor ULV × (1 + Ajuste LV%) &nbsp;|&nbsp; 🟡 Linha de meta no gráfico
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;margin-bottom:8px">🔎 Filtrar por Programa (desmarque para excluir da análise):</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${['PODI','Mono-Tri','Regulatório','Melhoria'].map(prog=>`
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
              <input type="checkbox" ${(progFiltros[prog]!==false)?'checked':''} id="filtProg_${prog}" onchange="window._salvarFiltroPrograma()">
              ${prog}
            </label>`).join('')}
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
            <input type="checkbox" ${(progFiltros['_semProg']!==false)?'checked':''} id="filtProg__semProg" onchange="window._salvarFiltroPrograma()">
            (Sem programa definido)
          </label>
        </div>
      </div>
    </div>`;

  // Geral
  let html = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">💰 Análise Financeira — por Empreiteira</div>
    ${paramBlock}
    ${renderBlocoEmpreiteira('🌐 Geral — Todas as Empreiteiras', cores.Geral, obrasRD, p)}
    ${EMP.map(emp=>renderBlocoEmpreiteira('🏢 '+emp, cores[emp]||'#9ca3af', obrasRD.filter(o=>o.empreiteira===emp), p)).join('')}`;

  cont.innerHTML = html;
}
window.renderAnaliseFinanceira = renderAnaliseFinanceira;

// ══════════════════════════════════════════════════════════════════════
//  GRÁFICO USC MEDIDO POR MÊS — Análise Financeira
// ══════════════════════════════════════════════════════════════════════
function renderGraficoUSCMedido(obrasPool, cor, containerId){
  const hoje = new Date();
  const meses12 = [];
  for(let i=11;i>=0;i--){
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    meses12.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const mLabel = ym => { const [y,m]=ym.split('-'); return `${m}/${y.slice(2)}`; };

  const PROGS = ['Regulatório','PODI','Mono-Tri','Melhoria'];
  const CORS  = {Regulatório:'#22C55E',PODI:'#7c6af7','Mono-Tri':'#F59E0B',Melhoria:'#3B82F6'};

  // Read prog filter from localStorage (shared with main analise filter)
  function getProgFiltro(){ return JSON.parse(localStorage.getItem('usc_prog_filtro')||'{}'); }

  // Build data: per programa per mes
  function buildUscData(pool){
    const data = {};
    PROGS.forEach(p=>{ data[p]={}; meses12.forEach(m=>{ data[p][m]={usc:0,qt:0,parcial:0,final:0}; }); });
    data['_sem']={};
    meses12.forEach(m=>{ data['_sem'][m]={usc:0,qt:0,parcial:0,final:0}; });

    pool.forEach(o=>{
      const prog = PROGS.includes(o.programa) ? o.programa : '_sem';
      (o.medicoes||[]).forEach(med=>{
        const mes = (med.data||'').slice(0,7);
        if(!meses12.includes(mes)) return;
        const usc = parseFloat(med.uscMedido)||0;
        data[prog][mes].usc += usc;
        data[prog][mes].qt++;
        if(med.tipo==='parcial') data[prog][mes].parcial += usc;
        else                     data[prog][mes].final   += usc;
      });
    });
    return data;
  }

  function renderChart(pool, filtros){
    const data = buildUscData(pool);
    const activePrgs = PROGS.filter(p=>filtros[p]!==false);
    const includeSem = filtros['_sem']!==false;

    // Aggregate per mes for active progs
    const totais = meses12.map(m=>{
      let usc=0,qt=0,parcial=0,final=0;
      activePrgs.forEach(p=>{ const v=data[p][m]; usc+=v.usc; qt+=v.qt; parcial+=v.parcial; final+=v.final; });
      if(includeSem){ const v=data['_sem'][m]; usc+=v.usc; qt+=v.qt; }
      return {m,usc,qt,parcial,final,byProg:activePrgs.map(p=>({p,usc:data[p][m].usc,cor:CORS[p]}))};
    });

    const maxV = Math.max(...totais.map(t=>t.usc), 1);
    const colW=56, barH=80, topP=40, botP=28, padL=6;
    const svgW = padL + meses12.length*colW + padL;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${topP+barH+botP}" style="font-family:'DM Mono',monospace;display:block;overflow:visible">`;
    svg += `<line x1="${padL}" y1="${topP+barH}" x2="${svgW-padL}" y2="${topP+barH}" stroke="#374151" stroke-width="1"/>`;

    totais.forEach((t,i)=>{
      const cx = padL+i*colW+colW/2;
      const x  = padL+i*colW;
      const bh = t.usc>0 ? Math.max(4, Math.round((t.usc/maxV)*barH)) : 0;
      const by = topP+barH-bh;

      if(bh>0){
        // Stack bars by programa
        let yOff=0;
        [...t.byProg].reverse().forEach(({p,usc,cor})=>{
          if(!usc) return;
          const ph = Math.round((usc/maxV)*barH);
          svg+=`<rect x="${x+4}" y="${topP+barH-yOff-ph}" width="${colW-8}" height="${ph}" rx="2" fill="${cor}" opacity="0.9" title="${p}: ${usc.toFixed(0)} USC"/>`;
          yOff+=ph;
        });
        if(data['_sem'][t.m].usc>0&&includeSem){
          const su=data['_sem'][t.m].usc; const sh=Math.round((su/maxV)*barH);
          svg+=`<rect x="${x+4}" y="${topP+barH-yOff-sh}" width="${colW-8}" height="${sh}" rx="2" fill="#6b7280" opacity="0.7"/>`;
        }
        // Label total
        svg+=`<text x="${cx}" y="${by-4}" text-anchor="middle" font-size="9" fill="${cor}" font-weight="700">${t.usc.toFixed(0)}</text>`;
      }

      svg+=`<text x="${cx}" y="${topP+barH+14}" text-anchor="middle" font-size="8" fill="#9ca3af">${mLabel(t.m)}</text>`;
      if(t.qt>0){
        const parLabel = t.parcial>0 ? `P:${t.parcial.toFixed(0)}` : '';
        const finLabel = t.final>0   ? `F:${t.final.toFixed(0)}`   : '';
        svg+=`<text x="${cx}" y="${topP+barH+23}" text-anchor="middle" font-size="7" fill="${cor}aa">${[parLabel,finLabel].filter(Boolean).join('|')}</text>`;
      }
    });
    svg+='</svg>';

    const totalMed = totais.reduce((s,t)=>s+t.usc,0);
    const totalP   = totais.reduce((s,t)=>s+t.parcial,0);
    const totalF   = totais.reduce((s,t)=>s+t.final,0);
    return {svg, totalMed, totalP, totalF};
  }

  const cid = containerId||('uscChart_'+Math.random().toString(36).slice(2));

  function buildHtml(filtros){
    const {svg, totalMed, totalP, totalF} = renderChart(obrasPool, filtros);
    const legendItems = PROGS.filter(p=>{
      const d=buildUscData(obrasPool);
      return meses12.some(m=>d[p][m].usc>0);
    });
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div style="font-size:11px;font-weight:700;color:${cor}">📈 USC Medido por Mês — Parcial (P) + Final (F)</div>
        <div style="display:flex;gap:12px;font-size:10px;flex-wrap:wrap">
          <span>Total: <strong style="color:${cor}">${totalMed.toFixed(1)}</strong></span>
          ${totalP>0?`<span>Parcial: <strong style="color:#7c6af7">${totalP.toFixed(1)}</strong></span>`:''}
          ${totalF>0?`<span>Final: <strong style="color:#22C55E">${totalF.toFixed(1)}</strong></span>`:''}
        </div>
      </div>
      <!-- Filtro por programa -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:10px">
        ${PROGS.map(p=>`<label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" ${filtros[p]!==false?'checked':''} onchange="(()=>{
            const f=JSON.parse(localStorage.getItem('usc_prog_filtro')||'{}');
            f['${p}']=this.checked;
            localStorage.setItem('usc_prog_filtro',JSON.stringify(f));
            const el=document.getElementById('${cid}');
            if(el) el.innerHTML=window._buildUscHtml_${cid.replace(/[^a-z0-9]/gi,'_')}(f);
          })()">
          <span style="background:${CORS[p]};color:#fff;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700">${p}</span>
        </label>`).join('')}
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" ${filtros['_sem']!==false?'checked':''} onchange="(()=>{
            const f=JSON.parse(localStorage.getItem('usc_prog_filtro')||'{}');
            f['_sem']=this.checked;
            localStorage.setItem('usc_prog_filtro',JSON.stringify(f));
            const el=document.getElementById('${cid}');
            if(el) el.innerHTML=window._buildUscHtml_${cid.replace(/[^a-z0-9]/gi,'_')}(f);
          })()">
          <span style="background:#6b7280;color:#fff;padding:1px 7px;border-radius:8px;font-size:9px">Sem programa</span>
        </label>
      </div>
      ${legendItems.length>1?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:9px">
        ${legendItems.map(p=>`<span>■ <span style="color:${CORS[p]}">${p}</span></span>`).join('')}
        <span>■ <span style="color:#6b7280">Sem programa</span></span>
      </div>`:''}
      <div style="overflow-x:auto">${svg}</div>`;
  }

  const filtros = getProgFiltro();
  const fnKey = cid.replace(/[^a-z0-9]/gi,'_');
  window['_buildUscHtml_'+fnKey] = buildHtml;

  return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
    <div id="${cid}">${buildHtml(filtros)}</div>
  </div>`;
}


// ══════════════════════════════════════════════════════════════════════
//  ABA "PROGRAMAS" — PODI e Mono-Tri
// ══════════════════════════════════════════════════════════════════════
function getProgramaMeta(){
  return {
    pct:    parseFloat(localStorage.getItem('prog_meta_pct')||'0'),
    period: localStorage.getItem('prog_meta_period')||'mensal',
  };
}
window.saveProgramaMeta = function(){
  localStorage.setItem('prog_meta_pct',    document.getElementById('pgProgMetaPct')?.value||'0');
  localStorage.setItem('prog_meta_period', document.getElementById('pgProgMetaPeriod')?.value||'mensal');
  toast('✓ Meta salva.');
  renderProgramas();
};

function calcProgressoParcial(obra){
  const uscPrev = parseFloat(obra.usc)||0;
  if(uscPrev===0) return {pct:0, medido:0, prev:0};
  // Medição FINAL = 100% medido (previsto completo)
  if(temMedicaoFinal(obra)) return {pct:100, medido:uscPrev, prev:uscPrev, final:true};
  // Parciais acumuladas, cap no previsto
  const acum = (obra.medicoes||[]).filter(m=>m.tipo==='parcial').reduce((s,m)=>s+(parseFloat(m.uscMedido)||0),0);
  const medido = Math.min(acum, uscPrev);
  return { pct: Math.round((medido/uscPrev)*100), medido, prev: uscPrev };
}

function calcMetaEsperada(meta, obra){
  if(!meta.pct) return 0;
  const hoje = new Date();
  // Conta a partir do mês de ABERTURA da obra
  const aberturaStr = obra?.dataAbertura;
  const abertura = aberturaStr ? new Date(aberturaStr+'T00:00:00') : hoje;
  const meses = Math.max(0,
    (hoje.getFullYear()-abertura.getFullYear())*12 + (hoje.getMonth()-abertura.getMonth())
  );
  if(meta.period==='mensal')     return Math.min(100, meta.pct * meses);
  if(meta.period==='trimestral') return Math.min(100, meta.pct * Math.ceil(meses/3));
  if(meta.period==='semestral')  return Math.min(100, meta.pct * Math.ceil(meses/6));
  if(meta.period==='anual')      return Math.min(100, meta.pct);
  return 0;
}

function renderCardPrograma(obra, meta){
  const prog = calcProgressoParcial(obra);
  const esperado = calcMetaEsperada(meta, obra);
  const cor = prog.pct >= esperado ? '#22C55E' : prog.pct >= esperado*0.7 ? '#F59E0B' : '#EF4444';
  const corMeta = '#F59E0B';

  // Mini timeline de medições parciais
  const parciais = (obra.medicoes||[]).filter(m=>m.tipo==='parcial').sort((a,b)=>a.data>b.data?1:-1);

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <strong style="color:var(--accent);cursor:pointer;font-size:13px" onclick="openObraModal('${obra.id}')">${obra.numero}</strong>
        <span style="font-size:10px;color:var(--muted)">${obra.cidade||'—'} · ${obra.empreiteira||'—'} · ${obra.fiscal||'—'}</span>
        <span style="background:${{PODI:'#7c6af7','Mono-Tri':'#F59E0B'}[obra.programa]||'#6b7280'};color:#fff;padding:1px 8px;border-radius:8px;font-size:9px;font-weight:700">${obra.programa}</span>
        <span style="margin-left:auto;font-size:20px;font-weight:900;color:${cor}">${prog.pct}%</span>
      </div>

      <!-- Barra de progresso -->
      <div style="position:relative;height:20px;background:var(--surface2);border-radius:8px;overflow:visible;margin-bottom:6px">
        <div style="height:100%;width:${Math.min(prog.pct,100)}%;background:${cor};border-radius:8px;transition:width .5s;position:relative">
          ${prog.pct>5?`<span style="position:absolute;right:6px;top:2px;font-size:9px;color:#fff;font-weight:700">${prog.pct}%</span>`:''}
        </div>
        ${esperado>0?`<div style="position:absolute;top:-3px;left:${Math.min(esperado,100)}%;width:2px;height:calc(100%+6px);background:${corMeta};border-radius:1px" title="Meta: ${esperado.toFixed(0)}%">
          <div style="position:absolute;bottom:100%;left:-16px;font-size:8px;color:${corMeta};white-space:nowrap;font-weight:700">META ${esperado.toFixed(0)}%</div>
        </div>`:''}
      </div>

      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:8px">
        <span>USC Medido: <strong style="color:${cor}">${prog.medido.toFixed(1)}</strong></span>
        <span>USC Previsto: <strong>${prog.prev.toFixed(1)}</strong></span>
        ${esperado>0?`<span>Meta Esperada: <strong style="color:${corMeta}">${esperado.toFixed(0)}%</strong></span>`:''}
        <span style="color:${cor};font-weight:700">${prog.pct>=esperado?'✓ No prazo':'⚠️ Abaixo da meta'}</span>
      </div>

      <!-- Timeline medições parciais -->
      ${parciais.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">
        ${parciais.map(m=>`<div style="background:var(--surface2);border-radius:6px;padding:3px 8px;font-size:9px">
          <span style="color:var(--muted)">${fmtTxt(m.data)}</span>
          ${m.uscMedido>0?`<strong style="color:#7c6af7;margin-left:4px">${parseFloat(m.uscMedido).toFixed(1)} USC</strong>`:''}
        </div>`).join('')}
      </div>`:'<div style="font-size:10px;color:var(--muted)">Nenhuma medição parcial registrada</div>'}
    </div>`;
}

function renderProgramas(){
  const cont = document.getElementById('pgProgramasContent');
  if(!cont) return;
  const meta = getProgramaMeta();

  // Filter obras by profile
  let pool = obras.filter(o=>!o.cancelado&&(o.programa==='PODI'||o.programa==='Mono-Tri'));
  if(me.perfil==='empreiteira') pool=pool.filter(o=>o.empreiteira===me.vinculo);
  else if(me.perfil==='fiscal') pool=pool.filter(o=>o.fiscal===me.vinculo);
  else if(me.perfil==='fiscal_adm'){} // sees all

  const podi = pool.filter(o=>o.programa==='PODI');
  const mono = pool.filter(o=>o.programa==='Mono-Tri');

  const paramBlock = ['gerente','fiscal','fiscal_adm'].includes(me.perfil) ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid #F59E0B;border-radius:10px;padding:14px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
      <div class="fg" style="margin:0;min-width:140px">
        <label style="font-size:10px">🎯 Meta de Medição (%)</label>
        <input type="number" id="pgProgMetaPct" value="${meta.pct}" placeholder="Ex: 10" min="0" max="100" step="1">
      </div>
      <div class="fg" style="margin:0;min-width:160px">
        <label style="font-size:10px">Período da Meta</label>
        <select id="pgProgMetaPeriod">
          <option value="mensal" ${meta.period==='mensal'?'selected':''}>Mensal (% por mês)</option>
          <option value="trimestral" ${meta.period==='trimestral'?'selected':''}>Trimestral (% por trimestre)</option>
          <option value="semestral" ${meta.period==='semestral'?'selected':''}>Semestral (% por semestre)</option>
          <option value="anual" ${meta.period==='anual'?'selected':''}>Anual (% por ano)</option>
        </select>
      </div>
      <button onclick="saveProgramaMeta()" class="btn btn-primary btn-sm">💾 Salvar Meta</button>
      <div style="font-size:9px;color:var(--muted)">Meta: ${meta.pct}% ${{'mensal':'por mês','trimestral':'por trimestre','semestral':'por semestre','anual':'por ano'}[meta.period]||''}. Linha amarela na barra = esperado até hoje.</div>
    </div>` : '';

  const renderSecao = (titulo, cor, list) => {
    if(!list.length) return `<div style="font-size:11px;color:var(--muted);margin-bottom:12px">Nenhuma obra ${titulo} encontrada.</div>`;
    const totalUSC = list.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const medido   = list.reduce((s,o)=>s+calcProgressoParcial(o).medido,0);
    const pctGeral = totalUSC>0?Math.round((medido/totalUSC)*100):0;
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
          <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:${cor}">${titulo}</div>
          <span style="font-size:10px;color:var(--muted)">${list.length} obras</span>
          <span style="font-size:12px;font-weight:800;color:${cor};margin-left:auto">${pctGeral}% medido (${medido.toFixed(0)}/${totalUSC.toFixed(0)} USC)</span>
        </div>
        ${list.map(o=>renderCardPrograma(o,meta)).join('')}
      </div>`;
  };

  cont.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:16px">📋 Programas — Monitoramento de Medições</div>
    ${paramBlock}
    ${renderSecao('🔵 PODI','#7c6af7',podi)}
    ${renderSecao('🟡 Mono-Tri','#F59E0B',mono)}`;
}
window.renderProgramas = renderProgramas;

// ══════════════════════════════════════════════════════════════════════
//  CRONOGRAMA DE DESLIGAMENTOS — Upload PDF + Análise de Prioridade
// ══════════════════════════════════════════════════════════════════════

// ── Mammoth.js loader (para Word .docx) ──────────────────────────────────
async function loadMammoth(){
  if(window.mammoth) return window.mammoth;
  return new Promise((res,rej)=>{
    if(document.getElementById('mammoth-script')){ setTimeout(()=>res(window.mammoth),600); return; }
    const s=document.createElement('script');
    s.id='mammoth-script';
    s.src='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload=()=>res(window.mammoth);
    s.onerror=()=>rej(new Error('Falha ao carregar Mammoth.js'));
    document.head.appendChild(s);
  });
}

// ── Parser SIMO Word (.docx) ─────────────────────────────────────────────
// Abordagem: extrai texto plano e usa matching por proximidade (posição no texto)
async function parseSIMODocx(arrayBuffer){
  const mammoth = await loadMammoth();
  const result  = await mammoth.extractRawText({arrayBuffer});
  const fullText = result.value;

  const entries=[], seen=new Set();
  const WINDOW = 300; // chars ao redor do OIS para buscar data/status

  // Posições de todos os OIS (40X dígitos, 9 chars, faixa construtoras CELESC)
  const oisPos = [...fullText.matchAll(/(?<![0-9])(40[0-9]\d{6})(?![0-9])/g)]
    .map(m=>({pos:m.index, ois:m[1]}));

  // Posições de todas as datas DD/MM/YYYY
  const datPos = [...fullText.matchAll(/(\d{2})\/(\d{2})\/(20\d{2})/g)]
    .map(m=>({pos:m.index, iso:`${m[3]}-${m[2]}-${m[1]}`}));

  oisPos.forEach(({pos, ois})=>{
    // Data mais próxima dentro de WINDOW chars
    const near = datPos
      .filter(d=>Math.abs(d.pos-pos)<=WINDOW)
      .sort((a,b)=>Math.abs(a.pos-pos)-Math.abs(b.pos-pos));

    if(!near.length){
      // Fallback: próxima data após o OIS
      const after = datPos.filter(d=>d.pos>pos).sort((a,b)=>a.pos-b.pos);
      if(after.length) near.push(after[0]);
    }
    if(!near.length) return;

    const dataProgram = near[0].iso;
    const key = ois+dataProgram;
    if(seen.has(key)) return;
    seen.add(key);

    // Status: janela ao redor do OIS
    const seg = fullText.slice(Math.max(0,pos-80), Math.min(fullText.length, pos+WINDOW));
    let status='';
    if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(seg))          status='aguarda_programador';
    else if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(seg))     status='aguarda_execucao';
    else if(/AGUARDA\s+VISTO|SD.*AGUARDANDO\s+VISTO|AGUARDA.*CHEFIA/i.test(seg)) status='aguarda_visto';

    // Horas HH:MM HH:MM
    const tm = seg.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);

    entries.push({
      obraNumero:  ois,
      dataProgram,
      inicioHora:  tm?.[1]||'',
      fimHora:     tm?.[2]||'',
      empreiteira: '',   // preenchido via cruzamento com obras no renderDesligamentos
      status
    });
  });

  if(!entries.length) throw new Error('Nenhuma obra encontrada no documento Word.');
  return entries;
}

// ── SheetJS loader (para Excel) ────────────────────────────────────────
async function loadSheetJS(){
  if(window.XLSX) return window.XLSX;
  return new Promise((res,rej)=>{
    if(document.getElementById('sheetjs-script')){ setTimeout(()=>res(window.XLSX),600); return; }
    const s=document.createElement('script');
    s.id='sheetjs-script';
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX);
    s.onerror=()=>rej(new Error('Falha ao carregar SheetJS'));
    document.head.appendChild(s);
  });
}

// ── Parser Excel SIMO ────────────────────────────────────────────────────
async function parseSIMOExcel(arrayBuffer){
  const XLSX = await loadSheetJS();
  const wb   = XLSX.read(arrayBuffer, {type:'array', cellDates:true});

  const entries=[], seen=new Set();

  function getEmp(text){
    const t=text.toUpperCase();
    if(/CS\s*ELET|C\s*S\s*ELET/.test(t)) return 'CS ELETRICIDADE';
    if(/ELETELS[UI]?/.test(t))             return 'ELETELSUL';
    return '';
  }

  wb.SheetNames.forEach(shName=>{
    const ws  = wb.Sheets[shName];
    const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});

    // Empreiteira: escaneia todo o texto da aba
    const flatAll = rows.flat().join(' ');
    let emp = getEmp(flatAll);

    rows.forEach((row,i)=>{
      const rowStr = row.join(' ');

      // OIS: 9 dígitos na faixa 400-409 (exclui telefones como 499...)
      const oisFound = [...new Set([...rowStr.matchAll(/(?<![0-9])(40[0-9]\d{6})(?![0-9])/g)].map(m=>m[1]))];
      if(!oisFound.length) return;

      // Data: busca DD/MM/YYYY nas próximas 3 linhas
      let dataProgram='';
      for(let ci=i;ci<=Math.min(i+2,rows.length-1);ci++){
        const cs=rows[ci].join(' ');
        const dm=cs.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
        if(dm){ dataProgram=`${dm[3]}-${dm[2]}-${dm[1]}`; break; }
        // Excel pode retornar data como YYYY-MM-DD (serializado) — inverte dia/mês
        const iso=cs.match(/(20\d{2})-(\d{2})-(\d{2})/);
        if(iso){ dataProgram=`${iso[1]}-${iso[3]}-${iso[2]}`; break; } // inverte dia/mês
      }
      if(!dataProgram) return;

      // Horas
      const tm=rowStr.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);

      // Status: busca nas próximas 3 linhas
      let status='';
      for(let ci=i;ci<=Math.min(i+2,rows.length-1);ci++){
        const cs=rows[ci].join(' ');
        if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(cs)){status='aguarda_programador';break;}
        if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(cs)){status='aguarda_execucao';break;}
        if(/AGUARDA\s+VISTO|SD.*AGUARDANDO|AGUARDA.*CHEFIA/i.test(cs)){status='aguarda_visto';break;}
      }

      oisFound.forEach(ois=>{
        const key=ois+dataProgram;
        if(seen.has(key)) return;
        seen.add(key);
        entries.push({obraNumero:ois, dataProgram, inicioHora:tm?.[1]||'', fimHora:tm?.[2]||'', empreiteira:emp, status});
      });
    });
  });

  return entries;
}

window.uploadDesligamentos = async function(){
  const input = document.getElementById('inputPdfDeslig');
  if(!input?.files?.[0]){ toast('Selecione um arquivo .xlsx.','err'); return; }
  const file = input.files[0];
  const btn  = document.getElementById('btnUploadDeslig');
  btn.disabled=true; btn.textContent='Processando...';
  try{
    const arrayBuffer = await new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result);
      r.onerror=()=>rej(new Error('Falha ao ler arquivo'));
      r.readAsArrayBuffer(file);
    });
    toast('📊 Lendo Excel...','ok');
    const isExcel = file.name.match(/\.xlsx?$/i);
    const isWord  = file.name.match(/\.docx?$/i);
    let entries;
    if(isExcel)      entries = await parseSIMOExcel(arrayBuffer);
    else if(isWord)  entries = await parseSIMODocx(arrayBuffer);
    else             entries = await parseSIMOPdf(null, arrayBuffer);
    if(!Array.isArray(entries)||!entries.length) throw new Error('Nenhum dado extraído');

    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const horaStr = String(agora.getHours()).padStart(2,'0')+':'+String(agora.getMinutes()).padStart(2,'0');
    const docKey = hoje+'_'+String(agora.getHours()).padStart(2,'0')+String(agora.getMinutes()).padStart(2,'0');
    await setDoc(doc(db,'desligamentos', docKey), {
      data: hoje,
      hora: horaStr,
      arquivo: file.name,
      atualizadaEm: serverTimestamp(),
      entradas: entries,
      totalEntradas: entries.length,
    });
    toast(`✓ ${entries.length} desligamentos importados — ${hoje} às ${horaStr}.`, 'ok');
    renderDesligamentos();
  }catch(e){
    console.error('[Desligamentos]', e);
    toast('Erro: '+e.message, 'err');
  }finally{
    btn.disabled=false; btn.textContent='📄 Importar PDF';
  }
};

// ── Carrega importação específica (seletor de datas) ─────────────────────
window.loadDesligData = async function(docId){
  if(!docId) return;
  const slot = document.getElementById('desligSlot');
  if(slot) slot.innerHTML='<div style="font-size:11px;color:var(--muted)">Carregando...</div>';
  try{
    const snap = await getDoc(doc(db,'desligamentos',docId));
    if(!snap.exists()){ toast('Importação não encontrada.','err'); return; }
    _renderDesligSlot(snap.data());
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

function renderDesligamentos(){
  const cont = document.getElementById('pgDesligamentosContent');
  if(!cont) return;

  const podeUpload = ['gerente','estagiario'].includes(me.perfil);
  const uploadBlock = podeUpload ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">📄 Importar Cronograma SIMO (PDF)</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="file" id="inputPdfDeslig" accept=".xlsx,.xls,.docx,.pdf" style="font-size:11px">
        <button id="btnUploadDeslig" onclick="uploadDesligamentos()" class="btn btn-primary btn-sm">📄 Importar PDF</button>
        <span style="font-size:10px;color:var(--muted)">Formatos: Excel (.xlsx), Word (.docx) ou PDF. Empreiteira identificada automaticamente pelo OIS.</span>
      </div>
    </div>` : '';

  cont.innerHTML = uploadBlock + '<div id="desligSlot"><div style="font-size:11px;color:var(--muted)">Carregando cronograma...</div></div>';

  // Load latest from Firestore
  getDocs(collection(db,'desligamentos')).then(snap=>{
    if(snap.empty){ document.getElementById('desligSlot').innerHTML='<div style="font-size:11px;color:var(--muted)">Nenhum cronograma importado ainda.</div>'; return; }
    const snapDocs = snap.docs.sort((a,b)=>b.id.localeCompare(a.id));
    _renderDesligSlot(snapDocs[0].data(), snapDocs.map(d=>d.id));
  }).catch(e=>{ document.getElementById('desligSlot').innerHTML=`<div style="color:#EF4444">Erro: ${e.message}</div>`; });
}
window.renderDesligamentos = renderDesligamentos;

// ── Renderiza os dados de uma importação ──────────────────────────────────
function _renderDesligSlot(latest, allDocIds){
    const docs = allDocIds||[latest.data];
    // Filter by profile — empreiteira sees only matching obras
    const entradas = (latest.entradas||[]).filter(e=>{
      if(me.perfil==='empreiteira'){
        // Match via empreiteira field OR via obra cruzada
        const empMatch = (e.empreiteira||'').toUpperCase().includes((me.vinculo||'').toUpperCase().split(' ')[0]);
        const obraEmpMatch = obras.find(o=>o.numero?.toString()===e.obraNumero?.toString())?.empreiteira?.toUpperCase()===me.vinculo?.toUpperCase();
        return empMatch || obraEmpMatch;
      }
      return true;
    });

    // Cross-reference with obras

    function getPrioridade(e){
      const obraMatch = obras.find(o=>(o.numero||'').toString().trim()===e.obraNumero?.toString().trim());
      if(!obraMatch) return null;
      const lim = obraMatch.dataLimite||'';
      if(lim<hoje) return {nivel:'critica', label:'⚠️ ATRASADA', cor:'#EF4444', o:obraMatch};
      if(lim<=hoje30str) return {nivel:'urgente', label:'🔴 URGENTE ≤30d', cor:'#F97316', o:obraMatch};
      return {nivel:'ok', label:'✅ Normal', cor:'#22C55E', o:obraMatch};
    }

    // Status labels
    const statusLabel = s => {
      if(s==='aguarda_programador') return `<span style="background:#F59E0B;color:#000;padding:1px 8px;border-radius:8px;font-size:9px">⏳ Ag. Programador</span>`;
      if(s==='aguarda_execucao')    return `<span style="background:#3B82F6;color:#fff;padding:1px 8px;border-radius:8px;font-size:9px">🔧 Ag. Execução</span>`;
      if(s==='aguarda_visto')       return `<span style="background:#7c6af7;color:#fff;padding:1px 8px;border-radius:8px;font-size:9px">👤 Ag. Visto Chefia</span>`;
      return `<span style="background:#6b7280;color:#fff;padding:1px 8px;border-radius:8px;font-size:9px">${s||'—'}</span>`;
    };

    // Priority analysis
    const comPrioridade = entradas.map(e=>({...e, prio:getPrioridade(e)})).filter(e=>e.prio);
    // Enriquece empreiteira vazia com dados da obra cruzada
    comPrioridade.forEach(e=>{ if(!e.empreiteira && e.prio?.o) e.empreiteira=e.prio.o.empreiteira||''; });
    const criticas = comPrioridade.filter(e=>e.prio.nivel==='critica').length;
    const urgentes = comPrioridade.filter(e=>e.prio.nivel==='urgente').length;
    const normais  = comPrioridade.filter(e=>e.prio.nivel==='ok').length;

    // Alerta de visto da chefia (aguarda aprovação do gerente)
    const comVisto = entradas.filter(e=>e.status==='aguarda_visto');
    const vistoAlert = (comVisto.length&&me.perfil==='gerente') ? (
      '<div style="background:rgba(124,106,247,.08);border:1px solid #7c6af7;border-radius:8px;padding:12px;margin-bottom:12px">'
      +'<div style="font-weight:700;font-size:12px;color:#7c6af7">👤 '+comVisto.length+' desligamento(s) aguardando seu visto/aprovação:</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'
      +comVisto.map(function(e){ return '<span style="background:var(--surface);border:1px solid #7c6af7;border-radius:6px;padding:3px 10px;font-size:10px">'
        +e.obraNumero+' — '+fmtTxt(e.dataProgram)+'</span>'; }).join('')
      +'</div></div>'
    ) : '';

    const analise = comPrioridade.length ? `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">📊 Análise de Prioridade — Obras Programadas</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div style="flex:1;min-width:120px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:900;color:#EF4444">${criticas}</div>
            <div style="font-size:9px;color:var(--muted)">⚠️ Obras ATRASADAS sendo programadas</div>
          </div>
          <div style="flex:1;min-width:120px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:900;color:#F97316">${urgentes}</div>
            <div style="font-size:9px;color:var(--muted)">🔴 Urgentes (vence ≤30d)</div>
          </div>
          <div style="flex:1;min-width:120px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:900;color:#22C55E">${normais}</div>
            <div style="font-size:9px;color:var(--muted)">✅ Prazo OK</div>
          </div>
        </div>
        ${normais>criticas+urgentes&&criticas+urgentes>0?`<div style="background:rgba(239,68,68,.08);border:1px solid #EF4444;border-radius:8px;padding:10px;font-size:11px;color:#EF4444;font-weight:700">
          ⚠️ Atenção: a empreiteira está priorizando mais obras com prazo OK do que obras urgentes/atrasadas!
        </div>`:''}
      </div>` : '';

    const rows = entradas.sort((a,b)=>{
      const pA=a.prio?.nivel; const pB=b.prio?.nivel;
      const ord={critica:0,urgente:1,ok:2};
      return (ord[pA]??3)-(ord[pB]??3) || (a.dataProgram||'').localeCompare(b.dataProgram||'');
    }).map(e=>{
      const p=e.prio;
      // Enriquece empreiteira vazia via obra
      const empDisplay = e.empreiteira || p?.o?.empreiteira || '—';
      const rowBg = p?.nivel==='critica'
        ? 'background:rgba(239,68,68,.12);border-left:4px solid #EF4444'
        : p?.nivel==='urgente'
        ? 'background:rgba(249,115,22,.10);border-left:4px solid #F97316'
        : e.status==='aguarda_visto'
        ? 'background:rgba(124,106,247,.08);border-left:4px solid #7c6af7'
        : '';
      return `<tr style="border-bottom:1px solid var(--border);${rowBg}">
        <td style="padding:5px 8px;font-size:10px;white-space:nowrap">${e.dataProgram?fmtTxt(e.dataProgram):' — '}${e.inicioHora?' '+e.inicioHora:''}</td>
        <td style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--accent);cursor:pointer" ${p?.o?'onclick="openObraModal(\''+p.o.id+'\')"':''}>${e.obraNumero||'—'}</td>
        <td style="padding:5px 8px;font-size:10px">${empDisplay}</td>
        <td style="padding:5px 8px">${statusLabel(e.status)}</td>
        <td style="padding:5px 8px;font-size:9px">${p?'<span style="color:'+p.cor+';font-weight:700">'+p.label+'</span>'+(p.o?'<br><span style="color:var(--muted)">'+fmtTxt(p.o.dataLimite)+'</span>':''):'<span style="color:var(--muted)">Obra não encontrada</span>'}</td>
      </tr>`;
    }).join('');

    document.getElementById('desligSlot').innerHTML = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        📅 Última importação: <strong>${fmtTxt(latest.data)}</strong>${latest.hora?' às <strong>'+latest.hora+'</strong>':''} — ${latest.arquivo||''} — ${entradas.length} entradas
        ${(allDocIds||[]).length>1?'<select style="font-size:10px;margin-left:8px;padding:2px 6px;border-radius:4px;border:1px solid var(--border);background:var(--surface)" onchange="this.value&&loadDesligData(this.value)">'+((allDocIds||[]).map(id=>'<option value="'+id+'">'+id+'</option>').join(''))+'</select>':''}
      </div>
      ${vistoAlert}
      ${analise}
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:6px 8px;text-align:left">Data Prog.</th>
              <th style="padding:6px 8px;text-align:left">OIS</th>
              <th style="padding:6px 8px;text-align:left">Empreiteira</th>
              <th style="padding:6px 8px;text-align:left">Status</th>
              <th style="padding:6px 8px;text-align:left">Prioridade</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
}
