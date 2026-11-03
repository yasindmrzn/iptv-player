import {create} from 'zustand';

import type {Channel} from '../types';

export type FullscreenRequest = {
  channel: Channel;
  vod: boolean;
  startAt: number;
  /** Tam ekrandan çıkarken çağrılır (kalınan saniye ile) */
  onExit: (positionSec: number) => void;
};

type State = {
  req: FullscreenRequest | null;
  open: (r: FullscreenRequest) => void;
  close: () => void;
};

/** Tam ekran oynatıcı, çentik/sistem çubukları sorunsuz olsun diye Dialog yerine App kökünde çizilir. */
export const useFullscreenStore = create<State>(set => ({
  req: null,
  open: req => set({req}),
  close: () => set({req: null}),
}));
