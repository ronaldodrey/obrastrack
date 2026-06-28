// ══════════════════════════════════════════════════════
//  SPCC_ARLAG — app.js
// ══════════════════════════════════════════════════════
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged }
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
  console.error('SPCC_ARLAG Error:', e.message, e.filename, e.lineno);
  const dc = document.getElementById('dashContent');
  if(dc && dc.innerHTML.includes('Carregando')) {
    dc.innerHTML = `<div style="padding:24px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;color:#EF4444;font-size:12px">
      <strong>Erro detectado:</strong> ${e.message} (linha ${e.lineno})<br>
      <small>Verifique o console do navegador (F12) para detalhes.</small>
    </div>`;
  }
});
window.addEventListener('unhandledrejection', e => {
  console.error('SPCC_ARLAG Promise Error:', e.reason);
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
let _filtroRapidoAtivo=null; // módulo-level quick filter (not window-scoped)

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
  if(o.medida230)    return 'Aguard. Medida 280';
  if(o.medida70)     return 'Aguard. Medida 230';
  if(o.medicao)      return 'Aguard. Medida 70';
  if(o.fiscalizacao && !o.dataCadastro){
    const d=diff(o.fiscalizacao, new Date().toISOString().split('T')[0]);
    if(d!==null && d>30) return 'Encaminhar Cadastro Urgente';
  }
  if(o.kaffa)        return 'Aguard. Medição';
  if(o.fiscalizacao) return 'Aguardando Kaffa';
  if(o.impedimento)  return 'Prob. Executivo – Celesc';
  if(o.conclusao)    return 'Aguard. Fiscalização';
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
    verificarNotificacoes();
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

  const tabs=[['pgDash','📊 Dashboard'],['pgObras','🏗️ Obras']];
  if(me.perfil==='gerente'){ tabs.push(['pgCarteira','📈 Carteira']); tabs.push(['pgEmpreiteiras','🏢 Empreiteiras']); tabs.push(['pgUsers','👥 Usuários']); }
  // genesis e estagiario: só dash e obras (read-only + ação específica)
  document.getElementById('tabBar').innerHTML=tabs
    .map(([id,lbl])=>`<div class="tab" data-page="${id}" onclick="showPage('${id}')">${lbl}</div>`).join('');

  document.getElementById('btnNovaObra').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnImport').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnBulkDelete').style.display='none'; // shown by filtroRapido when encerradas selected
  buildTableHeader();

  const q=query(collection(db,'obras'),orderBy('criadaEm','desc'));
  unsubObras=onSnapshot(q,snap=>{
    obras=snap.docs.map(d=>({id:d.id,...d.data()}));
    const active=document.querySelector('.page.active');
    if(active?.id==='pgDash'){ renderDash(); setTimeout(renderChart,200); }
    if(active?.id==='pgObras') window.renderObras();
    if(active?.id==='pgCarteira') renderCarteira();
  });

  showPage('pgDash');
}
window.showPage=function(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.page===id));
  document.getElementById(id).classList.add('active');
  if(id==='pgDash') renderDash();
  if(id==='pgObras') window.renderObras();
  if(id==='pgCarteira') renderCarteira();
  if(id==='pgUsers') renderUsers();
  if(id==='pgEmpreiteiras') renderEmpreiteiras();
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

