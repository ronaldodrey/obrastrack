// ══════════════════════════════════════════════════════
//  ObrasTrack v2 — app.js
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

// EmailJS
try { emailjs.init(EMAILJS_CONFIG.publicKey); } catch(e) { console.warn('EmailJS não configurado'); }

// ── CONSTANTES ────────────────────────────────────────
const COLORS = ['#00e5a0','#7c6af7','#ff6b35','#f5c542','#ff4d6d','#38bdf8','#a3e635','#fb7185','#e879f9','#67e8f9'];
const fColor = {}; let cIdx = 0;
function gc(k){ if(!fColor[k]) fColor[k]=COLORS[cIdx++%COLORS.length]; return fColor[k]; }
function ini(n){ return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

// ── ESTADO ────────────────────────────────────────────
let me=null, obras=[], users=[], empreiteiras=[], unsubObras=null;

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
  'Cancelada':             { cor:'#6B7280', bg:'rgba(107,114,128,.15)' },
  'Encerrada':             { cor:'#16A34A', bg:'rgba(22,163,74,.15)'   },
  'Aguard. Armazenamento': { cor:'#84CC16', bg:'rgba(132,204,22,.15)'  },
  'Aguard. Medida 280':    { cor:'#22C55E', bg:'rgba(34,197,94,.15)'   },
  'Aguard. Medida 230':    { cor:'#10B981', bg:'rgba(16,185,129,.15)'  },
  'Aguard. Medida 70':     { cor:'#14B8A6', bg:'rgba(20,184,166,.15)'  },
  'Aguard. Medição':       { cor:'#6366F1', bg:'rgba(99,102,241,.15)'  },
  'Pendência':             { cor:'#F97316', bg:'rgba(249,115,22,.15)'  },
  'Fiscalizado':           { cor:'#8B5CF6', bg:'rgba(139,92,246,.15)'  },
  'Impedimento':           { cor:'#DC2626', bg:'rgba(220,38,38,.15)'   },
  'Aguard. Fiscalização':  { cor:'#EAB308', bg:'rgba(234,179,8,.15)'   },
  'Atrasada':              { cor:'#EF4444', bg:'rgba(239,68,68,.15)'   },
  'Em Execução':           { cor:'#3B82F6', bg:'rgba(59,130,246,.15)'  },
};
function statusOf(o){
  if(o.cancelado)    return 'Cancelada';
  if(o.armazenado)   return 'Encerrada';
  if(o.medida280)    return 'Aguard. Armazenamento';
  if(o.medida230)    return 'Aguard. Medida 280';
  if(o.medida70)     return 'Aguard. Medida 230';
  if(o.medicao)      return 'Aguard. Medida 70';
  if(o.kaffa)        return 'Aguard. Medição';
  if(o.fiscalizacao && o.pendencia && !o.pendenciaResolvida) return 'Pendência';
  if(o.fiscalizacao) return 'Fiscalizado';
  if(o.impedimento)  return 'Impedimento';
  if(o.conclusao)    return 'Aguard. Fiscalização';
  if(o.dataLimite && hoje()>parseD(o.dataLimite)) return 'Atrasada';
  return 'Em Execução';
}
function statusHtml(o){
  const s=statusOf(o), d=STATUS_DEF[s]||{cor:'#888',bg:'rgba(128,128,128,.15)'};
  return `<span class="st" style="color:${d.cor};background:${d.bg};border-color:${d.cor}44">
    <span style="background:${d.cor}"></span>${s}</span>`;
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
  rb.textContent=me.perfil.charAt(0).toUpperCase()+me.perfil.slice(1);
  rb.className='role-badge role-'+me.perfil;

  await loadEmpreiteiras();
  popularSelectEmpreiteiras();

  const tabs=[['pgDash','📊 Dashboard'],['pgObras','🏗️ Obras']];
  if(me.perfil==='gerente'){ tabs.push(['pgEmpreiteiras','🏢 Empreiteiras']); tabs.push(['pgUsers','👥 Usuários']); }
  document.getElementById('tabBar').innerHTML=tabs
    .map(([id,lbl])=>`<div class="tab" data-page="${id}" onclick="showPage('${id}')">${lbl}</div>`).join('');

  document.getElementById('btnNovaObra').style.display=me.perfil==='gerente'?'inline-flex':'none';
  document.getElementById('btnImport').style.display=me.perfil==='gerente'?'inline-flex':'none';
  buildTableHeader();

  const q=query(collection(db,'obras'),orderBy('criadaEm','desc'));
  unsubObras=onSnapshot(q,snap=>{
    obras=snap.docs.map(d=>({id:d.id,...d.data()}));
    const active=document.querySelector('.page.active');
    if(active?.id==='pgDash') renderDash();
    if(active?.id==='pgObras') renderObras();
  });

  showPage('pgDash');
}
window.showPage=function(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.page===id));
  document.getElementById(id).classList.add('active');
  if(id==='pgDash') renderDash();
  if(id==='pgObras') renderObras();
  if(id==='pgUsers') renderUsers();
  if(id==='pgEmpreiteiras') renderEmpreiteiras();
};

