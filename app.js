// ══════════════════════════════════════════════════════
//  SPPC_ARLAG — app.js
console.log('%c[SPPC] app.js v2608 carregado', 'color:#7c6af7;font-weight:bold;font-size:14px');
// ══════════════════════════════════════════════════════
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail }
                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
         onSnapshot, serverTimestamp, query, orderBy, where, writeBatch }
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
  // Problema executivo: status permanente (empreiteira sinaliza impedimento)
  if(o.impedimento)  return 'Prob. Executivo – Celesc';
  if(o.paralisada){
    const _h=(new Date()).toISOString().split('T')[0];
    if(o.paralAceiteAte && o.paralAceiteAte<_h) return 'Paral. Expirada';
    return 'Obra Paralisada';
  }
  if(o.armazenado)   return 'Encerrada';
  if(o.medida280)    return 'Aguard. Armazenamento';
  // Fix #7: medidas só avançam o status SE a fiscalização já foi confirmada
  if(o.conclusao && !o.fiscalizacao) return 'Aguard. Fiscalização'; // persiste até fiscal confirmar
  if(o.medida230)    return 'Aguard. Medida 280';
  if(o.medida70&&o.conclusao) return 'Aguard. Medida 230'; // conclusão obrigatória para Ag. Medida 230
  // R2: não exige Med.70 — medicao vai direto para "Aguard. Medida 230"
  // Medição (final) só avança status se obra já concluída pela empreiteira
  if(o.medicao&&o.conclusao) return o.tipo==='R2' ? 'Aguard. Medida 230' : 'Aguard. Medida 70';
  if(o.fiscalizacao && !o.dataCadastro){
    const d=diff(o.fiscalizacao, new Date().toISOString().split('T')[0]);
    if(d!==null && d>7) return 'Encaminhar Cadastro Urgente';
  }
  if(o.kaffa){
    // Se já tem medição parcial registrada (qualquer capitalização) e sem conclusão → Em Execução
    const temMedParcial = (o.medicoes||[]).some(m=>(m.tipo||'').toLowerCase()==='parcial');
    // Também: se só tem kaffa parcial (sem kafka final) e sem conclusão → Em Execução
    const kafkaFinal = (o.kaffaEntries||[]).some(k=>(k.tipo||'').toLowerCase()==='final');
    const soConcluída = o.conclusao;
    if((temMedParcial || !kafkaFinal) && !soConcluída) return 'Em Execução';
    return 'Aguard. Medição';
  }
  if(o.fiscalizacao) return 'Aguardando Kaffa';
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

function statusDesligamento(o){
  // Verifica se obra tem desligamento programado no mapa de desligamentos importados
  const desl = window._deslMap && window._deslMap[(o.numero||'').toString()];
  if(!desl) return '';
  const statusCor = desl.status==='aguarda_execucao' ? '#22C55E' : '#F59E0B';
  const statusLabel = desl.status==='aguarda_execucao' ? '🔧 Desl. Ag. Execução'
    : desl.status==='aguarda_visto' ? '👤 Desl. Ag. Visto'
    : '⏳ Desl. Ag. Programador';
  const dataLabel = desl.dataProgram ? ' — '+fmtTxt(desl.dataProgram)+(desl.inicioHora?' '+desl.inicioHora:'') : '';
  return `<span class="st" style="color:${statusCor};background:${statusCor}22;border-color:${statusCor}55;margin-left:4px;font-weight:700" title="Desligamento programado${dataLabel}"><span style="background:${statusCor}"></span>${statusLabel}${dataLabel}</span>`;
}

