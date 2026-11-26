import { create } from 'zustand';

export type ResourceLibraryTarget = { blockId?: string } | null;

type TResourceLibraryState = {
  open: boolean;
  target: ResourceLibraryTarget;
  openLibrary: (target?: ResourceLibraryTarget) => void;
  closeLibrary: () => void;
};

export const useResourceLibrary = create<TResourceLibraryState>((set) => ({
  open: false,
  target: null,
  openLibrary: (target = null) => set({ open: true, target }),
  closeLibrary: () => set({ open: false, target: null }),
}));