// ── FILTRO POR PERFIL ─────────────────────────────────
function visibleObras(){
  if(me.perfil==='gerente') return obras;
  if(me.perfil==='fiscal')  return obras;
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
function renderDash(){
  const list=visibleObras();
  let html='';

  if(me.perfil==='gerente'){
    // KPIs gerais
    html+=`<div class="kpi-strip">
      ${kpiCard('Total','${list.length}','obras','#00e5a0')}
      ${kpiCard('Em Execução','${list.filter(o=>statusOf(o)==="Em Execução").length}','no prazo','#3B82F6')}
      ${kpiCard('Atrasadas','${list.filter(o=>statusOf(o)==="Atrasada").length}','fora do prazo','#EF4444')}
      ${kpiCard('Pendências','${list.filter(o=>statusOf(o)==="Pendência").length}','aguardando resolução','#F97316')}
      ${kpiCard('Aguard. Fiscalização','${list.filter(o=>statusOf(o)==="Aguard. Fiscalização").length}','concluídas sem vistoria','#EAB308')}
      ${kpiCard('Aguard. Medição','${list.filter(o=>statusOf(o)==="Aguard. Medição").length}','kaffa sem medição','#6366F1')}
      ${kpiCard('Encerradas','${list.filter(o=>statusOf(o)==="Encerrada").length}','concluídas','#16A34A')}
    </div>`.replace(/\$\{([^}]+)\}/g,(_,e)=>eval(e));
    html+='<div class="sect-title" style="margin-bottom:12px">Velocidade Média por Fiscal</div>';
    html+='<div class="vel-grid">'+velCards(list)+'</div>';
    html+='<div class="sect-title" style="margin-bottom:12px;margin-top:8px">Volume por Empreiteira</div>';
    html+='<div class="kpi-strip">'+emprKpis(list)+'</div>';
  }
  else if(me.perfil==='fiscal'){
    const minhNome=me.vinculo;
    const minhas=list.filter(o=>o.fiscal===minhNome);
    const uscTotal=minhas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const ulvTotal=minhas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
    const comPend=minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida);
    const paraFisc=list.filter(o=>o.conclusao&&!o.fiscalizacao&&o.fiscal===minhNome);
    const paraMedir=list.filter(o=>o.kaffa&&!o.medicao&&o.fiscal===minhNome);
    const mesAtual=new Date().getMonth(), anoAtual=new Date().getFullYear();
    const fiscUltimoMes=minhas.filter(o=>{ if(!o.fiscalizacao) return false; const d=new Date(o.fiscalizacao+'T00:00:00'); return d.getMonth()===mesAtual&&d.getFullYear()===anoAtual; });
    const tempoFisc=avgDiff(minhas,'conclusao','fiscalizacao');
    const tempoMed=avgDiff(minhas,'kaffa','medicao');
    html+=`<div class="kpi-strip">
      ${kpiCard('Minhas Obras',minhas.length,'atribuídas','#00e5a0')}
      ${kpiCard('USC Total',uscTotal.toFixed(1),'unidades','#7c6af7')}
      ${kpiCard('ULV Total',ulvTotal.toFixed(1),'unidades','#ff6b35')}
      ${kpiCard('Para Fiscalizar',paraFisc.length,'aguardando vistoria','#EAB308')}
      ${kpiCard('Para Medir',paraMedir.length,'kaffa sem medição','#6366F1')}
      ${kpiCard('Com Pendência',comPend.length,'não resolvidas','#F97316')}
      ${kpiCard('Fiscalizadas/Mês',fiscUltimoMes.length,'mês corrente','#38bdf8')}
      ${kpiCard('Tempo Médio Fisc.',tempoFisc!==null?tempoFisc+'d':'—','conclusão→fiscalização','#a3e635')}
      ${kpiCard('Tempo Médio Med.',tempoMed!==null?tempoMed+'d':'—','kaffa→medição','#fb7185')}
    </div>`;
    html+='<div class="sect-title" style="margin-bottom:12px">Principais Pendências</div>';
    html+=pendenciaRanking(minhas);
    html+='<div class="sect-title" style="margin-bottom:12px;margin-top:16px">Obras por Empreiteira</div>';
    html+='<div class="kpi-strip">'+emprFiscalKpis(minhas)+'</div>';
  }
  else if(me.perfil==='empreiteira'){
    const minhas=list;
    const uscTotal=minhas.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const ulvTotal=minhas.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
    const aguardKaffa=minhas.filter(o=>o.conclusao&&!o.kaffa);
    const aguardMed=minhas.filter(o=>o.kaffa&&!o.medicao);
    const uscAguard=aguardMed.reduce((s,o)=>s+(parseFloat(o.usc)||0),0);
    const ulvAguard=aguardMed.reduce((s,o)=>s+(parseFloat(o.ulv)||0),0);
    const comPend=minhas.filter(o=>o.pendencia&&!o.pendenciaResolvida);
    const tempoKaffa=avgDiff(minhas,'conclusao','kaffa');
    html+=`<div class="kpi-strip">
      ${kpiCard('Total de Obras',minhas.length,'da empresa','#00e5a0')}
      ${kpiCard('USC Total',uscTotal.toFixed(1),'unidades','#7c6af7')}
      ${kpiCard('ULV Total',ulvTotal.toFixed(1),'unidades','#ff6b35')}
      ${kpiCard('Aguard. Kaffa',aguardKaffa.length,'concluídas sem kaffa','#EAB308')}
      ${kpiCard('Aguard. Medição',aguardMed.length,'kaffa sem medição','#6366F1')}
      ${kpiCard('USC Aguard. Med.',uscAguard.toFixed(1),'a medir','#7c6af7')}
      ${kpiCard('ULV Aguard. Med.',ulvAguard.toFixed(1),'a medir','#ff6b35')}
      ${kpiCard('Com Pendência',comPend.length,'não resolvidas','#F97316')}
      ${kpiCard('Tempo Médio Kaffa',tempoKaffa!==null?tempoKaffa+'d':'—','conclusão→kaffa','#a3e635')}
    </div>`;
    html+='<div class="sect-title" style="margin-bottom:12px">Obras por Tipo</div>';
    html+=`<div class="kpi-strip">${['R1','R2','ODI'].map(t=>kpiCard(t,minhas.filter(o=>o.tipo===t).length,'obras',gc(t))).join('')}</div>`;
    html+='<div class="sect-title" style="margin-bottom:12px;margin-top:8px">Principais Pendências</div>';
    html+=pendenciaRanking(minhas);
  }

  document.getElementById('dashContent').innerHTML=html;
}

