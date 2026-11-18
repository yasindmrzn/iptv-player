import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

import {useIptvStore} from './useIptvStore';

export type Progress = {pos: number; dur: number; ts: number};

type State = {
  items: Record<string, Progress>;
  save: (channelId: string, pos: number, dur: number) => void;
};

const MAX_ITEMS = 400;

/** Profil + içerik anahtarı: her profilin izleme konumu ayrı tutulur. */
export const progressKey = (channelId: string): string =>
  `${useIptvStore.getState().activeProfileId ?? 'p'}|${channelId}`;

export const useProgressStore = create<State>()(
  persist(
    set => ({
      items: {},
      save: (channelId, pos, dur) =>
        set(s => {
          const key = progressKey(channelId);
          const items = {...s.items, [key]: {pos, dur, ts: Date.now()}};
          const keys = Object.keys(items);
          if (keys.length > MAX_ITEMS) {
            keys
              .sort((a, b) => items[a].ts - items[b].ts)
              .slice(0, keys.length - MAX_ITEMS)
              .forEach(k => delete items[k]);
          }
          return {items};
        }),
    }),
    {name: 'progress-v1', storage: createJSONStorage(() => AsyncStorage)},
  ),
);

/** İzlenme oranı 0..1 (yoksa undefined). */
export function watchedFraction(p?: Progress): number | undefined {
  return p && p.dur > 0 ? Math.min(1, p.pos / p.dur) : undefined;
}

export const isWatched = (p?: Progress): boolean => (watchedFraction(p) ?? 0) >= 0.9;

/** Kaldığı yerden devam saniyesi (başı/sonu hariç), yoksa 0. */
export function resumeAt(channelId: string): number {
  const p = useProgressStore.getState().items[progressKey(channelId)];
  return p && p.pos > 15 && p.dur > 0 && p.pos < p.dur * 0.92 ? p.pos : 0;
}