function renderDash(){
  const listAll = obras; // todas as obras (sem filtro de perfil para o gerente navegar)
  const list = visibleObras();
  let html = '';

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
    else if(me.perfil === 'fiscal')
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
    ${kpiCard('Cadastro Urgente',list.filter(o=>statusOf(o)==='Encaminhar Cadastro Urgente').length,'+30d sem cadastro','#EF4444')}
    ${kpiCard('Encerradas',list.filter(o=>statusOf(o)==='Encerrada').length,'armazenadas','#16A34A')}
  </div>`;

  // Tabela resumo por fiscal
  html += '<div class="sect-title" style="margin-bottom:10px">Painel de Fiscais</div>';
  html += tabelaResumoFiscais(list);
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
    ${kpiCard('Cadastro Urgente',cadUrgente.length,'+30d sem enviar','#EF4444')}
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

  // Filtrar obras com dataPendencia
  const comData = list.filter(o => o.dataPendencia);
  if(!comData.length){
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">Nenhuma pendência com data registrada ainda.</div>';
    return;
  }

  // Agrupar por mês (MM/YYYY)
  const grupos = {};
  comData.forEach(o => {
    const [y,m] = o.dataPendencia.split('-');
    const key = `${m}/${y}`;
    if(!grupos[key]) grupos[key] = { total: 0, resolvidas: 0 };
    grupos[key].total++;
    if(o.pendenciaResolvida) grupos[key].resolvidas++;
  });

  // Ordenar cronologicamente (últimos 12 meses)
  const mesesOrd = Object.keys(grupos).sort((a,b) => {
    const [ma,ya] = a.split('/'); const [mb,yb] = b.split('/');
    return (+ya*12+ +ma) - (+yb*12+ +mb);
  }).slice(-12);

  const maxVal = Math.max(...mesesOrd.map(k => grupos[k].total), 1);
  const barW = Math.max(30, Math.floor(560 / (mesesOrd.length + 1)));
  const h = 120;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(600, mesesOrd.length * (barW + 12) + 60)}" height="${h + 70}" style="font-family:'DM Mono',monospace">`;

  mesesOrd.forEach((mes, i) => {
    const g = grupos[mes];
    const x = 40 + i * (barW + 12);
    const barH = Math.max(4, Math.round((g.total / maxVal) * h));
    const barHRes = g.resolvidas > 0 ? Math.max(2, Math.round((g.resolvidas / maxVal) * h)) : 0;
    const y = h - barH + 10;

    // Total (laranja)
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="rgba(249,115,22,.7)"/>`;
    // Resolvidas (verde, em cima)
    if(barHRes > 0)
      svg += `<rect x="${x}" y="${h - barHRes + 10}" width="${barW}" height="${barHRes}" rx="3" fill="rgba(34,197,94,.7)"/>`;
    // Label valor
    svg += `<text x="${x+barW/2}" y="${y-4}" text-anchor="middle" font-size="9" fill="#F97316" font-weight="700">${g.total}</text>`;
    // Label mês
    svg += `<text x="${x+barW/2}" y="${h+26}" text-anchor="middle" font-size="9" fill="#6b7280">${mes}</text>`;
  });

  // Legenda
  svg += `<rect x="40" y="${h+40}" width="10" height="8" rx="2" fill="rgba(249,115,22,.7)"/>
    <text x="54" y="${h+48}" font-size="9" fill="#e8eaf0">Total de pendências</text>
    <rect x="180" y="${h+40}" width="10" height="8" rx="2" fill="rgba(34,197,94,.7)"/>
    <text x="194" y="${h+48}" font-size="9" fill="#e8eaf0">Resolvidas</text>`;

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
  if(tipo === 'med70')  return o.medida70  ? null : diasRestantes(prazoMedida70e230(o));
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
  // Apenas obras que ainda precisam de medidas (não canceladas/paralisadas/encerradas)
  const ativas = list.filter(o => !o.cancelado && !o.armazenado);

  // Calcula dias para cada medida em cada obra
  function listaOrdenada(obrasArr, tipo){
    return obrasArr
      .map(o => ({ o, dias: diasParaMedida(o, tipo) }))
      .filter(x => x.dias !== null) // null = já preenchida
      .sort((a,b) => {
        if(a.dias < 0 && b.dias >= 0) return -1;
        if(a.dias >= 0 && b.dias < 0) return 1;
        return a.dias - b.dias;
      });
  }

  // Obras que precisam de Med.70: tem conclusão, sem med70 (prazo = dataLimite)
  const sem70  = ativas.filter(o => o.conclusao && !o.medida70);
  // Obras que precisam de Med.230: tem conclusão, sem med230 (prazo = dataLimite)
  const sem230 = ativas.filter(o => o.conclusao && !o.medida230);
  // Obras que precisam de Med.280: tem med230, sem med280
  const sem280 = ativas.filter(o => o.medida230 && !o.medida280);

  const ord70  = listaOrdenada(sem70,  'med70');
  const ord230 = listaOrdenada(sem230, 'med230');
  const ord280 = listaOrdenada(sem280, 'med280');

  // Separar em "este mês + atrasadas" vs "próximos meses"
  const mesAtualFim = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().split('T')[0];
  function splitMes(lista){ return { atual: lista.filter(x=>x.dias<=0||(diasRestantes(mesAtualFim)>=0&&x.dias<=diasRestantes(mesAtualFim))), proximo: lista.filter(x=>x.dias>0&&x.dias>diasRestantes(mesAtualFim)) }; }
  const sp70=splitMes(ord70), sp230=splitMes(ord230), sp280=splitMes(ord280);

  // Contadores por urgência para cada painel
  function contadores(lista){
    const venc  = lista.filter(x => x.dias < 0).length;
    const hoje  = lista.filter(x => x.dias === 0).length;
    const urg   = lista.filter(x => x.dias >= 1 && x.dias <= 5).length;
    const alrt  = lista.filter(x => x.dias >= 6 && x.dias <= 15).length;
    const ok    = lista.filter(x => x.dias > 15).length;
    return { venc, hoje, urg, alrt, ok };
  }

  function renderPainelMonitor(titulo, subtitulo, lista, tipo, corTopo, prazoFn){
    const cnt = contadores(lista);
    const totalPend = lista.length;
    // Mini KPIs
    const resumo = [
      cnt.venc  > 0 ? `<span style="color:#6B7280;font-weight:700">${cnt.venc} vencidas</span>` : null,
      cnt.hoje  > 0 ? `<span style="color:#EF4444;font-weight:700">${cnt.hoje} vencem hoje</span>` : null,
      cnt.urg   > 0 ? `<span style="color:#EF4444;font-weight:600">${cnt.urg} críticas (≤5d)</span>` : null,
      cnt.alrt  > 0 ? `<span style="color:#F59E0B;font-weight:600">${cnt.alrt} atenção (6–15d)</span>` : null,
      cnt.ok    > 0 ? `<span style="color:#22C55E">${cnt.ok} ok (>15d)</span>` : null,
    ].filter(Boolean).join(' · ');

    // Tabela de obras (máx 10 linhas, ordenadas por urgência)
    const linhas = lista.slice(0, 10).map(({o, dias}) => {
      const c = corPrazo(dias);
      const prazoLim = prazoFn(o);
      const fc = o.fiscal ? gc(o.fiscal) : 'var(--muted)';
      // Color obra number: red=vencida, orange=≤5d, green=>5d
      const numCor = dias < 0 ? '#EF4444' : dias <= 5 ? '#F97316' : '#22C55E';
      return `<tr>
        <td><strong style="color:${numCor}">${o.numero||'—'}</strong></td>
        <td style="font-size:10px">${o.cidade||'—'}</td>
        <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px">
          <span style="width:5px;height:5px;border-radius:50%;background:${fc};display:inline-block"></span>${o.fiscal||'—'}</span></td>
        <td style="font-size:10px">${o.empreiteira||'—'}</td>
        <td style="font-size:10px;color:var(--muted)">${fmt(o.dataLimite)}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${c.bg};color:${c.cor};border:1px solid ${c.cor}33;white-space:nowrap">
            <span style="width:6px;height:6px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
            ${c.label}
          </span>
        </td>
      </tr>`;
    }).join('');

    const maisTxt = lista.length > 10 ? `<tr><td colspan="6" style="text-align:center;font-size:10px;color:var(--muted);padding:8px">… e mais ${lista.length - 10} obras</td></tr>` : '';

    return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;border-top:3px solid ${corTopo}">
      <div style="padding:14px 18px 10px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:${corTopo}">${titulo}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${subtitulo}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:${corTopo}">${totalPend}</span>
            <span style="font-size:10px;color:var(--muted)">obras<br>pendentes</span>
          </div>
        </div>
        ${resumo ? `<div style="font-size:10px;margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">${resumo}</div>` : ''}
      </div>
      ${totalPend === 0
        ? `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">✅ Todas as obras com ${titulo} em dia!</div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Nº Obra</th>
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Cidade</th>
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Fiscal</th>
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Empreiteira</th>
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Prazo Limite</th>
              <th style="padding:7px 12px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Situação</th>
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
        <!-- Monitor 1: Atrasadas + Este mês -->
      <div style="grid-column:1/-1">
        <div style="font-size:11px;font-weight:700;color:#EF4444;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          🚨 Atrasadas + Vencem Este Mês
          <span style="font-size:9px;color:var(--muted);font-weight:400">Ação urgente necessária</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:20px">
          ${renderPainelMonitor('Medida 70','Prazo = Data Limite · Indica: obra liberada no prazo',sp70.atual,'med70','#14B8A6',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 230','Prazo = Data Limite · Indica: execução no prazo',sp230.atual,'med230','#10B981',prazoMedida70e230)}
          ${renderPainelMonitor('Medida 280','Prazo = último dia mês seguinte à Med.230',sp280.atual,'med280','#22C55E',prazoMedida280)}
        </div>
      </div>
      <!-- Monitor 2: Próximos meses -->
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
  const cols=[
    'Status','Nº','Tipo','Cidade','Empreiteira','Fiscal',
    'Abertura','Prazo','Data Limite','Dias Exec.',
    'Deslig.','Conclusão','Fiscalização','Pendência','Kaffa','Cadastro','Medição','USC','ULV',
    {label:'Medição Tipo',tip:'Parcial ou Final — indica o tipo de medição registrado'},
    {label:'Med. 70',tip:'Prazo = Data Limite da obra'},
    {label:'⏱ Dias p/ Med.70',tip:'Dias restantes até prazo limite da Med. 70'},
    {label:'Med. 230',tip:'Prazo = Data Limite da obra · Define se execução foi no prazo'},
    {label:'⏱ Dias p/ Med.230',tip:'Dias restantes até prazo limite da Med. 230'},
    {label:'Med. 280',tip:'Prazo = último dia mês seguinte à Med. 230'},
    {label:'⏱ Dias p/ Med.280',tip:'Dias restantes para encerramento'},
    'Armazenado','Ações'
  ];
  document.getElementById('thRow').innerHTML=cols.map(c=>{
    if(typeof c === 'object') return `<th title="${c.tip}" style="cursor:help;color:#06B6D4">${c.label} ℹ</th>`;
    return `<th>${c}</th>`;
  }).join('');
}

// ── TABELA OBRAS ──────────────────────────────────────
// ── renderObras ÚNICA — sempre usa aplicarFiltros ────────────────────
function renderObras(){
  if(!document.getElementById('obrasBody')) return;
  try{
  // Apply module-level quick filter first, then form filters
  let baseList = visibleObras();
  if(_filtroRapidoAtivo === 'sem_medida70')    baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.medida70);
  else if(_filtroRapidoAtivo === 'sem_medida230') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.conclusao&&!o.medida230);
  else if(_filtroRapidoAtivo === 'med230_sem280') baseList = baseList.filter(o=>!o.cancelado&&!o.armazenado&&o.medida230&&!o.medida280);
  else if(_filtroRapidoAtivo === 'encerradas')    baseList = baseList.filter(o=>o.armazenado);
  const list = aplicarFiltros(baseList);
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
    const rowBg = (o.pendencia&&!o.pendenciaResolvida)
      ? 'background:rgba(249,115,22,.07);'
      : (statusOf(o)==='Atrasada'||statusOf(o)==='Encaminhar Cadastro Urgente')
        ? 'background:rgba(239,68,68,.07);'
        : '';
    return `<tr style="${rowBg}">
      <td>${statusHtml(o)}</td>
      <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
      <td>${o.tipo?`<span class="chip">${o.tipo}</span>`:'—'}</td>
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
      <td>${tipoMedicao(o)?`<span class="chip ${tipoMedicao(o)==='final'?'chip-green':'chip-yellow'}" style="font-size:9px">${tipoMedicao(o)==='final'?'✓ Final':'~ Parcial'}</span>`:'<span class="chip">—</span>'}</td>
      <td>${o.usc||'—'}</td>
      <td>${o.ulv||'—'}</td>
      <td>${fmt(o.medida70)}</td>
      <td>${celulaPrazo(diasParaMedida(o,'med70'))}</td>
      <td>${fmt(o.medida230)}</td>
      <td>${celulaPrazo(diasParaMedida(o,'med230'))}</td>
      <td>${fmt(o.medida280)}</td>
      <td>${celulaPrazo(diasParaMedida(o,'med280'))}</td>
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
  document.getElementById('obraModalTit').textContent=isEdit?'Editar Obra':'Nova Obra';
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
    set('oUSC',obra.usc); set('oULV',obra.ulv); set('oDesligamento',obra.dataDesligamento);
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
    set('oMedida280Motivo',obra.medida280Motivo);
    set('oTipoImpedimento',obra.tipoImpedimento); set('oImpedimentoOutro',obra.impedimentoOutro);
    set('oDataCancelamento',obra.dataCancelamento); set('oMotivoCancelamento',obra.motivoCancelamento);
    set('oDesligMotivo',obra.desligamentoCanceladoMotivo);
    set('oMotivoParalisada',obra.motivoParalisada);
    setChk('oTemImpedimento',obra.impedimento); setChk('oTemPendencia',obra.pendencia);
    setChk('oPendenciaResolvida',obra.pendenciaResolvida); setChk('oArmazenado',obra.armazenado);
    setChk('oCancelado',obra.cancelado); setChk('oParalisada',obra.paralisada);
    // Restore USC/ULV medido gerente
    const uscMedEl=document.getElementById('oUSCMedidoGerente');
    const ulvMedEl=document.getElementById('oULVMedidoGerente');
    if(uscMedEl) uscMedEl.value=obra.uscMedidoGerente!=null?obra.uscMedidoGerente:'';
    if(ulvMedEl) ulvMedEl.value=obra.ulvMedidoGerente!=null?obra.ulvMedidoGerente:'';
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
    // Preenche view-only do transformador para fiscal
    ['oPlacasView','oSAPView','oSerieView','oFabricanteView'].forEach((id,i)=>{
      const val=[obra.placas,obra.sap,obra.serie,obra.fabricante][i];
      const el=document.getElementById(id); if(el) el.value=val||'';
    });
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
    if(p === 'fiscal' && isEdit && obra?.conclusao) showSec('secTransfView');
    if(p === 'empreiteira') showSec('secImpedimento');

    // Fiscalização: só fiscal e gerente
    if(p === 'fiscal' || p === 'gerente') showSec('secFisc');

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
  // mostra extra conclusao se já tem data
  document.getElementById('secConclusaoExtra').style.display=obra?.conclusao?'block':'none';
  document.getElementById('oConclusao').addEventListener('change',()=>{
    document.getElementById('secConclusaoExtra').style.display=document.getElementById('oConclusao').value?'block':'none';
  });
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
  const med={
    id:'med_'+Date.now(),
    data, tipo,
    // USC/ULV é definido pelo gerente no campo da obra, não no lançamento da medição
    uscMedido: 0,
    ulvMedido: 0,
  };
  _medicoesPendentes.push(med);
  renderListaMedicoes();
  cancelarNovaMedicao();
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
          <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" onclick="removerMedicaoPendente('${m.id}')">✕</button>`:''}
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
      // Conclusão: só empreiteira precisa preencher placas/SAP
      if(me.perfil==='empreiteira'&&g('oConclusao')){
        if(!g('oPlacas')) erros.push('Informe as Placas Instaladas.');
        if(!g('oSAP'))    erros.push('Informe o Nº SAP do Transformador.');
        if(!g('oSerie'))  erros.push('Informe o Nº Série do Transformador.');
        if(!g('oFabricante')) erros.push('Informe o Fabricante.');
      }
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
        kaffaEntries: allKaffasG,
        kaffa: lastKaffaG,
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        tiposPendencia:getTiposPendencia(), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'), prazoPendenciaLabel:document.getElementById('oPrazoPendenciaLabel')?.value||'',
        pendenciaResolvida:gChk('oPendenciaResolvida'),
        dataCadastro:g('oCadastro'), cadastroConfirmado:gChk('oCadastroConfirmado'),
        medicoes: allMedsG,
        medicao: lastMedG,
        medida70:g('oMedida70'), medida230:g('oMedida230'),
        medida280:g('oMedida280'), medida280Motivo:g('oMedida280Motivo'),
        armazenado:gChk('oArmazenado'), contratosAssinado:gChk('oContratosAssinado'),
        medicoesAssinadas:gChk('oMedicoesAssinadas'), projetosAsBuilt:gChk('oProjetosAsBuilt'),
        caixaArmazenada:g('oCaixaArmazenada'),
        paralisada:gChk('oParalisada'), motivoParalisada:g('oMotivoParalisada'),
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
        dataDesligamento:g('oDesligamento'),
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        regularizacaoData:g('oRegularizacao'),
        kaffaEntries: allKaffasEmp,
        kaffa: lastKaffaDate || g('oKaffa') || obraAntiga?.kaffa || '',
        atualizadaEm:serverTimestamp()
      };
      if(_kaffasPendentes.length > 0) _kaffasPendentes=[];
    } else if(me.perfil==='fiscal'){
      // Build medicoes array directly in the patch (same as empreiteira kaffa pattern)
      const existingMedsF = obraAntiga?.medicoes||[];
      const allMedsF = [...existingMedsF, ..._medicoesPendentes];
      const lastMedDate = allMedsF.map(m=>m.data).filter(Boolean).sort().slice(-1)[0]||'';
      patch={
        dataDesligamento:g('oDesligamento'),
        desligamentoConfirmado:gChk('oDesligConfirmado'), desligamentoCancelado:gChk('oDesligCancelado'),
        desligamentoCanceladoMotivo:g('oDesligMotivo'),
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        tiposPendencia:getTiposPendencia(), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'), prazoPendenciaLabel:document.getElementById('oPrazoPendenciaLabel')?.value||'',
        pendenciaResolvida:gChk('oPendenciaResolvida'),
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
        const allDates = patch.medicoes.map(m=>m.data).filter(Boolean).sort();
        if(allDates.length) patch.medicao = allDates[allDates.length-1];
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
      if(me.perfil==='empreiteira'&&!obraAntiga?.conclusao&&patch.conclusao)
        await enviarEmailConclusao({...obraAntiga,...patch});
      if(me.perfil==='fiscal'&&!obraAntiga?.pendencia&&patch.pendencia){
        patch.dataPendencia = hojeStr(); // registra a data em que a pendência foi cadastrada
        await enviarEmailPendencia({...obraAntiga,...patch});
      }
      if(me.perfil==='gerente'&&!obraAntiga?.pendencia&&patch.pendencia){
        patch.dataPendencia = hojeStr(); // gerente também pode registrar pendência
      }
      // Registrar se pendência foi resolvida dentro do prazo
      if((me.perfil==='fiscal'||me.perfil==='gerente')&&patch.pendenciaResolvida&&!obraAntiga?.pendenciaResolvida){
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
            <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.uid}')">✏️</button>
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
      if(u.perfil==='fiscal') document.getElementById('uVincFis').value=u.vinculo||'';
    }
    note.style.display='block';
  } else { note.style.display='none'; }
  document.getElementById('ovUser').classList.add('open');
};
window.closeUserModal=function(){ document.getElementById('ovUser').classList.remove('open'); };
window.onPerfilChange=function(){
  const p=document.getElementById('uPerfil').value;
  document.getElementById('fgVincEmp').style.display=p==='empreiteira'?'flex':'none';
  document.getElementById('fgVincFis').style.display=p==='fiscal'?'flex':'none';
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
      :perfil==='fiscal'?document.getElementById('uVincFis').value.trim():'';
    if(!nome||!email||!perfil){ toast('Preencha todos os campos.','err'); return; }
    if(isEdit){
      await setDoc(doc(db,'usuarios',uid),{nome,email,perfil,vinculo},{merge:true});
      toast('Usuário atualizado!');
    } else {
      if(senha.length<6){ toast('Senha: mínimo 6 caracteres.','err'); return; }
      const cred=await createUserWithEmailAndPassword(auth2,email,senha);
      await signOut(auth2);
      await setDoc(doc(db,'usuarios',cred.user.uid),{nome,email,perfil,vinculo,criadoEm:serverTimestamp()});
      toast(`Usuário ${nome} criado!`);
    }
    closeUserModal(); await renderUsers();
  }catch(e){
    const msgs={'auth/email-already-in-use':'E-mail já cadastrado.','auth/weak-password':'Senha fraca.'};
    toast('Erro: '+(msgs[e.code]||e.message),'err');
  }finally{ btn.disabled=false; btn.textContent=document.getElementById('userId').value?'Salvar':'Criar Usuário'; }
};
window.delUser=async function(uid){
  if(uid===me.uid){ toast('Não pode remover a si mesmo.','err'); return; }
  if(!confirm('Remover este usuário?')) return;
  await deleteDoc(doc(db,'usuarios',uid)); toast('Usuário removido.','warn'); await renderUsers();
};

