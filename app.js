// ══════════════════════════════════════════════════════
//  ObrasTrack — app.js
//  Firebase Authentication + Firestore
// ══════════════════════════════════════════════════════
import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import firebaseConfig             from "./firebase-config.js";

// ── INIT ──────────────────────────────────────────────
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// ── ESTADO ────────────────────────────────────────────
const EMPREITEIRAS = ['CS ELETRICIDADE', 'ELETELSUL'];
const COLORS = ['#00e5a0','#7c6af7','#ff6b35','#f5c542','#ff4d6d','#38bdf8','#a3e635','#fb7185','#e879f9','#67e8f9'];
const fColor = {}; let cIdx = 0;

let me       = null;   // perfil do usuário logado (doc do Firestore)
let obras    = [];     // cache local
let users    = [];     // cache local
let unsubObras = null; // listener tempo real

function gc(k) { if (!fColor[k]) fColor[k] = COLORS[cIdx++ % COLORS.length]; return fColor[k]; }
function ini(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

// ── HELPERS DATAS ──────────────────────────────────────
function fmt(s) {
  if (!s) return '<span style="color:var(--muted)">—</span>';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function diff(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function dHtml(v) {
  if (v === null) return '<span class="delta d-none">—</span>';
  if (v <= 3)  return `<span class="delta d-ok">${v}d</span>`;
  if (v <= 10) return `<span class="delta d-warn">${v}d</span>`;
  return `<span class="delta d-late">${v}d</span>`;
}
function statusOf(o) {
  if (o.medicao)      return { l: 'Medição OK',  c: 'p-med'  };
  if (o.kaffa)        return { l: 'Kaffa OK',     c: 'p-kaff' };
  if (o.fiscalizacao) return { l: 'Fiscalizado',  c: 'p-fisc' };
  if (o.conclusao)    return { l: 'Concluída',    c: 'p-conc' };
  return { l: 'Pendente', c: 'p-pend' };
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.innerHTML = (type === 'ok' ? '✅' : '❌') + ' ' + msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── AUTH ──────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    // buscar perfil no Firestore
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (!snap.exists()) { await signOut(auth); return; }
    me = { uid: user.uid, email: user.email, ...snap.data() };
    iniciarApp();
  } else {
    me = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display   = 'none';
    if (unsubObras) { unsubObras(); unsubObras = null; }
  }
});

async function doLogin() {
  const email = document.getElementById('lgEmail').value.trim();
  const senha  = document.getElementById('lgPass').value;
  const btn    = document.getElementById('btnLogin');
  const err    = document.getElementById('lgErr');
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch(e) {
    err.textContent = 'E-mail ou senha incorretos.';
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}
document.getElementById('lgPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
window.doLogin  = doLogin;
window.doLogout = () => signOut(auth);

// ── APP INIT ──────────────────────────────────────────
function iniciarApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display   = 'block';
  document.getElementById('hName').textContent  = me.nome;
  const rb = document.getElementById('hRole');
  rb.textContent = me.perfil.charAt(0).toUpperCase() + me.perfil.slice(1);
  rb.className   = 'role-badge role-' + me.perfil;

  // tabs por perfil
  const tabs = [['pgDash','📊 Dashboard'],['pgObras','🏗️ Obras']];
  if (me.perfil === 'gerente') tabs.push(['pgUsers','👥 Usuários']);
  document.getElementById('tabBar').innerHTML = tabs
    .map(([id, lbl]) => `<div class="tab" data-page="${id}" onclick="showPage('${id}')">${lbl}</div>`)
    .join('');

  document.getElementById('btnNovaObra').style.display =
    me.perfil === 'gerente' ? 'inline-flex' : 'none';

  // listener tempo real para obras
  const q = query(collection(db, 'obras'), orderBy('criadaEm', 'desc'));
  unsubObras = onSnapshot(q, snap => {
    obras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // atualizar página ativa
    const active = document.querySelector('.page.active');
    if (active?.id === 'pgDash')  renderDash();
    if (active?.id === 'pgObras') renderObras();
  });

  showPage('pgDash');
}
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === id));
  document.getElementById(id).classList.add('active');
  if (id === 'pgDash')  renderDash();
  if (id === 'pgObras') renderObras();
  if (id === 'pgUsers') renderUsers();
};

