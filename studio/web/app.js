// 书房界面：原生 JS，无框架。
//
// 刻意不引入前端框架：这个界面只有「列表 + 编辑」两件事，
// 引入框架的体积与构建复杂度都换不来相应的收益（见 KB-002 的验收要求）。
//
// 认证靠 HttpOnly Cookie，脚本读不到令牌也不需要读 —— 同源的 fetch 自动带上。

const $ = (id) => document.getElementById(id);
const state = { notes: [], current: null, query: '' };

async function api(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  // 会话过期时回到登录页，而不是抛一个看不懂的错误
  if (res.status === 401) {
    location.reload();
    throw new Error('会话已失效');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `请求失败（${res.status}）`);
  return body;
}

function say(message) {
  $('status').textContent = message;
}

function fmt(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderList() {
  const ol = $('notes');
  ol.replaceChildren();
  $('empty').hidden = state.notes.length > 0;

  for (const note of state.notes) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${note.id}`;
    a.setAttribute('aria-current', String(state.current?.id === note.id));

    const title = document.createElement('span');
    title.className = 'note-title';
    title.textContent = note.title;

    const meta = document.createElement('span');
    meta.className = 'note-meta';
    meta.textContent = [fmt(note.updated_at), note.tags?.join(' · ')]
      .filter(Boolean)
      .join('  ');

    a.append(title, meta);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      open(note.id);
    });
    li.append(a);
    ol.append(li);
  }
}

async function refresh() {
  // 走统一检索：它会优先语义、端点不可用时降级为关键词，
  // 并把实际用的模式告诉我们 —— 用户有权知道结果是怎么来的。
  const path = state.query
    ? `/api/search-all?q=${encodeURIComponent(state.query)}`
    : '/api/notes';
  const body = await api(path);
  state.notes = body.notes || body.hits || [];
  renderList();

  if (state.query) {
    $('list-mode').textContent =
      body.mode === 'semantic'
        ? '语义检索'
        : body.mode === 'keyword'
          ? '关键词检索（嵌入端点不可用）'
          : '';
  } else {
    $('list-mode').textContent = '';
  }
}

function showEditor(note) {
  state.current = note;
  $('placeholder').hidden = true;
  $('editor').hidden = false;
  $('title').value = note?.title ?? '';
  $('tags').value = (note?.tags ?? []).join(', ');
  $('body').value = note?.body ?? '';
  $('delete').hidden = !note;
  say('');
  renderList();
  $('title').focus();
}

async function open(id) {
  const { note } = await api(`/api/notes/${id}`);
  showEditor(note);
}

async function save(event) {
  event.preventDefault();
  const payload = {
    title: $('title').value.trim(),
    body: $('body').value,
    tags: $('tags')
      .value.split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  };
  if (!payload.title) {
    say('标题不能为空');
    $('title').focus();
    return;
  }
  try {
    const { note } = state.current
      ? await api(`/api/notes/${state.current.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      : await api('/api/notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
    showEditor(note);
    await refresh();
    say('已保存');
  } catch (error) {
    say(error.message);
  }
}

async function remove() {
  if (!state.current) return;
  if (!confirm(`删除「${state.current.title}」？这一步不可撤销。`)) return;
  try {
    await api(`/api/notes/${state.current.id}`, { method: 'DELETE' });
    state.current = null;
    $('editor').hidden = true;
    $('placeholder').hidden = false;
    await refresh();
  } catch (error) {
    say(error.message);
  }
}

// ── 检索：输入即过滤，带防抖 ──
let timer;
$('search-form').addEventListener('input', (e) => {
  state.query = e.target.value.trim();
  clearTimeout(timer);
  timer = setTimeout(() => refresh().catch((err) => say(err.message)), 180);
});
$('search-form').addEventListener('submit', (e) => e.preventDefault());

$('new').addEventListener('click', () => showEditor(null));
$('editor').addEventListener('submit', save);
$('delete').addEventListener('click', remove);

// ── 主题：跟随系统，可手动切换 ──
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').textContent = dark ? '浅色' : '深色';
  $('theme').setAttribute('aria-pressed', String(dark));
}
applyTheme(prefersDark.matches);
$('theme').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme !== 'dark');
});
prefersDark.addEventListener('change', (e) => applyTheme(e.matches));

// 快捷键：Cmd/Ctrl+S 保存
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (!$('editor').hidden) $('editor').requestSubmit();
  }
});