// ── EMAILS ────────────────────────────────────────────
function emailJSAtivo(){ return EMAILJS_CONFIG.publicKey&&!EMAILJS_CONFIG.publicKey.startsWith('COLE'); }

async function jaEnviou(chave){
  try{
    const s=await getDocs(query(collection(db,'notificacoes'),where('chave','==',chave)));
    return !s.empty;
  }catch(e){ return false; }
}
async function marcarEnviado(chave){
  try{ await addDoc(collection(db,'notificacoes'),{chave,ts:serverTimestamp()}); }catch(e){}
}
async function enviarEmail(tplId,params){
  if(!emailJSAtivo()) return;
  try{ await emailjs.send(EMAILJS_CONFIG.serviceId,tplId,params); }catch(e){ console.warn('Email falhou:',e.message); }
}

async function enviarEmailConclusao(obra){
  if(!obra.fiscal) return;
  const fiscal=users.find(u=>u.vinculo===obra.fiscal&&u.perfil==='fiscal');
  if(!fiscal?.email) return;
  const chave=`conclusao_${obra.id}`;
  if(await jaEnviou(chave)) return;
  await enviarEmail(EMAILJS_CONFIG.tplObraConcluida,{
    to_email:fiscal.email, cc_email:EMAILJS_CONFIG.emailGerente,
    obra_numero:obra.numero, obra_cidade:obra.cidade, empreiteira:obra.empreiteira,
    data_conclusao:fmtTxt(obra.conclusao),
  });
  await marcarEnviado(chave);
}

