import 'grapesjs/dist/css/grapes.min.css';
import grapesjs from 'grapesjs';
import grapesjsMjml from 'grapesjs-mjml';
import mjml2html from 'mjml-browser';

const statusEl = document.getElementById('status');
function setStatus(text) { statusEl.textContent = text; }
function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function accountKey() {
  return new URLSearchParams(window.location.search).get('account') || '';
}
function exportMjml() {
  // grapesjs-mjml overrides export to MJML; getHtml() returns the MJML source.
  return editor.getHtml();
}
function prettyName(name) {
  return String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}
function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/[&"<>]/g, (ch) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[ch]));
}
function buildLibrary() {
  const back = document.createElement('div');
  back.className = 'lib-back';
  back.innerHTML =
    '<div class="lib-panel">' +
      '<div class="lib-head"><div><h3>资源库</h3><p>选择图片插入到当前选中的 Column；未选中 Column 时插入到最后一个 Column。</p></div><button type="button" class="lib-close">×</button></div>' +
      '<div class="lib-status"></div>' +
      '<div class="lib-grid"></div>' +
    '</div>';
  document.body.appendChild(back);
  back.querySelector('.lib-close').addEventListener('click', closeLibrary);
  back.addEventListener('click', (event) => { if (event.target === back) closeLibrary(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && back.classList.contains('is-open')) closeLibrary(); });
  return back;
}
let libraryBack = null;
let libraryTarget = null;
function closeLibrary() { if (libraryBack) libraryBack.classList.remove('is-open'); }
async function openLibrary() {
  if (!libraryBack) libraryBack = buildLibrary();
  libraryTarget = editor.getSelected();
  const isImage = !!(libraryTarget && libraryTarget.get('type') === 'mj-image');
  const head = libraryBack.querySelector('.lib-head p');
  if (head) {
    head.textContent = isImage
      ? '当前已选中图片组件，选择资源会直接替换它的 src / alt。'
      : '选择图片插入到当前选中的 Column；未选中 Column 时插入到最后一个 Column。';
  }
  libraryBack.classList.add('is-open');
  const grid = libraryBack.querySelector('.lib-grid');
  const status = libraryBack.querySelector('.lib-status');
  grid.innerHTML = '';
  status.textContent = '加载中…';
  try {
    const resp = await fetch('/mailchimp/api/resources', { headers: { Accept: 'application/json' } });
    const data = await resp.json();
    if (!resp.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + resp.status));
    const items = data.resources || [];
    status.textContent = items.length + ' 个资源';
    grid.innerHTML = items.map((item) => (
      '<button type="button" class="lib-card" data-url="' + escapeAttr(item.url) + '" data-name="' + escapeAttr(item.name) + '" title="' + escapeAttr(item.url) + '">' +
        '<span class="lib-thumb"><img src="' + escapeAttr(item.url) + '" alt="" loading="lazy"></span>' +
        '<span class="lib-name">' + escapeAttr(prettyName(item.name)) + '</span>' +
      '</button>'
    )).join('');
    grid.querySelectorAll('.lib-card').forEach((card) => {
      card.addEventListener('click', () => insertResource({ url: card.getAttribute('data-url'), name: card.getAttribute('data-name') }));
    });
  } catch (err) {
    status.textContent = '资源库加载失败：' + (err.message || err);
  }
}
function insertResource(item) {
  const selected = libraryTarget || editor.getSelected();
  const selectedType = selected ? String(selected.get('type') || '') : '';
  if (selected && selectedType === 'mj-image') {
    selected.set('src', item.url);
    selected.set('alt', prettyName(item.name));
    setStatus('已替换图片：' + item.name);
    closeLibrary();
    return;
  }
  let target = null;
  let current = selected;
  while (current) {
    if (String(current.get('type') || '').indexOf('mj-column') >= 0) { target = current; break; }
    try { current = current.parent(); } catch (err) { current = null; }
  }
  if (!target) {
    const columns = editor.getWrapper().findType('mj-column');
    target = columns.length ? columns[columns.length - 1] : null;
  }
  if (!target) {
    window.alert('请先在画布中添加一个 Section / Column');
    return;
  }
  target.append('<mj-image src="' + escapeAttr(item.url) + '" alt="' + escapeAttr(prettyName(item.name)) + '"></mj-image>');
  setStatus('已插入图片：' + item.name);
  closeLibrary();
}
function compileHtml() {
  const result = mjml2html(exportMjml(), { minify: true });
  return result.html;
}

let editor;
const openLibraryRef = () => openLibrary();

editor = grapesjs.init({
  container: '#gjs',
  height: '100vh',
  width: 'auto',
  fromElement: true,
  storageManager: false,
  plugins: [grapesjsMjml],
  pluginsOpts: {
    [grapesjsMjml]: {
      resetBlocks: false,
      useCustomTheme: true,
    },
  },
});
window.grapesjsEditor = editor;
const blocksButton = editor.Panels.getButton('views', 'open-blocks');
if (blocksButton) blocksButton.set('active', true);
setStatus('编辑器已就绪');

// mj-image 组件设置面板中的「资源库」入口
editor.TraitManager.addType('resource-picker', {
  createInput() {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '从资源库选择图片';
    button.className = 'gjs-btn-prim';
    button.style.cssText = 'width:100%;padding:7px 10px;cursor:pointer;';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openLibraryRef();
    });
    return button;
  },
});

const resourceTrait = { type: 'resource-picker', name: 'resource-library', label: '资源库' };
function ensureImageTrait(component) {
  if (!component || component.get('type') !== 'mj-image') return;
  const traits = component.get('traits');
  const hasTrait = traits && traits.some && traits.some((trait) => trait.get && trait.get('name') === 'resource-library');
  if (!hasTrait) component.addTrait(resourceTrait);
}
editor.on('component:selected', ensureImageTrait);
editor.on('component:add', ensureImageTrait);
editor.getWrapper().findType('mj-image').forEach(ensureImageTrait);

document.getElementById('btn-export-mjml').addEventListener('click', () => {
  download(exportMjml(), 'email.mjml', 'text/plain;charset=utf-8');
});
document.getElementById('btn-export-html').addEventListener('click', () => {
  download(compileHtml(), 'email.html', 'text/html;charset=utf-8');
});
document.getElementById('btn-library').addEventListener('click', openLibrary);
document.getElementById('btn-save-mc').addEventListener('click', async () => {
  const account = accountKey();
  if (!account) { window.alert('请从样例中带账号打开，例如 ?account=afcc88991218'); return; }
  try {
    setStatus('正在保存到 Mailchimp…');
    const html = compileHtml();
    const title = (editor.getHtml().match(/<mj-title>([^<]*)<\/mj-title>/) || [])[1] || 'GrapesJS MJML 模板';
    const resp = await fetch(`/mailchimp/api/accounts/${encodeURIComponent(account)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: title.trim() || 'GrapesJS MJML 模板', html }),
    });
    const data = await resp.json();
    if (!resp.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + resp.status));
    setStatus('已保存 Mailchimp 模板 #' + (data.template?.id || ''));
    window.alert('已保存为 Mailchimp 模板 #' + (data.template?.id || ''));
  } catch (err) {
    setStatus('保存失败');
    window.alert('保存失败：' + (err.message || err));
  }
});
