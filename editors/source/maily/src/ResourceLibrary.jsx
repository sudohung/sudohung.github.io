import React, { useEffect, useState } from 'react';

function prettyName(name) {
  return String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

export default function ResourceLibrary({ open, mode = 'insert', onClose, onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError('');
    fetch('/mailchimp/api/resources', { headers: { Accept: 'application/json' } })
      .then((resp) => resp.json())
      .then((data) => {
        if (!alive) return;
        if (!data || data.ok === false) throw new Error((data && data.error) || '资源库加载失败');
        setItems(data.resources || []);
      })
      .catch((err) => { if (alive) setError(err.message || String(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="maily-rl-back" onClick={onClose}>
      <div className="maily-rl-panel" onClick={(event) => event.stopPropagation()}>
        <div className="maily-rl-head">
          <div>
            <h3>资源库</h3>
            <p>{mode === 'replace' ? '当前已选中图片，选择资源会直接替换它。' : '从模拟资源库选择图片，插入到当前光标位置。'}</p>
          </div>
          <button type="button" className="maily-rl-close" onClick={onClose}>×</button>
        </div>
        {loading ? <div className="maily-rl-empty">加载中…</div> : null}
        {error ? <div className="maily-rl-error">{error}</div> : null}
        <div className="maily-rl-grid">
          {items.map((item) => (
            <button key={item.url} type="button" className="maily-rl-card" title={item.url} onClick={() => onSelect(item)}>
              <span className="maily-rl-thumb"><img src={item.url} alt="" loading="lazy" /></span>
              <span className="maily-rl-name">{prettyName(item.name)}</span>
            </button>
          ))}
        </div>
        {!loading && !error && items.length === 0 ? <div className="maily-rl-empty">暂无资源</div> : null}
      </div>
    </div>
  );
}