// ── FILTRO POR PERFIL ─────────────────────────────────
function visibleObras() {
  if (me.perfil === 'gerente') return obras;
  if (me.perfil === 'fiscal')  return obras; // vê todas, edita só as suas
  if (me.perfil === 'empreiteira') return obras.filter(o => o.empreiteira === me.vinculo);
  return [];
}

// ── DASHBOARD ─────────────────────────────────────────
function renderDash() {
  const list = visibleObras();
  document.getElementById('k1').textContent = list.length;
  document.getElementById('k2').textContent = list.filter(o => o.conclusao && !o.fiscalizacao).length;
  document.getElementById('k3').textContent = list.filter(o => o.fiscalizacao && !o.kaffa).length;
  document.getElementById('k4').textContent = list.filter(o => o.kaffa && !o.medicao).length;

  const fis = {};
  list.forEach(o => {
    if (!o.fiscal) return;
    if (!fis[o.fiscal]) fis[o.fiscal] = { t:0, df:[], dk:[], dm:[] };
    const f = fis[o.fiscal]; f.t++;
    const df = diff(o.conclusao, o.fiscalizacao);
    const dk = diff(o.fiscalizacao, o.kaffa);
    const dm = diff(o.kaffa, o.medicao);
    if (df !== null) f.df.push(df);
    if (dk !== null) f.dk.push(dk);
    if (dm !== null) f.dm.push(dm);
  });
  const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : null;
  const bar = v => v === null ? 0 : Math.min(100, Math.round((v/30)*100));
  let html = '';
  Object.entries(fis).sort().forEach(([name, d]) => {
    const c=gc(name), af=avg(d.df), ak=avg(d.dk), am=avg(d.dm);
    html += `<div class="vel-card">
      <div class="vc-hd">
        <div class="avatar" style="background:${c}22;color:${c}">${ini(name)}</div>
        <div><div class="vc-name">${name}</div><div class="vc-ct">${d.t} obras</div></div>
      </div>
      <div class="vc-row"><span class="vc-rl">Concl→Fisc.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(af)}%;background:${c}"></div></div><span class="vc-rv" style="color:${c}">${af!==null?af+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Fisc.→Kaffa</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(ak)}%;background:var(--yellow)"></div></div><span class="vc-rv" style="color:var(--yellow)">${ak!==null?ak+'d':'—'}</span></div>
      <div class="vc-row"><span class="vc-rl">Kaffa→Med.</span><div class="bar-wrap"><div class="bar-fill" style="width:${bar(am)}%;background:var(--accent2)"></div></div><span class="vc-rv" style="color:var(--accent2)">${am!==null?am+'d':'—'}</span></div>
    </div>`;
  });
  document.getElementById('velGrid').innerHTML = html ||
    `<div class="empty"><div class="ico">📊</div><p>Sem dados de velocidade ainda.</p></div>`;
}