// 打开时如果有 hash，直接定位到那条
const initial = location.hash.slice(1);
refresh()
  .then(() => (initial ? open(initial).catch(() => {}) : undefined))
  .catch((error) => say(error.message));

// ─────────────────────────── 对话（KB-004）───────────────────────────
//
// 与笔记区共用同一个页面与同一套 tokens，靠标签页切换视图。
// 引用由服务端检索并注入，界面只负责**显示**它 ——
// 让前端自己检索会让「回答依据什么」在两处各算一遍，迟早不一致。

const chat = { conversations: [], current: null, status: 'unknown' };

function setTab(which) {
  for (const name of ['notes', 'chat', 'memory']) {
    $(`view-${name}`).hidden = name !== which;
    $(`tab-${name}`).setAttribute('aria-current', String(name === which));
  }
  const isNotes = which === 'notes';
  $('search-form').closest('search').hidden = !isNotes;
  $('new').hidden = !isNotes;
  if (which === 'chat') checkModel();
}

async function checkModel() {
  const el = $('model-status');
  try {
    const info = await api('/api/model');
    el.textContent = info.ok ? `模型端点可用` : '模型端点不可用';
    el.className = `status ${info.ok ? 'online' : 'offline'}`;
    $('model-name').textContent = info.model || '';
    if (!info.ok && info.hint) el.textContent = info.hint;
  } catch (error) {
    el.textContent = error.message;
    el.className = 'status offline';
  }
}

function renderConversations() {
  const ol = $('conversations');
  ol.replaceChildren();
  $('no-conv').hidden = chat.conversations.length > 0;

  for (const c of chat.conversations) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#conv-${c.id}`;
    a.setAttribute('aria-current', String(chat.current?.id === c.id));

    const title = document.createElement('span');
    title.className = 'note-title';
    title.textContent = c.title || '（未命名对话）';

    const meta = document.createElement('span');
    meta.className = 'note-meta';
    meta.textContent = [fmt(c.updated_at), c.model].filter(Boolean).join('  ');

    a.append(title, meta);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openConversation(c.id);
    });
    li.append(a);
    ol.append(li);
  }
}

function renderMessages() {
  const box = $('messages');
  box.replaceChildren();

  if (!chat.current) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = '选一个对话，或者新建一个来提问。';
    box.append(p);
    return;
  }

  for (const m of chat.current.messages) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${m.role}`;

    const role = document.createElement('span');
    role.className = 'msg-role';
    role.textContent = m.role === 'user' ? '我' : '模型';

    const body = document.createElement('p');
    body.className = 'msg-body';
    body.textContent = m.content;

    wrap.append(role, body);

    if (m.role === 'assistant' && m.citations?.length) {
      const ul = document.createElement('ul');
      ul.className = 'msg-cites';
      for (const id of m.citations) {
        const li = document.createElement('li');
        li.textContent = `引用 ${id.slice(0, 8)}`;
        ul.append(li);
      }
      wrap.append(ul);

      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = '存为草稿';
      btn.addEventListener('click', () => saveAsDraft(m.id));
      actions.append(btn);
      wrap.append(actions);
    }

    box.append(wrap);
  }
  box.scrollTop = box.scrollHeight;
}

async function refreshConversations() {
  const { conversations } = await api('/api/conversations');
  chat.conversations = conversations;
  renderConversations();
}

async function openConversation(id) {
  const { conversation } = await api(`/api/conversations/${id}`);
  chat.current = conversation;
  renderConversations();
  renderMessages();
  $('prompt').focus();
}

async function newConversation() {
  const { conversation } = await api('/api/conversations', {
    method: 'POST',
    body: '{}',
  });
  chat.current = conversation;
  await refreshConversations();
  renderMessages();
  $('prompt').focus();
}

async function sendPrompt(event) {
  event.preventDefault();
  const box = $('prompt');
  const content = box.value.trim();
  if (!content) return;
  if (!chat.current) await newConversation();

  box.value = '';
  $('send').disabled = true;
  // 先本地回显用户消息，避免等待模型时界面看起来没反应
  chat.current.messages.push({ role: 'user', content, citations: [] });
  renderMessages();

  try {
    await api(`/api/conversations/${chat.current.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    await openConversation(chat.current.id);
    await refreshConversations();
  } catch (error) {
    // 失败时把用户消息留在界面上（服务端也保留了它），并说明原因
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = `发送失败：${error.message}`;
    $('messages').append(p);
  } finally {
    $('send').disabled = false;
  }
}

