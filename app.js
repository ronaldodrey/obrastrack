// ══════════════════════════════════════════════════════
//  SPPC_ARLAG — app.js
console.log('%c[SPPC] app.js v2620 carregado', 'color:#7c6af7;font-weight:bold;font-size:14px');
// ══════════════════════════════════════════════════════
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail }
                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
         onSnapshot, serverTimestamp, query, orderBy, where, arrayUnion }
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

// ══════════════════════════════════════════════════════════
//  ODI — Status chain + helpers
// ══════════════════════════════════════════════════════════

function statusOfODI(o){
  if(o.cancelado)    return 'Cancelada';
  if(o.armazenado)   return 'Encerrada';
  if(o.medida280)    return 'Ag. Armazenamento';
  // Medidas 70+230 sempre juntas
  if(o.medida230 && o.medida70){
    const temPend = (o.pendenciasDocODI||[]).length>0 || (o.pendencia&&!o.pendenciaResolvida);
    if(temPend) return 'Pendência Doc./Construtiva';
    return 'Ag. Medida 280';
  }
  // Cadastro urgente ODI: fiscalizada +7d sem encaminhar cadastro
  if(o.fiscalizacao && !o.dataCadastro){
    const _dC = diff(o.fiscalizacao, new Date().toISOString().split('T')[0]);
    if(_dC !== null && _dC > 7) return 'Encaminhar Cadastro Urgente';
  }
  // NF lançada → Ag. Medidas 70/230 se sem pendência, senão Pendência
  if(o.nfLancadaData){
    const temPend = (o.pendenciasDocODI||[]).length>0 || (o.pendencia&&!o.pendenciaResolvida);
    if(temPend) return 'Pendência Doc./Construtiva';
    return 'Ag. Medidas 70/230';
  }
  // NF enviada → Ag. Lançamento NF
  if(o.nfEnviadaFlag) return 'Ag. Lançamento NF';
  // Kaffa ODI feito → Ag. Notas Fiscais
  if(o.kaffaODI) return 'Ag. Notas Fiscais';
  // Conclusão informada → cadUrg se +15d sem fiscalização, senão Ag. Fiscalização/Kaffa
  if(o.conclusao){
    if(!o.fiscalizacao){
      const _dF = diff(o.conclusao, new Date().toISOString().split('T')[0]);
      if(_dF !== null && _dF > 15) return 'Encaminhar Cadastro Urgente';
    }
    return 'Ag. Fiscalização/Kaffa';
  }
  // Default
  return 'Em Execução';
}

function diasEntre(dataStr){
  if(!dataStr) return 0;
  const d = new Date(dataStr+'T00:00:00');
  return Math.floor((Date.now()-d.getTime())/(1000*60*60*24));
}


function statusOf(o){
  // ODI obras use their own status chain
  if(o.tipo==='ODI') return statusOfODI(o);
  if(o.cancelado)    return 'Cancelada';
  if(o.paralisada){
    const _h=(new Date()).toISOString().split('T')[0];
    if(o.paralAceiteAte && o.paralAceiteAte<_h) return 'Paral. Expirada';
    return 'Obra Paralisada';
  }
  if(o.armazenado)   return 'Encerrada';
  // Aguard. Fiscalização SEMPRE tem prioridade — mesmo com medidas posteriores registradas
  if(o.conclusao && !o.fiscalizacao){
    const _dCU = diff(o.conclusao, new Date().toISOString().split('T')[0]);
    if(_dCU !== null && _dCU > 15) return 'Encaminhar Cadastro Urgente';
    return 'Aguard. Fiscalização';
  }
  if(o.medida280)    return 'Aguard. Armazenamento';
  if(o.medida230)    return 'Aguard. Medida 280';
  if(o.medida70&&o.conclusao) return 'Aguard. Medida 230'; // conclusão obrigatória para Ag. Medida 230
  // R2: não exige Med.70 — medicao vai direto para "Aguard. Medida 230"
  // Medição (final) só avança status se obra já concluída pela empreiteira
  if(o.medicao&&o.conclusao) return o.tipo==='R2' ? 'Aguard. Medida 230' : 'Aguard. Medida 70';
  // Cadastro urgente 1: Fiscalizada +7d sem encaminhar cadastro
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
  if(o.impedimento)  return 'Prob. Executivo – Celesc';
  if(o.dataLimite && hoje()>parseD(o.dataLimite)) return 'Atrasada';
  return 'Em Execução';
}

// Segundo status: pendência com regularização aguardando conf. fiscal, ou pendência ativa
function statusSecundario(o){
  let extra = '';
  // Badge Loteamento para obras ODI
  if(o.tipo==='ODI' && o.descricaoODI==='Loteamento'){
    extra += '<span class="st" style="color:#D97706;background:rgba(217,119,6,.2);border-color:#D9770655;margin-left:4px;font-weight:800"><span style="background:#D97706"></span>🏘️ Loteamento</span>';
  }
  // Desligamento programado: via SIMO importado (_deslMap) OU campo na própria obra
  const deslEntry = (window._deslMap||{})[String(o.numero||'').trim()];
  // Desligamento: usa array novo (último não-cancelado) ou scalar legado
  const latestDesl = (()=>{
    const arr = (o.desligamentos||[]).filter(d=>d.status!=='cancelado');
    return arr.length ? arr[arr.length-1].data : null;
  })();
  const dtDesl = deslEntry?.dataProgram?.slice(0,10)
    || latestDesl
    || (o.dataDesligamento && !o.desligamentoCancelado ? o.dataDesligamento : null);
  if(dtDesl){
    extra += `<span class="st" style="color:#7c6af7;background:rgba(124,106,247,.15);border-color:#7c6af744;margin-left:4px"><span style="background:#7c6af7"></span>⚡ Desl. ${fmtTxt(dtDesl)}</span>`;
  }
  if(o.pendencia && !o.pendenciaResolvida){
    if(o.regularizacaoData)
      extra += `<span class="st" style="color:#F59E0B;background:rgba(245,158,11,.15);border-color:#F59E0B44;margin-left:4px"><span style="background:#F59E0B"></span>Ag. Conf. Pend.</span>`;
    else
      extra += `<span class="st" style="color:#F97316;background:rgba(249,115,22,.15);border-color:#F9731644;margin-left:4px"><span style="background:#F97316"></span>Pendência</span>`;
  }
  return extra;
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
  // Carrega o último desligamento importado para preencher _deslMap imediatamente
  (async ()=>{
    try{
      const snap = await getDocs(collection(db,'desligamentos'));
      if(!snap.empty){
        const latest = snap.docs.sort((a,b)=>b.id.localeCompare(a.id))[0];
        const entradas = latest.data().entradas||[];
        window._deslMap = {};
        entradas.forEach(e=>{ if(e.obraNumero) window._deslMap[e.obraNumero]={
          dataProgram:e.dataProgram, status:e.status, inicioHora:e.inicioHora||''
        }; });
      } else { window._deslMap = {}; }
    }catch(e){ window._deslMap = {}; }
  })();
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('hName').textContent=me.nome;
  const rb=document.getElementById('hRole');
  const perfilLabels={'gerente':'Gerente','fiscal':'Fiscal','empreiteira':'Empreiteira','genesis':'Genesis','estagiario':'Estagiário','analista':'Analista','adm_odi':'Adm. ODI','fiscal_adm':'Fiscal Adm.'};
  rb.textContent=perfilLabels[me.perfil]||me.perfil;
  rb.className='role-badge role-'+me.perfil;
  // Ensure role badge color for new profiles
  if(!['gerente','fiscal','empreiteira'].includes(me.perfil)){
    rb.style.background='rgba(6,182,212,.15)'; rb.style.color='#06B6D4'; rb.style.border='1px solid rgba(6,182,212,.3)';
  }

  await loadEmpreiteiras();
  popularSelectEmpreiteiras();
  syncDiretorioFiscais(); // gerente publica nome→e-mail dos fiscais (usado nos avisos de kaffa/conclusão)

  // pgAbertura: somente gerente | pgAnalise: gerente, fiscais e empreiteira
  const isAdmOdi         = me.perfil==='adm_odi';
  const canSeeAbertura   = me.perfil==='gerente' || isAdmOdi;
  const canSeeFinanceiro = me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm'||me.perfil==='empreiteira'||isAdmOdi;
  const canSeeProgramas = ['gerente','fiscal','fiscal_adm','empreiteira'].includes(me.perfil);
  const canSeePedidos  = ['analista','estagiario','adm_odi','gerente'].includes(me.perfil);
  const tabs=[
    ['pgDash','📊 Dashboard'],
    ['pgObras','🏗️ Obras'],
    ...(canSeePedidos?[['pgPedidos','📋 Pedidos']]:[]),
    ...(['gerente','fiscal','fiscal_adm','empreiteira'].includes(me.perfil)?[['pgMapa','🗺️ Mapa']]:[]), // v2612: Mapa da Rede
    ...((me.perfil==='gerente'||me.perfil==='analista')?[['pgPlanejamento','🧭 Planejamento']]:[]), // v2613: Planejamento da Rede (analista: consulta)
    ...(canSeeAbertura?[['pgAbertura','📊 Abertura de Obras']]:[]),
    ...(canSeeFinanceiro?[['pgAnalise','💰 Análise Financeira']]:[]),
    ...(canSeeProgramas?[['pgProgramas','📋 Programas']]:[]),
    ...(me.perfil==='gerente'?[['pgCarteiraFutura','📅 Carteira Futura']]:[]),
    ...((isAdmOdi||me.perfil==='gerente'||me.perfil==='fiscal'||me.perfil==='fiscal_adm')?[['pgDashOdi','🏗️ Painel ODI']]:[]),
    ['pgDesligamentos','🔌 Desligamentos'],
  ];
  // Otimização tabs
  const isEmpComOtim = me.perfil==='empreiteira' && EMP_COM_OTIMIZACAO.some(e=>me.vinculo?.toUpperCase().includes(e.split(' ')[0]));
  if(isEmpComOtim) tabs.push(['pgOtimizacao','⚡ Otimização']);
  if(['gerente','fiscal','fiscal_adm'].includes(me.perfil)) tabs.push(['pgOtimizacaoPort','🌐 Portfólio']);
  if(me.perfil==='gerente'){ tabs.push(['pgCarteira','📈 Carteira']); tabs.push(['pgEmpreiteiras','🏢 Empreiteiras']); tabs.push(['pgUsers','👥 Usuários']); }
  if(me.perfil==='adm_odi'){ tabs.push(['pgEmpreiteiras','🏢 Empreiteiras']); tabs.push(['pgUsers','👥 Usuários']); }
  // genesis e estagiario: só dash e obras (read-only + ação específica)
  document.getElementById('tabBar').innerHTML =
    tabs.map(([id,lbl])=>`<div class="tab" data-page="${id}" onclick="showPage('${id}')">${lbl}</div>`).join('');

  document.getElementById('btnNovaObra').style.display=(me.perfil==='gerente'||me.perfil==='adm_odi')?'inline-flex':'none';
  if(me.perfil==='gerente'){
    const btnLimpEq = document.getElementById('btnLimparEquip');
    if(btnLimpEq) btnLimpEq.style.display='inline-flex';
  }
  document.getElementById('btnImport').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnBulkDelete').style.display='none'; // shown by filtroRapido when encerradas selected
  const btnApagarTodas=document.getElementById('btnApagarTodas');
  if(btnApagarTodas) btnApagarTodas.style.display=me.perfil==='gerente'?'inline-flex':'none';
  const btnLimpEnc=document.getElementById('btnLimparEncerradas'); if(btnLimpEnc) btnLimpEnc.style.display=me.perfil==='gerente'?'inline-flex':'none';
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
    if(active?.id==='pgMapa') window.mapaAtualizarObras?.(); // v2612
  });

  loadEquipDBFromStorage(); // Restore equipment database from localStorage
  aplicarTemaSalvo(); // Restore theme preference
  showPage(me.perfil==='analista'?'pgPedidos':'pgDash'); // analista trabalha só com Pedidos
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
  if(id==='pgDashOdi') renderDashAdmOdi();
  if(id==='pgDesligamentos') renderDesligamentos();
  if(id==='pgOtimizacao') renderOtimizacao();
  if(id==='pgOtimizacaoPort') renderOtimizacaoPortfolio();
  if(id==='pgPedidos') renderPedidos();
  if(id==='pgMapa') window.renderMapa(); // v2612
  if(id==='pgPlanejamento') window.renderPlanejamento(); // v2613
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
  if(me.perfil==='gerente')    return obras;
  if(me.perfil==='fiscal')     return obras;
  if(me.perfil==='fiscal_adm') return obras; // acesso administrativo — vê todas
  if(me.perfil==='genesis')    return obras;   // só visualiza
  if(me.perfil==='estagiario') return obras; // visualiza + confirma armazenamento
  if(me.perfil==='adm_odi')    return obras; // acesso completo — vê todas
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
    } else if(dashPerspectiva === 'adm_odi'){
      // Redirect adm_odi to Painel ODI directly
      setTimeout(()=>showPage('pgDashOdi'),50);
      html += '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px">Redirecionando para o 🏗️ Painel ODI...</div>';
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
  const listRD = list.filter(o=>o.tipo!=='ODI');
  const listODI= list.filter(o=>o.tipo==='ODI');
  function kpiSplit(label, fnRD, fnODI, cor){
    const nRD = fnRD(listRD), nODI = fnODI(listODI);
    return `<div class="kpi-card" style="border-top:3px solid ${cor}">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">${label}</div>
      <div style="display:flex;gap:8px;align-items:baseline">
        <span style="font-size:24px;font-weight:900;color:${cor}">${nRD+nODI}</span>
        <span style="font-size:10px;color:var(--muted)">total</span>
      </div>
      <div style="font-size:10px;margin-top:4px">
        <span style="color:#3B82F6">RD: ${nRD}</span>
        <span style="color:var(--muted);margin:0 4px">·</span>
        <span style="color:#F59E0B">ODI: ${nODI}</span>
      </div>
    </div>`;
  }
  html += `<div class="kpi-strip">
    ${kpiSplit('Total',r=>r.length,o=>o.length,'#00e5a0')}
    ${kpiSplit('Em Execução',r=>r.filter(x=>statusOf(x)==='Em Execução').length,o=>o.filter(x=>statusOfODI(x)==='Em Execução').length,'#3B82F6')}
    ${kpiSplit('Atrasadas',r=>r.filter(x=>statusOf(x)==='Atrasada').length,o=>o.filter(x=>x.dataLimite&&x.dataLimite<new Date().toISOString().split('T')[0]&&!x.armazenado&&!x.cancelado&&!x.conclusao).length,'#EF4444')}
    ${kpiSplit('Paralisadas',r=>r.filter(x=>x.paralisada).length,o=>o.filter(x=>x.paralisada).length,'#DC2626')}
    ${kpiSplit('Prob. Executivo',r=>r.filter(x=>x.impedimento&&!x.conclusao).length,o=>o.filter(x=>x.impedimento&&!x.conclusao).length,'#B91C1C')}
    ${kpiSplit('Pendências Ativas',r=>r.filter(x=>x.pendencia&&!x.pendenciaResolvida).length,o=>o.filter(x=>x.pendencia&&!x.pendenciaResolvida).length,'#F97316')}
    ${kpiCard('Ag. Conf. Pend.',list.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData).length,'fiscal conferir','#F59E0B')}
    ${kpiCard('Cadastro Pendente',list.filter(o=>!o.cancelado&&!o.armazenado&&((o.fiscalizacao&&!o.dataCadastro)||(o.conclusao&&!o.fiscalizacao))).length,'sem registro de envio','#EF4444')}
    ${kpiCard('Encerradas',list.filter(o=>statusOf(o)==='Encerrada').length,'armazenadas','#16A34A')}
  </div>`;

  // Tabela resumo por fiscal
  // Obras pendentes de envio para cadastro — mesmos critérios do Genesis, agrupado por fiscal
  const obsCadUrg = list.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente');
  const gerPendCadFisc = list.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.dataCadastro);
  const gerPendCadConc = list.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.fiscalizacao);
  if(gerPendCadFisc.length || gerPendCadConc.length){
    const byFiscalPend={};
    [...gerPendCadFisc,...gerPendCadConc].forEach(o=>{ const f=o.fiscal||'Sem Fiscal'; if(!byFiscalPend[f]) byFiscalPend[f]={fisc:[],conc:[]}; if(o.fiscalizacao&&!o.dataCadastro) byFiscalPend[f].fisc.push(o); else byFiscalPend[f].conc.push(o); });
    html+=`<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#EF4444;margin-bottom:10px">📋 Envio para Cadastro Pendente — ${gerPendCadFisc.length+gerPendCadConc.length} obra(s)${obsCadUrg.length?` <span style="font-size:11px;font-weight:600;color:#F97316">(${obsCadUrg.length} urgentes 🚨)</span>`:''}</div>
      ${Object.entries(byFiscalPend).sort((a,b)=>(b[1].fisc.length+b[1].conc.length)-(a[1].fisc.length+a[1].conc.length)).map(([fisc,grp])=>`
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;margin-bottom:4px">👤 ${fisc} — ${grp.fisc.length+grp.conc.length} obra(s)${(grp.fisc.filter(o=>obsCadUrg.some(u=>u.id===o.id)).length+grp.conc.filter(o=>obsCadUrg.some(u=>u.id===o.id)).length)?` <span style="color:#F97316;font-size:10px">(${grp.fisc.filter(o=>obsCadUrg.some(u=>u.id===o.id)).length+grp.conc.filter(o=>obsCadUrg.some(u=>u.id===o.id)).length} urgentes)</span>`:''}</div>
          ${grp.fisc.length?`<div style="font-size:10px;color:var(--muted);margin-bottom:3px">Fiscalizadas sem cadastro: <span style="display:inline-flex;flex-wrap:wrap;gap:3px">${grp.fisc.map(o=>{const urg=obsCadUrg.some(u=>u.id===o.id);return`<span style="background:var(--surface);border:1px solid rgba(239,68,68,${urg?'.7':'.3'});border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;color:${urg?'#EF4444':'inherit'}" onclick="openObraModal('${o.id}')" title="${o.cidade||''} · Fisc: ${fmtTxt(o.fiscalizacao)}${urg?' ⚠️ urgente':''}">${o.numero}${urg?' 🚨':''}</span>`;}).join('')}</span></div>`:''}
          ${grp.conc.length?`<div style="font-size:10px;color:var(--muted)">Concluídas sem fiscalizar: <span style="display:inline-flex;flex-wrap:wrap;gap:3px">${grp.conc.map(o=>{const urg=obsCadUrg.some(u=>u.id===o.id);return`<span style="background:var(--surface);border:1px solid rgba(249,115,22,${urg?'.7':'.3'});border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;color:${urg?'#F97316':'inherit'}" onclick="openObraModal('${o.id}')" title="${o.cidade||''} · Conc: ${fmtTxt(o.conclusao)}${urg?' ⚠️ urgente':''}">${o.numero}${urg?' 🚨':''}</span>`;}).join('')}</span></div>`:''}
        </div>`).join('')}
    </div>`;
  }
  // ── Pendências Genesis (cadastroPendencia) agrupadas por fiscal ────────
  const genPendGer = list.filter(o=>o.cadastroPendencia && !o.cadastroConfirmado && !o.cancelado);
  if(genPendGer.length){
    const byFiscalGen={};
    genPendGer.forEach(o=>{ const f=o.fiscal||'Sem Fiscal'; if(!byFiscalGen[f]) byFiscalGen[f]=[]; byFiscalGen[f].push(o); });
    html+=`<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#8B5CF6;margin-bottom:10px">📋 Pendências Genesis — ${genPendGer.length} obra(s) com pendência de cadastro</div>
      ${Object.entries(byFiscalGen).map(([fisc,obs])=>`
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;margin-bottom:5px;color:var(--text)">👤 ${fisc} — ${obs.length} obra(s)</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="color:var(--muted)">
              <th style="text-align:left;padding:3px 8px;font-weight:600">Obra</th>
              <th style="text-align:left;padding:3px 8px;font-weight:600">Cidade</th>
              <th style="text-align:left;padding:3px 8px;font-weight:600">Pendência</th>
            </tr></thead>
            <tbody>
              ${obs.map(o=>`<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="openObraModal('${o.id}')">
                <td style="padding:3px 8px;font-weight:700">${o.numero}</td>
                <td style="padding:3px 8px">${o.cidade||'—'}</td>
                <td style="padding:3px 8px;color:#8B5CF6">${o.cadastroPendenciaDesc||'Pendência cadastro'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
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
  // ODI obras have their own monitor in pgDashOdi
  // ── Cards Ag. Fiscalização / Medição / Med.280 — todos os fiscais ──────────
  const _gAtivas = list.filter(o=>!o.cancelado&&!o.armazenado&&o.tipo!=='ODI');
  const _fimMesG = new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().split('T')[0];
  const _gAgFisc = _gAtivas.filter(o=>o.conclusao&&!o.fiscalizacao);
  const _gAgMed  = _gAtivas.filter(o=>o.conclusao&&(o.kaffaEntries||[]).some(k=>k.tipo==='final')&&!temMedicaoFinal(o));
  const _gMed280 = _gAtivas.filter(o=>{
    if(!o.conclusao||!o.kaffa||!o.medida230||o.medida280||temMedicaoFinal(o)) return false;
    const _p=prazoMedida280(o); return _p&&_p<=_fimMesG;
  });
  if(_gAgFisc.length||_gAgMed.length||_gMed280.length){
    function _gCardList(lista,cor){
      return lista.length===0?'<span style="font-size:10px;color:var(--muted)">Nenhuma. ✓</span>':
        lista.slice(0,24).map(o=>`<span onclick="openObraModal('${o.id}')" style="font-size:10px;cursor:pointer;padding:1px 6px;border-radius:4px;border:1px solid ${cor}44;background:${cor}11;white-space:nowrap" title="${o.fiscal||'—'} · ${o.cidade||'—'}">${o.numero}</span>`).join(' ')
        +(lista.length>24?`<span style="font-size:9px;color:var(--muted)"> +${lista.length-24}</span>`:'');
    }
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:20px">
      <div style="font-weight:800;font-size:14px;margin-bottom:12px">📋 Situação Geral — Todos os Fiscais</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
        <div style="background:var(--surface2);border-radius:8px;padding:10px">
          <div style="font-size:10px;font-weight:700;color:#EAB308;margin-bottom:6px">⏳ Ag. Fiscalização (${_gAgFisc.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${_gCardList(_gAgFisc,'#EAB308')}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px">
          <div style="font-size:10px;font-weight:700;color:#6366F1;margin-bottom:6px">📐 Ag. Medição — Kaffa OK (${_gAgMed.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${_gCardList(_gAgMed,'#6366F1')}</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:10px">
          <div style="font-size:10px;font-weight:700;color:#EF4444;margin-bottom:6px">🔴 Med.280 — Fechar Este Mês + Atrasadas (${_gMed280.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${_gCardList(_gMed280,'#EF4444')}</div>
        </div>
      </div>
    </div>`;
  }

  html += renderMonitorPrazos(list.filter(o=>o.tipo!=='ODI'));
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
    const paraMedir = minhas.filter(o=>o.conclusao&&(o.kaffaEntries||[]).some(k=>k.tipo==='final')&&!temMedicaoFinal(o)).length;
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

window._velociTableFiscal = function(minhas){
  const minhasRD  = minhas.filter(o=>o.tipo!=='ODI');
  const minhasODI = minhas.filter(o=>o.tipo==='ODI');
  const tFiscRD   = avgDiff(minhasRD,'conclusao','fiscalizacao');
  const tFiscODI  = avgDiff(minhasODI,'conclusao','fiscalizacao');
  const tKaffaODI = avgDiff(minhasODI,'fiscalizacao','kaffaODI');
  const tMedRD    = avgDiffKaffaMedicao(minhasRD);
  const tCadRD    = avgDiff(minhasRD,'fiscalizacao','dataCadastro');
  const tCadODI   = avgDiff(minhasODI,'fiscalizacao','dataCadastro');
  const fmt = v => v!==null ? '<strong>'+v+'d</strong>' : '<span style="color:var(--muted)">—</span>';
  const row = (label,rd,odi,ref) =>
    '<tr style="border-bottom:1px solid var(--border)">'
    +'<td style="padding:6px 10px">'+label+'</td>'
    +'<td style="padding:6px 10px;text-align:center">'+rd+'</td>'
    +'<td style="padding:6px 10px;text-align:center">'+odi+'</td>'
    +'<td style="padding:6px 10px;font-size:9px;color:var(--muted)">'+ref+'</td>'
    +'</tr>';
  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px">'
    +'<div style="font-weight:800;font-size:13px;margin-bottom:10px">⚡ Velocidades por Tipo de Obra</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:11px">'
    +'<thead><tr style="background:var(--surface2)">'
    +'<th style="padding:6px 10px;text-align:left">Indicador</th>'
    +'<th style="padding:6px 10px;text-align:center">🔵 RD</th>'
    +'<th style="padding:6px 10px;text-align:center">🟡 ODI</th>'
    +'<th style="padding:6px 10px;text-align:left;color:var(--muted);font-weight:400;font-size:9px">Referência</th>'
    +'</tr></thead><tbody>'
    +row('⏱ Tempo médio de Fiscalização', fmt(tFiscRD), fmt(tFiscODI), 'Conclusão → Fiscalização')
    +row('⏱ Tempo médio de Kaffa <span style="font-size:9px;color:var(--muted)">(ODI)</span>',
         '<span style="color:var(--muted)">—</span>', fmt(tKaffaODI), 'Fiscalização → Kaffa ODI')
    +row('⏱ Tempo médio de Medição <span style="font-size:9px;color:var(--muted)">(RD)</span>',
         fmt(tMedRD), '<span style="color:var(--muted)">—</span>', 'Kaffa → Medição')
    +row('⏱ Fiscalização → Cadastro', fmt(tCadRD), fmt(tCadODI), 'Fiscalização → Encaminhado Cadastro')
    +'</tbody></table></div>';
};

function renderDashFiscal(list, meuNome){
  const minhas = list.filter(o=>o.fiscal===meuNome);
  const uscTotal = minhas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
  const ulvTotal = minhas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
  const comPend = minhas.filter(o=>o.tipo!=='ODI'&&o.pendencia&&!o.pendenciaResolvida);
  const agConfPend = minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData);
  const paraFisc = list.filter(o=>o.tipo!=='ODI'&&o.conclusao&&!o.fiscalizacao&&o.fiscal===meuNome);
  const paraFiscODI = list.filter(o=>o.tipo==='ODI'&&o.conclusao&&!o.fiscalizacao&&o.fiscal===meuNome);
  const paraMedir = list.filter(o=>o.tipo!=='ODI'&&o.conclusao&&(o.kaffaEntries||[]).some(k=>k.tipo==='final')&&!temMedicaoFinal(o)&&o.fiscal===meuNome);
  const cadUrgente = minhas.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente');
  const cadUrgFisc = cadUrgente.filter(o=> o.fiscalizacao && !o.dataCadastro); // fiscalizada +7d sem cadastro
  const cadUrgConc = cadUrgente.filter(o=>!o.fiscalizacao && o.conclusao);      // concluída +15d sem fiscalizar
  // Todos os pendentes de cadastro — mesmos critérios do Genesis (sem limite de prazo)
  const pendCadFisc = minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.dataCadastro);
  const pendCadConc = minhas.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.fiscalizacao);
  const mesAtual = new Date().getMonth(), anoAtual = new Date().getFullYear();
  const fiscMes = minhas.filter(o=>{ if(!o.fiscalizacao) return false; const d=new Date(o.fiscalizacao+'T00:00:00'); return d.getMonth()===mesAtual&&d.getFullYear()===anoAtual; });
  const tempoFisc = avgDiff(minhas,'conclusao','fiscalizacao');
  const tempoMed = avgDiffKaffaMedicao(minhas); // pareia kaffa parcial/final com medição parcial/final
  const tempoCad = avgDiff(minhas,'fiscalizacao','dataCadastro');
  let html = `<div class="kpi-strip">
    ${kpiCard('Obras',minhas.length,'RD: '+(minhas.filter(o=>o.tipo!=='ODI').length)+' · ODI: '+(minhas.filter(o=>o.tipo==='ODI').length),'#00e5a0')}
    ${kpiCard('USC Total',uscTotal.toFixed(1),'unidades','#7c6af7')}
    ${kpiCard('ULV Total',ulvTotal.toFixed(1),'unidades','#ff6b35')}
    ${kpiCard('Para Fiscalizar',paraFisc.length+paraFiscODI.length,'RD: '+paraFisc.length+' · ODI: '+paraFiscODI.length,'#EAB308')}
    ${kpiCard('Para Medir',paraMedir.length,'kaffa sem medição (RD)','#6366F1')}
    ${kpiCard('Pendências Ativas',comPend.length,'não resolvidas','#F97316')}
    ${kpiCard('Ag. Conf. Pend.',agConfPend.length,'regularizadas p/ conferir','#F59E0B')}
    ${kpiCard('Cadastro Pendente',pendCadFisc.length+pendCadConc.length,'sem registro de envio','#EF4444')}
    ${kpiCard('Fiscalizadas/Mês',fiscMes.length,'mês corrente','#38bdf8')}
  </div>
  <!-- ── Velocidades por tipo ────────────────────────────────────────── -->
  ${window._velociTableFiscal(minhas)}`;
  // Obras pendentes de envio para cadastro — mesmos critérios do Genesis
  if(pendCadFisc.length || pendCadConc.length){
    html += `<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#EF4444;margin-bottom:10px">📋 Envio para Cadastro Pendente — ${pendCadFisc.length+pendCadConc.length} obra(s)${cadUrgente.length?` <span style="font-size:11px;font-weight:600;color:#F97316">(${cadUrgente.length} urgentes 🚨)</span>`:''}
      </div>
      ${pendCadFisc.length ? `<div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#EF4444;margin-bottom:5px">📋 Fiscalizadas sem encaminhar cadastro (${pendCadFisc.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${pendCadFisc.map(o=>{const urg=cadUrgFisc.some(u=>u.id===o.id);return `<span style="background:var(--surface);border:1px solid rgba(239,68,68,${urg?'.7':'.3'});border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;color:${urg?'#EF4444':'inherit'}" onclick="openObraModal('${o.id}')" title="${o.cidade||''} · Fisc: ${fmtTxt(o.fiscalizacao)}${urg?' ⚠️ urgente':''}">${o.numero}${urg?' 🚨':''}</span>`;}).join('')}
        </div>
      </div>` : ''}
      ${pendCadConc.length ? `<div>
        <div style="font-size:10px;font-weight:700;color:#F97316;margin-bottom:5px">⏳ Concluídas sem fiscalizar (${pendCadConc.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${pendCadConc.map(o=>{const urg=cadUrgConc.some(u=>u.id===o.id);return `<span style="background:var(--surface);border:1px solid rgba(249,115,22,${urg?'.7':'.3'});border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;color:${urg?'#F97316':'inherit'}" onclick="openObraModal('${o.id}')" title="${o.cidade||''} · Conc: ${fmtTxt(o.conclusao)}${urg?' ⚠️ urgente':''}">${o.numero}${urg?' 🚨':''}</span>`;}).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }
  // ── Pendências Genesis (cadastroPendencia) ─────────────────────────────
  const genPendFisc = minhas.filter(o=>o.cadastroPendencia && !o.cadastroConfirmado && !o.cancelado);
  if(genPendFisc.length){
    html += `<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-weight:800;font-size:13px;color:#8B5CF6;margin-bottom:10px">📋 Pendências Genesis — ${genPendFisc.length} obra(s)</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="color:var(--muted)">
          <th style="text-align:left;padding:4px 8px;font-weight:600">Obra</th>
          <th style="text-align:left;padding:4px 8px;font-weight:600">Cidade</th>
          <th style="text-align:left;padding:4px 8px;font-weight:600">Pendência</th>
        </tr></thead>
        <tbody>
          ${genPendFisc.map(o=>`<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="openObraModal('${o.id}')">
            <td style="padding:4px 8px;font-weight:700">${o.numero}</td>
            <td style="padding:4px 8px">${o.cidade||'—'}</td>
            <td style="padding:4px 8px;color:#8B5CF6">${o.cadastroPendenciaDesc||'Pendência cadastro'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
  // Monitor de prazos: exclude ODI obras for fiscal (ODI monitor is in pgDashOdi for adm_odi/gerente)
  html += renderMonitorPrazos(minhas.filter(o=>o.tipo!=='ODI'));
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
  const comPend = minhas.filter(o=>o.tipo!=='ODI'&&o.pendencia&&!o.pendenciaResolvida);
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
function renderGenesisTable(aguardando){
  const hoje_s = hojeStr();
  if(!aguardando.length){
    return '<div class="empty" style="padding:24px"><div class="ico">✅</div><p>Nenhuma obra aguardando confirmação de cadastro.</p></div>';
  }
  const rows = [...aguardando].sort((a,b)=>{
    // obras com pendência primeiro
    if(a.cadastroPendencia && !b.cadastroPendencia) return -1;
    if(!a.cadastroPendencia && b.cadastroPendencia) return 1;
    return a.dataCadastro > b.dataCadastro ? 1 : -1;
  }).map(o=>{
    const diasAg = diff(o.dataCadastro, hoje_s);
    const corDias = diasAg===null?'var(--muted)':diasAg>30?'var(--red)':diasAg>15?'var(--yellow)':'var(--text)';
    const badgePend = o.cadastroPendencia
      ? `<span title="${o.cadastroPendenciaDesc||'Pendência registrada'}" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;color:#EF4444;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:4px;padding:1px 5px;margin-left:4px;cursor:help">⚠️ Pendência</span>`
      : '';
    const trStyle = o.cadastroPendencia ? 'background:rgba(239,68,68,.04)' : '';
    return `<tr style="${trStyle}">
      <td><strong style="color:var(--accent)">${o.numero||'—'}</strong>${badgePend}</td>
      <td>${o.cidade||'—'}</td>
      <td>${o.fiscal||'—'}</td>
      <td>${fmt(o.dataCadastro)}</td>
      <td style="color:${corDias};font-weight:600">${diasAg!==null?diasAg+'d':'—'}</td>
      <td><button class="btn btn-primary btn-sm" onclick="openObraModal('${o.id}')">${o.cadastroPendencia?'Ver Pendência':'Confirmar Cadastro'}</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Nº Obra</th><th>Cidade</th><th>Fiscal</th><th>Enviado em</th><th>Dias Aguardando</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
// Tabela parcial confirmado (reutilizada na renderização e no filtro dinâmico)
function renderGenesisParcialTableInner(obras){
  if(!obras.length) return '<div class="empty" style="padding:12px"><div class="ico" style="font-size:14px">ℹ️</div><p style="font-size:11px">Nenhuma obra corresponde ao filtro.</p></div>';
  return `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Nº Obra</th><th>Tipo</th><th>Cidade</th><th>Fiscal</th><th>Data Parcial Conf.</th>
      <th style="text-align:center">Med.230</th><th style="text-align:center">Med.280</th><th></th>
    </tr></thead>
    <tbody>${obras.map(o=>`<tr>
      <td><strong style="color:#8B5CF6">${o.numero||'—'}</strong></td>
      <td>${o.tipo?`<span class="chip">${o.tipo}</span>`:'—'}</td>
      <td>${o.cidade||'—'}</td>
      <td>${o.fiscal||'—'}</td>
      <td style="color:#8B5CF6">${fmtTxt(o.dataCadastroParcialConfirmado)||'—'}</td>
      <td style="text-align:center;font-size:11px;${o.medida230?'color:#22C55E;font-weight:700':'color:var(--muted)'}">${o.medida230?fmtTxt(o.medida230):'—'}</td>
      <td style="text-align:center;font-size:11px;${o.medida280?'color:#22C55E;font-weight:700':'color:var(--muted)'}">${o.medida280?fmtTxt(o.medida280):'—'}</td>
      <td><button class="btn btn-sm" onclick="openObraModal('${o.id}')" style="background:rgba(139,92,246,.15);color:#8B5CF6;border:1px solid rgba(139,92,246,.35)">Ver Obra</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}
// Tabela: fiscalizadas mas sem dataCadastro (independente do tempo)
function renderPendCadFiscTable(obras){
  const hoje_s = hojeStr();
  if(!obras.length) return '<div class="empty" style="padding:12px"><div class="ico" style="font-size:14px">✅</div><p style="font-size:11px">Nenhuma obra pendente.</p></div>';
  return `<div class="tbl-wrap"><table style="font-size:10px">
    <thead><tr style="background:var(--surface2)">
      <th style="padding:4px 8px;text-align:left">Nº</th>
      <th style="padding:4px 8px;text-align:left">Tipo</th>
      <th style="padding:4px 8px;text-align:left">Fiscal</th>
      <th style="padding:4px 8px;text-align:left">Cidade</th>
      <th style="padding:4px 8px;text-align:center">Fiscalizado</th>
      <th style="padding:4px 8px;text-align:center">Dias s/ Cadastro</th>
      <th style="padding:4px 8px"></th>
    </tr></thead>
    <tbody>${obras.sort((a,b)=>a.fiscalizacao>b.fiscalizacao?1:-1).map(o=>{
      const d=diff(o.fiscalizacao,hoje_s);
      const urg=d!==null&&d>7;
      const cor=urg?'#EF4444':d!==null&&d>3?'#F97316':'var(--text)';
      return `<tr style="border-bottom:1px solid var(--border);cursor:pointer${urg?';background:rgba(239,68,68,.04)':''}" onclick="openObraModal('${o.id}')">
        <td style="padding:4px 8px;font-weight:700;color:var(--accent)">${o.numero||'—'}</td>
        <td style="padding:4px 8px">${o.tipo?`<span class="chip" style="font-size:9px">${o.tipo}</span>`:'—'}</td>
        <td style="padding:4px 8px">${o.fiscal||'—'}</td>
        <td style="padding:4px 8px">${o.cidade||'—'}</td>
        <td style="padding:4px 8px;text-align:center">${fmt(o.fiscalizacao)}</td>
        <td style="padding:4px 8px;text-align:center;color:${cor};font-weight:${urg?700:400}">${d!==null?d+'d':'—'}${urg?' ⚠️':''}</td>
        <td style="padding:4px 8px"><button class="btn btn-sm" style="font-size:9px;padding:2px 6px" onclick="event.stopPropagation();openObraModal('${o.id}')">Abrir</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
// Tabela: concluídas sem fiscalização (independente do tempo)
function renderPendCadConcTable(obras){
  const hoje_s = hojeStr();
  if(!obras.length) return '<div class="empty" style="padding:12px"><div class="ico" style="font-size:14px">✅</div><p style="font-size:11px">Nenhuma obra pendente.</p></div>';
  return `<div class="tbl-wrap"><table style="font-size:10px">
    <thead><tr style="background:var(--surface2)">
      <th style="padding:4px 8px;text-align:left">Nº</th>
      <th style="padding:4px 8px;text-align:left">Tipo</th>
      <th style="padding:4px 8px;text-align:left">Fiscal</th>
      <th style="padding:4px 8px;text-align:left">Cidade</th>
      <th style="padding:4px 8px;text-align:center">Concluída</th>
      <th style="padding:4px 8px;text-align:center">Dias s/ Fiscalização</th>
      <th style="padding:4px 8px"></th>
    </tr></thead>
    <tbody>${obras.sort((a,b)=>a.conclusao>b.conclusao?1:-1).map(o=>{
      const d=diff(o.conclusao,hoje_s);
      const urg=d!==null&&d>15;
      const cor=urg?'#EF4444':d!==null&&d>7?'#F97316':'var(--text)';
      return `<tr style="border-bottom:1px solid var(--border);cursor:pointer${urg?';background:rgba(239,68,68,.04)':''}" onclick="openObraModal('${o.id}')">
        <td style="padding:4px 8px;font-weight:700;color:var(--accent)">${o.numero||'—'}</td>
        <td style="padding:4px 8px">${o.tipo?`<span class="chip" style="font-size:9px">${o.tipo}</span>`:'—'}</td>
        <td style="padding:4px 8px">${o.fiscal||'—'}</td>
        <td style="padding:4px 8px">${o.cidade||'—'}</td>
        <td style="padding:4px 8px;text-align:center">${fmt(o.conclusao)}</td>
        <td style="padding:4px 8px;text-align:center;color:${cor};font-weight:${urg?700:400}">${d!==null?d+'d':'—'}${urg?' ⚠️':''}</td>
        <td style="padding:4px 8px"><button class="btn btn-sm" style="font-size:9px;padding:2px 6px" onclick="event.stopPropagation();openObraModal('${o.id}')">Abrir</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderDashGenesis(list){
  // Aguardando: tem dataCadastro, não confirmado E não tem parcial já confirmado
  const aguardando = list.filter(o => o.dataCadastro && !o.cadastroConfirmado && !o.cadastroParcialConfirmado && !o.cancelado);
  const aguardandoRD  = aguardando.filter(o => o.tipo !== 'ODI');
  const aguardandoODI = aguardando.filter(o => o.tipo === 'ODI');
  window._genesisAguardandoAll = {rd: aguardandoRD, odi: aguardandoODI};
  // Obras com cadastro parcial confirmado aguardando envio de cadastro final pelo fiscal
  // (inclui obras com ou sem dataCadastro — sai quando tiver cadastroConfirmado final)
  const parcialConfirmado = list.filter(o => o.cadastroParcialConfirmado && !o.cadastroConfirmado && !o.cancelado);
  window._genesisParcialAll = parcialConfirmado; // armazena para filtro dinâmico
  const confirmados = list.filter(o => o.cadastroConfirmado);
  const comPendencia = aguardando.filter(o => o.cadastroPendencia);
  const hoje_s = hojeStr();
  // Pré-calcular pendentes de encaminhar (para incluir nos fiscais do filtro)
  const genCadPendFisc = list.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.dataCadastro);
  const genCadPendConc = list.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.fiscalizacao);
  window._genesisPendAll = {fisc: genCadPendFisc, conc: genCadPendConc};
  // Avg time: dataCadastro → dataCadastroConfirmado (ciclo completo)
  const tempos = confirmados.filter(o=>o.dataCadastro&&o.dataCadastroConfirmado).map(o=>diff(o.dataCadastro,o.dataCadastroConfirmado));
  const avgTempo = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;
  // Avg time parcial: dataCadastro → dataCadastroParcialConfirmado
  const temposParcial = list.filter(o=>o.dataCadastro&&o.dataCadastroParcialConfirmado).map(o=>diff(o.dataCadastro,o.dataCadastroParcialConfirmado));
  const avgTempoParcial = temposParcial.length ? Math.round(temposParcial.reduce((a,b)=>a+b,0)/temposParcial.length) : null;
  // Avg time final: dataCadastroParcialConfirmado → dataCadastroConfirmado
  const temposFinal = confirmados.filter(o=>o.dataCadastroParcialConfirmado&&o.dataCadastroConfirmado).map(o=>diff(o.dataCadastroParcialConfirmado,o.dataCadastroConfirmado));
  const avgTempoFinal = temposFinal.length ? Math.round(temposFinal.reduce((a,b)=>a+b,0)/temposFinal.length) : null;
  const totalPend = genCadPendFisc.length+genCadPendConc.length;
  let html = `<div class="kpi-strip">
    ${kpiCard('Aguardando RD',aguardandoRD.length,'obras RD sem confirmar','#F59E0B')}
    ${kpiCard('Aguardando ODI',aguardandoODI.length,'obras ODI sem confirmar','#F97316')}
    ${kpiCard('Com Pendência',comPendencia.length,comPendencia.length>0?'⚠️ verificar':'sem pendências registradas',comPendencia.length>0?'#EF4444':'#22C55E')}
    ${kpiCard('Cadastros Confirmados',confirmados.length,'já confirmados','#22C55E')}
    ${kpiCard('Pend. Encaminhar Cad.',totalPend,totalPend>0?'⚠️ sem dataCadastro':'em dia',totalPend>0?'#EF4444':'#22C55E')}
    ${kpiCard('Tempo Médio (ciclo)',avgTempo!==null?avgTempo+'d':'—','envio → confirmação final','#06B6D4')}
    ${kpiCard('Tempo Médio Parcial',avgTempoParcial!==null?avgTempoParcial+'d':'—','envio → conf. parcial','#8B5CF6')}
    ${kpiCard('Tempo Médio Final',avgTempoFinal!==null?avgTempoFinal+'d':'—','conf. parcial → conf. final','#EC4899')}
  </div>`;
  html += '<div class="sect-title" style="margin-bottom:10px">Monitor — Obras Aguardando Confirmação de Cadastro</div>';
  // Filtros: número + fiscal + tipo (cobre todas as tabelas da seção genesis)
  const fiscais = [...new Set([...aguardando,...parcialConfirmado,...genCadPendFisc,...genCadPendConc].map(o=>o.fiscal).filter(Boolean))].sort();
  html += `<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input type="text" id="fltGenesisNumero" placeholder="Filtrar por nº obra…"
      style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;width:180px"
      oninput="applyGenesisFilter()">
    <select id="fltGenesisTipo" onchange="applyGenesisFilter()"
      style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px">
      <option value="">Todos os tipos</option>
      <option value="RD">RD</option>
      <option value="ODI">ODI</option>
    </select>
    <select id="fltGenesisFiscal" onchange="applyGenesisFilter()"
      style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px">
      <option value="">Todos os fiscais</option>
      ${fiscais.map(f=>`<option value="${f}">${f}</option>`).join('')}
    </select>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
    <div>
      <div style="font-weight:700;font-size:12px;letter-spacing:.4px;color:var(--accent);margin-bottom:8px;padding:6px 10px;background:rgba(0,229,160,.06);border-radius:6px">
        🔵 Obras RD — ${aguardandoRD.length} aguardando
      </div>
      <div id="genesisTableContainerRD">${renderGenesisTable(aguardandoRD)}</div>
    </div>
    <div>
      <div style="font-weight:700;font-size:12px;letter-spacing:.4px;color:#F59E0B;margin-bottom:8px;padding:6px 10px;background:rgba(245,158,11,.06);border-radius:6px">
        🟡 Obras ODI — ${aguardandoODI.length} aguardando
      </div>
      <div id="genesisTableContainerODI">${renderGenesisTable(aguardandoODI)}</div>
    </div>
  </div>`;
  // ── Seção: obras com cadastro parcial confirmado aguardando envio final ──
  if(parcialConfirmado.length){
    html += `<div class="sect-title" style="margin-top:20px;margin-bottom:10px;color:#8B5CF6">
      📋 Cadastro Parcial Confirmado — Aguardando Envio de Cadastro Final pelo Fiscal (${parcialConfirmado.length})
    </div>
    <div id="genesisTableContainerParcial">
      ${renderGenesisParcialTableInner(parcialConfirmado)}
    </div>`;
  }
  // ── Seção: Controle de Obras a Encaminhar para Cadastro ──────────────
  // Usa os arrays pré-calculados (genCadPendFisc / genCadPendConc)
  // NÃO depende de statusOf — cobre TODAS as obras sem dataCadastro
  if(genCadPendFisc.length || genCadPendConc.length){
    html += `<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;margin-bottom:16px;margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div style="font-weight:800;font-size:13px;color:#EF4444">
          📋 Controle — Obras a Encaminhar para Cadastro (${genCadPendFisc.length+genCadPendConc.length} total)
        </div>
        <div style="font-size:10px;color:var(--muted)">Use os filtros acima para pesquisar por fiscal, tipo ou nº</div>
      </div>
      ${genCadPendFisc.length ? `<div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;color:#EF4444;margin-bottom:6px">
          📋 Fiscalizadas sem encaminhar para cadastro (${genCadPendFisc.length} obras)
          <span style="font-weight:400;color:var(--muted);margin-left:6px">— ⚠️ vermelho = passou de 7 dias</span>
        </div>
        <div id="genesisPendCadFiscContainer">${renderPendCadFiscTable(genCadPendFisc)}</div>
      </div>` : ''}
      ${genCadPendConc.length ? `<div>
        <div style="font-size:10px;font-weight:700;color:#F97316;margin-bottom:6px">
          ⏳ Concluídas sem fiscalização (${genCadPendConc.length} obras)
          <span style="font-weight:400;color:var(--muted);margin-left:6px">— ⚠️ vermelho = passou de 15 dias</span>
        </div>
        <div id="genesisPendCadConcContainer">${renderPendCadConcTable(genCadPendConc)}</div>
      </div>` : ''}
    </div>`;
  }

  return html;
}

window.applyGenesisFilter = function(){
  const num  = (document.getElementById('fltGenesisNumero')?.value||'').trim().toLowerCase();
  const fis  = document.getElementById('fltGenesisFiscal')?.value||'';
  const tipo = document.getElementById('fltGenesisTipo')?.value||'';
  const all  = window._genesisAguardandoAll || {rd:[],odi:[]};

  // ── Aguardando confirmação (RD / ODI) ─────────────────────────────────
  let filteredRD  = (all.rd||[]).slice();
  let filteredODI = (all.odi||[]).slice();
  if(num){
    filteredRD  = filteredRD.filter(o=>(o.numero||'').toLowerCase().includes(num));
    filteredODI = filteredODI.filter(o=>(o.numero||'').toLowerCase().includes(num));
  }
  if(fis){
    filteredRD  = filteredRD.filter(o=>o.fiscal===fis);
    filteredODI = filteredODI.filter(o=>o.fiscal===fis);
  }
  // Tipo: esconde container inteiro quando filtrado
  const wrapRD  = document.getElementById('genesisTableContainerRD')?.parentElement;
  const wrapODI = document.getElementById('genesisTableContainerODI')?.parentElement;
  if(tipo==='ODI'){
    if(wrapRD)  wrapRD.style.display='none';
    if(wrapODI) wrapODI.style.display='';
  } else if(tipo==='RD'){
    if(wrapRD)  wrapRD.style.display='';
    if(wrapODI) wrapODI.style.display='none';
  } else {
    if(wrapRD)  wrapRD.style.display='';
    if(wrapODI) wrapODI.style.display='';
  }
  const contRD  = document.getElementById('genesisTableContainerRD');
  if(contRD  && tipo!=='ODI') contRD.innerHTML  = renderGenesisTable(filteredRD);
  const contODI = document.getElementById('genesisTableContainerODI');
  if(contODI && tipo!=='RD')  contODI.innerHTML = renderGenesisTable(filteredODI);

  // ── Cadastro parcial ───────────────────────────────────────────────────
  let filteredParcial = (window._genesisParcialAll||[]).slice();
  if(num)  filteredParcial = filteredParcial.filter(o=>(o.numero||'').toLowerCase().includes(num));
  if(fis)  filteredParcial = filteredParcial.filter(o=>o.fiscal===fis);
  if(tipo) filteredParcial = filteredParcial.filter(o=>tipo==='ODI'?o.tipo==='ODI':o.tipo!=='ODI');
  const contParcial = document.getElementById('genesisTableContainerParcial');
  if(contParcial) contParcial.innerHTML = renderGenesisParcialTableInner(filteredParcial);

  // ── Pendentes de encaminhar para cadastro ─────────────────────────────
  const pendAll = window._genesisPendAll || {fisc:[],conc:[]};
  let filteredFisc = pendAll.fisc.slice();
  let filteredConc = pendAll.conc.slice();
  if(num){
    filteredFisc = filteredFisc.filter(o=>(o.numero||'').toLowerCase().includes(num));
    filteredConc = filteredConc.filter(o=>(o.numero||'').toLowerCase().includes(num));
  }
  if(fis){
    filteredFisc = filteredFisc.filter(o=>o.fiscal===fis);
    filteredConc = filteredConc.filter(o=>o.fiscal===fis);
  }
  if(tipo){
    filteredFisc = filteredFisc.filter(o=>tipo==='ODI'?o.tipo==='ODI':o.tipo!=='ODI');
    filteredConc = filteredConc.filter(o=>tipo==='ODI'?o.tipo==='ODI':o.tipo!=='ODI');
  }
  const contPendFisc = document.getElementById('genesisPendCadFiscContainer');
  if(contPendFisc) contPendFisc.innerHTML = renderPendCadFiscTable(filteredFisc);
  const contPendConc = document.getElementById('genesisPendCadConcContainer');
  if(contPendConc) contPendConc.innerHTML = renderPendCadConcTable(filteredConc);
};

// ── DASHBOARD ESTAGIÁRIO ───────────────────────────────────────────────
function renderDashEstagiario(list){
  // Separar RD e ODI — APENAS obras com Med.280 registrada entram no monitor de armazenamento
  const semArmRD  = list.filter(o => o.tipo !== 'ODI' && o.medida280 && !o.armazenado && !o.cancelado);
  const semArmODI = list.filter(o => o.tipo === 'ODI' && o.medida280 && !o.armazenado && !o.cancelado);
  const semArm    = [...semArmRD, ...semArmODI];
  const armOk     = list.filter(o => o.armazenado);

  // Obras com Med.230 mas sem Med.280 — preparação antecipada (verificar contratos, etc.)
  const prep230RD  = list.filter(o => o.tipo !== 'ODI' && o.medida230 && !o.medida280 && !o.armazenado && !o.cancelado);
  const prep230ODI = list.filter(o => o.tipo === 'ODI' && o.medida230 && !o.medida280 && !o.armazenado && !o.cancelado);
  const prep230    = [...prep230RD, ...prep230ODI];

  // KPI tempo médio de armazenamento: dias entre medida280 e armazenamentoData
  const armComKpi = armOk.filter(o => o.medida280 && o.armazenamentoData);
  function calcDiasArm(o){
    if(!o.medida280 || !o.armazenamentoData) return null;
    const d1=new Date(o.medida280+'T00:00:00'), d2=new Date(o.armazenamentoData+'T00:00:00');
    const d=Math.round((d2-d1)/(1000*60*60*24)); return d>=0?d:null;
  }
  const diasArm = armComKpi.map(calcDiasArm).filter(v=>v!==null);
  const mediaArm = diasArm.length ? Math.round(diasArm.reduce((a,b)=>a+b,0)/diasArm.length) : null;
  const maxArm   = diasArm.length ? Math.max(...diasArm) : null;
  const minArm   = diasArm.length ? Math.min(...diasArm) : null;

  let html = `<div class="kpi-strip">
    ${kpiCard('Aguard. Armazenar',semArm.length,'total com Med.280','#F59E0B')}
    ${kpiCard('Armazenadas',armOk.length,'concluídas','#22C55E')}
    ${kpiCard('RD pendentes',semArmRD.length,'obras RD','#F59E0B')}
    ${kpiCard('ODI pendentes',semArmODI.length,'obras ODI','#8B5CF6')}
    ${kpiCard('Preparar (230 s/280)',prep230.length,'aguardando med.280','#3B82F6')}
    ${kpiCard('Sem Cadastro Genesis',list.filter(o=>o.medida280&&!o.armazenado&&!o.cancelado&&!o.cadastroConfirmado).length,'aguardando confirmação','#EF4444')}
  </div>`;

  // ── KPI Tempo de Armazenamento ──
  html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:16px">
    <div style="font-weight:800;font-size:13px;margin-bottom:10px">⏱️ KPI — Tempo de Confirmação de Armazenamento</div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:10px">
      Período medido: entrada da <strong>Medida 280</strong> até confirmação do armazenamento.
      Base: ${diasArm.length} obra(s) já armazenada(s) com dados completos.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
      <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:${mediaArm!==null?(mediaArm<=30?'#22C55E':mediaArm<=60?'#F59E0B':'#EF4444'):'var(--muted)'}">
          ${mediaArm!==null ? mediaArm+'d' : '—'}
        </div>
        <div style="font-size:9px;color:var(--muted)">Média (dias)</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:#EF4444">${maxArm!==null?maxArm+'d':'—'}</div>
        <div style="font-size:9px;color:var(--muted)">Máximo (dias)</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:#22C55E">${minArm!==null?minArm+'d':'—'}</div>
        <div style="font-size:9px;color:var(--muted)">Mínimo (dias)</div>
      </div>
      <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:#3B82F6">${semArm.length}</div>
        <div style="font-size:9px;color:var(--muted)">Aguardando agora</div>
      </div>
    </div>
    ${diasArm.length===0?'<div style="font-size:10px;color:var(--muted);margin-top:8px">ℹ️ KPI disponível após primeiras confirmações com Med.280 registrada.</div>':''}
  </div>`;

  // ── Tabela helper — obras aguardando armazenamento ──
  function tblArmazenamento(obras, isODI){
    if(!obras.length) return '<div class="empty" style="padding:16px"><div class="ico" style="font-size:18px">✅</div><p style="font-size:12px">Nenhuma obra pendente.</p></div>';
    const rows = obras.map(o=>{
      const itens = [
        o.contratosAssinado?null:'Contratos',
        (!isODI && !o.medicoesAssinadas)?'Medições':null,
        o.projetosAsBuilt?null:'As-Built',
        o.caixaArmazenada?null:'Caixa',
        o.cadastroConfirmado?null:'Cadastro Genesis',
      ].filter(Boolean);
      const dataRef = isODI ? (o.dataAbertura||o.abertura||'—') : fmt(o.medida280);
      // Dias aguardando desde Med.280
      const diasEsp = !isODI && o.medida280 ? (()=>{
        const d=diff(o.medida280, new Date().toISOString().split('T')[0]);
        return d!==null ? `<span style="font-size:9px;color:${d>30?'#EF4444':'#F59E0B'}">${d}d</span>` : '';
      })() : '';
      return `<tr>
        <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
        <td>${o.cidade||'—'}</td>
        <td>${o.fiscal||'—'}</td>
        <td>${dataRef} ${diasEsp}</td>
        <td>${itens.length?`<span class="chip chip-red">${itens.join(', ')}</span>`:'<span class="chip chip-green">Pronto p/ confirmar</span>'}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openObraModal('${o.id}')">Armazenar</button></td>
      </tr>`;
    }).join('');
    const col4 = isODI ? 'Abertura' : 'Med.280';
    return `<div class="tbl-wrap"><table>
      <thead><tr><th>Nº Obra</th><th>Cidade</th><th>Fiscal</th><th>${col4}</th><th>Faltando</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  // Salvar listas para filtro reativo
  window._armRD = semArmRD; window._armODI = semArmODI;

  html += `<div style="display:flex;gap:10px;margin:8px 0 12px;flex-wrap:wrap;align-items:center">
    <input type="text" id="fltArmBusca" placeholder="🔍 Filtrar por nº obra, cidade ou fiscal…"
      style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;flex:1;min-width:200px;max-width:360px"
      oninput="applyArmFilter()">
    <select id="fltArmTipo" onchange="applyArmFilter()"
      style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px">
      <option value="">Todos os tipos</option>
      <option value="RD">Somente RD</option>
      <option value="ODI">Somente ODI</option>
    </select>
    <select id="fltArmDoc" onchange="applyArmFilter()"
      style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px">
      <option value="">Todos os doc. pendentes</option>
      <option value="Contratos">⚠️ Contratos</option>
      <option value="Medições">⚠️ Medições</option>
      <option value="As-Built">⚠️ As-Built</option>
      <option value="Caixa">⚠️ Caixa</option>
      <option value="Cadastro Genesis">⚠️ Cadastro Genesis</option>
    </select>
  </div>

  <div class="sect-title" style="margin-bottom:6px;margin-top:8px">📦 Monitor — Obras RD para Armazenar</div>
  <div id="armTableContainerRD"></div>
  <div class="sect-title" style="margin-bottom:6px;margin-top:16px">📦 Monitor — Obras ODI para Armazenar</div>
  <div id="armTableContainerODI"></div>`;

  // Inicializa tabelas (chamado também pelo applyArmFilter)
  setTimeout(()=>{
    const r=document.getElementById('armTableContainerRD'), od=document.getElementById('armTableContainerODI');
    if(r) r.innerHTML=tblArmazenamento(window._armRD||[], false);
    if(od) od.innerHTML=tblArmazenamento(window._armODI||[], true);
  },0);

  window.applyArmFilter = function(){
    const q=(document.getElementById('fltArmBusca')?.value||'').toLowerCase().trim();
    const t=(document.getElementById('fltArmTipo')?.value||'');
    const doc=(document.getElementById('fltArmDoc')?.value||'');
    function pendDoc(o, isODI){
      // Retorna array de docs pendentes igual ao tblArmazenamento
      return [
        o.contratosAssinado?null:'Contratos',
        (!isODI && !o.medicoesAssinadas)?'Medições':null,
        o.projetosAsBuilt?null:'As-Built',
        o.caixaArmazenada?null:'Caixa',
        o.cadastroConfirmado?null:'Cadastro Genesis',
      ].filter(Boolean);
    }
    function filt(arr, isODI){ return arr.filter(o=>{
      if(t==='RD' && o.tipo==='ODI') return false;
      if(t==='ODI' && o.tipo!=='ODI') return false;
      if(doc && !pendDoc(o, isODI).includes(doc)) return false;
      if(!q) return true;
      return (o.numero||'').toLowerCase().includes(q)||(o.cidade||'').toLowerCase().includes(q)||(o.fiscal||'').toLowerCase().includes(q);
    });}
    const r=document.getElementById('armTableContainerRD'), od=document.getElementById('armTableContainerODI');
    if(r) r.innerHTML=tblArmazenamento(filt(window._armRD||[], false), false);
    if(od) od.innerHTML=tblArmazenamento(filt(window._armODI||[], true), true);
  };

  // ── Seção preparatória: obras com Med.230 sem Med.280 ──
  if(prep230.length){
    function tblPrep230(obras, isODI){
      const hoje = new Date().toISOString().split('T')[0];
      const rows = obras.map(o=>{
        const prazo = prazoMedida280(o);
        const vencido = prazo && prazo < hoje;
        const itensContr = [
          o.contratosAssinado?null:'⚠️ Contratos',
          (!isODI && !o.medicoesAssinadas)?'⚠️ Medições':null,
          o.projetosAsBuilt?null:'⚠️ As-Built',
        ].filter(Boolean);
        return `<tr>
          <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
          <td>${o.cidade||'—'}</td>
          <td>${o.fiscal||'—'}</td>
          <td>${fmt(o.medida230)}</td>
          <td style="${vencido?'color:#EF4444;font-weight:700':''}">${prazo?fmt(prazo):'—'}${vencido?' ⚠️':''}</td>
          <td>${itensContr.length?`<span style="font-size:9px;color:#F59E0B">${itensContr.join(' ')}</span>`:'<span style="font-size:9px;color:#22C55E">✓ OK</span>'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">Ver</button></td>
        </tr>`;
      }).join('');
      return `<div class="tbl-wrap"><table>
        <thead><tr><th>Nº Obra</th><th>Cidade</th><th>Fiscal</th><th>Med.230</th><th>Prazo Med.280</th><th>Checar</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    }
    html += `<div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.25);border-radius:12px;padding:14px;margin-top:16px">
      <div style="font-weight:800;font-size:13px;color:#3B82F6;margin-bottom:6px">🔵 Preparação Antecipada — Med.230 Registrada, Aguardando Med.280 (${prep230.length})</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:10px">
        Obras que já têm Med.230 mas ainda não atingiram a Med.280. Use para adiantar a verificação de contratos e documentação antes do armazenamento.
        As regras para confirmar o armazenamento continuam as mesmas.
      </div>`;
    if(prep230RD.length){
      html += `<div style="font-size:11px;font-weight:700;color:#3B82F6;margin-bottom:6px">RD — ${prep230RD.length} obra(s)</div>`;
      html += tblPrep230(prep230RD, false);
    }
    if(prep230ODI.length){
      html += `<div style="font-size:11px;font-weight:700;color:#8B5CF6;margin-top:10px;margin-bottom:6px">ODI — ${prep230ODI.length} obra(s)</div>`;
      html += tblPrep230(prep230ODI, true);
    }
    html += '</div>';
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
let _monitorCardCounter = 0;
window._exportMonitorCSV = function(btn){
  const tipo   = btn.dataset.tipo   || '';
  const titulo = btn.dataset.titulo || 'monitor';
  const dados  = (window._monitorListas||{})[tipo];
  if(!dados||!dados.length){ toast('Nenhum dado para exportar.','warn'); return; }

  // Build clean CSV from stored data (not DOM)
  const esc = v => '"'+String(v||'').replace(/"/g,'""')+'"';
  const header = 'Nota,Prazo,Situação,Cidade,Fiscal,Empreiteira';
  const rows   = dados.map(r=>[r.numero,r.prazo,r.situacao,r.cidade,r.fiscal,r.empreiteira].map(esc).join(','));
  const csv    = '\uFEFF' + header + '\n' + rows.join('\n');

  const filename = 'monitor_'+titulo.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()+'.csv';
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename;
  a.click();
  toast('✓ Exportado '+dados.length+' obras — '+filename,'ok');
};

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
    const ROW_LIMIT = 15; // primeiras linhas visíveis
    // Store data for clean CSV export using unique card ID (avoids tipo collision)
    if(!window._monitorListas) window._monitorListas = {};
    const _cardId = 'card_' + (++_monitorCardCounter);
    window._monitorListas[_cardId] = lista.map(x=>({
      numero: x.o.numero,
      prazo: fnPrazo(x.o) ? fmtTxt(fnPrazo(x.o)) : '—',
      situacao: x.dias<0 ? 'Vencida há '+Math.abs(x.dias)+'d' : x.dias===0 ? 'Vence hoje' : x.dias+'d restantes',
      cidade: x.o.cidade||'',
      fiscal: x.o.fiscal||'',
      empreiteira: x.o.empreiteira||''
    }));
    const mkRow = x => {
      const d = x.dias;
      const cor2 = d < 0 ? '#EF4444' : d === 0 ? '#F97316' : d <= 5 ? '#FBBF24' : d <= 15 ? '#F59E0B' : '#6b7280';
      const txt  = d < 0 ? `⚠️ Vencida há ${Math.abs(d)}d` : d === 0 ? '🔴 Vence hoje!' : `${d}d restantes`;
      const prazoFmt = fnPrazo(x.o) ? fmtTxt(fnPrazo(x.o)) : '—';
      return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openObraModal('${x.o.id}')">
        <td style="padding:5px 10px;font-size:11px;font-weight:600;color:var(--accent);white-space:nowrap">${x.o.numero}</td>
        <td style="padding:5px 10px;font-weight:700;font-size:12px;color:${cor2};white-space:nowrap">${prazoFmt}</td>
        <td style="padding:5px 10px;font-size:10px;color:${cor2};white-space:nowrap">${txt}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.cidade||'—'}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.fiscal||'—'}</td>
        <td style="padding:5px 10px;font-size:10px;color:var(--muted)">${x.o.empreiteira||'—'}</td>
      </tr>`;
    };
    const linhas = lista.slice(0, ROW_LIMIT).map(mkRow).join('');
    const maisTxt = lista.length > ROW_LIMIT
      ? `<tr><td colspan="6" style="padding:0">
          <details style="padding:0">
            <summary style="padding:6px 10px;font-size:10px;color:var(--accent);cursor:pointer;list-style:none">
              ▼ Ver mais ${lista.length - ROW_LIMIT} obra(s)
            </summary>
            <table style="width:100%;border-collapse:collapse">
              ${lista.slice(ROW_LIMIT).map(mkRow).join('')}
            </table>
          </details>
        </td></tr>`
      : '';
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow-x:auto">
        <div style="padding:10px 14px;background:${cor}12;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div>
            <span style="font-weight:700;font-size:12px">${titulo}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:6px">${lista.length} obra(s)</span>
            ${subtitulo ? `<span style="font-size:9px;color:var(--muted);margin-left:6px">${subtitulo}</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${badges}
            ${me.perfil==='gerente'?`<button onclick="window._exportMonitorCSV(this)" data-titulo="${titulo}" data-tipo="${_cardId}" style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);cursor:pointer;white-space:nowrap">⬇️ Exportar CSV</button>`:''}
          </div>
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

// toggleEnquadramento: ver definição completa abaixo
window.toggleDescricaoODI = function(){
  // "Livre" e "Loteamento" não precisam de campo de texto adicional
  const fgLivre = document.getElementById('fgDescricaoLivre');
  if(fgLivre) fgLivre.style.display = 'none'; // campo de descrição livre removido
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
  else if(_filtroRapidoAtivo === 'conc_sem_kaffa') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.kaffa);
  else if(_filtroRapidoAtivo === 'fisc_sem_kaffa') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.fiscalizacao&&!o.kaffa);
  else if(_filtroRapidoAtivo === 'pend_ag_conf')  baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.pendencia&&!o.pendenciaResolvida&&o.regularizacaoData);
  else if(_filtroRapidoAtivo === 'encerradas')          baseList = baseList.filter(o=>o.armazenado);
  else if(_filtroRapidoAtivo === 'proc_cancelamento')   baseList = baseList.filter(o=>o.processoCancelamento&&!o.cancelado);
  else if(_filtroRapidoAtivo === 'prob_executivo')      baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.impedimento&&!o.conclusao);
  else if(_filtroRapidoAtivo === 'ag_armazenar')        baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.medida280);
  else if(_filtroRapidoAtivo === 'via_fechamento')      baseList = baseList.filter(o=>o.viaFechamento&&!o.cancelado);
  else if(_filtroRapidoAtivo === 'via_simo')            baseList = baseList.filter(o=>o.viaCadastroSimo&&!o.cancelado);
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
    // Badge de comentário não lido (💬)
    const _comentMs = o.ultimoComentarioEm?.toDate?.()?.getTime?.() || 0;
    const _vistoMs  = parseInt(localStorage.getItem('chatVisto_'+o.id)||'0',10);
    const chatBadge = (_comentMs > 0 && _comentMs > _vistoMs && o.ultimoComentarioAutorUid !== me?.uid)
      ? '<span title="Novo aviso/comentário não lido" style="font-size:9px;background:#EF4444;color:#fff;padding:1px 6px;border-radius:4px;margin-left:5px;cursor:pointer" onclick="event.stopPropagation();openObraModal(\''+o.id+'\')">💬 novo</span>'
      : '';
    const stk = 'position:sticky;z-index:1;background:' + (rowBg.includes('EF4444')?'rgba(20,5,5,1)':rowBg.includes('A855F7')?'rgba(15,5,20,1)':rowBg.includes('F97316')?'rgba(20,10,0,1)':'var(--surface)');
    return `<tr style="${rowBg}">
      <td class="col-chk" style="display:${isChkMode?'table-cell':'none'};width:32px;padding:4px 8px;text-align:center">
        <input type="checkbox" class="chk-obra" data-id="${o.id}"
          onchange="(()=>{ const n=document.querySelectorAll('.chk-obra:checked').length; const el=document.getElementById('bulkCount'); if(el) el.textContent=n+' obra(s) selecionada(s)'; })()">
      </td>
      <td style="${stk};left:0;min-width:120px">${statusHtml(o)}${procCancBadge}</td>
      <td style="${stk};left:120px;min-width:100px"><strong style="color:var(--accent);cursor:pointer" onclick="openObraModal('${o.id}')">${o.numero||'—'}</strong>${chatBadge}${o.viaFechamento?`<span title="Via deixada para fechamento em ${fmtTxt(o.viaFechamentoEm)}${o.viaFechamentoPor?' por '+o.viaFechamentoPor:''}" style="margin-left:4px;cursor:help">📁</span>`:''}${o.viaCadastroSimo?`<span title="Via enviada para cadastro SIMO em ${fmtTxt(o.viaCadastroSimoEm)}${o.viaCadastroSimoPor?' por '+o.viaCadastroSimoPor:''}" style="margin-left:4px;cursor:help">🗂️</span>`:''}</td>
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
      <td>${(()=>{
        // Novo array: mostra último desligamento com status
        const arr = o.desligamentos||[];
        if(arr.length){
          const last=arr[arr.length-1];
          const sc=last.status==='aprovado'?'var(--green)':last.status==='cancelado'?'var(--red)':'var(--text)';
          return `<span style="color:${sc}">${fmtTxt(last.data)}${last.status==='aprovado'?' ✓':last.status==='cancelado'?' ✗':''}</span>`;
        }
        // Legado scalar
        return o.dataDesligamento?`<span style="color:${o.desligamentoConfirmado?'var(--green)':o.desligamentoCancelado?'var(--red)':'var(--text)'}">${fmtTxt(o.dataDesligamento)}${o.desligamentoConfirmado?' ✓':o.desligamentoCancelado?' ✗':''}</span>`:'—';
      })()}</td>
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
  // Sempre reseta equipamentos ao abrir o modal (evita contaminação entre obras)
  if(!obraId){
    _equipInstalados=[]; _equipRetirados=[]; renderEquipInstalados(); renderEquipRetirados();
    // Hide ODI sections for new obra (will show when ODI type is selected)
    const s1=document.getElementById('secODI'); if(s1) s1.style.display='none';
    const s2=document.getElementById('secODIAcoes'); if(s2) s2.innerHTML='';
    // Ensure save button is visible for new obras
    const btnS=document.getElementById('btnSalvarObra'); if(btnS) btnS.style.display='';
    ['oNum','oTipo','oCidade','oEmp','oFiscalNome','oAbertura','oPrazo','oPrazoOpcao',
     'oUSC','oULV','oEquipRef','oDescricao','oEnquadramento','oPrograma'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.disabled=false; el.style.opacity=''; }
    });
  }
  // reset
  ['oNum','oFiscalNome','oAbertura','oPrazo','oUSC','oULV','oDesligamento','oConclusao','oPlacas','oSAP','oSerie',
   'oFabricante','oKaffa','oCadastro','oFiscalizacao','oPrazoPendencia','oRegularizacao','oMedicao',
   'oMedida70','oMedida230','oMedida280','oMedida280Motivo','oImpedimentoOutro','oPendenciaOutro',
   'oDataCancelamento','oMotivoCancelamento','oDesligMotivo','oMotivoParalisada','oCaixaArmazenada'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['oTipo','oCidade','oEmp','oTipoImpedimento','oPrazoOpcao'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const prazoInp=document.getElementById('oPrazo'); if(prazoInp) prazoInp.style.display='none';
  ['oTemImpedimento','oTemPendencia','oPendenciaResolvida','oArmazenado','oCancelado',
   'oDesligConfirmado','oDesligCancelado','oParalisada',
   'oContratosAssinado','oMedicoesAssinadas','oProjetosAsBuilt'].forEach(id=>{ const el=document.getElementById(id); if(el) el.checked=false; });
  // reset prazo pendência
  const selPrazoPend=document.getElementById('oPrazoPendenciaOpcao'); if(selPrazoPend) selPrazoPend.value='';
  const infoPrazoPend=document.getElementById('infoPrazoPendencia'); if(infoPrazoPend) infoPrazoPend.style.display='none';
  // reset fiscal
  const selFiscal=document.getElementById('oFiscalSelect'); if(selFiscal){ selFiscal.value=''; }
  const inpFiscal=document.getElementById('oFiscalNome'); if(inpFiscal){ inpFiscal.style.display='none'; inpFiscal.value=''; }
  // reset checkboxes de pendência
  document.querySelectorAll('.chk-pendencia').forEach(el=>el.checked=false);
  // reset medições, kaffas, cadastros e desligamentos pendentes
  _medicoesPendentes=[];
  _kaffasPendentes=[];
  _cadEnvPendentes=[];
  _cadConfPendentes=[];
  _desligamentosEdit=[];
  // renderiza lista vazia (para nova obra)
  const _divDesl=document.getElementById('divDesligList'); if(_divDesl) _divDesl.innerHTML='';
  // reset sub-seções de cadastro (fiscal/genesis/gerente) para evitar que estado
  // de um perfil anterior fique visível ao abrir o modal com outro perfil
  ['secCadastroFiscal','secCadastroGenesis','secCadastroGerente'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  // reset oArmazenado to disabled (will be re-enabled by checkArmazenamentoDeps)
  const armEl=document.getElementById('oArmazenado'); if(armEl) armEl.disabled=true;

  // Restrições de data: passado para campos normais
  const hoje_s=hojeStr();
  ['oAbertura','oConclusao','oKaffa','oFiscalizacao','oCadastro','oMedicao',
   'oMedida70','oMedida230','oMedida280'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.max=hoje_s; el.removeAttribute('min'); }
  });

  // setChk disponível em todo o escopo do modal (usada dentro e fora do bloco isEdit)
  const setChk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=!!v; };

  if(isEdit){
    const set=(id,v)=>{ const el=document.getElementById(id); if(el&&v!==undefined&&v!==null) el.value=v; };
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
    // ODI fields — only show ODI section for ODI obras
    const secODIEl  = document.getElementById('secODI');
    const secODIAc  = document.getElementById('secODIAcoes');
    if(obra.tipo==='ODI'){
      if(secODIEl) secODIEl.style.display='';
      const dEl=document.getElementById('oDescricaoODI');
      if(dEl) dEl.value=obra.descricaoODI||'';
      const lEl=document.getElementById('oDescricaoLivreODI');
      if(lEl) lEl.value=obra.descricaoLivreODI||'';
      const fgLivre=document.getElementById('fgDescricaoLivre');
      if(fgLivre) fgLivre.style.display=obra.descricaoODI==='Livre'?'':'none';
      // ODI: mostrar apenas cabeçalho + campos ODI + ações ODI
      // Ocultar TODO o workflow RD (conclusão, fiscalização, locais, pendência, medições, etc.)
      ['secExec','secConclusaoExtra',
       'secFisc',
       'secLocaisTrabalho',
       'secPendenciaDetalhe','fgPendenciaOutro',
       'secCadastro',
       'secMedicao','secMedicaoParcialFields',
       'secMedidas','secMedida280Motivo',
       'secRegularizacao','secConfPendencia',
       'secUSCMedidoGerente','fgUSCMedido','fgULVMedido',
       'secImpedimento','secImpedimentoDetalhe',
       'secDesligData','secDesligConfirm','secDesligMotivo'
      ].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
      // Render ODI action panel
      setTimeout(()=>renderAcoesODI(obra),50);

      // ODI: fiscal usa action buttons diretamente — ocultar botão salvar
      if(me.perfil==='fiscal'||me.perfil==='fiscal_adm'){
        const btnSalvar = document.getElementById('btnSalvarObra');
        if(btnSalvar){ btnSalvar.style.display='none'; }
      }
    } else {
      // RD obra — hide ODI sections completely; restore RD sections
      if(secODIEl) secODIEl.style.display='none';
      if(secODIAc) secODIAc.innerHTML='';
      // RD obra: restaura save button e campos que podem ter sido desabilitados
      const btnSalvarRD = document.getElementById('btnSalvarObra');
      if(btnSalvarRD) btnSalvarRD.style.display='';
      ['oNum','oTipo','oCidade','oEmp','oFiscalNome','oAbertura','oPrazo','oPrazoOpcao',
       'oUSC','oULV','oEquipRef','oDescricao','oEnquadramento','oPrograma'].forEach(id=>{
        const el=document.getElementById(id); if(el){ el.disabled=false; el.style.opacity=''; }
      });
      // RD obra: restaura todas as seções que podem ter sido ocultadas numa obra ODI anterior
      ['secExec','secConclusaoExtra',
       'secFisc',
       'secLocaisTrabalho',
       'secPendenciaDetalhe','fgPendenciaOutro',
       'secCadastro',
       'secMedicao','secMedicaoParcialFields',
       'secMedidas','secMedida280Motivo',
       'secRegularizacao','secConfPendencia',
       'secUSCMedidoGerente','fgUSCMedido','fgULVMedido',
       'secImpedimento','secImpedimentoDetalhe',
       'secDesligData','secDesligConfirm','secDesligMotivo'
      ].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=''; });
    }
    // Transformer fields — inicializa arrays de equipamentos para a obra atual
    // Garante que dados de obras anteriores não vazam para esta obra
    initEquipFromObra(obra);
    set('oPotencia',obra.potencia||''); set('oDataTransf',obra.dataTransf||''); set('oPotenciaRet',obra.potenciaRet||'');
    set('oSAPRet',obra.sapRet||''); set('oSerieRet',obra.serieRet||''); set('oFabricanteRet',obra.fabricanteRet||'');
    const retChk=document.getElementById('oTemRetirado'); if(retChk){ retChk.checked=!!obra.temRetirado; toggleRetirado(); }
    // Inicializa _desligamentosEdit com array existente (ou converte legado)
    _desligamentosEdit = (obra.desligamentos && obra.desligamentos.length)
      ? JSON.parse(JSON.stringify(obra.desligamentos))
      : (obra.dataDesligamento ? [{
          id:'legado-desl-1', data:obra.dataDesligamento,
          status: obra.desligamentoCancelado?'cancelado':obra.desligamentoConfirmado?'aprovado':'pendente',
          registradoPor:'', registradoEm:'', legado:true
        }] : []);
    renderDesligamentosModal();
    set('oConclusao',obra.conclusao); set('oPlacas',obra.placas); set('oSAP',obra.sap);
    set('oSerie',obra.serie); set('oFabricante',obra.fabricante);
    // kaffaEntries rendered via renderListaKaffas above
    // Cadastro arrays renderizados via renderListaCadastrosEnviados/Confirmados acima
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
    // Render medições, kaffas e cadastros list
    renderListaMedicoes();
    renderListaKaffas();
    renderListaCadastrosEnviados();
    renderListaCadastrosConfirmados();
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
    // Pendência de cadastro
    setChk('oCadastroPendencia', obra.cadastroPendencia||false);
    const _pendDescEl = document.getElementById('oCadastroPendenciaDesc');
    if(_pendDescEl) _pendDescEl.value = obra.cadastroPendenciaDesc||'';
    const _pendSec = document.getElementById('secCadastroPendenciaDesc');
    if(_pendSec) _pendSec.style.display = obra.cadastroPendencia ? 'block' : 'none';
    // Aviso de pendência para gerente/fiscal
    const _warnPend = document.getElementById('msgCadastroPendenciaWarn');
    if(_warnPend){
      if(obra.cadastroPendencia){
        _warnPend.style.display='block';
        _warnPend.innerHTML='⚠️ <strong>Pendência registrada:</strong> '+(obra.cadastroPendenciaDesc||'Sem descrição');
      } else { _warnPend.style.display='none'; }
    }
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

  // 2. Mostrar só o que cada perfil precisa — ignorado para obras ODI (têm secODIAcoes próprio)
  function showSec(id){ const el=document.getElementById(id); if(el) el.style.display='block'; }

  // ── CONTROLE DE EDIÇÃO — CAMPOS DE IDENTIFICAÇÃO DA OBRA ─────────────
  // Apenas gerente (qualquer obra) e adm_odi (obras ODI ou nova obra) podem
  // editar os campos de identificação. Todos os demais ficam somente leitura.
  const canEditIdentif = !isEdit
    ? (p === 'gerente' || p === 'adm_odi')                          // nova obra
    : (p === 'gerente' || (p === 'adm_odi' && obra?.tipo === 'ODI')); // obra existente
  const IDENTIF_FIELDS = [
    'oNum','oTipo','oCidade','oEmp','oFiscalSelect','oFiscalNome',
    'oAbertura','oPrazo','oPrazoOpcao','oUSC','oULV','oEquipRef',
    'oDescricao','oEnquadramento','oPrograma','oDescricaoODI','oDescricaoLivreODI'
  ];
  if(!canEditIdentif){
    IDENTIF_FIELDS.forEach(id=>{
      const el=document.getElementById(id);
      if(el){ el.disabled=true; el.style.opacity='0.7'; }
    });
  } else {
    // Garante habilitação caso modal anterior tenha deixado campos desabilitados
    IDENTIF_FIELDS.forEach(id=>{
      const el=document.getElementById(id);
      if(el){ el.disabled=false; el.style.opacity=''; }
    });
  }

  // secIdentif sempre visível (cabeçalho da obra) — exceto genesis/estagiario
  if(!isGenesis && !isEstagiario){
    showSec('secIdentif');
    // secTransfView: read-only view para RD; ODI usa equipamento próprio em secODIAcoes
    if(isEdit && obra?.tipo!=='ODI' && (p==='gerente'||p==='fiscal'||p==='fiscal_adm')){
      const temEq = (obra?.equipamentosInstalados?.length||0)>0 || (obra?.equipamentosRetirados?.length||0)>0 || obra?.sap || obra?.potencia;
      if(temEq){ showSec('secTransfView'); renderEquipView(obra); }
    }
    // USC/ULV medido: só gerente/adm_odi com medições parciais
    if((p==='gerente'||p==='adm_odi') && isEdit){
      const temMed = obra?.medicoes?.some(m=>m.tipo==='parcial');
      document.getElementById('fgUSCMedido') && (document.getElementById('fgUSCMedido').style.display = temMed?'grid':'none');
    }
  }
  // Para obras ODI: pular bloco de showSec RD (ODI tem suas próprias seções)
  if(obra?.tipo === 'ODI'){
    // ODI: secIdentif já mostrada acima; ações ODI renderizadas no bloco anterior
    // Genesis ODI: mostrar cadastro (seção genesis com envios + confirmações)
    if(isGenesis){
      showSec('secCadastro');
      const _genDiv=document.getElementById('secCadastroGenesis'); if(_genDiv) _genDiv.style.display='block';
      // Pendência de cadastro
      setChk('oCadastroPendencia', obra?.cadastroPendencia||false);
      const _pdDesc=document.getElementById('oCadastroPendenciaDesc'); if(_pdDesc) _pdDesc.value=obra?.cadastroPendenciaDesc||'';
      const _pdSec=document.getElementById('secCadastroPendenciaDesc'); if(_pdSec) _pdSec.style.display=obra?.cadastroPendencia?'block':'none';
      // Desabilitar botão add se já existe final confirmado (idêntico ao bloco RD)
      const _allConfGODI=(obra?.cadastrosConfirmados||[]).concat(_cadConfPendentes);
      const _hasFinalGODI=_allConfGODI.some(c=>c.tipo==='final');
      const _btnCnfODI=document.getElementById('btnAddCadConf'); if(_btnCnfODI) _btnCnfODI.disabled=_hasFinalGODI;
    }
    // Estagiário, adm_odi e gerente: armazenamento ODI
    if(isEstagiario || p === 'adm_odi' || p === 'gerente'){
      if(isEdit){
        showSec('secArmazenamento');
        setTimeout(checkArmazenamentoDeps, 100);
      }
    }
    // Gerente ODI: ver cadastros em leitura
    if(p === 'gerente' && isEdit){
      showSec('secCadastro');
      const _gerDiv=document.getElementById('secCadastroGerente'); if(_gerDiv) _gerDiv.style.display='block';
    }
  } else {
  if(isGenesis){
    // Genesis: secCadastro com seção de confirmações
    showSec('secCadastro');
    const _genDiv2=document.getElementById('secCadastroGenesis'); if(_genDiv2) _genDiv2.style.display='block';
    // Pendência de cadastro
    setChk('oCadastroPendencia', obra?.cadastroPendencia||false);
    const _pdDesc2=document.getElementById('oCadastroPendenciaDesc'); if(_pdDesc2) _pdDesc2.value=obra?.cadastroPendenciaDesc||'';
    const _pdSec2=document.getElementById('secCadastroPendenciaDesc'); if(_pdSec2) _pdSec2.style.display=obra?.cadastroPendencia?'block':'none';
    // Desabilitar botão add se já existe final confirmado
    const _allConfG=(obra?.cadastrosConfirmados||[]).concat(_cadConfPendentes);
    const _hasFinalG=_allConfG.some(c=>c.tipo==='final');
    const _btnCnf=document.getElementById('btnAddCadConf'); if(_btnCnf) _btnCnf.disabled=_hasFinalG;

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
      // Mostra problema executivo registrado pela empreiteira (read-only)
      const _impView = document.getElementById('secImpedimentoView');
      const _impBody = document.getElementById('secImpedimentoViewBody');
      if(_impView && _impBody){
        if(obra?.impedimento){
          const _tipoLabel = obra.tipoImpedimento || '—';
          const _descExtra = obra.tipoImpedimento==='Outro' && obra.impedimentoOutro
            ? `<div style="margin-top:6px;font-size:12px"><strong>Descrição:</strong> ${obra.impedimentoOutro}</div>`
            : '';
          _impBody.innerHTML = `<strong>Tipo:</strong> ${_tipoLabel}${_descExtra}`;
          _impView.style.display = 'block';
        } else {
          _impView.style.display = 'none';
        }
      }
      if(isEdit){
        showSec('secLocaisTrabalho');
        _locaisPendentes = [];
        renderLocais();
      }
    }

    // Desligamento: fiscal, empreiteira e gerente preenchem a data
    showSec('secDesligData'); // todos veem; contém a lista gerenciada por renderDesligamentosModal()
    // secDesligConfirm agora é substituído por botões inline por item (manter oculto)
    // renderDesligamentosModal() já foi chamado acima ao carregar isEdit

    // Cadastro: fiscal vê seção de envios; gerente vê ambas as listas (leitura)
    if(p === 'fiscal' || p === 'fiscal_adm'){
      showSec('secCadastro');
      const _fiscDiv=document.getElementById('secCadastroFiscal'); if(_fiscDiv) _fiscDiv.style.display='block';
      // Bloqueia botão de novo envio se já existe final
      const _allEnvF=(obra?.cadastrosEnviados||[]).concat(_cadEnvPendentes);
      const _hasFinalF=_allEnvF.some(c=>c.tipo==='final');
      const _btnAddE=document.getElementById('btnAddCadEnvio'); if(_btnAddE) _btnAddE.disabled=_hasFinalF;
    }
    if(p === 'gerente' && isEdit){
      showSec('secCadastro');
      const _gerDiv2=document.getElementById('secCadastroGerente'); if(_gerDiv2) _gerDiv2.style.display='block';
    }

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

  } // end else (not ODI)

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
  // Cadastro usa listas de array agora; não há listener de input único

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
    // Auto-prazo ODI when abertura date changes
  setTimeout(()=>{
    const daEl = document.getElementById('oDataAbertura');
    if(daEl && !daEl._odiListener){
      daEl._odiListener = true;
      daEl.addEventListener('change',()=>{
        if(document.getElementById('oTipo')?.value!=='ODI') return;
        const d = new Date(daEl.value+'T00:00:00'); d.setMonth(d.getMonth()+18);
        const prazoEl = document.getElementById('oPrazo');
        if(prazoEl) prazoEl.value = d.toISOString().split('T')[0];
      });
    }
  },100);
  document.getElementById('ovObra').classList.add('open');
  // Inicializa chat de avisos (só para obras existentes)
  if(isEdit && obraId){
    abrirChatObra(obraId);
    // Marca como lido para este usuário neste dispositivo
    try{ localStorage.setItem('chatVisto_'+obraId, Date.now().toString()); }catch(_){}
  }
  else {
    const _box = document.getElementById('chatBox');
    if(_box) _box.innerHTML='<div style="font-size:10px;color:var(--muted);text-align:center;padding:12px">Salve a obra para usar o chat.</div>';
    if(_chatUnsub){ _chatUnsub(); _chatUnsub=null; }
    if(window._chatPollTimer){ clearInterval(window._chatPollTimer); window._chatPollTimer=null; }
    _chatObraId = null;
  }
  }catch(err){ console.error('openObraModal error:',err); alert('Erro ao abrir modal: '+err.message+' (linha '+err.stack?.split('\n')[1]+')'); }
};

// ══ CHAT DE AVISOS — comentários por obra ══════════════════════════════════
let _chatObraId = null;
let _chatUnsub  = null;
window._chatPollTimer = null;
window._chatReload = null;

async function abrirChatObra(obraId){
  const id = obraId || document.getElementById('obraId')?.value?.trim();
  _chatObraId = id || null;
  const box = document.getElementById('chatBox');
  if(!id || !box){
    if(box) box.innerHTML='<div style="font-size:10px;color:var(--muted);text-align:center;padding:12px">Salve a obra para usar o chat.</div>';
    return;
  }
  if(_chatUnsub){ _chatUnsub(); _chatUnsub = null; }
  if(window._chatPollTimer){ clearInterval(window._chatPollTimer); window._chatPollTimer = null; }
  box.innerHTML = '<div style="font-size:10px;color:var(--muted);text-align:center;padding:12px">Carregando...</div>';

  async function carregarMsgs(){
    try{
      const snap = await getDocs(collection(db,'obras',id,'comentarios'));
      const msgs = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>{
          const ta = a.criadoEm?.toDate ? a.criadoEm.toDate().getTime() : (a.criadoEm||0);
          const tb = b.criadoEm?.toDate ? b.criadoEm.toDate().getTime() : (b.criadoEm||0);
          return ta - tb;
        });
      renderChatMsgs(msgs);
    }catch(e){
      console.error('[Chat] Erro ao carregar:', e.code, e.message);
      if(document.getElementById('chatBox')){
        if(e.code==='permission-denied')
          document.getElementById('chatBox').innerHTML='<div style="font-size:10px;color:#F59E0B;padding:8px">⚠️ Publique o <strong>firestore.rules</strong> no Firebase Console para habilitar o chat.</div>';
        else
          document.getElementById('chatBox').innerHTML='<div style="font-size:10px;color:#EF4444;padding:8px">Erro: '+e.message+'</div>';
      }
    }
  }

  await carregarMsgs();
  window._chatPollTimer = setInterval(carregarMsgs, 5000);
  window._chatReload = carregarMsgs;
}

function renderChatMsgs(msgs){
  const box = document.getElementById('chatBox');
  if(!box) return;
  if(!msgs.length){
    box.innerHTML = '<div style="font-size:10px;color:var(--muted);text-align:center;padding:12px">Nenhum aviso ainda. Seja o primeiro a comentar.</div>';
    return;
  }
  const perfColors = {gerente:'#7c6af7',fiscal:'#3B82F6',fiscal_adm:'#3B82F6',empreiteira:'#F59E0B',estagiario:'#22C55E',analista:'#06B6D4'};
  box.innerHTML = msgs.map(m=>{
    const ts = m.criadoEm?.toDate ? m.criadoEm.toDate() : new Date(m.criadoEm||Date.now());
    const tsStr = ts.toLocaleDateString('pt-BR')+' '+ts.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const cor = perfColors[m.perfilAutor]||'#6b7280';
    const isMine = m.uid === auth.currentUser?.uid;
    return `<div style="display:flex;${isMine?'flex-direction:row-reverse':''};gap:8px;margin-bottom:10px">
      <div style="width:28px;height:28px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#fff;font-weight:700">${(m.autor||'?')[0].toUpperCase()}</div>
      <div style="max-width:80%;${isMine?'align-items:flex-end':''};display:flex;flex-direction:column;gap:2px">
        <div style="font-size:9px;color:var(--muted)">${isMine?'Você':m.autor} · ${tsStr}</div>
        <div style="background:${isMine?'var(--accent)':'var(--surface2)'};color:${isMine?'#fff':'inherit'};padding:8px 12px;border-radius:${isMine?'12px 2px 12px 12px':'2px 12px 12px 12px'};font-size:12px;word-break:break-word">${m.texto}</div>
      </div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

window.enviarMsgChat = async function(){
  const inp = document.getElementById('chatInput');
  const txt = inp?.value?.trim();
  if(!txt){ toast('Digite um comentário antes de enviar.','warn'); return; }
  // Use _chatObraId or fall back to the modal's hidden obraId field
  const obraIdParaChat = _chatObraId || document.getElementById('obraId')?.value?.trim();
  if(!obraIdParaChat){ toast('Abra uma obra existente para usar o chat.','warn'); return; }
  if(!auth.currentUser){ toast('Você precisa estar logado.','err'); return; }
  _chatObraId = obraIdParaChat; // garante sincronização
  inp.value = '';
  inp.disabled = true;
  try{
    const autorNome = me.nome || me.email || me.vinculo || auth.currentUser.email || 'Usuário';
    await addDoc(collection(db,'obras',obraIdParaChat,'comentarios'),{
      texto: txt,
      autor: autorNome,
      perfilAutor: me.perfil || 'desconhecido',
      uid: auth.currentUser.uid,
      criadoEm: serverTimestamp()
    });
    // Atualiza obra com timestamp do último comentário para badge de não lido
    try{
      await updateDoc(doc(db,'obras',obraIdParaChat),{
        ultimoComentarioEm: serverTimestamp(),
        ultimoComentarioAutorUid: auth.currentUser.uid
      });
    }catch(_){}
    // Reload chat immediately after sending
    if(window._chatReload) await window._chatReload();
  }catch(e){
    console.error('[Chat] Erro ao salvar:', e.code, e.message);
    if(e.code==='permission-denied')
      toast('Sem permissão — publique as regras do Firestore.','err');
    else
      toast('Erro ao enviar: '+e.message,'err');
    inp.value = txt; // restore text
  }
  finally{ inp.disabled = false; inp.focus(); }
};

window.fecharChatObra = function(){
  if(_chatUnsub){ _chatUnsub(); _chatUnsub = null; }
  if(_chatPollTimer){ clearInterval(_chatPollTimer); _chatPollTimer = null; }
  _chatObraId = null;
  window._chatReload = null;
};

window.closeObraModal=function(){
  document.getElementById('ovObra').classList.remove('open');
  window.fecharChatObra();
};

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
  // ODI: show SAP message when pendência is checked
  const obraId = document.getElementById('obraId')?.value;
  const obra = obras.find(o=>o.id===obraId);
  const msgSAP = document.getElementById('msgSAPODI');
  if(msgSAP) msgSAP.style.display = (tem && obra?.tipo==='ODI') ? '' : 'none';
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


// ── CADASTRO: toggle de pendência ────────────────────────────────────
window.toggleCadastroPendencia = function(){
  const chk = document.getElementById('oCadastroPendencia');
  const sec = document.getElementById('secCadastroPendenciaDesc');
  if(sec) sec.style.display = (chk&&chk.checked) ? 'block' : 'none';
};

// ── ARMAZENAMENTO: habilita confirm só se todos deps marcados ─────────
window.checkArmazenamentoDeps = function(){
  const obraId = document.getElementById('obraId')?.value;
  const obra   = obraId ? obras.find(o=>o.id===obraId) : null;
  const final  = document.getElementById('oArmazenado');
  if(!final) return;

  // ODI obras não precisam de "Medições Assinadas" — oculta a linha
  const isODI = obra?.tipo === 'ODI';
  const rowMed = document.getElementById('rowMedicoesAssinadas');
  if(rowMed) rowMed.style.display = isODI ? 'none' : '';

  // Garante elemento de mensagem de aviso junto ao checkbox
  let msgEl = document.getElementById('msgCadastroBlock');
  if(!msgEl){
    msgEl = document.createElement('p');
    msgEl.id = 'msgCadastroBlock';
    msgEl.style.cssText = 'color:var(--yellow);font-size:12px;margin:6px 0 0;display:none';
    final.parentNode?.insertBefore(msgEl, final.nextSibling);
  }
  // Bloqueio obrigatório: Genesis precisa confirmar cadastro antes do armazenamento
  if(!obra?.cadastroConfirmado){
    final.disabled = true;
    if(final.checked) final.checked = false;
    msgEl.style.display = 'block';
    msgEl.textContent = '⚠️ Aguardando confirmação de cadastro pelo Genesis';
    return;
  }
  msgEl.style.display = 'none';
  // ODI: sem Medições Assinadas; RD: com Medições Assinadas
  const deps = isODI
    ? ['oContratosAssinado','oProjetosAsBuilt']
    : ['oContratosAssinado','oMedicoesAssinadas','oProjetosAsBuilt'];
  const allChk = deps.every(id => { const el=document.getElementById(id); return el&&el.checked; });
  const caixa  = (document.getElementById('oCaixaArmazenada')?.value||'').trim();
  final.disabled = !(allChk && caixa);
  if(final.disabled && final.checked) final.checked = false;
};

// ── MEDIÇÕES MÚLTIPLAS ────────────────────────────────────────────────
let _medicoesPendentes = [];
let _kaffasPendentes = [];
let _cadEnvPendentes  = [];   // envios para cadastro pendentes (fiscal)
let _cadConfPendentes = [];   // confirmações de cadastro pendentes (genesis)
let _desligamentosEdit = [];  // lista de desligamentos editável no modal (array source-of-truth)

// ── DESLIGAMENTOS (array por obra) ────────────────────────────────────
window.renderDesligamentosModal = function(){
  const cont = document.getElementById('divDesligList');
  if(!cont) return;
  const p = me?.perfil||'';
  const canApprove = ['fiscal','fiscal_adm','gerente'].includes(p);
  const canAdd     = p==='empreiteira';
  const statusLabel = {pendente:'🕐 Pendente',aprovado:'✓ Aprovado',cancelado:'✗ Cancelado'};
  const statusColor = {pendente:'#F59E0B',aprovado:'#22C55E',cancelado:'#EF4444'};
  let html = '';
  if(_desligamentosEdit.length){
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">';
    _desligamentosEdit.forEach(function(d,idx){
      const sc = statusColor[d.status]||'#888';
      html += `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;background:var(--surface);border-radius:8px;border:1px solid ${sc}55">
        <span style="font-size:13px;font-weight:600">${fmtTxt(d.data)}</span>
        <span style="font-size:10px;font-weight:700;color:${sc};background:${sc}18;padding:2px 8px;border-radius:6px">${statusLabel[d.status]||d.status}</span>
        ${d.registradoPor?`<span style="font-size:10px;color:var(--muted)">${d.registradoPor}</span>`:''}
        ${canApprove && d.status==='pendente' ? `<span style="margin-left:auto;display:flex;gap:6px">
          <button type="button" onclick="aprovarDesligamentoModal(${idx})" style="padding:3px 10px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">Aprovar</button>
          <button type="button" onclick="cancelarDesligamentoModal(${idx})" style="padding:3px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">Cancelar</button>
        </span>` : ''}
        ${canApprove && d.status==='aprovado' ? `<button type="button" onclick="cancelarDesligamentoModal(${idx})" style="margin-left:auto;padding:3px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">Cancelar</button>` : ''}
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<div style="color:var(--muted);font-size:11px;margin-bottom:8px">Nenhum desligamento registrado.</div>';
  }
  if(canAdd){
    html += `<div id="divNovoDeslig" style="display:none;flex-direction:column;gap:8px;margin-top:4px;padding:10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">
      <div class="fg"><label style="font-size:11px">Data do Novo Desligamento (hoje ou futuro)</label>
        <input type="date" id="oNovoDesligData" min="${hojeStr()}">
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" onclick="adicionarDesligamento()" style="padding:5px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Adicionar</button>
        <button type="button" onclick="document.getElementById('divNovoDeslig').style.display='none';document.getElementById('btnNovoDesligAction').style.display='inline-flex'" style="padding:5px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px">Cancelar</button>
      </div>
    </div>
    <button type="button" id="btnNovoDesligAction" onclick="document.getElementById('divNovoDeslig').style.display='flex';this.style.display='none'" style="padding:5px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text)">+ Registrar Desligamento</button>`;
  }
  cont.innerHTML = html;
};
window.adicionarDesligamento = function(){
  const v = (document.getElementById('oNovoDesligData')?.value||'').trim();
  if(!v){ toast('Informe a data do desligamento.','err'); return; }
  if(v < hojeStr()){ toast('A data do novo desligamento deve ser hoje ou futura.','err'); return; }
  const uid = 'desl-'+Date.now();
  _desligamentosEdit.push({id:uid, data:v, status:'pendente',
    registradoPor: me?.nome||me?.vinculo||'', registradoEm:hojeStr()});
  window.renderDesligamentosModal();
};
window.aprovarDesligamentoModal = function(idx){
  if(_desligamentosEdit[idx]) _desligamentosEdit[idx].status='aprovado';
  window.renderDesligamentosModal();
};
window.cancelarDesligamentoModal = function(idx){
  if(_desligamentosEdit[idx]) _desligamentosEdit[idx].status='cancelado';
  window.renderDesligamentosModal();
};

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
    // só recarrega do cadastro se não houver alteração ainda não salva (antes, abrir um 2º kaffa
    // na mesma tela apagava os transformadores digitados e ainda não salvos)
    if(!_equipModificado) initEquipFromObra(obraAtualEq);
    else { renderEquipInstalados(); renderEquipRetirados(); }
  }
  _equipEditRestaurar();
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
// ── CADASTROS ENVIADOS / CONFIRMADOS (arrays) ─────────────────────────

function renderListaCadastrosEnviados(){
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  // Compatibilidade retroativa: obras sem array mas com campo escalar legado
  // ODI: o fiscal registra o envio pelo painel de ações (campo dataCadastro) e o array fica vazio —
  // por isso o fallback vale também para array vazio (antes o Genesis não via a data).
  const existing=(obra?.cadastrosEnviados&&obra.cadastrosEnviados.length)?obra.cadastrosEnviados:
    (obra?.dataCadastro?[{id:'legado-env-1',data:obra.dataCadastro,tipo:obra.tipoCadastro||'final',legado:true}]:[]);
  const all=[...existing,..._cadEnvPendentes];

  // Helper: render one item row
  const rowHtml=(c,isPend,canRemove)=>{
    const tipoChip=c.tipo==='final'?
      '<span class="chip chip-green" style="font-size:9px">✅ Final</span>':
      '<span class="chip chip-yellow" style="font-size:9px">📋 Parcial</span>';
    const removeBtn=canRemove?
      `<button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px;margin-left:auto" onclick="remCadEnvPend('${c.id}')">✕</button>`:'';
    const newBadge=isPend?'<span style="font-size:9px;color:var(--accent);margin-left:auto">novo</span>':'';
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${isPend?'rgba(0,229,160,.06)':'var(--surface2)'};border-radius:6px;margin-bottom:5px;border:1px solid ${isPend?'rgba(0,229,160,.2)':'var(--border)'}">
      <span style="font-size:10px;color:var(--muted);min-width:70px">${fmtTxt(c.data)}</span>
      ${tipoChip}
      ${c.legado?'<span style="font-size:10px;color:var(--muted)">(legado)</span>':''}
      ${newBadge}${removeBtn}
    </div>`;
  };

  const emptyMsg='<div style="font-size:11px;color:var(--muted);padding:6px 0">Nenhum envio registrado.</div>';

  // Fiscal: editable list
  const contFisc=document.getElementById('listaCadastrosEnviados');
  if(contFisc){
    if(!all.length){ contFisc.innerHTML=emptyMsg; }
    else {
      contFisc.innerHTML=[...all].reverse().map(c=>{
        const isPend=_cadEnvPendentes.some(p=>p.id===c.id);
        return rowHtml(c, isPend, isPend);
      }).join('');
    }
  }

  // Genesis: read-only reference
  const contRef=document.getElementById('listaCadEnvRef');
  if(contRef){
    if(!all.length){ contRef.innerHTML=emptyMsg; }
    else { contRef.innerHTML=[...all].reverse().map(c=>rowHtml(c,false,false)).join(''); }
  }

  // Gerente: read-only
  const contGer=document.getElementById('listaCadastrosEnviadosGer');
  if(contGer){
    if(!all.length){ contGer.innerHTML=emptyMsg; }
    else { contGer.innerHTML=[...all].reverse().map(c=>rowHtml(c,false,false)).join(''); }
  }
}

function renderListaCadastrosConfirmados(){
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  // Compatibilidade retroativa: obras sem array mas com confirmação escalar legada
  const existing=obra?.cadastrosConfirmados||
    (obra?.cadastroConfirmado?[{id:'legado-conf-1',data:obra.dataCadastroConfirmado||'',tipo:'final',legado:true}]:[]);
  const all=[...existing,..._cadConfPendentes];

  const rowHtml=(c,isPend,canRemove)=>{
    const tipoChip=c.tipo==='final'?
      '<span class="chip chip-green" style="font-size:9px">✅ Final</span>':
      '<span class="chip chip-yellow" style="font-size:9px">📋 Parcial</span>';
    const removeBtn=canRemove?
      `<button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px;margin-left:auto" onclick="remCadConfPend('${c.id}')">✕</button>`:'';
    const newBadge=isPend?'<span style="font-size:9px;color:var(--accent);margin-left:auto">novo</span>':'';
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${isPend?'rgba(0,229,160,.06)':'var(--surface2)'};border-radius:6px;margin-bottom:5px;border:1px solid ${isPend?'rgba(0,229,160,.2)':'var(--border)'}">
      <span style="font-size:10px;color:var(--muted);min-width:70px">${fmtTxt(c.data)}</span>
      ${tipoChip}
      ${newBadge}${removeBtn}
    </div>`;
  };

  const emptyMsg='<div style="font-size:11px;color:var(--muted);padding:6px 0">Nenhuma confirmação registrada.</div>';

  // Genesis: editable
  const contGen=document.getElementById('listaCadastrosConfirmados');
  if(contGen){
    if(!all.length){ contGen.innerHTML=emptyMsg; }
    else {
      contGen.innerHTML=[...all].reverse().map(c=>{
        const isPend=_cadConfPendentes.some(p=>p.id===c.id);
        return rowHtml(c, isPend, isPend);
      }).join('');
    }
  }

  // Gerente: read-only
  const contGerC=document.getElementById('listaCadConfGer');
  if(contGerC){
    if(!all.length){ contGerC.innerHTML=emptyMsg; }
    else { contGerC.innerHTML=[...all].reverse().map(c=>rowHtml(c,false,false)).join(''); }
  }
}

// ── ACTIONS: envio para cadastro ─────────────────────────────────────
window.abrirFormCadEnvio = function(){
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  const all=(obra?.cadastrosEnviados||[]).concat(_cadEnvPendentes);
  if(all.some(c=>c.tipo==='final')){ toast('Esta obra já possui cadastro final enviado.','warn'); return; }
  document.getElementById('formCadastroEnvio').style.display='block';
  document.getElementById('btnAddCadEnvio').style.display='none';
  document.getElementById('novoCadEnvioData').value=hojeStr();
  document.getElementById('novoCadEnvioTipo').value='';
};
window.cancelarFormCadEnvio = function(){
  document.getElementById('formCadastroEnvio').style.display='none';
  document.getElementById('btnAddCadEnvio').style.display='';
};
window.confirmarCadastroEnvio = function(){
  const data=(document.getElementById('novoCadEnvioData')?.value||'').trim();
  const tipo=(document.getElementById('novoCadEnvioTipo')?.value||'').trim();
  if(!data){ toast('Informe a data do envio.','warn'); return; }
  if(!tipo){ toast('Selecione se o envio é parcial ou final.','warn'); return; }
  _cadEnvPendentes.push({ id:'cadenv_'+Date.now(), data, tipo });
  cancelarFormCadEnvio();
  renderListaCadastrosEnviados();
  if(tipo==='final'){
    const btn=document.getElementById('btnAddCadEnvio');
    if(btn){ btn.disabled=true; }
  }
};
window.remCadEnvPend = function(id){
  _cadEnvPendentes=_cadEnvPendentes.filter(c=>c.id!==id);
  renderListaCadastrosEnviados();
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  const all=(obra?.cadastrosEnviados||[]).concat(_cadEnvPendentes);
  const btn=document.getElementById('btnAddCadEnvio');
  if(btn){ btn.disabled=all.some(c=>c.tipo==='final'); }
};

// ── ACTIONS: confirmação de cadastro (genesis) ────────────────────────
window.abrirFormCadConf = function(){
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  const all=(obra?.cadastrosConfirmados||[]).concat(_cadConfPendentes);
  if(all.some(c=>c.tipo==='final')){ toast('Esta obra já possui confirmação de cadastro final.','warn'); return; }
  document.getElementById('formCadastroConf').style.display='block';
  document.getElementById('btnAddCadConf').style.display='none';
  document.getElementById('novoCadConfData').value=hojeStr();
  document.getElementById('novoCadConfTipo').value='';
};
window.cancelarFormCadConf = function(){
  document.getElementById('formCadastroConf').style.display='none';
  document.getElementById('btnAddCadConf').style.display='';
};
window.confirmarCadastroConf = function(){
  const data=(document.getElementById('novoCadConfData')?.value||'').trim();
  const tipo=(document.getElementById('novoCadConfTipo')?.value||'').trim();
  if(!data){ toast('Informe a data da confirmação.','warn'); return; }
  if(!tipo){ toast('Selecione se a confirmação é parcial ou final.','warn'); return; }
  _cadConfPendentes.push({ id:'cadconf_'+Date.now(), data, tipo });
  cancelarFormCadConf();
  renderListaCadastrosConfirmados();
  if(tipo==='final'){
    const btn=document.getElementById('btnAddCadConf');
    if(btn){ btn.disabled=true; }
  }
};
window.remCadConfPend = function(id){
  _cadConfPendentes=_cadConfPendentes.filter(c=>c.id!==id);
  renderListaCadastrosConfirmados();
  const obraId=document.getElementById('obraId')?.value;
  const obra=obras.find(o=>o.id===obraId);
  const all=(obra?.cadastrosConfirmados||[]).concat(_cadConfPendentes);
  const btn=document.getElementById('btnAddCadConf');
  if(btn){ btn.disabled=all.some(c=>c.tipo==='final'); }
};

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
  // Legacy: noop — desligamentos agora gerenciados por renderDesligamentosModal()
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

    // ── Desligamentos: computa scalars para backward compat ────────────
    const _deslActive = _desligamentosEdit.filter(d=>d.status!=='cancelado');
    const _deslLast   = _desligamentosEdit.length ? _desligamentosEdit[_desligamentosEdit.length-1] : null;
    const deslScalar  = {
      desligamentos: _desligamentosEdit,
      dataDesligamento: _deslActive.length ? _deslActive[_deslActive.length-1].data : '',
      desligamentoConfirmado: !!(_deslActive.length && _deslActive[_deslActive.length-1].status==='aprovado'),
      desligamentoCancelado:  !!(_desligamentosEdit.length && _deslActive.length===0),
      desligamentoCanceladoMotivo: _deslLast?.motivoCancelamento || g('oDesligMotivo') || '',
    };

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
      // Desligamentos agora são gerenciados como array; validação de nova data ocorre em adicionarDesligamento()
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
    if(me.perfil==='gerente'||me.perfil==='adm_odi'){
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
        ...deslScalar,
        conclusao:g('oConclusao'), placas:g('oPlacas'), sap:g('oSAP'), serie:g('oSerie'), fabricante:g('oFabricante'),
        // Reset ciente do fiscal quando empreiteira informa kaffa/conclusão
        cienFisc: false,
        potencia:g('oPotencia')?parseFloat(g('oPotencia'))||null:null,
        dataTransf:g('oDataTransf')||null,
        // Só escreve equipamentos se o usuário modificou; caso contrário mantém dado existente
        equipamentosInstalados: _equipModificado ? _equipInstalados : (obraAntiga?.equipamentosInstalados||[]),
        equipamentosRetirados:  _equipModificado ? _equipRetirados  : (obraAntiga?.equipamentosRetirados||[]),
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
        // Gerente vê cadastros em leitura; preserva arrays e scalars existentes
        cadastrosEnviados: obraAntiga?.cadastrosEnviados || [],
        cadastrosConfirmados: obraAntiga?.cadastrosConfirmados || [],
        dataCadastro: obraAntiga?.dataCadastro || '',
        tipoCadastro: obraAntiga?.tipoCadastro || '',
        cadastroConfirmado: obraAntiga?.cadastroConfirmado || false,
        dataCadastroConfirmado: obraAntiga?.dataCadastroConfirmado || '',
        cadastroParcialConfirmado: obraAntiga?.cadastroParcialConfirmado || false,
        dataCadastroParcialConfirmado: obraAntiga?.dataCadastroParcialConfirmado || '',
        cadastroPendencia: obraAntiga?.cadastroPendencia || false,
        cadastroPendenciaDesc: obraAntiga?.cadastroPendenciaDesc || '',
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
        // Só escreve equipamentos se o usuário modificou; caso contrário mantém dado existente
        equipamentosInstalados: _equipModificado ? _equipInstalados : (obraAntiga?.equipamentosInstalados||[]),
        equipamentosRetirados:  _equipModificado ? _equipRetirados  : (obraAntiga?.equipamentosRetirados||[]),
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
      if(_kaffasPendentes.length>0)   _kaffasPendentes=[];
      if(_medicoesPendentes.length>0) _medicoesPendentes=[];
      _cadEnvPendentes=[]; _cadConfPendentes=[];

      // ── ODI: campos específicos e preservação de ações ────────────────────
      if(patch.tipo==='ODI' || obraAntiga?.tipo==='ODI'){
        patch.descricaoODI      = g('oDescricaoODI')      || obraAntiga?.descricaoODI      || null;
        patch.descricaoLivreODI = g('oDescricaoLivreODI') || obraAntiga?.descricaoLivreODI || null;
        // Ações ODI são salvas via odiSalvarCampo (updateDoc direto) — preservar aqui
        ['conclusao','fiscalizacao','kaffaODI','nfEnviadaFlag','nfEnviadaData',
         'nfLancadaData','medida70','medida230','medida280','pendenciasDocODI',
         'devolucaoFinanceiraData','locaisTrabalho',
         // Pendência construtiva ODI (salva via odiRegistrarPendencia/odiResolverPendencia)
         'pendencia','tiposPendencia','pendenciaOutro','pendenciaResolvida',
         'armazenado','armazenamentoData','dataCadastro','tipoCadastro','cadastroConfirmado',
         'cadastroPendencia','cadastroPendenciaDesc',
         'cadastrosEnviados','cadastrosConfirmados'
        ].forEach(f=>{
          if(obraAntiga?.[f] !== undefined) patch[f] = obraAntiga[f];
          else delete patch[f];
        });
        // Remover campos exclusivos de obras RD
        ['kaffa','kaffaEntries','medicao','medicoes','medida280Motivo',
         'regularizacaoData'].forEach(f=>delete patch[f]);
      }
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
        // Só escreve equipamentos se o usuário modificou; caso contrário mantém dado existente
        equipamentosInstalados: _equipModificado ? _equipInstalados : (obraAntiga?.equipamentosInstalados||[]),
        equipamentosRetirados:  _equipModificado ? _equipRetirados  : (obraAntiga?.equipamentosRetirados||[]),
        temRetirado:document.getElementById('oTemRetirado')?.checked||false,
        potenciaRet:g('oPotenciaRet')?parseFloat(g('oPotenciaRet'))||null:null,
        sapRet:g('oSAPRet')||null, serieRet:g('oSerieRet')||null, fabricanteRet:g('oFabricanteRet')||null,
        ...deslScalar,
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
        ...deslScalar,
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
        // Cadastro: array de envios (fiscal adiciona via _cadEnvPendentes)
        cadastrosEnviados: (()=>{
          const existing = obraAntiga?.cadastrosEnviados||[];
          // backward compat: se não há array mas há scalar, preserve como legado (sem migrar)
          return [...existing, ..._cadEnvPendentes];
        })(),
        // Scalars derivados do array de envios (para backward compat/filtros)
        dataCadastro: (()=>{
          const all=[...(obraAntiga?.cadastrosEnviados||[]),..._cadEnvPendentes];
          return all.length ? (all[all.length-1].data||obraAntiga?.dataCadastro||'') : (obraAntiga?.dataCadastro||'');
        })(),
        tipoCadastro: (()=>{
          const all=[...(obraAntiga?.cadastrosEnviados||[]),..._cadEnvPendentes];
          return all.length ? (all[all.length-1].tipo||'') : (obraAntiga?.tipoCadastro||'');
        })(),
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
      if(_cadEnvPendentes.length > 0) _cadEnvPendentes=[];
    _equipModificado = false;

      // ── ODI: preservar campos das ações ODI (salvos via odiSalvarCampo) ──
      // O branch fiscal lê campos do form RD (ocultos para ODI) → sobrescreveria com vazio
      if(obraAntiga?.tipo === 'ODI'){
        ['conclusao','fiscalizacao','kaffaODI',
         'pendencia','tiposPendencia','pendenciaOutro','pendenciaResolvida',
         'dataCadastro','tipoCadastro','cadastroConfirmado','cadastroPendencia','cadastroPendenciaDesc',
         'cadastrosEnviados','cadastrosConfirmados',
         'nfEnviadaFlag','nfEnviadaData','nfLancadaData',
         'medida70','medida230','medida280',
         'devolucaoFinanceiraData','armazenado','locaisTrabalho'
        ].forEach(f=>{
          if(obraAntiga[f] !== undefined) patch[f] = obraAntiga[f];
          else delete patch[f];
        });
        // Remover campos RD que não se aplicam a obras ODI
        ['kaffa','kaffaEntries','medicao','medicoes','regularizacaoData',
         'medida280Motivo'].forEach(f=>delete patch[f]);
      }
    }

    // Patches para genesis (confirmar cadastro via array) e estagiario (só armazenamento)
    if(me.perfil==='genesis'){
      const existingConf = obraAntiga?.cadastrosConfirmados ||
        (obraAntiga?.cadastroConfirmado ? [{id:'legado-conf-1',data:obraAntiga.dataCadastroConfirmado||'',tipo:'final',legado:true}] : []);
      const allConf = [...existingConf, ..._cadConfPendentes];
      const hasFinal   = allConf.some(c=>c.tipo==='final');
      const hasParcial = allConf.some(c=>c.tipo==='parcial');
      const cadPend = gChk('oCadastroPendencia');
      const cadPendDesc = (document.getElementById('oCadastroPendenciaDesc')?.value||'').trim();
      // Derivar scalar de dataCadastroConfirmado a partir do array
      const finalEntry  = hasFinal  ? allConf.filter(c=>c.tipo==='final').slice(-1)[0]  : null;
      const parcialEntry= hasParcial ? allConf.filter(c=>c.tipo==='parcial').slice(-1)[0]: null;
      patch = {
        cadastrosConfirmados: allConf,
        // Scalars derivados (backward compat)
        cadastroConfirmado: hasFinal,
        cadastroParcialConfirmado: hasParcial && !hasFinal,
        dataCadastroConfirmado: finalEntry?.data || (hasFinal ? hojeStr() : ''),
        dataCadastroParcialConfirmado: parcialEntry?.data || '',
        // Fiscal sends entries independently; genesis never clears dataCadastro
        dataCadastro: obraAntiga?.dataCadastro || '',
        tipoCadastro: obraAntiga?.tipoCadastro || '',
        cadastrosEnviados: obraAntiga?.cadastrosEnviados || [],
        cadastroPendencia: cadPend,
        cadastroPendenciaDesc: cadPend ? cadPendDesc : '',
        atualizadaEm: serverTimestamp()
      };
      if(_cadConfPendentes.length > 0) _cadConfPendentes=[];
    }
    if(me.perfil==='estagiario'){
      const finalCheckEl=document.getElementById('oArmazenado');
      const isODIObra = obraAntiga?.tipo === 'ODI';
      patch={ armazenado:finalCheckEl&&!finalCheckEl.disabled?gChk('oArmazenado'):obraAntiga?.armazenado||false,
        contratosAssinado:gChk('oContratosAssinado'),
        projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'), atualizadaEm:serverTimestamp() };
      // RD: também salva medições assinadas; ODI: não tem medições assinadas
      if(!isODIObra) patch.medicoesAssinadas = gChk('oMedicoesAssinadas');
      // ODI: preserva confirmação de cadastro (genesis é quem confirma via arrays)
      if(isODIObra){
        patch.cadastroConfirmado = obraAntiga?.cadastroConfirmado || false;
        patch.dataCadastroConfirmado = obraAntiga?.dataCadastroConfirmado || '';
        patch.cadastrosEnviados    = obraAntiga?.cadastrosEnviados    || [];
        patch.cadastrosConfirmados = obraAntiga?.cadastrosConfirmados || [];
      }
    }
    // adm_odi: armazenamento ODI — apenas ao editar obras existentes (nova obra usa patch completo)
    if(me.perfil==='adm_odi' && isEdit){
      const finalCheckEl=document.getElementById('oArmazenado');
      // Identificação da obra ODI (fiscal, empreiteira, datas, prazo…) — adm_odi pode corrigir depois de aberta
      const _identODI={};
      if(obraAntiga?.tipo==='ODI'){
        ['numero','tipo','cidade','empreiteira','fiscal','dataAbertura','prazoExecucao','dataLimite','usc','ulv',
         'descricao','enquadramento','programa','equipamentoRef','descricaoODI','descricaoLivreODI'].forEach(k=>{
          if(patch[k]!==undefined) _identODI[k]=patch[k];
        });
        if(!_identODI.numero) delete _identODI.numero;
        if(!_identODI.tipo) delete _identODI.tipo;
      }
      patch={ ..._identODI, armazenado:finalCheckEl&&!finalCheckEl.disabled?gChk('oArmazenado'):obraAntiga?.armazenado||false,
        contratosAssinado:gChk('oContratosAssinado'),
        projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'),
        // Preserva confirmação de cadastro (genesis é quem confirma)
        cadastroConfirmado: obraAntiga?.cadastroConfirmado || false,
        dataCadastroConfirmado: obraAntiga?.dataCadastroConfirmado || '',
        cadastrosEnviados:    obraAntiga?.cadastrosEnviados    || [],
        cadastrosConfirmados: obraAntiga?.cadastrosConfirmados || [],
        atualizadaEm:serverTimestamp() };
    }

    // Registrar data de armazenamento na primeira confirmação (cobre gerente, estagiário, adm_odi)
    if(isEdit && patch.armazenado && !obraAntiga?.armazenado && !patch.armazenamentoData){
      patch.armazenamentoData = hojeStr();
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
      // Nota: _kaffasPendentes já foi limpado na linha acima (empreiteira path).
      // Compara tamanhos antigo vs. novo para detectar se houve adição.
      if((me.perfil==='empreiteira'||me.perfil==='gerente'||me.perfil==='adm_odi') && patch.kaffaEntries){
        // Apenas os kaffas realmente novos (proteção contra slice(-0) que retorna array completo)
        const qtdAntigos = (obraAntiga?.kaffaEntries||[]).length;
        const qtdNovos   = patch.kaffaEntries.length - qtdAntigos;
        if(qtdNovos > 0){
          const novosKaffas = patch.kaffaEntries.slice(-qtdNovos);
          for(const k of novosKaffas){
            console.log('[Email] Disparando enviarEmailKaffa tipo=',k.tipo,'data=',k.data);
            await enviarEmailKaffa({...obraAntiga,...patch}, k.tipo, k.data);
          }
        }
      }
      // Email: obra concluída pela empreiteira → avisa fiscal
      // Email: conclusão informada ou atualizada por empreiteira OU gerente
      // Dispara sempre que a data de conclusão MUDAR (primeira vez ou atualização)
      if(patch.conclusao &&
         patch.conclusao !== (obraAntiga?.conclusao||'') &&
         (me.perfil==='empreiteira'||me.perfil==='gerente'||me.perfil==='adm_odi')){
        console.log('[Email] Disparando enviarEmailConclusao — conclusao mudou de',obraAntiga?.conclusao,'para',patch.conclusao);
        await enviarEmailConclusao({...obraAntiga,...patch});
      }
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
      // E-mail quando a empreiteira informa (ou altera) um problema executivo
      if(me.perfil==='empreiteira' && patch.impedimento &&
         (!obraAntiga?.impedimento || (obraAntiga?.tipoImpedimento||'')!==(patch.tipoImpedimento||'') || (obraAntiga?.impedimentoOutro||'')!==(patch.impedimentoOutro||''))){
        try{ await enviarEmailImpedimento({...obraAntiga,...patch}, !!obraAntiga?.impedimento); }catch(e){ console.warn('[Email Problema Executivo]',e); }
      }
      // E-mail quando empreiteira regulariza pendência
      if(me.perfil==='empreiteira'&&!obraAntiga?.regularizacaoData&&patch.regularizacaoData){
        console.log('[Email] Disparando enviarEmailRegularizacao');
        await enviarEmailRegularizacao({...obraAntiga,...patch});
      }
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
          <div class="ut-acts">${(me.perfil==='adm_odi'&&u.perfil!=='empreiteira')?'<span style="font-size:10px;color:var(--muted)">somente Gerente</span>':`
            <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.uid}')" title="Editar">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="resetSenhaUsuario('${u.email||''}')" title="Enviar redefinição de senha" style="font-size:10px">🔑</button>
            ${u.uid!==me.uid?`<button class="btn btn-danger btn-sm" onclick="delUser('${u.uid}')">🗑️</button>`:''}`}
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
  // Adm_ODI: somente usuários de empreiteira
  const _selPerfil=document.getElementById('uPerfil');
  if(me.perfil==='adm_odi'){
    if(!isEdit){ _selPerfil.value='empreiteira'; onPerfilChange(); }
    _selPerfil.disabled=true;
  } else { _selPerfil.disabled=false; }
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
    if(me.perfil==='adm_odi' && perfil!=='empreiteira'){ toast('O perfil Adm_ODI só pode criar/editar usuários de empreiteira.','err'); return; }
    if(perfil==='empreiteira' && !vinculo){ toast('Selecione a empreiteira vinculada.','err'); return; }

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
    closeUserModal(); await renderUsers(); syncDiretorioFiscais();
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
  await deleteDoc(doc(db,'usuarios',uid)); toast('Usuário removido.','warn'); await renderUsers(); syncDiretorioFiscais();
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

// ── Diretório de e-mails dos fiscais ────────────────────────────────
// Empreiteira/fiscal não conseguem ler a coleção "usuarios" (regra do Firestore), então a lista
// "users" ficava vazia e o fiscal nunca era encontrado. O Gerente publica um diretório
// (config/diretorioFiscais: nome do fiscal → e-mail) que qualquer usuário logado consegue ler.
let _dirFiscais=null;
async function syncDiretorioFiscais(){
  if(!me || me.perfil!=='gerente') return;
  try{
    await loadUsers();
    const lista=users.filter(u=>(u.perfil==='fiscal'||u.perfil==='fiscal_adm')&&u.vinculo&&u.email)
      .map(u=>({nome:u.vinculo,email:u.email}));
    // Gerentes regionais (mesma divisão por município usada nos Pedidos): acha o usuário gerente pelo nome
    const gerentes=[];
    Object.keys(GERENTES_MUNICIPIOS).forEach(g=>{
      const u=users.find(x=>x.perfil==='gerente'&&x.email&&pdNorm(x.nome).split(' ').includes(pdNorm(g)));
      if(u) gerentes.push({regiao:g,nome:u.nome||g,email:u.email});
    });
    await setDoc(doc(db,'config','diretorioFiscais'),{lista,gerentes,atualizadoEm:serverTimestamp()});
    _dirFiscais=lista; _dirGerentes=gerentes;
  }catch(e){ console.warn('[SPPC Email] syncDiretorioFiscais:',e.message); }
}
let _dirGerentes=null;
function gerenteDaCidade(cidade){
  const c=pdNorm(cidade);
  for(const [g,l] of Object.entries(GERENTES_MUNICIPIOS)) if(l.some(m=>pdNorm(m)===c)) return g;
  return null;
}
async function emailGerenteRegional(cidade){
  const g=gerenteDaCidade(cidade); if(!g) return null;
  if(!_dirGerentes){
    try{ const s=await getDoc(doc(db,'config','diretorioFiscais')); _dirGerentes=s.exists()?(s.data().gerentes||[]):[]; }
    catch(e){ console.warn('[SPPC Email] diretório de gerentes:',e.message); _dirGerentes=[]; }
  }
  const d=_dirGerentes.find(x=>x.regiao===g);
  return d?d.email:null;
}
// Cópias dos avisos ao fiscal: empreiteira responsável pela obra + gerente da região (pela cidade) + gerente geral
async function ccAvisoFiscal(obra, para){
  const emp=empreiteiras.find(e=>(e.nome||'').toUpperCase()===(obra.empreiteira||'').toUpperCase());
  const reg=await emailGerenteRegional(obra.cidade);
  const alvo=String(para||'').toLowerCase();
  return [...new Set([emp?.email, reg, EMAILJS_CONFIG?.emailGerente].filter(Boolean).map(x=>String(x).trim()))]
    .filter(x=>x.toLowerCase()!==alvo).join(',');
}
async function emailDoFiscal(nome){
  if(!nome) return null;
  const alvo=pdNorm(nome);
  let u=users.find(x=>(x.perfil==='fiscal'||x.perfil==='fiscal_adm')&&x.email&&pdNorm(x.vinculo)===alvo);
  if(u) return u.email;
  try{
    const s=await getDoc(doc(db,'config','diretorioFiscais'));
    _dirFiscais=s.exists()?(s.data().lista||[]):[];
  }catch(e){ console.warn('[SPPC Email] diretório de fiscais:',e.message); _dirFiscais=_dirFiscais||[]; }
  const d=_dirFiscais.find(x=>pdNorm(x.nome)===alvo);
  return d?d.email:null;
}
function _quemInformou(obra){
  if(me?.perfil==='empreiteira') return `A empreiteira ${obra.empreiteira}`;
  return `${me?.nome||'Usuário'} (${me?.perfil||''})`;
}

async function enviarEmailKaffa(obra, tipoKaffa, dataKaffa){
  if(!obra.fiscal){ console.warn('[Email Kaffa] Obra sem fiscal.'); return; }
  const _emF=await emailDoFiscal(obra.fiscal);
  const fiscal = _emF?{email:_emF}:null;
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

${_quemInformou(obra)} registrou o seguinte:

• Tipo: ${tipoLabel}
• Data: ${fmtTxt(dataKaffa)}
• Obra: ${obra.numero}
• Cidade: ${obra.cidade}

Aguarda medição correspondente.`,
    fiscal.email, await ccAvisoFiscal(obra, fiscal.email)
  );
  // (kaffa tipo+data é naturalmente único — sem marcarEnviado)
}

async function enviarEmailConclusao(obra){
  if(!obra.fiscal) return;
  const _emF=await emailDoFiscal(obra.fiscal);
  const fiscal = _emF?{email:_emF}:null;
  if(!fiscal?.email){
    console.warn('[Email Conclusão] Fiscal não encontrado ou sem email. vinculo=',obra.fiscal);
    const gerEmail = EMAILJS_CONFIG?.emailGerente;
    if(gerEmail){
      await enviarEmail(
        `SPPC ARLAG – Conclusão sem fiscal | Obra ${obra.numero}`,
        `Atenção: conclusão registrada na obra ${obra.numero} (${obra.cidade}) em ${fmtTxt(obra.conclusao)}, mas o fiscal ${obra.fiscal||'—'} não foi localizado no diretório de e-mails. Confira o "Nome do Fiscal" no cadastro de usuários (deve ser igual ao da obra).`,
        gerEmail, ''
      );
    }
    return;
  }
  // E-mail imediato — sem verificação de duplicata (disparado por mudança de estado)
  await enviarEmail(
    `SPPC ARLAG – Obra concluída | ${obra.numero} – ${obra.cidade}`,
    `Olá, Fiscal!

${_quemInformou(obra)} informou a conclusão da obra${obra.tipo==='ODI'?' (ODI)':''}.

• Obra: ${obra.numero}
• Cidade: ${obra.cidade}
• Data de Conclusão: ${fmtTxt(obra.conclusao)}

Aguarda fiscalização.`,
    fiscal.email, await ccAvisoFiscal(obra, fiscal.email)
  );
  // (sem marcarEnviado — condição !obraAntiga?.conclusao previne reenvio)
}

async function enviarEmailPendencia(obra){
  // Match case-insensitive: nome da obra pode ter capitalização diferente
  const emp = empreiteiras.find(e=>(e.nome||'').toUpperCase()===(obra.empreiteira||'').toUpperCase());
  if(!emp?.email){
    console.warn('[Email Pendência] Empreiteira não encontrada ou sem email. empreiteira=',obra.empreiteira,'empreiteiras=',empreiteiras.map(e=>e.nome));
    return;
  }
  const chave = `pendencia_${obra.id}`;
  if(await jaEnviou(chave)) return;
  const tipos = (obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', ');
  // CC: fiscal que registrou a pendência + gerente
  // (usa o diretório de fiscais — a lista "users" fica vazia para o perfil fiscal — e o e-mail de quem está logado)
  const _emFiscObra = await emailDoFiscal(obra.fiscal);
  const _emQuemRegistrou = (me?.perfil==='fiscal'||me?.perfil==='fiscal_adm') ? (me.email||'') : '';
  const _emGerReg = await emailGerenteRegional(obra.cidade);
  const ccEmails = [...new Set([_emQuemRegistrou, _emFiscObra, _emGerReg, EMAILJS_CONFIG.emailGerente].filter(Boolean))].join(',');
  await enviarEmail(
    `SPPC ARLAG – Pendência registrada | Obra ${obra.numero} – ${obra.cidade}`,
    `Atenção, Empreiteira!

Foi registrada uma pendência na sua obra.

• Obra: ${obra.numero} – ${obra.cidade}
• Tipo: ${tipos}
• Prazo para regularização: ${fmtTxt(obra.prazoPendencia)}
• Fiscal responsável: ${obra.fiscal||'—'}

Acesse o sistema SPPC ARLAG para regularizar.`,
    emp.email, ccEmails
  );
  // (sem marcarEnviado)
}

// Problema executivo informado pela empreiteira → fiscal, com cópia para o gerente da região e o gerente geral
async function enviarEmailImpedimento(obra, alteracao){
  const emFiscal = await emailDoFiscal(obra.fiscal);
  const emReg    = await emailGerenteRegional(obra.cidade);
  const geral    = EMAILJS_CONFIG?.emailGerente;
  const para     = emFiscal || emReg || geral;
  if(!para){ console.warn('[Email Problema Executivo] nenhum destinatário.'); return; }
  const cc=[...new Set([emReg, geral].filter(Boolean))].filter(x=>x.toLowerCase()!==String(para).toLowerCase()).join(',');
  const tipo = obra.tipoImpedimento==='Outro' ? ('Outro'+(obra.impedimentoOutro?' — '+obra.impedimentoOutro:'')) : (obra.tipoImpedimento||'não especificado');
  await enviarEmail(
    `SPPC ARLAG – Problema Executivo ${alteracao?'alterado':'informado'} | Obra ${obra.numero}`,
    `A empreiteira ${obra.empreiteira} ${alteracao?'alterou o':'informou um'} problema executivo que impede/dificulta a execução da obra.

• Obra: ${obra.numero}
• Cidade: ${obra.cidade}
• Tipo do problema: ${tipo}
• Fiscal: ${obra.fiscal||'—'}${emFiscal?'':' (e-mail do fiscal não localizado — aviso enviado à gerência)'}
• Informado em: ${fmtTxt(pdHojeStr())} por ${me?.nome||obra.empreiteira}

Verifique no sistema SPPC ARLAG e dê a tratativa necessária.`,
    para, cc
  );
}
async function enviarEmailRegularizacao(obra){
  const _emFR = await emailDoFiscal(obra.fiscal);
  const fiscal = _emFR?{email:_emFR}:null;
  if(!fiscal?.email){ console.warn('[Email Regularização] Fiscal não encontrado ou sem email.'); return; }
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
    fiscal.email, await ccAvisoFiscal(obra, fiscal.email)
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
    // "Aguard. Fiscalização" inclui todas as obras com conclusao mas sem fiscalizacao
    // (inclui "Encaminhar Cadastro Urgente" que são obras com >15d sem fiscalizar)
    if (f.status === 'Aguard. Fiscalização'){
      if (!(o.conclusao && !o.fiscalizacao)) return false;
    } else if (f.status && statusOf(o) !== f.status) {
      return false;
    }
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
  const labels={'via_fechamento':'Via deixada para fechamento','via_simo':'Via enviada para cadastro SIMO','sem_medida70':'Sem Medida 70','sem_medida230':'Sem Medida 230','med230_sem280':'Med.230 sem 280','ag_armazenar':'Ag. Armazenar','encerradas':'Encerradas completas','proc_cancelamento':'Processo de Cancelamento'};
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
  // Colar lista de obras: disponível em todas as operações em lote
  const _bc=document.getElementById('btnBulkColar'); if(_bc) _bc.style.display='inline-flex';
  const _bw=document.getElementById('bulkColarWrap'); if(_bw) _bw.style.display='none';
  const _bt=document.getElementById('bulkColarTxt'); if(_bt) _bt.value='';
  const _bi=document.getElementById('bulkColarInfo'); if(_bi) _bi.innerHTML='';
  window.renderObras();
};
// ── Operações em lote: obras coladas em coluna ──────────────────────────
function bulkColadas(){
  const w=document.getElementById('bulkColarWrap'); const t=document.getElementById('bulkColarTxt');
  if(!w||!t||w.style.display==='none'||!window._bulkMode) return {ids:[],naoAchadas:[],total:0};
  const nums=[...new Set((t.value||'').split(/[^0-9A-Za-z]+/).map(x=>x.trim()).filter(Boolean))];
  const vis=visibleObras(); const ids=[], naoAchadas=[];
  nums.forEach(n=>{ const o=vis.find(x=>String(x.numero||'').trim()===n); if(o) ids.push(o.id); else naoAchadas.push(n); });
  return {ids,naoAchadas,total:nums.length};
}
window.bulkToggleColar=function(){
  const w=document.getElementById('bulkColarWrap'); if(!w) return;
  w.style.display=w.style.display==='none'?'block':'none';
  if(w.style.display==='block') document.getElementById('bulkColarTxt')?.focus();
  bulkColarPreview();
};
window.bulkColarPreview=function(){
  const el=document.getElementById('bulkColarInfo'); if(!el) return;
  const r=bulkColadas();
  if(!r.total){ el.innerHTML=''; return; }
  el.innerHTML=`<div style="color:#22C55E;font-weight:700">✅ ${r.ids.length} obra(s) localizada(s)</div>`+
    (r.naoAchadas.length?`<div style="color:#EF4444;font-weight:700;margin-top:4px">❌ ${r.naoAchadas.length} não encontrada(s) no sistema:</div><div style="color:#EF4444;font-family:monospace">${r.naoAchadas.join(', ')}</div>`:'');
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
  const _col = bulkColadas();
  const ids = [...new Set([...bulkSelecionadas(), ..._col.ids])];
  if(!ids.length){ toast(_col.total?'Nenhuma das obras coladas foi encontrada no sistema.':'Selecione (ou cole) pelo menos uma obra.','err'); return; }
  if(_col.naoAchadas.length && !confirm(`${_col.naoAchadas.length} obra(s) colada(s) não foram encontradas e serão ignoradas:\n${_col.naoAchadas.join(', ')}\n\nAplicar nas ${ids.length} obra(s) localizadas?`)) return;
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
let _equipRetirados  = [];
let _equipModificado  = false;   // [{id,potencia,sap,serie,fabricante,dataTransf}]

window.adicionarEquipInstalado = function(){
  _equipModificado = true;
  const id = `ei_${Date.now()}`;
  _equipInstalados.push({id,placas:'',potencia:'',sap:'',serie:'',fabricante:'',dataTransf:''});
  renderEquipInstalados();
};
window.adicionarEquipRetirado = function(){
  _equipModificado = true;
  const id = `er_${Date.now()}`;
  _equipRetirados.push({id,potencia:'',sap:'',serie:'',fabricante:'',dataTransf:''});
  renderEquipRetirados();
};
window.removerEquipInstalado = function(id){
  _equipModificado = true;
  _equipModificado = true;
  _equipInstalados = _equipInstalados.filter(e=>e.id!==id);
  renderEquipInstalados();
};
window.removerEquipRetirado = function(id){
  _equipModificado = true;
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
  if(item){ item[campo]=valor; _equipModificado = true; }
};

function initEquipFromObra(obra){
  _equipModificado = false;  // reset: user hasn't touched equipment yet
  // cópias independentes: editar na tela não altera o dado da obra em memória antes de salvar
  _equipInstalados = obra?.equipamentosInstalados?.length ? obra.equipamentosInstalados.map(e=>({...e})) : [];
  _equipRetirados  = obra?.equipamentosRetirados?.length  ? obra.equipamentosRetirados.map(e=>({...e}))  : [];
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




// ── Atualiza status de um desligamento individualmente ─────────────────────
window.atualizarStatusDesl = async function(idx, novoStatus){
  const docId = window._desl_docId||'';
  if(!docId){ toast('ID do documento não encontrado.','err'); return; }
  try{
    const snap = await getDoc(doc(db,'desligamentos',docId));
    if(!snap.exists()){ toast('Documento não encontrado.','err'); return; }
    const data = snap.data();
    const entradas = [...(data.entradas||[])];
    if(idx<0||idx>=entradas.length){ toast('Entrada não encontrada.','err'); return; }
    entradas[idx] = {...entradas[idx], status: novoStatus};
    await updateDoc(doc(db,'desligamentos',docId),{entradas, atualizadaEm:serverTimestamp()});
    toast('✓ Status atualizado.','ok');
    // Re-render após 300ms
    setTimeout(()=>{ if(typeof renderDesligamentos==='function') renderDesligamentos(); }, 300);
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

// ── renderEquipView: mostra equipamentos ao fiscal/gerente (read-only) ──────
function renderEquipView(obra){
  const cont = document.getElementById('secTransfViewBody');
  if(!cont) return;

  const equipsInst = obra?.equipamentosInstalados||[];
  const equipsRet  = obra?.equipamentosRetirados||[];

  // Migra campos antigos se não houver array
  const instalados = equipsInst.length>0 ? equipsInst : (obra?.placas||obra?.sap ? [{
    placas:obra.placas||'—', potencia:obra.potencia||'—', sap:obra.sap||'—',
    serie:obra.serie||'—', fabricante:obra.fabricante||'—', dataTransf:obra.dataTransf||'—'
  }] : []);
  const retirados  = equipsRet.length>0 ? equipsRet : (obra?.potenciaRet||obra?.sapRet ? [{
    potencia:obra.potenciaRet||'—', sap:obra.sapRet||'—',
    serie:obra.serieRet||'—', fabricante:obra.fabricanteRet||'—'
  }] : []);

  let html = '';
  if(instalados.length){
    html += '<div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px">⚡ Instalados ('+instalados.length+')</div>';
    instalados.forEach((e,i)=>{
      html += `<div style="background:var(--surface2);border-radius:6px;padding:8px;margin-bottom:6px;font-size:10px">
        <div style="font-weight:700;margin-bottom:4px">Transformador ${i+1}</div>
        <div class="fg-grid">
          <div><span style="color:var(--muted)">Placas:</span> ${e.placas||'—'}</div>
          <div><span style="color:var(--muted)">Potência:</span> ${e.potencia||'—'} kVA</div>
          <div><span style="color:var(--muted)">SAP:</span> ${e.sap||'—'}</div>
          <div><span style="color:var(--muted)">Série:</span> ${e.serie||'—'}</div>
          <div><span style="color:var(--muted)">Fabricante:</span> ${e.fabricante||'—'}</div>
          ${e.dataTransf?`<div><span style="color:var(--muted)">Data Transf.:</span> ${fmtTxt(e.dataTransf)}</div>`:''}
        </div>
      </div>`;
    });
  }
  if(retirados.length){
    html += '<div style="font-size:10px;font-weight:700;color:#EF4444;margin:8px 0 6px">⬇️ Retirados ('+retirados.length+')</div>';
    retirados.forEach((e,i)=>{
      html += `<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:8px;margin-bottom:6px;font-size:10px">
        <div style="font-weight:700;margin-bottom:4px;color:#EF4444">Retirado ${i+1}</div>
        <div class="fg-grid">
          <div><span style="color:var(--muted)">Potência:</span> ${e.potencia||'—'} kVA</div>
          <div><span style="color:var(--muted)">SAP:</span> ${e.sap||'—'}</div>
          <div><span style="color:var(--muted)">Série:</span> ${e.serie||'—'}</div>
          <div><span style="color:var(--muted)">Fabricante:</span> ${e.fabricante||'—'}</div>
        </div>
      </div>`;
    });
  }
  if(!html) html = '<div style="font-size:10px;color:var(--muted)">Nenhum equipamento informado ainda.</div>';
  cont.innerHTML = html;
}

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
  else if(_filtroRapidoAtivo==='ag_armazenar')        base=base.filter(o=>!o.cancelado&&!o.armazenado&&o.medida280);
  else if(_filtroRapidoAtivo==='via_fechamento')      base=base.filter(o=>o.viaFechamento&&!o.cancelado);
  else if(_filtroRapidoAtivo==='via_simo')            base=base.filter(o=>o.viaCadastroSimo&&!o.cancelado);
  else if(_filtroRapidoAtivo==='encerradas')          base=base.filter(o=>o.armazenado);
  else if(_filtroRapidoAtivo==='proc_cancelamento')   base=base.filter(o=>o.processoCancelamento&&!o.cancelado);
  gerarXLSX(aplicarFiltros(base),'obras_filtradas.xlsx');
};
window.exportCSV=window.exportXLSX;
window.exportCSVFiltrado=window.exportXLSXFiltrado;

// ── EXPORTAR BASE HISTÓRICA (obras encerradas) ──────────────────────
window.exportarBaseHistorica = async function(){
  toast('Gerando base histórica…');
  try {
    await loadSheetJS();
    const XLSX = window.XLSX;

    // Encerrada = medida280 + armazenado
    const encerradas = obras.filter(o => o.medida280 && o.armazenado);
    const rdList  = encerradas.filter(o => o.tipo !== 'ODI');
    const odiList = encerradas.filter(o => o.tipo === 'ODI');

    const d=(v)=>{ if(!v)return ''; if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)){ const [y,m,dy]=v.split('-'); return `${dy}/${m}/${y}`; } return v; };
    const n=(v)=>v!=null&&v!==''?v:'';

    // ── Aba RD ─────────────────────────────────────────────────────
    const rdHeader=[
      'Número','Cidade','Tipo Obra','Empreiteira Executora','Fiscal','Data Abertura','Data Conclusão','Data Fiscalização',
      'Medida 70','Medida 230','Medida 280',
      'Qtd KAFFAs','Qtd KAFFA Parcial','Data Último KAFFA Parcial','Data KAFFA Final',
      'Qtd Medições','Qtd Medições Parcial','Data Última Medição Parcial','Data Medição Final',
      'Qtd Envios Cadastro','Qtd Env.Cadastro Parcial','Data Último Env.Parcial','Data Env.Final',
      'Qtd Conf.Cadastro Genesis','Qtd Conf.Parcial Genesis','Data Última Conf.Parcial Genesis','Data Conf.Final Genesis',
      'Cadastro Confirmado','Pendência Cadastro','Descrição Pendência Cadastro',
      'Contratos Assinados','Medições Assinadas','Projetos As-Built','Caixa Armazenada','Data Armazenamento',
      'Equip.Instalados (qtd)','Potências Instaladas','SAPs Instalados','Séries Instaladas','Data(s) Instalação',
      'Equip.Retirados (qtd)','Potências Retiradas','SAPs Retirados','Séries Retiradas','Data(s) Retirada'
    ];
    const rdRows = rdList.map(o=>{
      const kaffas  = o.kaffaEntries  || (o.kaffa  ? [{data:o.kaffa,  tipo:'final'}] : []);
      const meds    = o.medicoes      || (o.medicao ? [{data:o.medicao, tipo:'final'}] : []);
      const cEnv    = o.cadastrosEnviados   || (o.dataCadastro ? [{data:o.dataCadastro, tipo:o.tipoCadastro||'final'}] : []);
      const cConf   = o.cadastrosConfirmados|| (o.cadastroConfirmado ? [{data:o.dataCadastroConfirmado||'', tipo:'final'}] : []);
      const equipI  = o.equipamentosInstalados || [];
      const equipR  = o.equipamentosRetirados  || [];
      const kParcial= kaffas.filter(k=>k.tipo==='parcial');
      const kFinal  = kaffas.filter(k=>k.tipo==='final');
      const mParcial= meds.filter(m=>m.tipo==='parcial');
      const mFinal  = meds.filter(m=>m.tipo==='final');
      const cEnvP   = cEnv.filter(c=>c.tipo==='parcial');
      const cEnvF   = cEnv.filter(c=>c.tipo==='final');
      const cConfP  = cConf.filter(c=>c.tipo==='parcial');
      const cConfF  = cConf.filter(c=>c.tipo==='final');
      return [
        n(o.numero), n(o.cidade), n(o.tipo)||'RD', n(o.empreiteira), n(o.fiscal), d(o.dataAbertura||o.abertura), d(o.conclusao), d(o.fiscalizacao),
        d(o.medida70), d(o.medida230), d(o.medida280),
        kaffas.length, kParcial.length,
        kParcial.length ? d(kParcial.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        kFinal.length   ? d(kFinal[0].data) : '',
        meds.length, mParcial.length,
        mParcial.length ? d(mParcial.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        mFinal.length   ? d(mFinal[0].data) : '',
        cEnv.length, cEnvP.length,
        cEnvP.length ? d(cEnvP.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        cEnvF.length ? d(cEnvF[0].data) : '',
        cConf.length, cConfP.length,
        cConfP.length ? d(cConfP.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        cConfF.length ? d(cConfF[0].data) : '',
        o.cadastroConfirmado ? 'Sim' : 'Não',
        o.cadastroPendencia  ? 'Sim' : 'Não',
        n(o.cadastroPendenciaDesc),
        o.contratosAssinado  ? 'Sim' : 'Não',
        o.medicoesAssinadas  ? 'Sim' : 'Não',
        o.projetosAsBuilt    ? 'Sim' : 'Não',
        n(o.caixaArmazenada), d(o.armazenamentoData),
        equipI.length,
        equipI.map(e=>n(e.potencia)).join('; '),
        equipI.map(e=>n(e.sap)).join('; '),
        equipI.map(e=>n(e.serie)).join('; '),
        equipI.map(e=>d(e.dataTransf)).join('; '),
        equipR.length,
        equipR.map(e=>n(e.potencia)).join('; '),
        equipR.map(e=>n(e.sap)).join('; '),
        equipR.map(e=>n(e.serie)).join('; '),
        equipR.map(e=>d(e.dataTransf)).join('; ')
      ];
    });

    // ── Aba ODI ────────────────────────────────────────────────────
    const odiHeader=[
      'Número','Cidade','Empreiteira Executora','Fiscal','Data Abertura','Data Fiscalização','Data KAFFA ODI',
      'NF Enviada','Data NF Enviada','Data NF Lançada',
      'Medida 70','Medida 230','Medida 280',
      'Qtd Envios Cadastro','Qtd Env.Cadastro Parcial','Data Último Env.Parcial','Data Env.Final',
      'Qtd Conf.Cadastro Genesis','Qtd Conf.Parcial Genesis','Data Última Conf.Parcial Genesis','Data Conf.Final Genesis',
      'Cadastro Confirmado','Pendência Cadastro','Descrição Pendência Cadastro',
      'Contratos Assinados','Projetos As-Built','Caixa Armazenada','Data Armazenamento'
    ];
    const odiRows = odiList.map(o=>{
      const cEnv  = o.cadastrosEnviados    || (o.dataCadastro ? [{data:o.dataCadastro, tipo:o.tipoCadastro||'final'}] : []);
      const cConf = o.cadastrosConfirmados || (o.cadastroConfirmado ? [{data:o.dataCadastroConfirmado||'', tipo:'final'}] : []);
      const cEnvP = cEnv.filter(c=>c.tipo==='parcial');
      const cEnvF = cEnv.filter(c=>c.tipo==='final');
      const cConfP= cConf.filter(c=>c.tipo==='parcial');
      const cConfF= cConf.filter(c=>c.tipo==='final');
      return [
        n(o.numero), n(o.cidade), n(o.empreiteira), n(o.fiscal), d(o.dataAbertura||o.abertura), d(o.fiscalizacao), d(o.kaffaODI),
        o.nfEnviadaFlag ? 'Sim' : 'Não', d(o.nfEnviadaData), d(o.nfLancadaData),
        d(o.medida70), d(o.medida230), d(o.medida280),
        cEnv.length, cEnvP.length,
        cEnvP.length ? d(cEnvP.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        cEnvF.length ? d(cEnvF[0].data) : '',
        cConf.length, cConfP.length,
        cConfP.length ? d(cConfP.sort((a,b)=>a.data>b.data?-1:1)[0].data) : '',
        cConfF.length ? d(cConfF[0].data) : '',
        o.cadastroConfirmado ? 'Sim' : 'Não',
        o.cadastroPendencia  ? 'Sim' : 'Não',
        n(o.cadastroPendenciaDesc),
        o.contratosAssinado  ? 'Sim' : 'Não',
        o.projetosAsBuilt    ? 'Sim' : 'Não',
        n(o.caixaArmazenada), d(o.armazenamentoData)
      ];
    });

    const wb = XLSX.utils.book_new();
    const wsRD  = XLSX.utils.aoa_to_sheet([rdHeader,  ...rdRows]);
    const wsODI = XLSX.utils.aoa_to_sheet([odiHeader, ...odiRows]);
    XLSX.utils.book_append_sheet(wb, wsRD,  'RD Encerradas');
    XLSX.utils.book_append_sheet(wb, wsODI, 'ODI Encerradas');

    // ── Aba Obras Canceladas ───────────────────────────────────────
    const canceladas = obras.filter(o => o.cancelado);
    const cancHeader=['Número','Tipo Obra','Cidade','Empreiteira Executora','Fiscal','Descrição','Equip. Referência',
      'Data Abertura','Data Cancelamento','Motivo do Cancelamento','Data Conclusão','Data Fiscalização','Medida 70','Medida 230','Medida 280'];
    const cancRows = canceladas.map(o=>[
      n(o.numero), n(o.tipo), n(o.cidade), n(o.empreiteira), n(o.fiscal), n(o.descricao), n(o.equipamentoRef),
      d(o.dataAbertura||o.abertura), d(o.dataCancelamento), n(o.motivoCancelamento), d(o.conclusao), d(o.fiscalizacao), d(o.medida70), d(o.medida230), d(o.medida280)
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cancHeader, ...cancRows]), 'Obras Canceladas');

    const today=hojeStr().replace(/-/g,'');
    XLSX.writeFile(wb, `historico_obras_${today}.xlsx`);
    toast(`✓ Histórico exportado: ${encerradas.length} encerradas (${rdList.length} RD + ${odiList.length} ODI) e ${canceladas.length} canceladas.`);
    return {ok:true, encerradas:encerradas.length, canceladas:canceladas.length};
  } catch(e){
    console.error('exportarBaseHistorica error:',e);
    toast('Erro ao gerar histórico: '+e.message,'err');
  }
};

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

// ══ LIMPEZA MENSAL: exclui as obras ENCERRADAS (Medida 280 + armazenada) e CANCELADAS ══
// Sempre exporta o histórico antes (mesmo critério do "Exportar Histórico"), para guardar no SharePoint.
window.limparEncerradasCanceladas=async function(){
  if(me?.perfil!=='gerente'){ toast('Somente o gerente pode excluir obras encerradas/canceladas.','err'); return; }
  const enc=obras.filter(o=>o.medida280&&o.armazenado&&!o.cancelado);
  const canc=obras.filter(o=>o.cancelado);
  if(!enc.length&&!canc.length){ toast('Não há obras encerradas nem canceladas para excluir.','warn'); return; }
  if(!confirm(`Limpeza de obras sem movimentação\n\n• ${enc.length} obra(s) ENCERRADA(S) (Medida 280 + armazenada)\n• ${canc.length} obra(s) CANCELADA(S)\n\nPrimeiro o sistema vai baixar o histórico em Excel (para guardar no SharePoint).\nDepois pedirá a confirmação da exclusão.\n\nContinuar?`)) return;
  let exp=null;
  try{ exp=await window.exportarBaseHistorica(); }catch(e){ console.error(e); }
  if(!exp||!exp.ok){ toast('O histórico não foi exportado — nada foi excluído.','err'); return; }
  const opcao=prompt(`O arquivo de histórico foi baixado. Confira se ele abriu e foi salvo.\n\nO que deseja excluir do sistema? Digite:\n\n  TUDO  → ${enc.length} encerrada(s) + ${canc.length} cancelada(s)\n  ENCERRADAS  → somente as ${enc.length} encerrada(s)\n  CANCELADAS  → somente as ${canc.length} cancelada(s)\n\nEsta ação NÃO pode ser desfeita.`);
  const op=(opcao||'').trim().toUpperCase();
  const lista=op==='TUDO'?[...enc,...canc]:op==='ENCERRADAS'?enc:op==='CANCELADAS'?canc:null;
  if(!lista){ toast('Exclusão cancelada (nada foi excluído).','warn'); return; }
  if(!lista.length){ toast('Nenhuma obra nessa opção.','warn'); return; }
  const btn=document.getElementById('btnLimparEncerradas'); if(btn){ btn.disabled=true; btn.textContent='Excluindo…'; }
  let count=0, err=0;
  for(const o of lista){
    try{ await deleteDoc(doc(db,'obras',o.id)); count++; if(count%25===0 && btn) btn.textContent=`Excluindo… ${count}/${lista.length}`; }
    catch(e){ console.error('Erro ao excluir',o.numero,e.message); err++; }
  }
  if(btn){ btn.disabled=false; btn.textContent='🗑️ Excluir encerradas/canceladas'; }
  toast(err?`${count} obra(s) excluída(s), ${err} com erro.`:`✓ ${count} obra(s) excluída(s) do sistema.`,'warn');
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
  const podeEditar = ['gerente','fiscal','fiscal_adm'].includes(me.perfil);
  if(!todos.length){ container.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Nenhum local registrado.</div>'; return; }
  container.innerHTML = todos.map(l=>{
    const isPendente = _locaisPendentes.some(p=>p.id===l.id);
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;margin-bottom:4px" id="local_row_${l.id}">
      <span style="font-size:10px;color:var(--muted);white-space:nowrap">${fmtTxt(l.data)}</span>
      <span style="font-size:11px;flex:1" id="local_txt_${l.id}">${l.descricao}</span>
      ${podeEditar?`<button onclick="editarLocal('${l.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px" title="Editar">✏️</button>`:''}
      ${isPendente||podeEditar?`<button onclick="removerLocal('${l.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px" title="Remover">✕</button>`:''}
    </div>`;
  }).join('');
}

window.editarLocal = function(id){
  const obraId = document.getElementById('obraId')?.value;
  const obra = obras.find(o=>o.id===obraId);
  const todos = [...(obra?.locaisTrabalho||[]), ..._locaisPendentes];
  const local = todos.find(l=>l.id===id);
  if(!local) return;

  const row = document.getElementById('local_row_'+id);
  if(!row) return;

  // Replace row content with inline editor
  row.innerHTML = `
    <span style="font-size:10px;color:var(--muted);white-space:nowrap">${fmtTxt(local.data)}</span>
    <input type="text" id="local_edit_${id}" value="${local.descricao.replace(/"/g,'&quot;')}"
      style="font-size:11px;flex:1;border:1px solid var(--accent);border-radius:4px;padding:2px 6px;background:var(--surface);color:inherit"
      onkeydown="if(event.key==='Enter') salvarEdicaoLocal('${id}');if(event.key==='Escape') renderLocais();">
    <button onclick="salvarEdicaoLocal('${id}')" style="background:var(--accent);border:none;color:#fff;cursor:pointer;border-radius:4px;padding:2px 8px;font-size:10px">✓</button>
    <button onclick="renderLocais()" style="background:none;border:1px solid var(--border);cursor:pointer;border-radius:4px;padding:2px 6px;font-size:10px">✕</button>`;
  document.getElementById('local_edit_'+id)?.focus();
};

window.salvarEdicaoLocal = async function(id){
  const novaDesc = document.getElementById('local_edit_'+id)?.value?.trim();
  if(!novaDesc){ toast('Descrição não pode estar vazia.','err'); return; }

  const obraId = document.getElementById('obraId')?.value;
  const obra = obras.find(o=>o.id===obraId);
  if(!obra) return;

  // Update in pending list (not yet saved)
  const pendIdx = _locaisPendentes.findIndex(l=>l.id===id);
  if(pendIdx >= 0){
    _locaisPendentes[pendIdx].descricao = novaDesc;
    renderLocais();
    return;
  }

  // Update in Firestore (already saved local)
  const novosLocais = (obra.locaisTrabalho||[]).map(l=>
    l.id===id ? {...l, descricao:novaDesc} : l
  );
  try{
    await updateDoc(doc(db,'obras',obraId), {locaisTrabalho: novosLocais});
    obra.locaisTrabalho = novosLocais;
    renderLocais();
    toast('✓ Local de trabalho atualizado.','ok');
  }catch(e){ toast('Erro ao salvar: '+e.message,'err'); }
};

window.removerLocal = function(id){
  const obraId = document.getElementById('obraId')?.value;
  const obra = obras.find(o=>o.id===obraId);

  // If it's a pending local, just remove from array
  if(_locaisPendentes.some(l=>l.id===id)){
    _locaisPendentes = _locaisPendentes.filter(l=>l.id!==id);
    renderLocais();
    return;
  }

  // If it's a saved local (gerente/fiscal can remove)
  if(['gerente','fiscal','fiscal_adm'].includes(me.perfil) && obra){
    if(!confirm('Remover este local de trabalho?')) return;
    const novosLocais = (obra.locaisTrabalho||[]).filter(l=>l.id!==id);
    updateDoc(doc(db,'obras',obraId), {locaisTrabalho: novosLocais})
      .then(()=>{ obra.locaisTrabalho = novosLocais; renderLocais(); toast('Local removido.','ok'); })
      .catch(e=>toast('Erro: '+e.message,'err'));
    return;
  }

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
  // Prioridade: med280urg > agMed > agFisc
  // agMed: conclusão + kaffa executado + sem medição (independente de fiscalização)
  const agFisc_all  = ativas.filter(o=>o.conclusao&&!o.fiscalizacao);
  // agMed: kaffa FINAL registrado + sem medição FINAL (inclui obras com medição parcial)
  const temKaffaFinal = o => (o.kaffaEntries||[]).some(k=>k.tipo==='final');
  const temMedParcial = o => (o.medicoes||[]).some(m=>m.tipo==='parcial');
  const agMed_all = ativas.filter(o=>
    o.conclusao &&
    temKaffaFinal(o) &&       // kaffa final registrado pela empreiteira
    !temMedicaoFinal(o) &&    // sem medição final ainda
    o.tipo!=='ODI'
  );
  // med280urg: kaffa executado + medida230 aprovada + prazo med280 vence este mês
  const med280urg   = ativas.filter(o=>{
    if(!o.conclusao||!o.kaffa||!o.medida230||o.medida280) return false;
    // Inclui obras atrasadas (prazo já passou) E obras que vencem este mês
    // Independente de medição parcial ou final já existir
    if(temMedicaoFinal(o)) return false; // só exclui se tiver medição FINAL
    const p=prazoMedida280(o);
    return p && p<=fimMes; // fimMes já inclui as vencidas pois prazo<hoje<fimMes é verdadeiro quando atrasado
  });

  // agMed: exclui apenas med280urg (urgência maior); agFisc aparece em AMBOS os cards
  // Uma obra com kaffa final mas sem fiscalização aparece em "Ag. Fiscalização" E "Ag. Medição"
  const med280Ids = new Set(med280urg.map(o=>o.id));
  const agMed  = agMed_all.filter(o=>!med280Ids.has(o.id));
  // agFisc não exclui obras que estão em agMed — fiscal ainda precisa fiscalizar
  const agFisc = agFisc_all.filter(o=>!med280Ids.has(o.id));

  const cardStyle = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px';

  function hexRgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)].join(','); }

  function listaComCiente(list, campo, tipo, cor, dataCampoDias=null){
    if(!list.length) return `<div style="font-size:11px;color:var(--muted)">Nenhuma obra. ✓</div>`;
    const hoje_s = hojeStr();
    // Mostra TODAS as obras (sem limite) — Bug 3 fix
    return list.map(o=>{
      const visto = !!o[campo];
      const diasVal = dataCampoDias && o[dataCampoDias] ? diff(o[dataCampoDias], hoje_s) : null;
      const diasBadge = diasVal!==null
        ? `<span style="background:${diasVal>15?'rgba(239,68,68,.2)':diasVal>7?'rgba(245,158,11,.2)':'rgba(59,130,246,.15)'};color:${diasVal>15?'#EF4444':diasVal>7?'#F59E0B':'#3B82F6'};border-radius:4px;font-size:9px;padding:1px 6px;font-weight:700;white-space:nowrap;margin-right:2px">${diasVal}d</span>`
        : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;
        background:${visto?'rgba(34,197,94,.08)':'rgba('+hexRgb(cor)+',.07)'};
        border:1px solid ${visto?'#22C55E55':cor+'55'};border-radius:6px;
        transition:background .3s">
        <span style="width:7px;height:7px;border-radius:50%;background:${cor};flex-shrink:0"></span>
        <strong style="color:var(--accent);font-size:11px;cursor:pointer;white-space:nowrap" onclick="openObraModal('${o.id}')">${o.numero}</strong>
        ${temMedParcial(o)?'<span style="background:rgba(245,158,11,.15);color:#F59E0B;border:1px solid #F59E0B55;border-radius:4px;font-size:8px;padding:1px 5px;white-space:nowrap">Med. Parcial</span>':''}
        ${diasBadge}
        <span style="font-size:10px;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.cidade||'—'} · ${o.empreiteira||'—'}</span>
        <button onclick="window.marcarCiente('${o.id}','${tipo}')" 
          style="background:none;border:none;cursor:pointer;font-size:10px;white-space:nowrap;
            color:${visto?'#22C55E':'var(--muted)'};flex-shrink:0" 
          title="${visto?'Marcado como ciente':'Marcar como ciente'}">
          ${visto?'✓ Ciente':'○ Ciente'}
        </button>
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
      ${listaComCiente(agFisc,'cienFisc','fisc','#3B82F6','conclusao')}
    </div>
    <div style="${cardStyle};border-left:3px solid #F59E0B">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-weight:700;font-size:12px">📐 Aguardando Medição</span>${badge(agMed.filter(o=>!o.cienMed).length,'#F59E0B')}</div>
        <span style="background:#F59E0B;color:#000;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700">${agMed.length}</span>
      </div>
      ${listaComCiente(agMed,'cienMed','med','#F59E0B','kaffa')}
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
  const isODI = tipo === 'ODI';

  // ── ODI section ──────────────────────────────────────────────────────
  const secODI = document.getElementById('secODI');
  if(secODI) secODI.style.display = isODI ? '' : 'none';
  const lblDescODI = document.getElementById('lblDescricaoODI');
  if(lblDescODI) lblDescODI.textContent = isODI ? 'Tipo de Obra ODI' : 'Tipo de Descrição';
  if(isODI){
    // Auto-select "18 meses" prazo option
    const prazoOpcEl = document.getElementById('oPrazoOpcao');
    if(prazoOpcEl) {
      prazoOpcEl.value='540';
      if(typeof window.togglePrazoCustom==='function') window.togglePrazoCustom();
    }
    // Also auto-calc date from abertura if available
    const daEl = document.getElementById('oDataAbertura');
    if(daEl?.value){
      const d = new Date(daEl.value+'T00:00:00'); d.setMonth(d.getMonth()+18);
      const prazoEl = document.getElementById('oPrazo');
      if(prazoEl) prazoEl.value = d.toISOString().split('T')[0];
    }
  }

  // ── Enquadramento: apenas R1 ─────────────────────────────────────────
  const fg = document.getElementById('fgEnquadramento');
  if(fg) fg.style.display = tipo === 'R1' ? 'flex' : 'none';

  // ── Programa: R1 → automático; R2 → usuário escolhe ─────────────────
  const fgProg = document.getElementById('fgPrograma');
  const sel    = document.getElementById('oPrograma');
  if(tipo === 'R1'){
    if(sel) sel.value = 'Regulatório';
    if(fgProg) fgProg.style.display = 'none';
  } else if(tipo === 'R2'){
    if(fgProg) fgProg.style.display = 'flex';
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
  // USC pendente = previsto − parciais, respeitando override manual se existir
  const totalUSC = obrasLista.reduce((s,o)=>{
    const ov = (_overridesFinanceiros||{})[o.id];
    if(ov && ov.usc !== undefined) return s + (parseFloat(ov.usc)||0);
    const previsto = parseFloat(o.usc)||0;
    const acumParcial = (o.medicoes||[])
      .filter(m=>m.tipo==='parcial')
      .reduce((a,m)=>a+(parseFloat(m.uscMedido)||0), 0);
    const jaMedido = Math.min(acumParcial, previsto);
    return s + Math.max(0, previsto - jaMedido);
  },0);
  const totalULV = obrasLista.reduce((s,o)=>{
    const ov = (_overridesFinanceiros||{})[o.id];
    if(ov && ov.ulv !== undefined) return s + (parseFloat(ov.ulv)||0);
    return s + (parseFloat(o.ulv)||0);
  },0);
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
  // Saldo devedor: obras RD com conclusão informada pela empreiteira E sem medição final
  // conclusao = empreiteira confirmou execução de campo
  // !temMedicaoFinal = ainda não foi medida (devemos dinheiro)
  const devOp = obrasPool.filter(o=>
    !o.cancelado && !o.armazenado &&
    o.conclusao &&
    !temMedicaoFinal(o) &&
    (o.tipo==='R1'||o.tipo==='R2')
  );
  const dev   = calcFinanceiro(devOp, p);

  // Kaffa breakdown — mesmo devOp do card KPI e da tabela
  const temKaffa = o => (o.kaffa && o.kaffa !== '') ||
    (o.kaffaEntries||[]).some(k => k.tipo==='final' || k.tipo==='parcial');
  const devComKaffa  = devOp.filter(o =>  temKaffa(o));
  const devSemKaffa  = devOp.filter(o => !temKaffa(o));
  // USC/ULV pendente — respeita override manual se existir
  function uscPendente(o){
    const ov = (_overridesFinanceiros||{})[o.id];
    if(ov && ov.usc !== undefined) return parseFloat(ov.usc)||0; // override manual sem ajuste
    const prev = parseFloat(o.usc)||0;
    const parcs = (o.medicoes||[]).filter(m=>m.tipo==='parcial')
      .reduce((a,m)=>a+(parseFloat(m.uscMedido)||0),0);
    return Math.max(0, prev - Math.min(parcs, prev));
  }
  function ulvPendente(o){
    const ov = (_overridesFinanceiros||{})[o.id];
    if(ov && ov.ulv !== undefined) return parseFloat(ov.ulv)||0; // override manual sem ajuste
    const prev = parseFloat(o.ulv)||0;
    const parcs = (o.medicoes||[]).filter(m=>m.tipo==='parcial')
      .reduce((a,m)=>a+(parseFloat(m.ulvMedido)||0),0);
    return Math.max(0, prev - Math.min(parcs, prev));
  }
  const uscComKaffa  = devComKaffa.reduce((s,o)=>s+uscPendente(o),0);
  const uscSemKaffa  = devSemKaffa.reduce((s,o)=>s+uscPendente(o),0);
  const ulvComKaffa  = devComKaffa.reduce((s,o)=>s+ulvPendente(o),0);
  const ulvSemKaffa  = devSemKaffa.reduce((s,o)=>s+ulvPendente(o),0);
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
          <!-- Kaffa breakdown -->
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(239,68,68,.2)">
            <div style="font-size:9px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">USC por situação de kaffa</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <div style="flex:1;min-width:110px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:6px;padding:8px;text-align:center">
                <div style="font-size:9px;color:#22C55E;font-weight:700;margin-bottom:4px">✅ Com Kaffa</div>
                <div style="font-size:9px;color:var(--muted)">USC: <strong style="color:#22C55E">${uscComKaffa.toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted)">ULV: <strong style="color:#22C55E">${ulvComKaffa.toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted);margin-top:2px">${devComKaffa.length} obras</div>
              </div>
              <div style="flex:1;min-width:110px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.3);border-radius:6px;padding:8px;text-align:center">
                <div style="font-size:9px;color:#6366F1;font-weight:700;margin-bottom:4px">✅🔍 Kaffa + Fisc.</div>
                <div style="font-size:9px;color:var(--muted)">USC: <strong style="color:#6366F1">${devComKaffa.filter(o=>!!(o.fiscalizacao||o.dataFiscalizacao)).reduce((s,o)=>s+uscPendente(o),0).toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted)">ULV: <strong style="color:#6366F1">${devComKaffa.filter(o=>!!(o.fiscalizacao||o.dataFiscalizacao)).reduce((s,o)=>s+ulvPendente(o),0).toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted);margin-top:2px">${devComKaffa.filter(o=>!!(o.fiscalizacao||o.dataFiscalizacao)).length} obras</div>
              </div>
              <div style="flex:1;min-width:110px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:8px;text-align:center">
                <div style="font-size:9px;color:#EF4444;font-weight:700;margin-bottom:4px">❌ Sem Kaffa</div>
                <div style="font-size:9px;color:var(--muted)">USC: <strong style="color:#EF4444">${uscSemKaffa.toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted)">ULV: <strong style="color:#EF4444">${ulvSemKaffa.toFixed(0)}</strong></div>
                <div style="font-size:9px;color:var(--muted);margin-top:2px">${devSemKaffa.length} obras</div>
              </div>
            </div>
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
        <div style="display:flex;gap:8px;margin-bottom:6px;margin-top:8px;align-items:center;flex-wrap:wrap">
          <input type="search" placeholder="🔍 Buscar nota..." oninput="window._sdBusca['${nome}']=this.value.trim().toLowerCase();this.closest('details').querySelector('tbody').querySelectorAll('tr').forEach(r=>{r.style.display=this.value&&!r.innerText.toLowerCase().includes(this.value.toLowerCase())?'none':''})" style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:inherit;width:130px">
          <span style="font-size:9px;color:var(--muted)">Ordenar por:</span>
          <button onclick="window._analiseSort=window._analiseSort||{}; window._analiseSort['${nome}']='fiscal'; renderAnaliseFinanceira();" style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:${((window._analiseSort||{})['${nome}']==='fiscal'?'var(--accent)':'var(--surface)')};cursor:pointer;color:${((window._analiseSort||{})['${nome}']==='fiscal'?'#fff':'inherit')}">👤 Fiscal</button>
          <button onclick="window._analiseSort=window._analiseSort||{}; window._analiseSort['${nome}']='usc'; renderAnaliseFinanceira();" style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:${((window._analiseSort||{})['${nome}']==='usc'?'var(--accent)':'var(--surface)')};cursor:pointer;color:${((window._analiseSort||{})['${nome}']==='usc'?'#fff':'inherit')}">📊 USC ↓</button>
          <button onclick="window._analiseSort=window._analiseSort||{}; window._analiseSort['${nome}']='kaffa'; renderAnaliseFinanceira();" style="font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:${((window._analiseSort||{})['${nome}']==='kaffa'?'var(--accent)':'var(--surface)')};cursor:pointer;color:${((window._analiseSort||{})['${nome}']==='kaffa'?'#fff':'inherit')}">✅ Kaffa</button>
        </div>
        <div style="overflow-x:auto;margin-top:2px"><table style="width:100%;border-collapse:collapse;font-size:9px">
          <thead><tr style="background:var(--surface2)"><th style="padding:4px 6px;text-align:left">Nº</th><th style="padding:4px 6px;text-align:left">Fiscal</th><th style="padding:4px 6px;text-align:center">Kaffa Execução</th><th style="padding:4px 6px;text-align:center">Fisc.</th><th style="padding:4px 6px">Tipo</th><th style="padding:4px 6px">Prog.</th><th style="padding:4px 6px;text-align:right">USC Prev.</th><th style="padding:4px 6px;text-align:right">Parc.Med.</th><th style="padding:4px 6px;text-align:right;color:#EF4444">Pendente</th><th style="padding:4px 6px;text-align:right">LM(R$)</th></tr></thead>
          <tbody>${(()=>{
            const sortKey = ((window._analiseSort||{})[''+nome])||'';
            const sorted = [...devOp].sort((a,b)=>{
              if(sortKey==='fiscal') return (a.fiscal||'zzz').localeCompare(b.fiscal||'zzz');
              if(sortKey==='usc') return (parseFloat(b.usc)||0)-(parseFloat(a.usc)||0); // maior USC primeiro
              if(sortKey==='kaffa'){
                const aK=((a.kaffa&&a.kaffa!=='')||(a.kaffaEntries||[]).some(k=>k.tipo==='final'))?1:0;
                const bK=((b.kaffa&&b.kaffa!=='')||(b.kaffaEntries||[]).some(k=>k.tipo==='final'))?1:0;
                return aK-bK; // ❌ sem kaffa primeiro
              }
              return 0;
            });
            return sorted;
          })().map(o=>{const bruto=parseFloat(o.usc)||0;const parcs=(o.medicoes||[]).filter(m=>m.tipo==='parcial').reduce((a,m)=>a+(parseFloat(m.uscMedido)||0),0);const jaMed=Math.min(parcs,bruto);const pend=Math.max(0,bruto-jaMed);return `<tr style="border-bottom:1px solid var(--border)">`+window._ovTag(o)+`<td style="padding:3px 6px;font-size:9px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.fiscal||'—'}">${(o.fiscal||'—').split(' ')[0]}</td><td style="padding:3px 6px;text-align:center">${window._kaffaIcon(o)}</td><td style="padding:3px 6px;text-align:center">${window._fiscIcon(o)}</td><td style="padding:3px 6px;text-align:center">${o.tipo||'—'}</td><td style="padding:3px 6px">${o.programa||'—'}</td><td style="padding:3px 6px;text-align:right">${bruto.toFixed(1)}</td><td style="padding:3px 6px;text-align:right;color:#7c6af7">${jaMed>0?jaMed.toFixed(1):'—'}</td><td style="padding:3px 6px;text-align:right;color:#EF4444;font-weight:700">${pend.toFixed(1)}</td><td style="padding:3px 6px;text-align:right;color:#EF4444">${pend>0?brlFmt(pend*p.valorUSC*(1+p.ajusteLM/100)):'—'}</td></tr>`;}).join('')}</tbody>
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


// ── Limpeza de dados de equipamentos duplicados (uso único pelo gerente) ──────
window.limparEquipamentosDuplicados = async function(){
  if(me.perfil !== 'gerente'){ toast('Apenas gerente pode executar esta ação.','err'); return; }

  const total = obras.filter(o => !o.cancelado && !o.armazenado &&
    (o.equipamentosInstalados?.length || o.equipamentosRetirados?.length ||
     o.sap || o.potencia || o.placas)).length;

  if(!confirm(
    `Limpar dados de transformador/equipamento de ${total} obras?\n\n` +
    `Isso irá ZERAR os campos:\n` +
    `• equipamentosInstalados\n• equipamentosRetirados\n` +
    `• sap, série, fabricante, potência, placas (transformador único)\n\n` +
    `ATENÇÃO: Esta ação não pode ser desfeita. Use somente se os dados estiverem incorretos.`
  )) return;

  toast('⏳ Limpando dados de equipamentos...','ok');
  const CAMPOS_LIMPAR = {
    equipamentosInstalados: [], equipamentosRetirados: [],
    sap: null, serie: null, fabricante: null, potencia: null,
    placas: null, dataTransf: null,
    sapRet: null, serieRet: null, fabricanteRet: null,
    potenciaRet: null, temRetirado: false,
  };

  const obrasMarcadas = obras.filter(o => !o.cancelado && !o.armazenado &&
    (o.equipamentosInstalados?.length || o.equipamentosRetirados?.length ||
     o.sap || o.potencia || o.placas));

  let count = 0;
  for(let i = 0; i < obrasMarcadas.length; i += 400){
    const batch = writeBatch(db);
    obrasMarcadas.slice(i, i+400).forEach(o => {
      batch.update(doc(db,'obras',o.id), CAMPOS_LIMPAR);
      // Atualiza local
      Object.assign(o, CAMPOS_LIMPAR);
    });
    await batch.commit();
    count += Math.min(400, obrasMarcadas.length - i);
  }

  toast(`✓ ${count} obras limpas. Os dados de transformador foram zerados.`,'ok');
  renderObras();
};



window._fiscIcon = function(o){
  const hasF = !!(o.fiscalizacao || o.dataFiscalizacao);
  if(hasF)
    return '<span style="color:#22C55E;font-weight:700" title="Fiscalizado em '+(o.fiscalizacao||o.dataFiscalizacao||'')+'">✅</span>';
  return '<span style="color:#EF4444;font-weight:700" title="Sem fiscalização">❌</span>';
};

window._kaffaIcon = function(o){
  const temKaffa = (o.kaffa && o.kaffa !== '') ||
    (o.kaffaEntries||[]).some(k => k.tipo==='final' || k.tipo==='parcial');
  if(temKaffa)
    return '<span style="color:#22C55E;font-weight:700" title="Kaffa: '+(o.kaffa||'registrado')+'">✅</span>';
  return '<span style="color:#EF4444;font-weight:700" title="Sem kaffa">❌</span>';
};


// ── Overrides manuais de USC pendente — Análise Financeira ────────────────
// Armazenado em Firestore: config/overridesFinanceiros → {[obraId]: {usc, ulv, obs, atualizadoEm}}
let _overridesFinanceiros = null; // cache

async function loadOverridesFinanceiros(){
  if(_overridesFinanceiros) return _overridesFinanceiros;
  try{
    const snap = await getDoc(doc(db,'config','overridesFinanceiros'));
    _overridesFinanceiros = snap.exists() ? snap.data() : {};
  }catch(e){ _overridesFinanceiros = {}; }
  return _overridesFinanceiros;
}

window.salvarOverrideFinanceiro = async function(obraId, uscVal, ulvVal, obs){
  await loadOverridesFinanceiros();
  const val = {};
  if(uscVal !== null && uscVal !== '') val.usc = parseFloat(uscVal)||0;
  if(ulvVal !== null && ulvVal !== '') val.ulv = parseFloat(ulvVal)||0;
  if(obs) val.obs = obs;
  val.atualizadoEm = new Date().toISOString();
  _overridesFinanceiros[obraId] = val;
  await setDoc(doc(db,'config','overridesFinanceiros'), _overridesFinanceiros);
  toast('✓ Override salvo para esta obra.','ok');
  renderAnaliseFinanceira();
};

window.removerOverrideFinanceiro = async function(obraId){
  if(!confirm('Remover o ajuste manual desta obra? O cálculo voltará ao automático.')) return;
  await loadOverridesFinanceiros();
  delete _overridesFinanceiros[obraId];
  await setDoc(doc(db,'config','overridesFinanceiros'), _overridesFinanceiros);
  toast('Override removido. Voltando ao cálculo automático.','ok');
  renderAnaliseFinanceira();
};

window.abrirModalOverride = function(obraId){
  const obra = obras.find(o=>o.id===obraId);
  if(!obra) return;
  const ov = (_overridesFinanceiros||{})[obraId]||{};
  // USC auto
  const prev = parseFloat(obra.usc)||0;
  const parcs = (obra.medicoes||[]).filter(m=>m.tipo==='parcial')
    .reduce((a,m)=>a+(parseFloat(m.uscMedido)||0),0);
  const uscAuto = Math.max(0, prev - Math.min(parcs, prev));
  const ulvPrev = parseFloat(obra.ulv)||0;
  const ulvParcs = (obra.medicoes||[]).filter(m=>m.tipo==='parcial')
    .reduce((a,m)=>a+(parseFloat(m.ulvMedido)||0),0);
  const ulvAuto = Math.max(0, ulvPrev - Math.min(ulvParcs, ulvPrev));

  const html=`<div id="ovModalOverride" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center">
    <div style="background:var(--surface);border-radius:16px;padding:24px;width:min(460px,96vw)">
      <div style="font-weight:900;font-size:15px;margin-bottom:4px">✏️ Ajuste Manual de USC/ULV Pendente</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:16px">Obra <strong>${obra.numero}</strong> — ${obra.cidade||obra.municipio||'—'}</div>

      <div style="background:var(--surface2);border-radius:8px;padding:10px;margin-bottom:14px;font-size:11px">
        <div style="color:var(--muted);margin-bottom:4px">Valores calculados automaticamente:</div>
        <div>USC pendente auto: <strong>${uscAuto.toFixed(2)}</strong> &nbsp;·&nbsp; ULV pendente auto: <strong>${ulvAuto.toFixed(2)}</strong></div>
      </div>

      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px">USC pendente (override) — deixe vazio para usar o automático</label>
        <input type="number" id="ovUscOverride" value="${ov.usc??''}" min="0" step="0.01" placeholder="${uscAuto.toFixed(2)} (automático)" style="font-size:13px">
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px">ULV pendente (override) — deixe vazio para usar o automático</label>
        <input type="number" id="ovUlvOverride" value="${ov.ulv??''}" min="0" step="0.01" placeholder="${ulvAuto.toFixed(2)} (automático)" style="font-size:13px">
      </div>
      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:11px">Observação (motivo do ajuste)</label>
        <input type="text" id="ovObsOverride" value="${ov.obs||''}" placeholder="Ex: Alteração de projeto — novo quantitativo" style="font-size:12px">
      </div>

      <div style="background:rgba(124,106,247,.08);border:1px solid rgba(124,106,247,.3);border-radius:6px;padding:8px;font-size:10px;color:#7c6af7;margin-bottom:14px">
        ℹ️ O valor override substitui o cálculo automático sem aplicar o percentual de ajuste. Somente visível na Análise Financeira.
      </div>

      <div style="display:flex;gap:8px;justify-content:space-between">
        <div>
          ${ov.usc!==undefined||ov.ulv!==undefined
            ?`<button class="btn btn-sm" style="color:#EF4444;border-color:#EF444455;font-size:10px" onclick="removerOverrideFinanceiro('${obraId}');document.getElementById('ovModalOverride').remove()">🗑 Remover ajuste</button>`
            :''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ovModalOverride').remove()">Cancelar</button>
          <button class="btn btn-primary btn-sm" onclick="salvarOverrideFinanceiro('${obraId}',document.getElementById('ovUscOverride').value,document.getElementById('ovUlvOverride').value,document.getElementById('ovObsOverride').value);document.getElementById('ovModalOverride').remove()">Salvar</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
};

window._ovTag = function(o){
  const hasOv = !!(_overridesFinanceiros||{})[o.id];
  const id = o.id, num = o.numero;
  const ovMark = hasOv ? `<span title="Ajuste manual ativo" style="color:#7c6af7;font-size:9px;cursor:pointer" onclick="abrirModalOverride('${id}')">✏️</span>` : '';
  const hasPend = !!(o.pendencia && !o.pendenciaResolvida);
  const pendMark = hasPend ? `<span title="Pendência ativa nesta obra" style="background:rgba(239,68,68,.15);color:#EF4444;border:1px solid #EF444455;border-radius:4px;font-size:8px;padding:1px 5px;cursor:pointer" onclick="openObraModal('${id}')">⚠️ Pendência</span>` : '';
  return `<td style="padding:3px 6px;font-weight:600;color:var(--accent);white-space:nowrap"><span style="cursor:pointer" onclick="openObraModal('${id}')">${num}</span>${pendMark}${ovMark}<button onclick="abrirModalOverride('${id}')" style="background:none;border:none;cursor:pointer;font-size:9px;color:var(--muted);padding:0 2px" title="Ajustar manualmente">⚙️</button></td>`;
};

function renderAnaliseFinanceira(){
  const cont = document.getElementById('pgAnaliseContent');
  if(!cont) return;
  // Carrega overrides antes de renderizar (se ainda não carregou)
  if(!_overridesFinanceiros){
    loadOverridesFinanceiros().then(()=>renderAnaliseFinanceira());
    cont.innerHTML='<div class="loading">Carregando...</div>';
    return;
  }
  const p = getParamsFinanceiros();
  const EMP = ['CS ELETRICIDADE','ELETELSUL'];

  // Filtro por programa
  const progFiltros = JSON.parse(localStorage.getItem('analise_prog_filtro')||'{}');
  function obrasComFiltro(pool){
    return pool.filter(o=>!o.programa ? progFiltros['_semProg']!==false : progFiltros[o.programa]!==false);
  }
  const isGerente = me.perfil==='gerente'; // controla campos editáveis
  // Empreiteira vê apenas suas obras
  let obrasRDtodas = obras.filter(o=>(o.tipo==='R1'||o.tipo==='R2')&&!o.cancelado);
  if(me.perfil==='empreiteira') obrasRDtodas=obrasRDtodas.filter(o=>o.empreiteira?.toUpperCase()===(me.vinculo||'').toUpperCase());
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

  // Preserve open state of details elements
  const openDetails = [...(cont.querySelectorAll('details[open]')||[])].map(d=>d.dataset?.emp||'');
  cont.innerHTML = html;
  // Restore open details
  cont.querySelectorAll('details').forEach(d=>{
    if(openDetails.some(k=>d.innerHTML.includes(k))) d.open = true;
  });
  // Keep all saldo devedor details open if sort was just changed
  if(Object.keys(window._analiseSort||{}).length>0){
    cont.querySelectorAll('details').forEach(d=>{ d.open = true; });
  }
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

  // Detecta empreiteira: busca a ÚLTIMA turma no texto antes da posição
  function empAtPos(pos){
    const before = fullText.slice(0, pos);
    // Encontra a última ocorrência de cada tipo de turma
    const lastCS  = Math.max(
      before.lastIndexOf('CS ELET'), before.lastIndexOf('C S ELET'),
      before.toUpperCase().lastIndexOf('MANUT. LM TERC. C S')
    );
    const lastEL = Math.max(
      before.toUpperCase().lastIndexOf('ELETELSUI'),
      before.toUpperCase().lastIndexOf('ELETELSUL')
    );
    if(lastCS<0 && lastEL<0) return '';
    if(lastCS > lastEL) return 'CS ELETRICIDADE';
    if(lastEL > lastCS) return 'ELETELSUL';
    return '';
  }

  oisPos.forEach(({pos, ois}, oisIdx)=>{
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

    // Status: janela do OIS até o próximo OIS (evita pegar status da obra seguinte)
    const nextOisPos2 = oisIdx+1 < oisPos.length ? oisPos[oisIdx+1].pos : pos+WINDOW;
    const seg = fullText.slice(Math.max(0,pos-30), nextOisPos2);
    let status='';
    // EXECUCAO verificado ANTES de PROGRAMADOR para evitar match da linha seguinte
    if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(seg))                     status='aguarda_execucao';
    else if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(seg))                  status='aguarda_programador';
    else if(/AGUARDA\s+VISTO|SD.*AGUARDANDO\s+VISTO|AGUARDA.*CHEFIA/i.test(seg)) status='aguarda_visto';

    // Horas HH:MM HH:MM
    const tm = seg.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);

    entries.push({
      obraNumero:  ois,
      dataProgram,
      inicioHora:  tm?.[1]||'',
      fimHora:     tm?.[2]||'',
      empreiteira: empAtPos(pos),
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
        // Verifica EXECUCAO primeiro (evita match falso da linha seguinte)
        if(/AGUARDA\s+EXECUCAO\s+MANUTENCAO/i.test(cs)){status='aguarda_execucao';break;}
        if(/AGUARDA\s+AUT[.\s]+PROGRAMADOR/i.test(cs)){status='aguarda_programador';break;}
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
  // Se obras ainda não carregou, aguarda 800ms
  if(!obras||obras.length===0){
    setTimeout(renderDesligamentos, 800);
    return;
  }
  getDocs(collection(db,'desligamentos')).then(snap=>{
    if(snap.empty){ document.getElementById('desligSlot').innerHTML='<div style="font-size:11px;color:var(--muted)">Nenhum cronograma importado ainda.</div>'; return; }
    const snapDocs = snap.docs.sort((a,b)=>b.id.localeCompare(a.id));
    _renderDesligSlot(snapDocs[0].data(), snapDocs.map(d=>d.id));
  }).catch(e=>{ document.getElementById('desligSlot').innerHTML=`<div style="color:#EF4444">Erro: ${e.message}</div>`; });
}
window.renderDesligamentos = renderDesligamentos;

// ── Renderiza os dados de uma importação ──────────────────────────────────
function _renderDesligSlot(latest, allDocIds){
    const _hoje = new Date().toISOString().split('T')[0];
    const _hoje30 = new Date(); _hoje30.setDate(_hoje30.getDate()+30);
    const _hoje30str = _hoje30.toISOString().split('T')[0];
    const docs = allDocIds||[latest.data];
    // Filter by profile — empreiteira sees only matching obras
    const entradas = (latest.entradas||[]).filter(e=>{
      if(me.perfil==='empreiteira'){
        const obraEmp = obras.find(o=>o.numero?.toString()===e.obraNumero?.toString())?.empreiteira?.toUpperCase()||'';
        return obraEmp === (me.vinculo||'').toUpperCase();
      }
      return true;
    });
    // Cross-reference with obras

    function getPrioridade(e){
      const numStr = e.obraNumero?.toString().trim()||'';
      const obraMatch = obras.find(o=>{
        const n=(o.numero||'').toString().trim();
        return n===numStr || n===String(parseInt(numStr,10));
      });
      if(!obraMatch) return null;
      const lim = obraMatch.dataLimite||'';
      if(lim<_hoje) return {nivel:'critica', label:'⚠️ ATRASADA', cor:'#EF4444', o:obraMatch};
      if(lim<=_hoje30str) return {nivel:'urgente', label:'🔴 URGENTE ≤30d', cor:'#F97316', o:obraMatch};
      return {nivel:'ok', label:'✅ Normal', cor:'#22C55E', o:obraMatch};
    }

    // Status labels
    const STATUS_OPTS = {
      'aguarda_programador': {label:'⏳ Ag. Programador', bg:'#F59E0B', cor:'#000'},
      'aguarda_execucao':    {label:'🔧 Ag. Execução',   bg:'#3B82F6', cor:'#fff'},
      'aguarda_visto':       {label:'👤 Ag. Visto Chefia',bg:'#7c6af7', cor:'#fff'},
    };
    window._desl_docId = (allDocIds||[])[0]||'';
    var latestDocId = window._desl_docId; // alias for template literals
    const podeEditar = ['gerente','estagiario','fiscal','fiscal_adm'].includes(me.perfil);
    function statusLabel(s, eIdx){
      const opt = STATUS_OPTS[s]||{label:s||'—',bg:'#6b7280',cor:'#fff'};
      const st = 'padding:2px 8px;border-radius:8px;font-size:9px;background:'+opt.bg+';color:'+opt.cor+';border:none';
      if(!podeEditar) return '<span style="'+st+'">'+opt.label+'</span>';
      let sel = '<select style="'+st+';cursor:pointer;font-weight:600" title="Alterar status" onchange="window.atualizarStatusDesl('+eIdx+',this.value)">';
      Object.entries(STATUS_OPTS).forEach(function(kv){ sel+='<option value="'+kv[0]+'"'+(kv[0]===s?' selected':'')+'>'+kv[1].label+'</option>'; });
      return sel+'</select>';
    }
    // Priority analysis
    // Mapeia prio + tipo da obra (R1/R2 = RD, ODI, outros)
    const entradasPrio = entradas.map(e=>{
      const prio = getPrioridade(e);
      const tipo = prio?.o?.tipo || '';
      return {...e, prio, tipo};
    });
    // Separa RD (R1+R2) de ODI — análise de prioridade só para RD
    const entradasRD  = entradasPrio.filter(e=>e.tipo==='R1'||e.tipo==='R2');
    const entradasODI = entradasPrio.filter(e=>e.tipo==='ODI');
    const semTipo     = entradasPrio.filter(e=>!e.tipo);
    const comPrioridade = entradasRD.filter(e=>e.prio); // análise só RD
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

    // Mapeia prio em TODAS as entradas (não só em comPrioridade)
    function makeRows(lista, docId){
      latestDocId = docId||latestDocId;
      return lista.sort((a,b)=>{
        const pA=a.prio?.nivel; const pB=b.prio?.nivel;
        const ord={critica:0,urgente:1,ok:2};
        return (ord[pA]??3)-(ord[pB]??3)||(a.dataProgram||'').localeCompare(b.dataProgram||'');
      }).map(e=>{
        const p=e.prio;
        const empDisplay = p?.o?.empreiteira || '';
        const rowBg = p?.nivel==='critica'
          ? 'background:rgba(239,68,68,.12);border-left:4px solid #EF4444'
          : p?.nivel==='urgente'
          ? 'background:rgba(249,115,22,.10);border-left:4px solid #F97316'
          : e.status==='aguarda_visto'
          ? 'background:rgba(124,106,247,.08);border-left:4px solid #7c6af7'
          : '';
        return '<tr style="border-bottom:1px solid var(--border);'+rowBg+'">'
          +'<td style="padding:5px 8px;font-size:10px;white-space:nowrap">'+(e.dataProgram?fmtTxt(e.dataProgram):'—')+(e.inicioHora?' '+e.inicioHora:'')+'</td>'
          +'<td style="padding:5px 8px;font-size:10px;font-weight:600;color:var(--accent);cursor:pointer"'+(p?.o?' onclick="openObraModal(\'+p.o.id+\')"':'')+'>'+e.obraNumero+'</td>'
          +'<td style="padding:5px 8px;font-size:10px">'+empDisplay+'</td>'
          +'<td style="padding:5px 8px">'+statusLabel(e.status, entradasPrio.indexOf(e))+'</td>'
          +'<td style="padding:5px 8px;font-size:9px">'+(p?'<span style="color:'+p.cor+';font-weight:700">'+p.label+'</span>'+(p.o?'<br><span style="color:var(--muted)">'+fmtTxt(p.o.dataLimite)+'</span>':''):'<span style="color:var(--muted)">Obra não encontrada</span>')+'</td>'
          +'</tr>';
      }).join('');
    }

    function makeTable(lista, titulo, cor){
      if(!lista.length) return '';
      const rows = makeRows(lista, latestDocId);
      return '<div style="margin-bottom:16px"><div style="font-weight:700;font-size:12px;color:'+cor+';margin-bottom:6px">'+titulo+' ('+lista.length+')</div>'
        +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden"><div style="overflow-x:auto">'
        +'<table style="width:100%;border-collapse:collapse;font-size:10px">'
        +'<thead><tr style="background:var(--surface2)">'
        +'<th style="padding:6px 8px;text-align:left">Data Prog.</th>'
        +'<th style="padding:6px 8px;text-align:left">OIS</th>'
        +'<th style="padding:6px 8px;text-align:left">Empreiteira</th>'
        +'<th style="padding:6px 8px;text-align:left">Status</th>'
        +'<th style="padding:6px 8px;text-align:left">Prioridade</th>'
        +'</tr></thead>'
        +'<tbody>'+rows+'</tbody></table></div></div>';
    }

    document.getElementById('desligSlot').innerHTML = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">
        📅 Última importação: <strong>${fmtTxt(latest.data)}</strong>${latest.hora?' às <strong>'+latest.hora+'</strong>':''} — ${latest.arquivo||''} — ${entradas.length} entradas
        ${(allDocIds||[]).length>1?'<details style="display:inline;margin-left:8px"><summary style="display:inline;cursor:pointer;font-size:10px;color:var(--accent)">📋 Histórico</summary><br><select style="font-size:10px;margin-top:4px" onchange="this.value&&loadDesligData(this.value)">'+allDocIds.map(id=>'<option>'+id+'</option>').join('')+'</select></details>':''}
      </div>
      ${vistoAlert}
      ${analise}
      ${makeTable(entradasRD,'🔵 Obras RD (R1+R2)','#7c6af7')}
      ${entradasODI.length?makeTable(entradasODI,'⚡ Obras ODI','#F59E0B'):''}
      ${semTipo.length?makeTable(semTipo,'❓ Obras não identificadas','#6b7280'):''}
    `;
}window.toggleParalAceite = function(){
  const val = document.getElementById('oParalAceite')?.value;
  const fg = document.getElementById('fgParalAceiteAte');
  if(fg) fg.style.display = val==='aceita' ? 'flex' : 'none';
};


// ══════════════════════════════════════════════════════════
//  ODI — Ações no modal por perfil
// ══════════════════════════════════════════════════════════


window.odiRegistrarPendencia = async function(obraId){
  const tipos = Array.from(document.querySelectorAll('.chk-pend-odi:checked')).map(el=>el.value);
  if(!tipos.length){ toast('Selecione ao menos um tipo de pendência.','warn'); return; }
  const outro = document.getElementById('oPendODIOutro')?.value?.trim()||'';
  const patch = {pendencia:true, pendenciaResolvida:false, tiposPendencia:tipos};
  if(outro) patch.pendenciaOutro = outro;
  try{
    await updateDoc(doc(db,'obras',obraId), patch);
    const o = obras.find(x=>x.id===obraId);
    if(o){ Object.assign(o, patch); renderAcoesODI(o); }
    toast('⚠️ Pendência registrada.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

window.odiResolverPendencia = async function(obraId){
  if(!confirm('Confirmar que a pendência construtiva foi regularizada?')) return;
  try{
    await updateDoc(doc(db,'obras',obraId),{pendencia:false, pendenciaResolvida:true});
    const o = obras.find(x=>x.id===obraId);
    if(o){ o.pendencia=false; o.pendenciaResolvida=true; renderAcoesODI(o); }
    toast('✅ Pendência marcada como resolvida.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};


window.salvarEquipamentosODI = async function(obraId){
  if(!obraId){ toast('ID da obra não encontrado.','err'); return; }
  try{
    const patch = {
      equipamentosInstalados: _equipInstalados,
      equipamentosRetirados:  _equipRetirados,
    };
    await updateDoc(doc(db,'obras',obraId), patch);
    const o = obras.find(x=>x.id===obraId);
    if(o){
      o.equipamentosInstalados = [..._equipInstalados];
      o.equipamentosRetirados  = [..._equipRetirados];
    }
    _equipModificado = false;
    toast('✓ Equipamentos salvos com sucesso.','ok');
  }catch(e){
    console.error('[ODI] salvarEquipamentosODI error:', e.code, e.message);
    toast('Erro ao salvar equipamentos: '+e.message,'err');
  }
};
// ── Equipamentos ODI — funções com containers específicos (IDs únicos) ──────
function renderEquipInstaladosODI(){
  const cont = document.getElementById('listaEquipInstaladosODI');
  if(!cont) return;
  if(!_equipInstalados.length){
    cont.innerHTML='<div style="font-size:10px;color:var(--muted)">Nenhum equipamento instalado.</div>'; return;
  }
  cont.innerHTML = _equipInstalados.map((e,i)=>`
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2)">
        <span style="font-size:10px;font-weight:700">Equip. ${i+1}</span>
        <span style="font-size:9px;color:var(--muted);flex:1">${e.potencia?e.potencia+'kVA':''} ${e.sap?'SAP:'+e.sap:''}</span>
        <button onclick="_remEquipODI('ins','${e.id}')" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:12px">✕</button>
      </div>
      <div style="padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="fg"><label style="font-size:9px">SAP</label><input type="text" value="${e.sap||''}" oninput="_updEquipODI('ins','${e.id}','sap',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Série</label><input type="text" value="${e.serie||''}" oninput="_updEquipODI('ins','${e.id}','serie',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Fabricante</label><input type="text" value="${e.fabricante||''}" oninput="_updEquipODI('ins','${e.id}','fabricante',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Potência (kVA)</label><input type="number" value="${e.potencia||''}" oninput="_updEquipODI('ins','${e.id}','potencia',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Placas</label><input type="text" value="${e.placas||''}" oninput="_updEquipODI('ins','${e.id}','placas',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Data Transf.</label><input type="date" value="${e.dataTransf||''}" oninput="_updEquipODI('ins','${e.id}','dataTransf',this.value)"></div>
      </div>
    </div>`).join('');
}

function renderEquipRetiradosODI(){
  const cont = document.getElementById('listaEquipRetiradosODI');
  if(!cont) return;
  if(!_equipRetirados.length){
    cont.innerHTML='<div style="font-size:10px;color:var(--muted)">Nenhum equipamento retirado.</div>'; return;
  }
  cont.innerHTML = _equipRetirados.map((e,i)=>`
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2)">
        <span style="font-size:10px;font-weight:700">Retirado ${i+1}</span>
        <span style="font-size:9px;color:var(--muted);flex:1">${e.potencia?e.potencia+'kVA':''} ${e.sap?'SAP:'+e.sap:''}</span>
        <button onclick="_remEquipODI('ret','${e.id}')" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:12px">✕</button>
      </div>
      <div style="padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="fg"><label style="font-size:9px">SAP</label><input type="text" value="${e.sap||''}" oninput="_updEquipODI('ret','${e.id}','sap',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Série</label><input type="text" value="${e.serie||''}" oninput="_updEquipODI('ret','${e.id}','serie',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Fabricante</label><input type="text" value="${e.fabricante||''}" oninput="_updEquipODI('ret','${e.id}','fabricante',this.value)"></div>
        <div class="fg"><label style="font-size:9px">Potência (kVA)</label><input type="number" value="${e.potencia||''}" oninput="_updEquipODI('ret','${e.id}','potencia',this.value)"></div>
      </div>
    </div>`).join('');
}

window.adicionarEquipInstaladoODI = function(){
  _equipModificado = true;
  _equipInstalados.push({id:`ei_${Date.now()}`,placas:'',potencia:'',sap:'',serie:'',fabricante:'',dataTransf:''});
  renderEquipInstaladosODI();
};
window.adicionarEquipRetiradoODI = function(){
  _equipModificado = true;
  _equipRetirados.push({id:`er_${Date.now()}`,potencia:'',sap:'',serie:'',fabricante:''});
  renderEquipRetiradosODI();
};
window._updEquipODI = function(tipo, id, campo, val){
  _equipModificado = true;
  const arr = tipo==='ins' ? _equipInstalados : _equipRetirados;
  const item = arr.find(e=>e.id===id);
  if(item) item[campo] = val;
};
window._remEquipODI = function(tipo, id){
  _equipModificado = true;
  if(tipo==='ins') _equipInstalados = _equipInstalados.filter(e=>e.id!==id);
  else _equipRetirados = _equipRetirados.filter(e=>e.id!==id);
  renderEquipInstaladosODI();
  renderEquipRetiradosODI();
};

window.odiApagarCampo = async function(obraId, campos){
  if(me.perfil!=='gerente'&&me.perfil!=='adm_odi'){
    toast('Somente gerente ou adm_odi pode desfazer registros ODI.','err'); return;
  }
  const lista = Array.isArray(campos) ? campos : [campos];
  const labels = lista.join(', ');
  if(!confirm('Desfazer registro de: '+labels+'?\nEssa ação remove o dado registrado.')) return;
  try{
    const patch = {};
    lista.forEach(f=>{ patch[f]=null; });
    // Special resets
    if(lista.includes('nfEnviadaFlag')){ patch.nfEnviadaFlag=false; patch.nfEnviadaData=null; }
    if(lista.includes('armazenado')){ patch.armazenado=false; patch.armazenamentoData=null; }
    if(lista.includes('pendencia')){ patch.pendencia=false; patch.tiposPendencia=[]; patch.pendenciaOutro=null; }
    await updateDoc(doc(db,'obras',obraId), patch);
    const o = obras.find(x=>x.id===obraId);
    if(o){ lista.forEach(f=>{ o[f]=null; }); if(patch.nfEnviadaFlag===false) o.nfEnviadaFlag=false; renderAcoesODI(o); }
    toast('✓ Registro desfeito.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};
// Abre seção de ações ODI no modal (chamado por openObraModal quando tipo=ODI)
function renderAcoesODI(obra){
  const cont = document.getElementById('secODIAcoes');
  if(!cont || !obra) return;
  const isEmp  = me.perfil==='empreiteira';
  const isFisc = me.perfil==='fiscal'||me.perfil==='fiscal_adm';
  const isAdm  = me.perfil==='adm_odi'||me.perfil==='gerente';
  const oId    = obra.id;
  const fmtD = d => d ? fmtTxt(d) : '—';
  const badge = (ok,label,sub='',delCampos=null) => ok
    ? `<div style="display:flex;align-items:center;gap:8px;color:#22C55E;font-size:10px;font-weight:700">
        ✅ ${label}${sub?'<span style="font-weight:400;color:var(--muted)"> ('+sub+')</span>':''}
        ${delCampos&&isAdm?`<button onclick="odiApagarCampo('${oId}','${delCampos}')" title="Desfazer registro" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:11px;opacity:.7;padding:0">🗑</button>`:''}
      </div>`
    : `<div style="font-size:10px;color:var(--muted)">⏳ ${label}</div>`;
  const card = (title, body) =>
    `<div style="background:var(--surface2);border-radius:8px;padding:10px;border:1px solid var(--border)">`+
    `<div style="font-size:10px;font-weight:700;margin-bottom:8px">${title}</div>${body}</div>`;
  const dateField = (id, label, btnLabel, onclick) =>
    `<div class="fg"><label style="font-size:9px">${label}</label>`+
    `<input type="date" id="${id}" max="${hojeStr()}"></div>`+
    `<button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="${onclick}">${btnLabel}</button>`;

  let sections = [];

  // ── 1. Conclusão (Empreiteira / Fiscal / Adm / Gerente) ──────────────
  if(isEmp||isFisc||isAdm){
    sections.push(card('🏁 Conclusão da Obra',
      obra.conclusao ? badge(true,'Informada em '+fmtD(obra.conclusao),'','conclusao')
      : dateField('odiConclusao','Data de conclusão','Registrar Conclusão',
          `odiSalvarCampo('${oId}','conclusao',document.getElementById('odiConclusao')?.value)`)
    ));
  }

  // ── 2. Fiscalização em campo (Fiscal / Adm / Gerente) ────────────────
  if(isFisc||isAdm){
    const bloqueado = !obra.conclusao;
    sections.push(card('🔍 Fiscalização em Campo',
      obra.fiscalizacao ? badge(true,'Fiscalizada em '+fmtD(obra.fiscalizacao),'','fiscalizacao')
      : bloqueado ? '<div style="font-size:9px;color:var(--muted)">⏸ Aguarda conclusão informada.</div>'
      : dateField('odiFiscData','Data da fiscalização','Registrar Fiscalização',
          `odiSalvarCampo('${oId}','fiscalizacao',document.getElementById('odiFiscData')?.value)`)
    ));
  }

  // ── 3. Kaffa ODI — feito pelo fiscal ────────────────────────────────
  if(isFisc||isAdm){
    const bloqueado = !obra.conclusao;
    sections.push(card('✅ Kaffa (registrado pelo fiscal)',
      obra.kaffaODI ? badge(true,'Registrado em '+fmtD(obra.kaffaODI),'','kaffaODI')
      : bloqueado ? '<div style="font-size:9px;color:var(--muted)">⏸ Aguarda conclusão informada.</div>'
      : dateField('odiKaffaData','Data do kaffa','Registrar Kaffa',
          `odiSalvarCampo('${oId}','kaffaODI',document.getElementById('odiKaffaData')?.value)`)
    ));
  }

  // ── 4. Pendência Construtiva — mesmas opções da RD (Fiscal / Adm / Gerente) ──
  if(isFisc||isAdm){
    const temPend = obra.pendencia && !obra.pendenciaResolvida;
    const TIPOS_PEND = ['Poda','Aterramento de Cerca','Conexão','Estrutura','Aterramento',
      'Transformador','Poste','Compartilhadora','Desmonte','Lixo no local','Calçada','Outro'];
    const tiposAtivos = obra.tiposPendencia||[];
    let pendBody = '';
    if(temPend){
      pendBody = `
      <div style="background:rgba(239,68,68,.1);border-radius:6px;padding:8px;margin-bottom:8px">
        <div style="font-size:9px;font-weight:700;color:#EF4444">⚠️ Pendência ativa: ${tiposAtivos.join(', ')||'—'}${obra.pendenciaOutro?' / '+obra.pendenciaOutro:''}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:#7c6af7;padding:6px 8px;background:rgba(124,106,247,.08);border-radius:6px;margin-bottom:8px">
        ⚠️ Favor imputar a medida 321 dentro do sistema SAP.
      </div>
      <button class="btn btn-sm" style="background:rgba(34,197,94,.1);color:#22C55E;border-color:#22C55E55" onclick="odiResolverPendencia('${oId}')">✓ Confirmar Pendência Resolvida</button>`;
    } else if(!obra.pendenciaResolvida){
      pendBody = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${TIPOS_PEND.map(t=>`<label style="display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer">
          <input type="checkbox" class="chk-pend-odi" value="${t}"> ${t}
        </label>`).join('')}
      </div>
      <div id="fgPendODIOutro" style="display:none;margin-bottom:6px">
        <input type="text" id="oPendODIOutro" placeholder="Descreva o tipo..." style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:inherit;width:100%">
      </div>
      <button class="btn btn-sm btn-secondary" style="color:#F97316" onclick="odiRegistrarPendencia('${oId}')">⚠️ Registrar Pendência</button>`;
    } else {
      pendBody = badge(true,'Pendência resolvida');
    }
    sections.push(card('⚠️ Pendência Construtiva', pendBody));
    // Show "Outro" field when selected
    setTimeout(()=>{
      document.querySelectorAll('.chk-pend-odi[value="Outro"]').forEach(el=>{
        el.onchange = ()=>{
          const fg = document.getElementById('fgPendODIOutro');
          if(fg) fg.style.display = el.checked ? '' : 'none';
        };
      });
    },50);
  }

  // ── 5. Envio de NF (Empreiteira / Adm / Gerente) ────────────────────
  if(isEmp||isAdm){
    const bloqueado = !obra.kaffaODI;
    sections.push(card('📋 Envio de Notas Fiscais',
      obra.nfEnviadaFlag ? badge(true,'Enviadas em '+fmtD(obra.nfEnviadaData),'','nfEnviadaFlag')
      : bloqueado ? '<div style="font-size:9px;color:var(--muted)">⏸ Aguarda kaffa registrado pelo fiscal.</div>'
      : dateField('odiNfData','Data do envio das NF','Registrar Envio de NF',
          `odiSalvarNFEnvio('${oId}')`)
    ));
  }

  // ── 6. Lançamento NF (Adm / Gerente) ────────────────────────────────
  if(isAdm && obra.nfEnviadaFlag){
    sections.push(card('🧾 Lançamento de Notas Fiscais',
      obra.nfLancadaData ? badge(true,'Lançadas em '+fmtD(obra.nfLancadaData),'','nfLancadaData')
      : dateField('odiNfLancData','Data do lançamento','Registrar Lançamento',
          `odiSalvarCampo('${oId}','nfLancadaData',document.getElementById('odiNfLancData')?.value)`)
    ));
  }

  // ── 7. Pendências Documentais (Adm / Gerente) — visível junto com lançamento NF ──
  if(isAdm && obra.nfEnviadaFlag){
    const PEND_LOT=['Falta de nota fiscal','Falta de devolução de material',
      'Falta de contrato de incorporação assinado','Falta de COSIP assinada','BIM aprovado','Medida 320','Outros'];
    const PEND_LIV=['Falta de nota fiscal','Falta de devolução de material','BIM aprovado','Medida 320','Outros'];
    const pendList = obra.descricaoODI==='Loteamento' ? PEND_LOT : PEND_LIV;
    const pendAtivas = obra.pendenciasDocODI||[];
    sections.push(card('📄 Pendências Documentais',
      `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${pendList.map(p=>`<label style="display:flex;align-items:center;gap:4px;font-size:10px;cursor:pointer">
          <input type="checkbox" ${pendAtivas.includes(p)?'checked':''} 
            onchange="odiTogglePendDoc('${oId}','${p}',this.checked);if('${p}'==='Outros'){const f=document.getElementById('fgPendDocOutros_${oId}');if(f)f.style.display=this.checked?'':'none';}"
          > ${p}
        </label>`).join('')}
        <div id="fgPendDocOutros_${oId}" style="${pendAtivas.includes('Outros')?'':'display:none'};margin-top:6px">
          <input type="text" id="pendDocOutrosText_${oId}" placeholder="Descreva a pendência documental..." 
            value="${obra.pendenciaDocOutros||''}"
            onchange="odiSalvarCampo('${oId}','pendenciaDocOutros',this.value)"
            style="width:100%;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:inherit">
        </div>
      </div>
      ${pendAtivas.length>0
        ?`<div style="font-size:9px;color:#EF4444;font-weight:700">⚠️ ${pendAtivas.length} pendência(s) ativa(s)</div>`
        :`<div style="font-size:9px;color:#22C55E">✅ Sem pendências documentais</div>`}`
    ));
  }

  // ── 7b. Pendências Documentais — leitura para o Fiscal (repassar à empreiteira) ──
  if(isFisc && !isAdm){
    const pendF = obra.pendenciasDocODI||[];
    if(pendF.length){
      sections.push(card('📄 Pendências Documentais (informadas pelo Adm_ODI)',
        `<div style="font-size:9px;color:#EF4444;font-weight:700;margin-bottom:4px">⚠️ ${pendF.length} pendência(s) ativa(s) — repassar à empreiteira se necessário</div>
         ${pendF.map(p=>`<div style="font-size:11px;padding:2px 0">• ${p==='Outros'&&obra.pendenciaDocOutros?('Outros: '+String(obra.pendenciaDocOutros).replace(/</g,'&lt;')):p}</div>`).join('')}`));
    } else if(obra.nfEnviadaFlag){
      sections.push(card('📄 Pendências Documentais','<div style="font-size:9px;color:#22C55E">✅ Sem pendências documentais registradas</div>'));
    }
  }

  // ── 8. Encaminhamento Devolução Financeira (Adm / Gerente) ──────────
  // Deve ser anterior às medidas 70/230
  const podeDevFin = isAdm && obra.nfLancadaData
    && !(obra.pendenciasDocODI||[]).length && !(obra.pendencia&&!obra.pendenciaResolvida);
  if(podeDevFin){
    sections.push(card('💰 Encaminhamento Devolução Financeira',
      obra.devolucaoFinanceiraData ? badge(true,'Encaminhado em '+fmtD(obra.devolucaoFinanceiraData),'','devolucaoFinanceiraData')
      : dateField('odiDevFinData','Data do encaminhamento','Registrar Encaminhamento',
          `odiSalvarCampo('${oId}','devolucaoFinanceiraData',document.getElementById('odiDevFinData')?.value)`)
    ));
  }

  // ── 9. Medidas 70 + 230 — somente após devolução financeira ─────────
  const podeMed7030 = isAdm && obra.devolucaoFinanceiraData
    && !(obra.pendenciasDocODI||[]).length && !(obra.pendencia&&!obra.pendenciaResolvida);
  if(podeMed7030){
    const ambas = obra.medida70 && obra.medida230;
    const umaFalta = (obra.medida70&&!obra.medida230)||(!obra.medida70&&obra.medida230);
    sections.push(card('📐 Medidas 70 + 230 (lançadas juntas)',
      ambas ? badge(true,'Med. 70: '+fmtD(obra.medida70)+' / Med. 230: '+fmtD(obra.medida230),'','medida70')
      : `${umaFalta?'<div style="color:#EF4444;font-size:9px;font-weight:700;margin-bottom:6px">⚠️ Uma medida sem a outra — registre ambas!</div>':''}`+
        dateField('odiMed70230Data','Data (mesma para Med. 70 e Med. 230)','Registrar Med. 70 + 230',
          `odiSalvarMedidas70230('${oId}')`)
    ));
  }

  // ── 10. Medida 280 — somente após 70+230 ────────────────────────────
  if(isAdm && obra.medida70 && obra.medida230){
    sections.push(card('📐 Medida 280',
      obra.medida280 ? badge(true,'Registrada em '+fmtD(obra.medida280),'','medida280')
      : dateField('odiMed280Data','Data da Medida 280','Registrar Medida 280',
          `odiSalvarCampo('${oId}','medida280',document.getElementById('odiMed280Data')?.value)`)
    ));
  }

  // ── 0. Cancelar obra ODI (Adm / Gerente apenas) ──────────────────────
  if(isAdm && !obra.armazenado){
    sections.push(card('🚫 Cancelamento',
      obra.cancelado
        ? `<div style="color:#EF4444;font-size:10px;font-weight:700">⛔ Obra cancelada em ${fmtD(obra.dataCancelamento)}</div>
           <button class="btn btn-sm btn-secondary" style="margin-top:6px;font-size:10px" onclick="odiSalvarCampo('${oId}','cancelado',false)">↩ Reativar obra</button>`
        : `<button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#EF4444;border:1px solid #EF444455" onclick="if(confirm('Cancelar esta obra ODI?')){odiSalvarCampo('${oId}','cancelado',true);odiSalvarCampo('${oId}','dataCancelamento','${new Date().toISOString().split('T')[0]}');}">🚫 Cancelar Obra</button>`
    ));
  }

  // ── 11. Envio para Cadastro — PS (Fiscal / Adm / Gerente) ──────────
  if(isFisc||isAdm){
    sections.push(card('📁 Envio para Cadastro (PS)',
      obra.dataCadastro ? badge(true,'Enviado em '+fmtD(obra.dataCadastro),'','dataCadastro')
      : dateField('odiCadastroData','Data de envio para cadastro','Registrar Envio Cadastro',
          `odiSalvarCampo('${oId}','dataCadastro',document.getElementById('odiCadastroData')?.value)`)
    ));
  }

  // ── 12. Armazenamento (Adm / Gerente) ────────────────────────────────
  if(isAdm && obra.medida280){
    sections.push(card('📦 Armazenamento',
      obra.armazenado ? badge(true,'Armazenada')
      : `<button class="btn btn-sm btn-secondary" onclick="odiSalvarCampo('${oId}','armazenado',true)">Registrar Armazenamento</button>`
    ));
  }

  // ── 12. Equipamentos/Transformadores (Fiscal / Adm / Gerente) ───────
  if(isFisc||isAdm){
    // Initialize from obra data
    if(!_equipModificado){
      _equipInstalados = obra?.equipamentosInstalados?.length ? obra.equipamentosInstalados.map(e=>({...e})) : [];
      _equipRetirados  = obra?.equipamentosRetirados?.length  ? obra.equipamentosRetirados.map(e=>({...e}))  : [];
    }
    const equipBody = `
      <div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:9px;color:var(--muted);font-weight:700">INSTALADO</span>
          <button type="button" onclick="adicionarEquipInstaladoODI()" class="btn btn-secondary btn-sm" style="font-size:9px">+ Adicionar</button>
        </div>
        <div id="listaEquipInstaladosODI"><div style="font-size:10px;color:var(--muted)">Nenhum equipamento instalado.</div></div>
      </div>
      <div style="padding-top:8px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:9px;color:var(--muted);font-weight:700">RETIRADO</span>
          <button type="button" onclick="adicionarEquipRetiradoODI()" class="btn btn-secondary btn-sm" style="font-size:9px">+ Adicionar</button>
        </div>
        <div id="listaEquipRetiradosODI"><div style="font-size:10px;color:var(--muted)">Nenhum equipamento retirado.</div></div>
      </div>`;
    const equipCardBody = equipBody + `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-sm" onclick="salvarEquipamentosODI('${oId}')">💾 Salvar Equipamentos</button>
        <span style="font-size:9px;color:var(--muted);margin-left:8px">Os campos acima são salvos ao clicar em Salvar Equipamentos.</span>
      </div>`;
    sections.push(card('🔩 Equipamentos / Transformadores', equipCardBody));
    // Render into ODI-specific containers (avoid ID conflict with secExec)
    setTimeout(()=>{ renderEquipInstaladosODI(); renderEquipRetiradosODI(); }, 60);
  }

  // ── 13. Locais de Trabalho (todos — sempre editável para gerente/fiscal) ───
  const locaisODI = obra.locaisTrabalho||[];
  const podeEditarLocais = isFisc || isAdm;
  sections.push(card('📍 Locais de Trabalho',
    `${locaisODI.map(l=>`<div style="display:flex;align-items:flex-start;gap:6px;font-size:10px;padding:4px 0;border-bottom:1px solid var(--border)" id="odiLocalRow_${l.id}">
      <span style="color:var(--muted);white-space:nowrap">${fmtTxt(l.data)}</span>
      <span style="flex:1" id="odiLocalTxt_${l.id}">${l.descricao}</span>
      ${podeEditarLocais?`<button onclick="odiEditarLocal('${oId}','${l.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px;padding:0" title="Editar">✏️</button>`:''}
      ${podeEditarLocais?`<button onclick="odiRemoverLocal('${oId}','${l.id}')" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:11px;padding:0" title="Remover">✕</button>`:''}
    </div>`).join('')||'<div style="font-size:10px;color:var(--muted);margin-bottom:4px">Nenhum local registrado.</div>'}
    ${podeEditarLocais?`<div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" id="odiLocalDesc" placeholder="Descrição do local..." style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:inherit">
      <button class="btn btn-sm btn-secondary" onclick="odiAdicionarLocal('${oId}')">+ Local</button>
    </div>`:''}`,
  ));

  const grid = sections.length > 1
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">${sections.join('')}</div>`
    : sections.join('');

  cont.innerHTML = `<div style="border-top:2px solid #F59E0B;margin-top:12px;padding-top:12px">
    <div style="font-size:11px;font-weight:800;color:#F59E0B;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">⚡ Ações ODI</div>
    ${grid}
  </div>`;
}

window.odiAdicionarLocal = async function(obraId){
  const desc = document.getElementById('odiLocalDesc')?.value?.trim();
  if(!desc){ toast('Informe a descrição do local.','warn'); return; }
  const o = obras.find(x=>x.id===obraId);
  if(!o) return;
  const hoje = new Date().toISOString().split('T')[0];
  const novoLocal = {id:'lt_'+Date.now(), data:hoje, descricao:desc};
  const novosLocais = [...(o.locaisTrabalho||[]), novoLocal];
  try{
    await updateDoc(doc(db,'obras',obraId),{locaisTrabalho:novosLocais});
    o.locaisTrabalho = novosLocais;
    renderAcoesODI(o);
    toast('✓ Local registrado.','ok');
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

window.odiEditarLocal = function(obraId, localId){
  const row = document.getElementById('odiLocalRow_'+localId);
  const o = obras.find(x=>x.id===obraId);
  if(!row || !o) return;
  const local = (o.locaisTrabalho||[]).find(l=>l.id===localId);
  if(!local) return;
  row.innerHTML = `
    <span style="font-size:10px;color:var(--muted);white-space:nowrap">${fmtTxt(local.data)}</span>
    <input type="text" id="odiLocalEdit_${localId}" value="${local.descricao.replace(/"/g,'&quot;')}"
      style="font-size:11px;flex:1;border:1px solid var(--accent);border-radius:4px;padding:2px 6px;background:var(--surface);color:inherit"
      onkeydown="if(event.key==='Enter') odiSalvarEdicaoLocal('${obraId}','${localId}');if(event.key==='Escape') renderAcoesODI(obras.find(x=>x.id==='${obraId}'));">
    <button onclick="odiSalvarEdicaoLocal('${obraId}','${localId}')" style="background:var(--accent);border:none;color:#fff;cursor:pointer;border-radius:4px;padding:2px 8px;font-size:10px">✓</button>
    <button onclick="renderAcoesODI(obras.find(x=>x.id==='${obraId}'))" style="background:none;border:1px solid var(--border);cursor:pointer;border-radius:4px;padding:2px 6px;font-size:10px">✕</button>`;
  document.getElementById('odiLocalEdit_'+localId)?.focus();
};

window.odiSalvarEdicaoLocal = async function(obraId, localId){
  const novaDesc = document.getElementById('odiLocalEdit_'+localId)?.value?.trim();
  if(!novaDesc){ toast('Descrição não pode estar vazia.','err'); return; }
  const o = obras.find(x=>x.id===obraId);
  if(!o) return;
  const novosLocais = (o.locaisTrabalho||[]).map(l=>l.id===localId?{...l,descricao:novaDesc}:l);
  try{
    await updateDoc(doc(db,'obras',obraId),{locaisTrabalho:novosLocais});
    o.locaisTrabalho = novosLocais;
    renderAcoesODI(o);
    toast('✓ Local atualizado.','ok');
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

window.odiRemoverLocal = async function(obraId, localId){
  if(!confirm('Remover este local de trabalho?')) return;
  const o = obras.find(x=>x.id===obraId);
  if(!o) return;
  const novosLocais = (o.locaisTrabalho||[]).filter(l=>l.id!==localId);
  try{
    await updateDoc(doc(db,'obras',obraId),{locaisTrabalho:novosLocais});
    o.locaisTrabalho = novosLocais;
    renderAcoesODI(o);
    toast('Local removido.','ok');
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

// ── ODI action helpers ────────────────────────────────────────────────────
window.odiSalvarCampo = async function(obraId, campo, valor){
  // Allow boolean true for armazenado, but reject empty strings/null for dates
  if(valor==='' || valor===null || valor===undefined){ toast('Informe o valor antes de salvar.','warn'); return; }
  try{
    const patch = {[campo]: valor};
    // If armazenado, also set armazenamentoData
    if(campo==='armazenado' && valor===true) patch.armazenamentoData = hojeStr();
    await updateDoc(doc(db,'obras',obraId), patch);
    const o = obras.find(x=>x.id===obraId);
    if(campo==='conclusao' && o && me.perfil!=='fiscal' && me.perfil!=='fiscal_adm'){
      try{ await enviarEmailConclusao({...o,conclusao:valor}); }catch(e){ console.warn('[Email Conclusão ODI]',e); }
    }
    if(o){
      o[campo] = valor;
      if(patch.armazenamentoData) o.armazenamentoData = patch.armazenamentoData;
      renderAcoesODI(o);
    }
    toast('✓ Registrado com sucesso.','ok');
    renderDashDebounced();
  }catch(e){
    console.error('[ODI] odiSalvarCampo error:', campo, e.code, e.message);
    toast('Erro ao salvar: '+e.message,'err');
  }
};

window.odiSalvarNFEnvio = async function(obraId){
  const data = document.getElementById('odiNfData')?.value;
  if(!data){ toast('Informe a data do envio.','warn'); return; }
  try{
    await updateDoc(doc(db,'obras',obraId),{nfEnviadaFlag:true, nfEnviadaData:data});
    const o = obras.find(x=>x.id===obraId);
    if(o){ o.nfEnviadaFlag=true; o.nfEnviadaData=data; renderAcoesODI(o); }
    toast('✓ Envio de NF registrado.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

window.odiSalvarMedidas70230 = async function(obraId){
  const data = document.getElementById('odiMed70230Data')?.value;
  if(!data){ toast('Informe a data das medidas.','warn'); return; }
  try{
    await updateDoc(doc(db,'obras',obraId),{medida70:data, medida230:data});
    const o = obras.find(x=>x.id===obraId);
    if(o){ o.medida70=data; o.medida230=data; renderAcoesODI(o); }
    toast('✓ Medidas 70 e 230 registradas.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

window.odiTogglePendDoc = async function(obraId, item, checked){
  const o = obras.find(x=>x.id===obraId);
  if(!o) return;
  let pends = [...(o.pendenciasDocODI||[])];
  if(checked && !pends.includes(item)) pends.push(item);
  if(!checked) pends = pends.filter(p=>p!==item);
  try{
    await updateDoc(doc(db,'obras',obraId),{pendenciasDocODI:pends});
    o.pendenciasDocODI=pends; renderAcoesODI(o);
    toast(checked?'⚠️ Pendência adicionada.':'✓ Pendência removida.','ok');
    renderDashDebounced();
  }catch(e){ toast('Erro: '+e.message,'err'); }
};

// ══════════════════════════════════════════════════════════
//  ODI — Dashboard do Administrador ODI
// ══════════════════════════════════════════════════════════
function renderDashAdmOdi(){
  const cont = document.getElementById('pgDashOdiContent');
  if(!cont){ 
    // Create page if not in HTML
    const pg = document.getElementById('pgDashOdi');
    if(pg) pg.innerHTML='<div id="pgDashOdiContent"></div>';
    return setTimeout(renderDashAdmOdi,100);
  }

  // Fiscal vê somente suas obras ODI; adm_odi e gerente veem todas
  const isFiscalODI = me.perfil==='fiscal'||me.perfil==='fiscal_adm';

  // Filtros ativos (persistidos em window._odiDashFiltros)
  window._odiDashFiltros = window._odiDashFiltros || {empreiteira:'', fiscal:''};
  const f_emp  = window._odiDashFiltros.empreiteira;
  const f_fisc = window._odiDashFiltros.fiscal;

  // Listas únicas para os selects
  const todasODI = obras.filter(o=>o.tipo==='ODI'&&!o.cancelado);
  const empreiteirasODI = [...new Set(todasODI.map(o=>o.empreiteira||'').filter(Boolean))].sort();
  const fiscaisODI      = [...new Set(todasODI.map(o=>o.fiscal||'').filter(Boolean))].sort();

  const odiObrasBase = obras.filter(o=>o.tipo==='ODI'&&!o.cancelado&&
    (!isFiscalODI || o.fiscal===me.vinculo||o.fiscal===me.nome));
  const odiObras = odiObrasBase
    .filter(o=>!f_emp  || o.empreiteira===f_emp)
    .filter(o=>!f_fisc || o.fiscal===f_fisc);

  const hoje = new Date().toISOString().split('T')[0];

  // Card data
  const agFiscKaffa   = odiObras.filter(o=>o.conclusao && !o.kaffaODI && !o.armazenado);
  const agNF          = odiObras.filter(o=>o.kaffaODI && !o.nfEnviadaFlag && !o.armazenado);
  const agLancamento  = odiObras.filter(o=>o.nfEnviadaFlag && !o.nfLancadaData && !o.armazenado);
  const comPendencia  = odiObras.filter(o=>{
    if(o.armazenado) return false;
    return (o.pendenciasDocODI||[]).length>0 || (o.pendencia&&!o.pendenciaResolvida);
  });
  // Monitor 70/230: NF lançada, sem pendências, sem med.70/230
  const ag7030        = odiObras.filter(o=>o.nfLancadaData && !o.medida70 && !o.medida230
    && !(o.pendenciasDocODI||[]).length && !(o.pendencia&&!o.pendenciaResolvida) && !o.armazenado);
  // Monitor 280: 70+230 feitas, sem 280
  const ag280         = odiObras.filter(o=>o.medida70 && o.medida230 && !o.medida280 && !o.armazenado);

  function kpiOdi(label, n, cor, sub=''){
    return `<div style="background:var(--surface);border:2px solid ${cor}33;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:24px;font-weight:900;color:${cor}">${n}</div>
      <div style="font-size:10px;color:var(--muted)">${label}</div>
      ${sub?`<div style="font-size:9px;color:${cor};margin-top:2px">${sub}</div>`:''}
    </div>`;
  }

  function obraRow(o, mostrarDias, diasFn){
    const st = statusOfODI(o);
    const dias = diasFn ? diasFn(o) : 0;
    const loteTag = o.descricaoODI==='Loteamento'?'<span style="color:#D97706;font-size:8px;font-weight:700"> 🏘️Lot.</span>':'';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openObraModal('${o.id}')">
      <td style="padding:5px 8px;font-weight:700;color:var(--accent);font-size:10px">${o.numero}${loteTag}</td>
      <td style="padding:5px 8px;font-size:10px">${o.cidade||'—'}</td>
      <td style="padding:5px 8px;font-size:10px">${o.empreiteira||'—'}</td>
      <td style="padding:5px 8px;font-size:10px">${o.fiscal||'—'}</td>
      ${mostrarDias?`<td style="padding:5px 8px;text-align:center;font-size:10px;color:${dias>15?'#EF4444':'#F59E0B'};font-weight:700">${dias}d</td>`:''}
      <td style="padding:5px 8px;font-size:9px;color:var(--muted)">${st}</td>
    </tr>`;
  }

  function tabelaOdi(lista, titulo, cor, mostrarDias, diasFn){
    if(!lista.length) return '';
    const hdrDias = mostrarDias?'<th style="padding:5px 8px;text-align:center">Dias</th>':'';
    return `<div style="background:var(--surface);border:1px solid ${cor}44;border-radius:12px;overflow:hidden;margin-bottom:14px">
      <div style="background:${cor}22;padding:8px 12px;font-weight:700;font-size:12px;color:${cor}">${titulo} (${lista.length})</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:5px 8px;text-align:left">Nota</th>
          <th style="padding:5px 8px;text-align:left">Cidade</th>
          <th style="padding:5px 8px;text-align:left">Empreiteira</th>
          <th style="padding:5px 8px;text-align:left">Fiscal</th>
          ${hdrDias}
          <th style="padding:5px 8px;text-align:left">Status</th>
        </tr></thead>
        <tbody>${lista.map(o=>obraRow(o,mostrarDias,diasFn)).join('')}</tbody>
      </table></div>
    </div>`;
  }

  // Filter controls HTML
  const filtroHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:var(--surface);
      border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px">
      <span style="font-size:11px;font-weight:700;color:var(--muted)">🔽 Filtrar por:</span>

      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:10px;color:var(--muted)">Empreiteira</label>
        <select id="odiFilterEmp" onchange="window._odiDashFiltros.empreiteira=this.value;renderDashAdmOdi()"
          style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);
            background:var(--surface);color:inherit;cursor:pointer">
          <option value="">Todas</option>
          ${empreiteirasODI.map(e=>`<option value="${e}" ${f_emp===e?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>

      ${!isFiscalODI ? `<div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:10px;color:var(--muted)">Fiscal</label>
        <select id="odiFilterFisc" onchange="window._odiDashFiltros.fiscal=this.value;renderDashAdmOdi()"
          style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);
            background:var(--surface);color:inherit;cursor:pointer">
          <option value="">Todos</option>
          ${fiscaisODI.map(f=>`<option value="${f}" ${f_fisc===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>` : ''}

      ${(f_emp||f_fisc) ? `<button onclick="window._odiDashFiltros={empreiteira:'',fiscal:''};renderDashAdmOdi()"
        style="font-size:10px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);
          background:none;cursor:pointer;color:#EF4444">✕ Limpar filtros</button>
        <span style="font-size:10px;color:#F59E0B;font-weight:600">
          Mostrando ${odiObras.length} de ${odiObrasBase.length} obras
        </span>` : ''}
    </div>`;

  cont.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:900;margin-bottom:16px">🏗️ Painel ODI</div>
    ${filtroHTML}
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:20px">
      ${kpiOdi('Total ODI', odiObras.filter(o=>!o.armazenado).length,'#7c6af7')}
      ${kpiOdi('Ag. Fisc/Kaffa', agFiscKaffa.length,'#F59E0B')}
      ${kpiOdi('Ag. Receb. NF', agNF.length,'#F97316', agNF.length?'Máx: '+Math.max(...agNF.map(o=>diasEntre(o.kaffaODI)))+'d':'')}
      ${kpiOdi('Ag. Lançamento', agLancamento.length,'#EF4444', agLancamento.length?'Máx: '+Math.max(...agLancamento.map(o=>diasEntre(o.nfEnviadaData)))+'d':'')}
      ${kpiOdi('Com Pendência', comPendencia.length,'#DC2626')}
      ${kpiOdi('Ag. Med. 70/230', ag7030.length,'#3B82F6')}
      ${kpiOdi('Ag. Med. 280', ag280.length,'#8B5CF6')}
    </div>

    <!-- Tabelas -->
    <!-- Métricas de tempo adm_odi -->
    ${(()=>{
      const concluidas = odiObras.filter(o=>o.nfLancadaData);
      function avgDiasODI(lista, c1, c2){
        const diffs = lista.map(o=>{ if(!o[c1]||!o[c2]) return null;
          const d1=new Date(o[c1]+'T00:00:00'), d2=new Date(o[c2]+'T00:00:00');
          return Math.round((d2-d1)/(1000*60*60*24));
        }).filter(x=>x!==null&&x>=0);
        return diffs.length ? Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length) : null;
      }
      const tKaffaNF = avgDiasODI(odiObras,'kaffaODI','nfEnviadaData');
      const tNFLanc  = avgDiasODI(odiObras,'nfEnviadaData','nfLancadaData');
      const tLancMed = avgDiasODI(odiObras,'nfLancadaData','medida70');
      const fmt = v => v!==null ? v+'d' : '—';
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">
        <div style="font-weight:800;font-size:13px;margin-bottom:10px">⏱️ Tempo Médio de Processamento (Adm. ODI)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
          <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:900;color:#F97316">${fmt(tKaffaNF)}</div>
            <div style="font-size:9px;color:var(--muted)">Kaffa → Envio NF (empreiteira)</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:900;color:#EF4444">${fmt(tNFLanc)}</div>
            <div style="font-size:9px;color:var(--muted)">Recebimento → Lançamento NF</div>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:900;color:#3B82F6">${fmt(tLancMed)}</div>
            <div style="font-size:9px;color:var(--muted)">Lançamento → Medidas 70/230</div>
          </div>
        </div>
      </div>`;
    })()}

    ${tabelaOdi(agFiscKaffa,'⏳ Aguardando Fiscalização / Kaffa','#F59E0B',false,null)}
    ${tabelaOdi(agNF,'📋 Aguardando Recebimento de NF pela Empreiteira','#F97316',true,o=>diasEntre(o.kaffaODI))}
    ${tabelaOdi(agLancamento,'🧾 Aguardando Lançamento de Notas','#EF4444',true,o=>diasEntre(o.nfEnviadaData))}
    ${tabelaOdi(comPendencia,'⚠️ Obras com Pendência','#DC2626',false,null)}

    <!-- Monitor de Armazenamento ODI (adm_odi + gerente) -->
    ${(()=>{
      const agArmODI = odiObras.filter(o => o.medida280 && !o.armazenado);
      const prep230ODI_dash = odiObras.filter(o => o.medida230 && !o.medida280 && !o.armazenado);
      const armOkODI = odiObras.filter(o => o.armazenado && o.medida280 && o.armazenamentoData);
      const diasArmODI = armOkODI.map(o=>{
        const d1=new Date(o.medida280+'T00:00:00'), d2=new Date(o.armazenamentoData+'T00:00:00');
        const d=Math.round((d2-d1)/(1000*60*60*24)); return d>=0?d:null;
      }).filter(v=>v!==null);
      const mediaArmODI = diasArmODI.length ? Math.round(diasArmODI.reduce((a,b)=>a+b,0)/diasArmODI.length) : null;

      // Salvar lista para filtro reativo ODI
      window._agArmODI_dash = agArmODI;
      function renderAgArmODITable(lista){
        if(!lista.length) return '<div style="font-size:11px;color:#22C55E;margin-bottom:8px">✅ Nenhuma obra ODI aguardando armazenamento.</div>';
        return `<div style="font-size:11px;font-weight:700;color:#F59E0B;margin-bottom:6px">📦 Aguardando Armazenamento — Med.280 Registrada (${lista.length})</div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:5px 8px">Nota</th><th style="padding:5px 8px">Cidade</th>
              <th style="padding:5px 8px">Fiscal</th><th style="padding:5px 8px;text-align:center">Med.280</th>
              <th style="padding:5px 8px">Faltando</th><th style="padding:5px 8px"></th>
            </tr></thead>
            <tbody>${lista.map(o=>{
              const itens=[o.contratosAssinado?null:'Contratos',o.projetosAsBuilt?null:'As-Built',o.caixaArmazenada?null:'Caixa',o.cadastroConfirmado?null:'Cadastro Genesis'].filter(Boolean);
              return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:5px 8px;font-weight:700;color:var(--accent)">${o.numero}</td>
                <td style="padding:5px 8px">${o.cidade||'—'}</td>
                <td style="padding:5px 8px">${o.fiscal||'—'}</td>
                <td style="padding:5px 8px;text-align:center">${fmtTxt(o.medida280)}</td>
                <td style="padding:5px 8px">${itens.length?`<span style="font-size:9px;color:#F59E0B">${itens.join(', ')}</span>`:'<span style="font-size:9px;color:#22C55E">✓ Pronto</span>'}</td>
                <td style="padding:5px 8px"><button class="btn btn-primary btn-sm" onclick="openObraModal('${o.id}')">Armazenar</button></td>
              </tr>`;}).join('')}
            </tbody>
          </table></div>`;
      }

      let html2 = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;margin-top:4px">
        <div style="font-weight:800;font-size:14px;margin-bottom:12px">📦 Monitor de Armazenamento ODI</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">
          ${kpiOdi('Ag. Armazenar', agArmODI.length,'#F59E0B')}
          ${kpiOdi('Preparar (230 s/280)', prep230ODI_dash.length,'#3B82F6')}
          ${kpiOdi('Tempo Médio', mediaArmODI!==null?mediaArmODI+'d':'—', mediaArmODI!==null?(mediaArmODI<=30?'#22C55E':mediaArmODI<=60?'#F59E0B':'#EF4444'):'#6B7280','Med.280→Arm.')}
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
          <input type="text" id="fltOdiArmBusca" placeholder="🔍 Filtrar por nota, cidade ou fiscal…"
            style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:11px;flex:1;min-width:180px;max-width:340px"
            oninput="applyOdiArmFilter()">
        </div>
        <div id="odiArmTableContainer"></div>`;

      // Inicializa tabela via setTimeout (DOM pronto)
      setTimeout(()=>{
        const c=document.getElementById('odiArmTableContainer');
        if(c) c.innerHTML=renderAgArmODITable(window._agArmODI_dash||[]);
      },0);
      window.applyOdiArmFilter=function(){
        const q=(document.getElementById('fltOdiArmBusca')?.value||'').toLowerCase().trim();
        const c=document.getElementById('odiArmTableContainer');
        if(!c) return;
        const filt=(window._agArmODI_dash||[]).filter(o=>!q||(o.numero||'').toLowerCase().includes(q)||(o.cidade||'').toLowerCase().includes(q)||(o.fiscal||'').toLowerCase().includes(q));
        c.innerHTML=renderAgArmODITable(filt);
      };

      if(prep230ODI_dash.length){
        html2 += `<div style="font-size:11px;font-weight:700;color:#3B82F6;margin-top:12px;margin-bottom:6px">🔵 Preparação Antecipada — Med.230 s/ Med.280 (${prep230ODI_dash.length})</div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px">Verifique contratos e documentação antes da Med.280 para agilizar o armazenamento.</div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:5px 8px">Nota</th><th style="padding:5px 8px">Cidade</th>
              <th style="padding:5px 8px">Fiscal</th><th style="padding:5px 8px;text-align:center">Med.230</th>
              <th style="padding:5px 8px;text-align:center">Prazo Med.280</th>
              <th style="padding:5px 8px">Checar</th><th style="padding:5px 8px"></th>
            </tr></thead>
            <tbody>${prep230ODI_dash.map(o=>{
              const prazo=prazoMedida280(o); const venc=prazo&&prazo<hoje;
              const itens=[o.contratosAssinado?null:'⚠️ Contratos',o.projetosAsBuilt?null:'⚠️ As-Built'].filter(Boolean);
              return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:5px 8px;font-weight:700;color:var(--accent)">${o.numero}</td>
                <td style="padding:5px 8px">${o.cidade||'—'}</td>
                <td style="padding:5px 8px">${o.fiscal||'—'}</td>
                <td style="padding:5px 8px;text-align:center">${fmtTxt(o.medida230)}</td>
                <td style="padding:5px 8px;text-align:center;${venc?'color:#EF4444;font-weight:700':''}">${prazo?fmtTxt(prazo):'—'}${venc?' ⚠️':''}</td>
                <td style="padding:5px 8px">${itens.length?`<span style="font-size:9px;color:#F59E0B">${itens.join(' ')}</span>`:'<span style="font-size:9px;color:#22C55E">✓ OK</span>'}</td>
                <td style="padding:5px 8px"><button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">Ver</button></td>
              </tr>`;}).join('')}
            </tbody>
          </table></div>`;
      }
      html2 += '</div>';
      return html2;
    })()}

    <!-- Monitor de Prazos ODI -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-weight:800;font-size:14px;margin-bottom:12px">📊 Monitor de Prazos — Medidas ODI</div>
      ${ag7030.length?`
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#3B82F6;margin-bottom:8px">🔵 Aguardando Registro das Medidas 70 + 230 (${ag7030.length} obras)</div>
        ${tabelaOdi(ag7030,'','#3B82F6',false,null)}
      </div>`:'<div style="font-size:11px;color:#22C55E;margin-bottom:10px">✅ Nenhuma obra aguardando Med. 70/230</div>'}
      ${ag280.length?`
      <div>
        <div style="font-size:11px;font-weight:700;color:#8B5CF6;margin-bottom:8px">🟣 Aguardando Medida 280 — prazo: fim do mês seguinte à Med. 230 (${ag280.length} obras)</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:5px 8px;text-align:left">Nota</th>
            <th style="padding:5px 8px;text-align:left">Cidade</th>
            <th style="padding:5px 8px;text-align:center">Med. 230</th>
            <th style="padding:5px 8px;text-align:center">Prazo 280</th>
            <th style="padding:5px 8px;text-align:center">Situação</th>
          </tr></thead>
          <tbody>${ag280.map(o=>{
            const prazo = prazoMedida280(o)||'—';
            const venc  = prazo&&prazo<hoje;
            return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openObraModal('${o.id}')">
              <td style="padding:5px 8px;font-weight:700;color:var(--accent)">${o.numero}</td>
              <td style="padding:5px 8px">${o.cidade||'—'}</td>
              <td style="padding:5px 8px;text-align:center">${fmtTxt(o.medida230)}</td>
              <td style="padding:5px 8px;text-align:center;${venc?'color:#EF4444;font-weight:700':''}">${prazo?fmtTxt(prazo):'—'}</td>
              <td style="padding:5px 8px;text-align:center">${venc?'<span style="color:#EF4444;font-weight:700">⚠️ Vencida</span>':'<span style="color:#22C55E">No prazo</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`:'<div style="font-size:11px;color:#22C55E">✅ Nenhuma obra aguardando Med. 280</div>'}
    </div>`;
}
window.renderDashAdmOdi = renderDashAdmOdi;


// ══════════════════════════════════════════════════════════════════════
//  MÓDULO: GERENCIAMENTO DE PEDIDOS — Etapa 3
//  Abertura · Medida 34 · Checklist · Análise documental (Ligação nova Rural) ·
//  Análise de projeto (Gerente) · Enquadramento · Reanálise · Linha do tempo ·
//  Visão "quem age agora" + prazo por pedido.
//  Módulo aditivo: não altera nenhum fluxo do controle de obras.
// ══════════════════════════════════════════════════════════════════════
const MUNICIPIOS_ARLAG = ['ANITA GARIBALDI','BOCAINA DO SUL','BOM JARDIM DA SERRA','BOM RETIRO',
  'CAMPO BELO DO SUL','CAPAO ALTO','CELSO RAMOS','CERRO NEGRO','CORREIA PINTO','CURITIBANOS',
  'FREI ROGERIO','LAGES','OTACILIO COSTA','PAINEL','PALMEIRA','PONTE ALTA','PONTE ALTA DO NORTE',
  'RIO RUFINO','SANTA CECILIA','SAO CRISTOVAO DO SUL','SAO JOAQUIM','SAO JOSE DO CERRITO','URUBICI','URUPEMA'];

const RURAL = 'Ligação nova Rural';
const TIPOS_SOLICITACAO = {
  'Alimentadores':                 {tipoPedido:'R2', prazoDias:60},
  'Equipamentos Especiais':        {tipoPedido:'R2', prazoDias:60},
  'Ext. para Ilum. Pública':       {tipoPedido:'R1', prazoDias:45},
  'Interligação Proj. Particular': {tipoPedido:'R1', prazoDias:30},
  'Ligação nova Rural':            {tipoPedido:'R1', prazoDias:30},
  'Ligação Nova Urbana':           {tipoPedido:'R1', prazoDias:30},
  'Loteamento – Conexão':          {tipoPedido:'R1', prazoDias:30},
  'Melhorias':                     {tipoPedido:'R2', prazoDias:60},
  'Outros (Descrever)':            {tipoPedido:'R1', prazoDias:30},
  'PVNT':                          {tipoPedido:'R2', prazoDias:30},
  'Remoção e Deslocamento':        {tipoPedido:'R1', prazoDias:45},
  'Troca de Padrão':               {tipoPedido:'R1', prazoDias:30},
};

// Checklist padrão (valor inicial) — o Gerente altera pela tela "⚙️ Configurar Checklist".
const CHECKLIST_PADRAO = {
  'PVNT':                    ['Relatório CQDE'],
  'Ext. para Ilum. Pública': ['Ofício Prefeitura','Lei de Criação da Via'],
  'Ligação nova Rural':      ['Declaração de Não APP','Autorização de Passagem do Solicitante','Autorização de Passagem de Terceiros','Matrícula Georreferenciada'],
};

const PROJETISTAS_PEDIDO = ['Tonimar','Valdir','Claudionei','Não informado','Copia','Jucimar Outro'];
const ACOES_ANALISTA = ['Enviado para Projeto','Liberado sem Obra','Cancelado','Abertura de Obra (Loteamento)','Abertura de Obra (Iluminação Pública)'];
const ORGAOS_COMPETENTES = ['IMA','DNIT','DINFRA'];

// Gerente responsável por município (definido previamente).
const GERENTES_MUNICIPIOS = {
  'Elvis': ['ANITA GARIBALDI','CELSO RAMOS','CURITIBANOS','FREI ROGERIO','PONTE ALTA','PONTE ALTA DO NORTE','SANTA CECILIA','SAO CRISTOVAO DO SUL','SAO JOSE DO CERRITO'],
  'Jose':  ['BOCAINA DO SUL','CAMPO BELO DO SUL','CAPAO ALTO','CERRO NEGRO','CORREIA PINTO','LAGES','OTACILIO COSTA','PAINEL','PALMEIRA'],
  'Elson': ['BOM JARDIM DA SERRA','BOM RETIRO','RIO RUFINO','URUBICI','URUPEMA','SAO JOAQUIM'],
};

// Parâmetros editáveis pelo Gerente (⚙️ Parâmetros). Prazos abaixo são valores iniciais a ajustar.
const PEDIDOS_PARAMS_PADRAO = {
  prazoProjetistaDias: 15,   // referência: quanto o projetista deveria levar para devolver o projeto
  prazoReanaliseDias: 5,     // prazo para concluir uma reanálise documental
  prazoAnalistaDias: 15,     // prazo (dias corridos da abertura) para o Analista definir: projeto / liberar sem obra / etc.
  fatorEstrada: 1.3,         // correção da distância em linha reta (Lages → equipamento) para estimar o percurso por estrada
  matriculaValidadeDias: 365,// matrícula atualizada há mais que isso gera aviso
  lvUcUrb: 300,              // Linha Viva: acima disso (UC desligadas, área urbana) é obrigatório verificar LV
  lvUcRur: 200,              // idem, área rural
  lvUcManobra: 1000,         // acima disso avisa para verificar possibilidade de manobra
  justificativasPrimeiroPonto: [
    'Possui outra unidade consumidora nº X em nome de Y dentro da matrícula',
    'O ponto de solicitação do projeto ficou fora da matrícula apresentada',
    'Necessário realizar conferência in-loco, pois possui unidade consumidora próximo ao limite da matrícula apresentada',
  ],
};

const PEDIDO_STATUS_LISTA = [
  'Analista Verificando',
  'Aguardando Projeto e check-list documental',
  'Aguardando Projeto sem análise documental',
  'Aguardando Projeto com análise documental',
  'Aguardando check-list documental e análise documental',
  'Aguardando análise documental',
  'Aguardando Validação do projeto',
  'Aguardando Reprojeto',
  'Aguardando Enquadramento',
  'Pedido atendido – Orçamento encaminhado',
  'Encerrado – Liberado sem Obra',
  'Encerrado – Cancelado',
  'Encaminhado ODI – Loteamento',
  'Encaminhado ODI – Iluminação Pública',
];

let pedidos=[], unsubPedidos=null;
let checklistTemplates={...CHECKLIST_PADRAO};
let pedidosParams={...PEDIDOS_PARAMS_PADRAO};

// ── helpers genéricos ────────────────────────────────
function pdHojeStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function pdAddDias(dateStr,n){
  if(!dateStr) return null;
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(y,m-1,d+Number(n||0));
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function pdEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pdNorm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function pdNumMat(s){ return String(s||'').replace(/\D/g,''); }
function pdMatchNome(a,b){ const x=pdNorm(a), y=pdNorm(b); if(!x||!y) return false; return x===y||x.includes(y)||y.includes(x); }
function pdClone(o){ return JSON.parse(JSON.stringify(o==null?null:o)); }
function pdGetPath(o,path){ return path.split('.').reduce((a,k)=>a==null?undefined:a[k],o); }
function pdSetPath(o,path,v){ const ks=path.split('.'); let c=o; for(let i=0;i<ks.length-1;i++){ if(c[ks[i]]==null||typeof c[ks[i]]!=='object') c[ks[i]]={}; c=c[ks[i]]; } c[ks[ks.length-1]]=v; }
function pdPerfilLabel(perfil){ return ({analista:'Analista',estagiario:'Estagiário',adm_odi:'Adm_ODI',gerente:'Gerente'})[perfil]||perfil; }

function gerenteDoMunicipio(m){ for(const [g,l] of Object.entries(GERENTES_MUNICIPIOS)) if(l.includes(m)) return g; return null; }

// ── PURE-LOGIC-START ─────────────────────────────────
function pedidoEhRural(p){ return p.tipoSolicitacao===RURAL; }
function terceirosNecessarios(p){ return pedidoEhRural(p) && p.analiseProjeto?.terceiros==='sim'; }
function statusEhEncerrado(status){ return !!status && status.indexOf('Encerrado')===0; }

// Item "Autorização de Passagem de Terceiros" (rural) só vale quando o Gerente define que é necessária.
function itemChecklistCondicionalTerceiros(p,item){ return pedidoEhRural(p) && /TERCEIROS/.test(pdNorm(item.documento)); }
function itemChecklistAplicavel(p,item){ return itemChecklistCondicionalTerceiros(p,item) ? terceirosNecessarios(p) : true; }
function checklistAplicaveis(p){ return (p.checklistDocumental||[]).filter(i=>itemChecklistAplicavel(p,i)); }
function checklistPendentes(p){ return checklistAplicaveis(p).filter(i=>i.status!=='entregue'); }
function checklistConcluidoOuDispensado(p){ return !!p.checklistConcluido || checklistAplicaveis(p).length===0; }
// Pendência documental: checklist concluído com documento(s) não entregue(s).
function checklistTemPendencia(p){ return !!p.checklistConcluido && checklistPendentes(p).length>0; }

function analiseDocumentalOk(p){
  if(!pedidoEhRural(p)) return true;
  if(!p.analiseDocumentalConcluida) return false;
  if(terceirosNecessarios(p) && !p.terceirosConferido) return false;
  return true;
}

// Status dinâmico — recalculado a cada gravação.
function computeStatusPedido(p){
  if(!p.acaoAnalista) return 'Analista Verificando';
  if(p.acaoAnalista==='Liberado sem Obra') return 'Encerrado – Liberado sem Obra';
  if(p.acaoAnalista==='Cancelado') return 'Encerrado – Cancelado';
  if(p.acaoAnalista==='Abertura de Obra (Loteamento)') return 'Encaminhado ODI – Loteamento';
  if(p.acaoAnalista==='Abertura de Obra (Iluminação Pública)') return 'Encaminhado ODI – Iluminação Pública';
  if(!p.dataEncaminhamentoProjetista) return 'Analista Verificando';
  const checklistOk=checklistConcluidoOuDispensado(p);
  const analiseOk=analiseDocumentalOk(p);
  const projetoEntregue=!!p.dataRetornoProjetista;
  if(p.dataEnquadramento) return 'Pedido atendido – Orçamento encaminhado';
  if(p.reprojetoPendente) return 'Aguardando Reprojeto';
  if(p.validacaoGerenteOk){
    if(!checklistOk) return 'Aguardando check-list documental e análise documental';
    if(!analiseOk) return 'Aguardando análise documental';
    return 'Aguardando Enquadramento';
  }
  if(projetoEntregue){
    if(!checklistOk) return 'Aguardando check-list documental e análise documental';
    if(!analiseOk) return 'Aguardando análise documental';
    return 'Aguardando Validação do projeto';
  }
  if(!checklistOk) return 'Aguardando Projeto e check-list documental';
  if(!analiseOk) return 'Aguardando Projeto sem análise documental';
  return 'Aguardando Projeto com análise documental';
}

// ── Medida 34 e prazo ────────────────────────────────
function periodosMedida34(p){ return [...(p.medida34Analista||[]),...(p.medida34Gerente||[])]; }
function medida34Ativa(p){ return periodosMedida34(p).some(x=>!x.fim); }
function diasPausadosPedido(p){
  let dias=0; const h=pdHojeStr();
  periodosMedida34(p).forEach(per=>{ const d=diff(per.inicio, per.fim||h); if(d>0) dias+=d; });
  return dias;
}
function prazoLimitePedido(p){
  const cfg=TIPOS_SOLICITACAO[p.tipoSolicitacao];
  if(!cfg||!p.dataAberturaPedido) return null;
  return pdAddDias(p.dataAberturaPedido, cfg.prazoDias + diasPausadosPedido(p));
}
// Situação do prazo: o contador PARA no enquadramento (ou no encerramento do pedido).
function prazoInfo(p){
  const cfg=TIPOS_SOLICITACAO[p.tipoSolicitacao];
  if(!cfg||!p.dataAberturaPedido) return {tipo:'sem'};
  const st=computeStatusPedido(p);
  if(statusEhEncerrado(st) || st.indexOf('Encaminhado ODI')===0) return {tipo:'encerrado'};
  const limite=prazoLimitePedido(p);
  const base=pdAddDias(p.dataAberturaPedido, cfg.prazoDias);
  if(p.dataEnquadramento){
    const dentro=p.dataEnquadramento<=limite;
    return {tipo:'enquadrado', limite, base, dentro, atraso:dentro?0:diff(limite,p.dataEnquadramento), enquadramento:p.dataEnquadramento, diasPausados:diasPausadosPedido(p), prazoBase:cfg.prazoDias};
  }
  const pausado=medida34Ativa(p);
  const dias=diff(pdHojeStr(), limite);
  return {tipo: pausado?'pausado':(dias<0?'vencido':'ativo'), limite, base, dias, pausado, diasPausados:diasPausadosPedido(p), prazoBase:cfg.prazoDias};
}

// ── Prazo do Analista (15 dias corridos da abertura; Medida 34 pausa) ──
function analistaDecidiu(p){ return !!p.acaoAnalista && (p.acaoAnalista!=='Enviado para Projeto' || !!p.dataEncaminhamentoProjetista); }
function dataDecisaoAnalista(p){ return p.acaoAnalista==='Enviado para Projeto' ? (p.dataEncaminhamentoProjetista||p.dataAcaoAnalista||null) : (p.dataAcaoAnalista||null); }
function diasPausadosAte(p,ate){
  let dias=0; const h=pdHojeStr();
  periodosMedida34(p).forEach(per=>{ let f=per.fim||h; if(ate && f>ate) f=ate; const d=diff(per.inicio,f); if(d>0) dias+=d; });
  return dias;
}
function prazoAnalistaInfo(p){
  if(!p.dataAberturaPedido) return {tipo:'sem'};
  const base=pedidosParams.prazoAnalistaDias||15;
  if(analistaDecidiu(p)){
    const d=dataDecisaoAnalista(p); if(!d) return {tipo:'decidido',base};
    const usados=Math.max(0,(diff(p.dataAberturaPedido,d)||0)-diasPausadosAte(p,d));
    return {tipo:'decidido', data:d, usados, dentro:usados<=base, base};
  }
  const paus=diasPausadosPedido(p);
  const limite=pdAddDias(p.dataAberturaPedido, base+paus);
  const dias=diff(pdHojeStr(),limite);
  return {tipo: medida34Ativa(p)?'pausado':(dias<0?'vencido':'ativo'), limite, dias, base, diasPausados:paus};
}

// ── Pré-análise do Estagiário · pagamento do projeto · distância ──────
function preAnaliseFeita(p){ return !!(p.preAnalise && p.preAnalise.concluidaEm); }
function preAnalisePendente(p){ return p.acaoAnalista==='Enviado para Projeto' && !!p.dataRetornoProjetista && !p.reprojetoPendente && !preAnaliseFeita(p); }
// Lista do que falta pagar/verificar: [{tipo:'projeto'}|{tipo:'reprojeto',n,verificar?}]
function pagamentosPendentes(p){
  const out=[];
  if(p.acaoAnalista!=='Enviado para Projeto' || !p.validacaoGerenteOk) return out;
  if(!(p.pagamentoProjeto && p.pagamentoProjeto.pagoEm)) out.push({tipo:'projeto'});
  (p.reprojetos||[]).forEach((r,i)=>{
    if(!r.pagar) out.push({tipo:'reprojeto',n:i+1,verificar:true});
    else if(r.pagar==='sim' && !r.pagoEm) out.push({tipo:'reprojeto',n:i+1});
  });
  return out;
}
const PD_BASE_LAGES=[-27.77826362507065,-50.305400999999996];
function pdHaversineKm(la1,lo1,la2,lo2){
  const R=6371,t=Math.PI/180,dLa=(la2-la1)*t,dLo=(lo2-lo1)*t;
  const h=Math.sin(dLa/2)**2+Math.cos(la1*t)*Math.cos(la2*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
// Distância estimada por estrada (ida), Lages → equipamento de referência. null se sem coordenada.
function pdDistEstimadaKm(p){
  const la=parseFloat(p.equipLat), lo=parseFloat(p.equipLon);
  if(isNaN(la)||isNaN(lo)) return null;
  return pdHaversineKm(PD_BASE_LAGES[0],PD_BASE_LAGES[1],la,lo)*(pedidosParams.fatorEstrada||1.3);
}
function pdNumKm(v){ const n=parseFloat(String(v==null?'':v).replace(',','.')); return isNaN(n)?null:n; }

// ── Reanálise / órgãos / campo ───────────────────────
function reanaliseAberta(p){ return (p.reanalises||[]).find(r=>!r.concluidaEm)||null; }
function reanalisePrazo(r){ return r? pdAddDias(r.abertaEm, r.prazoDias!=null?r.prazoDias:pedidosParams.prazoReanaliseDias):null; }
function orgaosPendentes(p){
  const ol=p.orgaosLiberacao||{};
  return Object.keys(ol).filter(o=>!ol[o].liberadoEm);
}
function campoPendente(p){ return !!(p.verificacaoCampo && p.verificacaoCampo.necessaria && !p.verificacaoCampo.realizadaEm); }
function podeAbrirReanalise(p){
  return p.acaoAnalista==='Enviado para Projeto' && (!!p.checklistConcluido || !!p.analiseDocumentalConcluida);
}

// ── Quem precisa agir agora ──────────────────────────
function acoesPendentes(p){
  const out=[];
  const add=(resps,texto,extra)=>out.push(Object.assign({resps,texto},extra||{}));
  const acao=p.acaoAnalista;
  const pa=prazoAnalistaInfo(p);
  const paTxt=pa.tipo==='vencido'?' — prazo do analista VENCIDO há '+Math.abs(pa.dias)+' d (era até '+fmtTxt(pa.limite)+')'
    :pa.tipo==='ativo'?' — até '+fmtTxt(pa.limite)+' (faltam '+pa.dias+' d dos '+pa.base+')'
    :pa.tipo==='pausado'?' — prazo do analista pausado (Medida 34)':'';
  if(!acao){ add(['Analista'],'Definir a ação do pedido (enviar a projeto, liberar sem obra, cancelar ou abrir obra)'+paTxt,{atraso:pa.tipo==='vencido'}); return out; }
  if(acao==='Liberado sem Obra'||acao==='Cancelado') return out;
  if(acao==='Abertura de Obra (Loteamento)'||acao==='Abertura de Obra (Iluminação Pública)'){
    add(['Adm_ODI'],'Tratar como obra ODI ('+(acao.indexOf('Loteamento')>=0?'Loteamento':'Iluminação Pública')+')'); return out;
  }
  if(!p.dataEncaminhamentoProjetista){ add(['Analista'],'Definir o projetista e encaminhar o pedido para projeto'+paTxt,{atraso:pa.tipo==='vencido'}); return out; }
  const rural=pedidoEhRural(p);
  const g=gerenteDoMunicipio(p.municipio);
  const checklistOk=checklistConcluidoOuDispensado(p);
  if(!p.dataEnquadramento){
    if(p.reprojetoPendente){
      add(['Projetista'],'Refazer o projeto'+(p.projetista?' — '+p.projetista:''),{projetista:true});
    } else if(!p.dataRetornoProjetista){
      const lim=pedidosParams.prazoProjetistaDias;
      const dias=diff(p.dataEncaminhamentoProjetista, pdHojeStr());
      add(['Projetista'],'Entregar o projeto'+(p.projetista?' — '+p.projetista:'')+' ('+dias+' d de '+lim+' d de referência)',{projetista:true, atraso:dias>lim});
    }
    if(!checklistOk) add(['Estagiário','Analista'],'Conferir o checklist documental');
    if(rural && !p.analiseDocumentalConcluida) add(['Adm_ODI','Estagiário'],'Análise documental detalhada (matrícula, passagem, ambiental, desenho)');
    if(terceirosNecessarios(p) && !p.terceirosConferido) add(['Adm_ODI','Estagiário'],'Conferir a autorização de passagem de terceiros');
    if(p.dataRetornoProjetista && !p.validacaoGerenteOk && !p.reprojetoPendente) add(['Gerente'],'Análise do projeto entregue'+(preAnaliseFeita(p)?'':' (pré-análise do Estagiário ainda não feita — não bloqueia)'),{gerente:g});
    if(p.validacaoGerenteOk && checklistOk && analiseDocumentalOk(p)) add(['Gerente'],'Realizar o enquadramento'+(rural&&p.classificacaoPonto?' ('+p.classificacaoPonto+')':''),{gerente:g});
  }
  orgaosPendentes(p).forEach(o=>{
    const e=p.orgaosLiberacao[o];
    add(['Gerente'], e.cienteEm?('Aguardar a liberação do '+o):('Dar ciência e encaminhar ao '+o), {gerente:g, orgao:o});
  });
  if(campoPendente(p)) add(['Gerente'],'Providenciar a verificação em campo',{gerente:g, campo:true});
  if(preAnalisePendente(p)) add(['Estagiário'],'Pré-análise do projeto (materiais orçados e km de rede projetada/retirada)',{preAnalise:true});
  pagamentosPendentes(p).forEach(x=>{
    if(x.tipo==='projeto') add(['Analista'],'Pagar o projeto'+(p.projetista?' — '+p.projetista:'')+(preAnaliseFeita(p)?'':' (falta a pré-análise com os km de rede)'),{pagamento:true});
    else if(x.verificar) add(['Analista'],'Verificar se o reprojeto #'+x.n+' gera novo pagamento',{pagamento:true});
    else add(['Analista'],'Pagar o reprojeto #'+x.n+(p.projetista?' — '+p.projetista:''),{pagamento:true});
  });
  const r=reanaliseAberta(p);
  if(r) add(rural?['Adm_ODI','Estagiário']:['Estagiário'],'Reanálise documental #'+r.n+' — até '+fmtTxt(reanalisePrazo(r)),{reanalise:true});
  return out;
}
function acaoRespLabel(a){ return a.resps.map(r=>r==='Gerente'&&a.gerente?'Gerente ('+a.gerente+')':r).join(' / '); }

// ── Feedback automático da análise documental (Ligação nova Rural) ────
function arTercVazio(){ return {nome:'',matriculaPreenchida:'',matricula:'',localidade:'',nomeVisivel:''}; }
function arTercPreenchidas(t){ return ((t&&t.autorizacoes)||[]).filter(x=>x && Object.values(x).some(v=>String(v==null?'':v).trim())); }
function arVazio(){
  return {
    matricula:{donos:[''],dataAtualizacao:'',georreferenciada:'',docGeo:'',artAssinada:'',artPaga:'',areaHa:'',ccir:'',ccirNumero:'',numero:'',localidade:'',confrontantes:['']},
    solicitante:{possui:'',matriculaPreenchida:'',localidadePreenchida:'',nomeLegivel:'',assinantes:['']},
    terceiros:{autorizacoes:[arTercVazio()]},
    ambiental:{alvaraCita:'',alvaraMatricula:'',alvaraLocalidade:'',appCita:'',appMatricula:'',appLocalidade:''},
    desenho:{primeiroPonto:'',justificativa:'',outroTexto:'',complemento:''},
  };
}
function arMesclar(salvo){
  const base=arVazio(); const s=salvo||{};
  Object.keys(base).forEach(sec=>{
    base[sec]=Object.assign(base[sec], s[sec]||{});
    Object.keys(base[sec]).forEach(k=>{
      if(Array.isArray(base[sec][k]) && base[sec][k].length===0) base[sec][k]=[''];
    });
  });
  // Terceiros: várias autorizações (migra o formato antigo, que tinha uma lista de nomes e respostas únicas)
  const t=s.terceiros||{};
  let auts=Array.isArray(t.autorizacoes)?t.autorizacoes.filter(x=>x&&typeof x==='object').map(x=>Object.assign(arTercVazio(),x)):[];
  if(!auts.length && Array.isArray(t.nomes)){
    auts=t.nomes.filter(n=>String(n||'').trim()).map(n=>Object.assign(arTercVazio(),{nome:n,matriculaPreenchida:t.matriculaPreenchida||'',matricula:t.matricula||'',localidade:t.localidade||'',nomeVisivel:t.nomeVisivel||''}));
  }
  if(!auts.length) auts=[arTercVazio()];
  base.terceiros={autorizacoes:auts};
  return base;
}
function arLimpar(d){
  const c=pdClone(d);
  [['matricula','donos'],['matricula','confrontantes'],['solicitante','assinantes']].forEach(([a,b])=>{
    c[a][b]=(c[a][b]||[]).map(x=>String(x).trim()).filter(Boolean);
  });
  c.terceiros={autorizacoes:arTercPreenchidas(c.terceiros)};
  return c;
}
function arJustificativaTexto(d){
  const x=d.desenho||{};
  if(x.justificativa==='__OUTRO__') return (x.outroTexto||'').trim();
  return (x.justificativa||'').trim();
}
// Retorna [{n:'erro'|'aviso'|'ok', t:texto}]
function arGerarFeedback(p,a){
  const out=[]; const E=t=>out.push({n:'erro',t}), W=t=>out.push({n:'aviso',t});
  const L=l=>(l||[]).map(x=>String(x).trim()).filter(Boolean);
  const m=a.matricula, s=a.solicitante, t=a.terceiros, am=a.ambiental, d=a.desenho;
  const donos=L(m.donos), confr=L(m.confrontantes), assin=L(s.assinantes);

  // Matrícula
  if(!pdNumMat(m.numero)) W('Nº da matrícula não informado.');
  if(!donos.length) W('Proprietário(s) da matrícula não informado(s).');
  if(!String(m.localidade||'').trim()) W('Localidade da matrícula não informada.');
  if(!m.dataAtualizacao) W('Data da última atualização (emissão) da matrícula não informada.');
  else {
    const idade=diff(m.dataAtualizacao,pdHojeStr());
    if(idade!=null && idade>(pedidosParams.matriculaValidadeDias||365)) W('Matrícula atualizada pela última vez em '+fmtTxt(m.dataAtualizacao)+' (há mais de 1 ano) — avaliar a necessidade de documento atualizado.');
  }
  if(m.georreferenciada==='') W('Não informado se a matrícula é georreferenciada.');
  if(m.georreferenciada==='nao'){
    if(m.docGeo==='') W('Matrícula não georreferenciada: não conferido se há documento de georreferenciamento e ART anexos.');
    else if(m.docGeo==='nao') E('Matrícula não georreferenciada e sem documento de georreferenciamento/ART anexo.');
    else {
      if(m.artAssinada==='nao') E('ART não está assinada pelo responsável técnico e pelo cliente.'); else if(m.artAssinada==='') W('Não conferido se a ART está assinada pelo responsável e pelo cliente.');
      if(m.artPaga==='nao') E('ART não está paga.'); else if(m.artPaga==='') W('Não conferido se a ART está paga.');
    }
  }
  const areaTxt=String(m.areaHa==null?'':m.areaHa).replace(',','.').trim();
  const area=parseFloat(areaTxt);
  if(areaTxt==='') W('Área da matrícula não informada.');
  else if(!isNaN(area) && area<2) W('Área de '+areaTxt+' ha (menor que 2 ha): necessário cadastro junto ao INCRA.');
  if(m.ccir==='sim' && !String(m.ccirNumero||'').trim()) W('Matrícula possui CCIR, mas o número não foi informado.');
  if(m.ccir==='nao') W('Matrícula sem CCIR apresentado (verificar se é exigido).');
  if(!confr.length) W('Confrontantes da matrícula não informados.');

  // Autorização de passagem do solicitante
  if(s.possui==='nao') E('Autorização de passagem do solicitante não apresentada.');
  else if(s.possui==='') W('Autorização de passagem do solicitante ainda não conferida.');
  else {
    if(s.matriculaPreenchida==='nao') E('Autorização do solicitante sem o nº da matrícula preenchido.');
    if(s.localidadePreenchida==='nao') E('Autorização do solicitante sem a localidade preenchida.');
    if(s.nomeLegivel==='nao') E('Autorização do solicitante com nome ilegível ou sem assinatura.');
    if(s.matriculaPreenchida===''||s.localidadePreenchida===''||s.nomeLegivel==='') W('Autorização do solicitante: itens ainda não conferidos (matrícula, localidade ou assinatura).');
    if(donos.length>1){
      if(!assin.length) W('Matrícula com '+donos.length+' proprietários: informe quem assinou a autorização do solicitante para conferir se todos autorizaram.');
      else {
        const faltam=donos.filter(dn=>!assin.some(x=>pdMatchNome(x,dn)));
        if(faltam.length) E('Autorização de passagem apresentada somente de '+(donos.length-faltam.length)+' de '+donos.length+' proprietários (faltam: '+faltam.join(', ')+') — conferir grafia dos nomes.');
      }
    }
  }

  // Autorização de terceiros (só quando o Gerente define que é necessária) — podem ser várias
  if(terceirosNecessarios(p)){
    const auts=arTercPreenchidas(t);
    if(!auts.length) W('Autorização de passagem de terceiros: nenhuma autorização registrada ainda.');
    const locMat=String(m.localidade||'').trim();
    auts.forEach((x,ix)=>{
      const nome=String(x.nome||'').trim();
      const rot='Autorização de terceiros '+(ix+1)+(nome?' ('+nome+')':'');
      if(!nome) W(rot+': nome de quem autorizou não informado.');
      else if(confr.length && !confr.some(c=>pdMatchNome(c,nome))) W(rot+': o nome não corresponde a nenhum dos confrontantes da matrícula — levar em consideração (conferir grafia ou se o imóvel é de outro confrontante).');
      if(x.nomeVisivel==='nao') E(rot+': nome não está legível.');
      if(x.matriculaPreenchida==='nao') E(rot+': sem nº de matrícula.');
      else if(x.matriculaPreenchida==='sim'){
        if(!pdNumMat(x.matricula)) W(rot+': informado que tem matrícula, mas o nº não foi registrado.');
        else if(pdNumMat(m.numero) && pdNumMat(x.matricula)===pdNumMat(m.numero)) W(rot+': mesma matrícula do solicitante ('+m.numero+') — deveria ser a matrícula do terceiro.');
      }
      const loc=String(x.localidade||'').trim();
      if(loc && locMat && pdNorm(loc)!==pdNorm(locMat) && !pdNorm(loc).includes(pdNorm(locMat)) && !pdNorm(locMat).includes(pdNorm(loc))) W(rot+': localidade ('+loc+') diferente da localidade da matrícula do solicitante ('+locMat+').');
      if(x.nomeVisivel===''||x.matriculaPreenchida==='') W(rot+': itens ainda não conferidos (legibilidade do nome ou matrícula).');
    });
    if(auts.length && confr.length){
      const sem=confr.filter(c=>!auts.some(x=>pdMatchNome(x.nome,c)));
      if(sem.length) W('Confrontantes da matrícula sem autorização de terceiros correspondente: '+sem.join(', ')+' (verificar se a rede passa por eles).');
    }
    if(!confr.length && auts.length) W('Não foi possível comparar as autorizações de terceiros com os confrontantes: confrontantes da matrícula não informados.');
  }

  // Ambiental / construtivo
  const confere=(rotulo,cita,mat,loc)=>{
    if(cita==='') { W(rotulo+': ainda não conferido.'); return; }
    if(cita==='sim'){
      if(!pdNumMat(mat)) W(rotulo+' cita matrícula, mas o nº não foi informado.');
      else if(pdNumMat(m.numero) && pdNumMat(mat)!==pdNumMat(m.numero)) E('Matrícula citada em '+rotulo+' ('+mat+') difere da matrícula apresentada ('+m.numero+').');
    } else {
      if(!String(loc||'').trim()) W(rotulo+' não cita matrícula e a localidade não foi informada.');
      else if(String(m.localidade||'').trim() && pdNorm(loc)!==pdNorm(m.localidade) && !pdNorm(loc).includes(pdNorm(m.localidade)) && !pdNorm(m.localidade).includes(pdNorm(loc))) W('Localidade citada em '+rotulo+' ('+loc+') difere da localidade da matrícula ('+m.localidade+').');
    }
  };
  confere('Alvará de construção', am.alvaraCita, am.alvaraMatricula, am.alvaraLocalidade);
  confere('Declaração de Não APP', am.appCita, am.appMatricula, am.appLocalidade);

  // Desenho da matrícula
  if(d.primeiroPonto==='') W('Desenho da matrícula: ainda não definido se é possível constatar o 1º ponto de energia.');
  else if(d.primeiroPonto==='nao' && !arJustificativaTexto(a)) E('2º ponto definido sem justificativa.');

  // Checklist
  checklistPendentes(p).forEach(i=>E('Documento não entregue: '+i.documento+'.'));

  // Órgãos competentes (definidos pelo Gerente na análise de projeto)
  const ol=p.orgaosLiberacao||{};
  Object.keys(ol).forEach(o=>{
    if(!ol[o].liberadoEm) E('A execução depende de liberação do órgão competente '+o+' — ainda não liberado'+(ol[o].cienteEm?' (encaminhado em '+fmtTxt(ol[o].cienteEm)+')':'')+'.');
  });
  if(campoPendente(p)) W('Verificação em campo solicitada pelo Gerente — ainda não realizada.');

  if(!out.length) out.push({n:'ok',t:'Nenhuma inconsistência identificada nas informações preenchidas.'});
  return out;
}
function arFeedbackTexto(p,itens){
  const linhas=itens.filter(i=>i.n!=='ok').map(i=>'• '+i.t);
  return 'Análise documental — Nota '+(p.nota||'')+' (Ligação nova Rural)\n'+(linhas.length?linhas.join('\n'):'Sem pendências ou inconsistências identificadas.');
}
// ── PURE-LOGIC-END ───────────────────────────────────


// ── Configuração (checklist por tipo + parâmetros) ───
let _pdConfigPromise=null;
function loadPedidosConfig(){
  if(_pdConfigPromise) return _pdConfigPromise;
  _pdConfigPromise=(async()=>{
    try{ const s=await getDoc(doc(db,'config','checklistTemplates')); if(s.exists()) checklistTemplates={...CHECKLIST_PADRAO,...s.data()}; }
    catch(e){ console.warn('Checklist templates: usando valores padrão.',e); }
    try{ const s=await getDoc(doc(db,'config','pedidosParametros')); if(s.exists()) pedidosParams={...PEDIDOS_PARAMS_PADRAO,...s.data()}; }
    catch(e){ console.warn('Parâmetros de pedidos: usando valores padrão.',e); }
  })();
  return _pdConfigPromise;
}
function getChecklistTemplate(tipo){ return checklistTemplates[tipo]||[]; }
function buildChecklistFromTemplate(tipo, flagOrgaoPublico){
  const docs=[...getChecklistTemplate(tipo)];
  if(flagOrgaoPublico && !docs.includes('Ofício')) docs.push('Ofício');
  return docs.map(d=>({documento:d, status:'pendente', dataEntrega:null, conferidoPor:null}));
}

// ── Permissões ───────────────────────────────────────
function podeGerenciarPedidos(){ return !!me && ['analista','gerente'].includes(me.perfil); }
function podeEditarChecklist(){ return !!me && ['estagiario','analista','gerente'].includes(me.perfil); }
function arPodeEditar(){ return !!me && ['adm_odi','estagiario','gerente'].includes(me.perfil); }
function pdEhGerente(){ return !!me && me.perfil==='gerente'; }
function meuGerenteNome(){
  if(!me || me.perfil!=='gerente') return null;
  const partes=pdNorm(me.nome).split(' ');
  for(const g of Object.keys(GERENTES_MUNICIPIOS)) if(partes.includes(pdNorm(g))) return g;
  return null;
}
function _pdAtual(){ const el=document.getElementById('pedidoId'); const id=el?el.value:''; return pedidos.find(x=>x.id===id)||null; }

// ── Gravação central: recalcula status, grava linha do tempo, espelha localmente ──
async function pdSave(id, changes, evento, detalhe){
  const atual=pedidos.find(x=>x.id===id)||{};
  const upd={...changes};
  upd.status=computeStatusPedido({...atual,...changes});
  upd.atualizadaEm=serverTimestamp();
  let entry=null;
  if(evento){
    entry={ts:new Date().toISOString(), usuario:me.nome||'', perfil:me.perfil||'', evento, detalhe:detalhe||''};
    upd.timeline=arrayUnion(entry);
  }
  await updateDoc(doc(db,'pedidos',id), upd);
  const loc=pedidos.find(x=>x.id===id);
  if(loc){ Object.assign(loc, changes, {status:upd.status}); if(entry) loc.timeline=[...(loc.timeline||[]), entry]; }
  return loc||{...atual,...changes,status:upd.status};
}

function loadPedidosListener(){
  if(unsubPedidos) return;
  const q=query(collection(db,'pedidos'), orderBy('dataAberturaPedido','desc'));
  unsubPedidos=onSnapshot(q,snap=>{
    pedidos=snap.docs.map(d=>({id:d.id,...d.data()}));
    const active=document.querySelector('.page.active');
    if(active?.id==='pgPedidos') pdRenderLista();
    const ov=document.getElementById('ovPedido');
    if(ov && ov.classList.contains('open')){ const p=_pdAtual(); if(p) pdRefreshLeve(p); }
  });
}

// ══════════════════════════════════════════════════════
//  LISTAGEM — quem age agora · prazo · filtros
// ══════════════════════════════════════════════════════
let _pdF={busca:'',status:'',tipo:'',municipio:'',gerente:'',projetista:'',prazo:'',vista:'ativos'};

function pdCorPrazo(i){
  if(i.tipo==='vencido') return '#EF4444';
  if(i.tipo==='pausado') return '#F59E0B';
  if(i.tipo==='ativo') return i.dias<=5?'#F97316':(i.dias<=10?'#F59E0B':'#22C55E');
  if(i.tipo==='enquadrado') return i.dentro?'#22C55E':'#EF4444';
  return 'var(--muted)';
}
function pdPrazoTexto(i){
  if(i.tipo==='enquadrado') return (i.dentro?'✅ Enquadrado no prazo':'⚠️ Enquadrado '+i.atraso+' d fora do prazo')+' · '+fmtTxt(i.enquadramento);
  if(i.tipo==='pausado') return '⏸️ Prazo pausado (Medida 34)';
  if(i.tipo==='vencido') return '🔴 Vencido há '+Math.abs(i.dias)+(Math.abs(i.dias)===1?' dia':' dias');
  if(i.dias===0) return '🟠 Vence hoje';
  return 'Faltam '+i.dias+(i.dias===1?' dia':' dias');
}
function pdPrazoHtml(i){
  if(i.tipo==='sem') return '<span style="color:var(--muted)">—</span>';
  if(i.tipo==='encerrado') return '<span style="color:var(--muted)">Pedido encerrado</span>';
  return `<div style="font-weight:700">${fmtTxt(i.limite)}</div><div style="font-size:10px;font-weight:700;color:${pdCorPrazo(i)}">${pdPrazoTexto(i)}</div>`;
}
function pdAcoesHtml(acoes){
  if(!acoes.length) return '<span style="color:var(--muted)">—</span>';
  return acoes.slice(0,3).map(a=>`<div style="margin-bottom:3px;line-height:1.3">
      <span style="font-weight:800;color:${a.atraso?'#EF4444':'var(--accent)'};font-size:11px">${pdEsc(acaoRespLabel(a))}</span>
      <span style="font-size:11px">${pdEsc(a.texto)}</span></div>`).join('')
    + (acoes.length>3?`<div style="font-size:10px;color:var(--muted)">+${acoes.length-3} ação(ões)</div>`:'');
}
function pdAlertasHtml(p){
  const a=[];
  if(medida34Ativa(p)) a.push('<span style="color:#F59E0B;font-weight:700">⏸️ Medida 34</span>');
  if(checklistTemPendencia(p)) a.push('<span style="color:#EF4444;font-weight:700">⚠️ Pendência Documental</span>');
  if(reanaliseAberta(p)) a.push('<span style="color:#3B82F6;font-weight:700">🔄 Reanálise</span>');
  if(orgaosPendentes(p).length) a.push('<span style="color:#8B5CF6;font-weight:700">🏛️ Órgão: '+orgaosPendentes(p).join(', ')+'</span>');
  if(campoPendente(p)) a.push('<span style="color:#06B6D4;font-weight:700">📍 Verif. em campo</span>');
  if(p.reprojetoPendente) a.push('<span style="color:#F97316;font-weight:700">♻️ Reprojeto</span>');
  if(prazoAnalistaInfo(p).tipo==='vencido') a.push('<span style="color:#EF4444;font-weight:700">⏰ Analista fora do prazo</span>');
  if(p.acaoAnalista==='Enviado para Projeto' && !p.dataEnquadramento && p.equipamentoRef && pdObrasMesmaChave(p.equipamentoRef).length) a.push('<span style="color:#F59E0B;font-weight:700">🔗 Obra em andamento na mesma chave</span>');
  return a.length?'<div style="font-size:10px;margin-top:3px;display:flex;flex-wrap:wrap;gap:6px">'+a.join('')+'</div>':'';
}

function pdMinhaFila(acoes){
  const meu=pdPerfilLabel(me.perfil); const g=meuGerenteNome();
  return acoes.some(a=>a.resps.includes(meu) && (me.perfil!=='gerente'||!g||!a.gerente||a.gerente===g));
}
function pdPassaVista(it,v){
  const p=it.p;
  if(v==='todos') return true;
  if(v==='ativos') return it.acoes.length>0;
  if(v==='minha') return pdMinhaFila(it.acoes);
  if(v.indexOf('resp:')===0) return it.acoes.some(a=>a.resps.includes(v.slice(5)));
  if(v==='vencidos') return it.prazo.tipo==='vencido';
  if(v==='vence7') return it.prazo.tipo==='ativo' && it.prazo.dias<=7;
  if(v==='reanalise') return !!reanaliseAberta(p);
  if(v==='orgaos') return orgaosPendentes(p).length>0;
  if(v==='campo') return campoPendente(p);
  if(v==='m34') return medida34Ativa(p);
  if(v==='pendDoc') return checklistTemPendencia(p);
  if(v==='analista15') return prazoAnalistaInfo(p).tipo==='vencido';
  if(v==='preAnalise') return preAnalisePendente(p);
  if(v==='pagar') return pagamentosPendentes(p).length>0;
  if(v==='filaDoc') return pedidoEhRural(p) && p.acaoAnalista==='Enviado para Projeto' && !!p.dataEncaminhamentoProjetista && !p.analiseDocumentalConcluida;
  return true;
}
function pdPassaFiltros(it){
  const p=it.p, f=_pdF;
  if(f.status && it.status!==f.status) return false;
  if(f.tipo && p.tipoSolicitacao!==f.tipo) return false;
  if(f.municipio && p.municipio!==f.municipio) return false;
  if(f.gerente && gerenteDoMunicipio(p.municipio)!==f.gerente) return false;
  if(f.projetista && (p.projetista||'')!==f.projetista) return false;
  if(f.busca){
    const q=pdNorm(f.busca);
    const alvo=pdNorm([p.nota,p.municipio,p.tipoSolicitacao,p.projetista,p.equipamentoRef,p.analiseRural?.matricula?.numero,(p.analiseRural?.matricula?.donos||[]).join(' ')].join(' '));
    if(!alvo.includes(q)) return false;
  }
  if(f.prazo){
    const i=it.prazo;
    if(f.prazo==='vencido' && i.tipo!=='vencido') return false;
    if(f.prazo==='5' && !(i.tipo==='ativo' && i.dias<=5)) return false;
    if(f.prazo==='10' && !(i.tipo==='ativo' && i.dias<=10)) return false;
    if(f.prazo==='30' && !(i.tipo==='ativo' && i.dias<=30)) return false;
    if(f.prazo==='pausado' && i.tipo!=='pausado') return false;
    if(f.prazo==='fora' && !(i.tipo==='enquadrado' && !i.dentro)) return false;
    if(f.prazo==='dentro' && !(i.tipo==='enquadrado' && i.dentro)) return false;
  }
  return true;
}
function pdOrdena(items){
  const v=_pdF.vista;
  if(v==='reanalise') return items.sort((a,b)=>(reanaliseAberta(a.p).abertaEm||'').localeCompare(reanaliseAberta(b.p).abertaEm||''));
  if(v==='filaDoc') return items.sort((a,b)=>(a.p.dataAberturaPedido||'').localeCompare(b.p.dataAberturaPedido||''));
  const grupo=it=>(it.prazo.tipo==='ativo'||it.prazo.tipo==='vencido')?0:(it.prazo.tipo==='pausado'?1:2);
  return items.sort((a,b)=>{
    const ga=grupo(a), gb=grupo(b); if(ga!==gb) return ga-gb;
    if(ga===0||ga===1) return (a.prazo.limite||'').localeCompare(b.prazo.limite||'');
    return (b.p.dataAberturaPedido||'').localeCompare(a.p.dataAberturaPedido||'');
  });
}

window.pdSetVista=function(v){ _pdF.vista=v; if(_pdAba!=='todos') _pdAba='todos'; pdRenderLista(); };
window.pdSetFiltro=function(k,v){ _pdF[k]=v; pdRenderLista(); };
window.pdLimparFiltros=function(){
  _pdF={busca:'',status:'',tipo:'',municipio:'',gerente:'',projetista:'',prazo:'',vista:_pdAba==='fila'?'minha':'ativos'};
  const cont=document.getElementById('pgPedidosContent'); if(cont) cont.dataset.uid=''; renderPedidos();
};

function pdMontaEsqueleto(cont){
  const podeCriar=podeGerenciarPedidos(), gerente=pdEhGerente();
  const opt=(arr,lbl)=>`<option value="">${lbl}</option>`+arr.map(x=>`<option value="${pdEsc(x)}">${pdEsc(x)}</option>`).join('');
  const sel=(id,key,arr,lbl)=>`<select id="${id}" onchange="pdSetFiltro('${key}',this.value)" style="font-size:11px;padding:5px 8px;max-width:170px">${opt(arr,lbl)}</select>`;
  cont.innerHTML=`
    <div class="tbl-head">
      <div class="page-title">Gerenciamento de Pedidos</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${gerente?'<button class="btn btn-secondary btn-sm" onclick="pdAbrirParams()">⚙️ Parâmetros</button>':''}
        ${gerente?'<button class="btn btn-secondary btn-sm" onclick="openChecklistConfigModal()">⚙️ Configurar Checklist</button>':''}
        ${podeCriar?'<button class="btn btn-primary btn-sm" onclick="openPedidoModal()">+ Novo Pedido</button>':''}
      </div>
    </div>
    <div id="pdAbas" style="display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-top:8px"></div>
    <div id="pdAbaPagar" style="display:none"></div>
    <div id="pdAbaDash" style="display:none"></div>
    <div id="pdAbaLista">
    <div id="pdCards" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0"></div>
    <div id="pdFiltros" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0">
      <input type="text" id="pdFBusca" placeholder="🔍 Nota, município, projetista, matrícula, proprietário…" oninput="pdSetFiltro('busca',this.value)" style="font-size:11px;padding:5px 10px;min-width:260px">
      ${sel('pdFStatus','status',PEDIDO_STATUS_LISTA,'Todos os status')}
      ${sel('pdFTipo','tipo',Object.keys(TIPOS_SOLICITACAO),'Todas as solicitações')}
      ${sel('pdFMun','municipio',MUNICIPIOS_ARLAG,'Todos os municípios')}
      ${sel('pdFGer','gerente',Object.keys(GERENTES_MUNICIPIOS),'Todos os gerentes')}
      ${sel('pdFProj','projetista',PROJETISTAS_PEDIDO,'Todos os projetistas')}
      <select id="pdFPrazo" onchange="pdSetFiltro('prazo',this.value)" style="font-size:11px;padding:5px 8px">
        <option value="">Qualquer prazo</option><option value="vencido">🔴 Vencidos</option><option value="5">≤ 5 dias</option>
        <option value="10">≤ 10 dias</option><option value="30">≤ 30 dias</option><option value="pausado">⏸️ Pausados (Medida 34)</option>
        <option value="dentro">✅ Enquadrados no prazo</option><option value="fora">⚠️ Enquadrados fora do prazo</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="pdLimparFiltros()">Limpar</button>
      <span id="pdContagem" style="font-size:11px;color:var(--muted)"></span>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px;text-align:left">Nota / Solicitação</th>
          <th style="padding:8px;text-align:left">Município / Gerente</th>
          <th style="padding:8px;text-align:left">Etapa atual</th>
          <th style="padding:8px;text-align:left">Quem precisa agir agora</th>
          <th style="padding:8px;text-align:left">Data limite (orçamento)</th>
        </tr></thead>
        <tbody id="pdListaBody"></tbody>
      </table>
    </div>
    </div>`;
  cont.dataset.uid=String(me.uid||me.email||'x');
}

function renderPedidos(){
  loadPedidosListener();
  loadPedidosConfig().then(()=>{ if(document.querySelector('.page.active')?.id==='pgPedidos') pdRenderLista(); });
  const cont=document.getElementById('pgPedidosContent'); if(!cont) return;
  if(cont.dataset.uid!==String(me.uid||me.email||'x')) pdMontaEsqueleto(cont);
  pdRenderLista();
}
window.renderPedidos=renderPedidos;

function pdRenderLista(){
  const body=document.getElementById('pdListaBody'); if(!body) return;
  const todos=pedidos.map(p=>({p, status:computeStatusPedido(p), acoes:acoesPendentes(p), prazo:prazoInfo(p)}));
  if(_pdAba==='fila') _pdF.vista='minha';
  pdRenderAbas(todos);
  if(_pdAba==='pagar'){ pdRenderPagar(); return; }
  if(_pdAba==='dash'){ pdRenderDash(); return; }
  // cartões (contadores clicáveis)
  const cnt=v=>todos.filter(it=>pdPassaVista(it,v)).length;
  const card=(v,t,cor)=>{ const n=cnt(v), at=_pdF.vista===v;
    return `<div onclick="pdSetVista('${v}')" style="cursor:pointer;padding:8px 12px;border-radius:10px;min-width:92px;text-align:center;border:1px solid ${at?cor:'var(--border)'};background:${at?cor+'22':'var(--surface)'}">
      <div style="font-size:18px;font-weight:800;color:${cor}">${n}</div><div style="font-size:10px;color:var(--muted)">${t}</div></div>`; };
  const cards=document.getElementById('pdCards');
  if(cards) cards.innerHTML=
    card('ativos','Em andamento','#22C55E')+card('minha','Minha fila','#7c6af7')+
    card('resp:Analista','Analista','#06B6D4')+card('resp:Estagiário','Estagiário','#06B6D4')+card('resp:Adm_ODI','Adm_ODI','#06B6D4')+
    card('resp:Gerente','Gerente','#06B6D4')+card('resp:Projetista','Projetista','#06B6D4')+
    card('vencidos','Vencidos','#EF4444')+card('vence7','Vencem ≤ 7 d','#F97316')+
    card('filaDoc','Fila análise doc.','#3B82F6')+card('reanalise','Fila reanálise','#3B82F6')+
    card('orgaos','Órgãos compet.','#8B5CF6')+card('campo','Verif. campo','#06B6D4')+
    card('analista15','Analista > '+(pedidosParams.prazoAnalistaDias||15)+' d','#EF4444')+card('preAnalise','Pré-análise','#3B82F6')+card('pagar','Projeto a pagar','#F59E0B')+
    card('m34','Medida 34','#F59E0B')+card('pendDoc','Pend. documental','#EF4444')+card('todos','Todos','#888');
  let lista=todos.filter(it=>pdPassaVista(it,_pdF.vista)&&pdPassaFiltros(it));
  lista=pdOrdena(lista);
  const ct=document.getElementById('pdContagem'); if(ct) ct.textContent=lista.length+' pedido(s)';
  body.innerHTML=lista.map(it=>{
    const p=it.p, g=gerenteDoMunicipio(p.municipio), cor=pdCorPrazo(it.prazo);
    return `<tr style="cursor:pointer;border-bottom:1px solid var(--border);border-left:4px solid ${cor}" onclick="openPedidoModal('${p.id}')">
      <td style="padding:8px"><div style="font-weight:700">${pdEsc(p.nota||'—')}</div><div style="font-size:10px;color:var(--muted)">${pdEsc(p.tipoPedido||'')} · ${pdEsc(p.tipoSolicitacao||'—')}</div></td>
      <td style="padding:8px">${pdEsc(p.municipio||'—')}${p.flagOrgaoPublico?' 🏛️':''}<div style="font-size:10px;color:var(--muted)">${g?'Gerente: '+pdEsc(g):''}</div></td>
      <td style="padding:8px"><div style="font-weight:600">${pdEsc(it.status)}</div>${pdAlertasHtml(p)}</td>
      <td style="padding:8px">${pdAcoesHtml(it.acoes)}</td>
      <td style="padding:8px">${pdPrazoHtml(it.prazo)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Nenhum pedido neste filtro.</td></tr>';
}

// ══════════════════════════════════════════════════════
//  BANNER "SITUAÇÃO" (topo do pedido): etapa · quem age · prazo
// ══════════════════════════════════════════════════════
function pdRenderSituacao(p){
  const el=document.getElementById('pdSituacao'); if(!el) return;
  if(!p){ el.style.display='none'; el.innerHTML=''; return; }
  const st=computeStatusPedido(p), acoes=acoesPendentes(p), i=prazoInfo(p), g=gerenteDoMunicipio(p.municipio);
  const cor=pdCorPrazo(i);
  let prazoTxt='';
  if(i.tipo==='encerrado') prazoTxt='<span style="color:var(--muted)">Pedido encerrado — sem prazo em curso.</span>';
  else if(i.tipo==='sem') prazoTxt='<span style="color:var(--muted)">Prazo não calculado.</span>';
  else {
    const det=`Abertura ${fmtTxt(p.dataAberturaPedido)} + ${i.prazoBase} dias${i.diasPausados?` + ${i.diasPausados} d pausados (Medida 34)`:''}`;
    prazoTxt=`<b style="font-size:14px">Data limite: ${fmtTxt(i.limite)}</b> <span style="color:${cor};font-weight:700">· ${pdPrazoTexto(i)}</span><div style="font-size:10px;color:var(--muted)">${det}${i.tipo==='enquadrado'?' · contador encerrado no enquadramento':''}</div>`;
  }
  const chips=acoes.length?acoes.map(a=>`<div style="margin-top:3px"><span style="font-weight:800;color:${a.atraso?'#EF4444':'var(--accent)'}">${pdEsc(acaoRespLabel(a))}</span> → ${pdEsc(a.texto)}</div>`).join(''):'<div style="margin-top:3px;color:var(--muted)">Nenhuma ação pendente.</div>';
  const pa=prazoAnalistaInfo(p);
  let paHtml='';
  if(pa.tipo==='ativo'||pa.tipo==='vencido'||pa.tipo==='pausado'){
    paHtml=`<div style="margin-top:6px;font-size:11px"><b>Prazo do Analista (${pa.base} d):</b> até ${fmtTxt(pa.limite)} · <span style="font-weight:700;color:${pa.tipo==='vencido'?'#EF4444':(pa.tipo==='pausado'?'#F59E0B':(pa.dias<=3?'#F97316':'#22C55E'))}">${pa.tipo==='vencido'?'vencido há '+Math.abs(pa.dias)+' d':(pa.tipo==='pausado'?'pausado (Medida 34)':'faltam '+pa.dias+' d')}</span></div>`;
  } else if(pa.tipo==='decidido' && pa.usados!=null){
    paHtml=`<div style="margin-top:6px;font-size:10px;color:var(--muted)">Analista definiu a ação em ${pa.usados} d (${pa.dentro?'dentro':'<span style="color:#EF4444;font-weight:700">fora</span>'} do prazo de ${pa.base} d)</div>`;
  }
  const chaveHtml=(p.acaoAnalista==='Enviado para Projeto' && !p.dataEnquadramento && p.equipamentoRef)?pdEquipAvisoHtml(p.equipamentoRef,p.id):'';
  el.style.display='block';
  el.innerHTML=pdEtapasHtml(p)+`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:700">Etapa atual</div>
        <div style="font-weight:800;font-size:13px">${pdEsc(st)}</div>${pdAlertasHtml(p)}
        <div style="font-size:10px;color:var(--muted);margin-top:4px">${pdEsc(p.tipoPedido||'')} · ${pdEsc(p.tipoSolicitacao||'')} · ${pdEsc(p.municipio||'')}${g?' · Gerente: '+pdEsc(g):''}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:700">Prazo para gerar o orçamento</div>${prazoTxt}${paHtml}</div>
    </div>${chaveHtml?'<div style="margin-top:10px">'+chaveHtml+'</div>':''}
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:12px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:700">Quem precisa agir agora</div>${chips}</div>`;
}


// ══════════════════════════════════════════════════════
//  MODAL DO PEDIDO — identificação · Medida 34 · checklist
// ══════════════════════════════════════════════════════
window.onTipoSolicitacaoChange=function(){
  const t=document.getElementById('pdTipoSolicitacao').value;
  const cfg=TIPOS_SOLICITACAO[t];
  document.getElementById('pdTipoPedidoPreview').textContent=cfg?`${cfg.tipoPedido} · prazo base: ${cfg.prazoDias} dias`:'—';
};
window.onAcaoAnalistaChange=function(){
  const a=document.getElementById('pdAcaoAnalista').value;
  document.getElementById('fgProjetista').style.display=a==='Enviado para Projeto'?'flex':'none';
  document.getElementById('fgDataEncaminhamento').style.display=a==='Enviado para Projeto'?'flex':'none';
  document.getElementById('fgEquipRef').style.display=a==='Enviado para Projeto'?'flex':'none';
  document.getElementById('fgEscopoProjeto').style.display=a==='Enviado para Projeto'?'flex':'none';
  pdEquipAvisoRender();
  document.getElementById('fgMotivoCancelamento').style.display=a==='Cancelado'?'flex':'none';
};

function renderMedida34Status(p){
  const ativaA=(p?.medida34Analista||[]).some(x=>!x.fim);
  const ativaG=(p?.medida34Gerente||[]).some(x=>!x.fim);
  const elA=document.getElementById('medida34AnalistaStatus');
  const elG=document.getElementById('medida34GerenteStatus');
  if(elA) elA.innerHTML=ativaA?'<span style="color:#F59E0B;font-weight:700">⏸️ Ativa</span>':'<span style="color:#22C55E">Inativa</span>';
  if(elG) elG.innerHTML=ativaG?'<span style="color:#F59E0B;font-weight:700">⏸️ Ativa</span>':'<span style="color:#22C55E">Inativa</span>';
  const btnA=document.getElementById('btnToggleMedida34Analista'); if(btnA) btnA.textContent=ativaA?'Desativar':'Ativar';
  const btnG=document.getElementById('btnToggleMedida34Gerente'); if(btnG) btnG.textContent=ativaG?'Desativar':'Ativar';
  const secA=document.getElementById('secMedida34Analista'); if(secA) secA.style.display=['analista','gerente'].includes(me.perfil)?'flex':'none';
  const secG=document.getElementById('secMedida34Gerente'); if(secG) secG.style.display=me.perfil==='gerente'?'flex':'none';
}

window.toggleMedida34=async function(quem){
  const id=document.getElementById('pedidoId').value;
  if(!id){ toast('Salve o pedido antes de usar a Medida 34.','err'); return; }
  const p=pedidos.find(x=>x.id===id); if(!p) return;
  const campo=quem==='analista'?'medida34Analista':'medida34Gerente';
  const lista=(p[campo]||[]).map(x=>({...x}));
  const ativa=lista.find(x=>!x.fim);
  const h=pdHojeStr(); let motivo='';
  if(ativa){ ativa.fim=h; }
  else {
    const m=prompt('Motivo da Medida 34:'); if(m===null) return;
    motivo=(m||'').trim();
    lista.push({inicio:h, fim:null, motivo, registradoPor:me.nome});
  }
  try{
    const np=await pdSave(id,{[campo]:lista}, ativa?'Medida 34 removida ('+quem+')':'Medida 34 ativada ('+quem+')', ativa?'':motivo);
    toast(ativa?'Medida 34 removida.':'Medida 34 ativada.');
    renderMedida34Status(np); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao atualizar Medida 34.','err'); }
};

function refreshChecklistSection(p){
  const warn=document.getElementById('checklistPendenciaWarning');
  if(warn){
    if(checklistTemPendencia(p)){
      warn.style.display='block';
      warn.textContent='⚠️ Pendência Documental — checklist concluído com documento(s) não entregue(s): '+checklistPendentes(p).map(i=>i.documento).join(', ');
    } else { warn.style.display='none'; }
  }
  const btnConcluir=document.getElementById('btnConcluirChecklist');
  if(btnConcluir) btnConcluir.textContent=p.checklistConcluido?'Reabrir Checklist':'Concluir Checklist';
  const statusEl=document.getElementById('checklistConcluidoStatus');
  if(statusEl){
    statusEl.innerHTML=checklistAplicaveis(p).length===0
      ?'<span style="color:var(--muted)">Nenhum documento exigido — etapa dispensada</span>'
      :(p.checklistConcluido?'<span style="color:#22C55E;font-weight:700">✅ Checklist concluído</span>':'<span style="color:#F59E0B">⏳ Checklist em andamento</span>');
  }
  renderChecklistItems(p);
}
function renderChecklistItems(p){
  const lista=p.checklistDocumental||[];
  const el=document.getElementById('checklistItemsList'); if(!el) return;
  const editavel=podeEditarChecklist();
  if(!lista.length){ el.innerHTML='<div style="font-size:11px;color:var(--muted)">Este tipo de solicitação não tem documentos configurados no checklist (etapa dispensada). O Gerente pode configurar em "⚙️ Configurar Checklist".</div>'; return; }
  el.innerHTML=lista.map((item,idx)=>{
    if(!itemChecklistAplicavel(p,item)){
      const def=p.analiseProjeto?.terceiros;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);opacity:.6">
        <input type="checkbox" style="width:auto" disabled>
        <span style="font-size:12px;flex:1">${pdEsc(item.documento)}</span>
        <span style="font-size:10px;color:var(--muted)">${def==='nao'?'Não necessária (definido pelo Gerente)':'Aguardando o Gerente definir se será necessária'}</span></div>`;
    }
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);cursor:${editavel?'pointer':'default'}">
      <input type="checkbox" style="width:auto" ${item.status==='entregue'?'checked':''} ${editavel?'':'disabled'} onchange="toggleChecklistItem(${idx})">
      <span style="font-size:12px;flex:1">${pdEsc(item.documento)}</span>
      ${item.status==='entregue'&&item.dataEntrega?`<span style="color:var(--muted);font-size:10px">${fmtTxt(item.dataEntrega)}${item.conferidoPor?' · '+pdEsc(item.conferidoPor):''}</span>`:''}
    </label>`;
  }).join('');
}
window.toggleChecklistItem=async function(idx){
  const id=document.getElementById('pedidoId').value;
  const p=pedidos.find(x=>x.id===id); if(!p) return;
  const lista=(p.checklistDocumental||[]).map(x=>({...x}));
  const item=lista[idx]; if(!item) return;
  if(item.status==='entregue'){ item.status='pendente'; item.dataEntrega=null; item.conferidoPor=null; }
  else { item.status='entregue'; item.dataEntrega=pdHojeStr(); item.conferidoPor=me.nome; }
  try{
    const np=await pdSave(id,{checklistDocumental:lista}, 'Checklist: "'+item.documento+'" '+(item.status==='entregue'?'entregue':'voltou a pendente'));
    refreshChecklistSection(np); pdRefreshLeve(np); pdArRefreshFeedback();
  }catch(e){ console.error(e); toast('Erro ao atualizar checklist.','err'); }
};
window.toggleChecklistConcluido=async function(){
  const id=document.getElementById('pedidoId').value;
  const p=pedidos.find(x=>x.id===id); if(!p) return;
  const checklistConcluido=!p.checklistConcluido;
  try{
    const pend=checklistPendentes({...p,checklistConcluido}).map(i=>i.documento);
    const extraCk={};
    if(checklistConcluido){
      if(!p.checklistConcluidoEm) extraCk.checklistConcluidoEm=pdHojeStr();
      // fotografia do que faltava na 1ª conclusão (indicador "documentos que mais faltam por cidade")
      if(!Array.isArray(p.pendenciasIniciais)) extraCk.pendenciasIniciais=pend;
    }
    const np=await pdSave(id,{checklistConcluido,...extraCk}, checklistConcluido?'Checklist documental concluído':'Checklist documental reaberto', checklistConcluido&&pend.length?'Pendente(s): '+pend.join(', '):'');
    toast(checklistConcluido?(pend.length?'Checklist concluído com pendência documental.':'Checklist concluído!'):'Checklist reaberto.', checklistConcluido&&pend.length?'warn':'ok');
    refreshChecklistSection(np); pdRefreshLeve(np); pdArRefreshFeedback();
  }catch(e){ console.error(e); toast('Erro ao atualizar checklist.','err'); }
};
window.salvarAcompanhamentoChecklist=async function(){
  const btn=document.getElementById('btnSalvarChecklist');
  btn.disabled=true; btn.textContent='Salvando…';
  try{
    const id=document.getElementById('pedidoId').value;
    const p=pedidos.find(x=>x.id===id); if(!p) return;
    const dataRetornoProjetista=document.getElementById('pdDataRetornoProjetista').value||null;
    const latInput=document.getElementById('pdLatitude'), lonInput=document.getElementById('pdLongitude');
    const changes={
      dataRetornoProjetista,
      latitude: latInput?(latInput.value.trim()||null):(p.latitude||null),
      longitude: lonInput?(lonInput.value.trim()||null):(p.longitude||null),
      checklistFeedback: document.getElementById('pdChecklistFeedback').value.trim(),
    };
    const ev=[];
    if(dataRetornoProjetista && !p.primeiroRetornoProjetista) changes.primeiroRetornoProjetista=dataRetornoProjetista;
    if(dataRetornoProjetista!==(p.dataRetornoProjetista||null)) ev.push(dataRetornoProjetista?'Projetista devolveu o projeto em '+fmtTxt(dataRetornoProjetista):'Data de retorno do projetista removida');
    if(dataRetornoProjetista && p.reprojetoPendente){
      changes.reprojetoPendente=false; changes.validacaoGerenteOk=false;
      changes.analiseProjeto={...(p.analiseProjeto||{}),reprojeto:'',reprojetoTipo:'',reprojetoDescricao:'',concluidaEm:null};
      ev.push('Projeto reprojetado devolvido — volta para análise do Gerente');
    }
    const np=await pdSave(id,changes, ev.length?ev.join(' · '):'Acompanhamento do checklist salvo');
    toast('Acompanhamento salvo!');
    refreshChecklistSection(np);
    _apDraft=apMesclar(np.analiseProjeto); _apDirty=false;
    pdRenderAnaliseProjeto(); pdRenderPreAnalise(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao salvar.','err'); }
  finally{ const b=document.getElementById('btnSalvarChecklist'); if(b){ b.disabled=false; b.textContent='Salvar Acompanhamento'; } }
};

// ── Configuração do checklist (Gerente) ────────────────
window.openChecklistConfigModal=function(){
  document.getElementById('cfgTipoSolicitacao').value='';
  document.getElementById('cfgChecklistDocsList').innerHTML='';
  document.getElementById('ovChecklistConfig').classList.add('open');
};
window.closeChecklistConfigModal=function(){ document.getElementById('ovChecklistConfig').classList.remove('open'); };
window.renderConfigChecklistDocs=function(){
  const tipo=document.getElementById('cfgTipoSolicitacao').value;
  const el=document.getElementById('cfgChecklistDocsList');
  if(!tipo){ el.innerHTML=''; return; }
  const docs=getChecklistTemplate(tipo);
  el.innerHTML=docs.length
    ? docs.map((d,idx)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px">${pdEsc(d)}</span>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeDocFromTemplate(${idx})">🗑️</button>
      </div>`).join('')
    : '<div style="font-size:11px;color:var(--muted)">Nenhum documento configurado para este tipo.</div>';
};
window.addDocToTemplate=async function(){
  const tipo=document.getElementById('cfgTipoSolicitacao').value;
  if(!tipo){ toast('Selecione o tipo de solicitação.','err'); return; }
  const input=document.getElementById('cfgNovoDocumento');
  const nome=(input.value||'').trim();
  if(!nome){ toast('Informe o nome do documento.','err'); return; }
  const docs=[...getChecklistTemplate(tipo), nome];
  checklistTemplates[tipo]=docs;
  try{
    await setDoc(doc(db,'config','checklistTemplates'), {[tipo]:docs}, {merge:true});
    input.value=''; renderConfigChecklistDocs(); toast('Documento adicionado ao checklist deste tipo!');
  }catch(e){ console.error(e); toast('Erro ao salvar configuração.','err'); }
};
window.removeDocFromTemplate=async function(idx){
  const tipo=document.getElementById('cfgTipoSolicitacao').value;
  const docs=[...getChecklistTemplate(tipo)]; docs.splice(idx,1);
  checklistTemplates[tipo]=docs;
  try{
    await setDoc(doc(db,'config','checklistTemplates'), {[tipo]:docs}, {merge:true});
    renderConfigChecklistDocs(); toast('Documento removido do checklist deste tipo.');
  }catch(e){ console.error(e); toast('Erro ao salvar configuração.','err'); }
};

// ── Parâmetros (prazos de referência + justificativas de 2º ponto) ──
window.pdAbrirParams=function(){
  document.getElementById('prmPrazoProjetista').value=pedidosParams.prazoProjetistaDias;
  document.getElementById('prmPrazoReanalise').value=pedidosParams.prazoReanaliseDias;
  document.getElementById('prmPrazoAnalista').value=pedidosParams.prazoAnalistaDias;
  document.getElementById('prmFatorEstrada').value=pedidosParams.fatorEstrada;
  document.getElementById('prmMatriculaDias').value=pedidosParams.matriculaValidadeDias;
  document.getElementById('prmLvUrb').value=pedidosParams.lvUcUrb;
  document.getElementById('prmLvRur').value=pedidosParams.lvUcRur;
  document.getElementById('prmLvManobra').value=pedidosParams.lvUcManobra;
  pdRenderParamsJust();
  document.getElementById('ovPedidoParams').classList.add('open');
};
window.pdFecharParams=function(){ document.getElementById('ovPedidoParams').classList.remove('open'); };
function pdRenderParamsJust(){
  const el=document.getElementById('prmJustLista'); if(!el) return;
  const l=pedidosParams.justificativasPrimeiroPonto||[];
  el.innerHTML=l.length?l.map((j,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px">${pdEsc(j)}</span><button type="button" class="btn btn-danger btn-sm" onclick="pdDelJust(${i})">🗑️</button></div>`).join('')
    :'<div style="font-size:11px;color:var(--muted)">Nenhuma justificativa cadastrada (restará apenas "Outro").</div>';
}
window.pdSalvarPrazos=async function(){
  const a=parseInt(document.getElementById('prmPrazoProjetista').value,10), b=parseInt(document.getElementById('prmPrazoReanalise').value,10);
  const c=parseInt(document.getElementById('prmPrazoAnalista').value,10), f=parseFloat(String(document.getElementById('prmFatorEstrada').value).replace(',','.')), md=parseInt(document.getElementById('prmMatriculaDias').value,10);
  if(!(a>0)||!(b>0)||!(c>0)||!(md>0)){ toast('Informe prazos em dias (números maiores que zero).','err'); return; }
  if(!(f>=1)){ toast('O fator de estrada deve ser 1 ou maior (ex.: 1,3).','err'); return; }
  const lu=parseInt(document.getElementById('prmLvUrb').value,10), lr=parseInt(document.getElementById('prmLvRur').value,10), lm=parseInt(document.getElementById('prmLvManobra').value,10);
  if(!(lu>0)||!(lr>0)||!(lm>0)){ toast('Informe os limites de UC da Linha Viva (números maiores que zero).','err'); return; }
  const _prm={prazoProjetistaDias:a,prazoReanaliseDias:b,prazoAnalistaDias:c,fatorEstrada:f,matriculaValidadeDias:md,lvUcUrb:lu,lvUcRur:lr,lvUcManobra:lm};
  Object.assign(pedidosParams,_prm);
  try{ await setDoc(doc(db,'config','pedidosParametros'),_prm,{merge:true}); toast('Parâmetros salvos!'); pdRenderLista(); }
  catch(e){ console.error(e); toast('Erro ao salvar prazos.','err'); }
};
window.pdAddJust=async function(){
  const inp=document.getElementById('prmNovaJust'); const t=(inp.value||'').trim();
  if(!t){ toast('Escreva a justificativa.','err'); return; }
  const l=[...(pedidosParams.justificativasPrimeiroPonto||[]),t]; pedidosParams.justificativasPrimeiroPonto=l;
  try{ await setDoc(doc(db,'config','pedidosParametros'),{justificativasPrimeiroPonto:l},{merge:true}); inp.value=''; pdRenderParamsJust(); toast('Justificativa adicionada!'); }
  catch(e){ console.error(e); toast('Erro ao salvar.','err'); }
};
window.pdDelJust=async function(i){
  const l=[...(pedidosParams.justificativasPrimeiroPonto||[])]; l.splice(i,1); pedidosParams.justificativasPrimeiroPonto=l;
  try{ await setDoc(doc(db,'config','pedidosParametros'),{justificativasPrimeiroPonto:l},{merge:true}); pdRenderParamsJust(); toast('Justificativa removida.'); }
  catch(e){ console.error(e); toast('Erro ao salvar.','err'); }
};

// ══════════════════════════════════════════════════════
//  ANÁLISE DOCUMENTAL — Ligação nova Rural (Adm_ODI / Estagiário / Gerente)
// ══════════════════════════════════════════════════════
let _arDraft=arVazio(), _arDirty=false;
const AR_YN=[['','—'],['sim','Sim'],['nao','Não']];

function arSelH(path,val,opts,ro){
  return `<select ${ro?'disabled':''} onchange="pdArSet('${path}',this.value,true)" style="width:100%">${opts.map(([v,l])=>`<option value="${pdEsc(v)}" ${val===v?'selected':''}>${pdEsc(l)}</option>`).join('')}</select>`;
}
function arInpH(path,val,ph,ro,type){
  return `<input type="${type||'text'}" value="${pdEsc(val)}" ${ro?'disabled':''} placeholder="${pdEsc(ph||'')}" oninput="pdArSet('${path}',this.value,false)" style="width:100%">`;
}
function arListH(path,arr,label,ro){
  return (arr||['']).map((v,i)=>`<div style="display:flex;gap:6px;margin-bottom:4px">
      <input type="text" value="${pdEsc(v)}" ${ro?'disabled':''} placeholder="${pdEsc(label)} ${i+1}" oninput="pdArSetList('${path}',${i},this.value)" style="flex:1">
      ${ro?'':`<button type="button" class="btn btn-danger btn-sm" onclick="pdArListDel('${path}',${i})">🗑️</button>`}</div>`).join('')
    + (ro?'':`<button type="button" class="btn btn-secondary btn-sm" onclick="pdArListAdd('${path}')">+ Adicionar ${pdEsc(label.toLowerCase())}</button>`);
}
function arFieldH(label,inner,full){ return `<div class="fg"${full?' style="grid-column:1/-1"':''}><label>${label}</label>${inner}</div>`; }
function arTituloH(t){ return `<div style="font-size:11px;font-weight:800;margin:14px 0 6px;color:var(--accent);text-transform:uppercase;letter-spacing:1px">${t}</div>`; }

window.pdArSet=function(path,val,rerender){
  pdSetPath(_arDraft,path,val); _arDirty=true;
  if(rerender) pdRenderAnaliseRural(); else pdArRefreshFeedback();
};
window.pdArSetList=function(path,i,val){ const l=pdGetPath(_arDraft,path); l[i]=val; _arDirty=true; pdArRefreshFeedback(); };
window.pdArListAdd=function(path){ const l=pdGetPath(_arDraft,path); l.push(''); _arDirty=true; pdRenderAnaliseRural(); };
window.pdArTercAdd=function(){ _arDraft.terceiros.autorizacoes.push(arTercVazio()); _arDirty=true; pdRenderAnaliseRural(); };
window.pdArTercDel=function(i){ const l=_arDraft.terceiros.autorizacoes; l.splice(i,1); if(!l.length) l.push(arTercVazio()); _arDirty=true; pdRenderAnaliseRural(); };
window.pdArListDel=function(path,i){ const l=pdGetPath(_arDraft,path); l.splice(i,1); if(!l.length) l.push(''); _arDirty=true; pdRenderAnaliseRural(); };

function pdRenderAnaliseRural(){
  const p=_pdAtual(); const body=document.getElementById('pdAnaliseRuralBody'); if(!p||!body) return;
  const ro=!arPodeEditar(); const d=_arDraft;
  const m=d.matricula, s=d.solicitante, t=d.terceiros, am=d.ambiental, ds=d.desenho;
  const just=pedidosParams.justificativasPrimeiroPonto||[];
  const justOpts=[['','— selecione —'],...just.map(j=>[j,j]),['__OUTRO__','Outro (escrever)']];
  const areaN=parseFloat(String(m.areaHa).replace(',','.'));
  const defT=p.analiseProjeto?.terceiros;
  let blocoTerc;
  if(defT==='sim'){
    const confrL=(m.confrontantes||[]).map(x=>String(x).trim()).filter(Boolean);
    blocoTerc=`<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Registre <b>uma autorização por pessoa</b> (podem ser várias). O sistema compara cada nome com os confrontantes da matrícula e avisa quando não bate.</div>`
      +(t.autorizacoes||[]).map((x,ix)=>{
        const nome=String(x.nome||'').trim();
        const bate=nome&&confrL.length?confrL.some(c=>pdMatchNome(c,nome)):null;
        const selo=bate===null?'':(bate?'<span style="color:#22C55E;font-size:10px;font-weight:700">✅ nome confere com um confrontante</span>':'<span style="color:#F59E0B;font-size:10px;font-weight:700">⚠️ nome não bate com nenhum confrontante</span>');
        return `<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;flex-wrap:wrap"><b style="font-size:11px">Autorização de terceiros ${ix+1}</b>${selo}${ro?'':`<button type="button" class="btn btn-danger btn-sm" onclick="pdArTercDel(${ix})">🗑️</button>`}</div>
          <div class="fg-grid">
            ${arFieldH('Nome de quem autorizou',`<input type="text" value="${pdEsc(x.nome)}" ${ro?'disabled':''} placeholder="Nome" onchange="pdArSet('terceiros.autorizacoes.${ix}.nome',this.value,true)" style="width:100%">`)}
            ${arFieldH('O nome está legível / assinado?',arSelH('terceiros.autorizacoes.'+ix+'.nomeVisivel',x.nomeVisivel,AR_YN,ro))}
            ${arFieldH('Está com nº de matrícula?',arSelH('terceiros.autorizacoes.'+ix+'.matriculaPreenchida',x.matriculaPreenchida,AR_YN,ro))}
            ${x.matriculaPreenchida==='sim'?arFieldH('Nº da matrícula do terceiro',arInpH('terceiros.autorizacoes.'+ix+'.matricula',x.matricula,'Nº',ro)):'<div></div>'}
            ${arFieldH('Localidade da autorização',arInpH('terceiros.autorizacoes.'+ix+'.localidade',x.localidade,'Localidade',ro))}
          </div></div>`; }).join('')
      +(ro?'':`<button type="button" class="btn btn-secondary btn-sm" onclick="pdArTercAdd()">+ Adicionar autorização de terceiros</button>`)
      +`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
      <span>${p.terceirosConferido?'<span style="color:#22C55E;font-weight:700">✅ Terceiros conferidos'+(p.terceirosConferidoEm?' em '+fmtTxt(p.terceirosConferidoEm):'')+'</span>':'<span style="color:#F59E0B">⏳ Conferência de terceiros pendente</span>'}</span>
      ${ro?'':`<button type="button" class="btn btn-secondary btn-sm" onclick="pdArSalvar('${p.terceirosConferido?'terc_reabrir':'terc_concluir'}')">${p.terceirosConferido?'Reabrir conferência de terceiros':'Concluir conferência de terceiros'}</button>`}
    </div>`;
  } else {
    blocoTerc=`<div style="padding:10px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted)">
      ${defT==='nao'?'O Gerente definiu que <b>não</b> é necessária autorização de passagem de terceiros.':'Não definido ainda se será necessário autorização de passagem de terceiros. Aguardando o retorno do projeto (análise do Gerente).'}</div>`;
  }
  if(pdEhGerente()){
    blocoTerc=`<div class="fg" style="max-width:340px;margin-bottom:8px"><label>Definição do Gerente: é necessária autorização de terceiros?</label>
      <select onchange="pdDefinirTerceiros(this.value)" style="width:100%"><option value="" ${!defT?'selected':''}>Não definido ainda</option><option value="sim" ${defT==='sim'?'selected':''}>Sim, é necessária</option><option value="nao" ${defT==='nao'?'selected':''}>Não é necessária</option></select></div>`+blocoTerc;
  }
  const concl=p.analiseDocumentalConcluida
    ?`<span style="color:#22C55E;font-weight:700">✅ Análise documental concluída em ${fmtTxt(p.analiseDocumentalEm)}${p.analiseDocumentalPor?' por '+pdEsc(p.analiseDocumentalPor):''}</span>`
    :'<span style="color:#F59E0B">⏳ Análise documental em andamento</span>';
  const clas=ds.primeiroPonto==='sim'?'1º Ponto':(ds.primeiroPonto==='nao'?'2º Ponto':null);
  body.innerHTML=`
    ${arTituloH('1. Análise da matrícula')}
    <div class="fg-grid">
      ${arFieldH('Dono(s) da matrícula (registre todos)',arListH('matricula.donos',m.donos,'Dono',ro),true)}
      ${arFieldH('Nº da matrícula apresentada',arInpH('matricula.numero',m.numero,'Ex: 12.345',ro))}
      ${arFieldH('Localidade da matrícula',arInpH('matricula.localidade',m.localidade,'Localidade',ro))}
      ${arFieldH('Data da última atualização (emissão) da matrícula'+((m.dataAtualizacao&&diff(m.dataAtualizacao,pdHojeStr())>(pedidosParams.matriculaValidadeDias||365))?' <span style="color:#F59E0B;font-weight:700">· há mais de 1 ano</span>':''),`<input type="date" value="${pdEsc(m.dataAtualizacao)}" ${ro?'disabled':''} max="${pdHojeStr()}" onchange="pdArSet('matricula.dataAtualizacao',this.value,true)" style="width:100%">`)}
      ${arFieldH('A matrícula é georreferenciada?',arSelH('matricula.georreferenciada',m.georreferenciada,AR_YN,ro))}
      ${m.georreferenciada==='nao'?arFieldH('Possui documento anexo com georreferenciamento e ART?',arSelH('matricula.docGeo',m.docGeo,AR_YN,ro)):''}
      ${m.georreferenciada==='nao'&&m.docGeo==='sim'?arFieldH('A ART está assinada pelo responsável e pelo cliente?',arSelH('matricula.artAssinada',m.artAssinada,AR_YN,ro))+arFieldH('A ART está paga?',arSelH('matricula.artPaga',m.artPaga,AR_YN,ro)):''}
      ${arFieldH('Área da matrícula (hectares)'+(!isNaN(areaN)&&areaN<2?' <span style="color:#F59E0B;font-weight:700">· menor que 2 ha: necessário cadastro no INCRA</span>':''),arInpH('matricula.areaHa',m.areaHa,'Ex: 3,5',ro))}
      ${arFieldH('A matrícula tem CCIR?',arSelH('matricula.ccir',m.ccir,AR_YN,ro))}
      ${m.ccir==='sim'?arFieldH('Nº do CCIR',arInpH('matricula.ccirNumero',m.ccirNumero,'Nº do CCIR',ro)):''}
      ${arFieldH('Confrontantes da matrícula (registre todos)',arListH('matricula.confrontantes',m.confrontantes,'Confrontante',ro),true)}
    </div>
    ${arTituloH('2. Autorização de passagem — solicitante')}
    <div class="fg-grid">
      ${arFieldH('Tem autorização de passagem do solicitante?',arSelH('solicitante.possui',s.possui,AR_YN,ro))}
      ${s.possui==='sim'?arFieldH('Está preenchido o nº da matrícula?',arSelH('solicitante.matriculaPreenchida',s.matriculaPreenchida,AR_YN,ro))
        +arFieldH('Está preenchida a localidade?',arSelH('solicitante.localidadePreenchida',s.localidadePreenchida,AR_YN,ro))
        +arFieldH('Está com nome legível e assinatura?',arSelH('solicitante.nomeLegivel',s.nomeLegivel,AR_YN,ro))
        +arFieldH('Quem assinou (nomes) — usado para conferir com os donos da matrícula',arListH('solicitante.assinantes',s.assinantes,'Assinante',ro),true):''}
    </div>
    ${arTituloH('3. Autorização de passagem — terceiros')}
    ${blocoTerc}
    ${arTituloH('4. Ambiental / construtivo')}
    <div class="fg-grid">
      ${arFieldH('Alvará de construção cita a matrícula?',arSelH('ambiental.alvaraCita',am.alvaraCita,AR_YN,ro))}
      ${am.alvaraCita==='sim'?arFieldH('Nº da matrícula citada no alvará',arInpH('ambiental.alvaraMatricula',am.alvaraMatricula,'Nº',ro)):(am.alvaraCita==='nao'?arFieldH('Localidade citada no alvará',arInpH('ambiental.alvaraLocalidade',am.alvaraLocalidade,'Localidade',ro)):'<div></div>')}
      ${arFieldH('Declaração de Não APP cita a matrícula?',arSelH('ambiental.appCita',am.appCita,AR_YN,ro))}
      ${am.appCita==='sim'?arFieldH('Nº da matrícula citada na Declaração de Não APP',arInpH('ambiental.appMatricula',am.appMatricula,'Nº',ro)):(am.appCita==='nao'?arFieldH('Localidade citada na Declaração de Não APP',arInpH('ambiental.appLocalidade',am.appLocalidade,'Localidade',ro)):'<div></div>')}
    </div>
    ${arTituloH('5. Desenho da matrícula')}
    <div class="fg-grid">
      ${arFieldH('É possível constatar o 1º ponto de energia na matrícula?',arSelH('desenho.primeiroPonto',ds.primeiroPonto,AR_YN,ro))}
      <div class="fg"><label>Classificação (definida pelo Adm_ODI)</label><div style="padding:7px 0;font-weight:800;color:${clas?'var(--accent)':'var(--muted)'}">${clas||'— aguardando resposta —'}</div></div>
      ${ds.primeiroPonto==='nao'?arFieldH('Justificativa do 2º ponto',arSelH('desenho.justificativa',ds.justificativa,justOpts,ro),true):''}
      ${ds.primeiroPonto==='nao'&&ds.justificativa==='__OUTRO__'?arFieldH('Descreva a justificativa',arInpH('desenho.outroTexto',ds.outroTexto,'Escreva a justificativa',ro),true):''}
      ${ds.primeiroPonto==='nao'?arFieldH('Complemento (ex.: nº da UC e titular, quando a justificativa citar X / Y)',arInpH('desenho.complemento',ds.complemento,'Opcional',ro),true):''}
    </div>
    ${arTituloH('Feedback da análise documental (gerado automaticamente)')}
    <div id="arFeedbackBox"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:12px">
      <span id="arStatusLinha">${concl}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" onclick="pdArCopiar()">📋 Copiar feedback</button>
        ${ro?'':`<button type="button" class="btn btn-secondary btn-sm" onclick="pdArSalvar('rascunho')">💾 Salvar</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="pdArSalvar('${p.analiseDocumentalConcluida?'reabrir':'concluir'}')">${p.analiseDocumentalConcluida?'Reabrir análise':'Concluir análise documental'}</button>`}
      </div>
    </div>`;
  pdArRefreshFeedback();
}

function pdArRefreshFeedback(){
  const box=document.getElementById('arFeedbackBox'); const p=_pdAtual(); if(!box||!p) return;
  const itens=arGerarFeedback(p,_arDraft);
  const ic={erro:['❌','#EF4444'],aviso:['⚠️','#F59E0B'],ok:['✅','#22C55E']};
  box.innerHTML=itens.map(i=>`<div style="display:flex;gap:6px;padding:4px 0;font-size:12px;color:${ic[i.n][1]}"><span>${ic[i.n][0]}</span><span>${pdEsc(i.t)}</span></div>`).join('');
}
window.pdArCopiar=async function(){
  const p=_pdAtual(); if(!p) return;
  const txt=arFeedbackTexto(p,arGerarFeedback(p,_arDraft));
  try{ await navigator.clipboard.writeText(txt); toast('Feedback copiado!'); }
  catch(e){ prompt('Copie o feedback abaixo:',txt); }
};

window.pdDefinirTerceiros=async function(v){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  try{
    const ap={...(p.analiseProjeto||{}),terceiros:v};
    const np=await pdSave(p.id,{analiseProjeto:ap}, 'Gerente definiu autorização de terceiros: '+(v==='sim'?'NECESSÁRIA':v==='nao'?'não necessária':'não definido'));
    _apDraft.terceiros=v;
    refreshChecklistSection(np); pdRenderAnaliseRural(); pdRenderAnaliseProjeto(); pdRefreshLeve(np);
    toast(v==='sim'?'Autorização de terceiros marcada como necessária — liberada para conferência.':'Definição salva.');
  }catch(e){ console.error(e); toast('Erro ao salvar definição.','err'); }
};

window.pdArSalvar=async function(modo){
  const p=_pdAtual(); if(!p) return;
  if(!arPodeEditar()){ toast('Sem permissão para editar a análise documental.','err'); return; }
  const d=arLimpar(_arDraft);
  const changes={analiseRural:d};
  const pp=d.desenho.primeiroPonto;
  changes.classificacaoPonto= pp==='sim'?'1º Ponto':(pp==='nao'?'2º Ponto':null);
  let ev='Análise documental salva', det=changes.classificacaoPonto?('Classificação: '+changes.classificacaoPonto):'';
  if(modo==='concluir'){
    if(pp!=='sim'&&pp!=='nao'){ toast('Responda se é possível constatar o 1º ponto (Desenho da matrícula) antes de concluir.','err'); return; }
    if(pp==='nao'&&!arJustificativaTexto(d)){ toast('Informe a justificativa do 2º ponto antes de concluir.','err'); return; }
    changes.analiseDocumentalConcluida=true; changes.analiseDocumentalEm=pdHojeStr(); changes.analiseDocumentalPor=me.nome;
    changes.feedbackDocumental=arFeedbackTexto({...p,...changes},arGerarFeedback({...p,...changes},d));
    ev='Análise documental concluída';
  } else if(modo==='reabrir'){
    changes.analiseDocumentalConcluida=false; ev='Análise documental reaberta';
  } else if(modo==='terc_concluir'){
    changes.terceirosConferido=true; changes.terceirosConferidoEm=pdHojeStr(); ev='Conferência de autorização de terceiros concluída';
  } else if(modo==='terc_reabrir'){
    changes.terceirosConferido=false; ev='Conferência de autorização de terceiros reaberta';
  }
  try{
    const np=await pdSave(p.id,changes,ev,det);
    _arDraft=arMesclar(np.analiseRural); _arDirty=false;
    pdRenderAnaliseRural(); pdRefreshLeve(np);
    toast(modo==='concluir'?'Análise documental concluída!':(modo==='rascunho'?'Análise salva.':'Atualizado.'));
  }catch(e){ console.error(e); toast('Erro ao salvar a análise documental.','err'); }
};

// ══════════════════════════════════════════════════════
//  ANÁLISE DE PROJETO (Gerente) — libera quando o projetista devolve o projeto
// ══════════════════════════════════════════════════════
let _apDraft=apVazio(), _apDirty=false;
function apVazio(){ return {orgaosNecessario:'',orgaos:[],terceiros:'',reprojeto:'',reprojetoTipo:'',reprojetoDescricao:'',verificacaoCampo:'',lv:'',lvOrcada:'',lvJust:''}; }
// A decisão do Gerente contraria a sugestão do sistema? (exige justificativa)
function apLvContraria(d,c){ if(!c||!c.achou||!d.lv) return false; return (c.resultado==='obrigatorio'&&d.lv==='nao')||(c.resultado==='nao_aplicavel'&&d.lv==='sim'); }
function apMesclar(s){ const b=Object.assign(apVazio(),s||{}); b.orgaos=Array.isArray(b.orgaos)?[...b.orgaos]:[]; return b; }

window.pdApSet=function(k,v,rerender){ _apDraft[k]=v; _apDirty=true; if(rerender) pdRenderAnaliseProjeto(); };
window.pdApToggleOrgao=function(o,on){ const s=new Set(_apDraft.orgaos); if(on) s.add(o); else s.delete(o); _apDraft.orgaos=[...s]; _apDirty=true; };

function pdProblemasReprojetoConhecidos(){
  const set=new Set();
  pedidos.forEach(p=>(p.reprojetos||[]).forEach(r=>{ if(r.tipo) set.add(r.tipo); }));
  return [...set].sort();
}

function pdEscopoHtml(p){
  return `<div style="padding:8px 10px;margin-bottom:10px;border-left:3px solid var(--accent);background:var(--surface2);border-radius:6px">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700">Escopo definido pelo Analista — o que deveria ser projetado</div>
    <div style="font-size:12px;white-space:pre-wrap">${p.escopoProjeto?pdEsc(p.escopoProjeto):'<span style="color:var(--muted)">Não informado pelo Analista.</span>'}</div></div>`;
}
function pdRenderAnaliseProjeto(){
  const p=_pdAtual(); const body=document.getElementById('pdAnaliseProjetoBody'); if(!p||!body) return;
  const ed=pdEhGerente(); const ro=!ed; const d=_apDraft; const rural=pedidoEhRural(p);
  const liberado=!!p.dataRetornoProjetista;
  const SEL=(k,val,opts)=>`<select ${ro?'disabled':''} onchange="pdApSet('${k}',this.value,true)" style="width:100%">${opts.map(([v,l])=>`<option value="${v}" ${val===v?'selected':''}>${l}</option>`).join('')}</select>`;
  const F=(l,i,full)=>`<div class="fg"${full?' style="grid-column:1/-1"':''}><label>${l}</label>${i}</div>`;
  let html='';
  const hist=(p.reprojetos||[]);
  if(hist.length){
    html+=`<div style="font-size:11px;margin-bottom:8px"><b>Histórico de reprojetos:</b>`+hist.map((r,i)=>`<div style="color:var(--muted)">#${i+1} · ${fmtTxt(r.data)} · ${pdEsc(r.projetista||'projetista não informado')} · <b>${pdEsc(r.tipo)}</b>${r.descricao?' — '+pdEsc(r.descricao):''}</div>`).join('')+`</div>`;
  }
  if(p.reprojetoPendente){
    html+=`<div style="padding:10px;border:1px solid rgba(249,115,22,.4);background:rgba(249,115,22,.08);border-radius:8px;font-size:12px">♻️ Reprojeto solicitado. Aguardando o projetista devolver o projeto — quando chegar, o Estagiário registra a nova data de retorno (seção Checklist) e a análise volta para o Gerente.</div>`;
    body.innerHTML=html; return;
  }
  if(!liberado){
    html+=`<div style="padding:10px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted)">Libera quando o projetista devolver o projeto (o Estagiário registra a data de retorno no checklist).</div>`;
    body.innerHTML=html; return;
  }
  const _lvContra=apLvContraria(d,_pdLvAtual||p.linhaVivaCalc);
  html+=pdEscopoHtml(p)+`<div class="pdLvSlot" data-ctx="gerente" style="margin-bottom:10px">${pdLvHtml(_pdLvAtual||p.linhaVivaCalc||null,'gerente')}</div><div class="fg-grid">
    ${F('Definição do Gerente: a obra terá equipe de Linha Viva?',SEL('lv',d.lv,[['','—'],['sim','Sim — com Linha Viva'],['nao','Não — sem Linha Viva']]))}
    ${d.lv==='sim'?F('A Linha Viva foi orçada no projeto?',SEL('lvOrcada',d.lvOrcada,[['','—'],['sim','Sim'],['nao','Não foi orçada']])):'<div></div>'}
    ${(_lvContra||d.lvJust)?F('Justificativa da definição de Linha Viva'+(_lvContra?' * (contraria a indicação do sistema)':''),`<input type="text" value="${pdEsc(d.lvJust)}" ${ro?'disabled':''} oninput="pdApSet('lvJust',this.value,false)" style="width:100%">`,true):''}
    ${F('A obra necessita aprovação de órgão competente?',SEL('orgaosNecessario',d.orgaosNecessario,[['','—'],['nao','Não precisa'],['sim','Sim']]))}
    ${d.orgaosNecessario==='sim'?F('Quais órgãos?',ORGAOS_COMPETENTES.map(o=>`<label style="display:inline-flex;gap:4px;align-items:center;margin-right:12px;font-size:12px"><input type="checkbox" style="width:auto" ${ro?'disabled':''} ${d.orgaos.includes(o)?'checked':''} onchange="pdApToggleOrgao('${o}',this.checked)">${o}</label>`).join('')):'<div></div>'}
    ${rural?F('O projeto torna necessária autorização de passagem de terceiros?',SEL('terceiros',d.terceiros,[['','—'],['nao','Não'],['sim','Sim']])):''}
    ${F('É necessário verificação em campo?',SEL('verificacaoCampo',d.verificacaoCampo,[['','—'],['nao','Não'],['sim','Sim — marcar para conferência em campo']]))}
    ${F('Torna-se necessário reprojetar?',SEL('reprojeto',d.reprojeto,[['','—'],['nao','Não'],['sim','Sim']]))}
    ${d.reprojeto==='sim'?F('Qual o problema? (tipo — gera o histórico)',`<input type="text" list="dlProblemasReprojeto" value="${pdEsc(d.reprojetoTipo)}" ${ro?'disabled':''} oninput="pdApSet('reprojetoTipo',this.value,false)" placeholder="Ex: poste fora da matrícula" style="width:100%"><datalist id="dlProblemasReprojeto">${pdProblemasReprojetoConhecidos().map(x=>`<option value="${pdEsc(x)}">`).join('')}</datalist>`)
      +F('Descrição (opcional)',`<input type="text" value="${pdEsc(d.reprojetoDescricao)}" ${ro?'disabled':''} oninput="pdApSet('reprojetoDescricao',this.value,false)" style="width:100%">`):''}
  </div>`;
  html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px">
    <span>${p.validacaoGerenteOk?`<span style="color:#22C55E;font-weight:700">✅ Análise de projeto concluída${p.analiseProjeto?.concluidaEm?' em '+fmtTxt(p.analiseProjeto.concluidaEm):''}</span>`:'<span style="color:#F59E0B">⏳ Análise de projeto pendente</span>'}</span>
    ${ro?'':`<button type="button" class="btn btn-primary btn-sm" onclick="pdApConcluir('${p.validacaoGerenteOk?'reabrir':'concluir'}')">${p.validacaoGerenteOk?'Reabrir análise de projeto':'Concluir análise de projeto'}</button>`}
  </div>`;
  // acompanhamento de órgãos / campo
  const ol=p.orgaosLiberacao||{}; const orgs=Object.keys(ol);
  if(orgs.length||(p.verificacaoCampo&&p.verificacaoCampo.necessaria)){
    html+=`<div style="margin-top:12px;padding:10px;border:1px solid rgba(139,92,246,.35);border-radius:8px"><div style="font-size:11px;font-weight:800;margin-bottom:6px">Acompanhamento (tratativa em separado)</div>`;
    if(orgs.some(o=>!ol[o].liberadoEm)){
      html+=`<div style="font-size:11px;color:#F59E0B;margin-bottom:6px">⚠️ Necessita liberação de órgão competente: lance a <b>Medida 34</b> neste pedido e informe o cliente.${medida34Ativa(p)?' (Medida 34 já ativa ✓)':''}</div>`;
    }
    orgs.forEach(o=>{ const e=ol[o];
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;flex-wrap:wrap"><b style="min-width:60px">🏛️ ${o}</b>
        <span>${e.cienteEm?'Ciente em '+fmtTxt(e.cienteEm):'<span style="color:#F59E0B">sem ciência</span>'}</span>
        <span>${e.liberadoEm?'<span style="color:#22C55E;font-weight:700">✅ Liberado em '+fmtTxt(e.liberadoEm)+'</span>':'<span style="color:#F59E0B">⏳ aguardando liberação</span>'}</span>
        ${ed?`<span style="margin-left:auto;display:flex;gap:6px">
          ${!e.cienteEm?`<button type="button" class="btn btn-secondary btn-sm" onclick="pdOrgaoAcao('${o}','ciente')">Ciente</button>`:''}
          ${!e.liberadoEm?`<button type="button" class="btn btn-primary btn-sm" onclick="pdOrgaoAcao('${o}','liberado')">Liberação obtida</button>`:`<button type="button" class="btn btn-secondary btn-sm" onclick="pdOrgaoAcao('${o}','desfazer')">Desfazer</button>`}</span>`:''}</div>`;
    });
    if(p.verificacaoCampo&&p.verificacaoCampo.necessaria){
      const v=p.verificacaoCampo;
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;flex-wrap:wrap"><b style="min-width:60px">📍 Campo</b>
        <span>${v.realizadaEm?'<span style="color:#22C55E;font-weight:700">✅ Verificação realizada em '+fmtTxt(v.realizadaEm)+(v.realizadaPor?' por '+pdEsc(v.realizadaPor):'')+'</span>':'<span style="color:#F59E0B">⏳ aguardando verificação em campo</span>'}</span>
        </div>`;
      if(v.realizadaEm){
        html+=`<div style="font-size:12px;margin:2px 0 6px 68px;padding:6px 8px;border-left:3px solid #22C55E;background:rgba(34,197,94,.06);white-space:pre-wrap"><b>Feedback do campo:</b> ${v.feedback?pdEsc(v.feedback):'<span style="color:var(--muted)">não registrado</span>'}</div>`;
        if(ed) html+=`<div style="margin-left:68px"><button type="button" class="btn btn-secondary btn-sm" onclick="pdCampoDesfazer()">Desfazer / corrigir</button></div>`;
      } else if(ed){
        html+=`<div style="margin:4px 0 0 68px"><label style="font-size:10px;color:var(--muted)">Feedback da verificação em campo (o que foi constatado) *</label>
          <textarea id="pdCampoFeedback" rows="2" style="width:100%;resize:vertical" placeholder="Ex.: confirmado que existe UC próxima ao limite da matrícula; ponto solicitado está dentro do terreno…"></textarea>
          <button type="button" class="btn btn-primary btn-sm" style="margin-top:4px" onclick="pdCampoRealizada()">Confirmar verificação realizada</button></div>`;
      }
    }
    html+='</div>';
  }
  body.innerHTML=html;
}

window.pdOrgaoAcao=async function(org,acao){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  const ol=pdClone(p.orgaosLiberacao||{}); const e=ol[org]; if(!e) return;
  const h=pdHojeStr();
  if(acao==='ciente'){ e.cienteEm=h; e.cientePor=me.nome; }
  if(acao==='liberado'){ e.liberadoEm=h; e.liberadoPor=me.nome; if(!e.cienteEm){ e.cienteEm=h; e.cientePor=me.nome; } }
  if(acao==='desfazer'){ e.liberadoEm=null; e.liberadoPor=null; }
  try{
    const np=await pdSave(p.id,{orgaosLiberacao:ol}, org+': '+(acao==='ciente'?'ciente registrado':acao==='liberado'?'liberação obtida':'liberação desfeita'));
    pdRenderAnaliseProjeto(); pdArRefreshFeedback(); pdRefreshLeve(np);
    if(acao==='liberado'&&medida34Ativa(np)) toast('Liberação registrada. Lembre-se de retirar a Medida 34 para o prazo voltar a correr.','warn');
  }catch(err){ console.error(err); toast('Erro ao registrar.','err'); }
};
window.pdCampoRealizada=async function(){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  const fb=(document.getElementById('pdCampoFeedback')?.value||'').trim();
  if(!fb){ toast('Descreva o que foi verificado em campo (feedback) antes de confirmar.','err'); return; }
  try{
    const np=await pdSave(p.id,{verificacaoCampo:{...(p.verificacaoCampo||{}),necessaria:true,realizadaEm:pdHojeStr(),realizadaPor:me.nome,feedback:fb}}, 'Verificação em campo realizada', fb);
    pdRenderAnaliseProjeto(); pdArRefreshFeedback(); pdRefreshLeve(np);
  }catch(err){ console.error(err); toast('Erro ao registrar.','err'); }
};
window.pdCampoDesfazer=async function(){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  if(!confirm('Desfazer a confirmação da verificação em campo? O feedback registrado será apagado.')) return;
  try{
    const np=await pdSave(p.id,{verificacaoCampo:{necessaria:true,realizadaEm:null,realizadaPor:null,feedback:''}}, 'Verificação em campo desfeita');
    pdRenderAnaliseProjeto(); pdArRefreshFeedback(); pdRefreshLeve(np);
  }catch(err){ console.error(err); toast('Erro ao registrar.','err'); }
};

window.pdApConcluir=async function(modo){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  const d=_apDraft; const h=pdHojeStr();
  if(modo==='reabrir'){
    try{
      const np=await pdSave(p.id,{validacaoGerenteOk:false,analiseProjeto:{...(p.analiseProjeto||{}),...d,concluidaEm:null}},'Análise de projeto reaberta');
      _apDraft=apMesclar(np.analiseProjeto); pdRenderAnaliseProjeto(); pdRefreshLeve(np);
    }catch(e){ console.error(e); toast('Erro ao reabrir.','err'); }
    return;
  }
  if(!d.orgaosNecessario){ toast('Responda se há necessidade de aprovação de órgão competente.','err'); return; }
  if(d.orgaosNecessario==='sim'&&!d.orgaos.length){ toast('Marque ao menos um órgão (IMA, DNIT ou DINFRA).','err'); return; }
  if(pedidoEhRural(p)&&!d.terceiros){ toast('Responda se é necessária autorização de passagem de terceiros.','err'); return; }
  if(!d.verificacaoCampo){ toast('Responda se é necessária verificação em campo.','err'); return; }
  if(!d.reprojeto){ toast('Responda se é necessário reprojetar.','err'); return; }
  if(d.reprojeto!=='sim'){
    if(!d.lv){ toast('Defina se a obra terá equipe de Linha Viva.','err'); return; }
    if(d.lv==='sim' && !d.lvOrcada){ toast('Informe se a Linha Viva foi orçada no projeto.','err'); return; }
    if(apLvContraria(d,_pdLvAtual||p.linhaVivaCalc) && !(d.lvJust||'').trim()){ toast('A definição de Linha Viva contraria a indicação do sistema — informe a justificativa.','err'); pdRenderAnaliseProjeto(); return; }
  }
  if(d.reprojeto==='sim'&&!(d.reprojetoTipo||'').trim()){ toast('Informe o problema que motivou o reprojeto.','err'); return; }
  try{
    let changes, ev, det='', msg;
    if(d.reprojeto==='sim'){
      changes={
        analiseProjeto:{...d,reprojetoTipo:d.reprojetoTipo.trim(),concluidaEm:null},
        validacaoGerenteOk:false, reprojetoPendente:true, dataRetornoProjetista:null,
        reprojetos:[...(p.reprojetos||[]),{data:h,tipo:d.reprojetoTipo.trim(),descricao:(d.reprojetoDescricao||'').trim(),projetista:p.projetista||'',por:me.nome}],
      };
      ev='Análise de projeto: REPROJETO solicitado'; det=d.reprojetoTipo.trim();
      msg='Pedido devolvido ao projetista para reprojeto.';
    } else {
      const ol={}; const antigo=p.orgaosLiberacao||{};
      if(d.orgaosNecessario==='sim') d.orgaos.forEach(o=>{ ol[o]=antigo[o]||{cienteEm:null,liberadoEm:null}; });
      Object.keys(antigo).forEach(o=>{ if(!ol[o]&&antigo[o].liberadoEm) ol[o]=antigo[o]; });
      const vc=d.verificacaoCampo==='sim'?{necessaria:true,realizadaEm:p.verificacaoCampo?.realizadaEm||null,realizadaPor:p.verificacaoCampo?.realizadaPor||null,feedback:p.verificacaoCampo?.feedback||''}:{necessaria:false};
      changes={analiseProjeto:{...d,concluidaEm:h,concluidaPor:me.nome},validacaoGerenteOk:true,orgaosLiberacao:ol,verificacaoCampo:vc};
      const partes=[]; if(d.orgaosNecessario==='sim') partes.push('Órgãos: '+d.orgaos.join(', ')); if(d.terceiros==='sim') partes.push('terceiros necessários'); if(d.verificacaoCampo==='sim') partes.push('verificação em campo'); partes.push('Linha Viva: '+(d.lv==='sim'?'SIM'+(d.lvOrcada==='sim'?' (orçada)':' (NÃO orçada)'):'não')+(d.lvJust?' — '+d.lvJust.trim():''));
      ev='Análise de projeto concluída'; det=partes.join(' · ');
      msg=d.orgaosNecessario==='sim'?'Análise concluída. ⚠️ Lance a Medida 34 e informe o cliente (necessita liberação de órgão).':'Análise de projeto concluída!';
    }
    const np=await pdSave(p.id,changes,ev,det);
    _apDraft=apMesclar(np.analiseProjeto); _apDirty=false;
    refreshChecklistSection(np); pdRenderAnaliseRural(); pdRenderAnaliseProjeto(); pdRefreshLeve(np);
    toast(msg, d.orgaosNecessario==='sim'&&d.reprojeto!=='sim'?'warn':'ok');
  }catch(e){ console.error(e); toast('Erro ao salvar a análise de projeto.','err'); }
};

// ══════════════════════════════════════════════════════
//  ENQUADRAMENTO · REANÁLISE · LINHA DO TEMPO
// ══════════════════════════════════════════════════════
function pdRenderEnquadramento(){
  const p=_pdAtual(); const body=document.getElementById('pdEnquadramentoBody'); if(!p||!body) return;
  const rural=pedidoEhRural(p), ed=pdEhGerente();
  const req=[
    ['Checklist documental concluído (ou dispensado)', checklistConcluidoOuDispensado(p)],
    ...(rural?[['Análise documental detalhada concluída',!!p.analiseDocumentalConcluida]]:[]),
    ...(terceirosNecessarios(p)?[['Conferência de autorização de terceiros concluída',!!p.terceirosConferido]]:[]),
    ['Projeto entregue pelo projetista',!!p.dataRetornoProjetista&&!p.reprojetoPendente],
    ['Análise de projeto concluída pelo Gerente',!!p.validacaoGerenteOk],
  ];
  const ok=req.every(r=>r[1]);
  let html=req.map(r=>`<div style="font-size:12px;color:${r[1]?'#22C55E':'var(--muted)'}">${r[1]?'✅':'⬜'} ${r[0]}</div>`).join('');
  if(rural) html+=`<div style="font-size:12px;margin-top:4px">Classificação: <b>${p.classificacaoPonto?pdEsc(p.classificacaoPonto)+' (definida pelo Adm_ODI na análise documental)':'— ainda não definida pelo Adm_ODI —'}</b></div>`;
  if(p.dataEnquadramento){
    const i=prazoInfo(p);
    html+=`<div style="margin-top:10px;padding:10px;border-radius:8px;border:1px solid ${i.dentro?'rgba(34,197,94,.4)':'rgba(239,68,68,.4)'}">
      <b>Enquadramento realizado em ${fmtTxt(p.dataEnquadramento)}</b>${p.enquadradoPor?' por '+pdEsc(p.enquadradoPor):''}${p.enquadramentoPonto?' · '+pdEsc(p.enquadramentoPonto):''}<br>
      <span style="color:${pdCorPrazo(i)};font-weight:700">${i.dentro?'✅ Dentro do prazo':'⚠️ Fora do prazo ('+i.atraso+' d)'}</span> <span style="color:var(--muted);font-size:11px">· data limite ${fmtTxt(i.limite)} · contador do prazo encerrado</span>
      ${ed?`<div style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" onclick="pdDesfazerEnquadramento()">Desfazer enquadramento</button></div>`:''}</div>`;
  } else {
    html+=`<div style="margin-top:10px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div class="fg" style="margin:0"><label>Data do enquadramento</label><input type="date" id="pdDataEnquadramento" value="${pdHojeStr()}" ${(!ed||!ok)?'disabled':''}></div>
      ${ed?`<button type="button" class="btn btn-primary btn-sm" ${ok?'':'disabled'} onclick="pdRegistrarEnquadramento()">Registrar enquadramento</button>`:'<span style="font-size:11px;color:var(--muted)">Somente o Gerente registra o enquadramento.</span>'}
      ${(!ok&&ed)?'<span style="font-size:11px;color:var(--muted)">Disponível quando todas as etapas acima estiverem concluídas.</span>':''}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">Ao registrar, o contador do prazo para de correr e o pedido passa para "Orçamento encaminhado".</div>`;
  }
  body.innerHTML=html;
}
window.pdRegistrarEnquadramento=async function(){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  const data=document.getElementById('pdDataEnquadramento').value;
  if(!data){ toast('Informe a data do enquadramento.','err'); return; }
  if(pedidoEhRural(p)&&!p.classificacaoPonto){ toast('O Adm_ODI ainda não definiu 1º/2º ponto (Desenho da matrícula).','err'); return; }
  try{
    const np=await pdSave(p.id,{dataEnquadramento:data,enquadradoPor:me.nome,enquadramentoPonto:pedidoEhRural(p)?p.classificacaoPonto:null},'Enquadramento realizado','Data '+fmtTxt(data)+(p.classificacaoPonto&&pedidoEhRural(p)?' · '+p.classificacaoPonto:''));
    toast('Enquadramento registrado — prazo encerrado.');
    pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao registrar enquadramento.','err'); }
};
window.pdDesfazerEnquadramento=async function(){
  const p=_pdAtual(); if(!p||!pdEhGerente()) return;
  if(!confirm('Desfazer o enquadramento? O contador do prazo volta a correr.')) return;
  try{ const np=await pdSave(p.id,{dataEnquadramento:null,enquadradoPor:null,enquadramentoPonto:null},'Enquadramento desfeito'); pdRefreshLeve(np); }
  catch(e){ console.error(e); toast('Erro ao desfazer.','err'); }
};

function pdRenderReanalise(){
  const p=_pdAtual(); const body=document.getElementById('pdReanaliseBody'); if(!p||!body) return;
  const lista=p.reanalises||[]; const aberta=reanaliseAberta(p);
  let html=lista.length?`<div style="margin-bottom:8px">`+lista.map(r=>`<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">
      <b>#${r.n}</b> · aberta em ${fmtTxt(r.abertaEm)} por ${pdEsc(r.abertaPor)} · prazo ${fmtTxt(reanalisePrazo(r))} — <i>${pdEsc(r.motivo)}</i><br>
      ${r.concluidaEm?`<span style="color:#22C55E">✅ concluída em ${fmtTxt(r.concluidaEm)} por ${pdEsc(r.concluidaPor||'')}${r.resultado?' — '+pdEsc(r.resultado):''}</span>`:'<span style="color:#3B82F6;font-weight:700">🔄 em andamento</span>'}</div>`).join('')+`</div>`:'';
  const podeConcluir=arPodeEditar();
  if(aberta){
    html+=`<div class="fg"><label>Resultado da reanálise (o que foi resolvido / o que continua pendente)</label><textarea id="pdReanaliseResultado" rows="2" style="width:100%;resize:vertical" ${podeConcluir?'':'disabled'}></textarea></div>
      ${podeConcluir?`<button type="button" class="btn btn-primary btn-sm" onclick="pdConcluirReanalise()">Concluir reanálise</button>`:'<span style="font-size:11px;color:var(--muted)">A reanálise é concluída por Adm_ODI, Estagiário ou Gerente.</span>'}
      <div style="font-size:10px;color:var(--muted);margin-top:6px">Confira de novo o checklist${pedidoEhRural(p)?' e a análise documental detalhada':''} acima e conclua aqui quando terminar.</div>`;
  } else if(podeAbrirReanalise(p)){
    html+=`<div class="fg"><label>Motivo (qual documento/informação chegou ou o que precisa ser reconferido)</label><textarea id="pdReanaliseMotivo" rows="2" style="width:100%;resize:vertical"></textarea></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="pdAbrirReanalise()">🔄 Enviar para reanálise documental</button>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">Entra na fila geral de reanálise e ganha um novo prazo de ${pedidosParams.prazoReanaliseDias} dias.</div>`;
  } else {
    html+=`<div style="font-size:12px;color:var(--muted)">Disponível depois que a 1ª análise documental estiver consolidada (checklist concluído${pedidoEhRural(p)?' ou análise documental concluída':''}).</div>`;
  }
  body.innerHTML=html;
}
window.pdAbrirReanalise=async function(){
  const p=_pdAtual(); if(!p) return;
  const motivo=(document.getElementById('pdReanaliseMotivo').value||'').trim();
  if(!motivo){ toast('Informe o motivo da reanálise.','err'); return; }
  const n=(p.reanalises||[]).length+1;
  const r={n,abertaEm:pdHojeStr(),abertaPor:me.nome,motivo,prazoDias:pedidosParams.prazoReanaliseDias,concluidaEm:null};
  try{
    const np=await pdSave(p.id,{reanalises:[...(p.reanalises||[]),r]},'Reanálise #'+n+' aberta',motivo);
    toast('Pedido enviado para reanálise — prazo até '+fmtTxt(reanalisePrazo(r))+'.');
    pdRenderReanalise(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao abrir reanálise.','err'); }
};
window.pdConcluirReanalise=async function(){
  const p=_pdAtual(); if(!p) return; const a=reanaliseAberta(p); if(!a) return;
  const resultado=(document.getElementById('pdReanaliseResultado').value||'').trim();
  const lista=(p.reanalises||[]).map(r=>r.n===a.n?{...r,concluidaEm:pdHojeStr(),concluidaPor:me.nome,resultado}:r);
  try{
    const np=await pdSave(p.id,{reanalises:lista},'Reanálise #'+a.n+' concluída',resultado);
    toast('Reanálise concluída.'); pdRenderReanalise(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao concluir reanálise.','err'); }
};

function pdRenderTimeline(){
  const p=_pdAtual(); const body=document.getElementById('pdTimelineBody'); if(!p||!body) return;
  const tl=[...(p.timeline||[])].sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
  body.innerHTML=tl.length?tl.map(e=>{ const d=new Date(e.ts);
    const dt=isNaN(d)?'':d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return `<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--muted);min-width:110px">${dt}</span>
      <span style="flex:1"><b>${pdEsc(e.evento)}</b>${e.detalhe?' <span style="color:var(--muted)">— '+pdEsc(e.detalhe)+'</span>':''}</span>
      <span style="color:var(--muted)">${pdEsc(e.usuario||'')}${e.perfil?' ('+pdEsc(pdPerfilLabel(e.perfil))+')':''}</span></div>`; }).join('')
    :'<div style="font-size:11px;color:var(--muted)">Sem eventos registrados ainda.</div>';
}

// Atualização leve: não mexe nos formulários com rascunho (matrícula/projeto)
function pdRefreshLeve(p){
  if(!p) return;
  pdRenderSituacao(p);
  if(p.acaoAnalista==='Enviado para Projeto'){ pdRenderEnquadramento(); pdRenderReanalise(); pdRenderPagamento(); if(!_paDirty){ _paDraft=paMesclar(p.preAnalise); pdRenderPreAnalise(); } }
  pdRenderTimeline();
}
function pdRenderSecoes(p){
  const enviado=!!p && p.acaoAnalista==='Enviado para Projeto';
  const show=(id,v)=>{ const e=document.getElementById(id); if(e) e.style.display=v?'':'none'; };
  show('pdSecAnaliseRural', enviado&&pedidoEhRural(p));
  show('pdSecAnaliseProjeto', enviado);
  show('pdSecPreAnalise', enviado);
  show('pdSecPagamento', enviado);
  show('pdSecEnquadramento', enviado);
  show('pdSecReanalise', enviado);
  show('pdSecTimeline', !!p);
  pdRenderSituacao(p);
  if(!p) return;
  if(enviado){
    if(pedidoEhRural(p)){ _arDraft=arMesclar(p.analiseRural); _arDirty=false; pdRenderAnaliseRural(); }
    _apDraft=apMesclar(p.analiseProjeto); _apDirty=false; pdRenderAnaliseProjeto();
    _paDraft=paMesclar(p.preAnalise); _paDirty=false; pdRenderPreAnalise();
    pdRenderEnquadramento(); pdRenderPagamento(); pdRenderReanalise();
  }
  pdRenderTimeline();
}

// ══════════════════════════════════════════════════════
//  ABRIR / FECHAR / SALVAR / EXCLUIR
// ══════════════════════════════════════════════════════
window.openPedidoModal=function(id){
  const isEdit=!!id;
  document.getElementById('pedidoId').value=id||'';
  document.getElementById('pedidoModalTit').textContent=isEdit?'Pedido':'Novo Pedido';
  // O modal de OBRA esconde todas as ".modal-section" da página ao abrir (inclusive as deste modal).
  // Reexibe aqui as seções fixas do pedido (identificação e ação do analista).
  document.querySelectorAll('#ovPedido .modal-section:not([id])').forEach(el=>{ el.style.display=''; });
  ['pdNota','pdTipoSolicitacao','pdDataAbertura','pdMunicipio','pdAcaoAnalista','pdProjetista','pdDataEncaminhamento','pdMotivoCancelamento','pdEquipRef','pdEscopoProjeto'].forEach(i=>{ document.getElementById(i).value=''; });
  document.getElementById('pdFlagOrgaoPublico').checked=false;
  const medidaSec=document.getElementById('pedidoMedida34Wrap');
  const checklistSec=document.getElementById('pedidoChecklistWrap');
  let p=null;
  if(isEdit){
    p=pedidos.find(x=>x.id===id);
    if(p){
      document.getElementById('pdNota').value=p.nota||'';
      document.getElementById('pdTipoSolicitacao').value=p.tipoSolicitacao||'';
      document.getElementById('pdDataAbertura').value=p.dataAberturaPedido||'';
      document.getElementById('pdMunicipio').value=p.municipio||'';
      document.getElementById('pdFlagOrgaoPublico').checked=!!p.flagOrgaoPublico;
      document.getElementById('pdAcaoAnalista').value=p.acaoAnalista||'';
      document.getElementById('pdProjetista').value=p.projetista||'';
      document.getElementById('pdDataEncaminhamento').value=p.dataEncaminhamentoProjetista||'';
      document.getElementById('pdMotivoCancelamento').value=p.motivoCancelamento||'';
      document.getElementById('pdEquipRef').value=p.equipamentoRef||'';
      document.getElementById('pdEscopoProjeto').value=p.escopoProjeto||'';
    }
    medidaSec.style.display='block';
  } else { medidaSec.style.display='none'; }
  if(isEdit && p && p.acaoAnalista==='Enviado para Projeto'){
    checklistSec.style.display='block';
    const editavel=podeEditarChecklist();
    document.getElementById('pdDataRetornoProjetista').value=p.dataRetornoProjetista||'';
    document.getElementById('pdChecklistFeedback').value=p.checklistFeedback||'';
    document.getElementById('pdChecklistFeedback').disabled=!editavel;
    document.getElementById('pdDataRetornoProjetista').disabled=!editavel;
    const latLongWrap=document.getElementById('fgLatLong');
    if(pedidoEhRural(p)){
      latLongWrap.style.display='flex';
      document.getElementById('pdLatitude').value=p.latitude||'';
      document.getElementById('pdLongitude').value=p.longitude||'';
      document.getElementById('pdLatitude').disabled=!editavel;
      document.getElementById('pdLongitude').disabled=!editavel;
    } else { latLongWrap.style.display='none'; }
    document.getElementById('btnConcluirChecklist').style.display=editavel?'inline-flex':'none';
    document.getElementById('btnSalvarChecklist').style.display=editavel?'inline-flex':'none';
    refreshChecklistSection(p);
  } else { checklistSec.style.display='none'; }
  { const _ob=document.getElementById('pdOportBox'); if(_ob){ _ob.innerHTML=''; _ob.style.display='none'; } document.querySelectorAll('#ovPedido .pdLvSlot').forEach(x=>{ x.innerHTML=''; }); _pdLvAtual=null; }
  onTipoSolicitacaoChange(); onAcaoAnalistaChange(); renderMedida34Status(p);
  pdRenderSecoes(p);
  pdMelhAplicarPendente();
  pdPlanAtualizar(true);
  const podeEditar=podeGerenciarPedidos();
  document.querySelectorAll('#ovPedido input, #ovPedido select').forEach(el=>{
    if(el.closest('#pedidoChecklistWrap, .pd-own-perm')) return;   // seções com permissão própria
    el.disabled=!podeEditar;
  });
  document.getElementById('pdEscopoProjeto').disabled=!podeEditar;
  document.getElementById('btnSalvarPedido').style.display=podeEditar?'inline-flex':'none';
  document.getElementById('btnExcluirPedido').style.display=(isEdit&&podeEditar)?'inline-flex':'none';
  // abre por padrão a seção do perfil de quem entrou
  const abre=(id,v)=>{ const e=document.getElementById(id); if(e) e.open=!!v; };
  abre('pdSecAnaliseRural', ['adm_odi','estagiario'].includes(me.perfil));
  abre('pdSecAnaliseProjeto', me.perfil==='gerente');
  abre('pdSecPreAnalise', me.perfil==='estagiario');
  abre('pdSecPagamento', me.perfil==='analista');
  abre('pdSecEnquadramento', me.perfil==='gerente');
  abre('pdSecReanalise', false); abre('pdSecTimeline', false);
  document.getElementById('ovPedido').classList.add('open');
};
window.closePedidoModal=function(force){
  if(force!==true && _pdMelhPend && !document.getElementById('pedidoId').value) _pdMelhPend=null;   // desistiu do pedido de melhoria
  if(force!==true && (_arDirty||_apDirty||_paDirty) && !confirm('Há alterações não salvas na análise. Fechar mesmo assim?')) return;
  _arDirty=false; _apDirty=false; _paDirty=false;
  document.getElementById('ovPedido').classList.remove('open');
};
window.deletePedido=async function(){
  const id=document.getElementById('pedidoId').value; if(!id) return;
  const p=pedidos.find(x=>x.id===id);
  if(!confirm(`Excluir o pedido ${p?.nota||''}? Essa ação não pode ser desfeita.`)) return;
  try{ await deleteDoc(doc(db,'pedidos',id)); toast('Pedido excluído.'); closePedidoModal(true); }
  catch(e){ console.error(e); toast('Erro ao excluir pedido.','err'); }
};

window.savePedido=async function(){
  const btn=document.getElementById('btnSalvarPedido');
  btn.disabled=true; btn.textContent='Salvando…';
  try{
    await loadPedidosConfig();
    const id=document.getElementById('pedidoId').value;
    const nota=document.getElementById('pdNota').value.trim();
    const tipoSolicitacao=document.getElementById('pdTipoSolicitacao').value;
    const dataAberturaPedido=document.getElementById('pdDataAbertura').value;
    const municipio=document.getElementById('pdMunicipio').value;
    const flagOrgaoPublico=document.getElementById('pdFlagOrgaoPublico').checked;
    const acaoAnalista=document.getElementById('pdAcaoAnalista').value;
    if(!nota||!tipoSolicitacao||!dataAberturaPedido||!municipio){ toast('Preencha todos os campos obrigatórios.','err'); return; }
    if(acaoAnalista==='Cancelado' && !document.getElementById('pdMotivoCancelamento').value.trim()){ toast('Informe o motivo do cancelamento.','err'); return; }
    if(acaoAnalista==='Enviado para Projeto' && (!document.getElementById('pdProjetista').value||!document.getElementById('pdDataEncaminhamento').value)){
      toast('Informe o projetista e a data de encaminhamento.','err'); return;
    }
    const equipRef=parseInt(document.getElementById('pdEquipRef').value,10)||null;
    if(acaoAnalista==='Enviado para Projeto' && !equipRef){ toast('Informe o Equipamento de Referência (obrigatório ao enviar para projeto).','err'); return; }
    const escopoProjeto=(document.getElementById('pdEscopoProjeto').value||'').trim();
    if(acaoAnalista==='Enviado para Projeto' && !escopoProjeto){ toast('Descreva o escopo do projeto (o que deve ser projetado).','err'); return; }
    const cfg=TIPOS_SOLICITACAO[tipoSolicitacao];
    const existente=id?(pedidos.find(x=>x.id===id)||{}):{};
    const dados={
      nota, tipoSolicitacao, tipoPedido:cfg?cfg.tipoPedido:'', dataAberturaPedido, municipio, flagOrgaoPublico, acaoAnalista,
      projetista: acaoAnalista==='Enviado para Projeto'?document.getElementById('pdProjetista').value:null,
      dataEncaminhamentoProjetista: acaoAnalista==='Enviado para Projeto'?document.getElementById('pdDataEncaminhamento').value:null,
      motivoCancelamento: acaoAnalista==='Cancelado'?document.getElementById('pdMotivoCancelamento').value.trim():null,
    };
    // data em que o analista definiu a ação (base do indicador dos 15 dias)
    if((existente.acaoAnalista||'')!==acaoAnalista) dados.dataAcaoAnalista=acaoAnalista?pdHojeStr():null;
    // equipamento de referência + coordenada (para estimar a distância percorrida pelo projetista)
    if(acaoAnalista==='Enviado para Projeto'){
      dados.escopoProjeto=escopoProjeto;
      dados.equipamentoRef=equipRef;
      // fotografia do cálculo de Linha Viva (fica no pedido mesmo se a base de planejamento mudar depois)
      try{ if(await pdBasePlanejamento()){ const _c=pdCalcLV(equipRef); if(_c){ dados.linhaVivaCalc={..._c,calculadoEm:pdHojeStr()}; dados.linhaVivaObs=pdLvTexto(_c); } } }catch(e){ console.warn('[Pedidos] LV:',e); }
      if(equipRef!==(existente.equipamentoRef||null) || existente.equipLat==null){
        const loc=await pdLocalizarEquip(equipRef);
        dados.equipLat=loc?loc.lat:null; dados.equipLon=loc?loc.lon:null;
        if(!loc) toast('Equipamento '+equipRef+' não localizado no Mapa da Rede — a distância do projetista não será estimada até ser localizado.','warn');
      }
    }
    // checklist: gerado quando o pedido é enviado a projeto (na criação ou depois, ao editar)
    if(acaoAnalista==='Enviado para Projeto'){
      const lista=existente.checklistDocumental||[];
      const mudouBase=id && (existente.tipoSolicitacao!==tipoSolicitacao || !!existente.flagOrgaoPublico!==flagOrgaoPublico);
      if(!id || !lista.length || (mudouBase && !lista.some(i=>i.status==='entregue'))){
        dados.checklistDocumental=buildChecklistFromTemplate(tipoSolicitacao, flagOrgaoPublico);
      }
    }
    if(id){
      const ev=[];
      if((existente.acaoAnalista||'')!==acaoAnalista) ev.push('Ação do analista: '+(acaoAnalista||'—'));
      if(acaoAnalista==='Enviado para Projeto' && (existente.escopoProjeto||'')!==escopoProjeto) ev.push((existente.escopoProjeto?'Escopo do projeto alterado: ':'Escopo do projeto: ')+escopoProjeto);
      if(acaoAnalista==='Enviado para Projeto' && (existente.projetista!==dados.projetista||existente.dataEncaminhamentoProjetista!==dados.dataEncaminhamentoProjetista))
        ev.push('Encaminhado ao projetista '+dados.projetista+' em '+fmtTxt(dados.dataEncaminhamentoProjetista));
      if(acaoAnalista==='Cancelado' && existente.motivoCancelamento!==dados.motivoCancelamento) ev.push('Motivo do cancelamento: '+dados.motivoCancelamento);
      const np=await pdSave(id,dados,ev.length?ev.join(' · '):'Dados do pedido atualizados');
      toast('Pedido atualizado!');
      // reabre o modal já com as seções liberadas (ex.: acabou de ser enviado para projeto)
      if(acaoAnalista==='Enviado para Projeto' && !existente.dataEncaminhamentoProjetista){ window.openPedidoModal(id); return; }
      pdRenderSecoes(np);
    } else {
      const novo={...dados, status:'', criadaEm:serverTimestamp(), criadaPor:me.nome,
        medida34Analista:[], medida34Gerente:[], checklistDocumental:dados.checklistDocumental||[], checklistConcluido:false,
        reanalises:[], reprojetos:[], escopoProjeto:dados.escopoProjeto||'', equipamentoRef:dados.equipamentoRef||null, equipLat:dados.equipLat??null, equipLon:dados.equipLon??null,
        dataAcaoAnalista:acaoAnalista?pdHojeStr():null,
        timeline:[{ts:new Date().toISOString(),usuario:me.nome||'',perfil:me.perfil||'',evento:'Pedido criado no sistema',detalhe:'Abertura em '+fmtTxt(dataAberturaPedido)+(acaoAnalista?' · Ação: '+acaoAnalista:'')}]};
      const _pendM=_pdMelhPend;
      if(dados.linhaVivaCalc){ novo.linhaVivaCalc=dados.linhaVivaCalc; novo.linhaVivaObs=dados.linhaVivaObs||''; }
      if(_pendM){ novo.pedidoOrigem=_pendM.origem; novo.oportunidadesPlanejamento=_pendM.itens.map(i=>i.key); novo.oportunidadesInfo=_pendM.itens.map(i=>({key:i.key,tipo:i.tipo,titulo:i.titulo,det:i.det||''}));
        novo.timeline[0].detalhe+=' · Pedido de melhoria vinculado ao pedido '+_pendM.origem.nota; }
      novo.status=computeStatusPedido(novo);
      const _ref=await addDoc(collection(db,'pedidos'), novo);
      if(_pendM){ _pdMelhPend=null; try{ await pdMelhConcluirVinculo(_pendM,_ref.id,nota); toast('Pedido de melhoria '+nota+' criado e vinculado ao pedido '+_pendM.origem.nota+'.'); }catch(e){ console.error(e); toast('Pedido criado, mas houve erro ao vincular: '+e.message,'err'); } }
      else toast('Pedido criado!');
      closePedidoModal(true);
    }
  }catch(e){
    console.error(e); toast('Erro ao salvar pedido.','err');
  } finally { btn.disabled=false; btn.textContent='Salvar'; }
};

// ══════════════════════════════════════════════════════
//  EQUIPAMENTO DE REFERÊNCIA — obras/pedidos na mesma chave · localização
// ══════════════════════════════════════════════════════
function pdChaveNorm(nr){ const n=parseInt(nr,10); return isNaN(n)?'':String(n); }
function pdObrasMesmaChave(nr){
  const k=pdChaveNorm(nr); if(!k) return [];
  return (obras||[]).filter(o=>pdChaveNorm(o.equipamentoRef)===k && !o.cancelado && !o.armazenado && !o.conclusao);
}
function pdPedidosMesmaChave(nr,idAtual){
  const k=pdChaveNorm(nr); if(!k) return [];
  return pedidos.filter(x=>x.id!==idAtual && pdChaveNorm(x.equipamentoRef)===k && x.acaoAnalista==='Enviado para Projeto' && !x.dataEnquadramento);
}
function pdEquipAvisoHtml(nr,idAtual){
  const obs=pdObrasMesmaChave(nr), pds=pdPedidosMesmaChave(nr,idAtual);
  if(!obs.length && !pds.length) return '';
  let h=`<div style="padding:8px 10px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);border-radius:8px;font-size:12px">`;
  if(obs.length){
    h+=`<div style="font-weight:800;color:#F59E0B">🔗 Existe(m) ${obs.length} obra(s) em andamento nesta chave de referência (${pdEsc(pdChaveNorm(nr))})</div>
      <div style="font-size:11px;margin:2px 0 4px">Verifique se a obra já atende a necessidade do cliente solicitante antes de seguir com o projeto.</div>`
      +obs.slice(0,6).map(o=>{ let st=''; try{ st=statusOf(o); }catch(e){}
        return `<div style="font-size:11px">• Obra <b>${pdEsc(o.numero||'—')}</b> · ${pdEsc(o.tipo||'')} · ${pdEsc(o.cidade||'')} · ${pdEsc(st||'')}${o.descricao?' · '+pdEsc(o.descricao):''}</div>`; }).join('')
      +(obs.length>6?`<div style="font-size:10px;color:var(--muted)">+${obs.length-6} obra(s)</div>`:'');
  }
  if(pds.length){
    h+=`<div style="font-weight:700;margin-top:${obs.length?6:0}px">📋 Outros pedidos em andamento na mesma chave: ${pds.slice(0,8).map(x=>pdEsc(x.nota||'—')).join(', ')}</div>`;
  }
  return h+'</div>';
}
window.pdEquipAvisoRender=function(){
  const el=document.getElementById('pdEquipAviso'); if(!el) return;
  const acao=document.getElementById('pdAcaoAnalista')?.value;
  const nr=document.getElementById('pdEquipRef')?.value;
  const html=(acao==='Enviado para Projeto' && nr)?pdEquipAvisoHtml(nr, document.getElementById('pedidoId')?.value||''):'';
  el.innerHTML=html; el.style.display=html?'block':'none';
  pdPlanAtualizar(false);   // Linha Viva + oportunidades de melhoria (com pequeno atraso enquanto digita)
};
async function pdLocalizarEquip(nr){
  try{
    await _mapaCarregarRedes();
    const l=_mapaLocalizar(nr);
    if(l && !l.erro && l.lat!=null && l.lon!=null) return {lat:l.lat, lon:l.lon};
  }catch(e){ console.warn('[Pedidos] localizar equipamento:',e); }
  return null;
}

// ══════════════════════════════════════════════════════
//  ETAPAS DO PEDIDO (barra 1→5 no topo)
// ══════════════════════════════════════════════════════
function pdEtapas(p){
  const enviado=p.acaoAnalista==='Enviado para Projeto';
  const e1=analistaDecidiu(p);
  if(!enviado) return [{n:1,t:'Abertura e ação',dono:'Analista',ok:e1}];
  const e2=checklistConcluidoOuDispensado(p)&&analiseDocumentalOk(p);
  const e3=!!p.validacaoGerenteOk;
  const e4=!!p.dataEnquadramento;
  const e5=!!(p.pagamentoProjeto&&p.pagamentoProjeto.pagoEm)&&pagamentosPendentes(p).length===0;
  return [
    {n:1,t:'Abertura e ação',dono:'Analista',ok:e1},
    {n:2,t:'Documentos',dono:pedidoEhRural(p)?'Estagiário / Adm_ODI':'Estagiário',ok:e2,ativo:e1&&!e2},
    {n:3,t:'Projeto',dono:'Projetista → Estagiário → Gerente',ok:e3,ativo:e1&&!e3},
    {n:4,t:'Enquadramento',dono:'Gerente',ok:e4,ativo:e2&&e3&&!e4},
    {n:5,t:'Pagamento do projeto',dono:'Analista',ok:e5,ativo:e3&&!e5},
  ];
}
function pdEtapasHtml(p){
  const et=pdEtapas(p);
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">`+et.map(e=>{
    const cor=e.ok?'#22C55E':((e.ativo||(!e.ok&&e.n===1))?'#F59E0B':'var(--muted)');
    return `<div style="flex:1;min-width:120px;padding:6px 8px;border-radius:8px;border:1px solid ${e.ok?'rgba(34,197,94,.45)':((e.ativo||e.n===1)?'rgba(245,158,11,.45)':'var(--border)')};background:${e.ok?'rgba(34,197,94,.07)':'transparent'}">
      <div style="font-size:11px;font-weight:800;color:${cor}">${e.ok?'✅':((e.ativo||e.n===1)?'●':'○')} ${e.n} · ${e.t}</div>
      <div style="font-size:9px;color:var(--muted)">${e.dono}</div></div>`; }).join('')+`</div>`;
}

// ══════════════════════════════════════════════════════
//  ③ PRÉ-ANÁLISE DO ESTAGIÁRIO (materiais orçados + km de rede)
// ══════════════════════════════════════════════════════
let _paDraft=paVazio(), _paDirty=false;
function paVazio(){ return {materiaisOk:'',materiaisErrados:[''],kmProjBT:'',kmProjMT:'',kmRetBT:'',kmRetMT:'',obs:''}; }
function paMesclar(s){ const b=Object.assign(paVazio(),s||{}); b.materiaisErrados=Array.isArray(b.materiaisErrados)&&b.materiaisErrados.length?[...b.materiaisErrados]:['']; return b; }
function paPodeEditar(){ return !!me && ['estagiario','gerente'].includes(me.perfil); }
window.pdPaSet=function(k,v,rerender){ _paDraft[k]=v; _paDirty=true; if(rerender) pdRenderPreAnalise(); };
window.pdPaMatSet=function(i,v){ _paDraft.materiaisErrados[i]=v; _paDirty=true; };
window.pdPaMatAdd=function(){ _paDraft.materiaisErrados.push(''); _paDirty=true; pdRenderPreAnalise(); };
window.pdPaMatDel=function(i){ const l=_paDraft.materiaisErrados; l.splice(i,1); if(!l.length) l.push(''); _paDirty=true; pdRenderPreAnalise(); };
function pdMateriaisErradosConhecidos(){
  const set=new Set(); pedidos.forEach(p=>((p.preAnalise&&p.preAnalise.materiaisErrados)||[]).forEach(m=>{ if(m) set.add(m); })); return [...set].sort();
}
function pdRenderPreAnalise(){
  const p=_pdAtual(); const body=document.getElementById('pdPreAnaliseBody'); if(!p||!body) return;
  if(!p.dataRetornoProjetista && !preAnaliseFeita(p) && !p.reprojetoPendente){
    body.innerHTML='<div style="padding:10px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted)">Libera quando o projetista devolver o projeto (registre a data de retorno na seção ② Documentos).</div>'; return;
  }
  const ro=!paPodeEditar(); const d=_paDraft; const feita=preAnaliseFeita(p);
  const km=(k,l)=>`<div class="fg"><label>${l}</label><input type="text" inputmode="decimal" value="${pdEsc(d[k])}" ${ro?'disabled':''} placeholder="0,000" oninput="pdPaSet('${k}',this.value,false)" style="width:100%"></div>`;
  body.innerHTML=pdEscopoHtml(p)+`<div class="pdLvSlot" data-ctx="estagiario" style="margin-bottom:10px">${pdLvHtml(_pdLvAtual||p.linhaVivaCalc||null,'estagiario')}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Não bloqueia a análise do Gerente. Em caso de reprojeto não precisa ser refeita (pode ser corrigida se os km mudarem). Os km servem para o Analista conferir o pagamento do projeto.</div>
    <div class="fg-grid">
      <div class="fg"><label>Os materiais estão orçados de maneira correta?</label>
        <select ${ro?'disabled':''} onchange="pdPaSet('materiaisOk',this.value,true)" style="width:100%"><option value="" ${d.materiaisOk===''?'selected':''}>—</option><option value="sim" ${d.materiaisOk==='sim'?'selected':''}>Sim</option><option value="nao" ${d.materiaisOk==='nao'?'selected':''}>Não</option></select></div>
      <div class="fg"><label>Projetista</label><div style="padding:7px 0;font-weight:700">${pdEsc(p.projetista||'—')}</div></div>
      ${d.materiaisOk==='nao'?`<div class="fg" style="grid-column:1/-1"><label>Material(is) com código errado (pontua para o projetista)</label>
        ${d.materiaisErrados.map((v,i)=>`<div style="display:flex;gap:6px;margin-bottom:4px"><input type="text" list="dlMatErrados" value="${pdEsc(v)}" ${ro?'disabled':''} placeholder="Código / descrição do material ${i+1}" oninput="pdPaMatSet(${i},this.value)" style="flex:1">${ro?'':`<button type="button" class="btn btn-danger btn-sm" onclick="pdPaMatDel(${i})">🗑️</button>`}</div>`).join('')}
        <datalist id="dlMatErrados">${pdMateriaisErradosConhecidos().map(x=>`<option value="${pdEsc(x)}">`).join('')}</datalist>
        ${ro?'':'<button type="button" class="btn btn-secondary btn-sm" onclick="pdPaMatAdd()">+ Adicionar material</button>'}</div>`:''}
      ${km('kmProjMT','Rede PROJETADA — km de MT')}${km('kmProjBT','Rede PROJETADA — km de BT')}
      ${km('kmRetMT','Rede RETIRADA — km de MT')}${km('kmRetBT','Rede RETIRADA — km de BT')}
      <div class="fg" style="grid-column:1/-1"><label>Observações (opcional)</label><input type="text" value="${pdEsc(d.obs)}" ${ro?'disabled':''} oninput="pdPaSet('obs',this.value,false)" style="width:100%"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px">
      <span>${feita?`<span style="color:#22C55E;font-weight:700">✅ Pré-análise concluída em ${fmtTxt(p.preAnalise.concluidaEm)}${p.preAnalise.concluidaPor?' por '+pdEsc(p.preAnalise.concluidaPor):''}</span>`:'<span style="color:#F59E0B">⏳ Pré-análise pendente</span>'}</span>
      ${ro?'<span style="font-size:11px;color:var(--muted)">Preenchida pelo Estagiário (ou Gerente).</span>':`<div style="display:flex;gap:6px"><button type="button" class="btn btn-secondary btn-sm" onclick="pdPaSalvar('rascunho')">💾 Salvar</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="pdPaSalvar('${feita?'reabrir':'concluir'}')">${feita?'Reabrir pré-análise':'Concluir pré-análise'}</button></div>`}
    </div>`;
}
window.pdPaSalvar=async function(modo){
  const p=_pdAtual(); if(!p) return;
  if(!paPodeEditar()){ toast('Sem permissão para editar a pré-análise.','err'); return; }
  const d={..._paDraft}; d.materiaisErrados=(d.materiaisErrados||[]).map(x=>String(x).trim()).filter(Boolean);
  if(d.materiaisOk!=='nao') d.materiaisErrados=[];
  const ant=p.preAnalise||{};
  const dados={...d, concluidaEm:ant.concluidaEm||null, concluidaPor:ant.concluidaPor||null, projetista:ant.projetista||p.projetista||''};
  let ev='Pré-análise do projeto salva', det='';
  if(modo==='concluir'){
    if(!d.materiaisOk){ toast('Responda se os materiais estão orçados corretamente.','err'); return; }
    if(d.materiaisOk==='nao' && !d.materiaisErrados.length){ toast('Informe ao menos um material com código errado.','err'); return; }
    for(const [k,l] of [['kmProjMT','km de MT projetado'],['kmProjBT','km de BT projetado'],['kmRetMT','km de MT retirado'],['kmRetBT','km de BT retirado']]){
      const n=pdNumKm(d[k]); if(n===null||n<0){ toast('Informe o '+l+' (use 0 se não houver).','err'); return; }
    }
    dados.concluidaEm=pdHojeStr(); dados.concluidaPor=me.nome; dados.projetista=p.projetista||'';
    ev='Pré-análise do projeto concluída';
    det='Projetado: MT '+d.kmProjMT+' km · BT '+d.kmProjBT+' km | Retirado: MT '+d.kmRetMT+' km · BT '+d.kmRetBT+' km'+(d.materiaisOk==='nao'?' | Materiais com erro: '+d.materiaisErrados.join(', '):'');
  } else if(modo==='reabrir'){ dados.concluidaEm=null; dados.concluidaPor=null; ev='Pré-análise do projeto reaberta'; }
  try{
    const np=await pdSave(p.id,{preAnalise:dados},ev,det);
    _paDraft=paMesclar(np.preAnalise); _paDirty=false;
    pdRenderPreAnalise(); pdRefreshLeve(np);
    toast(modo==='concluir'?'Pré-análise concluída!':(modo==='reabrir'?'Pré-análise reaberta.':'Pré-análise salva.'));
  }catch(e){ console.error(e); toast('Erro ao salvar a pré-análise.','err'); }
};

// ══════════════════════════════════════════════════════
//  ⑤ PAGAMENTO DO PROJETO (Analista)
// ══════════════════════════════════════════════════════
function pgPodeEditar(){ return !!me && ['analista','gerente'].includes(me.perfil); }
function pdKmResumoHtml(p){
  const a=p.preAnalise||{}; const f=v=>(v===''||v==null)?'—':pdEsc(v)+' km';
  const dist=pdDistEstimadaKm(p);
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px">
    <div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase">Projetado MT / BT</div><b>${f(a.kmProjMT)} / ${f(a.kmProjBT)}</b></div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase">Retirado MT / BT</div><b>${f(a.kmRetMT)} / ${f(a.kmRetBT)}</b></div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase">Projetista</div><b>${pdEsc(p.projetista||'—')}</b></div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase">Distância estimada (Lages → equip. ${pdEsc(p.equipamentoRef||'—')})</div>
      <b>${dist==null?'—':dist.toFixed(1).replace('.',',')+' km (ida) · '+(dist*2).toFixed(1).replace('.',',')+' km ida e volta'}</b>
      ${dist==null&&pgPodeEditar()?`<div><button type="button" class="btn btn-secondary btn-sm" style="margin-top:4px" onclick="pdRecalcularDistancia()">📍 Localizar equipamento</button></div>`:''}</div>
  </div>${preAnaliseFeita(p)?'':'<div style="font-size:11px;color:#F59E0B;margin-bottom:8px">⚠️ A pré-análise do Estagiário (km de rede) ainda não foi concluída.</div>'}`;
}
function pdRenderPagamento(){
  const p=_pdAtual(); const body=document.getElementById('pdPagamentoBody'); if(!p||!body) return;
  const ed=pgPodeEditar(); const pg=p.pagamentoProjeto||{};
  if(!p.validacaoGerenteOk && !pg.pagoEm){
    body.innerHTML=pdKmResumoHtml(p)+'<div style="padding:10px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted)">O pagamento libera depois que o Gerente concluir a análise de projeto (projeto OK).</div>'; return;
  }
  let html=pdKmResumoHtml(p);
  html+=`<div style="padding:10px;border-radius:8px;border:1px solid ${pg.pagoEm?'rgba(34,197,94,.4)':'rgba(245,158,11,.45)'};margin-bottom:8px">
    <b style="font-size:12px">Projeto</b> — `;
  if(pg.pagoEm){
    html+=`<span style="color:#22C55E;font-weight:700">✅ Pago em ${fmtTxt(pg.pagoEm)}${pg.pagoPor?' por '+pdEsc(pg.pagoPor):''}</span>${pg.obs?'<div style="font-size:11px;color:var(--muted)">'+pdEsc(pg.obs)+'</div>':''}
      ${ed?'<div style="margin-top:6px"><button type="button" class="btn btn-secondary btn-sm" onclick="pdDesfazerPagamento(-1)">Desfazer pagamento</button></div>':''}`;
  } else {
    html+=`<span style="color:#F59E0B;font-weight:700">⏳ Não pago</span>
      ${ed?`<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px">
        <div class="fg" style="margin:0"><label>Data do pagamento</label><input type="date" id="pdPgData" value="${pdHojeStr()}" max="${pdHojeStr()}"></div>
        <div class="fg" style="margin:0;flex:1;min-width:180px"><label>Observação (opcional)</label><input type="text" id="pdPgObs" placeholder="Ex.: medição nº…"></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="pdPagarProjeto(-1)">Informar que pagou o projeto</button></div>`:'<span style="font-size:11px;color:var(--muted)"> · o Analista informa o pagamento.</span>'}`;
  }
  html+='</div>';
  (p.reprojetos||[]).forEach((r,i)=>{
    html+=`<div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px">
      <b style="font-size:12px">Reprojeto #${i+1}</b> <span style="font-size:11px;color:var(--muted)">· ${fmtTxt(r.data)} · ${pdEsc(r.tipo||'')}</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
        <label style="font-size:11px">Gera novo pagamento?</label>
        <select ${ed&&!r.pagoEm?'':'disabled'} onchange="pdReprojetoPagar(${i},this.value)" style="width:auto">
          <option value="" ${!r.pagar?'selected':''}>A verificar</option><option value="sim" ${r.pagar==='sim'?'selected':''}>Sim — pagar</option><option value="nao" ${r.pagar==='nao'?'selected':''}>Não gera pagamento</option></select>
        ${r.pagar==='sim'?(r.pagoEm?`<span style="color:#22C55E;font-weight:700">✅ Pago em ${fmtTxt(r.pagoEm)}${r.pagoPor?' por '+pdEsc(r.pagoPor):''}</span>${ed?`<button type="button" class="btn btn-secondary btn-sm" onclick="pdDesfazerPagamento(${i})">Desfazer</button>`:''}`
          :(ed?`<input type="date" id="pdPgDataR${i}" value="${pdHojeStr()}" max="${pdHojeStr()}" style="width:auto"><button type="button" class="btn btn-primary btn-sm" onclick="pdPagarProjeto(${i})">Informar pagamento</button>`:'<span style="color:#F59E0B;font-weight:700">⏳ Não pago</span>')):''}
      </div></div>`;
  });
  body.innerHTML=html;
}
window.pdPagarProjeto=async function(idx){
  const p=_pdAtual(); if(!p||!pgPodeEditar()) return;
  if(!p.validacaoGerenteOk){ toast('O pagamento só pode ser informado após a análise de projeto do Gerente.','err'); return; }
  try{
    let np;
    if(idx<0){
      const data=document.getElementById('pdPgData').value; if(!data){ toast('Informe a data do pagamento.','err'); return; }
      const obs=(document.getElementById('pdPgObs').value||'').trim();
      np=await pdSave(p.id,{pagamentoProjeto:{pagoEm:data,pagoPor:me.nome,obs}},'Projeto pago','Data '+fmtTxt(data)+(obs?' · '+obs:''));
    } else {
      const data=document.getElementById('pdPgDataR'+idx).value; if(!data){ toast('Informe a data do pagamento.','err'); return; }
      const lista=(p.reprojetos||[]).map((r,i)=>i===idx?{...r,pagar:'sim',pagoEm:data,pagoPor:me.nome}:r);
      np=await pdSave(p.id,{reprojetos:lista},'Reprojeto #'+(idx+1)+' pago','Data '+fmtTxt(data));
    }
    toast('Pagamento registrado.'); pdRenderPagamento(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao registrar pagamento.','err'); }
};
window.pdDesfazerPagamento=async function(idx){
  const p=_pdAtual(); if(!p||!pgPodeEditar()) return;
  if(!confirm('Desfazer o registro de pagamento?')) return;
  try{
    let np;
    if(idx<0) np=await pdSave(p.id,{pagamentoProjeto:{pagoEm:null,pagoPor:null,obs:''}},'Pagamento do projeto desfeito');
    else { const lista=(p.reprojetos||[]).map((r,i)=>i===idx?{...r,pagoEm:null,pagoPor:null}:r); np=await pdSave(p.id,{reprojetos:lista},'Pagamento do reprojeto #'+(idx+1)+' desfeito'); }
    pdRenderPagamento(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao desfazer.','err'); }
};
window.pdReprojetoPagar=async function(idx,v){
  const p=_pdAtual(); if(!p||!pgPodeEditar()) return;
  try{
    const lista=(p.reprojetos||[]).map((r,i)=>i===idx?{...r,pagar:v}:r);
    const np=await pdSave(p.id,{reprojetos:lista},'Reprojeto #'+(idx+1)+': '+(v==='sim'?'gera novo pagamento':v==='nao'?'não gera pagamento':'pagamento a verificar'));
    pdRenderPagamento(); pdRefreshLeve(np);
  }catch(e){ console.error(e); toast('Erro ao salvar.','err'); }
};
window.pdRecalcularDistancia=async function(){
  const p=_pdAtual(); if(!p||!p.equipamentoRef){ toast('Pedido sem equipamento de referência.','err'); return; }
  const loc=await pdLocalizarEquip(p.equipamentoRef);
  if(!loc){ toast('Equipamento '+p.equipamentoRef+' não encontrado no Mapa da Rede.','warn'); return; }
  try{ const np=await pdSave(p.id,{equipLat:loc.lat,equipLon:loc.lon},'Equipamento de referência localizado no mapa'); pdRenderPagamento(); pdRefreshLeve(np); toast('Equipamento localizado.'); }
  catch(e){ console.error(e); toast('Erro ao salvar.','err'); }
};

// ══════════════════════════════════════════════════════
//  ABA "PROJETOS A PAGAR" + EXCEL
// ══════════════════════════════════════════════════════
let _pdPg={projetista:'',pagos:false};
function pdLinhasPagamento(incluirPagos){
  const rows=[];
  pedidos.forEach(p=>{
    if(p.acaoAnalista!=='Enviado para Projeto' || !p.validacaoGerenteOk) return;
    const a=p.preAnalise||{}; const dist=pdDistEstimadaKm(p);
    const base={p, nota:p.nota||'', tipo:p.tipoSolicitacao||'', municipio:p.municipio||'', projetista:p.projetista||'', equip:p.equipamentoRef||'',
      envio:p.dataEncaminhamentoProjetista||'', retorno:p.dataRetornoProjetista||'', analise:(p.analiseProjeto&&p.analiseProjeto.concluidaEm)||'',
      kmProjMT:pdNumKm(a.kmProjMT), kmProjBT:pdNumKm(a.kmProjBT), kmRetMT:pdNumKm(a.kmRetMT), kmRetBT:pdNumKm(a.kmRetBT),
      materiais:a.materiaisOk==='sim'?'OK':(a.materiaisOk==='nao'?'Com erro: '+(a.materiaisErrados||[]).join(', '):'—'),
      preAnalise:preAnaliseFeita(p), dist};
    const pg=p.pagamentoProjeto||{};
    rows.push({...base,item:'Projeto',idx:-1,pago:!!pg.pagoEm,pagoEm:pg.pagoEm||'',situacao:pg.pagoEm?'Pago':'A pagar'});
    (p.reprojetos||[]).forEach((r,i)=>{
      if(r.pagar==='nao') return;
      rows.push({...base,item:'Reprojeto #'+(i+1)+(r.tipo?' — '+r.tipo:''),idx:i,pago:!!r.pagoEm,pagoEm:r.pagoEm||'',situacao:r.pagoEm?'Pago':(r.pagar==='sim'?'A pagar':'Verificar se gera pagamento')});
    });
  });
  return rows.filter(r=>(incluirPagos||!r.pago)&&(!_pdPg.projetista||r.projetista===_pdPg.projetista))
    .sort((a,b)=>(a.projetista||'').localeCompare(b.projetista||'')||(a.analise||'').localeCompare(b.analise||''));
}
window.pdPgSet=function(k,v){ _pdPg[k]=v; pdRenderPagar(); };
function pdRenderPagar(){
  const el=document.getElementById('pdAbaPagar'); if(!el) return;
  const rows=pdLinhasPagamento(_pdPg.pagos);
  const n=v=>v==null?'—':String(v.toFixed(3)).replace('.',',');
  const soma=(arr,k)=>arr.reduce((s,r)=>s+(r[k]||0),0);
  const naoPagos=rows.filter(r=>!r.pago);
  const porProj={}; naoPagos.forEach(r=>{ const k=r.projetista||'—'; (porProj[k]=porProj[k]||[]).push(r); });
  el.innerHTML=`
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0">
      <select onchange="pdPgSet('projetista',this.value)" style="font-size:11px;padding:5px 8px"><option value="">Todos os projetistas</option>${PROJETISTAS_PEDIDO.map(x=>`<option value="${pdEsc(x)}" ${_pdPg.projetista===x?'selected':''}>${pdEsc(x)}</option>`).join('')}</select>
      <label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" style="width:auto" ${_pdPg.pagos?'checked':''} onchange="pdPgSet('pagos',this.checked)"> Mostrar também os já pagos</label>
      <button class="btn btn-primary btn-sm" onclick="pdExportarAPagar()">📥 Exportar Excel (projetos não pagos)</button>
      <span style="font-size:11px;color:var(--muted)">${naoPagos.length} item(ns) não pago(s)</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${Object.keys(porProj).sort().map(k=>{ const l=porProj[k];
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:8px 12px;min-width:170px"><div style="font-weight:800">${pdEsc(k)}</div>
        <div style="font-size:11px">${l.length} item(ns) a pagar</div>
        <div style="font-size:10px;color:var(--muted)">Projetado: MT ${n(soma(l,'kmProjMT'))} · BT ${n(soma(l,'kmProjBT'))} km<br>Retirado: MT ${n(soma(l,'kmRetMT'))} · BT ${n(soma(l,'kmRetBT'))} km<br>Distância (ida e volta): ${(soma(l,'dist')*2).toFixed(0)} km</div></div>`; }).join('')}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--surface2)">${['Nota','Projetista','Item','Município','Análise do Gerente','Proj. MT (km)','Proj. BT (km)','Ret. MT (km)','Ret. BT (km)','Dist. est. ida/volta (km)','Materiais','Situação'].map(t=>`<th style="padding:8px;text-align:left">${t}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr style="cursor:pointer;border-bottom:1px solid var(--border)" onclick="openPedidoModal('${r.p.id}')">
        <td style="padding:8px;font-weight:700">${pdEsc(r.nota)}</td><td style="padding:8px">${pdEsc(r.projetista||'—')}</td><td style="padding:8px">${pdEsc(r.item)}</td>
        <td style="padding:8px">${pdEsc(r.municipio)}</td><td style="padding:8px">${fmtTxt(r.analise)}</td>
        <td style="padding:8px">${n(r.kmProjMT)}</td><td style="padding:8px">${n(r.kmProjBT)}</td><td style="padding:8px">${n(r.kmRetMT)}</td><td style="padding:8px">${n(r.kmRetBT)}</td>
        <td style="padding:8px">${r.dist==null?'—':(r.dist*2).toFixed(1).replace('.',',')}</td>
        <td style="padding:8px;font-size:11px">${pdEsc(r.materiais)}${r.preAnalise?'':' <span style="color:#F59E0B">(sem pré-análise)</span>'}</td>
        <td style="padding:8px;font-weight:700;color:${r.pago?'#22C55E':(r.situacao==='A pagar'?'#F59E0B':'#3B82F6')}">${pdEsc(r.situacao)}${r.pagoEm?' · '+fmtTxt(r.pagoEm):''}</td></tr>`).join('')
        ||'<tr><td colspan="12" style="padding:16px;text-align:center;color:var(--muted)">Nenhum projeto a pagar.</td></tr>'}</tbody></table></div>`;
}
window.pdExportarAPagar=async function(){
  let XLSX; try{ XLSX=await loadSheetJS(); }catch(e){}
  if(!XLSX){ toast('Biblioteca de Excel não carregada — verifique a conexão e tente de novo.','err'); return; }
  const rows=pdLinhasPagamento(false);
  if(!rows.length){ toast('Não há projetos não pagos para exportar.','warn'); return; }
  const r2=v=>v==null?'':Math.round(v*1000)/1000;
  const cab=['Nota','Projetista','Item','Situação','Tipo de solicitação','Município','Equip. de referência','Envio ao projetista','Retorno do projeto','Análise do Gerente (projeto OK)',
    'Rede projetada MT (km)','Rede projetada BT (km)','Rede retirada MT (km)','Rede retirada BT (km)','Materiais orçados','Pré-análise concluída',
    'Distância estimada ida (km)','Distância estimada ida e volta (km)'];
  const linhas=rows.map(r=>[r.nota,r.projetista,r.item,r.situacao,r.tipo,r.municipio,r.equip,fmtTxt(r.envio),fmtTxt(r.retorno),fmtTxt(r.analise),
    r2(r.kmProjMT),r2(r.kmProjBT),r2(r.kmRetMT),r2(r.kmRetBT),r.materiais,r.preAnalise?'Sim':'Não',
    r.dist==null?'':Math.round(r.dist*10)/10, r.dist==null?'':Math.round(r.dist*20)/10]);
  const grupos={}; rows.forEach(r=>{ const k=r.projetista||'—'; const g=grupos[k]=grupos[k]||{n:0,pm:0,pb:0,rm:0,rb:0,d:0}; g.n++; g.pm+=r.kmProjMT||0; g.pb+=r.kmProjBT||0; g.rm+=r.kmRetMT||0; g.rb+=r.kmRetBT||0; g.d+=(r.dist||0)*2; });
  const resumo=[['Projetista','Itens não pagos','Projetada MT (km)','Projetada BT (km)','Retirada MT (km)','Retirada BT (km)','Distância estimada ida e volta (km)'],
    ...Object.keys(grupos).sort().map(k=>{ const g=grupos[k]; return [k,g.n,r2(g.pm),r2(g.pb),r2(g.rm),r2(g.rb),Math.round(g.d*10)/10]; }),
    [],['Distância: linha reta de Lages (base) até o equipamento de referência × fator de estrada '+String(pedidosParams.fatorEstrada||1.3).replace('.',',')+'. Valor estimado.']];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([cab,...linhas]); ws['!cols']=cab.map((c,i)=>({wch:i===2?34:(i===14?40:Math.max(12,Math.min(26,c.length+2)))}));
  XLSX.utils.book_append_sheet(wb,ws,'Projetos não pagos');
  const ws2=XLSX.utils.aoa_to_sheet(resumo); ws2['!cols']=[{wch:22},{wch:16},{wch:18},{wch:18},{wch:18},{wch:18},{wch:30}];
  XLSX.utils.book_append_sheet(wb,ws2,'Resumo por projetista');
  XLSX.writeFile(wb,'projetos_nao_pagos_'+pdHojeStr()+'.xlsx');
  toast(rows.length+' item(ns) exportado(s).');
};

// ══════════════════════════════════════════════════════
//  ABA "DASHBOARDS" — prazos de analista, projetistas, análise e supervisores
// ══════════════════════════════════════════════════════
let _pdDash={periodo:'todos'};
window.pdDashSet=function(k,v){ _pdDash[k]=v; pdRenderDash(); };
function pdMedia(arr){ const l=arr.filter(x=>x!=null&&!isNaN(x)); return l.length?l.reduce((a,b)=>a+b,0)/l.length:null; }
function pdFmtD(v){ return v==null?'—':(Math.round(v*10)/10).toString().replace('.',',')+' d'; }
function pdPct(a,b){ return b?Math.round(a*100/b)+'%':'—'; }
function pdDocsFaltantes(p){
  if(Array.isArray(p.pendenciasIniciais)) return p.pendenciasIniciais;
  if(p.checklistConcluido) return checklistPendentes(p).map(i=>i.documento);
  return null; // checklist ainda em conferência — não entra na estatística
}
function pdRenderDash(){
  const el=document.getElementById('pdAbaDash'); if(!el) return;
  const hoje=pdHojeStr();
  let base=pedidos.slice();
  if(_pdDash.periodo!=='todos'){ const corte=pdAddDias(hoje,-parseInt(_pdDash.periodo,10)); base=base.filter(p=>(p.dataAberturaPedido||'')>=corte); }
  const env=base.filter(p=>p.acaoAnalista==='Enviado para Projeto'&&p.dataEncaminhamentoProjetista);
  const kpi=(t,v,cor,sub)=>`<div style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:140px;flex:1"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700">${t}</div><div style="font-size:22px;font-weight:800;color:${cor||'var(--text)'}">${v}</div>${sub?`<div style="font-size:10px;color:var(--muted)">${sub}</div>`:''}</div>`;
  const sec=(t,inner)=>`<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:12px"><div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--accent)">${t}</div>${inner}</div>`;
  const tabela=(cab,linhas)=>`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--surface2)">${cab.map(c=>`<th style="padding:6px 8px;text-align:left">${c}</th>`).join('')}</tr></thead><tbody>${linhas.map(l=>`<tr style="border-bottom:1px solid var(--border)">${l.map(c=>`<td style="padding:6px 8px">${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cab.length}" style="padding:12px;color:var(--muted);text-align:center">Sem dados no período.</td></tr>`}</tbody></table></div>`;
  const barra=(a,b,corA,corB)=>{ const t=a+b; if(!t) return ''; const pa=Math.round(a*100/t); return `<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;margin-top:4px;background:var(--surface2)"><div style="width:${pa}%;background:${corA}"></div><div style="width:${100-pa}%;background:${corB}"></div></div>`; };
  const verm=(n)=>n>0?`<b style="color:#EF4444">${n}</b>`:String(n);

  // ── Prazo regulatório
  const infos=base.map(p=>({p,i:prazoInfo(p)}));
  const enq=infos.filter(x=>x.i.tipo==='enquadrado'); const enqD=enq.filter(x=>x.i.dentro).length;
  const venc=infos.filter(x=>x.i.tipo==='vencido').length, v7=infos.filter(x=>x.i.tipo==='ativo'&&x.i.dias<=7).length;
  const ativos=infos.filter(x=>x.i.tipo==='ativo').length, paus=infos.filter(x=>x.i.tipo==='pausado').length;
  // ── Analista
  const an=base.map(p=>({p,a:prazoAnalistaInfo(p)}));
  const anDec=an.filter(x=>x.a.tipo==='decidido'&&x.a.usados!=null); const anDentro=anDec.filter(x=>x.a.dentro).length;
  const anPend=an.filter(x=>['ativo','vencido','pausado'].includes(x.a.tipo)); const anVenc=anPend.filter(x=>x.a.tipo==='vencido');
  const acoesCnt={}; base.forEach(p=>{ const k=p.acaoAnalista||'(sem ação definida)'; acoesCnt[k]=(acoesCnt[k]||0)+1; });

  let html=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0">
      <span style="font-size:11px;color:var(--muted)">Pedidos abertos em:</span>
      <select onchange="pdDashSet('periodo',this.value)" style="font-size:11px;padding:5px 8px">${[['todos','Todo o período'],['30','Últimos 30 dias'],['90','Últimos 90 dias'],['180','Últimos 180 dias'],['365','Últimos 12 meses']].map(([v,l])=>`<option value="${v}" ${_pdDash.periodo===v?'selected':''}>${l}</option>`).join('')}</select>
      <span style="font-size:11px;color:var(--muted)">${base.length} pedido(s)</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${kpi('Pedidos',base.length,'',env.length+' enviados a projeto')}
      ${kpi('Enquadrados no prazo',pdPct(enqD,enq.length),enq.length&&enqD<enq.length?'#F59E0B':'#22C55E',enqD+' de '+enq.length+' enquadrados')}
      ${kpi('Prazo regulatório vencido',venc,venc?'#EF4444':'#22C55E','em andamento agora')}
      ${kpi('Vencem em até 7 dias',v7,v7?'#F97316':'#22C55E',ativos+' no prazo · '+paus+' pausados (M34)')}
      ${kpi('Analista fora dos '+(pedidosParams.prazoAnalistaDias||15)+' d',anVenc.length,anVenc.length?'#EF4444':'#22C55E',anPend.length+' aguardando definição')}
    </div>`;

  html+=sec('🧑‍💼 Analista — prazo de '+(pedidosParams.prazoAnalistaDias||15)+' dias para definir a ação',
    `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${kpi('Definidos no prazo',pdPct(anDentro,anDec.length),'#22C55E',anDentro+' de '+anDec.length)}
      ${kpi('Tempo médio até definir',pdFmtD(pdMedia(anDec.map(x=>x.a.usados))),'','dias corridos (sem Medida 34)')}
      ${kpi('Aguardando definição',anPend.length,'',anVenc.length+' vencido(s)')}
    </div>${barra(anDentro,anDec.length-anDentro,'#22C55E','#EF4444')}
    <div style="font-size:11px;margin-top:8px">${Object.keys(acoesCnt).sort().map(k=>`<span style="display:inline-block;margin:0 10px 4px 0"><b>${acoesCnt[k]}</b> ${pdEsc(k)}</span>`).join('')}</div>
    ${anVenc.length?`<div style="font-size:11px;margin-top:6px;color:#EF4444"><b>Vencidos:</b> ${anVenc.slice(0,30).map(x=>`<a href="#" onclick="openPedidoModal('${x.p.id}');return false" style="color:#EF4444">${pdEsc(x.p.nota||'—')}</a> (${Math.abs(x.a.dias)} d)`).join(' · ')}</div>`:''}`);

  // ── Projetistas
  const ref=pedidosParams.prazoProjetistaDias;
  const projs=[...new Set(env.map(p=>p.projetista||'—'))].sort();
  const linhasP=projs.map(nome=>{
    const l=env.filter(p=>(p.projetista||'—')===nome);
    const emProj=l.filter(p=>!p.dataRetornoProjetista&&!p.dataEnquadramento);
    const atras=emProj.filter(p=>!p.reprojetoPendente&&diff(p.dataEncaminhamentoProjetista,hoje)>ref);
    const tempos=l.map(p=>{ const r=p.primeiroRetornoProjetista||((p.reprojetos||[]).length?null:p.dataRetornoProjetista); return r?diff(p.dataEncaminhamentoProjetista,r):null; });
    const entregues=tempos.filter(x=>x!=null); const noPrazo=entregues.filter(x=>x<=ref).length;
    const repro=l.reduce((s,p)=>s+(p.reprojetos||[]).length,0);
    const matErr=l.filter(p=>p.preAnalise&&p.preAnalise.materiaisOk==='nao').length;
    const matAval=l.filter(p=>p.preAnalise&&p.preAnalise.materiaisOk).length;
    const km=k=>l.reduce((s,p)=>s+(pdNumKm(p.preAnalise&&p.preAnalise[k])||0),0);
    return [`<b>${pdEsc(nome)}</b>`,l.length,emProj.length,verm(atras.length),pdFmtD(pdMedia(entregues)),entregues.length?pdPct(noPrazo,entregues.length):'—',verm(repro),matAval?verm(matErr)+' de '+matAval:'—',km('kmProjMT').toFixed(2).replace('.',','),km('kmProjBT').toFixed(2).replace('.',',')];
  });
  const cnt=(arr)=>{ const m={}; arr.forEach(x=>{ if(x) m[x]=(m[x]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const probs=cnt(env.flatMap(p=>(p.reprojetos||[]).map(r=>r.tipo)));
  const mats=cnt(env.flatMap(p=>(p.preAnalise&&p.preAnalise.materiaisErrados)||[]));
  html+=sec('📐 Projetistas — prazo de referência de '+ref+' dias',
    tabela(['Projetista','Pedidos','Em projeto agora','Atrasados (> '+ref+' d)','Tempo médio de entrega','Entregues no prazo','Reprojetos','Projetos c/ material errado','km MT projetado','km BT projetado'],linhasP)
    +`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
      <div><div style="font-size:11px;font-weight:700;margin-bottom:4px">Principais problemas de reprojeto</div>${probs.length?probs.slice(0,8).map(([k,n])=>`<div style="font-size:11px">${n}× ${pdEsc(k)}</div>`).join(''):'<div style="font-size:11px;color:var(--muted)">Nenhum reprojeto registrado.</div>'}</div>
      <div><div style="font-size:11px;font-weight:700;margin-bottom:4px">Materiais com código errado mais frequentes</div>${mats.length?mats.slice(0,8).map(([k,n])=>`<div style="font-size:11px">${n}× ${pdEsc(k)}</div>`).join(''):'<div style="font-size:11px;color:var(--muted)">Nenhum registrado.</div>'}</div></div>`);

  // ── Estagiário / Adm_ODI
  const ckPend=env.filter(p=>!p.dataEnquadramento&&!checklistConcluidoOuDispensado(p)).length;
  const ckT=pdMedia(env.map(p=>p.checklistConcluidoEm?diff(p.dataEncaminhamentoProjetista,p.checklistConcluidoEm):null));
  const rur=env.filter(pedidoEhRural);
  const adPend=rur.filter(p=>!p.dataEnquadramento&&!p.analiseDocumentalConcluida).length;
  const adT=pdMedia(rur.map(p=>(p.analiseDocumentalConcluida&&p.analiseDocumentalEm)?diff(p.dataEncaminhamentoProjetista,p.analiseDocumentalEm):null));
  const paPend=env.filter(preAnalisePendente).length;
  const paT=pdMedia(env.map(p=>{ const r=p.primeiroRetornoProjetista||p.dataRetornoProjetista; return (preAnaliseFeita(p)&&r)?Math.max(0,diff(r,p.preAnalise.concluidaEm)):null; }));
  const reab=base.filter(p=>reanaliseAberta(p)); const reVenc=reab.filter(p=>reanalisePrazo(reanaliseAberta(p))<hoje).length;
  const reT=pdMedia(base.flatMap(p=>(p.reanalises||[]).filter(r=>r.concluidaEm).map(r=>diff(r.abertaEm,r.concluidaEm))));
  html+=sec('📑 Estagiário / Adm_ODI — análise documental',
    tabela(['Atividade','Responsável','Pendentes agora','Tempo médio'],[
      ['Checklist documental','Estagiário',verm(ckPend),pdFmtD(ckT)+' <span style="color:var(--muted);font-size:10px">(do envio a projeto até concluir)</span>'],
      ['Análise documental detalhada (rural)','Adm_ODI / Estagiário',verm(adPend),pdFmtD(adT)+' <span style="color:var(--muted);font-size:10px">(do envio a projeto até concluir)</span>'],
      ['Pré-análise do projeto','Estagiário',verm(paPend),pdFmtD(paT)+' <span style="color:var(--muted);font-size:10px">(do retorno do projeto até concluir)</span>'],
      ['Reanálises documentais','Adm_ODI / Estagiário',reab.length+(reVenc?` (<b style="color:#EF4444">${reVenc} vencida(s)</b>)`:''),pdFmtD(reT)+' <span style="color:var(--muted);font-size:10px">(da abertura à conclusão)</span>'],
    ]));

  // ── Supervisores (Gerentes por município)
  const linhasG=Object.keys(GERENTES_MUNICIPIOS).map(g=>{
    const l=env.filter(p=>gerenteDoMunicipio(p.municipio)===g);
    const agAn=l.filter(p=>p.dataRetornoProjetista&&!p.validacaoGerenteOk&&!p.reprojetoPendente&&!p.dataEnquadramento);
    const parado=pdMedia(agAn.map(p=>diff(p.dataRetornoProjetista,hoje)));
    const tAn=pdMedia(l.map(p=>{ const c=p.analiseProjeto&&p.analiseProjeto.concluidaEm; return (c&&p.dataRetornoProjetista)?Math.max(0,diff(p.dataRetornoProjetista,c)):null; }));
    const agEnq=l.filter(p=>!p.dataEnquadramento&&p.validacaoGerenteOk&&checklistConcluidoOuDispensado(p)&&analiseDocumentalOk(p)).length;
    const org=l.filter(p=>orgaosPendentes(p).length).length, campo=l.filter(campoPendente).length;
    const vencG=l.filter(p=>prazoInfo(p).tipo==='vencido').length;
    const enqG=l.filter(p=>p.dataEnquadramento); const enqDG=enqG.filter(p=>prazoInfo(p).dentro).length;
    return [`<b>${pdEsc(g)}</b>`,l.filter(p=>!p.dataEnquadramento).length,verm(agAn.length)+(agAn.length?` <span style="color:var(--muted);font-size:10px">(parados em média ${pdFmtD(parado)})</span>`:''),pdFmtD(tAn),verm(agEnq),org,campo,verm(vencG),enqG.length?pdPct(enqDG,enqG.length)+` <span style="color:var(--muted);font-size:10px">(${enqDG}/${enqG.length})</span>`:'—'];
  });
  html+=sec('🧭 Supervisores (Gerentes por município)',
    tabela(['Supervisor','Pedidos em andamento','Aguardando análise de projeto','Tempo médio da análise','Aguardando enquadramento','Órgão pendente','Campo pendente','Prazo regulatório vencido','Enquadrados no prazo'],linhasG));

  // ── Documentos que mais faltam, por cidade
  const porMun={};
  env.forEach(p=>{ const f=pdDocsFaltantes(p); if(f===null) return; const m=porMun[p.municipio||'—']=porMun[p.municipio||'—']||{n:0,comFalta:0,docs:{}}; m.n++; if(f.length) m.comFalta++; f.forEach(d=>{ m.docs[d]=(m.docs[d]||0)+1; }); });
  const linhasM=Object.keys(porMun).sort((a,b)=>porMun[b].comFalta-porMun[a].comFalta||a.localeCompare(b)).map(mu=>{ const m=porMun[mu];
    const top=Object.entries(m.docs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([d,n])=>`${pdEsc(d)} <b>(${n} · ${pdPct(n,m.n)})</b>`).join('<br>');
    return [`<b>${pdEsc(mu)}</b>`,m.n,verm(m.comFalta)+' · '+pdPct(m.comFalta,m.n),top||'<span style="color:#22C55E">Sem faltas</span>']; });
  html+=sec('🏙️ Documentos que mais faltam na abertura — por cidade',
    `<div style="font-size:10px;color:var(--muted);margin-bottom:6px">Conta o que estava faltando quando o checklist foi concluído pela 1ª vez (mesmo que o documento tenha chegado depois). Use para orientar o atendimento de cada cidade.</div>`
    +tabela(['Município','Pedidos conferidos','Com documento faltando','Documentos que mais faltam'],linhasM));

  el.innerHTML=html;
}

// ══════════════════════════════════════════════════════
//  PLANEJAMENTO NO PEDIDO — oportunidades de melhoria no trecho · necessidade de Linha Viva
// ══════════════════════════════════════════════════════
function pdPodeVerPlanejamento(){ return !!me && ['analista','gerente','estagiario','adm_odi'].includes(me.perfil); }
async function pdBasePlanejamento(){
  if(!pdPodeVerPlanejamento()) return false;
  try{ return await _plGarantirBase(); }catch(e){ console.warn('[Pedidos] base de planejamento indisponível:',e.message); return false; }
}
// Cálculo da necessidade de Linha Viva a partir do equipamento de referência (requer a base carregada)
function pdCalcLV(nr){
  const B=_pl.B,R=_pl.R; if(!B||!R) return null;
  const loc=planLocalizarEquip(B,nr); if(!loc) return {achou:false};
  // nó de trabalho: para trafo é o próprio ponto; para chave/religador é o trecho protegido por ela (a jusante)
  const n0=(loc.nos&&loc.nos.length)?loc.nos[0]:loc.ref;
  const V=B.V,X=B._p,blk=R._blk; const b=blk[n0]; const bl=R._blocos[b]; const head=bl.head;
  if(!R._nosBloco){R._nosBloco=new Map();for(let i=0;i<B.N;i++){const bb=blk[i];if(!R._nosBloco.has(bb))R._nosBloco.set(bb,[]);R._nosBloco.get(bb).push(i);}}
  let uc=0,ucu=0; for(const i of (R._nosBloco.get(b)||[])) for(const ti of (X.tdAt.get(i)||[])){ const t=B.td[ti]; uc+=t.uc; if(t.urb) ucu+=t.uc; }
  const urbano=uc>0?(ucu/uc>=0.5):V.urb[head]===1;                 // mesma regra do planejamento
  const ucJus=Math.round(X.sUC[head]);                             // tudo que apaga ao abrir a chave que isola o trecho
  const cabo=B.cabos[V.cab[n0]]||'';
  const finos=(R.P&&R.P.cabosPequenos)||PLAN_PARAM_PADRAO.cabosPequenos;
  const caboFino=finos.includes(cabo);
  const lim=urbano?(pedidosParams.lvUcUrb||300):(pedidosParams.lvUcRur||200);
  const acima=ucJus>lim;
  const manobra=ucJus>(pedidosParams.lvUcManobra||1000);
  const resultado=caboFino?'nao_aplicavel':(acima?'obrigatorio':'nao_obrigatorio');
  return {achou:true, ucJus, area:urbano?'Urbana':'Rural', cabo, caboFino, limite:lim, acima, manobra, resultado, chave:bl.rot, al:bl.al, tipoEquip:loc.tipo};
}
function pdLvTexto(c){
  if(!c) return 'Necessidade de Linha Viva não calculada (base de planejamento indisponível).';
  if(!c.achou) return 'Equipamento de referência não localizado na base de planejamento — necessidade de Linha Viva não calculada.';
  const base=`Trecho isolado por ${c.chave} (${c.al}) · área ${c.area} · ${c.ucJus} UC desligadas ao abrir a chave · cabo ${c.cabo||'não identificado'}`;
  let r=c.resultado==='nao_aplicavel'?`Linha Viva NÃO APLICÁVEL: cabo ${c.cabo} não permite atividade com LV.`+(c.acima?` Atenção: o desligamento atinge ${c.ucJus} UC (acima do limite de ${c.limite} para área ${c.area.toLowerCase()}).`:'')
    :c.resultado==='obrigatorio'?`OBRIGATÓRIO VERIFICAR LINHA VIVA: ${c.ucJus} UC desligadas (limite ${c.limite} para área ${c.area.toLowerCase()}).`
    :`Linha Viva não obrigatória: ${c.ucJus} UC desligadas (limite ${c.limite} para área ${c.area.toLowerCase()}).`;
  if(c.manobra) r+=` Abertura muito grande (${c.ucJus} UC) — VERIFICAR POSSIBILIDADE DE MANOBRA.`;
  return r+' — '+base;
}
function pdLvHtml(c,contexto){
  if(!c||!c.achou) return `<div style="padding:8px 10px;border:1px dashed var(--border);border-radius:8px;font-size:11px;color:var(--muted)">⚡ ${pdEsc(pdLvTexto(c))}</div>`;
  const cor=c.resultado==='obrigatorio'?'#EF4444':(c.resultado==='nao_aplicavel'?'#F59E0B':'#22C55E');
  const tit=c.resultado==='obrigatorio'?'⚡ Obrigatório verificar Linha Viva':(c.resultado==='nao_aplicavel'?'⚡ Linha Viva não aplicável (cabo fino)':'⚡ Linha Viva não obrigatória');
  return `<div style="padding:8px 10px;border:1px solid ${cor}66;background:${cor}14;border-radius:8px;font-size:12px">
    <div style="font-weight:800;color:${cor}">${tit}</div>
    <div style="font-size:11px;margin-top:2px">Trecho isolado por <b>${pdEsc(c.chave)}</b> · ${pdEsc(c.al)} · área <b>${c.area}</b> · <b>${c.ucJus} UC</b> desligadas ao abrir a chave (limite ${c.limite}) · cabo no equipamento: <b>${pdEsc(c.cabo||'—')}</b>${c.caboFino?' <span style="color:#F59E0B;font-weight:700">(não permite LV)</span>':''}</div>
    ${c.resultado==='nao_aplicavel'&&c.acima?`<div style="font-size:11px;color:#EF4444;font-weight:700;margin-top:2px">Atenção: sem LV, o desligamento atinge ${c.ucJus} UC (acima do limite).</div>`:''}
    ${c.manobra?`<div style="font-size:11px;color:#EF4444;font-weight:700;margin-top:2px">🔀 Abertura muito grande (${c.ucJus} UC) — verificar possibilidade de manobra.</div>`:''}
    ${contexto==='analista'?`<div style="font-size:10px;color:var(--muted);margin-top:4px">Observação para repassar ao projetista. A definição final (tem LV / foi orçada) é do Gerente na análise de projeto.</div>`:''}
  </div>`;
}
// Preenche os quadros de Linha Viva (ação do analista, pré-análise e análise do Gerente)
let _pdLvAtual=null, _pdPlanSeq=0;
async function pdLvPreencher(nr){
  const slots=[...document.querySelectorAll('#ovPedido .pdLvSlot')]; const p=_pdAtual();
  if(!nr){ slots.forEach(s=>{ s.innerHTML=''; }); _pdLvAtual=null; return; }
  const seq=++_pdPlanSeq;
  slots.forEach(s=>{ if(!s.innerHTML) s.innerHTML='<div style="font-size:10px;color:var(--muted)">⚡ Calculando necessidade de Linha Viva…</div>'; });
  const ok=await pdBasePlanejamento(); if(seq!==_pdPlanSeq) return;
  let c=ok?pdCalcLV(nr):null;
  if(!c && p && p.linhaVivaCalc && pdChaveNorm(p.equipamentoRef)===pdChaveNorm(nr)) c=p.linhaVivaCalc;   // usa o último cálculo salvo
  _pdLvAtual=c;
  document.querySelectorAll('#ovPedido .pdLvSlot').forEach(s=>{ s.innerHTML=pdLvHtml(c,s.dataset.ctx||''); });
}

// ── Oportunidades de melhoria no trecho do equipamento (mesma análise mostrada na obra) ──
let _pdOport={itens:[],loc:null,nr:''}, _pdMelhPend=null;
async function pdOportRender(nr){
  const box=document.getElementById('pdOportBox'); if(!box) return;
  if(!nr || !pdPodeVerPlanejamento()){ box.innerHTML=''; box.style.display='none'; return; }
  const seq=_pdPlanSeq;
  box.style.display='block';
  if(!box.innerHTML) box.innerHTML='<div style="font-size:10px;color:var(--muted)">Verificando oportunidades de melhoria no trecho…</div>';
  const ok=await pdBasePlanejamento(); if(seq!==_pdPlanSeq) return;
  if(!ok){ box.innerHTML='<div style="font-size:10px;color:var(--muted)">Base de planejamento indisponível — oportunidades de melhoria não verificadas.</div>'; return; }
  const p=_pdAtual();
  const r=planOportunidadesNoTrecho(_pl.B,_pl.R,nr); const tr=r.loc?planTrechoEquip(_pl.B,_pl.R,nr):null;
  const pv=tr?_plPvntNoTrecho(tr.bs):[];
  _pdOport={itens:r.itens,loc:r.loc,nr:String(nr)};
  const pvHtml=pv.length?`<div style="background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.45);border-radius:8px;padding:6px 10px;margin-bottom:6px;font-size:11px">📌 <b>PVNT prevista neste trecho:</b> ${pv.map(x=>`nota ${pdEsc(x.nota)} (equip. ${pdEsc(x.equip)}${x.desc?' · '+pdEsc(String(x.desc).slice(0,60)):''}${x.sppc?' · já no SPPC: '+pdEsc(x.sppc):''})`).join('; ')}</div>`:'';
  if(!r.loc){ box.innerHTML=pvHtml+`<div style="font-size:10px;color:var(--muted)">Equipamento ${pdEsc(nr)} não localizado na base de planejamento.</div>`; return; }
  if(!r.itens.length){ box.innerHTML=pvHtml+`<div style="font-size:10px;color:var(--muted)">✓ Nenhuma oportunidade de melhoria apontada no trecho ${pdEsc(r.loc.trecho)} (${pdEsc(r.loc.al)}).</div>`; return; }
  const podeGerar=podeGerenciarPedidos() && !!p;
  const linhas=r.itens.map((it,i)=>{ const s=_plStatusOp(it.key); const livre=s.base==='Planejada';
    return `<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-top:1px solid var(--border);font-size:11px;cursor:${livre&&podeGerar?'pointer':'default'}">
      <input type="checkbox" class="pdOpChk" data-i="${i}" ${livre&&podeGerar?'checked':'disabled'} style="width:auto;margin-top:2px">
      <span style="flex:1"><b>${pdEsc(it.tipo)}</b> — ${pdEsc(it.titulo)}<br><span style="color:var(--muted);font-size:10px">${pdEsc(it.det)}</span></span>
      <span style="font-size:10px;white-space:nowrap;color:${livre?'#ef4444':s.base==='Descartada'?'var(--muted)':'#3b82f6'}">${pdEsc(s.txt)}</span></label>`; }).join('');
  box.innerHTML=pvHtml+`<details open style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.45);border-radius:8px;padding:8px 10px">
    <summary style="cursor:pointer;font-size:12px;font-weight:700;color:#d97706">⚠️ ${r.itens.length} oportunidade${r.itens.length>1?'s':''} de melhoria no trecho ${pdEsc(r.loc.trecho)} · ${pdEsc(r.loc.al)}</summary>
    <div style="margin-top:6px">${linhas}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
      ${podeGerar?`<button type="button" class="btn btn-primary btn-sm" onclick="pdGerarPedidoMelhoria()">➕ Gerar pedido de projeto de melhoria com as selecionadas</button>
        <span style="font-size:10px;color:var(--muted)">Abre um novo pedido (você escolhe o enquadramento: Melhorias, Equipamentos Especiais, Alimentadores…) já vinculado a este.</span>`
      :(p?'<span style="font-size:10px;color:var(--muted)">O Analista ou o Gerente pode gerar um pedido de projeto de melhoria a partir destas oportunidades.</span>':'<span style="font-size:10px;color:var(--muted)">Salve o pedido para poder gerar um pedido de projeto de melhoria vinculado.</span>')}
    </div></details>`;
}
let _pdPlanTimer=null;
function pdPlanAtualizar(imediato){
  clearTimeout(_pdPlanTimer);
  const run=()=>{ const acao=document.getElementById('pdAcaoAnalista')?.value; const nr=acao==='Enviado para Projeto'?(document.getElementById('pdEquipRef')?.value||'').trim():'';
    pdLvPreencher(nr).then(()=>pdOportRender(nr)).catch(e=>console.warn('[Pedidos] planejamento:',e)); };
  if(imediato) run(); else _pdPlanTimer=setTimeout(run,600);
}
window.pdGerarPedidoMelhoria=function(){
  const p=_pdAtual(); if(!p||!podeGerenciarPedidos()) return;
  const sel=[...document.querySelectorAll('#pdOportBox .pdOpChk:checked')].map(c=>_pdOport.itens[+c.dataset.i]).filter(Boolean);
  if(!sel.length){ toast('Selecione ao menos uma oportunidade.','warn'); return; }
  if((_arDirty||_apDirty||_paDirty) && !confirm('Há alterações não salvas na análise deste pedido. Continuar mesmo assim?')) return;
  _pdMelhPend={origem:{id:p.id,nota:p.nota||''},municipio:p.municipio||'',equipamentoRef:p.equipamentoRef||_pdOport.nr,loc:_pdOport.loc||{al:'',trecho:''},
    itens:sel.map(s=>({key:s.key,tipo:s.tipo,titulo:s.titulo,det:s.det,pos:s.pos||null}))};
  closePedidoModal(true);
  window.openPedidoModal();
};
function pdMelhAplicarPendente(){
  const box=document.getElementById('pdMelhBanner'); if(!box) return;
  const p=_pdAtual(); const pend=_pdMelhPend;
  if(!p && pend){
    const set=(id,v)=>{ const el=document.getElementById(id); if(el && v!=null && v!=='') el.value=v; };
    set('pdNota','M-'+pend.origem.nota); set('pdTipoSolicitacao','Melhorias'); set('pdDataAbertura',pdHojeStr()); set('pdMunicipio',pend.municipio);
    set('pdAcaoAnalista','Enviado para Projeto'); set('pdEquipRef',pend.equipamentoRef);
    set('pdEscopoProjeto','Melhoria vinculada ao pedido '+pend.origem.nota+' (trecho '+(pend.loc.trecho||'—')+' · '+(pend.loc.al||'—')+'):\n'+pend.itens.map(i=>'• '+i.tipo+' — '+i.titulo+(i.det?' ('+i.det+')':'')).join('\n'));
    onTipoSolicitacaoChange(); onAcaoAnalistaChange();
    box.style.display='block';
    box.innerHTML=`<div style="background:rgba(124,106,247,.12);border:1px solid #7c6af7;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11px">🔗 Novo <b>pedido de projeto de melhoria</b> vinculado ao pedido <b>${pdEsc(pend.origem.nota)}</b> (${pend.itens.length} oportunidade${pend.itens.length>1?'s':''}). Ajuste a nota, o <b>tipo de solicitação</b> (enquadramento), o projetista e a data de encaminhamento e salve. <a href="#" onclick="pdMelhCancelar();return false" style="color:#7c6af7">Cancelar vínculo</a></div>`;
    return;
  }
  let h='';
  if(p && p.pedidoOrigem) h+=`<div style="background:rgba(124,106,247,.10);border:1px solid rgba(124,106,247,.5);border-radius:8px;padding:6px 10px;margin-bottom:8px;font-size:11px">🔗 Pedido de projeto de melhoria gerado a partir do pedido <a href="#" onclick="pdAbrirOutro('${pdEsc(p.pedidoOrigem.id)}');return false" style="color:#7c6af7;font-weight:700">${pdEsc(p.pedidoOrigem.nota)}</a>${(p.oportunidadesInfo||[]).length?' · '+p.oportunidadesInfo.map(i=>pdEsc(i.tipo)).join(', '):''}</div>`;
  if(p && (p.pedidosMelhoriaVinculados||[]).length) h+=`<div style="background:rgba(124,106,247,.10);border:1px solid rgba(124,106,247,.5);border-radius:8px;padding:6px 10px;margin-bottom:8px;font-size:11px">🔗 Pedido(s) de projeto de melhoria gerado(s) a partir deste: ${p.pedidosMelhoriaVinculados.map(x=>`<a href="#" onclick="pdAbrirOutro('${pdEsc(x.id)}');return false" style="color:#7c6af7;font-weight:700">${pdEsc(x.nota)}</a>`).join(', ')}</div>`;
  box.innerHTML=h; box.style.display=h?'block':'none';
}
window.pdMelhCancelar=function(){ _pdMelhPend=null; closePedidoModal(true); };
window.pdAbrirOutro=function(id){ if(!pedidos.some(x=>x.id===id)){ toast('Pedido não encontrado (pode ter sido excluído).','warn'); return; } closePedidoModal(true); window.openPedidoModal(id); };
// Depois de salvar o novo pedido de melhoria: vincula ao pedido de origem e marca as oportunidades
async function pdMelhConcluirVinculo(pend,novoId,novaNota){
  const orig=pedidos.find(x=>x.id===pend.origem.id);
  const lista=[...((orig&&orig.pedidosMelhoriaVinculados)||[]),{id:novoId,nota:novaNota}];
  await updateDoc(doc(db,'pedidos',pend.origem.id),{pedidosMelhoriaVinculados:lista,
    timeline:arrayUnion({ts:new Date().toISOString(),usuario:me.nome||'',perfil:me.perfil||'',evento:'Pedido de projeto de melhoria gerado',detalhe:novaNota+' · '+pend.itens.map(i=>i.tipo).join(', ')})});
  if(orig) orig.pedidosMelhoriaVinculados=lista;
  if(!_pl.ops) _pl.ops=new Map();
  for(const it of pend.itens){
    const reg={key:it.key,tipo:it.tipo,titulo:it.titulo,det:it.det,pos:it.pos||null,al:pend.loc.al||'',trecho:pend.loc.trecho||'',decisao:'pedido',
      pedidoId:novoId,pedidoNota:novaNota,pedidoOrigemId:pend.origem.id,pedidoOrigemNota:pend.origem.nota,em:serverTimestamp(),por:me.nome||me.email||''};
    try{ await setDoc(doc(db,'oportunidades',_plIdOp(it.key)),reg); _pl.ops.set(it.key,reg); }
    catch(e){ console.warn('[Pedidos] não foi possível marcar a oportunidade:',e.message); }
  }
  _pl.oportResumo=null;
}

// ── Abas da página de Pedidos ──────────────────────────
let _pdAba='fila';
window.pdSetAba=function(a){
  _pdAba=a;
  if(a==='fila') _pdF.vista='minha';
  else if(a==='todos' && _pdF.vista==='minha') _pdF.vista='ativos';
  pdRenderLista();
};
function pdRenderAbas(todos){
  const el=document.getElementById('pdAbas'); if(!el) return;
  const nFila=todos.filter(it=>pdMinhaFila(it.acoes)).length;
  const nPagar=pedidos.reduce((s,p)=>s+pagamentosPendentes(p).length,0);
  const abas=[['fila','👤 Minha fila',nFila],['todos','📋 Todos',pedidos.length]];
  if(['analista','gerente'].includes(me.perfil)) abas.push(['pagar','💰 Projetos a pagar',nPagar]);
  abas.push(['dash','📊 Dashboards',null]);
  if(!abas.some(a=>a[0]===_pdAba)) _pdAba='fila';
  el.innerHTML=abas.map(([k,t,n])=>`<button type="button" onclick="pdSetAba('${k}')" style="cursor:pointer;padding:8px 14px;border:none;border-bottom:3px solid ${_pdAba===k?'var(--accent)':'transparent'};background:transparent;color:${_pdAba===k?'var(--accent)':'var(--muted)'};font-weight:${_pdAba===k?800:600};font-size:12px">${t}${n!=null?` <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:var(--surface2)">${n}</span>`:''}</button>`).join('');
  const show=(id,v)=>{ const e=document.getElementById(id); if(e) e.style.display=v?'':'none'; };
  show('pdAbaLista',_pdAba==='fila'||_pdAba==='todos'); show('pdAbaPagar',_pdAba==='pagar'); show('pdAbaDash',_pdAba==='dash');
  const c=document.getElementById('pdCards'); if(c) c.style.display=_pdAba==='todos'?'flex':'none';
}


// ══════════════════════════════════════════════════════════════════════
//  MAPA DA REDE — obras posicionadas pelo Equipamento de Referência
//  Etapa 1 (v2612). Módulo aditivo: não altera nenhum fluxo existente.
//  Mostra só obras em campo: Em Execução, Atrasada, Paralisada, Paral. Expirada, Prob. Executivo,
//  Aguard. Fiscalização (RD) e Ag. Fiscalização/Kaffa (ODI). Empreiteira vê só as suas.
//  Dados: coleções Firestore 'redes' (equipamentos/ramais) e 'redes_geo' (traçado),
//  geradas no próprio navegador a partir do KMZ de cada alimentador (perfil gerente).
// ══════════════════════════════════════════════════════════════════════
// ── Núcleo de processamento de rede (KML → ramais), sem dependências ──
function _rkm(a,b){const R=6371,t=Math.PI/180,dLa=(b[1]-a[1])*t,dLo=(b[0]-a[0])*t;const h=Math.sin(dLa/2)**2+Math.cos(a[1]*t)*Math.cos(b[1]*t)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function redeLerKML(s){
  const out={};const reF=/<Folder>([\s\S]*?)<\/Folder>/g;let f;
  while((f=reF.exec(s))){const reP=/<Placemark>([\s\S]*?)<\/Placemark>/g;let p;
    while((p=reP.exec(f[1]))){const b=p[1];
      const n=(b.match(/<name>([\s\S]*?)<\/name>/)||[])[1];const t=(b.match(/<description>([\s\S]*?)<\/description>/)||[])[1];
      const c=(b.match(/<coordinates>([\s\S]*?)<\/coordinates>/)||[])[1];if(!n||!t||!c)continue;
      const pts=c.trim().split(/\s+/).map(x=>{const v=x.split(',');return[+v[0],+v[1]];});
      (out[t.trim()]=out[t.trim()]||[]).push([n.trim(),pts]);}}
  return out;}
function redeProcessar(K,opt={}){
  const MIN_TDS=opt.minTds??2,MIN_KM=opt.minKm??1.0;
  const tr=K['TRECHO']||[];if(!tr.length)throw new Error('KML sem trechos (pasta "Trechos").');
  const pos=new Map(),adj=new Map(),edges=[];
  const add=(a,b)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);};
  for(const[n,pts]of tr){const[a,b]=n.replace('_lig','').split('_');
    if(!pos.has(a))pos.set(a,pts[0]);if(!pos.has(b))pos.set(b,pts[pts.length-1]);
    add(a,b);add(b,a);edges.push([a,b,_rkm(pts[0],pts[pts.length-1])]);}
  const comp=new Map();let nc=0;
  for(const n of adj.keys()){if(comp.has(n))continue;const st=[n];comp.set(n,nc);
    while(st.length){const x=st.pop();for(const y of adj.get(x))if(!comp.has(y)){comp.set(y,nc);st.push(y);}}nc++;}
  const r3=v=>Math.round(v*1000)/1000,gk=(x,y)=>r3(x)+'|'+r3(y);
  const grid=new Map();for(const[n,p]of pos){const k=gk(p[0],p[1]);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(n);}
  const near=(p,r)=>{const o=[];for(const dx of[-.001,0,.001])for(const dy of[-.001,0,.001]){const l=grid.get(gk(p[0]+dx,p[1]+dy));if(l)for(const n of l)if(_rkm(p,pos.get(n))<=r)o.push(n);}return o;};
  const SW=['CHAVE-FUSIVEL','CHAVE','RELIGADOR','DISJUNTOR','REGULADOR'];
  const sw=[];for(const t of SW)for(const[n,pts]of(K[t]||[]))sw.push([t,n,pts[0]]);
  const zkm0=new Map();for(const[a,b,l]of edges){const z=comp.get(a);zkm0.set(z,(zkm0.get(z)||0)+l);}
  const grupos=new Map();for(const s of sw){const k=Math.round(s[2][0]*1e4)+'|'+Math.round(s[2][1]*1e4);if(!grupos.has(k))grupos.set(k,{p:s[2],d:[]});grupos.get(k).d.push(s);}
  const gz=new Map(),zg=new Map();
  for(const[k,g]of grupos){const zs=[...new Set(near(g.p,.015).map(x=>comp.get(x)))].sort((a,b)=>a-b);gz.set(k,zs);for(const z of zs){if(!zg.has(z))zg.set(z,[]);zg.get(z).push(k);}}
  const first=tr[0][0].replace('_lig','').split('_')[0],root=comp.get(first);
  const parent=new Map([[root,null]]),order=[root],q=[root],usado=new Set();
  while(q.length){const z=q.shift();for(const k of(zg.get(z)||[]).slice().sort((a,b)=>{const A=a.split('|').map(Number),B=b.split('|').map(Number);return A[0]-B[0]||A[1]-B[1];})){if(usado.has(k))continue;usado.add(k);
      const D=gz.get(k).filter(y=>!parent.has(y)).sort((a,b)=>(zkm0.get(b)||0)-(zkm0.get(a)||0));if(!D.length)continue;
      const devs=grupos.get(k).d.slice().sort((a,b)=>((a[0]==='CHAVE-FUSIVEL')-(b[0]==='CHAVE-FUSIVEL'))||(a[1]<b[1]?-1:a[1]>b[1]?1:0));
      D.forEach((y,i)=>{const d=devs[Math.min(i,devs.length-1)];parent.set(y,[z,d[0],d[1],d[2]]);order.push(y);q.push(y);});}}
  const ram=new Map(),info=new Map([['Tronco',{parent:null,pos:pos.get(first),zones:[]}]]);
  for(const z of order){const pr=parent.get(z);
    if(!pr)ram.set(z,'Tronco');
    else if(pr[1]==='CHAVE-FUSIVEL'){let rid='CF-'+pr[2];while(info.has(rid))rid+="'";info.set(rid,{parent:ram.get(pr[0]),pos:pr[3],zones:[]});ram.set(z,rid);}
    else ram.set(z,ram.get(pr[0]));
    info.get(ram.get(z)).zones.push(z);}
  const zoneOf=p=>{const nn=near(p,.015);return nn.length?comp.get(nn[0]):null;};
  const tdz=[];const ztd=new Map();
  for(const[n,pts]of(K['TD']||[])){const z=zoneOf(pts[0]);tdz.push([n,pts[0],z]);if(z!=null)ztd.set(z,(ztd.get(z)||0)+1);}
  const kids=new Map();for(const[k,v]of info)if(v.parent){if(!kids.has(v.parent))kids.set(v.parent,[]);kids.get(v.parent).push(k);}
  const tot=new Map();
  const post=[];const st=['Tronco'];while(st.length){const k=st.pop();post.push(k);for(const c of(kids.get(k)||[]))st.push(c);}
  for(let i=post.length-1;i>=0;i--){const k=post[i];let a=0,b=0;for(const z of info.get(k).zones){a+=zkm0.get(z)||0;b+=ztd.get(z)||0;}
    for(const c of(kids.get(k)||[])){const t=tot.get(c);a+=t[0];b+=t[1];}tot.set(k,[a,b]);}
  const real=new Set([...info.keys()].filter(k=>k==='Tronco'||tot.get(k)[1]>=MIN_TDS||tot.get(k)[0]>=MIN_KM));
  const up=k=>{while(!real.has(k))k=info.get(k).parent;return k;};
  const chainOf=k=>{const c=[];k=up(k);while(k){c.push(k);const p=info.get(k).parent;k=p?up(p):null;}return c.reverse();};
  const seg={},rkm={},rtd={};
  for(const[a,b,l]of edges){const r=up(ram.get(comp.get(a)));(seg[r]=seg[r]||[]).push([pos.get(a),pos.get(b)]);rkm[r]=(rkm[r]||0)+l;}
  const equip={};
  for(const[n,p,z]of tdz){if(z==null)continue;const r=up(ram.get(z));rtd[r]=(rtd[r]||0)+1;equip['T'+n]=[p[1],p[0],r];}
  const TM={'CHAVE-FUSIVEL':'F','CHAVE':'C','RELIGADOR':'R','REGULADOR':'G','DISJUNTOR':'D'};
  const devs=[];
  for(const[t,n,p]of sw){const z=zoneOf(p);const r=z!=null?up(ram.get(z)):'Tronco';equip[TM[t]+n]=[p[1],p[0],r];if(t!=='CHAVE-FUSIVEL'&&t!=='CHAVE')devs.push([t,n,p[1],p[0]]);}
  const rinfo={};const subc={};for(const k of real){const c=chainOf(k);if(c.length>1)subc[c[c.length-2]]=(subc[c[c.length-2]]||0)+1;}
  for(const k of real){const c=chainOf(k),p=info.get(k).pos,t=tot.get(k);
    rinfo[k]={n:c.length-1,c:c,la:+p[1].toFixed(4),lo:+p[0].toFixed(4),kp:+(rkm[k]||0).toFixed(2),tp:rtd[k]||0,kj:+t[0].toFixed(2),tj:t[1],s:subc[k]||0};}
  return{seg,ram:rinfo,equip,devs,stats:{trechos:tr.length,tds:(K['TD']||[]).length,manobras:sw.length,km:+tot.get('Tronco')[0].toFixed(1),ramais:real.size-1,principais:Object.values(rinfo).filter(r=>r.n===1).length}};
}
// Geometria: une segmentos em polilinhas e codifica em inteiros (1e-4 grau) com delta
function redeCodificarGeo(seg){
  const out={};
  for(const[r,list]of Object.entries(seg)){
    const key=p=>Math.round(p[0]*1e4)+','+Math.round(p[1]*1e4);
    const adj=new Map();const E=list.map(([a,b],i)=>{const ka=key(a),kb=key(b);for(const k of[ka,kb]){if(!adj.has(k))adj.set(k,[]);}adj.get(ka).push(i);adj.get(kb).push(i);return[ka,kb];});
    const used=new Array(E.length).fill(false);const lines=[];
    const walk=(start,ei)=>{const pts=[start];let cur=start,e=ei;while(e!=null){used[e]=true;const nx=E[e][0]===cur?E[e][1]:E[e][0];pts.push(nx);cur=nx;const cand=adj.get(cur).filter(j=>!used[j]);e=(adj.get(cur).length===2&&cand.length===1)?cand[0]:null;}return pts;};
    const ends=[...adj.keys()].filter(k=>adj.get(k).length!==2);
    for(const k of ends)for(const e of adj.get(k))if(!used[e])lines.push(walk(k,e));
    E.forEach((ed,i)=>{if(!used[i])lines.push(walk(ed[0],i));});
    out[r]=lines.map(pts=>{let px=0,py=0;return pts.map(k=>{const[x,y]=k.split(',').map(Number);const s=(x-px)+','+(y-py);px=x;py=y;return s;}).join(' ');}).join('|');
  }
  return out;}
function redeDecodificarGeo(str){return str.split('|').map(l=>{let x=0,y=0;return l.split(' ').map(s=>{const[dx,dy]=s.split(',').map(Number);x+=dx;y+=dy;return[y/1e4,x/1e4];});});}

const MAPA_PERFIS = ['gerente','fiscal','fiscal_adm','empreiteira'];
const MAPA_STATUS = ['Em Execução','Atrasada','Obra Paralisada','Paral. Expirada','Prob. Executivo – Celesc','Aguard. Fiscalização','Ag. Fiscalização/Kaffa'];
const MAPA_COR_EXTRA = {'Obra Paralisada':'#9333EA','Paral. Expirada':'#7F1D1D','Ag. Fiscalização/Kaffa':'#EAB308'}; // cores próprias do mapa (distinguir de Atrasada)
const MAPA_TIPO_PREF = ['T','F','C','R','G','D']; // ordem de busca do nº: trafo primeiro
const MAPA_TIPO_NOME = {T:'Trafo',F:'Chave fusível',C:'Chave',R:'Religador',G:'Regulador',D:'Disjuntor'};
const MAPA_PAL = ['#7c6af7','#00b37e','#ff6b35','#e0a800','#ff4d6d','#38bdf8','#84cc16','#e879f9','#14b8a6','#f97316'];
const _mapa = { map:null, redes:{}, geo:{}, linhas:{}, net:null, pts:null, marks:{}, base:null, selR:null,
                carregado:false, carregando:null, f:{al:'',tipo:'',classe:'',status:'',emp:'',fiscal:'',cor:'status',busca:''} };
function _mEsc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _mClasse(o){ return o.tipo==='R1' ? (o.enquadramento||'R1 sem enquadramento')
  : o.tipo==='ODI' ? (o.descricaoODI==='Loteamento'?'Loteamento':'ODI livre') : (o.programa||(o.tipo?o.tipo+' sem programa':'Sem tipo')); }
function _mObras(){ return typeof visibleObras==='function' ? visibleObras() : (me.perfil==='empreiteira' ? obras.filter(o=>o.empreiteira===me.vinculo) : obras); }

async function _mapaCarregarRedes(forcar){
  if(_mapa.carregado && !forcar) return;
  if(_mapa.carregando && !forcar) return _mapa.carregando;
  _mapa.carregando = (async()=>{
    const [s1,s2] = await Promise.all([getDocs(collection(db,'redes')), getDocs(collection(db,'redes_geo'))]);
    _mapa.redes={}; _mapa.geo={};
    s1.docs.forEach(d=>{ try{ const x=d.data(); _mapa.redes[d.id]={...JSON.parse(x.meta), stats:x.stats||{}, atualizadoEm:x.atualizadoEm, por:x.por||''}; }catch(e){ console.warn('[Mapa] rede inválida',d.id,e); } });
    s2.docs.forEach(d=>{ try{ const g=JSON.parse(d.data().geo); _mapa.geo[d.id]=Object.fromEntries(Object.entries(g).map(([k,v])=>[k,redeDecodificarGeo(v)])); }catch(e){ console.warn('[Mapa] geo inválida',d.id,e); } });
    _mapa.carregado=true;
  })();
  try{ await _mapa.carregando; } finally { _mapa.carregando=null; }
}

function _mapaLocalizar(nr){
  if(nr==null||nr==='') return {erro:'Sem equipamento de referência'};
  const n=String(parseInt(nr));
  const achados=[];
  for(const [al,R] of Object.entries(_mapa.redes))
    for(const t of MAPA_TIPO_PREF){ const e=R.equip[t+n]; if(e) achados.push({al,t,lat:e[0],lon:e[1],ramal:e[2]}); }
  if(achados.length){ const a=achados[0]; a.ambiguo=achados.length>1 ? achados.map(x=>MAPA_TIPO_NOME[x.t]+' '+x.al).join(', ') : ''; return a; }
  const eq=window._equipDB?.get?.(parseInt(nr));
  if(eq && eq.lat && eq.lon) return {al:eq.feed?String(eq.feed):'', t:null, lat:eq.lat, lon:eq.lon, ramal:null, base:true};
  return {erro:`Equipamento ${n} não encontrado nas redes carregadas`};
}

function _mapaHTML(){
  const ger=me.perfil==='gerente';
  return `
  <style>
    #pgMapa .mp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px}
    #pgMapa .mp-f{display:flex;flex-direction:column;gap:3px;min-width:130px;flex:1}
    #pgMapa .mp-f label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
    #pgMapa select,#pgMapa input[type=text]{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px;width:100%}
    #pgMapa .mp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px}
    #pgMapa .mp-kpi{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px}
    #pgMapa .mp-kpi .k{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
    #pgMapa .mp-kpi .v{font-family:'DM Mono',monospace;font-size:18px;font-weight:500}
    #pgMapa .mp-main{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:10px}
    @media(max-width:900px){#pgMapa .mp-main{grid-template-columns:minmax(0,1fr)}}
    #pgMapa .mp-mapbox{position:relative;height:calc(100vh - 300px);min-height:460px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface2)}
    #mapaLeaflet{position:absolute;inset:0;background:var(--surface2)}
    #pgMapa .mp-base{position:absolute;top:10px;right:10px;z-index:1000;display:flex;background:var(--surface);border:1px solid var(--border);border-radius:7px;overflow:hidden}
    #pgMapa .mp-base button{border:0;background:transparent;color:var(--muted);padding:5px 9px;font-size:11px;cursor:pointer}
    #pgMapa .mp-base button.on{background:#7c6af7;color:#fff}
    #pgMapa .mp-leg{position:absolute;left:10px;bottom:22px;z-index:1000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:10px;max-height:45%;overflow:auto;max-width:240px;color:var(--text)}
    #pgMapa .mp-leg div{display:flex;align-items:center;gap:6px;margin:2px 0}
    #pgMapa .mp-side{background:var(--surface);border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;height:calc(100vh - 300px);min-height:460px}
    #pgMapa .mp-sh{padding:8px 12px;font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between}
    #pgMapa .mp-list{overflow:auto;flex:1}
    #pgMapa .mp-it{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;font-size:11px}
    #pgMapa .mp-it:hover{background:var(--surface2)}
    #pgMapa .mp-it .m{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);overflow-wrap:anywhere}
    #pgMapa .mk{display:block;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45)}
    #pgMapa .mk.R1{width:13px;height:13px;border-radius:50%}
    #pgMapa .mk.R2{width:13px;height:13px;border-radius:2px}
    #pgMapa .mk.ODI{width:12px;height:12px;transform:rotate(45deg)}
    #pgMapa .mp-sem{padding:8px 12px;font-size:10px;color:var(--muted);border-top:1px solid var(--border)}
    #pgMapa .mp-sem summary{cursor:pointer;font-weight:700}
    #pgMapa .mp-adm{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;display:none}
    #pgMapa .mp-adm table{width:100%;font-size:11px;border-collapse:collapse}
    #pgMapa .mp-adm td,#pgMapa .mp-adm th{padding:5px 6px;border-bottom:1px solid var(--border);text-align:left}
    .mapa-pop{font-size:11px;line-height:1.45;min-width:220px}
    .mapa-pop b.t{font-size:13px}
    .mapa-pop .path{font-family:'DM Mono',monospace;font-size:10px;color:#666;margin:3px 0 6px;overflow-wrap:anywhere}
  </style>
  <div class="tbl-head" style="margin-bottom:10px">
    <div class="page-title">🗺️ Mapa da Rede</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${ger?`<button class="btn btn-secondary btn-sm" onclick="mapaToggleAdm()">⚙️ Redes (KMZ)</button>`:''}
      <button class="btn btn-secondary btn-sm" onclick="mapaRecarregar()">🔄 Recarregar redes</button>
    </div>
  </div>
  ${ger?`<div class="mp-adm" id="mapaAdm">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <div style="font-size:11px;color:var(--muted)">Envie o KMZ exportado de cada alimentador. O processamento é feito no navegador e a rede fica disponível para todos os usuários do mapa. Reenviar um alimentador substitui a versão anterior.</div>
      <button class="btn btn-primary btn-sm" id="btnMapaKmz" onclick="mapaUploadKMZ()">⬆️ Enviar KMZ</button>
    </div>
    <div id="mapaAdmList"></div>
  </div>`:''}
  <div class="mp-bar">
    <div class="mp-f"><label for="mpAl">Alimentador</label><select id="mpAl"></select></div>
    <div class="mp-f"><label for="mpTipo">Tipo</label><select id="mpTipo"></select></div>
    <div class="mp-f"><label for="mpClasse">Programa / enquadramento</label><select id="mpClasse"></select></div>
    <div class="mp-f"><label for="mpStatus">Status</label><select id="mpStatus"></select></div>
    <div class="mp-f"${me.perfil==='empreiteira'?' style="display:none"':''}><label for="mpEmp">Empreiteira</label><select id="mpEmp"></select></div>
    <div class="mp-f"><label for="mpFiscal">Fiscal</label><select id="mpFiscal"></select></div>
    <div class="mp-f"><label for="mpCor">Colorir por</label><select id="mpCor">
      <option value="status">Status</option><option value="classe">Programa / enquadramento</option>${me.perfil==='empreiteira'?'':'<option value="empreiteira">Empreiteira</option>'}<option value="fiscal">Fiscal</option></select></div>
    <div class="mp-f" style="min-width:190px"><label for="mpBusca">Buscar obra ou equipamento</label><input type="text" id="mpBusca" placeholder="nº da obra ou do equipamento"></div>
  </div>
  <div style="font-size:11px;color:var(--muted);margin:-4px 0 10px">Mostra as obras em campo: Em Execução, Atrasada, Paralisada, Paral. Expirada, Problema Executivo e Aguardando Fiscalização${me.perfil==='empreiteira'?' — somente obras da sua empresa':''}.</div>
  <div class="mp-kpis">
    <div class="mp-kpi"><div class="k">Obras em campo no mapa</div><div class="v" id="mpK1">—</div></div>
    <div class="mp-kpi"><div class="k">Sem localização</div><div class="v" id="mpK2">—</div></div>
    <div class="mp-kpi"><div class="k">R1 · R2 · ODI</div><div class="v" id="mpK3">—</div></div>
    <div class="mp-kpi"><div class="k">Aguardando fiscalização</div><div class="v" id="mpK5">—</div></div>
    <div class="mp-kpi"><div class="k">Redes carregadas</div><div class="v" id="mpK4">—</div></div>
  </div>
  <div class="mp-main">
    <div class="mp-mapbox"><div id="mapaLeaflet"></div>
      <div class="mp-base"><button id="mpbR" class="on" onclick="mapaBase('r')">Ruas</button><button id="mpbS" onclick="mapaBase('s')">Satélite</button><button id="mpbN" onclick="mapaBase('n')">Sem fundo</button></div>
      <div class="mp-leg" id="mpLeg"></div>
    </div>
    <div class="mp-side">
      <div class="mp-sh"><span>Obras filtradas</span><span id="mpCnt"></span></div>
      <div class="mp-list" id="mpList"></div>
      <details class="mp-sem" id="mpSemBox"><summary id="mpSemTit">Sem localização</summary><div id="mpSem" style="margin-top:6px;max-height:160px;overflow:auto"></div></details>
    </div>
  </div>`;
}

window.renderMapa = async function(){
  const pg=document.getElementById('pgMapa'); if(!pg) return;
  if(typeof L==='undefined'){ pg.innerHTML='<div class="empty"><div class="ico">🗺️</div><p>Biblioteca de mapas não carregou. Verifique a conexão e recarregue a página.</p></div>'; return; }
  if(!_mapa.map){
    pg.innerHTML=_mapaHTML();
    _mapa.map=L.map('mapaLeaflet',{preferCanvas:true}).setView([-27.8,-50.3],9);
    _mapa.bases={ r:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Mapa © Esri'}),
                  s:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagens © Esri'}) };
    _mapa.base=_mapa.bases.r.addTo(_mapa.map);
    _mapa.net=L.layerGroup().addTo(_mapa.map); _mapa.pts=L.layerGroup().addTo(_mapa.map);
    const bind=(id,key,ev='change')=>document.getElementById(id).addEventListener(ev,e=>{ _mapa.f[key]=e.target.type==='checkbox'?e.target.checked:e.target.value; if(key==='al'){_mapa.selR=null;_mapaDesenharRede(true);} _mapaRender(); });
    bind('mpAl','al'); bind('mpTipo','tipo'); bind('mpClasse','classe'); bind('mpStatus','status'); bind('mpEmp','emp'); bind('mpFiscal','fiscal'); bind('mpCor','cor'); bind('mpBusca','busca','input');
  }
  setTimeout(()=>_mapa.map.invalidateSize(),50);
  document.getElementById('mpK4').textContent='…';
  try{ await _mapaCarregarRedes(); }catch(e){ console.error('[Mapa]',e); toast('Erro ao carregar as redes do mapa.','err'); }
  _mapaDesenharRede(true); _mapaRender(); _mapaAdmLista();
};
window.mapaAtualizarObras = function(){ if(_mapa.map) _mapaRender(); };
window.mapaRecarregar = async function(){ await _mapaCarregarRedes(true); _mapaDesenharRede(true); _mapaRender(); _mapaAdmLista(); toast('Redes recarregadas.'); };
window.mapaBase = function(k){
  if(_mapa.base) _mapa.map.removeLayer(_mapa.base);
  _mapa.base = k==='n' ? null : _mapa.bases[k].addTo(_mapa.map); _mapa.baseK=k;
  Object.entries(_mapa.linhas).forEach(([key,l])=>{ const [a,kk]=key.split('|'); l.setStyle(_mapaEstiloLinha(a,kk)); });
  if(_mapa.selR) _mapaRealcarRamal(..._mapa.selR);
  ['R','S','N'].forEach(x=>document.getElementById('mpb'+x).classList.toggle('on',x.toLowerCase()===k));
};

function _mapaEstiloLinha(al,k){
  const R=_mapa.redes[al]?.ram?.[k];
  const fundo=_mapa.baseK||'r', claro=document.body.classList.contains('light-theme');
  if(k==='Tronco') return {color: fundo==='s' ? '#ffffff' : fundo==='r' ? '#1f2937' : (claro?'#1f2937':'#e5e7eb'), weight:3.2, opacity:.95};
  return {color: fundo==='s' ? '#cbd5e1' : '#6b8f8a', weight:Math.max(1.2,2.4-(R?.n||1)*.2), opacity: fundo==='s' ? .85 : .8};
}
function _mapaDesenharRede(fit){
  if(!_mapa.net) return;
  _mapa.net.clearLayers(); _mapa.linhas={};
  const als=Object.keys(_mapa.geo).filter(a=>!_mapa.f.al||a===_mapa.f.al);
  als.forEach(al=>{
    const G=_mapa.geo[al], R=_mapa.redes[al]; if(!R) return;
    Object.keys(G).sort((a,b)=>(a==='Tronco')-(b==='Tronco')).forEach(k=>{
      const l=L.polyline(G[k],_mapaEstiloLinha(al,k)).addTo(_mapa.net);
      _mapa.linhas[al+'|'+k]=l;
      const r=R.ram[k]||{c:['Tronco'],tj:0};
      l.bindTooltip(()=>`${_mEsc(al)} › ${_mEsc(r.c.slice(1).join(' › ')||'Tronco')} · ${r.tj} trafos`,{sticky:true});
      l.on('click',()=>_mapaRealcarRamal(al,k));
    });
    (R.devs||[]).forEach(([t,n,la,lo])=>{
      if(t==='DISJUNTOR') L.circleMarker([la,lo],{radius:7,color:'#7c6af7',weight:3,fillColor:'#fff',fillOpacity:1}).bindTooltip('Saída '+_mEsc(al)).addTo(_mapa.net);
      else if(t==='RELIGADOR') L.circleMarker([la,lo],{radius:4,color:'#fff',weight:1.5,fillColor:'#475569',fillOpacity:1}).bindTooltip('Religador '+_mEsc(n)).addTo(_mapa.net);
      else if(t==='REGULADOR') L.circleMarker([la,lo],{radius:4,color:'#fff',weight:1.5,fillColor:'#475569',fillOpacity:1}).bindTooltip('Regulador '+_mEsc(n)).addTo(_mapa.net);
    });
  });
  if(_mapa.selR) _mapaRealcarRamal(..._mapa.selR);
  if(fit){ const ls=Object.values(_mapa.linhas); if(ls.length){ const b=L.featureGroup(ls).getBounds(); if(b.isValid()) _mapa.map.fitBounds(b.pad(.03)); } }
}
function _mapaRealcarRamal(al,k){
  _mapa.selR=[al,k];
  Object.entries(_mapa.linhas).forEach(([key,l])=>{ const [a,kk]=key.split('|'); l.setStyle(_mapaEstiloLinha(a,kk)); });
  if(k==='Tronco') return;
  Object.entries(_mapa.linhas).forEach(([key,l])=>{ const [a,kk]=key.split('|'); const r=_mapa.redes[a]?.ram?.[kk];
    if(a===al && r && r.c.includes(k)){ l.setStyle({color:'#ff6b35',weight:3.4,opacity:1}); l.bringToFront(); } });
}
function _mapaOpts(id,vals,todos){
  const el=document.getElementById(id); if(!el) return; const cur=el.value;
  el.innerHTML=`<option value="">${todos}</option>`+[...new Set(vals.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')).map(v=>`<option value="${_mEsc(v)}">${_mEsc(v)}</option>`).join('');
  if([...el.options].some(o=>o.value===cur)) el.value=cur;
}
function _mapaRender(){
  if(!_mapa.pts) return;
  const ativos=_mObras().map(o=>({o, st:statusOf(o)})).filter(x=>MAPA_STATUS.includes(x.st))
    .map(x=>({...x, classe:_mClasse(x.o), loc:_mapaLocalizar(x.o.equipamentoRef)}));
  _mapaOpts('mpAl',[...new Set([...Object.keys(_mapa.redes),...ativos.map(x=>x.loc.al)])],'Todos');
  _mapaOpts('mpTipo',ativos.map(x=>x.o.tipo),'Todos'); _mapaOpts('mpClasse',ativos.map(x=>x.classe),'Todos');
  _mapaOpts('mpStatus',ativos.map(x=>x.st),'Todos'); _mapaOpts('mpEmp',ativos.map(x=>x.o.empreiteira),'Todas'); _mapaOpts('mpFiscal',ativos.map(x=>x.o.fiscal),'Todos');
  const f=_mapa.f, b=f.busca.trim().toLowerCase();
  const sel=ativos.filter(x=>(!f.tipo||x.o.tipo===f.tipo)&&(!f.classe||x.classe===f.classe)&&(!f.status||x.st===f.status)&&(!f.emp||x.o.empreiteira===f.emp)&&(!f.fiscal||x.o.fiscal===f.fiscal)
    &&(!b||String(x.o.numero||'').toLowerCase().includes(b)||String(x.o.equipamentoRef||'').includes(b)));
  const noMapa=sel.filter(x=>!x.loc.erro&&(!f.al||x.loc.al===f.al)), semLoc=sel.filter(x=>x.loc.erro);
  const vals=[...new Set(noMapa.map(x=>f.cor==='status'?x.st:f.cor==='classe'?x.classe:(x.o[f.cor]||'—')))].sort();
  const cmap={}; vals.forEach((v,i)=>cmap[v]=f.cor==='status'?(MAPA_COR_EXTRA[v]||STATUS_DEF[v]?.cor||'#888'):MAPA_PAL[i%MAPA_PAL.length]);
  const corDe=x=>cmap[f.cor==='status'?x.st:f.cor==='classe'?x.classe:(x.o[f.cor]||'—')];
  _mapa.pts.clearLayers(); _mapa.marks={};
  noMapa.forEach(x=>{
    const t=['R1','R2','ODI'].includes(x.o.tipo)?x.o.tipo:'R1';
    const m=L.marker([x.loc.lat,x.loc.lon],{icon:L.divIcon({className:'',html:`<i class="mk ${t}" style="background:${corDe(x)}"></i>`,iconSize:[16,16],iconAnchor:[8,8]})});
    m.bindPopup(()=>_mapaPopup(x),{maxWidth:320});
    m.on('click',()=>{ if(x.loc.ramal) _mapaRealcarRamal(x.loc.al,x.loc.ramal); });
    m.addTo(_mapa.pts); _mapa.marks[x.o.id]=m;
  });
  const cnt=t=>noMapa.filter(x=>x.o.tipo===t).length;
  document.getElementById('mpK1').textContent=noMapa.length;
  document.getElementById('mpK2').textContent=semLoc.length;
  document.getElementById('mpK3').textContent=`${cnt('R1')} · ${cnt('R2')} · ${cnt('ODI')}`;
  document.getElementById('mpK4').textContent=Object.keys(_mapa.redes).length;
  document.getElementById('mpK5').textContent=noMapa.filter(x=>x.st==='Aguard. Fiscalização'||x.st==='Ag. Fiscalização/Kaffa').length;
  document.getElementById('mpCnt').textContent=noMapa.length;
  const ttl={status:'Status',classe:'Programa / enquadramento',empreiteira:'Empreiteira',fiscal:'Fiscal'}[f.cor];
  document.getElementById('mpLeg').innerHTML=`<div style="font-weight:700;color:var(--muted);text-transform:uppercase;font-size:9px;letter-spacing:1px">${ttl}</div>`+
    vals.map(v=>`<div><i class="mk R1" style="background:${cmap[v]};width:9px;height:9px"></i>${_mEsc(v)}</div>`).join('')+
    `<div style="color:var(--muted);margin-top:4px">● R1 &nbsp;■ R2 &nbsp;◆ ODI</div>`;
  const list=document.getElementById('mpList');
  list.innerHTML=noMapa.length?noMapa.sort((a,b)=>String(a.o.numero).localeCompare(String(b.o.numero))).map(x=>{
    const t=['R1','R2','ODI'].includes(x.o.tipo)?x.o.tipo:'R1';
    return `<div class="mp-it" data-id="${_mEsc(x.o.id)}"><i class="mk ${t}" style="background:${corDe(x)};margin-top:3px"></i><div style="min-width:0">
      <div><b>${_mEsc(x.o.numero||'s/ nº')}</b> · ${_mEsc(x.o.tipo||'')} · ${_mEsc(x.classe)}</div>
      <div class="m">${_mEsc(x.loc.al||'?')} › ${_mEsc(x.loc.ramal||'—')} › ${_mEsc(x.o.equipamentoRef)}</div>
      <div style="margin-top:3px">${statusHtml(x.o)}</div></div></div>`;}).join('')
    :`<div style="padding:18px;font-size:11px;color:var(--muted)">${Object.keys(_mapa.redes).length?'Nenhuma obra em campo com localização para os filtros escolhidos.':'Nenhuma rede carregada ainda. O gerente envia os KMZ em ⚙️ Redes (KMZ).'}</div>`;
  list.querySelectorAll('.mp-it').forEach(el=>el.onclick=()=>{ const x=noMapa.find(y=>y.o.id===el.dataset.id); if(!x) return;
    _mapa.map.flyTo([x.loc.lat,x.loc.lon],15,{duration:.7}); setTimeout(()=>_mapa.marks[x.o.id]?.openPopup(),750); if(x.loc.ramal) _mapaRealcarRamal(x.loc.al,x.loc.ramal); });
  document.getElementById('mpSemTit').textContent=`Sem localização (${semLoc.length})`;
  document.getElementById('mpSem').innerHTML=semLoc.map(x=>`<div style="padding:3px 0;cursor:pointer" onclick="openObraModal('${_mEsc(x.o.id)}')"><b>${_mEsc(x.o.numero||'s/ nº')}</b> — ${_mEsc(x.loc.erro)}</div>`).join('')||'Todas as obras filtradas estão no mapa.';
}
function _mapaPopup(x){
  const o=x.o, l=x.loc, R=l.ramal?_mapa.redes[l.al]?.ram?.[l.ramal]:null;
  const cam=R?R.c.slice(1).join(' › '):'';
  const eqTxt=(l.t?MAPA_TIPO_NOME[l.t]+' ':'')+o.equipamentoRef;
  return `<div class="mapa-pop"><b class="t">Obra ${_mEsc(o.numero||'s/ nº')}</b> · ${_mEsc(o.tipo||'')}<br>
    <div class="path">${_mEsc(l.al||'?')}${cam?' › '+_mEsc(cam):l.ramal==='Tronco'?' › Tronco':''} › ${_mEsc(eqTxt)}</div>
    ${statusHtml(o)}
    <table style="margin-top:6px;font-size:11px;border-collapse:collapse">
      <tr><td style="color:#888;padding-right:8px">Classificação</td><td>${_mEsc(x.classe)}</td></tr>
      <tr><td style="color:#888;padding-right:8px">Empreiteira</td><td>${_mEsc(o.empreiteira||'—')}</td></tr>
      <tr><td style="color:#888;padding-right:8px">Fiscal</td><td>${_mEsc(o.fiscal||'—')}</td></tr>
      <tr><td style="color:#888;padding-right:8px">Cidade</td><td>${_mEsc(o.cidade||'—')}</td></tr>
      ${o.descricao?`<tr><td style="color:#888;padding-right:8px">Descrição</td><td>${_mEsc(o.descricao)}</td></tr>`:''}
      ${R?`<tr><td style="color:#888;padding-right:8px">Ramal</td><td>${R.tj} trafos · ${R.kj.toLocaleString('pt-BR')} km a jusante</td></tr>`:''}
    </table>
    ${l.ambiguo?`<div style="margin-top:5px;font-size:10px;color:#d97706">⚠️ Nº existe em mais de um equipamento: ${_mEsc(l.ambiguo)}. Mostrando o primeiro.</div>`:''}
    ${l.base?`<div style="margin-top:5px;font-size:10px;color:#888">Posição da Base Equipamentos (rede deste alimentador ainda não carregada).</div>`:''}
    <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openObraModal('${_mEsc(o.id)}')">Abrir obra</button></div>`;
}

// ── Administração das redes (gerente) ─────────────────────────────────
window.mapaToggleAdm=function(){ const el=document.getElementById('mapaAdm'); if(el){ el.style.display=el.style.display==='block'?'none':'block'; _mapaAdmLista(); } };
function _mapaAdmLista(){
  const el=document.getElementById('mapaAdmList'); if(!el) return;
  const rs=Object.entries(_mapa.redes).sort((a,b)=>a[0].localeCompare(b[0]));
  el.innerHTML=rs.length?`<table><tr><th>Alimentador</th><th>Rede</th><th>Trafos</th><th>Ramais</th><th>Atualizado</th><th></th></tr>`+
    rs.map(([al,r])=>{ const s=r.stats||{}; const dt=r.atualizadoEm?.toDate?r.atualizadoEm.toDate().toLocaleDateString('pt-BR'):'—';
      return `<tr><td><b>${_mEsc(al)}</b></td><td>${(s.km||0).toLocaleString('pt-BR')} km</td><td>${s.tds||0}</td><td>${s.ramais||0} (${s.principais||0} principais)</td><td>${dt} ${_mEsc(r.por)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="mapaExcluirRede('${_mEsc(al)}')">🗑️</button></td></tr>`; }).join('')+'</table>'
    :'<div style="font-size:11px;color:var(--muted)">Nenhuma rede enviada ainda.</div>';
}
window.mapaExcluirRede=async function(al){
  const btns=document.querySelectorAll('#mapaAdmList .btn-danger');
  const b=[...btns].find(x=>x.getAttribute('onclick').includes(`'${al}'`));
  if(b && !b.dataset.conf){ b.dataset.conf='1'; b.textContent='Confirmar exclusão'; setTimeout(()=>{ if(b.isConnected){ delete b.dataset.conf; b.textContent='🗑️'; } },4000); return; }
  try{ await deleteDoc(doc(db,'redes',al)); await deleteDoc(doc(db,'redes_geo',al)); toast(`Rede ${al} excluída.`); await window.mapaRecarregar(); }
  catch(e){ console.error(e); toast('Erro ao excluir rede: '+e.message,'err'); }
};
window.mapaUploadKMZ=function(){
  if(me.perfil!=='gerente') return;
  if(typeof JSZip==='undefined'){ toast('Biblioteca de leitura de KMZ não carregou.','err'); return; }
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.kmz,.kml'; inp.multiple=true;
  inp.onchange=async e=>{
    const files=[...e.target.files]; if(!files.length) return;
    const btn=document.getElementById('btnMapaKmz'); if(btn){ btn.disabled=true; }
    let ok=0;
    for(const file of files){
      try{
        if(btn) btn.textContent=`Processando ${file.name}…`;
        let kml;
        if(file.name.toLowerCase().endsWith('.kml')) kml=await file.text();
        else { const z=await JSZip.loadAsync(file); const n=Object.keys(z.files).find(x=>x.toLowerCase().endsWith('.kml')); if(!n) throw new Error('KMZ sem arquivo KML'); kml=await z.file(n).async('string'); }
        const m=file.name.toUpperCase().match(/[A-Z]{3}\d{2}/) || (kml.match(/<Document>\s*<name>([^<]+)<\/name>/)||[])[1]?.toUpperCase().match(/[A-Z]{3}\d{2}/);
        const al=m?m[0]:file.name.replace(/\.[^.]+$/,'').toUpperCase().replace(/[^A-Z0-9_-]/g,'');
        await new Promise(r=>setTimeout(r,20));
        const K=redeLerKML(kml); const r=redeProcessar(K);
        const meta=JSON.stringify({ram:r.ram,equip:r.equip,devs:r.devs}), geo=JSON.stringify(redeCodificarGeo(r.seg));
        if(meta.length>900000||geo.length>900000) throw new Error(`rede ${al} grande demais para o armazenamento (${Math.round(Math.max(meta.length,geo.length)/1024)} KB)`);
        await setDoc(doc(db,'redes',al),{alimentador:al,meta,stats:r.stats,atualizadoEm:serverTimestamp(),por:me.nome||me.email,arquivo:file.name});
        await setDoc(doc(db,'redes_geo',al),{alimentador:al,geo,atualizadoEm:serverTimestamp()});
        ok++; toast(`Rede ${al}: ${r.stats.km.toLocaleString('pt-BR')} km, ${r.stats.tds} trafos, ${r.stats.ramais} ramais.`);
      }catch(err){ console.error('[Mapa KMZ]',err); toast(`${file.name}: ${err.message}`,'err'); }
    }
    if(btn){ btn.disabled=false; btn.textContent='⬆️ Enviar KMZ'; }
    if(ok) await window.mapaRecarregar();
  };
  inp.click();
};

// ══ PLANEJAMENTO — núcleo de análise (v2619) ══
// ══ PLANEJAMENTO — núcleo de análise (sem dependências; roda no navegador e no node) ══
const PLAN_AMP = { // ampacidade de referência (A) — valores aproximados, ajustar conforme padrão CELESC
  '6 CU':120,'6 CAA':105,'4 CA':135,'4 CAA':140,'3 CAA':160,'2 CA':180,'2 CAA':180,'1/0 CA':240,'1/0 CAA':230,
  '2/0 CA':280,'2/0 CAA':270,'3/0 CA':320,'3/0 CAA':300,'4/0 CA':370,'4/0 CAA':340,'336.4 CA':510,'336.4 CAA':530,
  '477 CA':640,'477 CAA':670,'4.8 mm2-HS-ACO':40,'4.8 mm2-HS-ACO-ZIN':40,
  '35 mm2-SP-CAA-25kV-XLPE':190,'50 mm2-SP-AL-25kV-XLPE':225,'150 mm2-SP-AL-25kV-XLPE':420,'150 mm2-SP-AL-15kV-XLPE':420,
  '150 mm2-SP-AL-25kV-HDPE/XLPE':420,'185 mm2-SP-AL-25kV-XLPE':480,
  '35 mm2-RDS-CU-25kV-XLPE':190,'35 mm2-RDS-CU-25kV-EPR':190,'50 mm2-RDS-AL-25kV-XLPE':180,'50 mm2-RDS-AL-25kV-EPR':180,
  '50 mm2-RDS-CU-25kV-XLPE':220,'70 mm2-RDS-AL-25kV-XLPE':220,'120 mm2-RDS-AL-25kV-XLPE':300,'120 mm2-RDS-AL-25kV-EPR':300,
  '150 mm2-RDST-CU-25kV-XLPE':400
};
const PLAN_SECC = new Set(['FR','FU','CD','CE','RE','CP']); // dispositivos de seccionamento (sg da base de equipamentos)
const PLAN_MANOBRA = new Set(['CD','CE','RE','CP']);         // dispositivos que permitem manobra (transferência)
function _pkm(x1,y1,x2,y2){const t=Math.PI/180,dLa=(y2-y1)*t,dLo=(x2-x1)*t;const h=Math.sin(dLa/2)**2+Math.cos(y1*t)*Math.cos(y2*t)*Math.sin(dLo/2)**2;return 12742*Math.asin(Math.sqrt(h));}

// ── 1. Leitura do KML (string) ───────────────────────────────────────────
function planParseKML(s, onProg){
  const out={trechos:[],pts:[],ses:[]};let i=0,n=0;const L=s.length;
  while(true){
    const a=s.indexOf('<Placemark',i); if(a<0)break; const b=s.indexOf('</Placemark>',a); if(b<0)break; i=b+12;
    const p=s.slice(a,b);const d={};
    const re=/<SimpleData name="([^"]+)">([^<]*)<\/SimpleData>/g;let m;while((m=re.exec(p)))d[m[1]]=m[2].trim();
    const nm=(p.match(/<name>([^<]*)<\/name>/)||[])[1]||'';
    const cs=[];const rc=/<coordinates>([^<]*)<\/coordinates>/g;let c;while((c=rc.exec(p)))cs.push(c[1]);
    const pts=[];for(const cc of cs)for(const q of cc.trim().split(/\s+/)){const v=q.split(',');if(v.length>=2)pts.push([+v[0],+v[1]]);}
    const tipo=d.tipo||'';
    if(tipo.startsWith('TrechoPrimario')){ if(pts.length>=2) out.trechos.push({pts,alim:d.alim||'',cabo:d.cabo||'?',fase:d.fase||'',area:d.id_area_objeto||'',mun:d.nm_municipio||'',sub:tipo.endsWith('Subterraneo')}); }
    else if(tipo==='Subestacao') out.ses.push({nome:nm,pts});
    else if(pts.length) out.pts.push({tipo,nr:(d.nr_operacional||nm||'').replace(/\.0$/,''),alim:d.alim||'',area:d.id_area_objeto||'',mun:d.nm_municipio||'',fase:d.fase||'',x:pts[0][0],y:pts[0][1],nome:nm});
    if(onProg && (++n%5000===0)) onProg(a/L);
  }
  return out;
}

// ── 2. Base: árvore radial por alimentador + equipamentos + carregamento ─────
// eqRows: [{nr,ant,sg,uc,alimNum}] (planilha Qtd UC) ; carg: [{al,nr,kva,fases,tot,carreg,ucs}] (CSV)
function planBuild(K, eqRows, carg, opt={}){
  const log=opt.log||(()=>{});
  const kid=new Map();const X=[],Y=[];const vid=(x,y)=>{const k=Math.round(x*1e6)+','+Math.round(y*1e6);let v=kid.get(k);if(v===undefined){v=X.length;kid.set(k,v);X.push(x);Y.push(y);}return v;};
  const cabos=[],cabI=new Map(),muns=[],munI=new Map();
  const idx=(arr,map,v)=>{let i=map.get(v);if(i===undefined){i=arr.length;map.set(v,i);arr.push(v);}return i;};
  // arestas rotuladas
  const EA=[],EB=[],EL=[],ECab=[],EF=[],EAr=[],EMun=[],EAl=[];
  const alims=[],alI=new Map();
  for(const t of K.trechos){
    const al=idx(alims,alI,t.alim||'?'),cb=idx(cabos,cabI,t.cabo||'?'),mu=idx(muns,munI,t.mun||'');
    const nf=(t.fase||'').replace(/[^RST]/g,'').length||3;
    let pv=vid(t.pts[0][0],t.pts[0][1]);
    for(let k=1;k<t.pts.length;k++){const v=vid(t.pts[k][0],t.pts[k][1]);if(v===pv)continue;
      EA.push(pv);EB.push(v);EL.push(_pkm(X[pv],Y[pv],X[v],Y[v]));ECab.push(cb);EF.push(nf);EAr.push(t.area==='U'?1:0);EMun.push(mu);EAl.push(al);pv=v;}
  }
  const NV=X.length,NE=EA.length; log(`Rede: ${NV} vértices, ${NE} segmentos, ${alims.length} rótulos de alimentador`);
  // adjacência por alimentador (arestas com o mesmo rótulo)
  const adjAll=Array.from({length:NV},()=>[]);
  for(let e=0;e<NE;e++){adjAll[EA[e]].push(e);adjAll[EB[e]].push(e);}
  const heads=K.pts.filter(p=>p.tipo==='Alimentador');
  const feeders=[];const fI=new Map();
  // chaves abertas (NA): seccionadora/religador sem UC e sem filhos na planilha — a busca não atravessa
  const EQ0=new Map();for(const r of eqRows)EQ0.set(String(r.nr),r);const filhos0=new Set(eqRows.map(r=>String(r.ant)));
  // Lista oficial de chaves NA (opcional): quando informada, ela define quais chaves são NA
  const LNA=opt.listaNA&&opt.listaNA.length?new Map(opt.listaNA.map(r=>[String(r.nr),r])):null;
  const ehNA=(p,e,temFilhos)=>LNA?LNA.has(String(p.nr)):((p.tipo==='ChaveSeccionadora'||p.tipo==='ChaveSubterranea'||p.tipo==='Religador')&&e&&(+e.uc||0)===0&&!temFilhos);
  if(LNA){const inferidas=K.pts.filter(p=>(p.tipo==='ChaveSeccionadora'||p.tipo==='ChaveSubterranea'||p.tipo==='Religador')&&(()=>{const e=EQ0.get(p.nr);return e&&(+e.uc||0)===0&&!filhos0.has(p.nr);})()).map(p=>p.nr);
    const noKmz=new Set(K.pts.map(p=>p.nr));const naoAchadas=[...LNA.keys()].filter(n=>!noKmz.has(n));
    log(`Lista de NA: ${LNA.size} chaves (${naoAchadas.length} não encontradas no KMZ) · inferidas pela planilha e fora da lista: ${inferidas.filter(n=>!LNA.has(n)).length} (tratadas como fechadas)`);}
  const naOld=new Set();if(opt.bloquearNA!==false)for(const p of K.pts){if(!LNA&&p.tipo!=='ChaveSeccionadora'&&p.tipo!=='ChaveSubterranea'&&p.tipo!=='Religador')continue;
    const e=EQ0.get(p.nr);if(ehNA(p,e,filhos0.has(p.nr))){
      const o=kid.get(Math.round(p.x*1e6)+','+Math.round(p.y*1e6));if(o!==undefined)naOld.add(o);}}
  // UC (planilha) de dispositivos por vértice — usada para localizar o ponto aberto de laços sem NA
  const ucDevOld=new Map();for(const p of K.pts){if(!/Chave|Religador/.test(p.tipo))continue;const e=EQ0.get(p.nr);if(!e||e.sg==='FT'||e.sg==='FP')continue;
    const o=kid.get(Math.round(p.x*1e6)+','+Math.round(p.y*1e6));if(o!==undefined)ucDevOld.set(o,+e.uc||0);}
  // árvore: BFS por alimentador só por arestas do próprio rótulo (vértice pode existir em mais de um alimentador).
  // Laços: quebrados na chave NA que pertence ao laço (se houver), senão na aresta que fecha o laço.
  const nodeOld=[],nodePar=[],nodeE=[],nodeF=[];const nodeOf=new Map();let lacos=0,lacosNA=0;
  const bfs=(hv,al,forb)=>{const parE=new Map([[hv,-1]]);const q=[hv];const chords=[];
    for(let qi=0;qi<q.length;qi++){const v=q[qi];for(const e of adjAll[v]){if(EAl[e]!==al||forb.has(e))continue;const w=EA[e]===v?EB[e]:EA[e];
      if(parE.has(w)){if(parE.get(v)!==e&&parE.get(w)!==e)chords.push(e);continue;}parE.set(w,e);q.push(w);}}
    return{parE,q,chords:[...new Set(chords)]};};
  for(const h of heads){
    const al=alI.get(h.nome); if(al===undefined) continue;
    const hv=kid.get(Math.round(h.x*1e6)+','+Math.round(h.y*1e6)); if(hv===undefined) continue;
    const fi=feeders.length; feeders.push({nome:h.nome,x:h.x,y:h.y,area:h.area,mun:h.mun}); fI.set(h.nome,fi);
    const forb=new Set();let r=bfs(hv,al,forb);
    for(let it=0;it<3&&r.chords.length;it++){
      const up=v=>{const p=[];let x=v,k=0;while(x!==undefined&&k<1e6){const e=r.parE.get(x);if(e===undefined||e<0)break;p.push([x,e]);x=EA[e]===x?EB[e]:EA[e];k++;}return p;};
      let mudou=false;
      for(const c of r.chords){lacos++;const pa=up(EA[c]),pb=up(EB[c]);const sb=new Set(pb.map(z=>z[0]));
        // caminho do laço: pa até o LCA + pb até o LCA + corda
        let lca=null;const ciclo=[[EA[c],c]];for(const [x,e] of pa){if(sb.has(x)){lca=x;break;}ciclo.push([x,e]);}
        for(const [x,e] of pb){if(x===lca)break;ciclo.push([x,e]);}
        if(lca===null){const sa=new Set(pa.map(z=>z[0]));for(const [x] of pb)if(sa.has(x)){lca=x;break;}}
        const naV=ciclo.find(([x])=>naOld.has(x));
        if(naV){lacosNA++;const x=naV[0];// abre a chave: corta UM lado do laço na NA (a chave continua ligada pelo outro lado)
          const manter=r.parE.get(x);
          for(const e of adjAll[x]){if(EAl[e]!==al||e===manter)continue;const w=EA[e]===x?EB[e]:EA[e];if(ciclo.some(([y])=>y===w)||e===c){forb.add(e);mudou=true;}}}
        else{ // sem NA: abre logo a jusante do dispositivo com menor UC no laço
          const ord=[];for(let k=pa.length-1;k>=0;k--){} // (ordem não necessária)
          const cyc=ciclo.map(z=>z[0]);const devs=cyc.map((x,i)=>[i,ucDevOld.get(x)]).filter(z=>z[1]!==undefined);
          if(devs.length>=2){devs.sort((a,b)=>a[1]-b[1]);const [im,um]=devs[0];const n=cyc.length;
            // direção a jusante: vizinho de laço cujo dispositivo mais próximo tem UC menor ou igual
            const near=(dir)=>{for(let k=1;k<n;k++){const u=ucDevOld.get(cyc[(im+dir*k+n)%n]);if(u!==undefined)return u;}return Infinity;};
            const dir=near(1)<=near(-1)?1:-1;const a1=cyc[im],a2=cyc[(im+dir+n)%n];
            const e=adjAll[a1].find(e=>(EA[e]===a2||EB[e]===a2)&&EAl[e]===al);if(e!==undefined&&!forb.has(e)){forb.add(e);mudou=true;lacosNA++;}}}
      }
      if(!mudou)break;r=bfs(hv,al,forb);
    }
    nodeF.length;const base=nodeOld.length;feeders[fi].root=base;
    for(const v of r.q){nodeOf.set(v*64+fi,nodeOld.length);nodeOld.push(v);nodeF.push(fi);}
    for(let k=base;k<nodeOld.length;k++){const v=nodeOld[k];const e=r.parE.get(v);nodeE.push(e);
      nodePar.push(e<0?-1:nodeOf.get((EA[e]===v?EB[e]:EA[e])*64+fi));}
  }
  log(`Laços na rede: ${lacos} (${lacosNA} abertos na chave NA do próprio laço)`);
  const N=nodeOld.length;
  log(`Árvores: ${feeders.length} alimentadores, ${N} nós (${new Set(nodeOld).size} de ${NV} vértices)`);
  const V={x:new Float64Array(N),y:new Float64Array(N),par:new Int32Array(N),f:new Int16Array(N),cab:new Int16Array(N),fase:new Int8Array(N),urb:new Int8Array(N),mun:new Int16Array(N),len:new Float32Array(N)};
  for(let i=0;i<N;i++){const v=nodeOld[i];V.x[i]=X[v];V.y[i]=Y[v];V.par[i]=nodePar[i];V.f[i]=nodeF[i];const e=nodeE[i];
    if(e>=0){V.cab[i]=ECab[e];V.fase[i]=EF[e];V.urb[i]=EAr[e];V.mun[i]=EMun[e];V.len[i]=EL[e];}else{V.cab[i]=-1;V.fase[i]=3;V.urb[i]=0;V.mun[i]=-1;V.len[i]=0;}}
  // nós de um vértice antigo (pode haver mais de um alimentador); preferência pelo rótulo informado
  const nodesOfOld=new Map();for(let i=0;i<N;i++){const v=nodeOld[i];if(!nodesOfOld.has(v))nodesOfOld.set(v,[]);nodesOfOld.get(v).push(i);}
  const newId={};// compat
  const vAt=(x,y,al)=>{const o=kid.get(Math.round(x*1e6)+','+Math.round(y*1e6));if(o===undefined)return -1;const ns=nodesOfOld.get(o);if(!ns)return -1;
    if(al&&ns.length>1){const f=fI.get(al);const m=ns.find(n=>V.f[n]===f);if(m!==undefined)return m;}return ns[0];};
  const oldOfNode=i=>nodeOld[i];
  // ── equipamentos (planilha) ──
  const EQ=new Map();for(const r of eqRows){EQ.set(String(r.nr),r);}
  const filhosEq=new Map();for(const r of eqRows){const a=String(r.ant);if(!filhosEq.has(a))filhosEq.set(a,[]);filhosEq.get(a).push(String(r.nr));}
  const CG=new Map();for(const r of carg)CG.set(String(r.nr),r);
  // trafos
  const td=[];const tdV=new Map();
  for(const p of K.pts){if(!p.tipo.startsWith('TrafoDist'))continue;const v=vAt(p.x,p.y,p.alim);const e=EQ.get(p.nr),c=CG.get(p.nr);
    const uc=c&&c.ucs!=null?c.ucs:(e&&e.uc!=null?e.uc:0);
    const t={v,nr:p.nr,uc:+uc||0,kva:c?c.kva:null,tot:c?c.tot:null,carreg:c?c.carreg:null,fases:c?c.fases:(p.fase.replace(/[^RST]/g,'').length||null),urb:p.area==='U'?1:0,al:p.alim,x:p.x,y:p.y,q:c?c.queda:null};
    td.push(t);if(v>=0){if(!tdV.has(v))tdV.set(v,[]);tdV.get(v).push(td.length-1);}}
  // ancestrais (planilha) de cada trafo, p/ desambiguar ramo protegido
  const anc=nr=>{const s=new Set();let n=EQ.get(nr)?.ant,k=0;while(n&&k<80){s.add(String(n));n=EQ.get(String(n))?.ant;k++;}return s;};
  // filhos geométricos
  const ch=Array.from({length:N},()=>[]);for(let i=1;i<N;i++)if(V.par[i]>=0)ch[V.par[i]].push(i);
  // conjunto de trafos sob cada vértice (amostra limitada p/ desambiguação)
  // dispositivos
  const DEVT=new Set(['ChaveSeccionadora','ChaveFusivel','Religador','ChaveSubterranea']);
  const tdNr=new Set(td.map(t=>t.nr));
  const dev=[];const cut=new Uint8Array(N); // cut[c]=1 → aresta par(c)->c tem dispositivo
  const tdUnder=(c,lim=400)=>{const out=[];const st=[c];while(st.length&&out.length<lim){const x=st.pop();for(const ti of(tdV.get(x)||[]))out.push(td[ti].nr);for(const y of ch[x])st.push(y);}return out;};
  let ambig=0;
  for(const p of K.pts){if(!DEVT.has(p.tipo))continue;const e=EQ.get(p.nr);const sg=e?.sg||'';
    if(p.tipo==='ChaveFusivel'&&!(LNA&&LNA.has(p.nr))&&(sg==='FT'||sg==='FP'||(!sg&&tdNr.has(p.nr))))continue; // fusível de trafo
    const v=vAt(p.x,p.y,p.alim);if(v<0)continue;
    const na=!!ehNA(p,e,(filhosEq.get(p.nr)||[]).length>0);
    const d={v,nr:p.nr,tipo:p.tipo,sg:sg||({ChaveFusivel:'FR',ChaveSeccionadora:'CD',Religador:'RE',ChaveSubterranea:'CD'}[p.tipo]),uc:e?+e.uc||0:null,na,prot:[]};
    if(!na){const cs=ch[v];
      if(cs.length===1)d.prot=[cs[0]];
      else if(cs.length>1){ // escolhe ramos cujos trafos descendem do dispositivo na planilha
        const hit=cs.filter(c=>{const tl=tdUnder(c,60);return tl.some(n=>anc(n).has(p.nr));});
        if(hit.length&&hit.length<cs.length){d.prot=hit;}
        else if(hit.length===cs.length){d.prot=cs.slice();}
        else{ // sem trafos identificáveis: protege o menor ramo (derivação) se o dispositivo não estiver no tronco
          d.prot=cs.slice();ambig++;}
      }
      for(const c of d.prot)cut[c]=1;}
    dev.push(d);}
  // chaves não incorporadas (dados de cadastro)
  const devNrs=new Set(dev.map(d=>d.nr));const feedNomes=new Set(feeders.map(f=>f.nome));const chavesFora=[];
  for(const p of K.pts){if(!DEVT.has(p.tipo)||devNrs.has(p.nr)||!feedNomes.has(p.alim))continue;const e=EQ.get(p.nr);if(p.tipo==='ChaveFusivel'&&(e?.sg==='FT'||e?.sg==='FP'||tdNr.has(p.nr)))continue;
    const o=kid.get(Math.round(p.x*1e6)+','+Math.round(p.y*1e6));chavesFora.push({tipo:o===undefined?'Chave fora da rede (não toca nenhum trecho)':'Chave em trecho desconectado da SE',x:p.x,y:p.y,al:[p.alim],nr:p.nr});}
  log(`Dispositivos de seccionamento: ${dev.length} (${dev.filter(d=>d.na).length} NA, ${ambig} ambíguos)`);
  // ── interligações ──
  // vértice de fronteira: arestas de rótulos diferentes (ambos alimentadores existentes)
  const inSE=(x,y)=>K.ses.some(se=>{const P=se.pts;let ins=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const xi=P[i][0],yi=P[i][1],xj=P[j][0],yj=P[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;});
  const nearHead=(x,y)=>feeders.some(f=>_pkm(x,y,f.x,f.y)<0.3);
  const naByOld=new Map();for(const d of dev)if(d.na){const o=nodeOld[d.v];naByOld.set(o,d);}
  // NA não alcançadas na árvore (fora dos rótulos) também
  for(const p of K.pts){if(!DEVT.has(p.tipo))continue;const e=EQ.get(p.nr);
    if(!ehNA(p,e,(filhosEq.get(p.nr)||[]).length>0))continue;const o=kid.get(Math.round(p.x*1e6)+','+Math.round(p.y*1e6));if(o!==undefined&&!naByOld.has(o))naByOld.set(o,{v:(nodesOfOld.get(o)||[-1])[0],nr:p.nr,tipo:p.tipo,sg:e?.sg||'CD',uc:0,na:true,prot:[]});}
  const inter=[],incons=[];const usedNA=new Set();
  const front=new Map();
  for(let v=0;v<NV;v++){const s=new Set();for(const e of adjAll[v])s.add(EAl[e]);if(s.size>1){const names=[...s].map(a=>alims[a]).filter(a=>a&&a!=='?');if(new Set(names).size>1)front.set(v,[...new Set(names)]);}}
  for(const [v,names] of front){
    if(inSE(X[v],Y[v])||nearHead(X[v],Y[v]))continue;
    // busca NA mais próxima pelo grafo completo (até 600 m)
    const dist=new Map([[v,0]]);const q=[v];let found=null;
    for(let qi=0;qi<q.length;qi++){const a=q[qi];if(naByOld.has(a)){found=naByOld.get(a);break;}
      for(const e of adjAll[a]){const w=EA[e]===a?EB[e]:EA[e];const d=dist.get(a)+EL[e];if(d>0.6)continue;if(!dist.has(w)||dist.get(w)>d){dist.set(w,d);q.push(w);}}}
    if(found){if(usedNA.has(found.nr))continue;usedNA.add(found.nr);
      inter.push({nr:found.nr,x:X[v],y:Y[v],al:names,dNA:Math.round((dist.get(nodeOld[found.v]??-1)||0)*1000)});}
    else incons.push({tipo:'Troca de alimentador sem chave',x:X[v],y:Y[v],al:names,nr:''});
  }
  // NA com rótulos diferentes ao redor e não usadas
  for(const [o,d] of naByOld){if(usedNA.has(d.nr))continue;const s=new Set();for(const e of adjAll[o])s.add(alims[EAl[e]]);
    if(s.size>1){usedNA.add(d.nr);inter.push({nr:d.nr,x:X[o],y:Y[o],al:[...s].filter(a=>a&&a!=='?'),dNA:0});}}
  // vértice de ancoragem em cada lado: o mais próximo pertencente à árvore de cada alimentador
  const fvByFeeder=(x,y,fi)=>{let best=-1,bd=1e9;const q=[kid.get(Math.round(x*1e6)+','+Math.round(y*1e6))];const seen=new Set(q);
    for(let qi=0;qi<q.length&&qi<4000;qi++){const a=q[qi];const nv=(nodesOfOld.get(a)||[]).find(n=>V.f[n]===fi);if(nv!==undefined){const d=_pkm(x,y,X[a],Y[a]);if(d<bd){bd=d;best=nv;}if(bd<0.001)break;}
      for(const e of adjAll[a]){const w=EA[e]===a?EB[e]:EA[e];if(!seen.has(w)){seen.add(w);q.push(w);}}}
    return best;};
  for(const it of inter){it.lados=it.al.map(a=>({al:a,v:fI.has(a)?fvByFeeder(it.x,it.y,fI.get(a)):-1}));}
  // NA que termina a rede sem tocar o outro alimentador (falha de desenho): procura nó de outro alimentador por proximidade
  const gridN=new Map();const gk2=(x,y)=>Math.round(x*500)+','+Math.round(y*500); // células ~200 m
  for(let i=0;i<N;i++){const k=gk2(V.x[i],V.y[i]);if(!gridN.has(k))gridN.set(k,[]);gridN.get(k).push(i);}
  const perto=(x,y,fi,raioKm)=>{let best=null;const cx=Math.round(x*500),cy=Math.round(y*500),r=Math.ceil(raioKm/0.2)+1;
    for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(const i of(gridN.get((cx+dx)+','+(cy+dy))||[])){if(V.f[i]===fi)continue;const d=_pkm(x,y,V.x[i],V.y[i]);if(d<=raioKm&&(!best||d<best.d))best={d,i};}return best;};
  const chOf=new Int32Array(N);for(let i=0;i<N;i++)if(V.par[i]>=0)chOf[V.par[i]]++;
  const gapKm=(opt.gapM??50)/1000;const naPonta=[];
  for(const d of dev){if(!d.na||usedNA.has(d.nr)||chOf[d.v]>0)continue;const fi=V.f[d.v];const x=V.x[d.v],y=V.y[d.v];
    const b=perto(x,y,fi,gapKm);
    if(b){usedNA.add(d.nr);const outro=feeders[V.f[b.i]].nome;inter.push({nr:d.nr,x,y,al:[feeders[fi].nome,outro],dNA:0,gapM:Math.round(b.d*1000),lados:[{al:feeders[fi].nome,v:d.v},{al:outro,v:b.i}]});}
    else{const sug=perto(x,y,fi,2);naPonta.push({tipo:'Chave NA na ponta da rede (sem continuidade)',x,y,al:[feeders[fi].nome],nr:d.nr,sug:sug?`${feeders[V.f[sug.i]].nome} a ${Math.round(sug.d*1000)} m`:''});}}
  if(LNA){const fIdx2=fI;for(const d of dev){if(!d.na||usedNA.has(d.nr))continue;const r=LNA.get(d.nr);if(!r||!r.als||!r.als.length)continue;const fi=V.f[d.v];const proprio=feeders[fi].nome;
      const outro=r.als.find(a=>a!==proprio&&fIdx2.has(a));if(!outro)continue;const fb=fIdx2.get(outro);let best=-1,bd=1e9;
      for(let i=0;i<N;i++){if(V.f[i]!==fb)continue;const dd=_pkm(V.x[d.v],V.y[d.v],V.x[i],V.y[i]);if(dd<bd){bd=dd;best=i;}}
      usedNA.add(d.nr);const k=naPonta.findIndex(z=>z.nr===d.nr);if(k>=0)naPonta.splice(k,1);
      inter.push({nr:d.nr,x:V.x[d.v],y:V.y[d.v],al:[proprio,outro],dNA:0,gapM:Math.round(bd*1000),lista:true,lados:[{al:proprio,v:d.v},{al:outro,v:best}]});}}
  log(`NA na ponta da rede: ${inter.filter(i=>i.gapM!=null).length} ligadas por proximidade (≤ ${opt.gapM??50} m), ${naPonta.length} sem continuidade`);
  // ── árvore operativa da planilha: agregados por equipamento ──
  const tdInfo=new Map(td.map(t=>[t.nr,t]));const naInter=new Set(inter.filter(i=>i.al.length>1).map(i=>i.nr));
  const pk=new Map();for(const r of eqRows){const a=String(r.ant);if(!pk.has(a))pk.set(a,[]);pk.get(a).push(String(r.nr));}
  const eqAg=new Map();const visit=(nr,depth)=>{ // pós-ordem iterativa
    const st=[[nr,0]];const outS=[];while(st.length){const [n,s_]=st.pop();if(s_===0){st.push([n,1]);for(const c of(pk.get(n)||[]))st.push([c,0]);}else outS.push(n);}
    for(const n of outS){const t=tdInfo.get(n);const a={uc:0,ucu:0,kva:0,td:0,na:0};
      if(t){a.uc+=t.uc;a.ucu+=t.urb?t.uc:0;a.kva+=(t.tot??(t.kva!=null?t.kva*0.5:0));a.td++;}
      if(naInter.has(n))a.na++;
      for(const c of(pk.get(n)||[])){const b=eqAg.get(c);if(b){a.uc+=b.uc;a.ucu+=b.ucu;a.kva+=b.kva;a.td+=b.td;a.na+=b.na;}}
      eqAg.set(n,a);}};
  for(const r of eqRows)if(!r.ant||!EQ.has(String(r.ant)))visit(String(r.nr));
  const eqInfo=Object.fromEntries([...EQ].map(([n,r])=>[n,{ant:String(r.ant),sg:r.sg,uc:r.uc}]));
  incons.push(...chavesFora,...naPonta);
  const stats={vertices:N,km:Array.from(V.len).reduce((a,b)=>a+b,0),trafos:td.length,disp:dev.length,na:dev.filter(d=>d.na).length,inter:inter.length,incons:incons.length,alimentadores:feeders.length,
    trafosSemUC:td.filter(t=>!t.uc).length,trafosSemCarreg:td.filter(t=>t.carreg==null).length};
  log(`Interligações: ${inter.length} · trocas de alimentador sem chave: ${incons.length}`);
  return {V,N,feeders,cabos,muns,td,dev,inter,incons,stats,eqAg:Object.fromEntries(eqAg),eqInfo};
}

// ── 3. Análise (roda no cliente a cada mudança de parâmetro) ───────────────
const PLAN_PARAM_PADRAO={ucUrb:500,ucRur:300,kmRur:5,kmUrb:2,ucBloco:150,derivTD:5,derivKm:2,derivProtM:50,kv:23,fc:0.7,utilMax:1.0,transfChave:1,cargaCaboMin:0.3,carregMax:100,ucPorKva:1.5,cabosPequenos:['4.8 mm2-HS-ACO','4.8 mm2-HS-ACO-ZIN','6 CU','4 CA']};
function _plCorrente(kva,fases,kv){return fases===1?kva*Math.sqrt(3)/kv:fases===2?kva/kv:kva/(Math.sqrt(3)*kv);}
function planPrep(B){ // estruturas derivadas (uma vez por carga)
  const N=B.N,V=B.V;const ch=Array.from({length:N},()=>[]);for(let i=0;i<N;i++)if(V.par[i]>=0)ch[V.par[i]].push(i);
  const cutDev=new Map();for(const d of B.dev)if(!d.na)for(const c of d.prot){if(!cutDev.has(c))cutDev.set(c,d);}
  const tdAt=new Map();B.td.forEach((t,i)=>{if(t.v>=0){if(!tdAt.has(t.v))tdAt.set(t.v,[]);tdAt.get(t.v).push(i);}});
  const anchor=new Int32Array(N);for(const it of B.inter)for(const l of(it.lados||[]))if(l.v>=0)anchor[l.v]++;
  // agregados de subárvore
  const sKm=new Float64Array(N),sUC=new Float64Array(N),sTD=new Int32Array(N),sKVA=new Float64Array(N),sNA=new Int32Array(N),sUCu=new Float64Array(N);
  for(let i=N-1;i>=0;i--){sKm[i]+=V.len[i];sNA[i]+=anchor[i];
    for(const ti of(tdAt.get(i)||[])){const t=B.td[ti];sUC[i]+=t.uc;sTD[i]++;sKVA[i]+=(t.tot??(t.kva!=null?t.kva*0.5:0));if(t.urb)sUCu[i]+=t.uc;}
    const p=V.par[i];if(p>=0){sKm[p]+=sKm[i];sUC[p]+=sUC[i];sTD[p]+=sTD[i];sKVA[p]+=sKVA[i];sNA[p]+=sNA[i];sUCu[p]+=sUCu[i];}}
  // ramal = a jusante de chave fusível (FR/FU); tronco = o restante (seccionado por CD/RE/CE)
  const ramal=new Uint8Array(N);for(let i=0;i<N;i++){const p=V.par[i];const d=cutDev.get(i);ramal[i]=(p>=0&&ramal[p])||(d&&(d.sg==='FR'||d.sg==='FU'))?1:0;}
  // confiança: dispositivo cuja UC geométrica a jusante bate com a planilha (±25%)
  const devOk=new Map();for(const d of B.dev){if(d.na||!d.prot.length||!(d.uc>0))continue;let g=0;for(const c of d.prot)g+=sUC[c];const r=g/d.uc;devOk.set(d,r>0.75&&r<1.33);}
  const conf=new Int8Array(N);for(let i=0;i<N;i++){const p=V.par[i];const d=cutDev.get(i);conf[i]=d&&devOk.has(d)?(devOk.get(d)?1:-1):(p>=0?conf[p]:1);}
  B._p={ch,cutDev,tdAt,anchor,sKm,sUC,sTD,sKVA,sNA,sUCu,ramal,conf};return B._p;}
function planAnalyze(B,P){
  P={...PLAN_PARAM_PADRAO,...(P||{})};const V=B.V,N=B.N;const X=B._p||planPrep(B);const {ch,cutDev,sKm,sUC,sTD,sKVA,sNA,sUCu}=X;
  const F=i=>B.feeders[V.f[i]]?.nome;const r1=v=>Math.round(v*10)/10;const pt=i=>[+V.y[i].toFixed(6),+V.x[i].toFixed(6)];
  const R={P};
  // Interligações = detectadas na base + registradas manualmente pelo gerente (NA cuja ligação não está desenhada)
  const fIdx=new Map(B.feeders.map((f,i)=>[f.nome,i]));const devNr=new Map(B.dev.map(d=>[d.nr,d]));
  const interTodas=[...B.inter];
  for(const m of(P.interManuais||[])){const d=devNr.get(String(m.nr));if(!d||!fIdx.has(m.al))continue;const fa=V.f[d.v];if(B.feeders[fa].nome===m.al)continue;
    let best=-1,bd=1e9;const fb=fIdx.get(m.al);for(let i=0;i<N;i++){if(V.f[i]!==fb)continue;const dd=_pkm(V.x[d.v],V.y[d.v],V.x[i],V.y[i]);if(dd<bd){bd=dd;best=i;}}
    const it={nr:d.nr,x:V.x[d.v],y:V.y[d.v],al:[B.feeders[fa].nome,m.al],dNA:0,manual:true,gapM:Math.round(bd*1000),lados:[{al:B.feeders[fa].nome,v:d.v},{al:m.al,v:best}]};
    const k=interTodas.findIndex(i=>i.nr===d.nr);if(k>=0)interTodas[k]=it;else interTodas.push(it);}
  const naDesc=new Map();for(const it of interTodas){if(it.al.length<2)continue;let a=B.eqInfo[it.nr]?.ant,k=0;while(a&&k<300){naDesc.set(a,(naDesc.get(a)||0)+1);a=B.eqInfo[a]?.ant;k++;}}
  // Itens 1 e 2 — ramais a jusante de dispositivo acima do limite de UCs sem interligação (árvore operativa da planilha)
  const ram=[];const flag=new Set();const devByNr=new Map(B.dev.map(d=>[d.nr,d]));
  for(const d of B.dev){if(d.na)continue;const ag=B.eqAg[d.nr];if(!ag||!ag.td)continue;
    const urb=ag.uc>0?ag.ucu/ag.uc>=0.5:V.urb[d.v]===1;const lim=urb?P.ucUrb:P.ucRur;const uc=d.uc!=null&&d.uc>0?d.uc:ag.uc;
    if(uc>lim&&!(naDesc.get(d.nr)>0)){flag.add(d.nr);d._m={uc,urb,ag};}}
  for(const nr of flag){let a=B.eqInfo[nr]?.ant,sub=false,k=0;while(a&&k<200){if(flag.has(a)){sub=true;break;}a=B.eqInfo[a]?.ant;k++;}
    if(sub)continue;const d=devByNr.get(nr);let km=0,tdg=0;for(const c of d.prot){km+=sKm[c];tdg+=sTD[c];}
    const ok=d._m.ag.td>0&&tdg/d._m.ag.td>0.75&&tdg/d._m.ag.td<1.33;
    const nest=[...flag].filter(n=>{let a=B.eqInfo[n]?.ant,k=0;while(a&&k<200){if(a===nr)return true;a=B.eqInfo[a]?.ant;k++;}return false;}).length;
    ram.push({nr,tipo:d.tipo,sg:d.sg,al:F(d.v),area:d._m.urb?'Urbana':'Rural',uc:Math.round(d._m.uc),km:ok?r1(km):null,trafos:d._m.ag.td,kva:Math.round(d._m.ag.kva),aninhados:nest,pos:pt(d.v),v:d.v,cut:d.prot});}
  ram.sort((a,b)=>b.uc-a.uc);for(const x of ram)x.key='RAMAL|'+x.nr;R.ramaisSemManobra=ram;R._ramFlag=new Set(flag);
  const alNA={};for(const it of interTodas)for(const a of it.al)alNA[a]=(alNA[a]||0)+(it.al.length>1?1:0);
  R.alimSemInter=B.feeders.map(f=>({al:f.nome,uc:Math.round(sUC[f.root]),km:r1(sKm[f.root]),inter:alNA[f.nome]||0})).filter(x=>x.inter===0&&x.uc>0);
  // Item 3 — blocos entre dispositivos
  const blk=new Int32Array(N);const blocks=[];
  for(let i=0;i<N;i++){const p=V.par[i];if(p<0||cutDev.has(i)){blk[i]=blocks.length;blocks.push({head:i,dev:cutDev.get(i)||null,al:F(i),km:0,uc:0,ucu:0,td:0});}else blk[i]=blk[p];
    const b=blocks[blk[i]];b.km+=V.len[i];for(const ti of(X.tdAt.get(i)||[])){const t=B.td[ti];b.uc+=t.uc;b.td++;if(t.urb)b.ucu+=t.uc;}}
  // subárvore dentro do bloco
  const bKm=new Float64Array(N),bUC=new Float64Array(N);
  for(let i=N-1;i>=0;i--){bKm[i]+=V.len[i];for(const ti of(X.tdAt.get(i)||[]))bUC[i]+=B.td[ti].uc;const p=V.par[i];if(p>=0&&blk[p]===blk[i]){bKm[p]+=bKm[i];bUC[p]+=bUC[i];}}
  const best=new Map();
  for(let i=0;i<N;i++){const b=blk[i];if(i===blocks[b].head)continue;const B_=blocks[b];
    const tot=sUC[B_.head];const sk=Math.max(bKm[i],B_.km-bKm[i]),su=Math.max(sUC[i],tot-sUC[i]);const cur=best.get(b);
    if(!cur||sk<cur.sk)best.set(b,{...(cur||{}),sk,vk:i});const c2=best.get(b);if(c2.su===undefined||su<c2.su){c2.su=su;c2.vu=i;}}
  const secc=[];
  blocks.forEach((b,bi)=>{const urb=b.uc>0?b.ucu/b.uc>=0.5:V.urb[b.head]===1;const mot=[];
    if(!urb&&b.km>P.kmRur)mot.push(`Rural ${r1(b.km)} km sem seccionamento`);
    if(urb&&b.km>P.kmUrb)mot.push(`Urbano ${r1(b.km)} km sem seccionamento`);
    if(b.uc>P.ucBloco)mot.push(`${Math.round(b.uc)} UCs sem seccionamento`);
    if(!mot.length)return;const bb=best.get(bi)||{};const porKm=mot[0].includes('km');const v=porKm?bb.vk:bb.vu;
    const tot=Math.round(sUC[b.head]);const ucPl=b.dev&&b.dev.uc!=null?b.dev.uc:null;
    const jus=v!=null?Math.round(sUC[v]):null,mon=v!=null?tot-jus:null;
    secc.push({al:b.al,area:urb?'Urbana':'Rural',inicio:b.dev?`${b.dev.sg} ${b.dev.nr}`:'Saída do alimentador',km:r1(b.km),uc:Math.round(b.uc),ucTotal:tot,ucPlanilha:ucPl,trafos:b.td,motivo:mot.join(' · '),
      sug:v!=null?pt(v):null,ucJus:jus,ucMon:mon,kmJus:v!=null?r1(bKm[v]):null,kmMon:v!=null?r1(b.km-bKm[v]):null,
      divide:v!=null?`${jus} a jusante / ${mon} a montante (total ${tot})`:'',head:b.head,v,blk:bi});});
  secc.sort((a,b)=>b.uc-a.uc||b.km-a.km);R.seccionamento=secc;R._blk=blk;
  R._blocos=blocks.map(b=>({head:b.head,rot:b.dev?`${b.dev.sg} ${b.dev.nr}`:`SAIDA ${b.al}`,al:b.al}));
  for(const x of secc)x.key='SECC|'+R._blocos[x.blk].rot;
  // Item 4 — derivações sem chave
  const deriv=[];
  for(let v=0;v<N;v++){const cs=ch[v];if(cs.length<2)continue;let main=cs[0];for(const c of cs)if(sKm[c]>sKm[main])main=c;
    for(const c of cs){if(c===main||cutDev.has(c))continue;
      // dispositivo logo no início (até derivProtM metros, sem bifurcar)?
      let x=c,acc=V.len[c],prot=false;while(acc*1000<=P.derivProtM){if(cutDev.has(x)){prot=true;break;}if(ch[x].length!==1)break;x=ch[x][0];acc+=V.len[x];}
      if(prot)continue;if(sTD[c]<P.derivTD&&sKm[c]<P.derivKm)continue;
      deriv.push({al:F(v),pos:pt(v),uc:Math.round(sUC[c]),km:r1(sKm[c]),trafos:sTD[c],area:(sUC[c]>0?sUCu[c]/sUC[c]>=0.5:V.urb[c]===1)?'Urbana':'Rural',v,c});}}
  deriv.sort((a,b)=>b.uc-a.uc);for(const x of deriv)x.key=`DERIV|${x.al}|${x.pos[0].toFixed(5)},${x.pos[1].toFixed(5)}`;R.derivacoes=deriv;
  // Item 5 e 6 — trechos
  const monoKm={},cabKm={};let monoTot=0;
  for(let i=0;i<N;i++){if(V.par[i]<0)continue;const al=F(i),cb=B.cabos[V.cab[i]]||'?';
    (cabKm[cb]=cabKm[cb]||{total:0,por:{}}).total+=V.len[i];cabKm[cb].por[al]=(cabKm[cb].por[al]||0)+V.len[i];
    if(V.fase[i]===1&&V.urb[i]===1){const m=B.muns[V.mun[i]]||'—';const k=al+'|'+m;monoKm[k]=(monoKm[k]||0)+V.len[i];monoTot+=V.len[i];}}
  R.monoUrbano={total:r1(monoTot),lista:Object.entries(monoKm).map(([k,v])=>({al:k.split('|')[0],mun:k.split('|')[1],km:Math.round(v*100)/100})).sort((a,b)=>b.km-a.km)};
  R.cabos=Object.entries(cabKm).map(([c,o])=>({cabo:c,km:r1(o.total),amp:PLAN_AMP[c]??null,pequeno:P.cabosPequenos.includes(c),por:Object.fromEntries(Object.entries(o.por).map(([a,v])=>[a,r1(v)]))})).sort((a,b)=>b.km-a.km);
  // Item 7 — interligações x cabo do TRONCO que recebe a carga
  // Cenário: abre-se a 1ª (ou 2ª) chave de manobra a montante da NA no alimentador que cede e fecha-se a NA.
  // Avalia-se só o tronco do alimentador que recebe (trechos fora de ramais com chave fusível), da NA até a SE.
  const ramalF=X.ramal;const nCh=Math.max(1,Math.round(P.transfChave||1));
  const transf=(v,naNr,lado)=>{const info=B.eqInfo[naNr];const pai=info?.ant;const dp=pai&&devByNr.get(pai);const ladoPai=dp?F(dp.v):null;
    if(pai&&ladoPai===lado){let a=pai,k=0,achou=0,ult=null;while(a&&k<200){const e=B.eqInfo[a];if(!e)break;
        if(PLAN_MANOBRA.has(e.sg)){achou++;ult=a;if(achou===nCh)break;}if(e.sg==='AL'){break;}a=e.ant;k++;}
      if(ult){const ag=B.eqAg[ult]||{kva:0,uc:0};const d=devByNr.get(ult);return{dev:{sg:B.eqInfo[ult].sg,nr:ult},node:d?d.prot[0]:null,kva:ag.kva,uc:ag.uc};}}
    let n=v,k=0,achou=0,last=null;while(n>=0&&k<200000){const d=cutDev.get(n);if(d&&PLAN_MANOBRA.has(d.sg)){achou++;last={dev:d,node:n};if(achou===nCh)break;}n=V.par[n];k++;}
    if(last)return{dev:last.dev,node:last.node,kva:sKVA[last.node],uc:sUC[last.node]};const f=B.feeders[V.f[v]];return{dev:null,node:f.root,kva:sKVA[f.root],uc:sUC[f.root]};};
  const caminhoTronco=(v,extra)=>{let n=v,pior=null,garg=null,k=0,ramalCab=null,ramalKm=0;
    while(n>=0&&V.par[n]>=0&&k<200000){const cb=B.cabos[V.cab[n]];
      if(ramalF[n]){ramalKm+=V.len[n];if(!ramalCab||(PLAN_AMP[cb]??1e9)<(PLAN_AMP[ramalCab]??1e9))ramalCab=cb;}
      else{const amp=PLAN_AMP[cb];if(amp){const I=_plCorrente((sKVA[n]+extra)*P.fc,V.fase[n]||3,P.kv);const u=I/amp;
        if(!pior||u>pior.util)pior={util:u,cabo:cb,I,amp,pos:pt(n)};if(!garg||amp<garg.amp)garg={cabo:cb,amp,pos:pt(n)};}}
      n=V.par[n];k++;}
    return{pior,garg,ramalCab,ramalKm};};
  const menorCaboEntre=(de,ate)=>{let n=de,m=null,k=0;while(n>=0&&n!==ate&&V.par[n]>=0&&k<200000){const cb=B.cabos[V.cab[n]];if(!m||(PLAN_AMP[cb]??1e9)<(PLAN_AMP[m]??1e9))m=cb;n=V.par[n];k++;}return m;};
  const inter=[];
  for(const it of interTodas){const L=it.lados.filter(l=>l.v>=0);const o={nr:it.nr,al:it.al.join(' / '),pos:[+it.y.toFixed(6),+it.x.toFixed(6)],dNA:it.dNA,gapM:it.gapM,manual:!!it.manual,dirs:[]};
    if(L.length===2){for(const [s,r] of [[L[0],L[1]],[L[1],L[0]]]){const t=transf(s.v,it.nr,s.al);const c=caminhoTronco(r.v,t.kva);
        o.dirs.push({de:s.al,para:r.al,abre:t.dev?`${t.dev.sg} ${t.dev.nr}`:'saída do alimentador',kva:Math.round(t.kva*P.fc),uc:Math.round(t.uc),
          util:c.pior?Math.round(c.pior.util*100):null,critico:c.pior?.cabo||null,critPos:c.pior?.pos||null,gargalo:c.garg?.cabo||null,
          naEmRamal:c.ramalKm>0?`${c.ramalCab} (${Math.round(c.ramalKm*10)/10} km de ramal até o tronco)`:null,
          trechoTransf:t.node!=null?menorCaboEntre(s.v,V.par[t.node]):null});}
      o.utilMax=Math.max(...o.dirs.map(d=>d.util||0));o.alerta=o.utilMax>P.utilMax*100;}
    else{o.externo=true;o.utilMax=null;o.alerta=false;}
    inter.push(o);}
  inter.sort((a,b)=>(b.utilMax||0)-(a.utilMax||0));for(const x of inter)x.key='INTER|'+x.nr;R.interligacoes=inter;
  R._interTodas=interTodas;
  // Item 10 — carregamento dos cabos na configuração atual
  const cc=[];const vis=new Uint8Array(N);const kvx=P.kv;
  const util=i=>{const amp=PLAN_AMP[B.cabos[V.cab[i]]];if(!amp)return null;return _plCorrente(sKVA[i]*P.fc,V.fase[i]||3,kvx)/amp;};
  for(let i=N-1;i>=0;i--){if(V.par[i]<0||vis[i])continue;const cb=B.cabos[V.cab[i]];const u=util(i);if(u==null||u<P.cargaCaboMin)continue;
    // agrupa o trecho contínuo de mesmo cabo acima do limite, subindo até onde continuar
    let n=i,km=0,umax=0,top=i,k=0;const nodes=[];while(n>=0&&V.par[n]>=0&&k<100000){const un=util(n);if(B.cabos[V.cab[n]]!==cb||un==null||un<P.cargaCaboMin)break;vis[n]=1;nodes.push(n);km+=V.len[n];if(un>umax){umax=un;top=n;}n=V.par[n];k++;}
    const amp=PLAN_AMP[cb];const I=_plCorrente(sKVA[top]*P.fc,V.fase[top]||3,kvx);
    cc.push({al:F(top),cabo:cb,fases:V.fase[top]||3,km:r1(km)||0.1,util:Math.round(umax*100),I:Math.round(I),amp,kva:Math.round(sKVA[top]*P.fc),uc:Math.round(sUC[top]),
      area:V.urb[top]?'Urbana':'Rural',ramal:ramalF[top]?'Ramal':'Tronco',conf:X.conf[top]>0?'Alta':'Baixa',pequeno:P.cabosPequenos.includes(cb)?'Sim':'',pos:pt(top),v:top,ini:i,nodes});}
  cc.sort((a,b)=>(a.conf===b.conf?0:a.conf==='Alta'?-1:1)||b.util-a.util);for(const x of cc)x.key=`CARGA|${x.cabo}|${x.pos[0].toFixed(5)},${x.pos[1].toFixed(5)}`;R.cargaCabos=cc;
  // Itens 8 e 9 — trafos
  R.trafos=B.td.filter(t=>t.v>=0).map(t=>({nr:t.nr,al:t.al||F(t.v),pos:[+t.y.toFixed(6),+t.x.toFixed(6)],kva:t.kva,carreg:t.carreg,uc:t.uc,ucKva:t.kva?Math.round(t.uc/t.kva*100)/100:null,urb:t.urb,queda:t.q}));
  R.trafosCarregados=R.trafos.filter(t=>t.carreg!=null&&t.carreg>P.carregMax).sort((a,b)=>b.carreg-a.carreg).map(t=>({...t,key:'TRAFO|'+t.nr}));
  R.trafosMuitasUC=R.trafos.filter(t=>t.ucKva!=null&&t.ucKva>P.ucPorKva&&(t.carreg==null||t.carreg<=P.carregMax)).sort((a,b)=>b.ucKva-a.ucKva).map(t=>({...t,key:'UCKVA|'+t.nr}));
  R.resumo={ramaisSemManobra:ram.length,alimSemInter:R.alimSemInter.length,seccionamento:secc.length,derivacoes:deriv.length,monoUrbanoKm:R.monoUrbano.total,
    cabosPequenosKm:r1(R.cabos.filter(c=>c.pequeno).reduce((a,c)=>a+c.km,0)),interligacoes:inter.length,interAlerta:inter.filter(i=>i.alerta).length,cargaCabos:cc.length,trafosCarregados:R.trafosCarregados.length,trafosMuitasUC:R.trafosMuitasUC.length,inconsistencias:B.incons.length};
  return R;}
// ── 6. Oportunidades no trecho de um equipamento (aviso no cadastro de obras) ──
function planLocalizarEquip(B,nr){nr=String(parseInt(nr));if(!nr||nr==='NaN')return null;const t=B.td.find(t=>t.nr===nr&&t.v>=0);if(t)return{tipo:'Trafo',nos:[t.v],ref:t.v};
  const d=B.dev.find(d=>d.nr===nr);if(d){return{tipo:d.sg,nos:d.prot.length?d.prot:[d.v],ref:d.v};}return null;}
function planOportunidadesNoTrecho(B,R,nr){const loc=planLocalizarEquip(B,nr);if(!loc)return{loc:null,itens:[]};const V=B.V,X=B._p,blk=R._blk;const P=R.P;
  const bset=new Set(loc.nos.map(n=>blk[n]));const itens=[];const r1=v=>Math.round(v*10)/10;
  if(!R._nosBloco){R._nosBloco=new Map();for(let i=0;i<B.N;i++){const b=blk[i];if(!R._nosBloco.has(b))R._nosBloco.set(b,[]);R._nosBloco.get(b).push(i);}}
  const nos=[];for(const b of bset)nos.push(...(R._nosBloco.get(b)||[]));const nset=new Set(nos);
  const rot=[...bset].map(b=>R._blocos[b].rot).join(' + ');
  for(const s of R.seccionamento)if(bset.has(s.blk))itens.push({key:s.key,tipo:'Seccionamento',titulo:`Instalar chave no trecho de ${s.inicio}`,det:`${s.km} km sem chave · nova chave divide ${s.ucJus} / ${s.ucMon} UCs`,pos:s.sug});
  for(const d of R.derivacoes)if(nset.has(d.v))itens.push({key:d.key,tipo:'Derivação sem chave',titulo:'Instalar chave no início da derivação',det:`${d.uc} UCs · ${d.km} km · ${d.trafos} trafos`,pos:d.pos});
  {let n=loc.ref,k=0;const vistos=new Set();while(n>=0&&k<200000){const cd=X.cutDev.get(n);if(cd&&R._ramFlag.has(cd.nr)&&!vistos.has(cd.nr)){vistos.add(cd.nr);const r=R.ramaisSemManobra.find(x=>x.nr===cd.nr);
      if(r)itens.push({key:r.key,tipo:'Ramal sem manobra',titulo:`Ramal ${r.sg} ${r.nr} sem interligação`,det:`${r.uc} UCs (${r.area}) sem chave NA para outro alimentador`,pos:r.pos});}n=V.par[n];k++;}}
  let mono=0;const cab={};for(const i of nos){if(V.par[i]<0)continue;if(V.fase[i]===1&&V.urb[i]===1)mono+=V.len[i];const cb=B.cabos[V.cab[i]];if(P.cabosPequenos.includes(cb))cab[cb]=(cab[cb]||0)+V.len[i];}
  const brot=[...bset].map(b=>R._blocos[b].rot).join('+');
  if(mono>0.005)itens.push({key:'MONO|'+brot,tipo:'Monofásico urbano',titulo:'Rede monofásica em área urbana',det:`${r1(mono)} km neste trecho`,pos:[V.y[loc.ref],V.x[loc.ref]]});
  for(const [cb,km] of Object.entries(cab))if(km>0.005)itens.push({key:`CABO|${cb}|${brot}`,tipo:'Cabo fora de padrão',titulo:`Substituir cabo ${cb}`,det:`${Math.round(km*100)/100} km de ${cb} neste trecho`,pos:[V.y[loc.ref],V.x[loc.ref]]});
  for(const it of R.interligacoes){if(it.externo)continue;const no=((R._interTodas||B.inter).find(i=>i.nr===it.nr)?.lados||[]).some(l=>l.v>=0&&nset.has(l.v));if(!no)continue;
    const crit=it.dirs.some(d=>(d.util||0)>(P.utilMax||1)*100);if(crit)itens.push({key:it.key,tipo:'Interligação',titulo:`Reforçar interligação NA ${it.nr} (${it.al})`,det:it.dirs.map(d=>`${d.de}→${d.para} ${d.util??'—'}% em ${d.critico||'—'}${d.naEmRamal?' · NA em ramal':''}`).join(' | '),pos:it.pos});}
  for(const c of R.cargaCabos)if(c.nodes.some(n=>nset.has(n)))itens.push({key:c.key,tipo:'Carregamento de cabo',titulo:`Cabo ${c.cabo} com ${c.util}% de utilização`,det:`${c.km} km · ${c.I} A de ${c.amp} A${c.conf==='Baixa'?' · baixa confiança':''}`,pos:c.pos});
  const tdSet=new Set(B.td.filter(t=>nset.has(t.v)).map(t=>t.nr));
  for(const t of R.trafosCarregados)if(tdSet.has(t.nr))itens.push({key:t.key,tipo:'Trafo carregado',titulo:`Trafo ${t.nr} com ${t.carreg}% de carregamento`,det:`${t.kva} kVA · ${t.uc} UCs`,pos:t.pos});
  for(const t of R.trafosMuitasUC)if(tdSet.has(t.nr))itens.push({key:t.key,tipo:'Trafo com muitas UCs',titulo:`Trafo ${t.nr} com ${t.ucKva} UCs/kVA`,det:`${t.kva} kVA · ${t.uc} UCs · ${t.carreg??'—'}%`,pos:t.pos});
  return{loc:{...loc,trecho:rot,al:B.feeders[V.f[loc.ref]]?.nome},itens};}
// trecho (blocos entre chaves) de um equipamento — usado para cruzar PVNT x obras
function planTrechoEquip(B,R,nr){const loc=planLocalizarEquip(B,nr);if(!loc)return null;const V=B.V,blk=R._blk;const bs=new Set(loc.nos.map(n=>blk[n]));
  return{bs,rot:[...bs].map(b=>R._blocos[b].rot).join(' + '),al:B.feeders[V.f[loc.ref]]?.nome||'',pos:[V.y[loc.ref],V.x[loc.ref]],tipo:loc.tipo};}
// ── 7. Publicação da rede para a aba Mapa (todos os alimentadores) ──
function planPublicarRedes(B){const V=B.V,N=B.N;const X=B._p||planPrep(B);const out={};
  const key=new Array(N);const chain=new Map([['Tronco',['Tronco']]]);
  for(let i=0;i<N;i++){const p=V.par[i];const d=X.cutDev.get(i);const fn=B.feeders[V.f[i]].nome;
    if(d&&(d.sg==='FR'||d.sg==='FU')){let k='CF-'+d.nr;key[i]=k;const pk=p>=0?key[p]:'Tronco';if(!chain.has(fn+'|'+k))chain.set(fn+'|'+k,[...(chain.get(fn+'|'+pk)||['Tronco']),k]);}
    else{key[i]=p>=0?key[p]:'Tronco';if(!chain.has(fn+'|Tronco'))chain.set(fn+'|Tronco',['Tronco']);}}
  for(let fi=0;fi<B.feeders.length;fi++){const f=B.feeders[fi];const ram={},seg={},equip={},devs=[['DISJUNTOR',f.nome,+f.y.toFixed(6),+f.x.toFixed(6)]];out[f.nome]={ram,seg,equip,devs};}
  for(let i=0;i<N;i++){const fn=B.feeders[V.f[i]].nome;const o=out[fn];const k=key[i];
    if(!o.ram[k]){const c=chain.get(fn+'|'+k)||['Tronco'];o.ram[k]={n:c.length-1,c,la:+V.y[i].toFixed(5),lo:+V.x[i].toFixed(5),kp:0,tp:0,kj:+X.sKm[i].toFixed(2),tj:X.sTD[i],s:0};}
    o.ram[k].kp+=V.len[i];const p=V.par[i];if(p>=0)(o.seg[k]=o.seg[k]||[]).push([[V.x[p],V.y[p]],[V.x[i],V.y[i]]]);}
  for(const t of B.td){if(t.v<0)continue;const o=out[B.feeders[V.f[t.v]].nome];o.equip['T'+t.nr]=[+t.y.toFixed(6),+t.x.toFixed(6),key[t.v]];o.ram[key[t.v]].tp++;}
  const TM={ChaveFusivel:'F',ChaveSeccionadora:'C',Religador:'R',ChaveSubterranea:'C'};
  for(const d of B.dev){const o=out[B.feeders[V.f[d.v]].nome];o.equip[(TM[d.tipo]||'C')+d.nr]=[+V.y[d.v].toFixed(6),+V.x[d.v].toFixed(6),key[d.v]];if(d.tipo==='Religador'&&!d.na)o.devs.push(['RELIGADOR',d.nr,+V.y[d.v].toFixed(6),+V.x[d.v].toFixed(6)]);}
  for(const o of Object.values(out))for(const r of Object.values(o.ram))r.kp=+r.kp.toFixed(2);
  return out;}
// ── 5. Mapa de calor de atuações ──
const PLAN_CAUSA_PROG=c=>/PROG\.?/i.test(c.causa||'');
function planCalor(B,R,A,f){f=f||{};const V=B.V;const X=B._p;const blk=R._blk;
  const linhas=A.linhas.filter(l=>!(f.semProg!==false&&PLAN_CAUSA_PROG(l))&&(!f.causa||String(l.cod)===String(f.causa))&&(!f.de||_plMes(l.mes)>=_plMes(f.de))&&(!f.ate||_plMes(l.mes)<=_plMes(f.ate)));
  const por=new Map();for(const l of linhas){const k=l.nr+'|'+l.tipo;let e=por.get(k);if(!e){e={nr:l.nr,tipo:l.tipo,al:l.al,q:0,causas:{}};por.set(k,e);}e.q+=l.q;e.causas[l.causa]=(e.causas[l.causa]||0)+l.q;}
  const devByNr=new Map(B.dev.map(d=>[d.nr,d]));const tdByNr=new Map(B.td.map(t=>[t.nr,t]));const feeder=new Map(B.feeders.map(fd=>[fd.nome,fd]));
  const blocos=new Map();const pontos=[];const lista=[];let semLoc=0,qSemLoc=0;
  for(const e of por.values()){const top=Object.entries(e.causas).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,q])=>`${c} (${q})`).join('; ');
    const ag=B.eqAg[e.nr];const uc=e.tipo==='AL'?(feeder.get(e.al)?Math.round(X.sUC[feeder.get(e.al).root]):null):(B.eqInfo[e.nr]?.uc??ag?.uc??null);
    const it={nr:e.nr,tipo:e.tipo,al:e.al,q:e.q,uc,ucq:uc!=null?Math.round(uc*e.q):null,causas:top,blocos:[],pos:null,km:null};
    if(e.tipo==='AL'){const fd=feeder.get(e.al);if(fd){it.blocos=[blk[fd.root]];it.pos=[fd.y,fd.x];}}
    else if(e.tipo==='FT'||e.tipo==='FP'){const t=tdByNr.get(e.nr);if(t&&t.v>=0){it.pos=[t.y,t.x];it.ponto=true;}}
    else{const d=devByNr.get(e.nr);if(d){it.pos=[V.y[d.v],V.x[d.v]];it.blocos=[...new Set(d.prot.map(c=>blk[c]))];}
      else{const t=tdByNr.get(e.nr);if(t&&t.v>=0){it.pos=[t.y,t.x];it.ponto=true;}}
      if(d&&!it.blocos.length){it.ponto=true;it.obs=d.na?'Chave sem trecho a jusante na planilha (tratada como NA)':'';}}
    if(!it.pos){semLoc++;qSemLoc+=e.q;}
    for(const b of it.blocos){const o=blocos.get(b)||{q:0,ucq:0,eq:[]};o.q+=e.q;o.ucq+=it.ucq||0;o.eq.push(e.nr);blocos.set(b,o);}
    if(it.ponto)pontos.push(it);lista.push(it);}
  // km dos blocos
  const kmB=new Map();for(let i=0;i<B.N;i++){const b=blk[i];if(blocos.has(b))kmB.set(b,(kmB.get(b)||0)+V.len[i]);}
  for(const it of lista)if(it.blocos.length){it.km=Math.round(it.blocos.reduce((a,b)=>a+(kmB.get(b)||0),0)*10)/10;it.porKm=it.km>0?Math.round(it.q/it.km*10)/10:null;}
  lista.sort((a,b)=>b.q-a.q);
  return{lista,blocos,pontos,kmB,semLoc,qSemLoc,total:linhas.reduce((a,l)=>a+l.q,0),prog:A.linhas.filter(PLAN_CAUSA_PROG).reduce((a,l)=>a+l.q,0)};}
function _plMes(m){const [mm,aa]=String(m).split('/');return(+aa)*12+(+mm);}
// ── 4. Serialização compacta da base (para gravar no Firestore) ──
function _encI(a){let p=0,o=[];for(let i=0;i<a.length;i++){const v=a[i];o.push(v-p);p=v;}return o.join(',');}
function _decI(s,T){const p=s?s.split(','):[];const a=new T(p.length);let v=0;for(let i=0;i<p.length;i++){v+=+p[i];a[i]=v;}return a;}
function planSerializar(B){const V=B.V;
  return JSON.stringify({v:2,N:B.N,x:_encI(Array.from(V.x,z=>Math.round(z*1e6))),y:_encI(Array.from(V.y,z=>Math.round(z*1e6))),
    par:_encI(V.par),f:_encI(V.f),cab:_encI(V.cab),fase:Array.from(V.fase).join(''),urb:Array.from(V.urb).join(''),mun:_encI(V.mun),len:Array.from(V.len,z=>Math.round(z*1e4)).join(','),
    feeders:B.feeders,cabos:B.cabos,muns:B.muns,
    td:B.td.map(t=>[t.v,t.nr,t.uc,t.kva,t.tot,t.carreg,t.fases,t.urb,t.al,+t.x.toFixed(6),+t.y.toFixed(6),t.q]),
    dev:B.dev.map(d=>[d.v,d.nr,d.tipo,d.sg,d.uc,d.na?1:0,d.prot]),inter:B.inter,incons:B.incons.map(i=>[+i.x.toFixed(6),+i.y.toFixed(6),i.al,i.tipo,i.nr||'',i.sug||'']),stats:B.stats,
    eqAg:Object.entries(B.eqAg).filter(([n,a])=>a.td>0||a.na>0).map(([n,a])=>[n,a.uc,a.ucu,Math.round(a.kva),a.td,a.na]),
    eqInfo:Object.entries(B.eqInfo).filter(([n,e])=>e.sg!=='FT').map(([n,e])=>[n,e.ant,e.sg,e.uc]),
    eqTdPai:Object.entries(B.eqInfo).filter(([n,e])=>e.sg==='FT').map(([n,e])=>[n,e.ant])});}
function planDesserializar(str){const o=JSON.parse(str);const N=o.N;
  const V={x:Float64Array.from(_decI(o.x,Int32Array),z=>z/1e6),y:Float64Array.from(_decI(o.y,Int32Array),z=>z/1e6),par:_decI(o.par,Int32Array),f:_decI(o.f,Int16Array),cab:_decI(o.cab,Int16Array),
    fase:Int8Array.from(o.fase,c=>+c),urb:Int8Array.from(o.urb,c=>+c),mun:_decI(o.mun,Int16Array),len:Float32Array.from(o.len.split(','),z=>+z/1e4)};
  const td=o.td.map(a=>({v:a[0],nr:a[1],uc:a[2],kva:a[3],tot:a[4],carreg:a[5],fases:a[6],urb:a[7],al:a[8],x:a[9],y:a[10],q:a[11]}));
  const dev=o.dev.map(a=>({v:a[0],nr:a[1],tipo:a[2],sg:a[3],uc:a[4],na:!!a[5],prot:a[6]}));
  const eqAg={};for(const a of o.eqAg)eqAg[a[0]]={uc:a[1],ucu:a[2],kva:a[3],td:a[4],na:a[5]};
  const eqInfo={};for(const a of o.eqInfo)eqInfo[a[0]]={ant:a[1],sg:a[2],uc:a[3]};for(const a of o.eqTdPai)eqInfo[a[0]]={ant:a[1],sg:'FT'};
  return{V,N,feeders:o.feeders,cabos:o.cabos,muns:o.muns,td,dev,inter:o.inter,incons:o.incons.map(a=>({tipo:a[3]||'Troca de alimentador sem chave',x:a[0],y:a[1],al:a[2],nr:a[4]||'',sug:a[5]||''})),stats:o.stats,eqAg,eqInfo};}
// ── Atuações (relatório SIMO "Atuações por Equipamento") ──
function planParseAtuacoes(linhas){
  const rx=/^\s*(?:(\d+)\s+([A-Z]{2})\s+)?([A-Z]{3})\s*-\s*(\d+)\s+(\d{2}\/\d{4})\s+(\d+)\s+(.*?)\s+(\d+)\s*$/;
  let eq=null;const out=[];let periodo='';
  for(const l of linhas){const p=l.match(/Per[ií]odo\s*:\s*(\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{4})/);if(p)periodo=p[1]+' a '+p[2];
    const m=l.match(rx);if(!m)continue;if(m[1])eq=[m[1],m[2]];if(!eq)continue;
    out.push({nr:eq[0],tipo:eq[1],al:m[3]+String(+m[4]).padStart(2,'0'),mes:m[5],cod:+m[6],causa:m[7].replace(/\s+/g,' ').trim(),q:+m[8]});}
  return{periodo,linhas:out};}
async function planLerPdfLinhas(pdf,onProg){ // pdf: documento pdf.js
  const linhas=[];for(let p=1;p<=pdf.numPages;p++){const pg=await pdf.getPage(p);const tc=await pg.getTextContent();
    const rows=new Map();for(const it of tc.items){if(!it.str)continue;const y=Math.round(it.transform[5]);let k=[...rows.keys()].find(z=>Math.abs(z-y)<=2);if(k===undefined){k=y;rows.set(k,[]);}rows.get(k).push([it.transform[4],it.str]);}
    for(const y of [...rows.keys()].sort((a,b)=>b-a)){const its=rows.get(y).sort((a,b)=>a[0]-b[0]);linhas.push(its.map(z=>z[1]).join(' '));}
    if(onProg&&p%20===0)onProg(p/pdf.numPages);}
  return linhas;}

// ══════════════════════════════════════════════════════════════════════
//  PLANEJAMENTO DA REDE (v2613) — aba exclusiva do gerente
//  Bases: KMZ da rede MT (ARLAG), planilha de UCs por equipamento (com árvore operativa)
//  e CSV de carregamento dos trafos. Processadas no navegador e gravadas no Firestore
//  (coleções 'plan_base' e 'plan_meta'). Análises recalculadas no cliente com parâmetros editáveis.
// ══════════════════════════════════════════════════════════════════════
const _pl={map:null,B:null,R:null,meta:null,an:'ramais',P:null,lay:{},sel:null,al:'',carregado:false,arquivos:{}};
const PL_ANALISES=[
  ['ramais','Ramais sem manobra','Itens 1 e 2 — ramais acima do limite de UCs sem chave NA para outro alimentador'],
  ['secc','Seccionamento','Item 3 — trechos longos ou com muitas UCs sem chave no meio, com ponto sugerido'],
  ['deriv','Derivações sem chave','Item 4 — novos ramais saindo do tronco ou de ramais sem chave no início'],
  ['mono','Monofásico urbano','Item 5 — rede monofásica em área urbana'],
  ['cabos','Cabos','Item 6 — filtro por tipo de cabo'],
  ['inter','Interligações x cabo','Item 7 — carga transferível e cabo crítico do tronco que recebe, em cada chave NA entre alimentadores'],
  ['cargacabo','Carregamento de cabos','Item 10 — utilização estimada dos cabos na configuração atual'],
  ['carreg','Trafos carregados','Item 8 — carregamento acima do limite'],
  ['ucs','Trafos com muitas UCs','Item 9 — muitas UCs para a potência, mesmo sem sobrecarga'],
  ['incons','Inconsistências','Pontos onde o alimentador do trecho muda sem chave (revisar cadastro)'],
  ['calor','Mapa de calor','Atuações não programadas: trecho que cada equipamento protege até o próximo equipamento'],
  ['pvnt','Obras PVNT previstas','Obras PVNT a executar (lista enviada): onde estão, obras em andamento e oportunidades no mesmo trecho'],
  ['oport','Oportunidades x obras','Melhorias apontadas no mesmo trecho de obras em andamento — vincular como nova R2 ou descartar']].filter(a=>a[0]!=='calor'); // calor: stand-by
const PL_PARAM_LBL=[['ucUrb','Limite UCs ramal urbano'],['ucRur','Limite UCs ramal rural'],['kmRur','Extensão máx. rural sem seccionar (km)'],['kmUrb','Extensão máx. urbana sem seccionar (km)'],
  ['ucBloco','UCs máx. sem seccionar'],['derivTD','Derivação: mín. trafos'],['derivKm','Derivação: mín. km'],['derivProtM','Chave até (m) do início da derivação'],
  ['kv','Tensão (kV)'],['fc','Fator de coincidência'],['utilMax','Utilização máx. do cabo (1 = 100%)'],['transfChave','Transferência até a chave nº (1 ou 2)'],['cargaCaboMin','Carregamento de cabo: mostrar a partir de (0,3 = 30%)'],['carregMax','Carregamento máx. trafo (%)'],['ucPorKva','UCs por kVA máx.']];
function _plEsc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function _plNum(v,d=0){return v==null||isNaN(v)?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:0});}
function _plParams(){let p={};try{p=JSON.parse(localStorage.getItem('sppc_plan_params')||'{}');}catch(e){}return{...PLAN_PARAM_PADRAO,...p};}

function _plHTML(){return `
<style>
 #pgPlanejamento .pl-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
 #pgPlanejamento .pl-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}
 #pgPlanejamento .pl-files{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:8px 0}
 #pgPlanejamento .pl-files label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;display:flex;flex-direction:column;gap:4px}
 #pgPlanejamento .pl-files input{font-size:11px;color:var(--text)}
 #pgPlanejamento .pl-log{font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);white-space:pre-wrap;max-height:120px;overflow:auto;margin-top:6px}
 #pgPlanejamento .pl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px}
 #pgPlanejamento .pl-kpi{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 11px;cursor:pointer;text-align:left;color:var(--text);font:inherit}
 #pgPlanejamento .pl-kpi.on{border-color:#7c6af7;box-shadow:0 0 0 1px #7c6af7 inset}
 #pgPlanejamento .pl-kpi .k{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
 #pgPlanejamento .pl-kpi .v{font-family:'DM Mono',monospace;font-size:18px;font-weight:500}
 #pgPlanejamento .pl-main{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:10px}
 @media(max-width:1000px){#pgPlanejamento .pl-main{grid-template-columns:minmax(0,1fr)}}
 #pgPlanejamento .pl-mapbox{position:relative;height:calc(100vh - 330px);min-height:480px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface2)}
 #plMap{position:absolute;inset:0;background:var(--surface2)}
 #pgPlanejamento .pl-base{position:absolute;top:10px;right:10px;z-index:1000;display:flex;background:var(--surface);border:1px solid var(--border);border-radius:7px;overflow:hidden}
 #pgPlanejamento .pl-base button{border:0;background:transparent;color:var(--muted);padding:5px 9px;font-size:11px;cursor:pointer}
 #pgPlanejamento .pl-base button.on{background:#7c6af7;color:#fff}
 #pgPlanejamento .pl-side{background:var(--surface);border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;height:calc(100vh - 330px);min-height:480px;overflow:hidden}
 #pgPlanejamento .pl-sh{padding:10px 12px;border-bottom:1px solid var(--border)}
 #pgPlanejamento .pl-sh .t{font-weight:700;font-size:13px}#pgPlanejamento .pl-sh .d{font-size:10px;color:var(--muted)}
 #pgPlanejamento .pl-tab{overflow:auto;flex:1}
 #pgPlanejamento table.pl{width:100%;border-collapse:collapse;font-size:11px}
 #pgPlanejamento table.pl th{position:sticky;top:0;background:var(--surface2);text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;color:var(--muted);letter-spacing:.5px;cursor:pointer;white-space:nowrap}
 #pgPlanejamento table.pl td{padding:5px 6px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;white-space:nowrap}
 #pgPlanejamento table.pl tr:hover td{background:var(--surface2);cursor:pointer}
 #pgPlanejamento table.pl tr.sel td{background:rgba(124,106,247,.18)}
 #pgPlanejamento .pl-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
 #pgPlanejamento .pl-params label{font-size:10px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
 #pgPlanejamento select,#pgPlanejamento input[type=number]{background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 7px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px}
 #pgPlanejamento .pl-cabos{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border);max-height:110px;overflow:auto}
 #pgPlanejamento .pl-cabos label{font-size:10px;border:1px solid var(--border);border-radius:12px;padding:2px 8px;display:flex;gap:4px;align-items:center;cursor:pointer}
 #pgPlanejamento .pl-leg{position:absolute;left:10px;bottom:22px;z-index:1000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:10px;color:var(--text);max-width:260px}
 #pgPlanejamento .pl-leg div{display:flex;gap:6px;align-items:center;margin:2px 0}
 #pgPlanejamento .pl-leg i{display:inline-block;width:14px;height:4px;border-radius:2px}
 .pl-pop{font-size:11px;line-height:1.45}.pl-pop b{font-size:12px}
</style>
<div class="pl-top">
  <div class="page-title">🧭 Planejamento da Rede</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <span id="plMeta" style="font-size:11px;color:var(--muted)"></span>
    ${me.perfil==='gerente'?`<button class="btn btn-secondary btn-sm" onclick="plToggle('plBases')">⚙️ Atualizar bases</button>`:'<span style="font-size:10px;color:var(--muted)">modo consulta</span>'}
    <button class="btn btn-secondary btn-sm" onclick="plToggle('plParams')">🎚️ Parâmetros</button>
  </div>
</div>
<div class="pl-box" id="plBases" style="display:none">
  <div style="font-size:11px;color:var(--muted)">Envie as três bases e clique em Processar. O processamento é feito no seu navegador (leva cerca de 10 a 30 segundos) e o resultado fica salvo para os demais gerentes.</div>
  <div class="pl-files">
    <label>1. Rede MT (KMZ da ARLAG)<input type="file" id="plFKmz" accept=".kmz,.kml"></label>
    <label>2. Qtd. UC por equipamento (Excel)<input type="file" id="plFUc" accept=".xlsx,.xls"></label>
    <label>3. Carregamento dos trafos (CSV)<input type="file" id="plFCg" accept=".csv,.txt"></label>
    <label>4. Lista de chaves NA (opcional, Excel ou CSV)<input type="file" id="plFNa" accept=".xlsx,.xls,.csv,.txt"></label>
  </div>
  <div style="font-size:10px;color:var(--muted);margin-bottom:6px">Lista de NA: uma linha por chave, com o nº da chave e, se possível, os dois alimentadores que ela interliga (ex.: <code>1067 · LUC03 · AGI02</code>). Quando enviada, ela define quais chaves são NA e cria a interligação mesmo onde a rede não está desenhada. <span id="plNaInfo"></span></div>
  <button class="btn btn-primary btn-sm" id="plBtnProc" onclick="plProcessar()">⚡ Processar e salvar</button>
  <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px">
    <div style="font-size:11px;color:var(--muted)">Obras PVNT a executar (Excel ou CSV com a <b>nota PS</b> e o <b>equipamento de referência</b>; descrição e município são opcionais). Servem de lembrete no planejamento: aparecem no mapa e no cadastro de obras do mesmo trecho. Pode ser atualizado a qualquer momento, sem reprocessar a rede. <span id="plPvntInfo"></span></div>
    <div class="pl-files"><label>Obras PVNT (Excel/CSV)<input type="file" id="plFPvnt" accept=".xlsx,.xls,.csv,.txt"></label></div>
    <button class="btn btn-primary btn-sm" id="plBtnPvnt" onclick="plSalvarPvnt()">📌 Salvar lista PVNT</button>
  </div>
  <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px;display:none" id="plAtuBox">
    <div style="font-size:11px;color:var(--muted)">Atuações (relatório SIMO "Atuações por Equipamento", em PDF). Pode ser atualizado separadamente, sem reprocessar a rede. Desligamentos programados (causas "PROG.") ficam fora da contagem.</div>
    <div class="pl-files"><label>4. Atuações (PDF do SIMO)<input type="file" id="plFAtu" accept=".pdf"></label></div>
    <button class="btn btn-primary btn-sm" id="plBtnAtu" onclick="plProcessarAtuacoes()">🔥 Processar atuações</button>
  </div>
  <div class="pl-log" id="plLog"></div>
</div>
<div class="pl-box" id="plParams" style="display:none">
  <div class="pl-params" id="plParamsGrid"></div>
  <div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="plAplicarParams()">Aplicar</button><button class="btn btn-secondary btn-sm" onclick="plParamsPadrao()">Restaurar padrão</button>
  <span style="font-size:10px;color:var(--muted);align-self:center">Ampacidades e fator de coincidência são valores de referência para triagem; confirme com estudo de fluxo antes de decidir obras.</span></div>
</div>
<div class="pl-kpis" id="plKpis"></div>
<div class="pl-main">
  <div class="pl-mapbox"><div id="plMap"></div>
    <div class="pl-base"><button id="plbR" class="on" onclick="plBase('r')">Ruas</button><button id="plbS" onclick="plBase('s')">Satélite</button><button id="plbN" onclick="plBase('n')">Sem fundo</button></div>
    <div class="pl-leg" id="plLeg"></div>
  </div>
  <div class="pl-side">
    <div class="pl-sh"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><div class="t" id="plTit"></div><div class="d" id="plDesc"></div></div>
      <div style="display:flex;gap:6px;align-items:center"><select id="plAl" title="Alimentador"></select><button class="btn btn-secondary btn-sm" onclick="plExportar()" title="Exportar tabela para Excel">⬇️ Excel</button></div></div></div>
    <div class="pl-cabos" id="plCabos" style="display:none"></div>
    <div class="pl-cabos" id="plCalorF" style="display:none;gap:6px;align-items:center"></div>
    <div class="pl-tab" id="plTab"></div>
  </div>
</div>`;}

window.renderPlanejamento=async function(){
  if(me.perfil!=='gerente'&&me.perfil!=='analista')return;const pg=document.getElementById('pgPlanejamento');if(!pg)return;
  if(typeof L==='undefined'){pg.innerHTML='<div class="empty"><p>Biblioteca de mapas não carregou.</p></div>';return;}
  if(!_pl.map){pg.innerHTML=_plHTML();_pl.P=_plParams();
    _pl.map=L.map('plMap',{preferCanvas:true}).setView([-27.8,-50.3],9);
    _pl.bases={r:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Mapa © Esri'}),
      s:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagens © Esri'})};
    _pl.baseK='r';_pl.base=_pl.bases.r.addTo(_pl.map);
    _pl.lay.rede=L.layerGroup().addTo(_pl.map);_pl.lay.an=L.layerGroup().addTo(_pl.map);_pl.lay.hl=L.layerGroup().addTo(_pl.map);
    document.getElementById('plAl').onchange=e=>{_pl.al=e.target.value;_plDesenharRede();_plMostrar(true);};
    _plParamsUI();}
  setTimeout(()=>_pl.map.invalidateSize(),50);
  if(!_pl.carregado){document.getElementById('plTab').innerHTML='<div style="padding:16px;font-size:11px;color:var(--muted)">Carregando base de planejamento…</div>';
    try{await _plCarregar();}catch(e){console.error('[Plan]',e);toast('Erro ao carregar a base de planejamento: '+e.message,'err');}}
  _plMostrar(true);
};
window.plToggle=id=>{const el=document.getElementById(id);if(el)el.style.display=el.style.display==='block'?'none':'block';};
window.plBase=k=>{if(_pl.base)_pl.map.removeLayer(_pl.base);_pl.base=k==='n'?null:_pl.bases[k].addTo(_pl.map);_pl.baseK=k;
  ['R','S','N'].forEach(x=>document.getElementById('plb'+x).classList.toggle('on',x.toLowerCase()===k));_plDesenharRede();_plMostrar(false);};

async function _plGarantirBase(){ // carrega base + análise sem depender da tela (usado também no cadastro de obras)
  if(_pl.B)return true;if(_pl._carregando)return _pl._carregando;
  _pl._carregando=(async()=>{const m=await getDoc(doc(db,'plan_meta','atual'));if(!m.exists())return false;_pl.meta=m.data();const partes=[];
    for(let i=0;i<_pl.meta.partes;i++){const d=await getDoc(doc(db,'plan_base','p'+i));partes.push(d.data().dados);}
    const z=await JSZip.loadAsync(partes.join(''),{base64:true});_pl.B=planDesserializar(await z.file('b.json').async('string'));planPrep(_pl.B);
    if(!_pl.P)_pl.P=_plParams();await _plCarregarInterManuais();await _plCarregarPvnt();_pl.R=planAnalyze(_pl.B,_pl.P);await _plCarregarOps();return true;})();
  try{return await _pl._carregando;}finally{_pl._carregando=null;}}
async function _plCarregarInterManuais(){try{const m=await getDoc(doc(db,'plan_meta','interManuais'));_pl.interManuais=m.exists()?(m.data().lista||[]):[];}catch(e){_pl.interManuais=[];}
  if(_pl.P)_pl.P.interManuais=_pl.interManuais;}
async function _plSalvarInterManuais(){await setDoc(doc(db,'plan_meta','interManuais'),{lista:_pl.interManuais,atualizadoEm:serverTimestamp(),por:me.nome||me.email});_pl.P.interManuais=_pl.interManuais;_plAnalisar();_plMostrar(false);}
window.plRegistrarInter=async function(nr){const sel=document.getElementById('plInterAl');const al=sel?.value;if(!al){toast('Escolha o alimentador do outro lado da chave.','warn');return;}
  _pl.interManuais=(_pl.interManuais||[]).filter(i=>String(i.nr)!==String(nr));_pl.interManuais.push({nr:String(nr),al,por:me.nome||me.email,em:new Date().toISOString().slice(0,10)});
  try{await _plSalvarInterManuais();toast(`Interligação ${nr} ↔ ${al} registrada.`);_pl.map.closePopup();}catch(e){toast('Erro ao registrar: '+e.message,'err');}};
window.plRemoverInter=async function(nr){_pl.interManuais=(_pl.interManuais||[]).filter(i=>String(i.nr)!==String(nr));
  try{await _plSalvarInterManuais();toast(`Registro manual da chave ${nr} removido.`,'warn');_pl.map.closePopup();}catch(e){toast('Erro: '+e.message,'err');}};
function _plOpcoesAlim(x,y,proprio){const B=_pl.B,V=B.V;const dist=new Map();for(let i=0;i<B.N;i++){const n=B.feeders[V.f[i]].nome;if(n===proprio)continue;const d=_pkm(x,y,V.x[i],V.y[i]);if(!dist.has(n)||d<dist.get(n))dist.set(n,d);}
  return [...dist.entries()].sort((a,b)=>a[1]-b[1]).map(([n,d])=>`<option value="${_plEsc(n)}">${_plEsc(n)} — ${d<1?Math.round(d*1000)+' m':_plNum(d,1)+' km'}</option>`).join('');}
async function _plCarregarOps(){_pl.ops=new Map();try{const s=await getDocs(collection(db,'oportunidades'));s.docs.forEach(d=>_pl.ops.set(d.data().key,{id:d.id,...d.data()}));}catch(e){console.warn('[Plan] oportunidades',e);}}
async function _plCarregar(){
  const ok=await _plGarantirBase();
  if(!ok){_pl.carregado=true;_pl.B=null;document.getElementById('plMeta').textContent='Nenhuma base processada ainda.';document.getElementById('plBases').style.display='block';return;}
  _pl.carregado=true;
  _plPvntInfo();
  try{const m=await getDoc(doc(db,'plan_meta','listaNA'));const el=document.getElementById('plNaInfo');if(el)el.innerHTML=m.exists()?`<b>Lista atual: ${m.data().lista.length} chaves (${_plEsc(m.data().arquivo||'')})</b>.`:'Nenhuma lista enviada ainda: NA deduzidas pela planilha de UCs.';}catch(e){}
  const dt=_pl.meta.atualizadoEm?.toDate?_pl.meta.atualizadoEm.toDate().toLocaleString('pt-BR'):'—';
  document.getElementById('plMeta').textContent=`Base de ${dt} · ${_pl.meta.por||''} · ${_plNum(_pl.B.stats.km)} km · ${_plNum(_pl.B.stats.trafos)} trafos`;
  const sel=document.getElementById('plAl');sel.innerHTML='<option value="">Todos os alimentadores</option>'+_pl.B.feeders.map(f=>f.nome).sort().map(n=>`<option>${_plEsc(n)}</option>`).join('');
  _plAnalisar();_plDesenharRede(true);
  try{await _plCarregarAtu();}catch(e){console.warn('[Plan] atuações',e);}
}
async function _plCarregarAtu(){const m=await getDoc(doc(db,'plan_meta','atuacoes'));if(!m.exists()){_pl.A=null;_pl.H=null;return;}const md=m.data();
  const partes=[];for(let i=0;i<md.partes;i++){const d=await getDoc(doc(db,'plan_atu','p'+i));partes.push(d.data().dados);}
  const z=await JSZip.loadAsync(partes.join(''),{base64:true});_pl.A=JSON.parse(await z.file('a.json').async('string'));_pl.A.meta=md;_plCalorCalc();}
function _plCalorCalc(){if(!_pl.A||!_pl.R)return;_pl.cf=_pl.cf||{causa:'',de:'',ate:'',metrica:'q'};_pl.H=planCalor(_pl.B,_pl.R,_pl.A,_pl.cf);_plKpis();}
function _plCalorLista(){const m=_pl.cf.metrica;return _pl.H.lista.filter(i=>i.pos).slice().sort((a,b)=>(b[m]??-1)-(a[m]??-1));}
function _plCalorUI(){const box=document.getElementById('plCalorF');const A=_pl.A;const meses=[...new Set(A.linhas.map(l=>l.mes))].sort((a,b)=>_plMes(a)-_plMes(b));
  const causas=[...new Map(A.linhas.filter(l=>!PLAN_CAUSA_PROG(l)).map(l=>[l.cod,l.causa])).entries()].sort((a,b)=>a[0]-b[0]);
  box.innerHTML=`<select id="plcDe" title="De">${meses.map(m=>`<option ${m===(_pl.cf.de||meses[0])?'selected':''}>${m}</option>`).join('')}</select>
    <select id="plcAte" title="Até">${meses.map(m=>`<option ${m===(_pl.cf.ate||meses[meses.length-1])?'selected':''}>${m}</option>`).join('')}</select>
    <select id="plcCausa" title="Causa"><option value="">Todas as causas não programadas</option>${causas.map(([c,t])=>`<option value="${c}" ${String(_pl.cf.causa)===String(c)?'selected':''}>${c} · ${_plEsc(t)}</option>`).join('')}</select>
    <select id="plcMet" title="Métrica"><option value="q" ${_pl.cf.metrica==='q'?'selected':''}>Atuações</option><option value="porKm" ${_pl.cf.metrica==='porKm'?'selected':''}>Atuações por km</option><option value="ucq" ${_pl.cf.metrica==='ucq'?'selected':''}>UCs × atuações</option></select>
    <span style="font-size:10px;color:var(--muted)">Período do relatório: ${_plEsc(A.periodo||'')} · ${_plNum(_pl.H.prog)} programadas excluídas · ${_pl.H.semLoc} equip. não localizados</span>`;
  const upd=()=>{_pl.cf={de:document.getElementById('plcDe').value,ate:document.getElementById('plcAte').value,causa:document.getElementById('plcCausa').value,metrica:document.getElementById('plcMet').value};_plCalorCalc();_plMostrar(false);};
  box.querySelectorAll('select').forEach(s=>s.onchange=upd);}
function _plDesenharCalor(leg){const H=_pl.H,B=_pl.B,V=B.V,blk=_pl.R._blk;const m=_pl.cf.metrica;
  const vals=[];const valBlk=new Map();
  for(const [b,o] of H.blocos){const km=H.kmB.get(b)||0;const v=m==='porKm'?(km>0?o.q/km:null):m==='ucq'?o.ucq:o.q;if(v!=null){valBlk.set(b,v);vals.push(v);}}
  vals.sort((a,b)=>a-b);const qt=p=>vals.length?vals[Math.min(vals.length-1,Math.floor(vals.length*p))]:0;const cortes=[qt(.5),qt(.75),qt(.9),qt(.97)];
  const PAL=['#fde68a','#fbbf24','#f97316','#ef4444','#7f1d1d'];const cls=v=>cortes.filter(c=>v>c).length;
  const grupos=[[],[],[],[],[]];for(let i=0;i<B.N;i++){if(V.par[i]<0||!_plNoFiltro(i))continue;const v=valBlk.get(blk[i]);if(v==null)continue;grupos[cls(v)].push([[V.y[V.par[i]],V.x[V.par[i]]],[V.y[i],V.x[i]]]);}
  grupos.forEach((g,k)=>{if(g.length)L.polyline(g,{color:PAL[k],weight:2+k*.8,opacity:.9}).addTo(_pl.lay.an);});
  const pm=[];for(const it of H.pontos){if(!it.pos||(_pl.al&&it.al!==_pl.al))continue;pm.push(it);}
  const pv=pm.map(i=>m==='ucq'?(i.ucq||0):i.q).sort((a,b)=>a-b);const pq=p=>pv.length?pv[Math.min(pv.length-1,Math.floor(pv.length*p))]:0;const pc=[pq(.5),pq(.75),pq(.9),pq(.97)];
  for(const it of pm){const v=m==='ucq'?(it.ucq||0):it.q;const k=pc.filter(c=>v>c).length;
    L.circleMarker(it.pos,{radius:3+k,color:'#111',weight:.5,fillColor:PAL[k],fillOpacity:.95}).bindTooltip(`${it.tipo} ${it.nr} · ${it.q} atuações`).on('click',()=>_plSelecionar(it)).addTo(_pl.lay.an);}
  const nm={q:'atuações',porKm:'atuações/km',ucq:'UCs × atuações'}[m];const f=v=>_plNum(v,m==='porKm'?1:0);
  leg.push([PAL[0],`até ${f(cortes[0])} ${nm}`],[PAL[1],`${f(cortes[0])}–${f(cortes[1])}`],[PAL[2],`${f(cortes[1])}–${f(cortes[2])}`],[PAL[3],`${f(cortes[2])}–${f(cortes[3])}`],[PAL[4],`acima de ${f(cortes[3])}`],['#94a3b8','Círculos: trafos e chaves sem trecho a jusante']);}
function _plAnalisar(){if(!_pl.B)return;_pl.oportResumo=null;const t=performance.now();_pl.R=planAnalyze(_pl.B,_pl.P);console.log('[Plan] análise',Math.round(performance.now()-t),'ms');if(_pl.A)_plCalorCalc();_plKpis();}

// ── parâmetros ──
function _plParamsUI(){const g=document.getElementById('plParamsGrid');if(!g)return;
  g.innerHTML=PL_PARAM_LBL.map(([k,l])=>`<label>${l}<input type="number" step="any" id="plp_${k}" value="${_pl.P[k]}"></label>`).join('');}
window.plAplicarParams=()=>{for(const [k] of PL_PARAM_LBL){const v=parseFloat(document.getElementById('plp_'+k).value);if(!isNaN(v))_pl.P[k]=v;}
  try{localStorage.setItem('sppc_plan_params',JSON.stringify(Object.fromEntries(PL_PARAM_LBL.map(([k])=>[k,_pl.P[k]]))));}catch(e){}
  _plAnalisar();_plMostrar(false);toast('Parâmetros aplicados.');};
window.plParamsPadrao=()=>{_pl.P={...PLAN_PARAM_PADRAO};try{localStorage.removeItem('sppc_plan_params');}catch(e){}_plParamsUI();_plAnalisar();_plMostrar(false);};

// ── KPIs ──
function _plKpis(){const R=_pl.R;if(!R)return;const r=R.resumo;if(!_pl.oportResumo)try{_plOportLinhas();}catch(e){}
  const v={ramais:r.ramaisSemManobra+(r.alimSemInter?` + ${r.alimSemInter} alim.`:''),secc:r.seccionamento,deriv:r.derivacoes,mono:_plNum(r.monoUrbanoKm,1)+' km',cabos:_plNum(r.cabosPequenosKm,0)+' km',
    inter:r.interligacoes+(r.interAlerta?` (${r.interAlerta}⚠️)`:''),cargacabo:r.cargaCabos,oport:_pl.oportResumo||'—',pvnt:_pl.pvnt?(_pl.pvnt.length+(_pl.pvntSemLoc?` (${_pl.pvntSemLoc} s/ local)`:'')):'—',calor:_pl.H?_plNum(_pl.H.total)+' atuações':'—',carreg:r.trafosCarregados,ucs:r.trafosMuitasUC,incons:r.inconsistencias};
  document.getElementById('plKpis').innerHTML=PL_ANALISES.map(([k,t])=>`<button class="pl-kpi ${_pl.an===k?'on':''}" onclick="plAnalise('${k}')"><div class="k">${t}</div><div class="v">${v[k]}</div></button>`).join('');}
window.plAnalise=k=>{_pl.an=k;_pl.sel=null;_plMostrar(true);_plKpis();};

// ── desenho ──
function _plCorRede(){return _pl.baseK==='s'?'#cbd5e1':(_pl.baseK==='r'||!document.body.classList.contains('light-theme'))?'#7d8f8c':'#94a3b8';}
function _plSeg(nodes){const V=_pl.B.V;const out=[];for(const i of nodes){const p=V.par[i];if(p<0)continue;out.push([[V.y[p],V.x[p]],[V.y[i],V.x[i]]]);}return out;}
function _plNoFiltro(i){return !_pl.al||_pl.B.feeders[_pl.B.V.f[i]]?.nome===_pl.al;}
function _plDesenharRede(fit){if(!_pl.B||!_pl.lay.rede)return;_pl.lay.rede.clearLayers();const V=_pl.B.V,N=_pl.B.N;const seg=[];
  for(let i=0;i<N;i++){if(V.par[i]<0||!_plNoFiltro(i))continue;seg.push([[V.y[V.par[i]],V.x[V.par[i]]],[V.y[i],V.x[i]]]);}
  const l=L.polyline(seg,{color:_plCorRede(),weight:1.2,opacity:.75,interactive:false}).addTo(_pl.lay.rede);
  if(fit&&seg.length)_pl.map.fitBounds(l.getBounds().pad(.02));}
function _plSub(roots){const ch=_pl.B._p.ch;const out=[];const st=[...roots];while(st.length){const x=st.pop();out.push(x);for(const y of ch[x])st.push(y);}return out;}
function _plMarker(pos,cor,r=6,tip){const m=L.circleMarker(pos,{radius:r,color:'#fff',weight:1.5,fillColor:cor,fillOpacity:1});if(tip)m.bindTooltip(tip);return m;}

const PL_COLS={
  ramais:[['al','Alim.'],['sg','Tipo'],['nr','Equip.'],['area','Área'],['uc','UCs'],['trafos','Trafos'],['kva','kVA'],['km','km'],['aninhados','Aninhados']],
  secc:[['al','Alim.'],['inicio','Início do trecho'],['area','Área'],['km','km sem chave'],['uc','UCs no trecho'],['ucTotal','UCs a jusante (total)'],['ucJus','Nova chave: UCs a jusante'],['ucMon','UCs a montante'],['motivo','Motivo']],
  deriv:[['al','Alim.'],['area','Área'],['uc','UCs'],['km','km'],['trafos','Trafos']],
  mono:[['al','Alim.'],['mun','Município'],['km','km']],
  cabos:[['cabo','Cabo'],['km','km'],['amp','Ampac. ref. (A)'],['pequeno','Fora de padrão']],
  inter:[['nr','Chave NA'],['al','Alimentadores'],['obs','Obs.'],['utilMax','Util. máx tronco (%)'],['resumo','Transferência / cabo crítico no tronco']],
  cargacabo:[['al','Alim.'],['cabo','Cabo'],['fases','Fases'],['ramal','Tronco/Ramal'],['area','Área'],['km','km'],['util','Util. (%)'],['I','Corrente (A)'],['amp','Ampac. ref. (A)'],['kva','kVA'],['uc','UCs'],['conf','Confiança']],
  calor:[['tipo','Tipo'],['nr','Equip.'],['al','Alim.'],['q','Atuações'],['uc','UCs'],['ucq','UCs × atuações'],['km','km protegidos'],['porKm','Atuações/km'],['causas','Principais causas']],
  carreg:[['al','Alim.'],['nr','Trafo'],['kva','kVA'],['carreg','Carreg. (%)'],['uc','UCs'],['queda','Queda (%)']],
  ucs:[['al','Alim.'],['nr','Trafo'],['kva','kVA'],['uc','UCs'],['ucKva','UCs/kVA'],['carreg','Carreg. (%)']],
  incons:[['tipo','Tipo'],['al','Alimentadores'],['nr','Equip.'],['sugAl','Alimentador mais próximo'],['reg','Interligação registrada'],['pos','Coordenadas']],
  pvnt:[['nota','Nota PS'],['equip','Equip. ref.'],['al','Alim.'],['trecho','Trecho'],['desc','Descrição'],['mun','Município'],['obrasExec','Obras em execução no trecho'],['nOport','Oportunidades no trecho'],['sppc','No SPPC']],
  oport:[['obraNum','Obra'],['obraTipo','Tipo'],['obraStatus','Status da obra'],['al','Alim.'],['trecho','Trecho'],['tipo','Oportunidade'],['titulo','Descrição'],['det','Detalhe'],['situacao','Situação'],['r2','R2 vinculada'],['pvnt','PVNT no trecho']]};
for(const k of ['ramais','secc','deriv','inter','cargacabo','carreg','ucs'])PL_COLS[k].push(['situacao','Situação']);
function _plLinhas(){const rows=_plLinhas0();for(const r of rows)if(r.key&&r.situacao===undefined)r.situacao=_plStatusOp(r.key).txt;return rows;}
function _plLinhas0(){const R=_pl.R;if(!R)return[];const f=r=>!_pl.al||String(r.al||'').split(' / ').includes(_pl.al)||(Array.isArray(r.al)&&r.al.includes(_pl.al));
  switch(_pl.an){
    case 'ramais':return[...R.alimSemInter.map(a=>({...a,sg:'ALIM',nr:a.al,area:'—',trafos:null,kva:null,aninhados:null,_alim:true})),...R.ramaisSemManobra].filter(f);
    case 'secc':return R.seccionamento.filter(f);
    case 'deriv':return R.derivacoes.filter(f);
    case 'mono':return R.monoUrbano.lista.filter(f);
    case 'cabos':return R.cabos.map(c=>({...c,km:_pl.al?(c.por[_pl.al]||0):c.km,pequeno:c.pequeno?'Sim':''})).filter(c=>c.km>0);
    case 'inter':return R.interligacoes.map(i=>({...i,obs:i.manual?'Registrada manualmente':i.gapM?`Falha de desenho (${i.gapM} m)`:'',resumo:i.externo?'Alimentador de outra regional':i.dirs.map(d=>`${d.de}→${d.para}: abre ${d.abre}, ${_plNum(d.kva)} kVA, ${d.util??'—'}% em ${d.critico||'—'}${d.naEmRamal?' (NA em ramal)':''}`).join(' | ')})).filter(f);
    case 'cargacabo':return R.cargaCabos.filter(f);
    case 'calor':return _pl.H?_plCalorLista().filter(f):[];
    case 'carreg':return R.trafosCarregados.filter(f);
    case 'ucs':return R.trafosMuitasUC.filter(f);
    case 'incons':return _pl.B.incons.slice().sort((a,b)=>(b.tipo.startsWith('Chave NA')-a.tipo.startsWith('Chave NA'))||(b.tipo.startsWith('Chave')-a.tipo.startsWith('Chave'))).map(i=>{const m=(_pl.interManuais||[]).find(x=>String(x.nr)===String(i.nr));return{tipo:i.tipo,nr:i.nr||'',al:i.al.join(' / '),sugAl:i.sug||'',reg:m?`↔ ${m.al}`:'',pos:`${i.y.toFixed(5)}, ${i.x.toFixed(5)}`,_x:i.x,_y:i.y};}).filter(f);
    case 'pvnt':return _plPvntLinhas().filter(f);
    case 'oport':return _plOportLinhas().filter(f);}return[];}
function _plMostrar(fit){if(!_pl.map)return;const tab=document.getElementById('plTab');
  const [,tit,desc]=PL_ANALISES.find(a=>a[0]===_pl.an);document.getElementById('plTit').textContent=tit;document.getElementById('plDesc').textContent=desc;
  _pl.lay.an.clearLayers();_pl.lay.hl.clearLayers();document.getElementById('plCabos').style.display=_pl.an==='cabos'?'flex':'none';
  if(!_pl.B){tab.innerHTML='<div style="padding:16px;font-size:11px;color:var(--muted)">Nenhuma base processada. Use ⚙️ Atualizar bases para enviar o KMZ, a planilha de UCs e o CSV de carregamento.</div>';document.getElementById('plLeg').innerHTML='';return;}
  const rows=_plLinhas();_pl.rows=rows;const cols=PL_COLS[_pl.an];const V=_pl.B.V;const leg=[];
  // camada da análise
  if(_pl.an==='ramais'){for(const r of rows)if(!r._alim)_plMarker(r.pos,r.area==='Urbana'?'#ef4444':'#f97316',6,`${r.sg} ${r.nr} · ${r.uc} UCs`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);
    leg.push(['#ef4444','Ramal urbano sem manobra'],['#f97316','Ramal rural sem manobra']);}
  if(_pl.an==='secc'){for(const r of rows)if(r.sug)_plMarker(r.sug,'#eab308',5,`Ponto sugerido · ${r.divide}`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);leg.push(['#eab308','Ponto sugerido para nova chave']);}
  if(_pl.an==='deriv'){for(const r of rows)_plMarker(r.pos,'#a855f7',5,`Derivação · ${r.uc} UCs · ${r.km} km`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);leg.push(['#a855f7','Início de derivação sem chave']);}
  if(_pl.an==='mono'){const seg=[];for(let i=0;i<_pl.B.N;i++)if(V.par[i]>=0&&V.fase[i]===1&&V.urb[i]===1&&_plNoFiltro(i))seg.push([[V.y[V.par[i]],V.x[V.par[i]]],[V.y[i],V.x[i]]]);
    L.polyline(seg,{color:'#ef4444',weight:3,opacity:.95}).addTo(_pl.lay.an);leg.push(['#ef4444','Rede monofásica urbana']);}
  if(_pl.an==='cabos'){_plCabosUI();_plDesenharCabos(leg);}
  if(_pl.an==='inter'){for(const r of rows){const c=r.externo?'#64748b':r.utilMax>=_pl.P.utilMax*100?'#ef4444':r.utilMax>=70?'#f59e0b':'#22c55e';
      _plMarker(r.pos,c,6,`NA ${r.nr} · ${r.al}`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);}
    leg.push(['#22c55e','Utilização < 70%'],['#f59e0b','70% até o limite'],['#ef4444','Acima do limite'],['#64748b','Outra regional']);}
  document.getElementById('plCalorF').style.display=_pl.an==='calor'&&_pl.A?'flex':'none';
  if(_pl.an==='cargacabo'){for(const r of rows){const c=r.conf==='Baixa'?'#64748b':r.util>=80?'#ef4444':r.util>=50?'#f97316':'#eab308';
      L.polyline(_plSeg(r.nodes),{color:c,weight:4,opacity:.95}).bindTooltip(`${r.cabo} · ${r.util}% · ${r.I} A`,{sticky:true}).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);}
    leg.push(['#eab308',`${Math.round(_pl.P.cargaCaboMin*100)}–50%`],['#f97316','50–80%'],['#ef4444','≥ 80%'],['#64748b','Baixa confiança (cadastro divergente)']);}
  if(_pl.an==='calor'){if(!_pl.A){tab.innerHTML='<div style="padding:16px;font-size:11px;color:var(--muted)">Nenhum relatório de atuações processado. Envie o PDF do SIMO em ⚙️ Atualizar bases.</div>';document.getElementById('plLeg').innerHTML='';return;}
    _plCalorUI();_plDesenharCalor(leg);}
  if(_pl.an==='carreg'||_pl.an==='ucs'){for(const r of rows){const c=_pl.an==='carreg'?(r.carreg>=150?'#7f1d1d':r.carreg>=120?'#ef4444':'#f97316'):'#3b82f6';
      _plMarker(r.pos,c,5,`Trafo ${r.nr} · ${r.kva??'?'} kVA · ${_plNum(r.carreg,1)}% · ${r.uc} UCs`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);}
    if(_pl.an==='carreg')leg.push(['#f97316',`${_pl.P.carregMax}–120%`],['#ef4444','120–150%'],['#7f1d1d','≥ 150%']);else leg.push(['#3b82f6',`> ${_pl.P.ucPorKva} UCs por kVA`]);}
  if(_pl.an==='oport'){const COR={Planejada:'#ef4444','Em execução':'#3b82f6',Concluída:'#22c55e',Descartada:'#64748b',Vinculada:'#f59e0b'};
    for(const r of rows)if(r.pos)_plMarker(r.pos,COR[r.situacaoBase]||'#ef4444',5,`${r.obraNum} · ${r.tipo}`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);
    const ob=(typeof obras!=='undefined'?obras:[]).filter(o=>PL_OBRA_EXEC.has(statusOf(o))).sort((a,b)=>String(a.numero||'').localeCompare(String(b.numero||'')));
    _pl._avBar=`<div style="display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--muted)">R2 avulsa a partir de obra em execução: <select id="plAvObra" style="max-width:220px"><option value="">— obra —</option>${ob.map(o=>`<option value="${_plEsc(o.id)}">${_plEsc(o.numero||'s/ nº')} · ${_plEsc(statusOf(o))}${o.equipamentoRef?'':' · sem equip.'}</option>`).join('')}</select><button class="btn btn-secondary btn-sm" onclick="plAbrirObraAvulsa()">Abrir obra</button></div>`;
    leg.push(['#ef4444','Planejada (aguardando decisão)'],['#3b82f6','Em execução (R2 vinculada)'],['#22c55e','Concluída'],['#64748b','Descartada']);}
  if(_pl.an==='pvnt'){if(!_pl.pvnt){tab.innerHTML='<div style="padding:16px;font-size:11px;color:var(--muted)">Nenhuma lista PVNT enviada. Use ⚙️ Atualizar bases → Obras PVNT a executar.</div>';document.getElementById('plLeg').innerHTML='';return;}
    for(const r of rows)if(r.pos)_plMarker(r.pos,r.sppc?'#22c55e':r.obrasExec?'#3b82f6':'#06b6d4',6,`PVNT ${r.nota} · equip. ${r.equip}`).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);
    leg.push(['#06b6d4','PVNT a executar'],['#3b82f6','Com obra em execução no mesmo trecho'],['#22c55e','Já cadastrada no SPPC']);}
  if(_pl.an==='incons'){for(const r of rows)_plMarker([r._y,r._x],'#f43f5e',4,r.al).on('click',()=>_plSelecionar(r)).addTo(_pl.lay.an);leg.push(['#f43f5e','Troca de alimentador sem chave']);}
  document.getElementById('plLeg').innerHTML=leg.map(([c,t])=>`<div><i style="background:${c}"></i>${_plEsc(t)}</div>`).join('');
  // tabela
  const MAX=1500;tab.innerHTML=rows.length?`<table class="pl"><thead><tr>${cols.map(([k,l])=>`<th data-k="${k}">${l}</th>`).join('')}</tr></thead><tbody>`+
    rows.slice(0,MAX).map((r,i)=>`<tr data-i="${i}">${cols.map(([k])=>`<td>${typeof r[k]==='number'?_plNum(r[k],k==='km'||k==='ucKva'||k==='carreg'?1:0):_plEsc(r[k]??'—')}</td>`).join('')}</tr>`).join('')+'</tbody></table>'+
    (rows.length>MAX?`<div style="padding:8px;font-size:10px;color:var(--muted)">Mostrando ${MAX} de ${rows.length}. Exporte para ver todos.</div>`:'')
    :'<div style="padding:16px;font-size:11px;color:var(--muted)">Nenhum item com os parâmetros atuais.</div>';
  if(_pl.an==='oport'&&_pl._avBar)tab.insertAdjacentHTML('afterbegin',_pl._avBar);
  tab.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>_plSelecionar(rows[+tr.dataset.i]));
  tab.querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;_pl.ord=_pl.ord===k?'-'+k:k;const d=_pl.ord.startsWith('-')?-1:1;
    const kk=_pl.ord.replace('-','');rows.sort((a,b)=>{const x=a[kk],y=b[kk];return(typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'pt-BR'))*d;});_pl.rowsOrd=rows;
    const body=tab.querySelector('tbody');body.innerHTML=rows.slice(0,MAX).map((r,i)=>`<tr data-i="${i}">${cols.map(([k])=>`<td>${typeof r[k]==='number'?_plNum(r[k],k==='km'||k==='ucKva'||k==='carreg'?1:0):_plEsc(r[k]??'—')}</td>`).join('')}</tr>`).join('');
    body.querySelectorAll('tr').forEach(tr=>tr.onclick=()=>_plSelecionar(rows[+tr.dataset.i]));});
  if(fit&&_pl.al){const nodes=[];for(let i=0;i<_pl.B.N;i++)if(_plNoFiltro(i))nodes.push([V.y[i],V.x[i]]);if(nodes.length)_pl.map.fitBounds(L.latLngBounds(nodes).pad(.03));}
}
function _plCabosUI(){const box=document.getElementById('plCabos');if(!_pl.cabSel)_pl.cabSel=new Set(_pl.P.cabosPequenos);
  box.innerHTML=_pl.R.cabos.map(c=>`<label><input type="checkbox" value="${_plEsc(c.cabo)}" ${_pl.cabSel.has(c.cabo)?'checked':''}>${_plEsc(c.cabo)} · ${_plNum(c.km)} km</label>`).join('');
  box.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{if(inp.checked)_pl.cabSel.add(inp.value);else _pl.cabSel.delete(inp.value);_pl.lay.an.clearLayers();const leg=[];_plDesenharCabos(leg);
    document.getElementById('plLeg').innerHTML=leg.map(([c,t])=>`<div><i style="background:${c}"></i>${_plEsc(t)}</div>`).join('');});}
function _plDesenharCabos(leg){const V=_pl.B.V;const PAL=['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#ec4899','#14b8a6','#f97316','#84cc16','#06b6d4'];let k=0;
  for(const c of _pl.R.cabos){if(!_pl.cabSel.has(c.cabo))continue;const ci=_pl.B.cabos.indexOf(c.cabo);const seg=[];
    for(let i=0;i<_pl.B.N;i++)if(V.par[i]>=0&&V.cab[i]===ci&&_plNoFiltro(i))seg.push([[V.y[V.par[i]],V.x[V.par[i]]],[V.y[i],V.x[i]]]);
    const cor=PAL[k++%PAL.length];if(seg.length)L.polyline(seg,{color:cor,weight:3,opacity:.95}).bindTooltip(c.cabo,{sticky:true}).addTo(_pl.lay.an);leg.push([cor,c.cabo]);}}
function _plSelecionar(r){_pl.lay.hl.clearLayers();const B=_pl.B,V=B.V;let pop='';let foco=null;
  document.querySelectorAll('#plTab tr.sel').forEach(t=>t.classList.remove('sel'));
  if(_pl.an==='ramais'&&!r._alim){const seg=r.km!=null?_plSeg(_plSub(r.cut)):[];if(seg.length)L.polyline(seg,{color:'#ef4444',weight:3.5,opacity:.95}).addTo(_pl.lay.hl);
    // trafos a jusante pela árvore operativa (planilha)
    if(!_pl.kidsEq){_pl.kidsEq=new Map();for(const [n,e] of Object.entries(B.eqInfo)){if(!_pl.kidsEq.has(e.ant))_pl.kidsEq.set(e.ant,[]);_pl.kidsEq.get(e.ant).push(n);}_pl.tdByNr=new Map(B.td.map(t=>[t.nr,t]));}
    const pts=[];const st=[r.nr];let k=0;while(st.length&&k<200000){const n=st.pop();k++;const t=_pl.tdByNr.get(n);if(t)pts.push([t.y,t.x]);for(const c of(_pl.kidsEq.get(n)||[]))st.push(c);}
    for(const p of pts)L.circleMarker(p,{radius:3,color:'#ef4444',weight:1,fillColor:'#fca5a5',fillOpacity:.9,interactive:false}).addTo(_pl.lay.hl);
    foco=pts.length?L.latLngBounds(pts):(seg.length?L.polyline(seg).getBounds():null);
    pop=`<b>${r.sg} ${r.nr}</b> · ${r.al}<br>${r.area} · ${_plNum(r.uc)} UCs · ${r.trafos} trafos · ${_plNum(r.kva)} kVA<br>${r.km!=null?_plNum(r.km,1)+' km':'extensão não confirmada pela geometria'}<br>Sem chave NA para outro alimentador a jusante.${r.aninhados?`<br>${r.aninhados} ramal(is) menor(es) dentro também acima do limite.`:''}`;}
  if(_pl.an==='ramais'&&r._alim){const f=B.feeders.find(f=>f.nome===r.al);pop=`<b>${r.al}</b><br>Alimentador sem nenhuma interligação · ${_plNum(r.uc)} UCs`;foco=L.latLng(f.y,f.x).toBounds(3000);}
  if(_pl.an==='secc'){const nodes=[];const blk=_pl.R._blk;for(let i=0;i<B.N;i++)if(blk[i]===r.blk)nodes.push(i);const seg=_plSeg(nodes);
    L.polyline(seg,{color:'#eab308',weight:3.5,opacity:.95}).addTo(_pl.lay.hl);if(r.sug)_plMarker(r.sug,'#eab308',8).addTo(_pl.lay.hl);foco=seg.length?L.polyline(seg).getBounds():null;
    pop=`<b>Trecho a partir de ${_plEsc(r.inicio)}</b> · ${r.al}<br>${r.area} · ${_plNum(r.km,1)} km sem chave · ${r.trafos} trafos<br>`+
      `UCs a jusante de ${_plEsc(r.inicio)}: <b>${_plNum(r.ucTotal)}</b>${r.ucPlanilha!=null&&Math.abs(r.ucPlanilha-r.ucTotal)>0.02*r.ucTotal?` (planilha: ${_plNum(r.ucPlanilha)})`:''} — ${_plNum(r.uc)} neste trecho e ${_plNum(r.ucTotal-r.uc)} em trechos já seccionados abaixo<br>${_plEsc(r.motivo)}<br>`+
      `Nova chave no ponto amarelo: <b>${_plNum(r.ucJus)} UCs a jusante</b> e ${_plNum(r.ucMon)} a montante (${_plNum(r.kmJus,1)} km / ${_plNum(r.kmMon,1)} km do trecho).`;}
  if(_pl.an==='deriv'){const seg=_plSeg(_plSub([r.c]));L.polyline(seg,{color:'#a855f7',weight:3.5,opacity:.95}).addTo(_pl.lay.hl);foco=seg.length?L.polyline(seg).getBounds():null;
    pop=`<b>Derivação sem chave</b> · ${r.al}<br>${r.area} · ${_plNum(r.uc)} UCs · ${_plNum(r.km,1)} km · ${r.trafos} trafos`;}
  if(_pl.an==='inter'){pop=`<b>Chave NA ${r.nr}</b> · ${_plEsc(r.al)}${r.dNA?`<br><span style="color:#888">Chave a ${r.dNA} m do ponto de troca de alimentador</span>`:''}`+
    (r.manual?`<br><span style="color:#7c6af7">Interligação registrada manualmente (o trecho não está desenhado no cadastro).</span> <a href="#" onclick="plRemoverInter('${_plEsc(r.nr)}');return false">Remover</a>`:r.gapM?`<br><span style="color:#d97706">Rede não desenhada até a chave: falha de ${r.gapM} m no cadastro (ligação deduzida por proximidade).</span>`:'')+
    (r.externo?'<br>Interligação com alimentador de outra regional.':r.dirs.map(d=>`<hr style="border:0;border-top:1px solid #ddd;margin:4px 0"><b>${d.de} → ${d.para}</b><br>Abrir ${_plEsc(d.abre)} e fechar a NA transfere ${_plNum(d.kva)} kVA (${_plNum(d.uc)} UCs)<br>Utilização máx. estimada no tronco do ${d.para}: <b>${d.util??'—'}%</b> em ${_plEsc(d.critico||'—')}${d.gargalo&&d.gargalo!==d.critico?`<br>Menor cabo do tronco no caminho: ${_plEsc(d.gargalo)}`:''}`+
      (d.naEmRamal?`<br><span style="color:#d97706">A NA está num ramal do ${d.para}: ${_plEsc(d.naEmRamal)}. O ramal limita a manobra; ver Carregamento de cabos.</span>`:'')+
      (d.trechoTransf?`<br>Menor cabo no trecho transferido (entre a NA e ${_plEsc(d.abre)}): ${_plEsc(d.trechoTransf)}`:'')).join(''));
    if(!r.externo)pop+='<div style="margin-top:4px;font-size:10px;color:#888">Triagem com ampacidade de referência e fator de coincidência; confirmar com fluxo de carga.</div>';
    for(const d of(r.dirs||[]))if(d.critPos)_plMarker(d.critPos,'#ef4444',5,`Ponto crítico ${d.de}→${d.para}: ${d.critico}`).addTo(_pl.lay.hl);foco=L.latLng(r.pos).toBounds(2500);}
  if(_pl.an==='carreg'||_pl.an==='ucs'){pop=`<b>Trafo ${r.nr}</b> · ${r.al}<br>${r.kva??'?'} kVA · carregamento ${_plNum(r.carreg,1)}%<br>${r.uc} UCs (${_plNum(r.ucKva,2)} UCs/kVA)${r.queda!=null?`<br>Queda de tensão máx.: ${_plNum(r.queda,1)}%`:''}`;foco=L.latLng(r.pos).toBounds(600);}
  if(_pl.an==='cargacabo'){const seg=_plSeg(r.nodes);L.polyline(seg,{color:'#ffffff',weight:7,opacity:.5}).addTo(_pl.lay.hl);foco=seg.length?L.polyline(seg).getBounds():null;
    pop=`<b>${_plEsc(r.cabo)}</b> · ${r.al} · ${r.fases === 1?'monofásico':r.fases===2?'bifásico':'trifásico'} · ${r.ramal}<br>Utilização estimada <b>${r.util}%</b>: ${r.I} A de ${r.amp} A (referência)<br>${_plNum(r.kva)} kVA a jusante (coincidente) · ${_plNum(r.uc)} UCs · ${_plNum(r.km,1)} km neste cabo`+
      (r.conf==='Baixa'?'<br><span style="color:#d97706">Baixa confiança: a geometria diverge da planilha neste trecho; revisar cadastro antes de concluir.</span>':'');}
  if(_pl.an==='calor'){const bs=new Set(r.blocos||[]);const nodes=[];const blk=_pl.R._blk;if(bs.size)for(let i=0;i<B.N;i++)if(bs.has(blk[i]))nodes.push(i);const seg=_plSeg(nodes);
    if(seg.length)L.polyline(seg,{color:'#ffffff',weight:7,opacity:.45}).addTo(_pl.lay.hl);if(r.pos)_plMarker(r.pos,'#ffffff',6).addTo(_pl.lay.hl);
    foco=seg.length?L.polyline(seg).getBounds():(r.pos?L.latLng(r.pos).toBounds(800):null);
    pop=`<b>${_plEsc(r.tipo)} ${_plEsc(r.nr)}</b> · ${_plEsc(r.al)}<br><b>${r.q}</b> atuações não programadas${r.uc!=null?` · ${_plNum(r.uc)} UCs a jusante`:''}${r.km!=null?`<br>Trecho protegido: ${_plNum(r.km,1)} km (${_plNum(r.porKm,1)} atuações/km)`:''}<br><span style="font-size:10px">${_plEsc(r.causas)}</span>${r.obs?`<br><span style="color:#d97706;font-size:10px">${_plEsc(r.obs)}</span>`:''}`;}
  if(_pl.an==='oport'){pop=`<b>${_plEsc(r.tipo)}</b> · ${_plEsc(r.al)} · trecho ${_plEsc(r.trecho)}<br>${_plEsc(r.titulo)}<br><span style="font-size:10px">${_plEsc(r.det)}</span><br>Obra ${_plEsc(r.obraNum)} (${_plEsc(r.obraStatus)}) · <b>${_plEsc(r.situacao)}</b>`+
      (r.obraId?`<br><button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="openObraModal('${_plEsc(r.obraId)}')">Abrir obra ${_plEsc(r.obraNum)}</button>`:'');foco=r.pos?L.latLng(r.pos).toBounds(800):null;}
  if(_pl.an==='pvnt'){if(r._bs){const nodes=[];const blk=_pl.R._blk;for(let i=0;i<B.N;i++)if(r._bs.has(blk[i]))nodes.push(i);const seg=_plSeg(nodes);
      if(seg.length){L.polyline(seg,{color:'#06b6d4',weight:5,opacity:.8}).addTo(_pl.lay.hl);foco=L.polyline(seg).getBounds();}}
    if(!foco&&r.pos)foco=L.latLng(r.pos).toBounds(800);
    pop=`<b>PVNT · nota ${_plEsc(r.nota)}</b><br>Equip. ref. ${_plEsc(r.equip)}${r.al?` · ${_plEsc(r.al)} · trecho ${_plEsc(r.trecho)}`:''}${r.desc?`<br>${_plEsc(r.desc)}`:''}${r.mun?`<br>${_plEsc(r.mun)}`:''}`+
      (r.sppc?`<br><b style="color:#16a34a">Já cadastrada no SPPC: obra ${_plEsc(r.sppc)}</b>`:'')+
      (r._obras.length?`<br>Obras em execução no mesmo trecho: ${r._obras.map(o=>`<a href="#" onclick="openObraModal('${_plEsc(o.id)}');return false">${_plEsc(o.numero||'s/ nº')}</a>`).join(', ')}`:'')+
      (r._itens.length?`<br>Oportunidades no trecho: ${r._itens.map(i=>_plEsc(i.tipo)).join(', ')}`:'')+
      (r.extras?`<div style="font-size:10px;color:#888;margin-top:4px">${_plEsc(r.extras)}</div>`:'');}
  if(_pl.an==='incons'&&r.tipo.startsWith('Chave NA na ponta')){const m=(_pl.interManuais||[]).find(x=>String(x.nr)===String(r.nr));
    pop=`<b>Chave NA ${_plEsc(r.nr)}</b> · ${_plEsc(r.al)}<br>A rede termina nesta chave e o outro lado não está desenhado no cadastro.${r.sugAl?`<br>Alimentador mais próximo: ${_plEsc(r.sugAl)}`:'<br>Nenhum outro alimentador a menos de 2 km.'}`+
      (m?`<br><b>Registrada como interligação com ${_plEsc(m.al)}</b> (${_plEsc(m.por||'')}, ${_plEsc(m.em||'')})<br><button class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="plRemoverInter('${_plEsc(r.nr)}')">Remover registro</button>`
        :`<br><span style="font-size:10px">Se esta chave interliga com outro alimentador, informe qual:</span><br><select id="plInterAl" style="margin-top:4px;max-width:230px"><option value="">— alimentador do outro lado —</option>${_plOpcoesAlim(r._x,r._y,r.al)}</select>
         <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="plRegistrarInter('${_plEsc(r.nr)}')">Registrar interligação</button>`);
    foco=L.latLng(r._y,r._x).toBounds(500);}
  else if(_pl.an==='incons'){pop=`<b>${_plEsc(r.tipo)}</b>${r.nr?` · ${_plEsc(r.nr)}`:''}<br>${_plEsc(r.al)}<br>${r.tipo.startsWith('Troca')?'Verificar cadastro: o trecho muda de alimentador sem chave neste ponto.':'Verificar cadastro: a chave não está ligada à rede da subestação no KMZ e fica fora das análises.'}`;foco=L.latLng(r._y,r._x).toBounds(500);}
  if(_pl.an==='mono'){const seg=[];const mi=B.muns.indexOf(r.mun);for(let i=0;i<B.N;i++)if(V.par[i]>=0&&V.fase[i]===1&&V.urb[i]===1&&V.mun[i]===mi&&B.feeders[V.f[i]].nome===r.al)seg.push([[V.y[V.par[i]],V.x[V.par[i]]],[V.y[i],V.x[i]]]);
    L.polyline(seg,{color:'#f59e0b',weight:5,opacity:.9}).addTo(_pl.lay.hl);foco=seg.length?L.polyline(seg).getBounds():null;pop=`<b>${_plEsc(r.al)} · ${_plEsc(r.mun)}</b><br>${_plNum(r.km,2)} km de rede monofásica urbana`;}
  if(foco)_pl.map.flyToBounds(foco.pad?foco.pad(.2):foco,{duration:.6,maxZoom:16});
  if(pop){const pos=Array.isArray(r.sug)?r.sug:Array.isArray(r.pos)?r.pos:(r._y!=null?[r._y,r._x]:null);if(pos)setTimeout(()=>L.popup({maxWidth:340}).setLatLng(pos).setContent(`<div class="pl-pop">${pop}</div>`).openOn(_pl.map),650);}
  const i=(_pl.rows||[]).indexOf(r);const tr=document.querySelector(`#plTab tr[data-i="${i}"]`);if(tr){tr.classList.add('sel');tr.scrollIntoView({block:'nearest'});}
}
window.plExportar=()=>{if(!_pl.rows||!window.XLSX)return;const cols=PL_COLS[_pl.an];
  const data=_pl.rows.map(r=>{const o={};for(const [k,l] of cols)o[l]=r[k];const pos=Array.isArray(r.sug)?r.sug:Array.isArray(r.pos)?r.pos:(r._y!=null?[r._y,r._x]:null);if(Array.isArray(pos)){o['Latitude']=pos[0];o['Longitude']=pos[1];}return o;});
  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Planejamento');
  XLSX.writeFile(wb,`Planejamento_${_pl.an}_${new Date().toISOString().slice(0,10)}.xlsx`);};

// ── processamento das bases (gerente) ──
function _plLog(m){const el=document.getElementById('plLog');if(el){el.textContent+=m+'\n';el.scrollTop=el.scrollHeight;}console.log('[Plan]',m);}
async function _plLerUC(file){const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1});
  const h=rows[0].map(x=>String(x||'').toUpperCase());const ci=n=>h.findIndex(x=>x.includes(n));
  const iN=ci('NR_EQUIPAMENTO'),iA=ci('NR_EQPTO_ANTERIOR'),iS=ci('SG_EQUIPAMENTO'),iU=ci('QT_CONSUMIDOR'),iF=ci('NR_ALIMENTADOR');
  if(iN<0||iA<0||iS<0||iU<0)throw new Error('Planilha de UCs sem as colunas NR_EQUIPAMENTO, NR_EQPTO_ANTERIOR, SG_EQUIPAMENTO e QT_CONSUMIDOR_CELESC.');
  const out=[];for(let r=1;r<rows.length;r++){const x=rows[r];const nr=parseInt(x[iN]);if(!nr)continue;const u=x[iU];out.push({nr,ant:parseInt(x[iA])||0,sg:String(x[iS]||''),uc:u===''||u==null?null:+u,alimNum:parseInt(x[iF])||0});}return out;}
async function _plLerListaNA(file){let rows;
  if(/\.(csv|txt)$/i.test(file.name)){const t=new TextDecoder('iso-8859-1').decode(await file.arrayBuffer());rows=t.split(/\r?\n/).map(l=>l.split(/[;,\t]/));}
  else{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});}
  const normAl=v=>{const m=String(v||'').toUpperCase().replace(/\s+/g,'').match(/^([A-Z]{3})-?(\d{1,2})$/);return m?m[1]+m[2].padStart(2,'0'):null;};
  const out=new Map();for(const r of rows){if(!r||!r.length)continue;let nr=null;const als=[];
    for(const c of r){const s=String(c??'').trim();if(!s)continue;const a=normAl(s);if(a){als.push(a);continue;}if(!nr&&/^\d{2,7}(\.0)?$/.test(s))nr=String(parseInt(s));}
    if(nr){const o=out.get(nr)||{nr,als:[]};for(const a of als)if(!o.als.includes(a))o.als.push(a);out.set(nr,o);}}
  if(!out.size)throw new Error('Nenhuma chave reconhecida na lista de NA. Use uma coluna com o nº da chave.');return [...out.values()];}
async function _plLerCarreg(file){const txt=new TextDecoder('iso-8859-1').decode(await file.arrayBuffer());const lin=txt.split(/\r?\n/);
  const h=lin.findIndex(l=>/^C[oó]digo do alimentador;/i.test(l));if(h<0)throw new Error('CSV de carregamento sem a linha de cabeçalho "Código do alimentador;…".');
  const f=s=>{s=(s||'').trim();if(!s)return null;const v=parseFloat(s.replace(/\./g,'').replace(',','.'));return isNaN(v)?null:v;};const out=[];
  for(const l of lin.slice(h+1)){const r=l.split(';');if(r.length<11||!r[1].trim())continue;const q=[f(r[5]),f(r[6]),f(r[7])].filter(v=>v!=null);
    out.push({al:r[0].trim(),nr:r[1].trim(),kva:f(r[3]),fases:f(r[4]),tot:f(r[8]),carreg:f(r[9]),ucs:f(r[10]),queda:q.length?Math.max(...q):null});}return out;}
window.plProcessar=async function(){
  if(me.perfil!=='gerente')return;const fk=document.getElementById('plFKmz').files[0],fu=document.getElementById('plFUc').files[0],fc=document.getElementById('plFCg').files[0];
  if(!fk||!fu||!fc){toast('Selecione os três arquivos: KMZ, planilha de UCs e CSV de carregamento.','warn');return;}
  const fna=document.getElementById('plFNa')?.files[0];
  const btn=document.getElementById('plBtnProc');btn.disabled=true;document.getElementById('plLog').textContent='';const pausa=()=>new Promise(r=>setTimeout(r,30));
  try{
    _plLog('Lendo planilha de UCs…');await pausa();const eq=await _plLerUC(fu);_plLog(`  ${eq.length} equipamentos`);
    _plLog('Lendo CSV de carregamento…');await pausa();const cg=await _plLerCarreg(fc);_plLog(`  ${cg.length} trafos com carregamento`);
    let listaNA=null;
    if(fna){_plLog('Lendo lista de chaves NA…');listaNA=await _plLerListaNA(fna);_plLog(`  ${listaNA.length} chaves NA (${listaNA.filter(r=>r.als.length).length} com alimentador informado)`);
      await setDoc(doc(db,'plan_meta','listaNA'),{lista:listaNA,arquivo:fna.name,atualizadoEm:serverTimestamp(),por:me.nome||me.email});}
    else{try{const m=await getDoc(doc(db,'plan_meta','listaNA'));if(m.exists()){listaNA=m.data().lista;_plLog(`Usando lista de NA já salva (${listaNA.length} chaves, ${m.data().arquivo||''})`);}}catch(e){}}
    _plLog('Descompactando KMZ…');await pausa();let kml;
    if(fk.name.toLowerCase().endsWith('.kml'))kml=await fk.text();else{const z=await JSZip.loadAsync(fk);const n=Object.keys(z.files).find(x=>x.toLowerCase().endsWith('.kml'));if(!n)throw new Error('KMZ sem arquivo KML');kml=await z.file(n).async('string');}
    _plLog(`  KML com ${Math.round(kml.length/1e6)} MB. Lendo elementos…`);await pausa();
    const K=planParseKML(kml);kml=null;_plLog(`  ${K.trechos.length} trechos, ${K.pts.length} equipamentos`);await pausa();
    _plLog('Montando topologia…');await pausa();const B=planBuild(K,eq,cg,{log:_plLog,listaNA});
    _plLog('Compactando e salvando…');await pausa();
    const z=new JSZip();z.file('b.json',planSerializar(B));const b64=await z.generateAsync({type:'base64',compression:'DEFLATE',compressionOptions:{level:6}});
    const T=900000;const partes=Math.ceil(b64.length/T);
    for(let i=0;i<partes;i++){await setDoc(doc(db,'plan_base','p'+i),{dados:b64.slice(i*T,(i+1)*T)});_plLog(`  parte ${i+1}/${partes} salva`);}
    await setDoc(doc(db,'plan_meta','atual'),{partes,tamanho:b64.length,atualizadoEm:serverTimestamp(),por:me.nome||me.email,stats:B.stats,
      arquivos:{kmz:fk.name,uc:fu.name,carreg:fc.name}});
    _plLog('Publicando a rede para a aba Mapa (todos os alimentadores)…');await pausa();
    const pub=planPublicarRedes(B);let np=0;
    for(const [al,o] of Object.entries(pub)){const meta=JSON.stringify({ram:o.ram,equip:o.equip,devs:o.devs}),geo=JSON.stringify(redeCodificarGeo(o.seg));
      if(meta.length>950000||geo.length>950000){_plLog(`  ${al}: grande demais para publicar (${Math.round(Math.max(meta.length,geo.length)/1024)} KB)`);continue;}
      const st={km:Math.round(Object.values(o.ram).reduce((a,r)=>a+r.kp,0)*10)/10,tds:Object.keys(o.equip).filter(k=>k[0]==='T').length,ramais:Object.keys(o.ram).length-1,principais:Object.values(o.ram).filter(r=>r.n===1).length};
      await setDoc(doc(db,'redes',al),{alimentador:al,meta,stats:st,atualizadoEm:serverTimestamp(),por:me.nome||me.email,arquivo:'Base de planejamento ARLAG'});
      await setDoc(doc(db,'redes_geo',al),{alimentador:al,geo,atualizadoEm:serverTimestamp()});np++;}
    _plLog(`  ${np} alimentadores publicados no Mapa.`);
    _plLog('Pronto.');toast(`Base de planejamento atualizada: ${Math.round(B.stats.km).toLocaleString('pt-BR')} km, ${B.stats.trafos} trafos.`);
    _pl.B=null;_pl.carregado=false;await _plCarregar();_plMostrar(true);
  }catch(e){console.error(e);_plLog('ERRO: '+e.message);toast('Erro ao processar: '+e.message,'err');}
  finally{btn.disabled=false;}
};

window.plProcessarAtuacoes=async function(){
  if(me.perfil!=='gerente')return;const f=document.getElementById('plFAtu').files[0];if(!f){toast('Selecione o PDF de atuações.','warn');return;}
  if(typeof pdfjsLib==='undefined'){toast('Biblioteca de leitura de PDF não carregou.','err');return;}
  const btn=document.getElementById('plBtnAtu');btn.disabled=true;document.getElementById('plLog').textContent='';
  try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    _plLog('Lendo PDF…');const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;_plLog(`  ${pdf.numPages} páginas`);
    const linhas=await planLerPdfLinhas(pdf,p=>_plLog(`  ${Math.round(p*100)}%`));const A=planParseAtuacoes(linhas);
    if(!A.linhas.length)throw new Error('Nenhuma atuação reconhecida. Confira se é o relatório "Atuações por Equipamento" do SIMO.');
    const tot=A.linhas.reduce((a,l)=>a+l.q,0),prog=A.linhas.filter(PLAN_CAUSA_PROG).reduce((a,l)=>a+l.q,0);
    _plLog(`  ${A.linhas.length} linhas · ${tot} atuações (${prog} programadas, excluídas) · período ${A.periodo}`);
    const z=new JSZip();z.file('a.json',JSON.stringify(A));const b64=await z.generateAsync({type:'base64',compression:'DEFLATE'});
    const T=900000;const partes=Math.ceil(b64.length/T);for(let i=0;i<partes;i++)await setDoc(doc(db,'plan_atu','p'+i),{dados:b64.slice(i*T,(i+1)*T)});
    await setDoc(doc(db,'plan_meta','atuacoes'),{partes,periodo:A.periodo,total:tot,programadas:prog,arquivo:f.name,atualizadoEm:serverTimestamp(),por:me.nome||me.email});
    _plLog('Pronto.');toast(`Atuações carregadas: ${tot-prog} não programadas.`);await _plCarregarAtu();_pl.an='calor';_plKpis();_plMostrar(true);
  }catch(e){console.error(e);_plLog('ERRO: '+e.message);toast('Erro ao processar atuações: '+e.message,'err');}
  finally{btn.disabled=false;}
};

// ══ OPORTUNIDADES: status, aviso no cadastro de obras e R2 vinculada (gerente) ══
const PL_OBRA_EXEC=new Set(['Em Execução','Atrasada','Obra Paralisada','Paral. Expirada','Prob. Executivo – Celesc']);
const PL_FIM_OBRA=s=>!PL_OBRA_EXEC.has(s);
// ── PVNT: lista de obras a executar (lembrete) ──
async function _plCarregarPvnt(){try{const m=await getDoc(doc(db,'plan_meta','pvnt'));_pl.pvnt=m.exists()?(m.data().lista||[]):null;_pl.pvntMeta=m.exists()?m.data():null;}catch(e){_pl.pvnt=null;}_pl._pvntCache=null;}
function _plPvntInfo(){const el=document.getElementById('plPvntInfo');if(el)el.innerHTML=_pl.pvnt?`<b>Lista atual: ${_pl.pvnt.length} obras (${_plEsc(_pl.pvntMeta?.arquivo||'')})</b>.`:'Nenhuma lista enviada ainda.';}
async function _plLerPvnt(file){let rows;
  if(/\.(csv|txt)$/i.test(file.name)){const t=new TextDecoder('iso-8859-1').decode(await file.arrayBuffer());rows=t.split(/\r?\n/).map(l=>l.split(/;|\t/));}
  else{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false});}
  const nrm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  let h=-1,cN=-1,cE=-1,cD=-1,cM=-1;
  for(let i=0;i<Math.min(rows.length,30)&&h<0;i++){const r=(rows[i]||[]).map(nrm);
    const e=r.findIndex(x=>/EQUIP|EQPTO|EQUIPAMENTO|^EQ\b|REFER/.test(x));const n=r.findIndex((x,j)=>j!==e&&/NOTA|^PS\b|N[º°O]?\s*PS|PVNT/.test(x));
    if(e>=0&&n>=0){h=i;cE=e;cN=n;cD=r.findIndex(x=>/DESCR|OBRA|SERVI|OBJETO|LOCAL|ENDERE/.test(x));if(cD===cN||cD===cE)cD=-1;cM=r.findIndex(x=>/MUNIC|CIDADE/.test(x));}}
  if(h<0){h=-1;cN=0;cE=1;} // sem cabeçalho: 1ª coluna nota, 2ª equipamento
  const cab=h>=0?(rows[h]||[]).map(x=>String(x??'').trim()):[];
  const out=[];const vist=new Set();
  for(let i=h+1;i<rows.length;i++){const r=rows[i];if(!r)continue;const nota=String(r[cN]??'').trim();const eq=String(r[cE]??'').trim().replace(/\.0$/,'');if(!nota||!eq)continue;
    const k=nota+'|'+eq;if(vist.has(k))continue;vist.add(k);
    const extras=cab.map((c,j)=>[c,r[j]]).filter(([c,v],j)=>c&&v!=null&&String(v).trim()!==''&&![cN,cE,cD,cM].includes(j)).slice(0,6).map(([c,v])=>`${c}: ${String(v).trim()}`.slice(0,80)).join(' · ');
    out.push({nota,equip:eq,desc:cD>=0?String(r[cD]??'').trim().slice(0,160):'',mun:cM>=0?String(r[cM]??'').trim():'',extras});}
  if(!out.length)throw new Error('Nenhuma obra reconhecida. A planilha precisa de uma coluna com a nota PS e outra com o equipamento de referência.');
  return out;}
window.plSalvarPvnt=async function(){if(me.perfil!=='gerente')return;const f=document.getElementById('plFPvnt')?.files[0];if(!f){toast('Selecione a planilha PVNT.','warn');return;}
  const btn=document.getElementById('plBtnPvnt');btn.disabled=true;
  try{const lista=await _plLerPvnt(f);await setDoc(doc(db,'plan_meta','pvnt'),{lista,arquivo:f.name,atualizadoEm:serverTimestamp(),por:me.nome||me.email});
    _pl.pvnt=lista;_pl.pvntMeta={arquivo:f.name};_pl._pvntCache=null;_plPvntInfo();
    try{await _plGarantirBase();}catch(e){}
    let semLoc=0;if(_pl.B)for(const p of lista)if(!planLocalizarEquip(_pl.B,p.equip))semLoc++;
    toast(`Lista PVNT salva: ${lista.length} obras${semLoc?` (${semLoc} com equipamento não localizado na rede)`:''}.`);
    if(_pl.B){_pl.an='pvnt';_plMostrar(true);_plKpis();}}
  catch(e){toast('Erro na lista PVNT: '+e.message,'err');}finally{btn.disabled=false;}};
function _plObraTrechos(){const m=new Map();if(!_pl.B||!_pl.R)return m;
  for(const o of (typeof obras!=='undefined'?obras:[])){if(!o.equipamentoRef||!PL_OBRA_EXEC.has(statusOf(o)))continue;const t=planTrechoEquip(_pl.B,_pl.R,o.equipamentoRef);if(t)m.set(o.id,{o,t});}return m;}
const _plCruza=(a,b)=>{for(const x of a)if(b.has(x))return true;return false;};
function _plPvntLinhas(){if(!_pl.pvnt||!_pl.B||!_pl.R)return[];if(_pl._pvntCache&&_pl._pvntCache.R===_pl.R&&_pl._pvntCache.n===obras.length)return _pl._pvntCache.rows;
  const ot=_plObraTrechos();const dig=s=>String(s||'').replace(/\D/g,'');let semLoc=0;
  const rows=_pl.pvnt.map(p=>{const t=planTrechoEquip(_pl.B,_pl.R,p.equip);if(!t)semLoc++;
    const _obras=t?[...ot.values()].filter(x=>_plCruza(x.t.bs,t.bs)).map(x=>x.o):[];
    const _itens=t?planOportunidadesNoTrecho(_pl.B,_pl.R,p.equip).itens:[];
    const ob=(typeof obras!=='undefined'?obras:[]).find(o=>!o.cancelado&&((dig(o.numero)&&dig(o.numero)===dig(p.nota))||(o.programa==='PVNT'&&String(o.equipamentoRef||'').trim()===String(p.equip))));
    return{...p,al:t?.al||'',trecho:t?t.rot:'equip. não localizado',pos:t?.pos||null,_bs:t?.bs||null,_obras,_itens,obrasExec:_obras.map(o=>o.numero||'s/ nº').join(', '),nOport:_itens.length,sppc:ob?(ob.numero||'s/ nº'):''};});
  _pl.pvntSemLoc=semLoc;_pl._pvntCache={R:_pl.R,n:obras.length,rows};return rows;}
function _plPvntNoTrecho(bs){if(!bs||!_pl.pvnt)return[];return _plPvntLinhas().filter(p=>p._bs&&_plCruza(p._bs,bs));}
// ── R2 avulsa: melhoria não apontada pelas análises, a partir de uma obra em execução ──
const PL_TIPOS_AVULSA=['Seccionamento','Chave de manobra / interligação','Derivação sem chave','Recondutoramento (cabo)','Monofásico → trifásico','Troca / remanejamento de trafo','Poda / faixa','Outra melhoria'];
window._plAvulsaForm=function(obraId){const el=document.getElementById('plAvulsa');if(!el)return;if(el.innerHTML){el.innerHTML='';return;}
  el.innerHTML=`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;padding:6px;border:1px dashed var(--border);border-radius:6px">
    <select id="plAvTipo" style="font-size:11px;padding:4px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">${PL_TIPOS_AVULSA.map(t=>`<option>${t}</option>`).join('')}</select>
    <input type="text" id="plAvDesc" placeholder="O que será feito (ex.: instalar chave na rua X)" style="flex:1;min-width:180px;font-size:11px;padding:4px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
    <button type="button" class="btn btn-primary btn-sm" onclick="_plGerarR2Avulsa('${_plEsc(obraId)}')">Abrir R2</button></div>`;
  document.getElementById('plAvDesc')?.focus();};
window._plGerarR2Avulsa=function(obraId){const tipo=document.getElementById('plAvTipo')?.value||'Outra melhoria';const desc=(document.getElementById('plAvDesc')?.value||'').trim();
  if(!desc){toast('Descreva a melhoria.','warn');return;}
  const loc=_pl._avisoAtual?.loc||{al:'',trecho:''};const pos=_pl._avisoAtual?.pos||null;
  const it={key:`AVULSA|${obraId}|${Date.now()}`,tipo,titulo:desc,det:'Aberta manualmente (não apontada pelas análises)',pos,avulsa:true};
  _plGerarR2(obraId,[it],loc);};
function _plIdOp(key){return key.replace(/[\/\s]+/g,'_').slice(0,700);}
function _plStatusOp(key){const d=_pl.ops&&_pl.ops.get(key);if(!d)return{base:'Planejada',txt:'Planejada'};
  if(d.decisao==='descartada')return{base:'Descartada',txt:'Descartada'+(d.motivo?` (${d.motivo})`:''),d};
  if(d.decisao==='pedido'){const pp=(typeof pedidos!=='undefined'?pedidos:[]).find(x=>x.id===d.pedidoId);
    if(pp&&(pp.acaoAnalista==='Cancelado'||pp.acaoAnalista==='Liberado sem Obra'))return{base:'Planejada',txt:`Planejada (pedido ${pp.nota||''} ${pp.acaoAnalista==='Cancelado'?'cancelado':'liberado sem obra'})`,d};
    return{base:'Em pedido',txt:`Em pedido de projeto (${d.pedidoNota||''})`,d};}
  const o=(typeof obras!=='undefined'?obras:[]).find(x=>x.id===d.obraMelhoriaId);
  if(!o)return{base:'Vinculada',txt:`Vinculada à R2 ${d.obraMelhoriaNum||''}`,d};
  if(o.cancelado)return{base:'Planejada',txt:`Planejada (R2 ${o.numero} cancelada)`,d};
  if(o.armazenado||o.conclusao)return{base:'Concluída',txt:`Concluída (R2 ${o.numero})`,d};
  return{base:'Em execução',txt:`Em execução (R2 ${o.numero})`,d};}
function _plOportLinhas(){const out=[];if(!_pl.R)return out;const vistos=new Set();
  for(const o of (typeof obras!=='undefined'?obras:[])){if(!o.equipamentoRef)continue;const st=statusOf(o);if(PL_FIM_OBRA(st))continue;
    const r=planOportunidadesNoTrecho(_pl.B,_pl.R,o.equipamentoRef);if(!r.loc)continue;
    for(const it of r.itens){const s=_plStatusOp(it.key);if(s.d&&s.d.obraMelhoriaId===o.id)continue; // a própria R2 vinculada
      if(s.d&&s.d.obraClienteId&&s.d.obraClienteId!==o.id&&s.base!=='Planejada')continue; // já decidida em outra obra
      vistos.add(it.key+'|'+o.id);
      out.push({...it,obraId:o.id,obraNum:o.numero||'s/ nº',obraTipo:o.tipo||'',obraStatus:st,al:r.loc.al,trecho:r.loc.trecho,situacao:s.txt,situacaoBase:s.base,r2:s.d?.obraMelhoriaNum||''});}}
  // decisões já tomadas cuja obra cliente não está mais ativa
  if(_pl.ops)for(const d of _pl.ops.values()){if(vistos.has(d.key+'|'+d.obraClienteId))continue;const s=_plStatusOp(d.key);
    const oc=(typeof obras!=='undefined'?obras:[]).find(x=>x.id===d.obraClienteId);
    out.push({key:d.key,tipo:d.tipo+(String(d.key).startsWith('AVULSA|')?' (avulsa)':''),titulo:d.titulo,det:d.det,pos:d.pos,obraId:d.obraClienteId,obraNum:d.obraClienteNum||'',obraTipo:oc?.tipo||'',obraStatus:oc?statusOf(oc):'(encerrada)',al:d.al||'',trecho:d.trecho||'',situacao:s.txt,situacaoBase:s.base,r2:d.obraMelhoriaNum||''});}
  if(_pl.pvnt){const ot=_plObraTrechos();for(const r of out){const x=ot.get(r.obraId);if(x)r.pvnt=_plPvntNoTrecho(x.t.bs).map(p=>p.nota).join(', ');}}
  const ordem={Planejada:0,Vinculada:1,'Em execução':2,Concluída:3,Descartada:4};out.sort((a,b)=>(ordem[a.situacaoBase]-ordem[b.situacaoBase])||String(a.obraNum).localeCompare(String(b.obraNum)));
  const n=k=>out.filter(r=>r.situacaoBase===k).length;_pl.oportResumo=`${n('Planejada')} a decidir · ${n('Em execução')} em execução`;return out;}

// ── aviso no modal da obra ──
let _plPend=null;
async function _plAvisoObra(obraId){
  if(me.perfil!=='gerente')return;const modal=document.querySelector('#ovObra .modal');if(!modal)return;
  let box=document.getElementById('plAvisoObra');if(!box){box=document.createElement('div');box.id='plAvisoObra';const h2=document.getElementById('obraModalTit');h2.insertAdjacentElement('afterend',box);}
  const pendBanner=_plPend&&!obraId?`<div style="background:rgba(124,106,247,.12);border:1px solid #7c6af7;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:11px">🔗 Nova R2 de melhoria vinculada à obra <b>${_plEsc(_plPend.cliente.numero)}</b> (${_plPend.itens.length} oportunidade${_plPend.itens.length>1?'s':''}). Preencha o nº da obra e os demais dados e salve. <a href="#" onclick="_plCancelarPend();return false" style="color:#7c6af7">Cancelar vínculo</a></div>`:'';
  box.innerHTML=pendBanner;if(_plPend&&!obraId)return;
  const obra=obraId?obras.find(o=>o.id===obraId):null;const nr=(document.getElementById('oEquipRef')?.value||'').trim()||obra?.equipamentoRef;
  if(obra&&!PL_OBRA_EXEC.has(statusOf(obra))){box.innerHTML='';return;} // só obras em execução geram oportunidades
  if(!nr)return;box.innerHTML='<div style="font-size:10px;color:var(--muted);margin:4px 0">Verificando oportunidades de melhoria no trecho…</div>';
  let ok=false;try{ok=await _plGarantirBase();}catch(e){console.warn(e);}
  if(!ok){box.innerHTML='';return;}
  const r=planOportunidadesNoTrecho(_pl.B,_pl.R,nr);const tr=r.loc?planTrechoEquip(_pl.B,_pl.R,nr):null;
  const pv=tr?_plPvntNoTrecho(tr.bs).filter(p=>!obra||p.sppc!==obra.numero):[];
  const pvHtml=pv.length?`<div style="background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.45);border-radius:8px;padding:6px 10px;margin:6px 0;font-size:11px">📌 <b>PVNT prevista neste trecho:</b> ${pv.map(p=>`nota ${_plEsc(p.nota)} (equip. ${_plEsc(p.equip)}${p.desc?' · '+_plEsc(p.desc.slice(0,60)):''}${p.sppc?' · já no SPPC: '+_plEsc(p.sppc):''})`).join('; ')}</div>`:'';
  const salvo=!!obra;const exec=salvo&&PL_OBRA_EXEC.has(statusOf(obra))&&!obra.obraClienteVinculada;
  const avBtn=exec?`<button type="button" class="btn btn-secondary btn-sm" onclick="_plAvulsaForm('${_plEsc(obra.id)}')" title="Melhoria que não foi apontada pelas análises">➕ Abrir R2 avulsa</button>`:'';
  _pl._avisoAtual={itens:r.itens,loc:r.loc||{al:'',trecho:''},pos:tr?.pos||null};
  if(!r.loc||!r.itens.length){box.innerHTML=pvHtml+`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:10px;color:var(--muted);margin:4px 0">${!r.loc?`Equipamento ${_plEsc(nr)} não localizado na base de planejamento.`:`✓ Nenhuma oportunidade de melhoria apontada no trecho ${_plEsc(r.loc.trecho)} (${_plEsc(r.loc.al)}).`} ${avBtn}</div><div id="plAvulsa"></div>`;return;}
  const linhas=r.itens.map((it,i)=>{const s=_plStatusOp(it.key);const livre=s.base==='Planejada';
    return `<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-top:1px solid var(--border);font-size:11px;cursor:${livre?'pointer':'default'}">
      <input type="checkbox" class="plOpChk" data-i="${i}" ${livre?'checked':'disabled'} style="margin-top:2px">
      <span style="flex:1"><b>${_plEsc(it.tipo)}</b> — ${_plEsc(it.titulo)}<br><span style="color:var(--muted);font-size:10px">${_plEsc(it.det)}</span></span>
      <span style="font-size:10px;white-space:nowrap;color:${livre?'#ef4444':s.base==='Descartada'?'var(--muted)':'#3b82f6'}">${_plEsc(s.txt)}</span></label>`;}).join('');
  box.innerHTML=pvHtml+`<details open style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.45);border-radius:8px;padding:8px 10px;margin:6px 0 10px">
    <summary style="cursor:pointer;font-size:12px;font-weight:700;color:#d97706">⚠️ ${r.itens.length} oportunidade${r.itens.length>1?'s':''} de melhoria no trecho ${_plEsc(r.loc.trecho)} · ${_plEsc(r.loc.al)}</summary>
    <div style="margin-top:6px">${linhas}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
      ${salvo?`<button type="button" class="btn btn-primary btn-sm" onclick="_plGerarR2('${_plEsc(obra.id)}')">➕ Gerar R2 de melhoria com as selecionadas</button>
      <input type="text" id="plOpMotivo" placeholder="Motivo do descarte" style="flex:1;min-width:140px;font-size:11px;padding:4px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
      <button type="button" class="btn btn-secondary btn-sm" onclick="_plDescartar('${_plEsc(obra.id)}')">Descartar selecionadas</button>${avBtn}`
      :`<span style="font-size:10px;color:var(--muted)">Salve a obra para poder gerar a R2 vinculada ou descartar.</span>`}
    </div><div id="plAvulsa"></div></details>`;}
function _plSelecionadas(){const it=_pl._avisoAtual?.itens||[];return [...document.querySelectorAll('#plAvisoObra .plOpChk:checked')].map(c=>it[+c.dataset.i]).filter(Boolean);}
window.plAbrirObraAvulsa=()=>{const id=document.getElementById('plAvObra')?.value;if(!id){toast('Escolha a obra em execução.','warn');return;}
  openObraModal(id);setTimeout(()=>{const t=setInterval(()=>{if(document.getElementById('plAvulsa')){clearInterval(t);_plAvulsaForm(id);document.getElementById('plAvisoObra')?.scrollIntoView({block:'nearest'});}},150);setTimeout(()=>clearInterval(t),8000);},50);};
window._plCancelarPend=()=>{_plPend=null;const b=document.getElementById('plAvisoObra');if(b)b.innerHTML='';toast('Vínculo cancelado.','warn');};
window._plDescartar=async function(obraId){const sel=_plSelecionadas();if(!sel.length){toast('Selecione ao menos uma oportunidade.','warn');return;}
  const motivo=(document.getElementById('plOpMotivo')?.value||'').trim();if(!motivo){toast('Informe o motivo do descarte.','warn');return;}
  const o=obras.find(x=>x.id===obraId);const loc=_pl._avisoAtual.loc;
  try{for(const it of sel){const reg={key:it.key,tipo:it.tipo,titulo:it.titulo,det:it.det,pos:it.pos||null,al:loc.al,trecho:loc.trecho,decisao:'descartada',motivo,obraClienteId:obraId,obraClienteNum:o?.numero||'',em:serverTimestamp(),por:me.nome||me.email};
      await setDoc(doc(db,'oportunidades',_plIdOp(it.key)),reg);_pl.ops.set(it.key,reg);}
    _pl.oportResumo=null;toast(`${sel.length} oportunidade(s) descartada(s).`);_plAvisoObra(obraId);}catch(e){toast('Erro ao descartar: '+e.message,'err');}};
window._plGerarR2=function(obraId,itens,loc){const sel=Array.isArray(itens)?itens:_plSelecionadas();if(!sel.length){toast('Selecione ao menos uma oportunidade.','warn');return;}
  const c=obras.find(x=>x.id===obraId);if(!c)return;
  _plPend={itens:sel,loc:loc||_pl._avisoAtual?.loc||{al:'',trecho:''},cliente:{id:c.id,numero:c.numero||'',cidade:c.cidade||'',empreiteira:c.empreiteira||'',fiscal:c.fiscal||'',equipamentoRef:c.equipamentoRef||''}};
  _plOpenOrig(); // nova obra
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null&&v!==''){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));}};
  set('oTipo','R2');try{toggleEnquadramento();}catch(e){}set('oPrograma','Melhoria');set('oCidade',c.cidade);set('oEmp',c.empreiteira);set('oEquipRef',c.equipamentoRef);
  const fs=document.getElementById('oFiscalSelect');if(fs&&c.fiscal){if([...fs.options].some(o=>o.value===c.fiscal))set('oFiscalSelect',c.fiscal);else{set('oFiscalSelect','outro');try{toggleFiscalOutro();}catch(e){}set('oFiscalNome',c.fiscal);}}
  set('oAbertura',new Date().toISOString().slice(0,10));
  const tipos=sel.length===1&&sel[0].avulsa?`${sel[0].tipo} - ${sel[0].titulo}`:[...new Set(sel.map(s=>s.tipo))].join(', ');set('oDescricao',`Melhoria vinc. obra ${c.numero}: ${tipos}`.slice(0,80));
  _plAvisoObra(null);};
async function _plConcluirVinculo(pend,numero){
  const s=await getDocs(query(collection(db,'obras'),where('numero','==',numero)));const cand=s.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.id!==pend.cliente.id&&o.tipo==='R2');
  const nova=cand.sort((a,b)=>(b.criadaEm?.seconds||0)-(a.criadaEm?.seconds||0))[0];if(!nova){toast('R2 salva, mas não foi possível localizar para vincular.','warn');return;}
  const keys=pend.itens.map(i=>i.key);
  await updateDoc(doc(db,'obras',nova.id),{obraClienteVinculada:{id:pend.cliente.id,numero:pend.cliente.numero},oportunidadesPlanejamento:keys});
  const cli=obras.find(o=>o.id===pend.cliente.id);const lista=[...(cli?.obrasMelhoriaVinculadas||[]),{id:nova.id,numero:nova.numero}];
  await updateDoc(doc(db,'obras',pend.cliente.id),{obrasMelhoriaVinculadas:lista});
  if(!_pl.ops)_pl.ops=new Map();
  for(const it of pend.itens){const reg={key:it.key,tipo:it.tipo,titulo:it.titulo,det:it.det,pos:it.pos||null,al:pend.loc.al,trecho:pend.loc.trecho,decisao:'vinculada',
      obraMelhoriaId:nova.id,obraMelhoriaNum:nova.numero,obraClienteId:pend.cliente.id,obraClienteNum:pend.cliente.numero,em:serverTimestamp(),por:me.nome||me.email};
    await setDoc(doc(db,'oportunidades',_plIdOp(it.key)),reg);_pl.ops.set(it.key,reg);}
  _pl.oportResumo=null;toast(`R2 ${nova.numero} vinculada à obra ${pend.cliente.numero} (${keys.length} oportunidade${keys.length>1?'s':''}).`);}
// ganchos não intrusivos: preservam o comportamento original do cadastro
const _plOpenOrig=window.openObraModal;
window.openObraModal=function(obraId){const r=_plOpenOrig.apply(this,arguments);
  if(me&&me.perfil==='gerente'){if(obraId)_plPend=null;setTimeout(()=>_plAvisoObra(obraId||null),0);}else{const b=document.getElementById('plAvisoObra');if(b)b.innerHTML='';}
  return r;};
const _plSaveOrig=window.saveObra;
window.saveObra=async function(){const pend=_plPend;const novo=!document.getElementById('obraId')?.value;const numero=(document.getElementById('oNum')?.value||'').trim();
  const r=await _plSaveOrig.apply(this,arguments);
  const fechou=!document.getElementById('ovObra')?.classList.contains('open');
  if(pend&&novo&&fechou&&numero){_plPend=null;try{await _plConcluirVinculo(pend,numero);}catch(e){console.error(e);toast('R2 salva, mas houve erro ao vincular: '+e.message,'err');}}
  return r;};
document.addEventListener('change',e=>{if(e.target&&e.target.id==='oEquipRef'&&me&&me.perfil==='gerente'){const id=document.getElementById('obraId')?.value;if(!_plPend)_plAvisoObra(id||null);}});


// ══════════════════════════════════════════════════════
//  VIA DA OBRA DEIXADA PARA FECHAMENTO (fiscal marca; fiscal ou gerente desmarca)
// ══════════════════════════════════════════════════════
const VIAS_OBRA={
  fech:{campo:'viaFechamento',  rot:'📁 Via da obra deixada para fechamento',      dica:'Marque quando deixar a via física da obra para fechamento.', ok:'Via marcada como deixada para fechamento.'},
  simo:{campo:'viaCadastroSimo',rot:'🗂️ Via da obra enviada para cadastro SIMO',   dica:'Marque quando enviar a via da obra para o cadastro SIMO.',   ok:'Via marcada como enviada para cadastro SIMO.'},
};
function renderViaFechamento(obra){
  const el=document.getElementById('viaFechWrap'); if(!el) return;
  const perfisVe=['fiscal','fiscal_adm','gerente','adm_odi','estagiario','genesis'];
  if(!obra || !me || !perfisVe.includes(me.perfil)){ el.style.display='none'; el.innerHTML=''; return; }
  const pode=['fiscal','fiscal_adm','gerente'].includes(me.perfil);
  el.style.display='block';
  el.innerHTML=Object.entries(VIAS_OBRA).map(([k,v])=>{ const on=!!obra[v.campo]; const em=obra[v.campo+'Em'], por=obra[v.campo+'Por'];
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin:8px 0;border-radius:8px;border:1px solid ${on?'rgba(34,197,94,.4)':'var(--border)'};background:${on?'rgba(34,197,94,.07)':'transparent'}">
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;cursor:${pode?'pointer':'default'}">
      <input type="checkbox" style="width:auto" ${on?'checked':''} ${pode?'':'disabled'} onchange="toggleViaObra('${obra.id}','${k}',this.checked)">
      ${v.rot}
    </label>
    <span style="font-size:11px;color:var(--muted)">${on?('Marcado em '+fmtTxt(em)+(por?' por '+String(por).replace(/</g,'&lt;'):'')):(pode?v.dica:'Ainda não marcado pelo fiscal.')}</span>
  </div>`; }).join('');
}
window.toggleViaObra=async function(obraId,qual,marcar){
  const v=VIAS_OBRA[qual]; if(!v) return;
  if(!['fiscal','fiscal_adm','gerente'].includes(me.perfil)){ toast('Somente o fiscal ou o gerente altera esta marcação.','err'); return; }
  const o=obras.find(x=>x.id===obraId); if(!o) return;
  const patch=marcar?{[v.campo]:true,[v.campo+'Em']:pdHojeStr(),[v.campo+'Por']:me.nome||me.email||''}
                    :{[v.campo]:false,[v.campo+'Em']:null,[v.campo+'Por']:null};
  try{
    await updateDoc(doc(db,'obras',obraId),{...patch,atualizadaEm:serverTimestamp()});
    Object.assign(o,patch); renderViaFechamento(o);
    toast(marcar?v.ok:'Marcação removida.');
    try{ window.renderObras(); }catch(e){}
  }catch(e){ console.error(e); toast('Erro ao salvar: '+e.message,'err'); renderViaFechamento(o); }
};
window.toggleViaFechamento=function(obraId,marcar){ return window.toggleViaObra(obraId,'fech',marcar); };

// ══════════════════════════════════════════════════════
//  EMPREITEIRA: corrigir / completar os equipamentos já informados (obras RD)
// ══════════════════════════════════════════════════════
let _equipHome=null;   // posição original do bloco de equipamentos (dentro do formulário de novo kaffa)
function _equipEditRestaurar(){
  const blk=document.getElementById('secConclusaoExtra'); const wrap=document.getElementById('equipEditWrap');
  if(blk && _equipHome && blk.parentNode!==_equipHome.pai){ _equipHome.pai.insertBefore(blk,_equipHome.prox); blk.style.display='none'; }
  if(wrap) wrap.style.display='none';
}
function _equipPodeEditar(obra){
  return !!obra && !!me && me.perfil==='empreiteira' && obra.tipo!=='ODI' && !obra.cancelado && !obra.armazenado
    && ((obra.kaffaEntries||[]).length>0 || !!obra.kaffa || (obra.equipamentosInstalados||[]).length>0 || (obra.equipamentosRetirados||[]).length>0 || !!obra.sap || !!obra.placas);
}
function _equipBtnAtualizar(obra){
  const b=document.getElementById('btnEditarEquip'); if(b) b.style.display=_equipPodeEditar(obra)?'inline-flex':'none';
}
window.abrirEdicaoEquip=function(){
  const obra=obras.find(o=>o.id===document.getElementById('obraId')?.value); if(!_equipPodeEditar(obra)) return;
  const blk=document.getElementById('secConclusaoExtra'), slot=document.getElementById('equipEditSlot'), wrap=document.getElementById('equipEditWrap');
  if(!blk||!slot||!wrap) return;
  try{ window.cancelarNovoKaffa(); }catch(e){}
  if(!_equipHome) _equipHome={pai:blk.parentNode,prox:blk.nextSibling};
  slot.appendChild(blk); blk.style.display='block';
  const nota=document.getElementById('transDataNota'); if(nota) nota.innerHTML='🔩 Equipamentos informados — corrija, adicione ou remova.';
  initEquipFromObra(obra);
  wrap.style.display='block';
  document.getElementById('btnEditarEquip').style.display='none';
};
window.cancelarEdicaoEquip=function(){
  const obra=obras.find(o=>o.id===document.getElementById('obraId')?.value);
  _equipEditRestaurar(); if(obra) initEquipFromObra(obra); _equipBtnAtualizar(obra);
};
window.salvarEdicaoEquip=async function(){
  const obra=obras.find(o=>o.id===document.getElementById('obraId')?.value); if(!_equipPodeEditar(obra)) return;
  try{ document.activeElement && document.activeElement.blur(); }catch(e){}
  const limpa=l=>l.map(e=>{ const c={...e}; Object.keys(c).forEach(k=>{ if(typeof c[k]==='string') c[k]=c[k].trim(); if(c[k]===undefined) c[k]=''; }); return c; });
  const ins=limpa(_equipInstalados), ret=limpa(_equipRetirados);
  const vazio=e=>!['placas','potencia','sap','serie','fabricante','dataTransf'].some(k=>String(e[k]??'').trim());
  if(ins.some(vazio)||ret.some(vazio)){ toast('Há um transformador sem nenhum dado preenchido — preencha ou remova (✕).','err'); return; }
  const p0=ins[0]||{}, r0=ret[0]||{};
  const patch={equipamentosInstalados:ins, equipamentosRetirados:ret,
    // campos antigos (1º equipamento) mantidos em sincronia para relatórios e telas que ainda os usam
    placas:p0.placas||'', sap:p0.sap||'', serie:p0.serie||'', fabricante:p0.fabricante||'', potencia:p0.potencia?parseFloat(p0.potencia)||null:null, dataTransf:p0.dataTransf||null,
    temRetirado:ret.length>0, potenciaRet:r0.potencia?parseFloat(r0.potencia)||null:null, sapRet:r0.sap||null, serieRet:r0.serie||null, fabricanteRet:r0.fabricante||null,
    equipAtualizadoEm:pdHojeStr(), equipAtualizadoPor:me.nome||me.email||''};
  const btn=document.getElementById('btnSalvarEquipEdit'); if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
  try{
    await updateDoc(doc(db,'obras',obra.id),{...patch,atualizadaEm:serverTimestamp()});
    Object.assign(obra,patch); _equipModificado=false;
    _equipEditRestaurar(); initEquipFromObra(obra); _equipBtnAtualizar(obra);
    toast('Equipamentos atualizados.');
  }catch(e){ console.error(e); toast('Erro ao salvar equipamentos: '+e.message,'err'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='💾 Salvar equipamentos'; } }
};
const _viaOpenOrig=window.openObraModal;
window.openObraModal=function(obraId){
  const r=_viaOpenOrig.apply(this,arguments);
  const _ob=obraId?obras.find(o=>o.id===obraId):null;
  try{ renderViaFechamento(_ob); }catch(e){ console.warn('[via fechamento]',e); }
  try{ _equipEditRestaurar(); _equipBtnAtualizar(_ob); }catch(e){ console.warn('[editar equipamentos]',e); }
  return r;
};