// ── TABELA OBRAS ──────────────────────────────────────
function renderObras() {
  const srch = document.getElementById('srch').value.toLowerCase();
  const list = visibleObras().filter(o =>
    !srch || (o.numero+o.cidade+o.fiscal+o.empreiteira).toLowerCase().includes(srch)
  );
  const body = document.getElementById('obrasBody');
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="13"><div class="empty"><div class="ico">🏗️</div><p>Nenhuma obra encontrada.</p></div></td></tr>`;
    return;
  }
  body.innerHTML = list.map(o => {
    const s  = statusOf(o);
    const c  = o.fiscal ? gc(o.fiscal) : 'var(--muted)';
    const df = diff(o.conclusao, o.fiscalizacao);
    const dk = diff(o.fiscalizacao, o.kaffa);
    const dm = diff(o.kaffa, o.medicao);
    const canEdit =
      me.perfil === 'gerente' ||
      (me.perfil === 'fiscal'      && o.fiscal     === me.vinculo) ||
      (me.perfil === 'empreiteira' && o.empreiteira === me.vinculo);
    const actBtns = canEdit
      ? `<div style="display:flex;gap:6px">
           <button class="btn btn-secondary btn-sm" onclick="openObraModal('${o.id}')">✏️</button>
           ${me.perfil === 'gerente' ? `<button class="btn btn-danger btn-sm" onclick="delObra('${o.id}')">🗑️</button>` : ''}
         </div>` : '';
    return `<tr>
      <td><strong style="color:var(--accent)">${o.numero||'—'}</strong></td>
      <td>${o.cidade||'—'}</td>
      <td><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:var(--surface2);border:1px solid var(--border)">${o.empreiteira||'—'}</span></td>
      <td>${o.fiscal ? `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block"></span>${o.fiscal}</span>` : '—'}</td>
      <td><span class="pill ${s.c}">${s.l}</span></td>
      <td>${fmt(o.conclusao)}</td>
      <td>${fmt(o.fiscalizacao)}</td>
      <td>${dHtml(df)}</td>
      <td>${fmt(o.kaffa)}</td>
      <td>${dHtml(dk)}</td>
      <td>${fmt(o.medicao)}</td>
      <td>${dHtml(dm)}</td>
      <td>${actBtns}</td>
    </tr>`;
  }).join('');
}
window.renderObras = renderObras;

// ── MODAL OBRA ────────────────────────────────────────
window.openObraModal = function(obraId) {
  const obra    = obraId ? obras.find(o => o.id === obraId) : null;
  const isEdit  = !!obra;
  document.getElementById('obraModalTit').textContent = isEdit ? 'Editar Obra' : 'Nova Obra';
  document.getElementById('obraId').value = obraId || '';

  const flds = ['oNum','oCid','oConc','oKaff','oFisc','oMed','oFiscalNome'];
  flds.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('oEmp').value = '';

  if (isEdit) {
    document.getElementById('oNum').value       = obra.numero        || '';
    document.getElementById('oCid').value       = obra.cidade        || '';
    document.getElementById('oEmp').value       = obra.empreiteira   || '';
    document.getElementById('oFiscalNome').value= obra.fiscal        || '';
    document.getElementById('oConc').value      = obra.conclusao     || '';
    document.getElementById('oKaff').value      = obra.kaffa         || '';
    document.getElementById('oFisc').value      = obra.fiscalizacao  || '';
    document.getElementById('oMed').value       = obra.medicao       || '';
  }

  // blocos visíveis por perfil
  document.getElementById('blkIdentif').style.display = me.perfil === 'gerente'   ? 'block' : 'none';
  document.getElementById('blkEmp').style.display     = me.perfil !== 'fiscal'    ? 'block' : 'none';
  document.getElementById('blkFis').style.display     = me.perfil !== 'empreiteira' ? 'block' : 'none';

  // desabilitar campos do outro perfil
  ['oConc','oKaff'].forEach(id => document.getElementById(id).disabled = me.perfil === 'fiscal');
  ['oFisc','oMed'].forEach(id => document.getElementById(id).disabled  = me.perfil === 'empreiteira');

  document.getElementById('ovObra').classList.add('open');
};
window.closeObraModal = function() { document.getElementById('ovObra').classList.remove('open'); };

window.saveObra = async function() {
  const btn = document.getElementById('btnSalvarObra');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const obraId = document.getElementById('obraId').value;
    const isEdit = !!obraId;

    if (isEdit) {
      const patch = {};
      if (me.perfil === 'gerente') {
        patch.numero       = document.getElementById('oNum').value.trim();
        patch.cidade       = document.getElementById('oCid').value.trim();
        patch.empreiteira  = document.getElementById('oEmp').value;
        patch.fiscal       = document.getElementById('oFiscalNome').value.trim();
        patch.conclusao    = document.getElementById('oConc').value;
        patch.kaffa        = document.getElementById('oKaff').value;
        patch.fiscalizacao = document.getElementById('oFisc').value;
        patch.medicao      = document.getElementById('oMed').value;
      } else if (me.perfil === 'empreiteira') {
        patch.conclusao = document.getElementById('oConc').value;
        patch.kaffa     = document.getElementById('oKaff').value;
      } else if (me.perfil === 'fiscal') {
        patch.fiscalizacao = document.getElementById('oFisc').value;
        patch.medicao      = document.getElementById('oMed').value;
      }
      patch.atualizadaEm = serverTimestamp();
      await updateDoc(doc(db, 'obras', obraId), patch);
      toast('Obra atualizada!');
    } else {
      const n = document.getElementById('oNum').value.trim();
      const c = document.getElementById('oCid').value.trim();
      if (!n || !c) { toast('Preencha número e cidade.', 'err'); return; }
      await addDoc(collection(db, 'obras'), {
        numero:       n,
        cidade:       c,
        empreiteira:  document.getElementById('oEmp').value,
        fiscal:       document.getElementById('oFiscalNome').value.trim(),
        conclusao:    document.getElementById('oConc').value,
        kaffa:        document.getElementById('oKaff').value,
        fiscalizacao: document.getElementById('oFisc').value,
        medicao:      document.getElementById('oMed').value,
        criadaEm:     serverTimestamp(),
        criadaPor:    me.uid,
      });
      toast('Obra cadastrada!');
    }
    window.closeObraModal();
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
};

window.delObra = async function(obraId) {
  if (!confirm('Remover esta obra permanentemente?')) return;
  try {
    await deleteDoc(doc(db, 'obras', obraId));
    toast('Obra removida.');
  } catch(e) { toast('Erro: ' + e.message, 'err'); }
};

// ── USUÁRIOS ──────────────────────────────────────────
async function loadUsers() {
  const snap = await getDocs(collection(db, 'usuarios'));
  users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function renderUsers() {
  await loadUsers();
  const list = document.getElementById('usersList');
  if (!users.length) { list.innerHTML = `<div class="empty"><div class="ico">👥</div><p>Nenhum usuário.</p></div>`; return; }
  list.innerHTML = users.map(u => {
    const rc = u.perfil === 'gerente' ? 'role-gerente' : u.perfil === 'fiscal' ? 'role-fiscal' : 'role-empreiteira';
    return `<div class="ut-row">
      <div class="ut-name">${u.nome}</div>
      <div class="ut-email">${u.email||'—'}</div>
      <div class="ut-role"><span class="role-badge ${rc}">${u.perfil}</span></div>
      <div class="ut-vinc">${u.vinculo||'—'}</div>
      <div class="ut-acts">
        <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.uid}')">✏️</button>
        ${u.uid !== me.uid ? `<button class="btn btn-danger btn-sm" onclick="delUser('${u.uid}')">🗑️</button>` : ''}
      </div>
    </div>`;
  }).join('');
}
window.renderUsers = renderUsers;

window.openUserModal = async function(uid) {
  const isEdit = !!uid;
  document.getElementById('userModalTit').textContent = isEdit ? 'Editar Usuário' : 'Novo Usuário';
  document.getElementById('userId').value  = uid || '';
  document.getElementById('btnSalvarUser').textContent = isEdit ? 'Salvar' : 'Criar Usuário';

  ['uNome','uEmail','uSenha','uVincFis'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('uPerfil').value = '';
  document.getElementById('uVincEmp').value = '';
  document.getElementById('fgVincEmp').style.display = 'none';
  document.getElementById('fgVincFis').style.display = 'none';

  const note = document.getElementById('userNote');
  if (isEdit) {
    const u = users.find(u => u.uid === uid);
    if (u) {
      document.getElementById('uNome').value  = u.nome   || '';
      document.getElementById('uEmail').value = u.email  || '';
      document.getElementById('uPerfil').value= u.perfil || '';
      onPerfilChange();
      if (u.perfil === 'empreiteira') document.getElementById('uVincEmp').value = u.vinculo||'';
      if (u.perfil === 'fiscal')      document.getElementById('uVincFis').value  = u.vinculo||'';
    }
    note.textContent = 'Deixe a senha em branco para não alterá-la.';
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }
  document.getElementById('ovUser').classList.add('open');
};
window.closeUserModal = function() { document.getElementById('ovUser').classList.remove('open'); };

window.onPerfilChange = function() {
  const p = document.getElementById('uPerfil').value;
  document.getElementById('fgVincEmp').style.display = p === 'empreiteira' ? 'flex' : 'none';
  document.getElementById('fgVincFis').style.display = p === 'fiscal'      ? 'flex' : 'none';
};

window.saveUser = async function() {
  const btn = document.getElementById('btnSalvarUser');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const uid    = document.getElementById('userId').value;
    const isEdit = !!uid;
    const nome   = document.getElementById('uNome').value.trim();
    const email  = document.getElementById('uEmail').value.trim();
    const senha  = document.getElementById('uSenha').value;
    const perfil = document.getElementById('uPerfil').value;
    const vinculo = perfil === 'empreiteira'
      ? document.getElementById('uVincEmp').value
      : perfil === 'fiscal'
        ? document.getElementById('uVincFis').value.trim()
        : '';

    if (!nome || !email || !perfil) { toast('Preencha todos os campos obrigatórios.', 'err'); return; }
    if (!isEdit && senha.length < 6) { toast('Senha deve ter ao menos 6 caracteres.', 'err'); return; }

    if (isEdit) {
      // Atualiza apenas os dados de perfil no Firestore
      await setDoc(doc(db, 'usuarios', uid), { nome, email, perfil, vinculo }, { merge: true });
      toast('Usuário atualizado!');
    } else {
      // Cria usuário no Firebase Auth via Admin SDK não disponível no cliente.
      // Usamos createUserWithEmailAndPassword temporariamente e depois restauramos sessão.
      const currentUser = auth.currentUser;
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      const newUid = cred.user.uid;
      await setDoc(doc(db, 'usuarios', newUid), { nome, email, perfil, vinculo, criadoEm: serverTimestamp() });
      // Faz logout do novo usuário e reloga o gerente
      await signOut(auth);
      // O onAuthStateChanged vai disparar e limpar me; precisamos relogar o gerente
      // Salvamos as credenciais do gerente temporariamente
      toast('Usuário criado! Você será redirecionado para o login novamente — isso é normal.', 'ok');
      // Aguarda 2s para o toast aparecer e redireciona para login
      setTimeout(() => { window.location.reload(); }, 2000);
      return;
    }
    window.closeUserModal();
    await renderUsers();
  } catch(e) {
    const msg = e.code === 'auth/email-already-in-use' ? 'Este e-mail já está em uso.' : e.message;
    toast('Erro: ' + msg, 'err');
  } finally {
    btn.disabled = false; btn.textContent = document.getElementById('userId').value ? 'Salvar' : 'Criar Usuário';
  }
};

window.delUser = async function(uid) {
  if (uid === me.uid) { toast('Você não pode remover a si mesmo.', 'err'); return; }
  if (!confirm('Remover este usuário? Ele perderá o acesso.')) return;
  try {
    await deleteDoc(doc(db, 'usuarios', uid));
    toast('Usuário removido do sistema. (O acesso de autenticação deve ser removido manualmente no Firebase Console.)');
    await renderUsers();
  } catch(e) { toast('Erro: ' + e.message, 'err'); }
};

// ── EXPORT CSV ────────────────────────────────────────
window.exportCSV = function() {
  const rows = [['Nº','Cidade','Empreiteira','Fiscal','Status','Conclusão','Fiscalização','Δ Fisc(d)','Kaffa','Δ Kaffa(d)','Medição','Δ Med(d)']];
  visibleObras().forEach(o => rows.push([
    o.numero, o.cidade, o.empreiteira, o.fiscal, statusOf(o).l,
    o.conclusao, o.fiscalizacao, diff(o.conclusao, o.fiscalizacao) ?? '',
    o.kaffa, diff(o.fiscalizacao, o.kaffa) ?? '',
    o.medicao, diff(o.kaffa, o.medicao) ?? ''
  ]));
  const csv = rows.map(r => r.join(';')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
  a.download = 'obras_track.csv';
  a.click();
};

// ── FECHAR MODAIS CLICANDO FORA ───────────────────────
['ovObra','ovUser'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) document.getElementById(id).classList.remove('open');
  });
});
