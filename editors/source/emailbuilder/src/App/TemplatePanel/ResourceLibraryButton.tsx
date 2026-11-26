import React from 'react';

import { PhotoLibraryOutlined } from '@mui/icons-material';
import { Button } from '@mui/material';

import { useResourceLibrary } from '../../documents/editor/ResourceLibraryContext';

export default function ResourceLibraryButton() {
  const openLibrary = useResourceLibrary((state) => state.openLibrary);

  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={<PhotoLibraryOutlined />}
      onClick={() => openLibrary(null)}
      sx={{ textTransform: 'none' }}
    >
      资源库
    </Button>
  );
}