async function saveAsDraft(messageId) {
  try {
    const { note } = await api(`/api/conversations/${chat.current.id}/draft`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    });
    await refresh();
    window.__lastDraft = note.id;
    const el = document.createElement('p');
    el.className = 'placeholder';
    el.textContent = `已存为草稿「${note.title}」。它带 AI 起草标记，编辑后才会转为你的内容。`;
    $('messages').append(el);
  } catch (error) {
    alert(`存为草稿失败：${error.message}`);
  }
}

$('tab-notes').addEventListener('click', () => setTab('notes'));
$('tab-chat').addEventListener('click', () => setTab('chat'));
$('new-conv').addEventListener('click', newConversation);
$('composer').addEventListener('submit', sendPrompt);
$('prompt').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    $('composer').requestSubmit();
  }
});

refreshConversations().catch(() => {});

// ─────────────────────────── 记忆审核 ───────────────────────────
//
// 三层模型的要点是「AI 提取的结论必须经人工确认」。
// 这个界面就是那个确认动作的落点 —— 没有它，pending 记忆只能通过
// API 批准，等于核心约束在实践中被绕过。

const memory = { list: [], status: 'pending' };

function renderMemories() {
  const box = $('memories');
  box.replaceChildren();
  $('mem-status').textContent =
    memory.status === 'pending'
      ? `${memory.list.length} 条待审核 —— 确认后才会进入检索`
      : `${memory.list.length} 条已确认`;

  if (memory.list.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent =
      memory.status === 'pending'
        ? '没有待审核的记忆。'
        : '还没有已确认的记忆。';
    box.append(p);
    return;
  }

  for (const m of memory.list) {
    const wrap = document.createElement('div');
    wrap.className = 'msg';

    const body = document.createElement('p');
    body.className = 'msg-body';
    body.textContent = m.content;

    const meta = document.createElement('span');
    meta.className = 'msg-role';
    meta.textContent = [
      `置信度 ${Math.round((m.confidence ?? 0) * 100)}%`,
      m.reviewed_at ? `审核于 ${fmt(m.reviewed_at)}` : null,
    ]
      .filter(Boolean)
      .join('　');

    wrap.append(meta, body);

    if (memory.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      for (const [label, decision, cls] of [
        ['确认', 'approved', 'btn primary'],
        ['驳回', 'rejected', 'btn'],
      ]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = cls;
        btn.textContent = label;
        btn.addEventListener('click', () => reviewMemory(m.id, decision));
        actions.append(btn);
      }
      // 来源链：这条结论是从哪来的
      const src = document.createElement('button');
      src.type = 'button';
      src.className = 'btn';
      src.textContent = '查看来源';
      src.addEventListener('click', () => showProvenance(m.id, wrap));
      actions.append(src);

      wrap.append(actions);
    }

    box.append(wrap);
  }
}

async function loadMemories(status = memory.status) {
  memory.status = status;
  $('mem-pending').setAttribute('aria-current', String(status === 'pending'));
  $('mem-approved').setAttribute('aria-current', String(status === 'approved'));
  const { memories } = await api(`/api/memories?status=${status}`);
  memory.list = memories;
  renderMemories();
}

async function reviewMemory(id, decision) {
  try {
    await api(`/api/memories/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    await loadMemories();
  } catch (error) {
    $('mem-status').textContent = `操作失败：${error.message}`;
  }
}

async function showProvenance(id, container) {
  const prov = await api(`/api/memories/${id}/provenance`);
  const box = document.createElement('div');
  box.className = 'provenance';

  const lines = [];
  if (prov.message) {
    lines.push(`来自对话「${prov.message.conversation_title || '未命名'}」`);
  }
  if (prov.archive) lines.push(`来自档案 ${prov.archive.source}`);
  if (prov.notes.length) {
    lines.push(`关联笔记：${prov.notes.map((n) => n.title).join('、')}`);
  }
  if (lines.length === 0) lines.push('这条记忆没有记录来源。');

  box.textContent = lines.join('　·　');
  container.append(box);
}

$('tab-memory').addEventListener('click', () => {
  setTab('memory');
  loadMemories().catch((e) => {
    $('mem-status').textContent = e.message;
  });
});
$('mem-pending').addEventListener('click', () => loadMemories('pending'));
$('mem-approved').addEventListener('click', () => loadMemories('approved'));
