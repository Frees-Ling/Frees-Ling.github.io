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
  const path = state.query
    ? `/api/search?q=${encodeURIComponent(state.query)}`
    : '/api/notes';
  const body = await api(path);
  state.notes = body.notes || body.hits || [];
  renderList();
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