async function enviarEmailPendencia(obra){
  const emp=empreiteiras.find(e=>e.nome===obra.empreiteira);
  if(!emp?.email) return;
  const chave=`pendencia_${obra.id}`;
  if(await jaEnviou(chave)) return;
  await enviarEmail(EMAILJS_CONFIG.tplPendencia,{
    to_email:emp.email, cc_email:EMAILJS_CONFIG.emailGerente,
    obra_numero:obra.numero, obra_cidade:obra.cidade,
    tipo_pendencia:(obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', '),
    prazo_resolucao:fmtTxt(obra.prazoPendencia),
  });
  await marcarEnviado(chave);
}

async function enviarEmailRegularizacao(obra){
  const fiscal=users.find(u=>u.vinculo===obra.fiscal&&u.perfil==='fiscal');
  if(!fiscal?.email) return;
  const chave=`regularizacao_${obra.id}`;
  if(await jaEnviou(chave)) return;
  await enviarEmail(EMAILJS_CONFIG.tplPendencia,{
    to_email:fiscal.email, cc_email:EMAILJS_CONFIG.emailGerente,
    obra_numero:obra.numero, obra_cidade:obra.cidade,
    tipo_pendencia:'REGULARIZAÇÃO — '+(obra.tiposPendencia||[obra.tipoPendencia]).filter(Boolean).join(', '),
    prazo_resolucao:`Regularizada em ${fmtTxt(obra.regularizacaoData)}`,
  });
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
        const chave=`prazo_${o.id}_${tipo}_${o.dataLimite}`;
        if(!await jaEnviou(chave)){
          await enviarEmail(tipo==='critica'?EMAILJS_CONFIG.tplPrazoCritico:EMAILJS_CONFIG.tplPrazoPerto,{
            to_email:emp.email, cc_email:EMAILJS_CONFIG.emailGerente,
            obra_numero:o.numero, obra_cidade:o.cidade, data_limite:fmtTxt(o.dataLimite),
            dias_restantes:dias<=0?`Vencida há ${Math.abs(dias)} dias`:`${dias} dias restantes`,
          });
          await marcarEnviado(chave);
        }
      }
    }
    // Medida 70 próxima de vencer
    if(!o.medida70&&o.dataLimite){
      const diasM=diasRestantes(o.dataLimite);
      if(diasM<=EMAILJS_CONFIG.diasAvisoMedida){
        const fiscal=users.find(u=>u.vinculo===o.fiscal&&u.perfil==='fiscal');
        if(fiscal?.email){
          const tipo=diasM<=0?'vencida':diasM<=EMAILJS_CONFIG.diasCritico?'critica':'aviso';
          const chave=`medida70_${o.id}_${tipo}_${o.dataLimite}`;
          if(!await jaEnviou(chave)){
            await enviarEmail(EMAILJS_CONFIG.tplMedidaPrazo,{
              to_email:fiscal.email, cc_email:EMAILJS_CONFIG.emailGerente,
              obra_numero:o.numero, obra_cidade:o.cidade, tipo_medida:'Medida 70',
              data_limite:fmtTxt(o.dataLimite), dias_restantes:diasM<=0?'Vencida':diasM+'d',
            });
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
            await enviarEmail(EMAILJS_CONFIG.tplPrazoCritico,{
              to_email:fiscal.email, cc_email:EMAILJS_CONFIG.emailGerente,
              obra_numero:o.numero, obra_cidade:o.cidade,
              data_limite:fmtTxt(o.fiscalizacao),
              dias_restantes:`Fiscalizada há ${diasSemCad} dias sem enviar para cadastro`,
            });
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
            await enviarEmail(EMAILJS_CONFIG.tplMedidaPrazo,{
              to_email:fiscal.email, cc_email:EMAILJS_CONFIG.emailGerente,
              obra_numero:o.numero, obra_cidade:o.cidade, tipo_medida:'Medida 230',
              data_limite:fmtTxt(o.dataLimite), dias_restantes:diasM<=0?'Vencida':diasM+'d',
            });
            await marcarEnviado(chave);
          }
        }
      }
    }
  }
}