function statusHtml(o){
  const s=statusOf(o), d=STATUS_DEF[s]||{cor:'#888',bg:'rgba(128,128,128,.15)'};
  return `<span class="st" style="color:${d.cor};background:${d.bg};border-color:${d.cor}44">
    <span style="background:${d.cor}"></span>${s}</span>${statusSecundario(o)}${statusDesligamento(o)}`;
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

  // pgAbertura: somente gerente | pgAnalise: gerente, fiscais e empreiteira
  const canSeeAbertura   = me.perfil==='gerente';
  const canSeeFinanceiro = me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm'||me.perfil==='empreiteira';
  const canSeeProgramas = ['gerente','fiscal','fiscal_adm','empreiteira'].includes(me.perfil);
  const tabs=[
    ['pgDash','📊 Dashboard'],
    ['pgObras','🏗️ Obras'],
    ...(canSeeAbertura?[['pgAbertura','📊 Abertura de Obras']]:[]),
    ...(canSeeFinanceiro?[['pgAnalise','💰 Análise Financeira']]:[]),
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
window.renderDash = renderDash;  // Export para inline handlers


// ── Favoritos ────────────────────────────────────────────────────────────────
window.toggleFavorito = async function(obraId){
  const obra = obras.find(o=>o.id===obraId);
  if(!obra) return;
  const favs = Array.isArray(obra.favorito) ? [...obra.favorito] : [];
  const uid  = auth.currentUser?.uid||'';
  if(!uid) return;
  const idx  = favs.indexOf(uid);
  if(idx>=0) favs.splice(idx,1); else favs.push(uid);
  await updateDoc(doc(db,'obras',obraId),{favorito:favs});
  obra.favorito = favs;
  renderDash();
};

async function renderDashFavoritos(){
  const uid = auth.currentUser?.uid||'';
  if(!uid) return '';
  const favObras = obras.filter(o=>Array.isArray(o.favorito)&&o.favorito.includes(uid)
    &&!o.cancelado&&!o.armazenado);
  if(!favObras.length) return '';
  const rows = favObras.map(o=>{
    const st  = statusOf(o);
    const stCor = st.includes('Atrasada')||st.includes('Expirada')||st.includes('Executivo')
      ? '#EF4444' : st.includes('Paral')||st.includes('Kaffa') ? '#F59E0B' : 'var(--muted)';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <button onclick="toggleFavorito('${o.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:#F59E0B;flex-shrink:0">⭐</button>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="openObraModal('${o.id}')">${o.numero||o.id}</div>
        <div style="font-size:9px;color:var(--muted)">${o.cidade||o.municipio||'—'} · ${o.empreiteira||'—'}</div>
      </div>
      <span style="font-size:9px;color:${stCor};white-space:nowrap;font-weight:600">${st}</span>
    </div>`;
  }).join('');
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">
    <div style="font-weight:700;font-size:12px;margin-bottom:8px">⭐ Obras Favoritas (${favObras.length})</div>
    ${rows}
  </div>`;
}

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


// ── Indicador de Execução — USC no prazo vs atrasada (D0 a D+7) ──────────
function renderIndicadorExecucao(list){
  // Base: obras RD (!cancelado, !armazenado) com dataLimite definida
  // Base: obras RD ativas, sem medida230 (230 = campo encerrado do ponto de vista executivo)
  // e sem armazenamento, cancelamento
  const base = list.filter(o=>
    (o.tipo==='R1'||o.tipo==='R2') &&
    !o.cancelado && !o.armazenado && o.dataLimite &&
    !o.medida230 &&           // exclui obras já com medida 230 informada
    (parseFloat(o.usc)||0) > 0
  );
  if(!base.length) return '';

  const uscTotal = base.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  if(!uscTotal) return '';

  // Paralisadas justificadas: aceite da central vigente
  // isParalExcluir: exclui obra paralisada do cálculo de atrasadas
  // Considera: qualquer obra paralisada (independente do aceite da Central)
  function isParalExcluir(o){
    return !!o.paralisada; // qualquer paralisada é excluída quando toggle ligado
  }

  // Calcula indicador para cada dia D0..D+7
  // exclParalJust: true = paralisadas justificadas não entram como atrasadas
  function calcIndicador(dataRef, exclParalJust, prevDataRef){
    const atrasadas = base.filter(o=>{
      if(o.dataLimite>=dataRef || o.conclusao) return false;
      if(exclParalJust && isParalExcluir(o)) return false;
      return true;
    });
    const uscAtrasadas = atrasadas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const uscNoPrazo   = uscTotal - uscAtrasadas;
    // USC que VENCE neste passo (entre prevDataRef e dataRef, exclusive)
    const uscVencendo = prevDataRef
      ? base.filter(o=>o.dataLimite>=prevDataRef && o.dataLimite<dataRef && !o.conclusao
          && !(exclParalJust && isParalExcluir(o)))
          .reduce((s,o)=>s+(parseFloat(o.usc)||0),0)
      : 0;
    return {
      pct:       Math.max(0, Math.min(100, (uscNoPrazo/uscTotal)*100)),
      uscAtras:  uscAtrasadas,
      uscPrazo:  uscNoPrazo,
      nAtras:    atrasadas.length,
      uscVencendo,
      nParalJust: exclParalJust ? base.filter(o=>o.dataLimite<dataRef&&!o.conclusao&&o.paralisada).length : 0
    };
  }

  const hoje = new Date();
  const dias = Array.from({length:8},(_,i)=>{
    const d = new Date(hoje); d.setDate(d.getDate()+i);
    return d.toISOString().split('T')[0];
  });

  // Milestones: início e fim dos próximos 3 meses
  const milestones = [];
  for(let m=1; m<=3; m++){
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth()+m, 1);
    const fim    = new Date(hoje.getFullYear(), hoje.getMonth()+m+1, 0);
    const nomeMes = inicio.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    milestones.push({dia:inicio.toISOString().split('T')[0], label:'Início '+nomeMes, milestone:true});
    milestones.push({dia:fim.toISOString().split('T')[0],    label:'Fim '+nomeMes,    milestone:true});
  }

  // Toggle state (persiste na sessão)
  if(typeof window._indicExclParal === 'undefined') window._indicExclParal = false;
  const exclParal = window._indicExclParal;

  const indicadores = dias.map((d,i)=>({ dia:d, label:null, ...calcIndicador(d, exclParal, i>0?dias[i-1]:null) }));
  const indicMilestones = milestones.map((ms,i)=>({
    ...ms,
    ...calcIndicador(ms.dia, exclParal, i>0?milestones[i-1].dia:dias[dias.length-1])
  }));
  const atual = indicadores[0].pct;

  // USC breakdown para hoje (já calculado em indicadores[0])
  const uscAtualAtras = indicadores[0].uscAtras;
  const uscAtualPrazo = indicadores[0].uscPrazo;
  const nAtrasadas    = indicadores[0].nAtras;
  const nParalJust    = indicadores[0].nParalJust;
  const nNoPrazo      = base.length - nAtrasadas;

  // Cor do indicador
  function corIndicador(v){ return v>=85?'#22C55E':v>=70?'#F59E0B':'#EF4444'; }
  function labelDia(iso, i){
    if(i===0) return 'Hoje';
    const d=new Date(iso); return 'D+'+i+' ('+d.getDate()+'/'+(d.getMonth()+1)+')';
  }

  // Barras de progresso
  const barras = indicadores.map((item,i)=>{
    const cor = corIndicador(item.pct);
    const delta = i===0 ? '' : (item.pct - indicadores[i-1].pct).toFixed(1);
    const deltaStr = i===0 ? '' : (parseFloat(delta)>=0?'+':'')+delta+'%';
    const deltaColor = parseFloat(delta)>=0?'#22C55E':'#EF4444';
    const nParalNote = item.nParalJust>0 ? ` <span style="font-size:8px;color:#7c6af7">(+${item.nParalJust} paral.just.)</span>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:90px;font-size:10px;color:var(--muted);flex-shrink:0">${labelDia(item.dia,i)}</div>
      <div style="flex:1;background:var(--surface2);border-radius:6px;height:20px;overflow:hidden">
        <div style="width:${item.pct.toFixed(1)}%;height:100%;background:${cor};border-radius:6px;
          display:flex;align-items:center;padding-left:6px">
          <span style="font-size:10px;font-weight:700;color:#fff;white-space:nowrap">${item.pct.toFixed(1)}%</span>
        </div>
      </div>
      <div style="font-size:9px;width:100px;text-align:right;flex-shrink:0">
        ${i>0&&item.uscVencendo>0?`<span style="color:#EF4444;font-size:8px">-${item.uscVencendo.toFixed(0)} USC</span><br>`:''}
        ${i>0?`<span style="color:${deltaColor}">${deltaStr}</span>`:``}${nParalNote}
      </div>
    </div>`;
  }).join('');

  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-weight:800;font-size:13px">📈 Indicador de Execução</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--muted)">
          <input type="checkbox" ${exclParal?'checked':''} onchange="window._indicExclParal=this.checked; renderDash();" style="cursor:pointer">
          Excluir obras <strong>paralisadas</strong> das atrasadas
        </label>
        <span style="font-size:10px;color:var(--muted)">USC no prazo / USC total</span>
      </div>
    </div>
    ${nParalJust>0&&exclParal?`<div style="font-size:10px;color:#7c6af7;background:rgba(124,106,247,.08);border:1px solid rgba(124,106,247,.3);border-radius:6px;padding:6px 10px;margin-bottom:10px">
      🛑 ${nParalJust} obra(s) paralisada(s) excluída(s) do cálculo de atrasadas
    </div>`:''}

    <!-- Resumo hoje -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:14px">
      <div style="background:${corIndicador(atual)}22;border:1px solid ${corIndicador(atual)}55;border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:${corIndicador(atual)}">${atual.toFixed(1)}%</div>
        <div style="font-size:9px;color:var(--muted)">Hoje</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#22C55E">${uscAtualPrazo.toFixed(0)}</div>
        <div style="font-size:9px;color:var(--muted)">USC no prazo (${nNoPrazo} obras)</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#EF4444">${uscAtualAtras.toFixed(0)}</div>
        <div style="font-size:9px;color:var(--muted)">USC atrasadas (${nAtrasadas} obras)</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:700">${uscTotal.toFixed(0)}</div>
        <div style="font-size:9px;color:var(--muted)">USC total RD (${base.length} obras)</div>
      </div>
    </div>

    <!-- Projeção D0 a D+7 -->
    <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
      Projeção — obras sem conclusão que vencem entram como atrasadas
    </div>
    ${barras}
    <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border)">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
        Perspectiva mensal — próximos 3 meses
      </div>
      ${indicMilestones.map((item,i)=>{
        const cor = corIndicador(item.pct);
        const prev = i===0 ? indicadores[indicadores.length-1] : indicMilestones[i-1];
        const delta = (item.pct - prev.pct).toFixed(1);
        const deltaStr = (parseFloat(delta)>=0?'+':'')+delta+'%';
        const deltaColor = parseFloat(delta)>=0?'#22C55E':'#EF4444';
        const isInicio = item.label.startsWith('Início');
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px${isInicio?';margin-top:8px':''}">
          <div style="width:90px;font-size:10px;color:${isInicio?'var(--muted)':'var(--muted)'};flex-shrink:0;${isInicio?'font-weight:700':''}">${item.label}</div>
          <div style="flex:1;background:var(--surface2);border-radius:6px;height:18px;overflow:hidden">
            <div style="width:${item.pct.toFixed(1)}%;height:100%;background:${cor};border-radius:6px;
              display:flex;align-items:center;padding-left:6px">
              <span style="font-size:9px;font-weight:700;color:#fff;white-space:nowrap">${item.pct.toFixed(1)}%</span>
            </div>
          </div>
          <div style="font-size:9px;width:100px;text-align:right;flex-shrink:0">
            ${item.uscVencendo>0?`<span style="color:#EF4444;font-size:8px">-${item.uscVencendo.toFixed(0)} USC</span><br>`:''}
            <span style="color:${deltaColor}">${deltaStr}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:12px;margin-top:8px;font-size:9px;color:var(--muted)">
      <span>🟢 ≥ 85% bom</span><span>🟡 70–85% atenção</span><span>🔴 &lt; 70% crítico</span>
    </div>
  </div>`;
}

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

  // ── Indicador de Execução (D0 a D+7) ──────────────────────────────────────
  html += renderIndicadorExecucao(list);

  // Tabela resumo por fiscal
  // Cadastro urgente por fiscal
  const obsCadUrg = list.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente');
  if(obsCadUrg.length){
    const byFiscal={};
    obsCadUrg.forEach(o=>{ const f=o.fiscal||'Sem Fiscal'; if(!byFiscal[f]) byFiscal[f]=[]; byFiscal[f].push(o); });
    html+=`<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#EF4444;margin-bottom:10px">📋 Cadastro Urgente Pendente (+7d após fiscalização)</div>
      ${Object.entries(byFiscal).map(([fisc,obs])=>`
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;margin-bottom:4px">👤 ${fisc} — ${obs.length} obra(s)</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${obs.map(o=>`<span style="background:var(--surface);border:1px solid rgba(239,68,68,.4);border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer" onclick="aplicarFiltro('status','Encaminhar Cadastro Urgente')" title="${o.cidade||''}">${o.numero}</span>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  }
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
    const aguardKaffa = minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.kaffa).length;
    const fiscSemKaffa = minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.kaffa).length;
    const impedimentos = minhas.filter(o=>o.impedimento&&!o.conclusao).length;
    const atrasadas = minhas.filter(o=>statusOf(o)==='Atrasada').length;
    const c = gc(e.nome);
    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>
        <strong>${e.nome}</strong></span></td>
      <td style="text-align:center">${minhas.length}</td>
      <td style="text-align:center;color:${aguardKaffa>0?'var(--accent3)':'var(--muted)'}">${aguardKaffa}</td>
      <td style="text-align:center;${fiscSemKaffa>0?'color:#EF4444;font-weight:700':'color:var(--muted)'}">${fiscSemKaffa||'—'}</td>
      <td style="text-align:center;color:${pend>0?'var(--accent2)':'var(--muted)'}">${pend}${agConf>0?` <span style="font-size:9px;color:#F59E0B">(${agConf} reg.)</span>`:''}</td>
      <td style="text-align:center;color:${impedimentos>0?'var(--red)':'var(--muted)'}">${impedimentos}</td>
      <td style="text-align:center;color:${atrasadas>0?'var(--red)':'var(--muted)'}">${atrasadas}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="setDashPerspectiva('empreiteira:${e.nome.replace(/'/g,"\'")}')">👁️ Ver</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="max-height:none"><table>
    <thead><tr>
      <th>Empreiteira</th><th style="text-align:center">Total</th><th style="text-align:center">Aguard. Kaffa</th>
      <th style="text-align:center;color:#EF4444">Fisc. s/ Kaffa ⚠️</th>
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
    ${kpiCard('Fisc. s/ Kaffa',list.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscal===meuNome&&o.fiscalizacao&&!o.kaffa).length,'após fisc. — urgente','#EF4444')}
    ${kpiCard('Pendências Ativas',comPend.length,'não resolvidas','#F97316')}
    ${kpiCard('Ag. Conf. Pend.',agConfPend.length,'regularizadas p/ conferir','#F59E0B')}
    ${kpiCard('Cadastro Urgente',cadUrgente.length,'+7d sem enviar','#EF4444')}
    ${kpiCard('Fiscalizadas/Mês',fiscMes.length,'mês corrente','#38bdf8')}
    ${kpiCard('Tempo Médio Fisc.',tempoFisc!==null?tempoFisc+'d':'—','conclusão→fiscalização','#a3e635')}
    ${kpiCard('Tempo Médio Med.',tempoMed!==null?tempoMed+'d':'—','kaffa→medição','#fb7185')}
    ${kpiCard('Tempo Médio Cadastro',tempoCad!==null?tempoCad+'d':'—','fiscalização→cadastro','#f5c542')}
  </div>`;
  // Cadastro urgente para fiscal — suas obras
  if(cadUrgente.length){
    html += `<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#EF4444;margin-bottom:8px">📋 Cadastro Urgente Pendente (+7d após fiscalização) — ${cadUrgente.length} obra(s)</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${cadUrgente.map(o=>`<span style="background:var(--surface);border:1px solid rgba(239,68,68,.4);border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer" onclick="openObraModal('${o.id}')" title="${o.cidade||''}">${o.numero}</span>`).join('')}
      </div>
    </div>`;
  }
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
  // Aguarda Kaffa: empreiteira informou conclusão mas ainda não registrou kaffa
  const aguardKaffa = minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.kaffa);
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
    ${kpiCard('Fisc. s/ Kaffa',minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.kaffa).length,'após fiscalização — urgente','#EF4444')}
    ${kpiCard('Aguard. Medição',aguardMed.length,'kaffa sem medição','#6366F1')}
    ${kpiCard('Com Pendência',comPend.length,'não resolvidas','#F97316')}
    ${kpiCard('Paralisadas',minhas.filter(o=>o.paralisada).length,'obras paralisadas','#DC2626')}
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
  const chkTh = window._bulkMode ? `<th style="width:32px;padding:4px 8px;text-align:center"><input type="checkbox" id="chkTodos" onchange="
  if(!window._bulkSelecionados) window._bulkSelecionados=new Set();
  document.querySelectorAll('.chk-obra').forEach(c=>{
    c.checked=this.checked;
    if(this.checked) window._bulkSelecionados.add(c.dataset.id);
    else window._bulkSelecionados.delete(c.dataset.id);
  });
  const el=document.getElementById('bulkCount');
  if(el) el.textContent=window._bulkSelecionados.size+' obra(s) selecionada(s)';
" title="Selecionar todas"></th>` : '';
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
  else if(_filtroRapidoAtivo === 'fisc_sem_cad')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.dataCadastro&&(()=>{const d=diff(o.fiscalizacao,(new Date()).toISOString().split('T')[0]);return d!==null&&d>7;})());
  else if(_filtroRapidoAtivo === 'fisc_sem_med')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.medicao&&o.tipo!=='ODI');
  else if(_filtroRapidoAtivo === 'conc_sem_med')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!temMedicaoFinal(o));
  else if(_filtroRapidoAtivo === 'conc_sem_fisc') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.fiscalizacao);
  else if(_filtroRapidoAtivo === 'pend_exec')     baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.pendencia&&!o.pendenciaResolvida&&!o.regularizacaoData);
  else if(_filtroRapidoAtivo === 'paral_expirada')  baseList = baseList.filter(o=>o.paralisada&&o.paralAceiteAte&&o.paralAceiteAte<(new Date()).toISOString().split('T')[0]);
  else if(_filtroRapidoAtivo === 'prob_executivo')  baseList = baseList.filter(o=>o.impedimento&&!o.cancelado&&!o.armazenado);
  else if(_filtroRapidoAtivo === 'conc_sem_kaffa') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.kaffa);
  else if(_filtroRapidoAtivo === 'fisc_sem_kaffa') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.kaffa);
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
  // Atualiza contador de selecionadas (persiste entre filtros)
  if(window._bulkMode && window._bulkSelecionados && window._bulkSelecionados.size > 0){
    const bulkEl = document.getElementById('bulkCount');
    if(bulkEl) bulkEl.textContent = window._bulkSelecionados.size + ' obra(s) selecionada(s)';
  }
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
    const temDesl = !!(window._deslMap && window._deslMap[(o.numero||'').toString()]);
    const deslStatus = temDesl ? window._deslMap[(o.numero||'').toString()].status : '';
    const rowBg = o.processoCancelamento && !o.cancelado
      ? 'background:rgba(168,85,247,.08);border-left:2px solid #A855F7;'
      : (o.pendencia&&!o.pendenciaResolvida)
        ? 'background:rgba(249,115,22,.07);'
        : (statusOf(o)==='Atrasada'||statusOf(o)==='Encaminhar Cadastro Urgente')
          ? 'background:rgba(239,68,68,.07);'
          : temDesl && deslStatus==='aguarda_execucao'
            ? 'background:rgba(34,197,94,.07);border-left:3px solid #22C55E;'
            : temDesl
              ? 'background:rgba(245,158,11,.06);border-left:3px solid #F59E0B;'
              : '';
    const procCancBadge = o.processoCancelamento && !o.cancelado
      ? '<span style="font-size:8px;background:rgba(168,85,247,.2);color:#A855F7;border:1px solid rgba(168,85,247,.4);padding:1px 5px;border-radius:4px;margin-left:4px">⏸ CANC.</span>'
      : '';
    const stk = 'position:sticky;z-index:1;background:' + (rowBg.includes('EF4444')?'rgba(20,5,5,1)':rowBg.includes('A855F7')?'rgba(15,5,20,1)':rowBg.includes('F97316')?'rgba(20,10,0,1)':'var(--surface)');
    return `<tr style="${rowBg}">
      <td class="col-chk" style="display:${isChkMode?'table-cell':'none'};width:32px;padding:4px 8px;text-align:center">
        <input type="checkbox" class="chk-obra" data-id="${o.id}"
          ${(window._bulkSelecionados&&window._bulkSelecionados.has(o.id))?'checked':''}
          onchange="(()=>{
            if(!window._bulkSelecionados) window._bulkSelecionados=new Set();
            if(this.checked) window._bulkSelecionados.add(this.dataset.id);
            else window._bulkSelecionados.delete(this.dataset.id);
            const n=window._bulkSelecionados.size;
            const el=document.getElementById('bulkCount');
            if(el) el.textContent=n+' obra(s) selecionada(s)';
          })()">
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
    if(obra.paralisada){
      set('oParalAceite', obra.paralAceite||'');
      set('oParalAceiteAte', obra.paralAceiteAte||'');
      if(typeof toggleParalAceite==='function') toggleParalAceite();
      // Alert if acceptance expired
      const aceiteAte = obra.paralAceiteAte||'';
      const alertEl = document.getElementById('paralisacaoAlertaVencimento');
      if(alertEl && aceiteAte && aceiteAte < hojeStr()){
        alertEl.style.display='block';
        alertEl.textContent='⚠️ Prazo de aceite da Central venceu em '+fmtTxt(aceiteAte)+'. Necessária nova confirmação!';
      } else if(alertEl){ alertEl.style.display='none'; }
    }
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
    // Mostra equipamentos para fiscal/gerente: verifica campos antigos E novos arrays
    const temEquipNovo = (obra?.equipamentosInstalados||[]).length>0 || (obra?.equipamentosRetirados||[]).length>0;
    const temEquipAntigo = obra?.placas || obra?.sap || obra?.potencia;
    if((p==='fiscal'||p==='fiscal_adm'||p==='gerente') && isEdit && (temEquipNovo||temEquipAntigo)){
      showSec('secTransfView');
      renderEquipView(obra); // popula com todos os equipamentos
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
        paralisada:gChk('oParalisada'), motivoParalisada:g('oMotivoParalisada')||null,
        paralAceite:g('oParalAceite')||null, paralAceiteAte:g('oParalAceiteAte')||null,
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
  if(!emailJSAtivo()){
    console.warn('[SPPC Email] EmailJS inativo — e-mail não enviado. Verifique emailjs-config.js');
    // Verifica causa específica
    if(typeof emailjs === 'undefined') console.warn('[SPPC Email] → biblioteca EmailJS não carregada no HTML');
    else if(!EMAILJS_CONFIG?.publicKey||EMAILJS_CONFIG.publicKey.startsWith('COLE_AQUI')) console.warn('[SPPC Email] → publicKey não configurada em emailjs-config.js');
    else if(!EMAILJS_CONFIG?.tplGeral||EMAILJS_CONFIG.tplGeral.startsWith('COLE_AQUI')) console.warn('[SPPC Email] → tplGeral não configurado em emailjs-config.js');
    return;
  }
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
    // Tenta fallback: email do gerente como destinatário
    const gerEmail = EMAILJS_CONFIG?.emailGerente;
    if(gerEmail){
      await enviarEmail(
        `SPPC ARLAG – Kaffa sem fiscal | Obra ${obra.numero}`,
        `Atenção: kaffa registrado na obra ${obra.numero} (${obra.cidade}) mas o fiscal ${obra.fiscal||'—'} não possui email cadastrado. Registre o email do fiscal no painel de usuários.`,
        gerEmail, ''
      );
    }
    toast('⚠️ Email ao fiscal não enviado (sem email cadastrado). Notificação enviada ao gerente.','warn');
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
window._deslMap = {};   // {obraNumero: {dataProgram, status, inicioHora}} — atualizado ao carregar desligamentos
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
  window._bulkSelecionados = new Set(); // persiste seleção entre filtros
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
  window._bulkSelecionados = new Set(); // limpa seleção
  document.getElementById('bulkBar').style.display = 'none';
  window.renderObras();
}
window.fecharBulk = fecharBulk;
window.abrirBulkMedidas = ()=>window.abrirBulk('medidas'); // legado
window.fecharBulkMedidas = fecharBulk; // legado

function bulkSelecionadas(){
  // Usa a Set persistente (mantém seleção mesmo após filtros mudarem)
  if(window._bulkSelecionados && window._bulkSelecionados.size > 0)
    return [...window._bulkSelecionados];
  // Fallback: lê do DOM (caso Set não esteja inicializada)
  return [...document.querySelectorAll('.chk-obra:checked')].map(el=>el.dataset.id);
}

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


// ══════════════════════════════════════════════════════════════════
//  CARTEIRA FUTURA — OBRAS CLIENTE (Fase 1)
//  Fila priorizada + upload Excel + estatísticas + configurações
// ══════════════════════════════════════════════════════════════════

// ── Estado local ─────────────────────────────────────────────────
let _cfObras    = [];   // obras na fila (ordenadas por posicao)
let _cfConfig   = {};   // configurações do gerente
let _cfDragSrc  = null; // linha arrastada no drag-and-drop
let _cfAbaAtiva = 'cliente'; // 'cliente' | 'melhoria'

// ── Render principal ─────────────────────────────────────────────
function renderCarteiraFutura(){
  const cont = document.getElementById('pgCarteiraFuturaContent');
  if(!cont) return;
  cont.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:16px">📅 Carteira Futura</div>

    <!-- Tabs -->
    <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:12px">
      <button id="cfTabCliente" onclick="cfSetAba('cliente')"
        style="padding:6px 20px;border-radius:8px;border:none;cursor:pointer;font-weight:700;font-size:13px;
        background:var(--accent);color:#fff">📋 Obras Cliente</button>
      <button id="cfTabMelhoria" onclick="toast('Obras Melhoria será implementado na próxima fase.','warn')"
        style="padding:6px 20px;border-radius:8px;border:1px solid var(--border);cursor:not-allowed;font-size:13px;
        background:var(--surface);color:var(--muted);opacity:.5" title="Em breve — próxima fase">🔧 Obras Melhoria</button>
    </div>

    <div id="cfAbaCliente">
      <!-- Config colapsável -->
      <details id="cfConfigPanel" style="margin-bottom:16px">
        <summary style="cursor:pointer;font-weight:700;font-size:13px;padding:12px;
          background:var(--surface);border:1px solid var(--border);border-radius:10px;list-style:none">
          ⚙️ Parâmetros de Seleção e Otimização ▾
        </summary>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:0 0 10px 10px;
          padding:16px;margin-top:-1px" id="cfConfigBody">
          <div class="loading" style="font-size:11px">Carregando...</div>
        </div>
      </details>

      <!-- Ações -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="cfModalAddObra()">➕ Adicionar Obra</button>
        <input type="search" id="cfBusca" placeholder="🔍 Buscar por OIS/nota..." style="font-size:11px;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:inherit;width:200px" oninput="cfAplicarBusca(this.value)">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          📤 Importar Excel
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="cfUploadExcel(this)">
        </label>
        <button class="btn btn-secondary btn-sm" onclick="cfRunSelecao()">🎯 Executar Seleção</button>
        <button class="btn btn-secondary btn-sm" style="color:#EF4444;border-color:#EF444455" onclick="cfLimparTudo()">🗑️ Limpar Tudo</button>
        <span id="cfContador" style="font-size:11px;color:var(--muted);margin-left:auto"></span>
      </div>

      <!-- Estatísticas -->
      <div id="cfEstatisticas" style="margin-bottom:16px"></div>

      <!-- Fila -->
      <div id="cfFilaContainer">
        <div class="loading">Carregando fila...</div>
      </div>
    </div>
  `;

  cfLoadConfig().then(()=>{ cfRenderConfig(); });
  cfLoadObras();
}
window.renderCarteiraFutura = renderCarteiraFutura;

// ── Aba ──────────────────────────────────────────────────────────
window.cfSetAba = function(aba){
  _cfAbaAtiva = aba;
  // Visual
  document.getElementById('cfTabCliente').style.background = aba==='cliente' ? 'var(--accent)' : 'var(--surface)';
  document.getElementById('cfTabCliente').style.color = aba==='cliente' ? '#fff' : 'var(--muted)';
  document.getElementById('cfAbaCliente').style.display = aba==='cliente' ? '' : 'none';
};

// ── Carregar obras do Firestore ──────────────────────────────────
async function cfLoadObras(){
  try{
    const snap = await getDocs(collection(db,'carteira_futura'));
    _cfObras = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(a.posicao||999)-(b.posicao||999));
    cfRenderFila();
    cfRenderEstatisticas();
    cfAtualizarContador();
  }catch(e){
    document.getElementById('cfFilaContainer').innerHTML =
      `<div style="color:#EF4444;font-size:12px">Erro ao carregar: ${e.message}</div>`;
  }
}

// ── Carregar e salvar configuração ───────────────────────────────
async function cfLoadConfig(){
  try{
    const snap = await getDoc(doc(db,'config','carteiraFutura'));
    _cfConfig = snap.exists() ? snap.data() : {};
  }catch(e){ _cfConfig = {}; }
}

