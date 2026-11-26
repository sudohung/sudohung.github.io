import React, { useRef, useState } from 'react';
import { Editor } from '@maily-to/core';
import { render } from '@maily-to/render';
import '@maily-to/core/style.css';
import './app.css';
import ResourceLibrary from './ResourceLibrary.jsx';

const IMAGE_NODE_TYPES = ['image', 'logo', 'inlineImage'];
const INITIAL_CONTENT = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Maily 邮件编辑器' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Notion 风格的块编辑体验。输入 / 可以插入标题、图片、按钮、分栏等区块。' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '在样例中可以直接导出 HTML，或保存为 Mailchimp 模板。' }] },
  ],
};

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const editorRef = useRef(null);
  const [json, setJson] = useState(INITIAL_CONTENT);
  const [status, setStatus] = useState('编辑器已就绪');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState('insert');
  const [imageSelected, setImageSelected] = useState(false);
  const targetRef = useRef(null);
  const account = new URLSearchParams(window.location.search).get('account') || '';

  const handleUpdate = (editor) => {
    editorRef.current = editor;
    window.mailyEditor = editor;
    setJson(editor.getJSON());
  };

  const findImageTarget = (editor) => {
    if (!editor) return null;
    const selection = editor.state.selection;
    const node = selection.node;
    if (node && IMAGE_NODE_TYPES.includes(node.type.name)) {
      return { type: node.type.name, pos: selection.from, attrs: { ...node.attrs } };
    }
    // inlineImage 这类行内节点不会产生 NodeSelection，用 isActive + nodeAt 定位。
    for (const type of IMAGE_NODE_TYPES) {
      if (!editor.isActive(type)) continue;
      for (let pos = selection.from; pos <= selection.to; pos += 1) {
        const candidate = editor.state.doc.nodeAt(pos);
        if (candidate && candidate.type.name === type) {
          return { type, pos, attrs: { ...candidate.attrs } };
        }
      }
    }
    return null;
  };

  const bindEditor = (editor) => {
    editorRef.current = editor;
    window.mailyEditor = editor;
    const updateSelection = () => {
      setImageSelected(!!findImageTarget(editor));
    };
    editor.on('selectionUpdate', updateSelection);
    updateSelection();
  };

  const captureImageTarget = () => findImageTarget(editorRef.current);

  const openLibrary = () => {
    const target = captureImageTarget();
    targetRef.current = target;
    setLibraryMode(target ? 'replace' : 'insert');
    setLibraryOpen(true);
  };

  const exportHtml = async () => {
    const html = await render(json, { preview: 'Maily 邮件样例' });
    download(html, 'maily-email.html', 'text/html;charset=utf-8');
    return html;
  };

  const saveToMailchimp = async () => {
    if (!account) {
      window.alert('请从样例中带账号打开，例如 ?account=afcc88991218');
      return;
    }
    try {
      setStatus('正在渲染并保存…');
      const html = await render(json, { preview: 'Maily 邮件样例' });
      const resp = await fetch(`/mailchimp/api/accounts/${encodeURIComponent(account)}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Maily 模板 ' + new Date().toISOString().slice(0, 16).replace('T', ' '), html }),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + resp.status));
      setStatus('已保存 Mailchimp 模板 #' + (data.template?.id || ''));
      window.alert('已保存为 Mailchimp 模板 #' + (data.template?.id || ''));
    } catch (err) {
      setStatus('保存失败');
      window.alert('保存失败：' + (err.message || err));
    }
  };

  return (
    <div className="maily-app">
      <header className="maily-toolbar">
        <span className="maily-brand">Maily</span>
        <button type="button" onClick={exportHtml}>导出 HTML</button>
        <button type="button" onClick={() => download(JSON.stringify(json, null, 2), 'maily-content.json', 'application/json')}>导出 JSON</button>
        <button
          type="button"
          title={imageSelected ? '替换当前选中的图片' : '从资源库插入图片'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openLibrary}
        >
          {imageSelected ? '替换图片' : '资源库'}
        </button>
        {account ? <button type="button" onClick={saveToMailchimp}>保存为 Mailchimp 模板</button> : null}
        <span className="maily-status">{status}</span>
      </header>
      <main className="maily-editor">
        <Editor
          contentJson={INITIAL_CONTENT}
          onCreate={bindEditor}
          onUpdate={handleUpdate}
          config={{ hasMenuBar: true, spellCheck: true, immediatelyRender: true }}
        />
      </main>
      <ResourceLibrary
        open={libraryOpen}
        mode={libraryMode}
        onClose={() => setLibraryOpen(false)}
        onSelect={(item) => {
          const editor = editorRef.current;
          if (!editor) { window.alert('编辑器尚未就绪'); return; }
          const alt = String(item.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
          const target = targetRef.current;
          if (target) {
            const nextAttrs = { ...target.attrs, src: item.url };
            if (Object.prototype.hasOwnProperty.call(target.attrs, 'alt')) nextAttrs.alt = alt;
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(target.pos, undefined, nextAttrs);
              return true;
            }).run();
            setStatus('已替换资源：' + item.name);
          } else {
            editor.chain().focus().setImage({ src: item.url, alt }).run();
            setStatus('已插入资源：' + item.name);
          }
          targetRef.current = null;
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}
