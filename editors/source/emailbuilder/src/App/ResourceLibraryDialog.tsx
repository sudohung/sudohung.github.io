import React, { useEffect, useState } from 'react';

import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

import {
  setDocument,
  setSelectedBlockId,
  useDocument,
} from '../documents/editor/EditorContext';
import { useResourceLibrary } from '../documents/editor/ResourceLibraryContext';

type Resource = { url: string; name: string; kind?: string };

function prettyName(name: string) {
  return String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

export default function ResourceLibraryDialog() {
  const document = useDocument();
  const { open, target, closeLibrary } = useResourceLibrary();
  const [items, setItems] = useState<Resource[]>([]);
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

  const handleSelect = (item: Resource) => {
    if (target?.blockId) {
      const block = document[target.blockId];
      if (block && block.type === 'Image') {
        setDocument({
          [target.blockId]: {
            ...block,
            data: {
              ...block.data,
              props: {
                ...block.data.props,
                url: item.url,
                alt: prettyName(item.name),
              },
            },
          },
        } as any);
        setSelectedBlockId(target.blockId);
      }
    } else {
      const id = `block-${Date.now()}`;
      const root = document.root;
      const childrenIds = [...(root.data.childrenIds || []), id];
      setDocument({
        ...document,
        root: { ...root, data: { ...root.data, childrenIds } },
        [id]: {
          type: 'Image',
          data: {
            style: { padding: { top: 16, bottom: 16, right: 24, left: 24 } },
            props: {
              url: item.url,
              alt: prettyName(item.name),
              contentAlignment: 'middle',
            },
          },
        },
      } as any);
      setSelectedBlockId(id);
    }
    closeLibrary();
  };

  return (
    <Dialog open={open} onClose={closeLibrary} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        资源库
        <Typography variant="body2" color="text.secondary">
          {target?.blockId ? '选择图片会直接替换当前 Image 组件。' : '选择图片后会追加到邮件底部，可在右侧面板继续调整。'}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
        ) : null}
        {error ? <Typography color="error" variant="body2">{error}</Typography> : null}
        {!loading && !error ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 1.5 }}>
            {items.map((item) => (
              <Box
                key={item.url}
                component="button"
                type="button"
                onClick={() => handleSelect(item)}
                title={item.url}
                sx={{
                  p: 0.75,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                  cursor: 'pointer',
                  textAlign: 'left',
                  '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                }}
              >
                <Box sx={{ aspectRatio: '16 / 9', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.100' }}>
                  <img src={item.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </Box>
                <Typography variant="caption" noWrap display="block" sx={{ mt: 0.75 }}>
                  {prettyName(item.name)}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">暂无资源</Typography>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