window.cfSaveConfig = async function(){
  const g = id => document.getElementById(id)?.value;
  const cfg = {
    limiteObras:    parseInt(g('cfLimObras'))||35,
    limiteUSC:      parseFloat(g('cfLimUSC'))||5000,
    raioProx:          parseFloat(g('cfRaioProx'))||10,
    alfaProximidade:   parseFloat(g('cfAlfa'))||0.6,
    capacidadeBaseUSC_CS: parseFloat(g('cfCapBaseCS'))||2000,
    capacidadeBaseUSC_EL: parseFloat(g('cfCapBaseEL'))||2000,
    limiteAtrasadas_CS:   parseFloat(g('cfLimAtrCS'))||20,
    limiteAtrasadas_EL:   parseFloat(g('cfLimAtrEL'))||20,
    fatoresSazonais_CS: {m2:parseFloat(g('cfFatorCSm2'))||0.85,m3:parseFloat(g('cfFatorCSm3'))||0.85,m4:parseFloat(g('cfFatorCSm4'))||0.9,m5:parseFloat(g('cfFatorCSm5'))||1.0,m6:parseFloat(g('cfFatorCSm6'))||1.0,m7:parseFloat(g('cfFatorCSm7'))||0.95,m8:parseFloat(g('cfFatorCSm8'))||0.9,m9:parseFloat(g('cfFatorCSm9'))||1.05,m10:parseFloat(g('cfFatorCSm10'))||1.05,m11:parseFloat(g('cfFatorCSm11'))||1.0,m12:parseFloat(g('cfFatorCSm12'))||1.0,m13:parseFloat(g('cfFatorCSm13'))||0.75},
    fatoresSazonais_EL: {m2:parseFloat(g('cfFatorELm2'))||0.85,m3:parseFloat(g('cfFatorELm3'))||0.85,m4:parseFloat(g('cfFatorELm4'))||0.9,m5:parseFloat(g('cfFatorELm5'))||1.0,m6:parseFloat(g('cfFatorELm6'))||1.0,m7:parseFloat(g('cfFatorELm7'))||0.95,m8:parseFloat(g('cfFatorELm8'))||0.9,m9:parseFloat(g('cfFatorELm9'))||1.05,m10:parseFloat(g('cfFatorELm10'))||1.05,m11:parseFloat(g('cfFatorELm11'))||1.0,m12:parseFloat(g('cfFatorELm12'))||1.0,m13:parseFloat(g('cfFatorELm13'))||0.75},
    pesoDistancia:     parseFloat(g('cfPesoDist'))||40,
    pesoEquilibrio: parseFloat(g('cfPesoEq'))||40,
    pesoDesligamento: parseFloat(g('cfPesoDesl'))||20,
    metaObrasCS:    parseFloat(g('cfMetaObrasCS'))||150,
    metaObrasEL:    parseFloat(g('cfMetaObrasEL'))||130,
    metaUSCCS:      parseFloat(g('cfMetaUSCCS'))||50000,
    metaUSCEL:      parseFloat(g('cfMetaUSCEL'))||45000,
  };
  // Valida soma dos pesos
  const soma = cfg.pesoDistancia + cfg.pesoEquilibrio + cfg.pesoDesligamento;
  if(Math.abs(soma-100)>1){ toast(`Pesos devem somar 100% (atual: ${soma}%)`, 'err'); return; }
  await setDoc(doc(db,'config','carteiraFutura'), cfg);
  _cfConfig = cfg;
  toast('✓ Configurações salvas.','ok');
};