// ── CSV ───────────────────────────────────────────────
window.exportCSV=function(){
  const rows=[['Status','Nº','Tipo','Cidade','Empreiteira','Fiscal','Abertura','Prazo','Data Limite','Conclusão','Fiscalização','Pendência','Kaffa','Cadastro','Medição','USC','ULV','Medida 70','Medida 230','Medida 280','Armazenado','Cancelado']];
  visibleObras().forEach(o=>rows.push([
    statusOf(o),o.numero,o.tipo,o.cidade,o.empreiteira,o.fiscal,
    o.dataAbertura,o.prazoExecucao,o.dataLimite,o.conclusao,o.fiscalizacao,
    o.pendencia?(o.tipoPendencia||'Sim'):'Não',o.kaffa,o.dataCadastro,o.medicao,
    o.usc,o.ulv,o.medida70,o.medida230,o.medida280,o.armazenado?'Sim':'Não',o.cancelado?'Sim':'Não'
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
    if (f.srch && !(o.numero||'').toLowerCase().includes(f.srch)) return false; // busca por Nº da obra
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
  const labels={'sem_medida70':'Sem Medida 70','sem_medida230':'Sem Medida 230','med230_sem280':'Med.230 sem 280','encerradas':'Encerradas completas'};
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
    o.usc,o.ulv,o.medida70,o.medida230,o.medida280,o.armazenado?'Sim':'Não'
  ]));
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF'+rows.map(r=>r.map(v=>v??'').join(';')).join('\n'));
  a.download = 'obras_filtradas.csv'; a.click();
  toast(`${list.length} obras exportadas!`);
};

