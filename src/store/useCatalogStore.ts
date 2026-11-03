import {create} from 'zustand';

import {
  fetchSeriesCategories,
  fetchSeriesEpisodes,
  fetchSeriesItems,
  fetchVodCategories,
  fetchVodItems,
} from '../services/xtream';
import type {Category, Episode, SeriesItem, VodItem} from '../types';
import {useIptvStore} from './useIptvStore';

type Slice<T> = {
  cats: Category[];
  items: T[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
};

const empty = <T,>(): Slice<T> => ({
  cats: [],
  items: [],
  loading: false,
  error: null,
  loaded: false,
});

type State = {
  vod: Slice<VodItem>;
  series: Slice<SeriesItem>;
  episodes: Record<string, Episode[]>;
  loadVod: (force?: boolean) => Promise<void>;
  loadSeries: (force?: boolean) => Promise<void>;
  loadEpisodes: (seriesId: string) => Promise<Episode[]>;
  reset: () => void;
};

export const useCatalogStore = create<State>((set, get) => ({
  vod: empty<VodItem>(),
  series: empty<SeriesItem>(),
  episodes: {},

  loadVod: async (force = false) => {
    const account = useIptvStore.getState().account;
    const cur = get().vod;
    if (!account || cur.loading || (cur.loaded && !force)) {
      return;
    }
    set({vod: {...cur, loading: true, error: null}});
    try {
      const [cats, items] = await Promise.all([
        fetchVodCategories(account),
        fetchVodItems(account),
      ]);
      set({vod: {cats, items, loading: false, error: null, loaded: true}});
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Filmler yüklenemedi.';
      // Yenileme başarısız olursa eldeki liste korunur
      set({
        vod: cur.loaded
          ? {...cur, loading: false, error: null}
          : {...empty<VodItem>(), error: msg},
      });
    }
  },

  loadSeries: async (force = false) => {
    const account = useIptvStore.getState().account;
    const cur = get().series;
    if (!account || cur.loading || (cur.loaded && !force)) {
      return;
    }
    set({series: {...cur, loading: true, error: null}});
    try {
      const [cats, items] = await Promise.all([
        fetchSeriesCategories(account),
        fetchSeriesItems(account),
      ]);
      set({series: {cats, items, loading: false, error: null, loaded: true}});
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Diziler yüklenemedi.';
      // Yenileme başarısız olursa eldeki liste korunur
      set({
        series: cur.loaded
          ? {...cur, loading: false, error: null}
          : {...empty<SeriesItem>(), error: msg},
      });
    }
  },

  loadEpisodes: async seriesId => {
    const cached = get().episodes[seriesId];
    if (cached) {
      return cached;
    }
    const account = useIptvStore.getState().account;
    if (!account) {
      return [];
    }
    const list = await fetchSeriesEpisodes(account, seriesId);
    set(state => ({episodes: {...state.episodes, [seriesId]: list}}));
    return list;
  },

  reset: () => set({vod: empty<VodItem>(), series: empty<SeriesItem>(), episodes: {}}),
}));