function kpiCard(lbl,val,sub,cor){
  return `<div class="kpi-card" style="--card-color:${cor}">
    <div class="kpi-lbl">${lbl}</div>
    <div class="kpi-val">${val}</div>
    <div class="kpi-sub">${sub}</div>
  </div>`;
}
function avgDiff(list,a,b){
  const vals=list.map(o=>diff(o[a],o[b])).filter(v=>v!==null);
  return vals.length? Math.round(vals.reduce((x,y)=>x+y,0)/vals.length) : null;
}
function velCards(list){
  const fis={};
  list.forEach(o=>{ if(!o.fiscal) return;
    if(!fis[o.fiscal]) fis[o.fiscal]={t:0,df:[],dk:[],dm:[]};
    const f=fis[o.fiscal]; f.t++;
    const df=diff(o.conclusao,o.fiscalizacao), dk=diff(o.fiscalizacao,o.kaffa), dm=diff(o.kaffa,o.medicao);
    if(df!==null) f.df.push(df); if(dk!==null) f.dk.push(dk); if(dm!==null) f.dm.push(dm);
  });
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  const bar=v=>v===null?0:Math.min(100,Math.round((v/30)*100));
  return Object.entries(fis).sort().map(([name,d])=>{
    const c=gc(name),af=avg(d.df),ak=avg(d.dk),am=avg(d.dm);
    return `<div class="vel-card">
      <div class="vc-hd"><div class="avatar" style="background:${c}22;color:${c}">${ini(name)}</div>
      <div><div class="vc-name">${name}</div><div class="vc-ct">${d.t} obras</div></div></div>
      <div class="vc-row"><span class="vc-rl">Concl→Fisc.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(af)}%;background:${c}"></div></div><span class="vc-rv" style="color:${c}">${af!==null?af+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Fisc→Kaffa</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(ak)}%;background:var(--yellow)"></div></div><span class="vc-rv" style="color:var(--yellow)">${ak!==null?ak+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Kaffa→Med.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(am)}%;background:var(--accent2)"></div></div><span class="vc-rv" style="color:var(--accent2)">${am!==null?am+'d':'—'}</span></div>
    </div>`;
  }).join('')||'<div class="empty"><div class="ico">📊</div><p>Sem dados ainda.</p></div>';
}
function emprKpis(list){
  return empreiteiras.map(e=>{
    const sub=list.filter(o=>o.empreiteira===e.nome);
    return kpiCard(e.nome,sub.length,'obras',gc(e.nome));
  }).join('');
}
function emprFiscalKpis(list){
  return empreiteiras.map(e=>{
    const sub=list.filter(o=>o.empreiteira===e.nome);
    return kpiCard(e.nome,sub.length,'obras',gc(e.nome));
  }).join('');
}
function pendenciaRanking(list){
  const cnt={};
  list.filter(o=>o.pendencia&&o.tipoPendencia).forEach(o=>{
    const t=o.tipoPendencia==='Outro'?(o.pendenciaOutro||'Outro'):o.tipoPendencia;
    cnt[t]=(cnt[t]||0)+1;
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

// ── TABELA HEADERS ────────────────────────────────────
function buildTableHeader(){
  const cols=['Status','Nº','Tipo','Cidade','Empreiteira','Fiscal','Abertura','Prazo','Data Limite','Dias Rest.',
    'Deslig.','Conclusão','Fiscalização','Pendência','Kaffa','Cadastro','Medição','USC','ULV',
    'Medida 70','Medida 230','Medida 280','Armazenado','Ações'];
  document.getElementById('thRow').innerHTML=cols.map(c=>`<th>${c}</th>`).join('');
}

// ── TABELA OBRAS ──────────────────────────────────────
function renderObras(){
  const srch=document.getElementById('srch').value.toLowerCase();
  const filtroSt=document.getElementById('filtroStatus').value;
  let list=visibleObras().filter(o=>{
    if(srch&&!(o.numero+o.cidade+o.fiscal+o.empreiteira+o.tipo).toLowerCase().includes(srch)) return false;
    if(filtroSt&&statusOf(o)!==filtroSt) return false;
    return true;
  });
  const body=document.getElementById('obrasBody');
  if(!list.length){ body.innerHTML=`<tr><td colspan="24"><div class="empty"><div class="ico">🏗️</div><p>Nenhuma obra encontrada.</p></div></td></tr>`; return; }
  body.innerHTML=list.map(o=>{
    const s=statusOf(o), fc=o.fiscal?gc(o.fiscal):'var(--muted)';
    const limDias=diasRestantes(o.dataLimite);
    const canEdit=me.perfil==='gerente'||(me.perfil==='fiscal'&&o.fiscal===me.vinculo)||(me.perfil==='empreiteira'&&o.empreiteira===me.vinculo);
    const acts=canEdit
      ?`<button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">✏️</button>
        ${me.perfil==='gerente'?`<button class="btn btn-danger btn-sm" onclick="delObra('${o.id}')">🗑️</button>`:''}`
      :'';
    const pendChip=o.pendencia
      ?(o.pendenciaResolvida?'<span class="chip chip-green">Resolvida</span>':'<span class="chip chip-red">'+(o.tipoPendencia||'')+'</span>')
      :'<span class="chip">—</span>';
    const armChip=o.armazenado?'<span class="chip chip-green">✓</span>':'<span class="chip">—</span>';
    return `<tr>
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
      <td>${fmt(o.dataDesligamento)}</td>
      <td>${fmt(o.conclusao)}</td>
      <td>${fmt(o.fiscalizacao)}</td>
      <td>${pendChip}</td>
      <td>${fmt(o.kaffa)}</td>
      <td>${fmt(o.dataCadastro)}</td>
      <td>${fmt(o.medicao)}</td>
      <td>${o.usc||'—'}</td>
      <td>${o.ulv||'—'}</td>
      <td>${fmt(o.medida70)}</td>
      <td>${fmt(o.medida230)}</td>
      <td>${fmt(o.medida280)}</td>
      <td>${armChip}</td>
      <td><div style="display:flex;gap:4px">${acts}</div></td>
    </tr>`;
  }).join('');
}
window.renderObras=renderObras;

// ── MODAL OBRA ────────────────────────────────────────
window.openObraModal=function(obraId){
  const obra=obraId?obras.find(o=>o.id===obraId):null;
  const isEdit=!!obra;
  document.getElementById('obraModalTit').textContent=isEdit?'Editar Obra':'Nova Obra';
  document.getElementById('obraId').value=obraId||'';
  // reset
  ['oNum','oFiscalNome','oAbertura','oPrazo','oUSC','oULV','oDesligamento','oConclusao','oPlacas','oSAP','oSerie',
   'oFabricante','oKaffa','oCadastro','oFiscalizacao','oPrazoPendencia','oRegularizacao','oMedicao',
   'oMedida70','oMedida230','oMedida280','oMedida280Motivo','oImpedimentoOutro','oPendenciaOutro',
   'oDataCancelamento','oMotivoCancelamento'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['oTipo','oCidade','oEmp','oTipoImpedimento','oTipoPendencia'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['oTemImpedimento','oTemPendencia','oPendenciaResolvida','oArmazenado','oCancelado'].forEach(id=>{ const el=document.getElementById(id); if(el) el.checked=false; });

  if(isEdit){
    const set=(id,v)=>{ const el=document.getElementById(id); if(el&&v!==undefined&&v!==null) el.value=v; };
    const setChk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=!!v; };
    set('oNum',obra.numero); set('oTipo',obra.tipo); set('oCidade',obra.cidade);
    set('oEmp',obra.empreiteira); set('oFiscalNome',obra.fiscal);
    set('oAbertura',obra.dataAbertura); set('oPrazo',obra.prazoExecucao);
    set('oUSC',obra.usc); set('oULV',obra.ulv); set('oDesligamento',obra.dataDesligamento);
    set('oConclusao',obra.conclusao); set('oPlacas',obra.placas); set('oSAP',obra.sap);
    set('oSerie',obra.serie); set('oFabricante',obra.fabricante);
    set('oKaffa',obra.kaffa); set('oCadastro',obra.dataCadastro);
    set('oFiscalizacao',obra.fiscalizacao); set('oTipoPendencia',obra.tipoPendencia);
    set('oPendenciaOutro',obra.pendenciaOutro); set('oPrazoPendencia',obra.prazoPendencia);
    set('oRegularizacao',obra.regularizacaoData); set('oMedicao',obra.medicao);
    set('oMedida70',obra.medida70); set('oMedida230',obra.medida230); set('oMedida280',obra.medida280);
    set('oMedida280Motivo',obra.medida280Motivo);
    set('oTipoImpedimento',obra.tipoImpedimento); set('oImpedimentoOutro',obra.impedimentoOutro);
    set('oDataCancelamento',obra.dataCancelamento); set('oMotivoCancelamento',obra.motivoCancelamento);
    setChk('oTemImpedimento',obra.impedimento); setChk('oTemPendencia',obra.pendencia);
    setChk('oPendenciaResolvida',obra.pendenciaResolvida); setChk('oArmazenado',obra.armazenado);
    setChk('oCancelado',obra.cancelado);
  }

  // visibilidade e habilitação por perfil
  const p=me.perfil;
  document.getElementById('secIdentif').style.display=p==='gerente'?'block':'none';
  document.getElementById('secExec').style.display=p!=='fiscal'?'block':'none';
  document.getElementById('secImpedimento').style.display=p==='empreiteira'?'block':'none';
  document.getElementById('secFisc').style.display=p!=='empreiteira'?'block':'none';
  // regularização só para empreiteira se tiver pendência
  document.getElementById('secRegularizacao').style.display=
    (p==='empreiteira'&&obra?.pendencia&&!obra?.pendenciaResolvida)?'block':'none';
  if(obra?.pendencia) document.getElementById('msgPendencia').textContent=
    `Pendência registrada: ${obra.tipoPendencia||''}. Prazo: ${fmtTxt(obra.prazoPendencia)}`;
  // confirmação pendência para fiscal/gerente
  document.getElementById('secConfPendencia').style.display=
    (p!=='empreiteira'&&isEdit&&obra?.pendencia&&!obra?.pendenciaResolvida)?'block':'none';
  document.getElementById('secMedicao').style.display=p!=='empreiteira'?'block':'none';
  document.getElementById('secMedidas').style.display=p!=='empreiteira'?'block':'none';
  // armazenamento só após medida280
  document.getElementById('secArmazenamento').style.display=
    (p!=='empreiteira'&&isEdit&&obra?.medida280)?'block':'none';
  document.getElementById('secCancelamento').style.display=p==='gerente'?'block':'none';

  // desabilitar campos do outro perfil
  ['oConclusao','oPlacas','oSAP','oSerie','oFabricante','oKaffa','oCadastro'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.disabled=p==='fiscal';
  });
  ['oFiscalizacao','oTipoPendencia','oPrazoPendencia','oMedicao','oMedida70','oMedida230','oMedida280','oMedida280Motivo'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.disabled=p==='empreiteira';
  });

  // atualiza toggles
  toggleImpedimento(); togglePendencia(); toggleCancelamento();
  // mostra extra conclusao se já tem data
  document.getElementById('secConclusaoExtra').style.display=obra?.conclusao?'block':'none';
  document.getElementById('oConclusao').addEventListener('change',()=>{
    document.getElementById('secConclusaoExtra').style.display=document.getElementById('oConclusao').value?'block':'none';
  });
  // info data limite
  atualizarInfoLimite();
  document.getElementById('oAbertura').addEventListener('input',atualizarInfoLimite);
  document.getElementById('oPrazo').addEventListener('input',atualizarInfoLimite);
  // medida 280 prazo
  if(isEdit&&obra?.medida230) atualizarInfoMedida280(obra.medida230);

  document.getElementById('ovObra').classList.add('open');
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
  if(tem){ document.getElementById('oTipoPendencia').addEventListener('change',()=>{
    document.getElementById('fgPendenciaOutro').style.display=
      document.getElementById('oTipoPendencia').value==='Outro'?'flex':'none';
  });}
};
window.toggleCancelamento=function(){
  document.getElementById('secCancelamentoDetalhe').style.display=
    document.getElementById('oCancelado').checked?'block':'none';
};

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

    let patch={};
    if(me.perfil==='gerente'){
      patch={
        numero:g('oNum'), tipo:g('oTipo'), cidade:g('oCidade'), empreiteira:g('oEmp'),
        fiscal:g('oFiscalNome'), dataAbertura:ab, prazoExecucao:pr?parseInt(pr):null,
        dataLimite, usc:g('oUSC')?parseFloat(g('oUSC')):null, ulv:g('oULV')?parseFloat(g('oULV')):null,
        dataDesligamento:g('oDesligamento'),
        conclusao:g('oConclusao'), placas:g('oPlacas'), sap:g('oSAP'), serie:g('oSerie'), fabricante:g('oFabricante'),
        kaffa:g('oKaffa'), dataCadastro:g('oCadastro'),
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        tipoPendencia:g('oTipoPendencia'), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'),
        pendenciaResolvida:gChk('oPendenciaResolvida'),
        medicao:g('oMedicao'), medida70:g('oMedida70'), medida230:g('oMedida230'),
        medida280:g('oMedida280'), medida280Motivo:g('oMedida280Motivo'),
        armazenado:gChk('oArmazenado'),
        cancelado:gChk('oCancelado'), dataCancelamento:g('oDataCancelamento'), motivoCancelamento:g('oMotivoCancelamento'),
        atualizadaEm:serverTimestamp()
      };
    } else if(me.perfil==='empreiteira'){
      patch={
        conclusao:g('oConclusao'), placas:g('oPlacas'), sap:g('oSAP'), serie:g('oSerie'), fabricante:g('oFabricante'),
        kaffa:g('oKaffa'), dataCadastro:g('oCadastro'),
        impedimento:gChk('oTemImpedimento'), tipoImpedimento:g('oTipoImpedimento'), impedimentoOutro:g('oImpedimentoOutro'),
        regularizacaoData:g('oRegularizacao'),
        atualizadaEm:serverTimestamp()
      };
    } else if(me.perfil==='fiscal'){
      patch={
        fiscalizacao:g('oFiscalizacao'), pendencia:gChk('oTemPendencia'),
        tipoPendencia:g('oTipoPendencia'), pendenciaOutro:g('oPendenciaOutro'), prazoPendencia:g('oPrazoPendencia'),
        pendenciaResolvida:gChk('oPendenciaResolvida'),
        medicao:g('oMedicao'), medida70:g('oMedida70'), medida230:g('oMedida230'),
        medida280:g('oMedida280'), medida280Motivo:g('oMedida280Motivo'),
        armazenado:gChk('oArmazenado'),
        atualizadaEm:serverTimestamp()
      };
    }

    if(isEdit){
      await updateDoc(doc(db,'obras',obraId),patch);
      // disparo de e-mails por evento
      if(me.perfil==='empreiteira'&&!obraAntiga?.conclusao&&patch.conclusao)
        await enviarEmailConclusao({...obraAntiga,...patch});
      if(me.perfil==='fiscal'&&!obraAntiga?.pendencia&&patch.pendencia)
        await enviarEmailPendencia({...obraAntiga,...patch});
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
        const rc=`role-${u.perfil}`;
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
    tipo_pendencia:obra.tipoPendencia, prazo_resolucao:fmtTxt(obra.prazoPendencia),
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
    // Medida 230 próxima de vencer
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
    if (f.srch && !(o.numero+o.cidade+o.fiscal+o.empreiteira+o.tipo).toLowerCase().includes(f.srch)) return false;
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

window.limparFiltros = function() {
  ['fStatus','fTipo','fEmpreiteira','fFiscal','fCidade','fPendencia',
   'fAberturaIni','fAberturaFim','fLimiteIni','fLimiteFim','fDiasVencer','fArmazenado','srch']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('btnLimparFiltros').style.display = 'none';
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

// Atualiza renderObras para usar filtros
const _renderObrasOriginal = window.renderObras;
window.renderObras = function() {
  const list = aplicarFiltros(visibleObras());
  const body = document.getElementById('obrasBody');
  const ativos = contarFiltrosAtivos();
  const btnLimpar = document.getElementById('btnLimparFiltros');
  if (btnLimpar) btnLimpar.style.display = ativos > 0 ? 'inline-flex' : 'none';
  const resumo = document.getElementById('filtrosResumo');
  if (resumo) {
    const total = visibleObras().length;
    resumo.textContent = ativos > 0
      ? `Mostrando ${list.length} de ${total} obras — ${ativos} filtro(s) ativo(s)`
      : `${total} obras no total`;
  }
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="24"><div class="empty"><div class="ico">🔍</div><p>Nenhuma obra encontrada com os filtros aplicados.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = list.map(o => {
    const s = statusOf(o), fc = o.fiscal ? gc(o.fiscal) : 'var(--muted)';
    const limDias = diasRestantes(o.dataLimite);
    const canEdit = me.perfil==='gerente'||(me.perfil==='fiscal'&&o.fiscal===me.vinculo)||(me.perfil==='empreiteira'&&o.empreiteira===me.vinculo);
    const acts = canEdit
      ? `<button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">✏️</button>
         ${me.perfil==='gerente'?`<button class="btn btn-danger btn-sm" onclick="delObra('${o.id}')">🗑️</button>`:''}`
      : '';
    const pendChip = o.pendencia
      ? (o.pendenciaResolvida ? '<span class="chip chip-green">Resolvida</span>' : `<span class="chip chip-red">${o.tipoPendencia||''}</span>`)
      : '<span class="chip">—</span>';
    const armChip = o.armazenado ? '<span class="chip chip-green">✓</span>' : '<span class="chip">—</span>';
    return `<tr>
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
      <td>${fmt(o.dataDesligamento)}</td>
      <td>${fmt(o.conclusao)}</td>
      <td>${fmt(o.fiscalizacao)}</td>
      <td>${pendChip}</td>
      <td>${fmt(o.kaffa)}</td>
      <td>${fmt(o.dataCadastro)}</td>
      <td>${fmt(o.medicao)}</td>
      <td>${o.usc||'—'}</td>
      <td>${o.ulv||'—'}</td>
      <td>${fmt(o.medida70)}</td>
      <td>${fmt(o.medida230)}</td>
      <td>${fmt(o.medida280)}</td>
      <td>${armChip}</td>
      <td><div style="display:flex;gap:4px">${acts}</div></td>
    </tr>`;
  }).join('');
};

// ══════════════════════════════════════════════════════
//  IMPORTAÇÃO EXCEL
// ══════════════════════════════════════════════════════

// Colunas do sistema e seus aliases reconhecidos na planilha
const COLUNAS_SISTEMA = [
  { campo:'numero',        label:'Nº da Obra',         aliases:['numero','nº','obra','número da obra','nro','num'] },
  { campo:'tipo',          label:'Tipo',                aliases:['tipo'] },
  { campo:'cidade',        label:'Cidade',              aliases:['cidade','municipio','município','localidade'] },
  { campo:'empreiteira',   label:'Empreiteira',         aliases:['empreiteira','empresa','contratada'] },
  { campo:'fiscal',        label:'Fiscal',              aliases:['fiscal','responsável','responsavel','inspetor'] },
  { campo:'dataAbertura',  label:'Data Abertura',       aliases:['abertura','data abertura','data_abertura','dt_abertura','dataabertura'] },
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
  const wb = XLSX.utils.book_new();
  const headers = COLUNAS_SISTEMA.map(c => c.label);
  const exemplo = [
    ['2024-001','R1','Lages','CS ELETRICIDADE','João Silva','2024-01-15','60','10','5','','','','','','','',''],
    ['2024-002','R2','Curitibanos','ELETELSUL','Maria Santos','2024-02-01','45','8','3','','','','','','','',''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...exemplo]);
  // Larguras das colunas
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Obras');
  XLSX.writeFile(wb, 'modelo_obras_track.xlsx');
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
      const wb = XLSX.read(e.target.result, { type:'array', cellDates:false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
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
  preview.innerHTML =
    `<thead><tr>${xlsxHeaders.map(h=>`<th>${h||'—'}</th>`).join('')}</tr></thead>` +
    `<tbody>${previewRows.slice(1).map(r=>`<tr>${xlsxHeaders.map((_,i)=>`<td>${r[i]??''}</td>`).join('')}</tr>`).join('')}</tbody>`;
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