// ── Render config panel ──────────────────────────────────────────
function cfRenderConfig(){
  const c = _cfConfig;
  const body = document.getElementById('cfConfigBody');
  if(!body) return;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:12px">

      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
        <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Limites de Seleção</legend>
        <div class="fg" style="margin-bottom:8px">
          <label style="font-size:10px">Máx. Obras</label>
          <input type="number" id="cfLimObras" value="${c.limiteObras||35}" min="1" max="999" style="font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:10px">Máx. USC</label>
          <input type="number" id="cfLimUSC" value="${c.limiteUSC||5000}" min="0" step="100" style="font-size:12px">
        </div>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
        <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Pesos do Score (%)</legend>
        <div class="fg" style="margin-bottom:6px">
          <label style="font-size:10px">Distância</label>
          <input type="number" id="cfPesoDist" value="${c.pesoDistancia||40}" min="0" max="100" style="font-size:12px">
        </div>
        <div class="fg" style="margin-bottom:6px">
          <label style="font-size:10px">Equilíbrio</label>
          <input type="number" id="cfPesoEq" value="${c.pesoEquilibrio||40}" min="0" max="100" style="font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:10px">Desligamento</label>
          <input type="number" id="cfPesoDesl" value="${c.pesoDesligamento||20}" min="0" max="100" style="font-size:12px">
        </div>
        <div style="font-size:9px;color:var(--muted);margin-top:4px">Soma deve ser 100%</div>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
        <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Metas de Obras</legend>
        <div class="fg" style="margin-bottom:6px">
          <label style="font-size:10px">CS Eletricidade</label>
          <input type="number" id="cfMetaObrasCS" value="${c.metaObrasCS||150}" style="font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:10px">Eletelsul</label>
          <input type="number" id="cfMetaObrasEL" value="${c.metaObrasEL||130}" style="font-size:12px">
        </div>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
        <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Metas USC</legend>
        <div class="fg" style="margin-bottom:6px">
          <label style="font-size:10px">CS Eletricidade</label>
          <input type="number" id="cfMetaUSCCS" value="${c.metaUSCCS||50000}" style="font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:10px">Eletelsul</label>
          <input type="number" id="cfMetaUSCEL" value="${c.metaUSCEL||45000}" style="font-size:12px">
        </div>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
        <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Proximidade</legend>
        <div class="fg" style="margin-bottom:6px">
          <label style="font-size:10px">Raio (km)</label>
          <input type="number" id="cfRaioProx" value="${c.raioProx||10}" min="1" max="100" style="font-size:12px">
        </div>
        <div class="fg">
          <label style="font-size:10px">Peso obra mais próxima (α)</label>
          <input type="number" id="cfAlfa" value="${c.alfaProximidade||0.6}" min="0" max="1" step="0.1" style="font-size:12px">
          <small style="font-size:9px;color:var(--muted)">0=só mediana · 1=só mínima</small>
        </div>
      </fieldset>

${cfRenderCapacidadeFieldset('CS ELETRICIDADE','CS',c)}
        <div style="font-size:9px;font-weight:700;color:var(--muted);margin-bottom:4px">Fatores sazonais (×base)</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jan</span><input type="number" id="cfFatorCSm1" value="${(c.fatoresSazonais_CS||{})["m1"]||0.85}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Fev</span><input type="number" id="cfFatorCSm2" value="${(c.fatoresSazonais_CS||{})["m2"]||0.85}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Mar</span><input type="number" id="cfFatorCSm3" value="${(c.fatoresSazonais_CS||{})["m3"]||0.9}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Abr</span><input type="number" id="cfFatorCSm4" value="${(c.fatoresSazonais_CS||{})["m4"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Mai</span><input type="number" id="cfFatorCSm5" value="${(c.fatoresSazonais_CS||{})["m5"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jun</span><input type="number" id="cfFatorCSm6" value="${(c.fatoresSazonais_CS||{})["m6"]||0.95}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jul</span><input type="number" id="cfFatorCSm7" value="${(c.fatoresSazonais_CS||{})["m7"]||0.9}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Ago</span><input type="number" id="cfFatorCSm8" value="${(c.fatoresSazonais_CS||{})["m8"]||1.05}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Set</span><input type="number" id="cfFatorCSm9" value="${(c.fatoresSazonais_CS||{})["m9"]||1.05}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Out</span><input type="number" id="cfFatorCSm10" value="${(c.fatoresSazonais_CS||{})["m10"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Nov</span><input type="number" id="cfFatorCSm11" value="${(c.fatoresSazonais_CS||{})["m11"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Dez</span><input type="number" id="cfFatorCSm12" value="${(c.fatoresSazonais_CS||{})["m12"]||0.75}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div>
      </fieldset>

${cfRenderCapacidadeFieldset('ELETELSUL','EL',c)}
        <div style="font-size:9px;font-weight:700;color:var(--muted);margin-bottom:4px">Fatores sazonais (×base)</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jan</span><input type="number" id="cfFatorELm1" value="${(c.fatoresSazonais_EL||{})["m1"]||0.85}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Fev</span><input type="number" id="cfFatorELm2" value="${(c.fatoresSazonais_EL||{})["m2"]||0.85}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Mar</span><input type="number" id="cfFatorELm3" value="${(c.fatoresSazonais_EL||{})["m3"]||0.9}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Abr</span><input type="number" id="cfFatorELm4" value="${(c.fatoresSazonais_EL||{})["m4"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Mai</span><input type="number" id="cfFatorELm5" value="${(c.fatoresSazonais_EL||{})["m5"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jun</span><input type="number" id="cfFatorELm6" value="${(c.fatoresSazonais_EL||{})["m6"]||0.95}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Jul</span><input type="number" id="cfFatorELm7" value="${(c.fatoresSazonais_EL||{})["m7"]||0.9}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Ago</span><input type="number" id="cfFatorELm8" value="${(c.fatoresSazonais_EL||{})["m8"]||1.05}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Set</span><input type="number" id="cfFatorELm9" value="${(c.fatoresSazonais_EL||{})["m9"]||1.05}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Out</span><input type="number" id="cfFatorELm10" value="${(c.fatoresSazonais_EL||{})["m10"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Nov</span><input type="number" id="cfFatorELm11" value="${(c.fatoresSazonais_EL||{})["m11"]||1.0}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="width:28px;font-size:9px;color:var(--muted)">Dez</span><input type="number" id="cfFatorELm12" value="${(c.fatoresSazonais_EL||{})["m12"]||0.75}" min="0" max="2" step="0.05" style="font-size:11px;width:60px"></div>
      </fieldset>
    </div>
    <button class="btn btn-primary btn-sm" onclick="cfSaveConfig()">💾 Salvar Configurações</button>
    <div style="font-size:9px;color:var(--muted);margin-top:6px">💡 Calibre USC/mês e Notas/mês gradualmente — meta: ≥75% da capacidade ocupada sem ultrapassar 125%</div>
  `;
}

// ── Estatísticas ─────────────────────────────────────────────────
function cfRenderEstatisticas(){
  const cont = document.getElementById('cfEstatisticas');
  if(!cont) return;
  const filaAtiva = _cfObras.filter(o=>o.status!=='aberta');
  const ativas    = filaAtiva.filter(o=>o.status!=='bloqueada');
  const bloqueadas= filaAtiva.filter(o=>o.status==='bloqueada');
  const forcadas  = filaAtiva.filter(o=>o.status==='forcada');
  const selecionadas = filaAtiva.filter(o=>o.selecionada);
  const uscTotal  = filaAtiva.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);

  // Por município — contagem e USC
  const porMunObj = {};
  filaAtiva.forEach(o=>{
    const m = o.municipio||'—';
    if(!porMunObj[m]) porMunObj[m] = {count:0, usc:0};
    porMunObj[m].count++;
    porMunObj[m].usc += parseFloat(o.usc)||0;
  });
  const porMunUSC = Object.entries(porMunObj).sort((a,b)=>b[1].usc-a[1].usc);

  cont.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:12px">
      ${cfKpi('Total na Fila', _cfObras.filter(o=>o.status!=='aberta').length+' obras','#7c6af7')}
      ${cfKpi('USC Total', uscTotal.toFixed(0),'#3B82F6')}
      ${cfKpi('Bloqueadas', bloqueadas.length,'#EF4444')}
      ${cfKpi('Forçadas', forcadas.length,'#F59E0B')}
      ${cfKpi('Selecionadas', selecionadas.length+' / '+selecionadas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0).toFixed(0)+' USC', '#22C55E')}
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px">
      <div style="font-size:10px;font-weight:700;margin-bottom:8px;color:var(--muted)">POR MUNICÍPIO</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:5px 8px;text-align:left">Município</th>
            <th style="padding:5px 8px;text-align:center">Notas</th>
            <th style="padding:5px 8px;text-align:right">USC Total</th>
          </tr></thead>
          <tbody>${porMunUSC.map(([m,dados])=>`
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:4px 8px">${m}</td>
              <td style="padding:4px 8px;text-align:center;font-weight:700">${dados.count}</td>
              <td style="padding:4px 8px;text-align:right">${dados.usc.toFixed(1)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="background:var(--surface2);font-weight:700">
            <td style="padding:5px 8px">TOTAL</td>
            <td style="padding:5px 8px;text-align:center">${filaAtiva.length}</td>
            <td style="padding:5px 8px;text-align:right">${uscTotal.toFixed(1)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

function cfKpi(label, value, cor){
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center">
    <div style="font-size:18px;font-weight:900;color:${cor}">${value}</div>
    <div style="font-size:9px;color:var(--muted);margin-top:2px">${label}</div>
  </div>`;
}

function cfAtualizarContador(){
  const el = document.getElementById('cfContador');
  if(!el) return;
  const atv = _cfObras.filter(o=>o.status!=='aberta');
  el.textContent = `${atv.length} obras na fila · ${atv.reduce((s,o)=>s+(parseFloat(o.usc)||0),0).toFixed(0)} USC`;
}

// ── Render da Fila ───────────────────────────────────────────────
function cfRenderFila(){
  const cont = document.getElementById('cfFilaContainer');
  if(!cont) return;
  const busca = (window._cfBusca||'').toLowerCase();
  const fila = _cfObras.filter(o=>o.status!=='aberta')
    .filter(o=>!busca || (o.nota||'').toLowerCase().includes(busca)
                       || (o.municipio||'').toLowerCase().includes(busca));
  if(!fila.length){
    cont.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)">
      Fila vazia — importe um Excel ou adicione obras manualmente.</div>`;
    return;
  }
  let pos=0;
  cont.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px" id="cfFilaTabela">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:8px 6px;width:28px;text-align:center" title="Arrastar para reordenar">↕</th>
            <th style="padding:8px 6px;text-align:center;width:36px">#</th>
            <th style="padding:8px 6px;text-align:left">OIS/Nota</th>
            <th style="padding:8px 6px;text-align:left">Município</th>
            <th style="padding:8px 6px;text-align:center">Equip.Ref.</th>
            <th style="padding:8px 6px;text-align:right">USC</th>
            <th style="padding:8px 6px;text-align:center">Prazo</th>
            <th style="padding:8px 6px;text-align:center">Entrada</th>
            <th style="padding:8px 6px;text-align:center">Status</th>
            <th style="padding:8px 6px;text-align:center">Ações</th>
          </tr></thead>
          <tbody id="cfFilaBody">
            ${fila.map((o,i)=>cfFilaRow(o,i)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  cfInitDragDrop();
}

function cfStatusBadge(o){
  if(o.status==='bloqueada')
    return `<span style="background:#EF444422;color:#EF4444;border:1px solid #EF444455;border-radius:6px;padding:1px 8px;font-size:9px;font-weight:700">🔒 Bloqueada</span>`;
  if(o.status==='forcada'||o.forcado)
    return `<span style="background:#F59E0B22;color:#F59E0B;border:1px solid #F59E0B55;border-radius:6px;padding:1px 8px;font-size:9px;font-weight:700">⭐ Forçada</span>`;
  if(o.selecionada)
    return `<span style="background:#22C55E22;color:#22C55E;border:1px solid #22C55E55;border-radius:6px;padding:1px 8px;font-size:9px;font-weight:700">✅ Selecionada</span>`;
  return `<span style="background:var(--surface2);color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:1px 8px;font-size:9px">Ativa</span>`;
}

function cfFilaRow(o, idx){
  const rowBg = o.status==='bloqueada' ? 'background:rgba(239,68,68,.04)'
    : o.selecionada ? 'background:rgba(34,197,94,.05)'
    : o.status==='forcada'||o.forcado ? 'background:rgba(245,158,11,.05)'
    : '';
  return `<tr draggable="true" data-id="${o.id}" data-pos="${o.posicao}"
    style="border-bottom:1px solid var(--border);${rowBg};cursor:move"
    title="${o.motivoBloqueio?'🔒 Bloqueio: '+o.motivoBloqueio:''}"  
    ondragstart="cfDragStart(event)" ondragover="cfDragOver(event)" ondrop="cfDrop(event)"
    ondragleave="cfDragLeave(event)">
    <td style="padding:6px;text-align:center;color:var(--muted);cursor:grab">☰</td>
    <td style="padding:6px;text-align:center;font-weight:700;color:var(--muted)">${idx+1}</td>
    <td style="padding:6px">
      <div style="font-weight:700;color:var(--accent);cursor:pointer" ${o.scoreJSON?`onclick="cfMostrarScore('${o.id}')"`:''}>${o.nota}</div>
      ${o.empreiteiraRec&&o.selecionada&&o.status!=='bloqueada'?(()=>{
        const scores = o.scoreJSON?JSON.parse(o.scoreJSON):[];
        const best = scores[0]||{};
        const cor = o.adiar?'#6b7280':o.empreiteiraRec.includes('CS')?'#3B82F6':'#F59E0B';
        const label = o.adiar?'⏸ Adiar':('✅ '+o.empreiteiraRec.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel'));
        return `<div style="font-size:8px;color:${cor};font-weight:700;margin-top:2px">${label} (${best.total||0}pts)</div>`;
      })():''}
    </td>
    <td style="padding:6px">${o.municipio||'—'}</td>
    <td style="padding:6px;text-align:center;font-family:monospace">${o.equipRef||o.equipRefAlt||'—'}${o.equipRefAlt&&!o.equipRef?'<span title="Equip. alternativo" style="color:#F59E0B;font-size:9px"> ⚠️alt</span>':''}</td>
    <td style="padding:6px;text-align:right">${parseFloat(o.usc||0).toFixed(1)}</td>
    <td style="padding:6px;text-align:center">${o.prazoExec||'—'}d</td>
    <td style="padding:6px;text-align:center;white-space:nowrap;font-size:9px;color:var(--muted)">${o.dataEntrada?(()=>{
      // Re-parse dates that might be stored in US format (M/D/YY)
      const s=String(o.dataEntrada);
      const us=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if(us){ const y=us[3].length===2?'20'+us[3]:us[3]; return fmtTxt(y+'-'+us[1].padStart(2,'0')+'-'+us[2].padStart(2,'0')); }
      return fmtTxt(s);
    })():'—'}</td>
    <td style="padding:6px;text-align:center">
      ${cfStatusBadge(o)}
      ${o.status==='bloqueada'&&o.motivoBloqueio?`<div style="font-size:8px;color:#EF4444;margin-top:2px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.motivoBloqueio}">📋 ${o.motivoBloqueio}</div>`:''}
      ${!o.selecionada&&o.rodadaEstimada&&o.rodadaEstimada>1?(()=>{
        const hoje=new Date();
        const dataEst=new Date(hoje.getFullYear(),hoje.getMonth()+(o.rodadaEstimada-1),1);
        const mes=dataEst.toLocaleDateString('pt-BR',{month:'short',year:'numeric'});
        return `<div style="font-size:8px;color:#6366F1;margin-top:2px" title="Previsão de abertura na rodada ${o.rodadaEstimada}">📅 Prev: ${mes}</div>`;
      })():''}
      ${o.bundlingRefNota?`<div style="font-size:8px;color:#10B981;margin-top:2px" title="Próxima a obra ${o.bundlingRefNota} — ${o.bundlingDist}km">🔗 Bundle c/ ${o.bundlingRefNota} (${o.bundlingDist}km)</div>`:''}
    </td>
    <td style="padding:6px;text-align:center;white-space:nowrap">
      ${o.status==='bloqueada'
        ? `<button class="btn btn-sm" style="font-size:9px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border)" onclick="cfDesbloquear('${o.id}')">🔓 Desbloquear</button>`
        : `<button class="btn btn-sm" style="font-size:9px;padding:2px 6px;background:rgba(239,68,68,.1);color:#EF4444;border:1px solid #EF444444" onclick="cfBloquear('${o.id}')">🔒 Bloquear</button>`}
      <button class="btn btn-sm" style="font-size:9px;padding:2px 6px;background:${o.forcado?'rgba(245,158,11,.2)':'var(--surface2)'};border:1px solid var(--border)" onclick="cfToggleForcar('${o.id}')" title="${o.forcado?'Remover força':'Forçar entrada'}">⭐</button>
      <button class="btn btn-sm" style="font-size:9px;padding:2px 6px;background:rgba(34,197,94,.1);color:#22C55E;border:1px solid #22C55E44" onclick="cfModalAbrirObra('${o.id}')">🚀 Abrir</button>
      <button class="btn btn-sm" style="font-size:9px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border);color:#EF4444" onclick="cfExcluir('${o.id}')">🗑</button>
    </td>
  </tr>`;
}

// ── Drag and Drop ─────────────────────────────────────────────────
function cfInitDragDrop(){ /* rows têm os handlers inline */ }

window.cfDragStart = function(e){
  _cfDragSrc = e.currentTarget;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
  setTimeout(()=>{ if(_cfDragSrc) _cfDragSrc.style.opacity='0.4'; },0);
};
window.cfDragOver = function(e){
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  const tr = e.currentTarget;
  document.querySelectorAll('#cfFilaBody tr').forEach(r=>r.style.borderTop='');
  tr.style.borderTop='2px solid var(--accent)';
};
window.cfDragLeave = function(e){ e.currentTarget.style.borderTop=''; };
window.cfDrop = async function(e){
  e.preventDefault();
  document.querySelectorAll('#cfFilaBody tr').forEach(r=>r.style.borderTop='');
  if(!_cfDragSrc) return;
  _cfDragSrc.style.opacity='1';
  const fromId = _cfDragSrc.dataset.id;
  const toId   = e.currentTarget.dataset.id;
  if(fromId===toId){ _cfDragSrc=null; return; }
  // Reordena localmente
  const fromIdx = _cfObras.findIndex(o=>o.id===fromId);
  const toIdx   = _cfObras.findIndex(o=>o.id===toId);
  if(fromIdx<0||toIdx<0){ _cfDragSrc=null; return; }
  const [moved] = _cfObras.splice(fromIdx,1);
  _cfObras.splice(toIdx,0,moved);
  // Reatribui posições
  _cfObras.forEach((o,i)=>o.posicao=i+1);
  _cfDragSrc=null;
  // Salva no Firestore (batch)
  await cfSavePosicoes();
  cfRenderFila();
  cfRenderEstatisticas();
  cfAtualizarContador();
};

async function cfSavePosicoes(){
  try{
    const batch = writeBatch(db);
    _cfObras.forEach(o=>{ batch.update(doc(db,'carteira_futura',o.id),{posicao:o.posicao}); });
    await batch.commit();
  }catch(e){ toast('Erro ao salvar ordem: '+e.message,'err'); }
}

// ── Bloquear / Desbloquear / Forçar ─────────────────────────────

// ── Limpar toda a fila em massa ────────────────────────────────────────────
window.cfLimparTudo = async function(){
  const n = _cfObras.length;
  if(!n){ toast('A fila já está vazia.','warn'); return; }
  if(!confirm('Excluir TODAS as '+n+' obras da fila? Esta ação não pode ser desfeita.')) return;
  try{
    toast('Excluindo...','ok');
    const batch = writeBatch(db);
    _cfObras.forEach(o=>{ batch.delete(doc(db,'carteira_futura',o.id)); });
    await batch.commit();
    _cfObras = [];
    cfRenderFila(); cfRenderEstatisticas(); cfAtualizarContador();
    toast('Fila limpa com sucesso.','ok');
  }catch(e){ toast('Erro: '+e.message,'err'); }
};


// ── Score detail modal ──────────────────────────────────────────────────────
window.cfMostrarScore = function(id){
  const o = _cfObras.find(o=>o.id===id);
  if(!o||!o.scoreJSON) return;
  const scores = JSON.parse(o.scoreJSON);

  const rows = scores.map(s=>{
    const zonaCor = s.zona==='livre'?'#22C55E':s.zona==='suave'?'#F59E0B':'#EF4444';
    const zonaLabel = s.zona==='livre'?'✅ Livre':s.zona==='suave'?'⚠️ Suave':'🚫 Bloqueada';
    const mesLabel = s.mesVenc?s.mesVenc.replace(/(\d{4})-(\d{2})/,'$2/$1'):'—';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:700">${s.emp.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel')}</td>
      <td style="padding:6px 8px;text-align:center;font-size:18px;font-weight:900;color:var(--accent)">${s.total}</td>
      <td style="padding:6px 8px;text-align:center">${s.dist}</td>
      <td style="padding:6px 8px;text-align:center">${s.eq}</td>
      <td style="padding:6px 8px;text-align:center">${s.desl}</td>
      <td style="padding:6px 8px;text-align:center">${mesLabel}</td>
      <td style="padding:6px 8px;text-align:center;color:${zonaCor};font-weight:700">${zonaLabel}</td>
      <td style="padding:6px 8px;text-align:center;font-size:10px">
        Backlog: ${s.backlogFinal||0} USC<br>
        <span style="color:var(--muted)">${s.nAtrasadas||0} atrasadas · avg ${(s.avgUSC||0).toFixed(0)} USC/obra</span>
        ${s.motivo?`<br><span style="color:#EF4444;font-size:9px">${s.motivo}</span>`:''}
      </td>
    </tr>`;
  }).join('');

  const prazo = parseInt(o.prazoExec)||120;
  const hoje = new Date();
  const venc = new Date(hoje.getTime()+prazo*24*3600*1000);
  const mesVenc = venc.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  const html=`<div id="cfScoreModal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center">
    <div style="background:var(--surface);border-radius:16px;padding:24px;width:min(700px,96vw);max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:4px">📊 Análise de Score — Obra ${o.nota}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:16px">${o.municipio||'—'} · USC: ${o.usc} · Prazo: ${prazo}d → vence ${mesVenc}</div>
      ${o.motivo?`<div style="font-size:11px;color:var(--muted);margin-bottom:12px;padding:8px;background:var(--surface2);border-radius:8px">💡 ${o.motivo}</div>`:''}
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:6px 8px;text-align:left">Empreiteira</th>
            <th style="padding:6px 8px;text-align:center">Total</th>
            <th style="padding:6px 8px;text-align:center">Dist.</th>
            <th style="padding:6px 8px;text-align:center">Equil.</th>
            <th style="padding:6px 8px;text-align:center">Desl.</th>
            <th style="padding:6px 8px;text-align:center">Mês venc.</th>
            <th style="padding:6px 8px;text-align:center">Zona</th>
            <th style="padding:6px 8px;text-align:center">Carga mês</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="text-align:right;margin-top:16px">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cfScoreModal').remove()">Fechar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
};

// ── Painel de resultados após seleção ─────────────────────────────────────
window.cfMostrarResultadoSelecao = function(selRodada1, adiadas){
  // Remove painel anterior
  document.getElementById('cfResultadoPanel')?.remove();

  const comRec         = selRodada1.filter(o=>o.empreiteiraRec && !o.adiar);
  adiadas              = adiadas || selRodada1.filter(o=>o.adiar);
  const forcadas       = selRodada1.filter(o=>o.forcado||o.status==='forcada');
  const forcadasSemEmp = forcadas.filter(o=>!o.empreiteiraRec);

  // Diagnóstico de backlog por empreiteira
  const diagCS = calcBacklogScore('CS ELETRICIDADE', (() => {
    const d = new Date(); d.setMonth(d.getMonth()+1);
    return d.toISOString().slice(0,7);
  })(), _cfConfig);
  const diagEL = calcBacklogScore('ELETELSUL', (() => {
    const d = new Date(); d.setMonth(d.getMonth()+1);
    return d.toISOString().slice(0,7);
  })(), _cfConfig);

  function zonaBadge(z){
    return z==='livre'?'<span style="color:#22C55E">✅ Livre</span>'
      :z==='suave'?'<span style="color:#F59E0B">⚠️ Suave</span>'
      :'<span style="color:#EF4444">🚫 Bloqueada</span>';
  }

  const rowsRec = comRec.map(o=>{
    const sc = o.scoreJSON ? JSON.parse(o.scoreJSON) : [];
    const best = sc[0]||{};
    const cor = best.emp?.includes('CS') ? '#3B82F6':'#F59E0B';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:5px 8px;font-weight:700;color:var(--accent)">${o.nota}</td>
      <td style="padding:5px 8px;font-size:9px">${o.municipio||'—'}</td>
      <td style="padding:5px 8px;font-weight:700;color:${cor}">${best.emp?.replace('CS ELETRICIDADE','CS')||'—'}</td>
      <td style="padding:5px 8px;text-align:center">${best.total||0}pts</td>
      <td style="padding:5px 8px;text-align:center;font-size:9px">d:${best.dist||0} eq:${best.eq||0} bl:${best.carga||0}</td>
      <td style="padding:5px 8px;text-align:center">${zonaBadge(best.zona||'livre')}</td>
      <td style="padding:5px 8px;text-align:center;font-size:9px">${best.backlogFinal||0} USC · ${best.nAtrasadas||0} atr.</td>
      <td style="padding:5px 8px;cursor:pointer;color:var(--accent);text-align:center" onclick="cfMostrarScore('${o.id}')">🔍</td>
    </tr>`;
  }).join('');

  const rowsAdiar = adiadas.map(o=>{
    const sc = o.scoreJSON ? JSON.parse(o.scoreJSON) : [];
    return `<tr style="border-bottom:1px solid var(--border);background:rgba(239,68,68,.04)">
      <td style="padding:5px 8px;font-weight:700;color:#EF4444">${o.nota}</td>
      <td style="padding:5px 8px;font-size:9px">${o.municipio||'—'}</td>
      <td colspan="5" style="padding:5px 8px;font-size:9px;color:#EF4444">
        ⏸ ADIADA — ${sc.map(s=>`${s.emp?.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel')}: ${zonaBadge(s.zona||'bloqueada')} ${s.motivo?'('+s.motivo+')':''}`).join(' | ')}
      </td>
      <td style="padding:5px 8px;cursor:pointer;color:var(--accent);text-align:center" onclick="cfMostrarScore('${o.id}')">🔍</td>
    </tr>`;
  }).join('');

  const html = `<div id="cfResultadoPanel" style="margin-bottom:20px">
    <div style="font-weight:800;font-size:14px;margin-bottom:12px">📊 Resultado da Seleção</div>

    <!-- Diagnóstico de backlog atual -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      ${['CS ELETRICIDADE','ELETELSUL'].map((emp,i)=>{
        const d = i===0 ? diagCS : diagEL;
        const cor = d.zona==='livre'?'#22C55E':d.zona==='suave'?'#F59E0B':'#EF4444';
        return `<div style="background:var(--surface);border:1px solid ${cor}44;border-radius:10px;padding:12px">
          <div style="font-weight:700;font-size:11px;margin-bottom:8px">${emp.replace('CS ELETRICIDADE','CS Eletricidade')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px">
            <div><span style="color:var(--muted)">Backlog atual:</span><br><strong>${d.backlogFinal?.toFixed(0)||0} USC</strong></div>
            <div><span style="color:var(--muted)">Média USC/obra:</span><br><strong>${d.avgUSC?.toFixed(0)||0}</strong></div>
            <div><span style="color:var(--muted)">Atrasadas:</span><br><strong style="color:${d.nAtrasadas>10?'#EF4444':'inherit'}">${d.nAtrasadas||0}</strong></div>
            <div><span style="color:var(--muted)">Zona:</span><br><strong style="color:${cor}">${d.zona?.toUpperCase()||'—'}</strong></div>
          </div>
          ${d.motivo?`<div style="font-size:9px;color:#EF4444;margin-top:6px;padding:4px;background:rgba(239,68,68,.08);border-radius:4px">⚠️ ${d.motivo}</div>`:''}
        </div>`;
      }).join('')}
    </div>

    <!-- Obras com recomendação -->
    ${comRec.length?`<div style="font-weight:700;font-size:11px;color:#22C55E;margin-bottom:6px">
      ✅ ${comRec.length} obras atribuídas · ${comRec.reduce((s,o)=>s+(parseFloat(o.usc)||0),0).toFixed(0)} USC (CS: ${comRec.filter(o=>o.empreiteiraRec?.includes('CS')).length} · Eletel: ${comRec.filter(o=>o.empreiteiraRec?.includes('EL')||o.empreiteiraRec?.includes('Eletel')).length})</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:5px 8px;text-align:left">OIS</th><th style="padding:5px 8px;text-align:left">Município</th>
          <th style="padding:5px 8px;text-align:left">Recomendada</th><th style="padding:5px 8px;text-align:center">Score</th>
          <th style="padding:5px 8px;text-align:center">Fatores</th><th style="padding:5px 8px;text-align:center">Zona</th>
          <th style="padding:5px 8px;text-align:center">Backlog</th><th style="padding:5px 8px"></th>
        </tr></thead><tbody>${rowsRec}</tbody>
      </table></div>
    </div>`:``}

    <!-- Forçadas sem empreiteira -->
    ${forcadasSemEmp.length?`<div style="font-weight:700;font-size:11px;color:#F59E0B;margin-bottom:6px">
      ⭐ ${forcadasSemEmp.length} obra(s) FORÇADA(S) — sem empreiteira disponível (ajuste os limites de atrasadas ou capacidade)</div>
      <div style="background:rgba(245,158,11,.08);border:1px solid #F59E0B44;border-radius:10px;padding:10px;margin-bottom:12px;font-size:10px">
        ${forcadasSemEmp.map(o=>`<div style="margin-bottom:4px">⭐ <strong>${o.nota}</strong> — ${o.municipio||'—'} · ${o.usc} USC · ${o.motivo||'Ambas empreiteiras bloqueadas'}</div>`).join('')}
      </div>`:``}

    <!-- Obras adiadas -->
    ${adiadas.length?`<div style="font-weight:700;font-size:11px;color:#EF4444;margin-bottom:6px">⏸ ${adiadas.length} obras adiadas — ambas empreiteiras bloqueadas</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:5px 8px;text-align:left">OIS</th><th style="padding:5px 8px;text-align:left">Município</th>
          <th colspan="5" style="padding:5px 8px;text-align:left">Motivo do adiamento</th><th></th>
        </tr></thead><tbody>${rowsAdiar}</tbody>
      </table></div>
    </div>`:``}
  </div>`;

  const slot = document.getElementById('cfFilaContainer');
  if(slot) slot.insertAdjacentHTML('beforebegin', html);
};

// ── Busca na fila da Carteira Futura ──────────────────────────────────────
window.cfAplicarBusca = function(termo){
  window._cfBusca = (termo||'').trim().toLowerCase();
  cfRenderFila();
};

window.cfBloquear = async function(id){
  const motivo = prompt('Motivo do bloqueio (opcional):');
  if(motivo===null) return; // cancelado
  await updateDoc(doc(db,'carteira_futura',id),{status:'bloqueada', motivoBloqueio:motivo||''});
  const o = _cfObras.find(o=>o.id===id);
  if(o){ o.status='bloqueada'; o.motivoBloqueio=motivo||''; }
  cfRenderFila(); cfRenderEstatisticas();
  toast('Obra bloqueada.','ok');
};

window.cfDesbloquear = async function(id){
  await updateDoc(doc(db,'carteira_futura',id),{status:'ativa', motivoBloqueio:''});
  const o = _cfObras.find(o=>o.id===id);
  if(o){ o.status='ativa'; o.motivoBloqueio=''; }
  cfRenderFila(); cfRenderEstatisticas();
  toast('Obra desbloqueada.','ok');
};

window.cfToggleForcar = async function(id){
  const o = _cfObras.find(o=>o.id===id);
  if(!o) return;
  const novoForcado = !o.forcado;
  await updateDoc(doc(db,'carteira_futura',id),{forcado:novoForcado, status:novoForcado?'forcada':'ativa'});
  o.forcado=novoForcado; o.status=novoForcado?'forcada':'ativa';
  cfRenderFila(); cfRenderEstatisticas();
  toast(novoForcado?'Obra forçada para seleção.':'Força removida.','ok');
};

window.cfExcluir = async function(id){
  if(!confirm('Excluir esta obra da fila?')) return;
  await deleteDoc(doc(db,'carteira_futura',id));
  _cfObras = _cfObras.filter(o=>o.id!==id);
  _cfObras.forEach((o,i)=>o.posicao=i+1);
  cfRenderFila(); cfRenderEstatisticas(); cfAtualizarContador();
  toast('Obra removida da fila.','ok');
};

// ── Adicionar manualmente ─────────────────────────────────────────
window.cfModalAddObra = function(){
  const modalHtml=`
    <div id="cfModalAdd" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--surface);border-radius:16px;padding:24px;width:min(480px,95vw);max-height:90vh;overflow-y:auto">
        <div style="font-weight:900;font-size:15px;margin-bottom:16px">➕ Adicionar Obra à Fila</div>
        <div class="fg-grid">
          <div class="fg"><label>Nota/OIS *</label><input type="text" id="cfAddNota" placeholder="400000000"></div>
          <div class="fg"><label>Município *</label><input type="text" id="cfAddMun" placeholder="LAGES"></div>
          <div class="fg"><label>Equip. Referência *</label><input type="text" id="cfAddEquip" placeholder="18758"></div>
          <div class="fg"><label>Equip. Alternativo (se sem GPS)</label><input type="text" id="cfAddEquipAlt" placeholder="opcional"></div>
          <div class="fg"><label>USC *</label><input type="number" id="cfAddUSC" min="0" step="0.01"></div>
          <div class="fg"><label>ULV</label><input type="number" id="cfAddULV" min="0" step="0.01" value="0"></div>
          <div class="fg"><label>Prazo Execução (dias)</label><input type="number" id="cfAddPrazo" value="120"></div>
          <div class="fg"><label>Data de Entrada *</label><input type="date" id="cfAddData"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cfModalAdd').remove()">Cancelar</button>
          <button class="btn btn-primary btn-sm" onclick="cfSalvarAddObra()">Adicionar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend',modalHtml);
};

window.cfSalvarAddObra = async function(){
  const g=id=>document.getElementById(id)?.value.trim();
  const nota=g('cfAddNota'), mun=g('cfAddMun'), equip=g('cfAddEquip'), usc=g('cfAddUSC'), data=g('cfAddData');
  if(!nota||!mun||!equip||!usc||!data){ toast('Preencha os campos obrigatórios (*)','err'); return; }
  const proximaPosicao = _cfObras.length>0 ? Math.max(..._cfObras.map(o=>o.posicao||0))+1 : 1;
  const nova={
    nota, municipio:mun.toUpperCase(), equipRef:equip, equipRefAlt:g('cfAddEquipAlt')||'',
    usc:parseFloat(usc)||0, ulv:parseFloat(g('cfAddULV'))||0,
    prazoExec:parseInt(g('cfAddPrazo'))||120, dataEntrada:data,
    posicao:proximaPosicao, status:'ativa', forcado:false, selecionada:false,
    criadoEm:serverTimestamp()
  };
  const ref = await addDoc(collection(db,'carteira_futura'),nova);
  _cfObras.push({id:ref.id,...nova});
  document.getElementById('cfModalAdd').remove();
  cfRenderFila(); cfRenderEstatisticas(); cfAtualizarContador();
  toast('✓ Obra adicionada à fila.','ok');
};

// ── Upload Excel ─────────────────────────────────────────────────
window.cfUploadExcel = async function(input){
  const file = input.files[0];
  if(!file) return;
  const XLSX = await loadSheetJS();
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab,{type:'array',cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});

  // Detecta header: NOTA | Município | Data de Entrada | Nr Equipamento | Qtd USC | Qtd ULV | Prazo
  const headerRow = rows.findIndex(r=>r.some(v=>typeof v==='string'&&v.toUpperCase().includes('NOTA')));
  if(headerRow<0){ toast('Cabeçalho não encontrado no Excel.','err'); return; }

  const dataRows = rows.slice(headerRow+1).filter(r=>r[0]&&String(r[0]).trim());
  if(!dataRows.length){ toast('Nenhuma obra encontrada no Excel.','err'); return; }

 // Converte e ordena por data de entrada (mais antiga primeiro)
    function parseCfDate(raw){
      if(!raw) return '';
      if(raw instanceof Date) return raw.toISOString().split('T')[0];
      const s=String(raw).trim();
      const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);  if(br)  return `${br[3]}-${br[2]}-${br[1]}`;
      const us=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if(us){ const y=us[3].length===2?'20'+us[3]:us[3]; return `${y}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`; }
      return s.slice(0,10);
    }
    const obras = dataRows.map(r=>{
      const dataEntrada = parseCfDate(r[2]);
    return{
      nota:String(r[0]).trim(),
      municipio:String(r[1]||'').toUpperCase().trim(),
      dataEntrada,
      equipRef:String(r[3]||'').trim(),
      usc:parseFloat(String(r[4]).replace(',','.'))||0,
      ulv:parseFloat(String(r[5]).replace(',','.'))||0,
      prazoExec:parseInt(r[6])||120,
    };
  }).sort((a,b)=>a.dataEntrada.localeCompare(b.dataEntrada));

  if(!confirm(`Importar ${obras.length} obras do Excel?\n\n` +
    `• Obras existentes com a mesma NOTA serão atualizadas\n` +
    `• Novas obras serão adicionadas no final da fila`)) return;

  toast('⏳ Importando...','ok');
  const batch = writeBatch(db);
  const existingNotas = new Set(_cfObras.map(o=>o.nota));
  let added=0, updated=0;
  let maxPos = _cfObras.length>0 ? Math.max(..._cfObras.map(o=>o.posicao||0)) : 0;

  obras.forEach(nova=>{
    const existing = _cfObras.find(o=>o.nota===nova.nota);
    if(existing){
      batch.update(doc(db,'carteira_futura',existing.id),{
        municipio:nova.municipio, dataEntrada:nova.dataEntrada,
        equipRef:nova.equipRef, usc:nova.usc, ulv:nova.ulv, prazoExec:nova.prazoExec
      });
      Object.assign(existing,nova);
      updated++;
    }else{
      maxPos++;
      const newDoc={...nova, posicao:maxPos, status:'ativa', forcado:false,
        selecionada:false, equipRefAlt:'', criadoEm:serverTimestamp()};
      const ref=doc(collection(db,'carteira_futura'));
      batch.set(ref,newDoc);
      _cfObras.push({id:ref.id,...newDoc});
      added++;
    }
  });

  await batch.commit();
  _cfObras.sort((a,b)=>(a.posicao||999)-(b.posicao||999));
  cfRenderFila(); cfRenderEstatisticas(); cfAtualizarContador();
  toast(`✓ ${added} adicionadas, ${updated} atualizadas.`,'ok');
  input.value='';
};

// ── Executar seleção (placeholder — Fase 2) ──────────────────────


// ── Otimização 2: Candidatos a Bundling (obras próximas não selecionadas) ────
function cfCalcularBundling(selecionadas, excluidas, configCf){
  const raio  = configCf.raioProx||10;
  const candidatos = [];

  selecionadas.forEach(sel=>{
    const gpsSel = getEquipGPS(sel.equipRef)||(sel.equipRefAlt?getEquipGPS(sel.equipRefAlt):null);
    if(!gpsSel) return;

    excluidas.forEach(exc=>{
      if(exc.bundlingRef) return; // já tem candidato
      const gpsExc = getEquipGPS(exc.equipRef)||(exc.equipRefAlt?getEquipGPS(exc.equipRefAlt):null);
      if(!gpsExc) return;
      const dist = haversine(gpsSel.lat,gpsSel.lng,gpsExc.lat,gpsExc.lng);
      if(dist<=raio){
        candidatos.push({
          idExcluida: exc.id, notaExcluida: exc.nota,
          idSelecionada: sel.id, notaSelecionada: sel.nota,
          distKm: dist.toFixed(1)
        });
        exc.bundlingDist = dist;
        exc.bundlingRefNota = sel.nota;
      }
    });
  });

  return candidatos;
}

// ── Carteira Futura — Motor de Score por Empreiteira ──────────────────────

// Haversine distance em km entre dois pontos GPS
function haversine(lat1,lng1,lat2,lng2){
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Busca GPS de um equipamento na Base Equipamentos (window.equipDB)
function getEquipGPS(equipRef){
  if(!equipRef||!window.equipDB) return null;
  const ref = String(equipRef).trim();
  const eq = window.equipDB.find(e=>String(e.codigo||e.numero||e.equip||'').trim()===ref
    || String(e.id||'').trim()===ref);
  if(!eq) return null;
  const lat = parseFloat(eq.lat||eq.latitude||eq.LAT||0);
  const lng = parseFloat(eq.lng||eq.longitude||eq.long||eq.LNG||0);
  return (lat&&lng) ? {lat,lng} : null;
}


// ── Capacidade histórica por empreiteira (média móvel de obras concluídas) ──
function calcCapacidadeHistorica(emp, nMeses){
  nMeses = nMeses || 3;
  // Obras RD com conclusão informada (excl. PODI/Mono-Tri)
  const EXCLUIR = ['PODI','Mono-Tri'];
  const concluidas = obras.filter(o=>
    (o.tipo==='R1'||o.tipo==='R2') &&
    (o.empreiteira||'').toUpperCase()===emp.toUpperCase() &&
    o.conclusao && !o.cancelado && !EXCLUIR.includes(o.programa)
  );

  // Agrupa por mês de conclusão
  const porMes = {};
  concluidas.forEach(o=>{
    const mes = o.conclusao.slice(0,7); // YYYY-MM
    if(!porMes[mes]) porMes[mes] = {count:0, usc:0};
    porMes[mes].count++;
    porMes[mes].usc += parseFloat(o.usc)||0;
  });

  // Pega os últimos N meses com dados (ordenado desc)
  const hoje = new Date();
  const mesesAnalisados = [];
  for(let i=1; i<=Math.max(nMeses*2, 12); i++){
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    const key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(porMes[key]) mesesAnalisados.push({mes:key, ...porMes[key]});
    if(mesesAnalisados.length>=nMeses) break;
  }

  if(!mesesAnalisados.length) return null;

  const totalUSC   = mesesAnalisados.reduce((s,m)=>s+m.usc,0);
  const totalCount = mesesAnalisados.reduce((s,m)=>s+m.count,0);
  const mediaUSC   = Math.round(totalUSC / mesesAnalisados.length);
  const mediaCount = (totalCount / mesesAnalisados.length).toFixed(1);
  const avgUscObra = totalCount>0 ? Math.round(totalUSC/totalCount) : 0;

  return { mediaUSC, mediaCount, avgUscObra, mesesAnalisados, nMeses:mesesAnalisados.length };
}


// ── Fieldset de capacidade com cálculo histórico automático ───────────────
function cfRenderCapacidadeFieldset(empNome, empKey, c){
  const hist = calcCapacidadeHistorica(empNome, 3);
  const capAtual = c['capacidadeBaseUSC_'+empKey]||2000;
  const lbl = empKey==='CS' ? 'CS Eletricidade' : 'Eletelsul';

  let histHtml = '';
  if(hist && hist.nMeses>0){
    const diff = hist.mediaUSC - capAtual;
    const diffStr = (diff>=0?'+':'')+diff;
    const diffCor = Math.abs(diff)<300 ? '#22C55E' : '#F59E0B';
    histHtml = `
      <div style="background:rgba(124,106,247,.06);border:1px solid rgba(124,106,247,.2);border-radius:6px;padding:8px;margin-bottom:8px;font-size:10px">
        <div style="font-weight:700;color:#7c6af7;margin-bottom:4px">📊 Calculado dos últimos ${hist.nMeses} meses:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
          <div><span style="color:var(--muted)">Média USC/mês</span><br><strong>${hist.mediaUSC}</strong></div>
          <div><span style="color:var(--muted)">Obras/mês</span><br><strong>${hist.mediaCount}</strong></div>
          <div><span style="color:var(--muted)">Avg USC/obra</span><br><strong>${hist.avgUscObra}</strong></div>
        </div>
        <div style="margin-top:6px;font-size:9px;color:${diffCor}">
          ${Math.abs(diff)<300
            ? '✅ Configurado próximo ao histórico'
            : `⚠️ Diferença: ${diffStr} USC vs configurado (${capAtual}) — considere ajustar`}
        </div>
        <button onclick="document.getElementById('cfCapBase${empKey}').value=${hist.mediaUSC}"
          style="margin-top:6px;font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid #7c6af7;background:rgba(124,106,247,.1);color:#7c6af7;cursor:pointer">
          Usar valor calculado (${hist.mediaUSC} USC)
        </button>
      </div>
      <div style="font-size:9px;color:var(--muted);margin-bottom:4px">
        Histórico por mês:
        ${hist.mesesAnalisados.map(m=>`<span style="margin-right:6px">${m.mes}: ${m.usc.toFixed(0)} USC (${m.count} obras)</span>`).join('')}
      </div>`;
  } else {
    histHtml = `<div style="font-size:9px;color:var(--muted);margin-bottom:8px;padding:6px;background:var(--surface2);border-radius:6px">
      ℹ️ Sem histórico disponível — nenhuma obra concluída nos últimos meses para cálculo automático.
    </div>`;
  }

  return `<fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px;grid-column:1/-1">
    <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">Backlog — ${lbl}</legend>
    ${histHtml}
    <div class="fg" style="margin-bottom:6px">
      <label style="font-size:10px">Capacidade base USC/mês (manual)</label>
      <input type="number" id="cfCapBase${empKey}" value="${capAtual}" style="font-size:12px">
    </div>
    <div class="fg" style="margin-bottom:6px">
      <label style="font-size:10px">Limite de obras atrasadas (bloqueia)</label>
      <input type="number" id="cfLimAtr${empKey}" value="${c['limiteAtrasadas_'+empKey]||20}" style="font-size:12px">
    </div>`;
}

// ── Modelo de Backlog — calcula carga futura mês a mês ──────────────────────
function calcBacklogScore(emp, mesVencimento, configCf, uscJaAtribuido){
  const isCS = emp.toUpperCase().includes('CS');
  const EXCLUIR = ['PODI','Mono-Tri'];
  const obrasAtivas = obras.filter(o=>
    (o.tipo==='R1'||o.tipo==='R2') &&
    (o.empreiteira||'').toUpperCase()===emp.toUpperCase() &&
    !o.conclusao && !o.armazenado && !o.cancelado &&
    !EXCLUIR.includes(o.programa)
  );
  const backlogBase = obrasAtivas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0)
    + (parseFloat(uscJaAtribuido)||0); // USC já atribuído nesta rodada de seleção
  const avgUSC = obrasAtivas.length>0 ? backlogBase/obrasAtivas.length : 0;
  const hoje = (new Date()).toISOString().split('T')[0];
  const nAtrasadas = obrasAtivas.filter(o=>o.dataLimite&&o.dataLimite<hoje).length;
  const limAtr = isCS?(configCf.limiteAtrasadas_CS||20):(configCf.limiteAtrasadas_EL||20);
  if(nAtrasadas>limAtr) return {zona:'bloqueada',score:0,backlogFinal:backlogBase,avgUSC,nAtrasadas,
    motivo:`${nAtrasadas} obras atrasadas (limite: ${limAtr})`};
  const capBase = isCS?(configCf.capacidadeBaseUSC_CS||2000):(configCf.capacidadeBaseUSC_EL||2000);
  const fatores = isCS?(configCf.fatoresSazonais_CS||{}):(configCf.fatoresSazonais_EL||{});
  const fator = m=>parseFloat(fatores['m'+m]||1.0);
  const cfEntradas = typeof _cfObras!=='undefined'
    ? _cfObras.filter(o=>o.selecionada&&(o.empreiteiraRec||'').toUpperCase()===emp.toUpperCase()) : [];
  const dHoje=new Date(); let anoSim=dHoje.getFullYear(),mesSim=dHoje.getMonth()+1;
  const [vAno,vMes]=mesVencimento.split('-').map(Number);
  let backlog=backlogBase;
  while(anoSim<vAno||(anoSim===vAno&&mesSim<=vMes)){
    const capMes=capBase*fator(mesSim);
    const entradas=cfEntradas.filter(o=>{
      if(!o.dataEntrada) return false;
      const[ea,em]=o.dataEntrada.split('-').map(Number); return ea===anoSim&&em===mesSim;
    }).reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    backlog=Math.max(0,backlog-capMes)+entradas;
    mesSim++; if(mesSim>12){mesSim=1;anoSim++;}
  }
  const capVenc=capBase*fator(vMes); const ratio=capVenc>0?backlog/capVenc:0;
  let zona,score;
  if(ratio<0.75){zona='livre';score=1.0;}
  else if(ratio<=1.25){zona='suave';score=1-(ratio-0.75)/0.5;}
  else{zona='bloqueada';score=0.0;}
  return{zona,score:Math.max(0,Math.min(1,score)),ratio,backlogFinal:backlog,avgUSC,nAtrasadas,
    motivo:zona==='bloqueada'?`Backlog ${backlog.toFixed(0)} USC no mês vencimento (>${(capVenc*1.25).toFixed(0)})`+
      (nAtrasadas>0?` | ${nAtrasadas} atrasadas`:``):null};
}

// Score de distância híbrido (mínima + mediana ponderadas)
function calcScoreDist(gpsCandidata, emp, raio, alfa){
  if(!gpsCandidata) return 0.3; // sem GPS, score neutro
  const obrasEmp = obras.filter(o=>(o.empreiteira||'').toUpperCase()===emp.toUpperCase()
    && !o.armazenado && !o.cancelado);
  const dists = obrasEmp.map(o=>{
    const gps = getEquipGPS(o.equipamentoRef||o.equipRef);
    if(!gps) return null;
    return haversine(gpsCandidata.lat,gpsCandidata.lng,gps.lat,gps.lng);
  }).filter(d=>d!==null).sort((a,b)=>a-b);
  if(!dists.length) return 0.2;
  const dMin = dists[0];
  const dMed = dists[Math.floor(dists.length/2)];
  const dMinN  = Math.min(dMin/raio, 1);
  const dMedN  = Math.min(dMed/raio, 1);
  return alfa*(1-dMinN) + (1-alfa)*(1-dMedN);
}

// Score de equilíbrio (carga atual vs meta)
function calcScoreEquil(emp, metaObras){
  const ativas = obras.filter(o=>(o.empreiteira||'').toUpperCase()===emp.toUpperCase()
    && !o.armazenado && !o.cancelado).length;
  return Math.max(0, 1 - ativas/metaObras);
}

// Score de desligamento (chave de abertura compartilhada)
function calcScoreDesl(equipRef, emp){
  const desl = window._deslMap || {};
  for(const oNum of Object.keys(desl)){
    const entry = desl[oNum];
    if((entry.empreiteira||'').toUpperCase()===emp.toUpperCase()){
      // Busca GPS do desligamento e compara chave
      const obraDesl = obras.find(o=>o.numero?.toString()===oNum);
      if(obraDesl && (obraDesl.equipamentoRef||'').toString()===equipRef?.toString()) return 1.0;
    }
  }
  // Verifica também nos desligamentos importados pelo equipRef
  for(const [oNum, entry] of Object.entries(desl)){
    if((entry.equipRef||'').toString()===equipRef?.toString()) return 0.5; // mesmo trecho, bonus parcial
  }
  return 0;
}

// Score total por empreiteira para uma obra candidata
function calcScoreEmpreiteira(obracf, emp, configCf, uscJaAtribuido){
  const raio  = configCf.raioProx||10;
  const alfa  = configCf.alfaProximidade||0.6;
  const pDist = (configCf.pesoDistancia||40)/100;
  const pEq   = (configCf.pesoEquilibrio||40)/100;
  const pDesl = (configCf.pesoDesligamento||20)/100;
  const isCS  = emp.toUpperCase().includes('CS');
  const meta  = isCS ? (configCf.metaObrasCS||150) : (configCf.metaObrasEL||130);

  // Calcula mês de vencimento da obra
  const hoje = new Date();
  const prazo = parseInt(obracf.prazoExec)||120;
  const venc  = new Date(hoje.getTime() + prazo*24*3600*1000);
  const mesVenc = `${venc.getFullYear()}-${String(venc.getMonth()+1).padStart(2,'0')}`;

  const gps    = getEquipGPS(obracf.equipRef) || (obracf.equipRefAlt ? getEquipGPS(obracf.equipRefAlt) : null);
  const sDist  = calcScoreDist(gps, emp, raio, alfa);
  const sEq    = calcScoreEquil(emp, meta);
  const sDesl  = calcScoreDesl(obracf.equipRef, emp);
  const carga  = calcBacklogScore(emp, mesVenc, configCf, uscJaAtribuido);
  const pCarg  = (configCf.pesoDesligamento||20)/100; // reusa peso "desl" para carga no score

  // Score por fator — carga é componente separado (não multiplicador)
  const sDistW  = pDist * sDist;
  const sEqW    = pEq   * sEq;
  const sDeslW  = (configCf.pesoDesligamento||20)/100 * sDesl;
  const sCargW  = 0.25 * carga.score; // fator carga = 25% sempre

  // Ajusta pesos restantes para 75% dos originais somarem com 25% de carga
  const scoreBruto = sDistW*0.75 + sEqW*0.75 + sDeslW*0.75 + sCargW;
  // Se bloqueada → score total zero
  const scoreFinal = carga.zona==='bloqueada' ? 0 : scoreBruto;

  return {
    emp, scoreFinal: Math.round(scoreFinal*100),
    detalhes: {
      dist:  Math.round(sDistW*0.75*100),
      equil: Math.round(sEqW*0.75*100),
      desl:  Math.round(sDeslW*0.75*100),
      carga: Math.round(sCargW*100),
    },
    carga, mesVenc
  };
}

// Recomenda empreiteira para uma obra da fila
function cfRecomendarEmpreiteira(obracf, configCf, uscAtribuidoMap){
  const empreiteiras = ['CS ELETRICIDADE','ELETELSUL'];
  const scores = empreiteiras.map(e=>calcScoreEmpreiteira(
    obracf, e, configCf, (uscAtribuidoMap||{})[e]||0));
  scores.sort((a,b)=>b.scoreFinal-a.scoreFinal);

  const melhor = scores[0];
  const adiar  = scores.every(s=>s.carga.zona==='bloqueada');

  return {
    recomendada: adiar ? null : melhor.emp,
    adiar,
    scores,
    motivo: adiar
      ? 'Ambas bloqueadas: ' + scores.map(s=>s.emp.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel')+' '+s.carga.zona+(s.carga.motivo?' ('+s.carga.motivo+')':'')).join(' | ')
      : `Recomendado ${melhor.emp.replace('CS ELETRICIDADE','CS')}: dist+${melhor.detalhes.dist} eq+${melhor.detalhes.equil} carga+${melhor.detalhes.carga||0}`
  };
}

window.cfRunSelecao = async function(){
  await cfLoadConfig();
  const limObras = parseInt(_cfConfig.limiteObras)||35;
  const limUSC   = parseFloat(_cfConfig.limiteUSC)||5000;
  toast('⏳ Executando seleção...','ok');

  // ── Fila ordenada por posição (somente ativas e não abertas) ─────────────
  const forcadas  = _cfObras.filter(o=>
    (o.forcado||o.status==='forcada') && o.status!=='bloqueada' && o.status!=='aberta'
  ).sort((a,b)=>(a.posicao||999)-(b.posicao||999));

  const regulares = _cfObras.filter(o=>
    !o.forcado && o.status!=='forcada' && o.status!=='bloqueada' && o.status!=='aberta'
  ).sort((a,b)=>(a.posicao||999)-(b.posicao||999));

  const bloqueadas = _cfObras.filter(o=>o.status==='bloqueada');

  // ── Passo 1: Forçadas — sempre selecionadas, ainda precisam de empreiteira
  const selecionadas = [];
  let uscAcum   = 0;
  let obrasAcum = 0;
  // Rastreia USC já atribuído por empreiteira nesta rodada (para evitar ultrapassar limite)
  const uscAtribuidoMap = {'CS ELETRICIDADE':0, 'ELETELSUL':0};

  forcadas.forEach(o=>{
    const rec = cfRecomendarEmpreiteira(o, _cfConfig, uscAtribuidoMap);
    selecionadas.push({...o, selecionada:true, rodadaEstimada:1,
      empreiteiraRec: rec.recomendada||null, adiar: rec.adiar||false,
      scoreJSON: JSON.stringify(rec.scores.map(s=>({
        emp:s.emp, total:s.scoreFinal,
        dist:s.detalhes?.dist||0, eq:s.detalhes?.equil||0,
        desl:s.detalhes?.desl||0, carga:s.detalhes?.carga||0,
        zona:s.carga?.zona||'livre',
        backlogFinal:Math.round(s.carga?.backlogFinal||0),
        avgUSC:Math.round(s.carga?.avgUSC||0),
        nAtrasadas:s.carga?.nAtrasadas||0,
        motivo:s.carga?.motivo||null, mesVenc:s.mesVenc||''
      }))),
      motivo: rec.adiar
        ? 'Forçada — ambas empreiteiras bloqueadas no mês de vencimento'
        : `Forçada → ${rec.recomendada||'—'}`
    });
    const uscF = parseFloat(o.usc)||0;
    uscAcum += uscF; obrasAcum++;
    const empF = selecionadas[selecionadas.length-1].empreiteiraRec;
    if(empF) uscAtribuidoMap[empF] = (uscAtribuidoMap[empF]||0) + uscF;
  });

  // ── Passo 2: Regulares — fila da mais antiga para a mais nova
  //   Ordem: dataEntrada ASC (primário) → posicao ASC (secundário)
  //   Para cada obra:
  //     1. Limites globais atingidos (obras E USC) → excluída (forecast)
  //     2. Cabe nos limites MAS ambas empreiteiras bloqueadas → adiada, CONTINUA para próxima
  //     3. Cabe nos limites E tem empreiteira → SELECIONADA
  const adiadas   = [];
  const excluidas = [];

  // Reordena por dataEntrada (mais antiga = prioridade) + posicao como desempate
  // Ordem da planilha = posicao (atribuída no momento do import, preservada na fila)
  // O drag-and-drop altera a posicao, então quem está no topo da fila tem posicao menor
  const filaOrdenada = [...regulares].sort((a,b)=>(a.posicao||999)-(b.posicao||999));

  for(const o of filaOrdenada){
    const usc = parseFloat(o.usc)||0;

    // Limites globais TOTALMENTE atingidos → para de selecionar (excluída para forecast)
    if(obrasAcum >= limObras && uscAcum >= limUSC){
      excluidas.push({...o, selecionada:false});
      continue;
    }

    // Limite de obras atingido → excluída
    if(obrasAcum >= limObras){
      excluidas.push({...o, selecionada:false});
      continue;
    }

    // Esta obra excede o USC restante → pula e tenta próxima (menor pode caber)
    if(uscAcum + usc > limUSC + 0.01){
      // Marca como excluída por USC mas CONTINUA tentando obras menores
      excluidas.push({...o, selecionada:false,
        motivo:`USC insuficiente: restam ${(limUSC-uscAcum).toFixed(0)} USC, obra precisa ${usc.toFixed(0)}`});
      continue;
    }

    // Verifica disponibilidade de empreiteira
    const rec = cfRecomendarEmpreiteira(o, _cfConfig, uscAtribuidoMap);
    if(rec.adiar){
      // Ambas bloqueadas → ADIADA, não conta nos limites, CONTINUA para próxima obra
      adiadas.push({...o, selecionada:false, adiar:true,
        empreiteiraRec:null,
        scoreJSON: JSON.stringify(rec.scores.map(s=>({
          emp:s.emp, total:s.scoreFinal,
          dist:s.detalhes?.dist||0, eq:s.detalhes?.equil||0,
          desl:s.detalhes?.desl||0, carga:s.detalhes?.carga||0,
          zona:s.carga?.zona||'bloqueada',
          backlogFinal:Math.round(s.carga?.backlogFinal||0),
          avgUSC:Math.round(s.carga?.avgUSC||0),
          nAtrasadas:s.carga?.nAtrasadas||0,
          motivo:s.carga?.motivo||null, mesVenc:s.mesVenc||''
        }))),
        motivo:'Adiada — '+rec.scores.map(s=>
          s.emp.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel')
          +': '+(s.carga?.motivo||s.carga?.zona||'?')).join(' | ')
      });
      continue;  // ← pula e analisa a próxima obra da fila
    }

    // ✅ Obra selecionada com empreiteira atribuída
    const oEmp = rec.recomendada;
    selecionadas.push({...o, selecionada:true, rodadaEstimada:1,
      empreiteiraRec: oEmp, adiar:false,
      scoreJSON: JSON.stringify(rec.scores.map(s=>({
        emp:s.emp, total:s.scoreFinal,
        dist:s.detalhes?.dist||0, eq:s.detalhes?.equil||0,
        desl:s.detalhes?.desl||0, carga:s.detalhes?.carga||0,
        zona:s.carga?.zona||'livre',
        backlogFinal:Math.round(s.carga?.backlogFinal||0),
        avgUSC:Math.round(s.carga?.avgUSC||0),
        nAtrasadas:s.carga?.nAtrasadas||0,
        motivo:s.carga?.motivo||null, mesVenc:s.mesVenc||''
      }))),
      motivo:`${oEmp?.replace('CS ELETRICIDADE','CS')}: dist+${rec.scores[0]?.detalhes?.dist||0} eq+${rec.scores[0]?.detalhes?.equil||0}`
    });
    uscAcum += usc;
    obrasAcum++;
    if(oEmp) uscAtribuidoMap[oEmp] = (uscAtribuidoMap[oEmp]||0) + usc;
  }

  // ── Passo 3: Forecast para excluídas (rodadas futuras) ──────────────────
  const capObrasRodada = limObras;
  const capUSCRodada   = limUSC;
  let restantes = [...excluidas, ...adiadas];
  let rodadaNum = 2;

  while(restantes.length>0 && rodadaNum<=36){
    let cO=capObrasRodada, cU=capUSCRodada;
    const proxRestantes=[];
    restantes.forEach(o=>{
      const usc=parseFloat(o.usc)||0;
      if(cO>0 && cU-usc>=-0.01){ o.rodadaEstimada=rodadaNum; cO--; cU-=usc; }
      else { o.rodadaEstimada=null; proxRestantes.push(o); }
    });
    restantes=proxRestantes;
    rodadaNum++;
  }

  // ── Passo 4: Bloqueadas — limpa recomendação de empreiteira ─────────────
  const bloqueadasLimpas = bloqueadas.map(o=>({...o,
    selecionada:false, empreiteiraRec:null, adiar:false, scoreJSON:null, motivo:null
  }));

  // ── Passo 5: Bundling ────────────────────────────────────────────────────
  const naoSelecionadas = [...excluidas, ...adiadas];
  const bundlingCands = cfCalcularBundling(selecionadas, naoSelecionadas, _cfConfig);

  // ── Passo 6: Salva no Firestore ──────────────────────────────────────────
  const allObras = [...selecionadas, ...excluidas, ...adiadas, ...bloqueadasLimpas];
  for(let i=0;i<allObras.length;i+=400){
    const bch = writeBatch(db);
    allObras.slice(i,i+400).forEach(o=>{
      bch.update(doc(db,'carteira_futura',o.id),{
        selecionada:    !!o.selecionada,
        rodadaEstimada: o.rodadaEstimada||null,
        empreiteiraRec: o.empreiteiraRec||null,
        adiar:          o.adiar||false,
        scoreJSON:      o.scoreJSON||null,
        motivo:         o.motivo||null
      });
    });
    await bch.commit();
  }

  if(bundlingCands.length){
    const bchB = writeBatch(db);
    bundlingCands.forEach(b=>{
      bchB.update(doc(db,'carteira_futura',b.idExcluida),{
        bundlingDist:b.distKm, bundlingRefNota:b.notaSelecionada
      });
    });
    await bchB.commit();
  }

  // ── Passo 7: Atualiza estado local ──────────────────────────────────────
  const mapUpdate = {};
  allObras.forEach(o=>{ mapUpdate[o.id]=o; });
  bundlingCands.forEach(b=>{
    if(mapUpdate[b.idExcluida]){
      mapUpdate[b.idExcluida].bundlingDist    = parseFloat(b.distKm);
      mapUpdate[b.idExcluida].bundlingRefNota = b.notaSelecionada;
    }
  });
  _cfObras.forEach(o=>{ if(mapUpdate[o.id]) Object.assign(o, mapUpdate[o.id]); });

  cfRenderFila();
  cfRenderEstatisticas();
  cfAtualizarContador();
  cfMostrarResultadoSelecao(selecionadas, adiadas);

  const comEmp = selecionadas.filter(o=>o.empreiteiraRec && !o.adiar);
  const uscSel = comEmp.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const uscPorEmp = {}; comEmp.forEach(o=>{ uscPorEmp[o.empreiteiraRec]=(uscPorEmp[o.empreiteiraRec]||0)+(parseFloat(o.usc)||0); });
  const forcSemEmp = selecionadas.filter(o=>(o.forcado||o.status==='forcada')&&!o.empreiteiraRec);
  const empSummary = Object.entries(uscPorEmp).map(([e,u])=>
    e.replace('CS ELETRICIDADE','CS').replace('ELETELSUL','Eletel')+': '+u.toFixed(0)+' USC'
  ).join(' · ');
  toast(`✓ ${comEmp.length} obras · ${uscSel.toFixed(0)} USC total`+
    (empSummary?` (${empSummary})`:'') +
    (forcSemEmp.length?` · ⭐${forcSemEmp.length} forçadas s/emp`:'') +
    (adiadas.length?` · ⏸${adiadas.length} adiadas`:''),
    'ok');
};

// ══ DESLIGAMENTOS — seção completa reconstruída ══════════════════════════════

// ── Mammoth.js loader (.docx) ─────────────────────────────────────────────
async function loadMammoth(){
  if(window.mammoth) return window.mammoth;
  return new Promise((res,rej)=>{
    if(document.getElementById('mammoth-script')){ setTimeout(()=>res(window.mammoth),600); return; }
    const s=document.createElement('script');
    s.id='mammoth-script';
    s.src='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload=()=>res(window.mammoth); s.onerror=()=>rej(new Error('Falha Mammoth.js'));
    document.head.appendChild(s);
  });
}

// ── Parser .docx (Word) ───────────────────────────────────────────────────
async function parseSIMODocx(arrayBuffer){
  const mammoth = await loadMammoth();
  const result  = await mammoth.extractRawText({arrayBuffer});
  const fullText = result.value;
  const entries=[], seen=new Set();
  const WINDOW=300;
  const oisPos=[...fullText.matchAll(/(?<![0-9])(40[0-9]\d{6})(?![0-9])/g)].map(m=>({pos:m.index,ois:m[1]}));
  const datPos=[...fullText.matchAll(/(\d{2})\/(\d{2})\/(20\d{2})/g)].map(m=>({pos:m.index,iso:`${m[3]}-${m[2]}-${m[1]}`}));
  function empAtPos(pos){
    const tail=fullText.slice(0,pos).slice(-3000);
    if(/CS\s*ELET|C\s*S\s*ELET|MANUT.*CS/i.test(tail)) return 'CS ELETRICIDADE';
    if(/ELETELS[UI]?/i.test(tail)) return 'ELETELSUL';
    return '';
  }
  oisPos.forEach(({pos,ois},oisIdx)=>{
    const near=datPos.filter(d=>Math.abs(d.pos-pos)<=WINDOW).sort((a,b)=>Math.abs(a.pos-pos)-Math.abs(b.pos-pos));
    if(!near.length){ const af=datPos.filter(d=>d.pos>pos).sort((a,b)=>a.pos-b.pos); if(af.length) near.push(af[0]); }
    if(!near.length) return;
    const dataProgram=near[0].iso;
    const key=ois+dataProgram; if(seen.has(key)) return; seen.add(key);
    const nextOisPos2=oisIdx+1<oisPos.length?oisPos[oisIdx+1].pos:pos+WINDOW;
    const seg=fullText.slice(Math.max(0,pos-30),nextOisPos2);
    let status='';
    if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(seg))        status='aguarda_execucao';
    else if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(seg))    status='aguarda_programador';
    else if(/AGUARDA\s+VISTO|SD.*AGUARDANDO|AGUARDA.*CHEFIA/i.test(seg)) status='aguarda_visto';
    const tm=seg.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);
    entries.push({obraNumero:ois,dataProgram,inicioHora:tm?.[1]||'',fimHora:tm?.[2]||'',empreiteira:empAtPos(pos),status});
  });
  if(!entries.length) throw new Error('Nenhuma obra encontrada no documento Word.');
  return entries;
}

// ── Parser .xlsx (Excel) ──────────────────────────────────────────────────
async function parseSIMOExcel(arrayBuffer){
  const XLSX=await loadSheetJS();
  const wb=XLSX.read(arrayBuffer,{type:'array',cellDates:true});
  const entries=[],seen=new Set();
  function getEmp(text){ const t=text.toUpperCase(); if(/CS\s*ELET|C\s*S\s*ELET/.test(t)) return 'CS ELETRICIDADE'; if(/ELETELS[UI]?/.test(t)) return 'ELETELSUL'; return ''; }
  wb.SheetNames.forEach(shName=>{
    const ws=wb.Sheets[shName];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    const flatAll=rows.flat().join(' ');
    let emp=getEmp(flatAll);
    function parseCfDate(raw){ if(!raw) return ''; if(raw instanceof Date) return raw.toISOString().split('T')[0]; const s=String(raw).trim(); const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`; const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(br) return `${br[3]}-${br[2]}-${br[1]}`; const us=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if(us){ const y=us[3].length===2?'20'+us[3]:us[3]; return `${y}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`; } return s.slice(0,10); }
    rows.forEach((row,i)=>{
      const rowStr=row.join(' ');
      const oisFound=[...new Set([...rowStr.matchAll(/(?<![0-9])(40[0-9]\d{6})(?![0-9])/g)].map(m=>m[1]))];
      if(!oisFound.length) return;
      let dataProgram=''; for(let ci=i;ci<=Math.min(i+2,rows.length-1);ci++){ dataProgram=parseCfDate(rows[ci].join(' ').match(/(\d{2})\/(\d{2})\/(20\d{2})/)?.[0]||''); if(dataProgram) break; }
      if(!dataProgram) return;
      let status=''; for(let ci=i;ci<=Math.min(i+2,rows.length-1);ci++){ const cs=rows[ci].join(' '); if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(cs)){status='aguarda_execucao';break;} if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(cs)){status='aguarda_programador';break;} if(/AGUARDA\s+VISTO/i.test(cs)){status='aguarda_visto';break;} }
      const tm=rowStr.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);
      oisFound.forEach(ois=>{ const key=ois+dataProgram; if(seen.has(key)) return; seen.add(key); entries.push({obraNumero:ois,dataProgram,inicioHora:tm?.[1]||'',fimHora:tm?.[2]||'',empreiteira:emp,status}); });
    });
  });
  return entries;
}

// ── Upload de desligamentos ────────────────────────────────────────────────
window.uploadDesligamentos = async function(){
  const input=document.getElementById('inputPdfDeslig');
  if(!input?.files?.[0]){ toast('Selecione um arquivo.','err'); return; }
  const file=input.files[0];
  const btn=document.getElementById('btnUploadDeslig');
  if(btn){ btn.disabled=true; btn.textContent='Processando...'; }
  try{
    const arrayBuffer=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error('Falha ao ler arquivo')); r.readAsArrayBuffer(file); });
    let entries;
    if(file.name.match(/\.xlsx?$/i))      entries=await parseSIMOExcel(arrayBuffer);
    else if(file.name.match(/\.docx?$/i)) entries=await parseSIMODocx(arrayBuffer);
    else throw new Error('Formato não suportado. Use .xlsx, .docx');
    if(!entries.length) throw new Error('Nenhuma entrada encontrada no arquivo.');
    const hoje=(new Date()).toISOString().split('T')[0];
    const agora=new Date();
    const horaStr=String(agora.getHours()).padStart(2,'0')+':'+String(agora.getMinutes()).padStart(2,'0');
    const docKey=hoje+'_'+String(agora.getHours()).padStart(2,'0')+String(agora.getMinutes()).padStart(2,'0');
    await setDoc(doc(db,'desligamentos',docKey),{data:hoje,hora:horaStr,arquivo:file.name,atualizadaEm:serverTimestamp(),entradas:entries,totalEntradas:entries.length});
    toast(`✓ ${entries.length} desligamentos importados — ${hoje} às ${horaStr}.`,'ok');
    if(window._deslMap!==undefined){ window._deslMap={}; (entries).forEach(e=>{ if(e.obraNumero) window._deslMap[e.obraNumero]={dataProgram:e.dataProgram,status:e.status,inicioHora:e.inicioHora||''}; }); }
    renderDesligamentos();
  }catch(e){ toast('Erro: '+e.message,'err'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Importar PDF'; } input.value=''; }
};

// ── Carrega importação específica ─────────────────────────────────────────
window.loadDesligData = async function(docId){
  if(!docId) return;
  const slot=document.getElementById('desligSlot');
  if(slot) slot.innerHTML='<div style="font-size:11px;color:var(--muted)">Carregando...</div>';
  try{ const snap=await getDoc(doc(db,'desligamentos',docId)); if(!snap.exists()){ toast('Importação não encontrada.','err'); return; } _renderDesligSlot(snap.data()); }
  catch(e){ toast('Erro: '+e.message,'err'); }
};

// ── Atualiza status de uma entrada de desligamento ────────────────────────
window.atualizarStatusDesl = async function(idx,novoStatus){
  const docId=window._desl_docId||'';
  if(!docId){ toast('ID do documento não encontrado.','err'); return; }
  try{
    const snap=await getDoc(doc(db,'desligamentos',docId));
    if(!snap.exists()){ toast('Documento não encontrado.','err'); return; }
    const data=snap.data(); const entradas=[...(data.entradas||[])];
    if(idx<0||idx>=entradas.length){ toast('Entrada não encontrada.','err'); return; }
    entradas[idx]={...entradas[idx],status:novoStatus};
    await updateDoc(doc(db,'desligamentos',docId),{entradas,atualizadaEm:serverTimestamp()});
    toast('✓ Status atualizado.','ok');
    setTimeout(()=>{ if(typeof renderDesligamentos==='function') renderDesligamentos(); },300);
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

// ── Render principal de desligamentos ─────────────────────────────────────
function renderDesligamentos(){
  if(!obras||obras.length===0){ setTimeout(renderDesligamentos,800); return; }
  getDocs(collection(db,'desligamentos')).then(snap=>{
    if(snap.empty){ document.getElementById('desligSlot').innerHTML='<div style="font-size:11px;color:var(--muted)">Nenhum cronograma importado ainda.</div>'; return; }
    const snapDocs=snap.docs.sort((a,b)=>b.id.localeCompare(a.id));
    _renderDesligSlot(snapDocs[0].data(),snapDocs.map(d=>d.id));
  }).catch(e=>{ document.getElementById('desligSlot').innerHTML=`<div style="color:#EF4444">Erro: ${e.message}</div>`; });
}
window.renderDesligamentos=renderDesligamentos;

// ── _renderDesligSlot — renderiza dados de uma importação ──────────────────
function _renderDesligSlot(latest,allDocIds){
  const _hoje=new Date().toISOString().split('T')[0];
  const _hoje30=new Date(); _hoje30.setDate(_hoje30.getDate()+30);
  const _hoje30str=_hoje30.toISOString().split('T')[0];
  window._desl_docId=(allDocIds||[])[0]||'';

  const entradas=(latest.entradas||[]).filter(e=>{
    if(me.perfil==='empreiteira'){
      const obraEmp=obras.find(o=>o.numero?.toString()===e.obraNumero?.toString())?.empreiteira?.toUpperCase()||'';
      return obraEmp===(me.vinculo||'').toUpperCase();
    }
    return true;
  });

  const entradasPrio=entradas.map(e=>{
    const prio=getPrioridade(e);
    const tipo=prio?.o?.tipo||'';
    return {...e,prio,tipo};
  });
  const entradasRD=entradasPrio.filter(e=>e.tipo==='R1'||e.tipo==='R2');
  const entradasODI=entradasPrio.filter(e=>e.tipo==='ODI');
  const semTipo=entradasPrio.filter(e=>!e.tipo);
  const comPrioridade=entradasRD.filter(e=>e.prio);
  comPrioridade.forEach(e=>{ if(!e.empreiteira&&e.prio?.o) e.empreiteira=e.prio.o.empreiteira||''; });

  const criticas=comPrioridade.filter(e=>e.prio.nivel==='critica').length;
  const urgentes=comPrioridade.filter(e=>e.prio.nivel==='urgente').length;
  const normais=comPrioridade.filter(e=>e.prio.nivel==='ok').length;
  const comVisto=entradas.filter(e=>e.status==='aguarda_visto');

  const STATUS_OPTS={'aguarda_programador':{label:'⏳ Ag. Programador',bg:'#F59E0B',cor:'#000'},'aguarda_execucao':{label:'🔧 Ag. Execução',bg:'#3B82F6',cor:'#fff'},'aguarda_visto':{label:'👤 Ag. Visto Chefia',bg:'#7c6af7',cor:'#fff'}};
  window._desl_docId=(allDocIds||[])[0]||'';
  const podeEditar=['gerente','estagiario','fiscal','fiscal_adm'].includes(me.perfil);
  function statusLabel(s,eIdx){
    const opt=STATUS_OPTS[s]||{label:s||'—',bg:'#6b7280',cor:'#fff'};
    const st='padding:2px 8px;border-radius:8px;font-size:9px;background:'+opt.bg+';color:'+opt.cor+';border:none';
    if(!podeEditar) return '<span style="'+st+'">'+opt.label+'</span>';
    let sel='<select style="'+st+';cursor:pointer;font-weight:600" title="Alterar status" onchange="window.atualizarStatusDesl('+eIdx+',this.value)">';
    Object.entries(STATUS_OPTS).forEach(function(kv){ sel+='<option value="'+kv[0]+'"'+(kv[0]===s?' selected':'')+'>'+kv[1].label+'</option>'; });
    return sel+'</select>';
  }

  function getPrioridade(e){
    const numStr=e.obraNumero?.toString().trim()||'';
    const obraMatch=obras.find(o=>{ const n=(o.numero||'').toString().trim(); return n===numStr||n===String(parseInt(numStr,10)); });
    if(!obraMatch) return null;
    const lim=obraMatch.dataLimite||'';
    if(lim<_hoje) return {nivel:'critica',label:'⚠️ ATRASADA',cor:'#EF4444',o:obraMatch};
    if(lim<=_hoje30str) return {nivel:'urgente',label:'🔴 URGENTE ≤30d',cor:'#F97316',o:obraMatch};
    return {nivel:'ok',label:'✅ No prazo',cor:'#22C55E',o:obraMatch};
  }

  function makeRows(lista,docId){
    return lista.sort((a,b)=>{ const ord={critica:0,urgente:1,ok:2}; return (ord[a.prio?.nivel]??3)-(ord[b.prio?.nivel]??3)||(a.dataProgram||'').localeCompare(b.dataProgram||''); }).map(function(e,ei){
      const p=e.prio; const empDisplay=p?.o?.empreiteira||'';
      const rowBg=p?.nivel==='critica'?'background:rgba(239,68,68,.12);border-left:4px solid #EF4444':p?.nivel==='urgente'?'background:rgba(249,115,22,.10);border-left:4px solid #F97316':e.status==='aguarda_visto'?'background:rgba(124,106,247,.08);border-left:4px solid #7c6af7':'';
      return '<tr style="border-bottom:1px solid var(--border);'+rowBg+'"><td style="padding:5px 8px;font-size:10px;white-space:nowrap">'+(e.dataProgram?fmtTxt(e.dataProgram):'—')+(e.inicioHora?' '+e.inicioHora:'')+'</td><td style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--accent);cursor:pointer"'+(p?.o?' onclick="openObraModal(\''+p.o.id+'\')"':'')+'>'+(e.obraNumero||'—')+'</td><td style="padding:5px 8px;font-size:10px">'+empDisplay+'</td><td style="padding:5px 8px">'+statusLabel(e.status,ei)+'</td><td style="padding:5px 8px;font-size:9px">'+(p?'<span style="color:'+p.cor+';font-weight:700">'+p.label+'</span>'+(p.o?'<br><span style="color:var(--muted)">'+fmtTxt(p.o.dataLimite)+'</span>':''):'<span style="color:var(--muted)">Obra não encontrada</span>')+'</td></tr>';
    }).join('');
  }

  function makeTable(lista,titulo,cor){
    if(!lista.length) return '';
    return '<div style="margin-bottom:16px"><div style="font-weight:700;font-size:12px;color:'+cor+';margin-bottom:6px">'+titulo+' ('+lista.length+')</div><div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:var(--surface2)"><th style="padding:6px 8px;text-align:left">Data Prog.</th><th style="padding:6px 8px;text-align:left">OIS</th><th style="padding:6px 8px;text-align:left">Empreiteira</th><th style="padding:6px 8px;text-align:left">Status</th><th style="padding:6px 8px;text-align:left">Prioridade</th></tr></thead><tbody>'+makeRows(lista,window._desl_docId)+'</tbody></table></div></div></div>';
  }

  const vistoAlert=(comVisto.length&&me.perfil==='gerente')?('<div style="background:rgba(124,106,247,.08);border:1px solid #7c6af7;border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-weight:700;font-size:12px;color:#7c6af7">👤 '+comVisto.length+' desligamento(s) aguardando seu visto/aprovação:</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">'+comVisto.map(function(e){ return '<span style="background:var(--surface);border:1px solid #7c6af7;border-radius:6px;padding:3px 10px;font-size:10px">'+e.obraNumero+' — '+fmtTxt(e.dataProgram)+'</span>'; }).join('')+'</div></div>'):'';

  const analise=comPrioridade.length?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px"><div style="font-weight:700;font-size:13px;margin-bottom:10px">📊 Análise de Prioridade — Obras Programadas (RD)</div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div style="flex:1;min-width:120px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:900;color:#EF4444">${criticas}</div><div style="font-size:9px;color:var(--muted)">⚠️ Obras ATRASADAS sendo programadas</div></div><div style="flex:1;min-width:120px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);border-radius:8px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:900;color:#F97316">${urgentes}</div><div style="font-size:9px;color:var(--muted)">🔴 Urgentes (vence ≤30d)</div></div><div style="flex:1;min-width:120px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:900;color:#22C55E">${normais}</div><div style="font-size:9px;color:var(--muted)">✅ Prazo OK</div></div></div>${normais>criticas+urgentes&&criticas+urgentes>0?`<div style="background:rgba(239,68,68,.08);border:1px solid #EF4444;border-radius:8px;padding:10px;font-size:11px;color:#EF4444;font-weight:700">⚠️ Atenção: a empreiteira está priorizando mais obras com prazo OK do que obras urgentes/atrasadas!</div>`:''}</div>`:'';

  document.getElementById('desligSlot').innerHTML=`
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
      📅 Última importação: <strong>${fmtTxt(latest.data)}</strong>${latest.hora?' às <strong>'+latest.hora+'</strong>':''} — ${latest.arquivo||''} — ${entradas.length} entradas
      ${(allDocIds||[]).length>1?'<details style="display:inline;margin-left:8px"><summary style="display:inline;cursor:pointer;font-size:10px;color:var(--accent)">📋 Histórico</summary><br><select style="font-size:10px;margin-top:4px" onchange="this.value&&loadDesligData(this.value)">'+allDocIds.map(id=>'<option>'+id+'</option>').join('')+'</select></details>':''}
    </div>
    ${vistoAlert}${analise}
    ${makeTable(entradasRD,'🔵 Obras RD (R1+R2)','#7c6af7')}
    ${entradasODI.length?makeTable(entradasODI,'⚡ Obras ODI','#F59E0B'):''}
    ${semTipo.length?makeTable(semTipo,'❓ Não identificadas','#6b7280'):''}`;
}



// ══ FUNÇÕES RECUPERADAS — páginas secundárias ════════════════════════════════

// ── Abertura de Obras ─────────────────────────────────────────────────────
function renderAberturaObras(){
  const cont = document.getElementById('pgAberturaContent');
  if(!cont) return;
  if(me.perfil !== 'gerente'){ cont.innerHTML='<div class="loading">Sem acesso.</div>'; return; }
  const hoje30 = new Date(); hoje30.setDate(hoje30.getDate()-30);
  const lim30 = hoje30.toISOString().split('T')[0];
  const recentes = obras.filter(o=>!o.cancelado&&o.dataAbertura&&o.dataAbertura>=lim30)
    .sort((a,b)=>(b.dataAbertura||'').localeCompare(a.dataAbertura||''));
  const pendentes = obras.filter(o=>!o.cancelado&&!o.armazenado&&!o.fiscalizacao)
    .sort((a,b)=>(a.dataLimite||'9').localeCompare(b.dataLimite||'9'));
  function obraRow(o){
    const st=statusOf(o);
    const cor=st.includes('Atrasada')||st.includes('Executivo')?'#EF4444':st.includes('Paral')?'#F59E0B':'var(--muted)';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openObraModal('${o.id}')">
      <td style="padding:6px 8px;font-weight:700;color:var(--accent)">${o.numero||'—'}</td>
      <td style="padding:6px 8px">${o.cidade||o.municipio||'—'}</td>
      <td style="padding:6px 8px">${o.tipo||'—'}</td>
      <td style="padding:6px 8px">${o.empreiteira||'—'}</td>
      <td style="padding:6px 8px">${o.dataAbertura?fmtTxt(o.dataAbertura):'—'}</td>
      <td style="padding:6px 8px;color:${cor}">${st}</td>
      <td style="padding:6px 8px;text-align:right">${parseFloat(o.usc||0).toFixed(1)}</td>
    </tr>`;}
  const hdr=`<thead><tr style="background:var(--surface2)"><th style="padding:6px 8px;text-align:left">Nota</th><th style="padding:6px 8px;text-align:left">Cidade</th><th style="padding:6px 8px;text-align:left">Tipo</th><th style="padding:6px 8px;text-align:left">Empreiteira</th><th style="padding:6px 8px;text-align:left">Abertura</th><th style="padding:6px 8px;text-align:left">Status</th><th style="padding:6px 8px;text-align:right">USC</th></tr></thead>`;
  const tbl=(lst)=>lst.length?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">${hdr}<tbody>${lst.map(obraRow).join('')}</tbody></table></div></div>`:'<div style="color:var(--muted);padding:16px;font-size:12px">Nenhuma obra.</div>';
  cont.innerHTML=`<div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">📂 Abertura de Obras</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center"><div style="font-size:28px;font-weight:900;color:var(--accent)">${recentes.length}</div><div style="font-size:10px;color:var(--muted)">Abertas nos últimos 30d</div></div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center"><div style="font-size:28px;font-weight:900;color:#F59E0B">${pendentes.length}</div><div style="font-size:10px;color:var(--muted)">Aguardando fiscalização</div></div>
    </div>
    <div style="font-weight:700;font-size:13px;margin-bottom:8px">📋 Abertas recentemente (30d)</div>${tbl(recentes)}
    <div style="font-weight:700;font-size:13px;margin:16px 0 8px">⏳ Pendentes de fiscalização</div>${tbl(pendentes.slice(0,50))}`;
}
window.renderAberturaObras = renderAberturaObras;





// ── Análise Financeira — parâmetros e render ──────────────────────────────
let _paramsFinCache = null;

async function loadParamsFinanceiros(){
  if(_paramsFinCache) return _paramsFinCache;
  try{
    const snap = await getDoc(doc(db,'config','financeiro'));
    _paramsFinCache = snap.exists() ? snap.data() : {};
  }catch(e){ _paramsFinCache = {}; }
  return _paramsFinCache;
}
window.loadParamsFinanceiros = loadParamsFinanceiros;

window.saveParamsFinanceiros = async function(){
  const g = id => document.getElementById(id)?.value;
  const params = {
    valorUSC_CS:    parseFloat(g('pfValorUSC_CS'))||0,
    valorUSC_EL:    parseFloat(g('pfValorUSC_EL'))||0,
    valorULV_CS:    parseFloat(g('pfValorULV_CS'))||0,
    valorULV_EL:    parseFloat(g('pfValorULV_EL'))||0,
    bonusConclCS:   parseFloat(g('pfBonusCS'))||0,
    bonusConclEL:   parseFloat(g('pfBonusEL'))||0,
  };
  await setDoc(doc(db,'config','financeiro'), params);
  _paramsFinCache = params;
  toast('✓ Parâmetros financeiros salvos.','ok');
  renderAnaliseFinanceira();
};

function getParamsFinanceiros(){
  return _paramsFinCache || {};
}

function renderAnaliseFinanceira(){
  const cont = document.getElementById('pgAnaliseContent');
  if(!cont) return;
  const p = getParamsFinanceiros();

  const obrasFin = obras.filter(o=>
    (o.tipo==='R1'||o.tipo==='R2') && !o.cancelado
  );

  // Por empreiteira
  const empData = {};
  ['CS ELETRICIDADE','ELETELSUL'].forEach(emp=>{
    const mine = obrasFin.filter(o=>(o.empreiteira||'').toUpperCase()===emp.toUpperCase());
    const isCS = emp.includes('CS');
    const vUSC = isCS?(p.valorUSC_CS||0):(p.valorUSC_EL||0);
    const vULV = isCS?(p.valorULV_CS||0):(p.valorULV_EL||0);
    const bonus = isCS?(p.bonusConclCS||0):(p.bonusConclEL||0);
    const uscTotal = mine.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const ulvTotal = mine.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
    const conclCount = mine.filter(o=>o.conclusao).length;
    const prevTotal = uscTotal*vUSC + ulvTotal*vULV + conclCount*bonus;
    empData[emp] = {mine, uscTotal, ulvTotal, conclCount, prevTotal, vUSC, vULV, bonus};
  });

  function kpiCard(label, value, sub=''){
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:20px;font-weight:900;color:var(--accent)">${value}</div>
      <div style="font-size:9px;color:var(--muted);margin-top:2px">${label}</div>
      ${sub?`<div style="font-size:9px;color:var(--muted)">${sub}</div>`:''}
    </div>`;
  }

  const totalPrev = Object.values(empData).reduce((s,d)=>s+d.prevTotal,0);

  cont.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">💰 Análise Financeira</div>

    <!-- Parâmetros -->
    <details style="margin-bottom:16px">
      <summary style="cursor:pointer;font-weight:700;font-size:13px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;list-style:none">
        ⚙️ Parâmetros de Valor ▾
      </summary>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:0 0 10px 10px;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
        ${['CS ELETRICIDADE','ELETELSUL'].map(emp=>{
          const key = emp.includes('CS')?'CS':'EL';
          const lbl = emp.includes('CS')?'CS Eletricidade':'Eletelsul';
          return `<fieldset style="border:1px solid var(--border);border-radius:8px;padding:10px">
            <legend style="font-size:10px;font-weight:700;color:var(--accent);padding:0 6px">${lbl}</legend>
            <div class="fg" style="margin-bottom:6px"><label style="font-size:10px">Valor USC (R$)</label><input type="number" id="pfValorUSC_${key}" value="${p['valorUSC_'+key]||0}" step="0.01" style="font-size:12px"></div>
            <div class="fg" style="margin-bottom:6px"><label style="font-size:10px">Valor ULV (R$)</label><input type="number" id="pfValorULV_${key}" value="${p['valorULV_'+key]||0}" step="0.01" style="font-size:12px"></div>
            <div class="fg"><label style="font-size:10px">Bônus conclusão (R$)</label><input type="number" id="pfBonus${key}" value="${p['bonusConclCS']||0}" step="0.01" style="font-size:12px"></div>
          </fieldset>`;
        }).join('')}
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
          <button class="btn btn-primary btn-sm" onclick="window.saveParamsFinanceiros()">💾 Salvar</button>
        </div>
      </div>
    </details>

    <!-- KPIs totais -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">
      ${kpiCard('Previsto Total', 'R$ '+totalPrev.toLocaleString('pt-BR',{minimumFractionDigits:0}))}
      ${kpiCard('Obras RD', obrasFin.length)}
      ${kpiCard('USC Total', obrasFin.reduce((s,o)=>s+(parseFloat(o.usc)||0),0).toFixed(0))}
    </div>

    <!-- Por empreiteira -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${Object.entries(empData).map(([emp,d])=>`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">${emp.replace('CS ELETRICIDADE','CS Eletricidade')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
            <div><span style="color:var(--muted)">Obras</span><br><strong>${d.mine.length}</strong></div>
            <div><span style="color:var(--muted)">USC Total</span><br><strong>${d.uscTotal.toFixed(0)}</strong></div>
            <div><span style="color:var(--muted)">Concluídas</span><br><strong>${d.conclCount}</strong></div>
            <div><span style="color:var(--muted)">Previsto</span><br><strong>R$ ${d.prevTotal.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong></div>
          </div>
        </div>`).join('')}
    </div>`;
}
window.renderAnaliseFinanceira = renderAnaliseFinanceira;

// ── Programas ─────────────────────────────────────────────────────────────
function renderProgramas(){
  const cont = document.getElementById('pgProgramasContent');
  if(!cont) return;
  if(me.perfil!=='gerente'){ cont.innerHTML='<div class="loading">Sem acesso.</div>'; return; }

  const PROGS = ['Regulatório','PODI','Mono-Tri','Melhoria'];
  const stats = {};
  PROGS.forEach(prog=>{
    const mine = obras.filter(o=>o.programa===prog&&!o.cancelado);
    const abertas = mine.filter(o=>!o.armazenado);
    const encerradas = mine.filter(o=>o.armazenado);
    const atrasadas = abertas.filter(o=>o.dataLimite&&o.dataLimite<new Date().toISOString().split('T')[0]&&!o.conclusao);
    const uscTotal = abertas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    stats[prog] = {mine, abertas, encerradas, atrasadas, uscTotal};
  });

  const semProg = obras.filter(o=>!o.programa&&!o.cancelado);

  function progCard(prog, d){
    const pct = d.abertas.length>0 ? Math.round((d.atrasadas.length/d.abertas.length)*100) : 0;
    const cor = pct>20?'#EF4444':pct>10?'#F59E0B':'#22C55E';
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:800;font-size:14px;margin-bottom:12px">${prog}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;margin-bottom:8px">
        <div style="text-align:center"><div style="font-size:20px;font-weight:900;color:var(--accent)">${d.abertas.length}</div><div style="color:var(--muted)">Abertas</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:900;color:#EF4444">${d.atrasadas.length}</div><div style="color:var(--muted)">Atrasadas</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:900;color:#22C55E">${d.encerradas.length}</div><div style="color:var(--muted)">Encerradas</div></div>
      </div>
      <div style="font-size:10px;color:var(--muted)">USC em aberto: <strong>${d.uscTotal.toFixed(0)}</strong></div>
      ${pct>0?`<div style="margin-top:8px;height:4px;background:var(--surface2);border-radius:2px">
        <div style="width:${Math.min(pct,100)}%;height:100%;background:${cor};border-radius:2px"></div>
      </div><div style="font-size:9px;color:${cor};margin-top:2px">${pct}% atrasadas</div>`:''}
    </div>`;
  }

  cont.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">📋 Programas</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:16px">
      ${PROGS.map(p=>progCard(p, stats[p])).join('')}
    </div>
    ${semProg.length?`<div style="font-size:12px;color:var(--muted);padding:10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
      ⚠️ ${semProg.length} obra(s) sem programa definido</div>`:''}`;
}
window.renderProgramas = renderProgramas;


// ── Otimização de Portfólio ───────────────────────────────────────────────
function renderOtimizacaoPortfolio(){
  const cont = document.getElementById('pgOtimPortContent');
  if(!cont) return;
  cont.innerHTML=`<div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:20px">📊 Otimização de Portfólio</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🔧</div>
      <div style="font-size:14px;font-weight:700">Em desenvolvimento</div>
    </div>`;
}
window.renderOtimizacaoPortfolio = renderOtimizacaoPortfolio;

// ── Fix desligamentos — garante que o slot existe no DOM ──────────────────
(function(){
  const _orig = typeof renderDesligamentos!=='undefined' ? renderDesligamentos : null;
  window.renderDesligamentos = function(){
    const cont = document.getElementById('pgDesligamentosContent');
    if(cont && !document.getElementById('desligSlot')){
      cont.innerHTML=`<div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:16px">📅 Desligamentos</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            📤 Importar Word/Excel
            <input type="file" id="inputPdfDeslig" accept=".docx,.xlsx,.xls" style="display:none" onchange="window.uploadDesligamentos()">
          </label>
        </div>
        <div id="desligSlot"><div class="loading">Carregando histórico...</div></div>`;
    }
    if(_orig) _orig();
  };
})();