// renderObras is now consolidated — see function above


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
  else if(_filtroRapidoAtivo==='encerradas')    base=base.filter(o=>o.armazenado);
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
  if (!val) return '';
  if (typeof val === 'number') {
    // Número serial do Excel
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    // Tentar parsear datas como DD/MM/YYYY ou YYYY-MM-DD
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? '20'+m[3] : m[3];
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

      // Auto-mapeamento
      mapeamento = {};
      COLUNAS_SISTEMA.forEach(col => {
        const idx = xlsxHeaders.findIndex(h =>
          col.aliases.includes(h.toLowerCase().replace(/[^a-zà-ú0-9 ]/g,'').trim())
        );
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
  const atrasadas = ativas.filter(o=>!o.medida230&&o.dataLimite&&hoje_s>o.dataLimite).length;
  const conclNoP  = ativas.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao<=o.dataLimite).length;
  const conclForaP= ativas.filter(o=>o.conclusao&&o.dataLimite&&o.conclusao>o.dataLimite).length;
  const encerradas= ativas.filter(o=>o.armazenado).length;

  let html = `<div style="margin-bottom:8px">
    <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:4px">📈 Carteira de Obras</div>
    <div style="font-size:11px;color:var(--muted)">Foto atual da carteira · ${ativas.length} obras ativas · gerado em ${fmtTxt(hoje_s)}</div>
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
    const atr = sub.filter(o=>!o.medida230&&o.dataLimite&&hoje_s>o.dataLimite).length;
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
  const empPrincipais = emprNames.filter(e=>
    e.toUpperCase().includes('CS') || e.toUpperCase().includes('ELET')
  ).slice(0,4); // máx 4

  if(empPrincipais.length){
    html += `<div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Análise Mensal por Empreiteira</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(580px,1fr));gap:20px;margin-bottom:24px">`;

    empPrincipais.forEach(e=>{
      const sub = ativas.filter(o=>o.empreiteira===e);
      const cor = gc(e);

      // ── helper: comparar meses MM/YYYY ──────────────────────────
      const mesVal = m => { const [mm,yy]=m.split('/'); return +yy*100 + +mm; };
      const hoje_d = new Date();
      const mesAtualVal = hoje_d.getFullYear()*100 + (hoje_d.getMonth()+1);
      const mes12Val    = mesAtualVal + (mesAtualVal%100 === 12 ? 89 : 12); // +12 meses

      // próximos 12 meses (incluindo mês atual)
      const prox12 = [];
      for(let i=0;i<=12;i++){
        const d=new Date(hoje_d.getFullYear(), hoje_d.getMonth()+i, 1);
        prox12.push(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
      }

      // ── GRÁFICO 1: Obras SEM conclusão por linha do tempo ───────
      const semConcl = sub.filter(o=>!o.conclusao);

      // coluna de atrasadas: dataLimite < mês atual
      const atrasadasCol = semConcl.filter(o=>o.dataLimite && mesVal(mesStr(o.dataLimite)||'01/1900') < mesAtualVal);

      // obras dentro dos próximos 12 meses (inclusive mês atual)
      const prox12Map = {};
      prox12.forEach(m=>{ prox12Map[m] = semConcl.filter(o=>mesStr(o.dataLimite)===m); });

      // obras além dos 12 meses: agrupar por mês, somente se tiver obra
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
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hF}" rx="${curY===topPadS+barHS-hTot?'5 5 0 0':'0'}" fill="#22C55E" opacity="0.85"/>`;
            curY += hF;
          }
          // 🟡 NO PRAZO
          if(hP>0){
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hP}" fill="#F59E0B" opacity="0.85"/>`;
            curY += hP;
          }
          // 🔴 ATRASADA (topo)
          if(hA>0){
            svgConcl += `<rect x="${x+4}" y="${curY}" width="${wS}" height="${hA}" rx="${hP===0&&hF===0?'5 5 0 0':'0'}" fill="#EF4444" opacity="0.85"/>`;
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
  const listaAtrasadas = ativas.filter(o=>!o.medida230&&o.dataLimite&&hoje_s>o.dataLimite)
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

  cont.innerHTML = html;
}
