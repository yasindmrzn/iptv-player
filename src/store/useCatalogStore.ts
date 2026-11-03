import {create} from 'zustand';

import {
  fetchSeriesCategories,
  fetchSeriesEpisodes,
  fetchSeriesItems,
  fetchVodCategories,
  fetchVodItems,
} from '../services/xtream';
import type {Category, Episode, SeriesItem, VodItem} from '../types';
import {withRetry} from '../utils/net';
import {useIptvStore} from './useIptvStore';

type Mode = 'vod' | 'series';
type AnyItem = VodItem | SeriesItem;

/**
 * Her tür (film/dizi) için üç bağımsız parça:
 *  - kategoriler (küçük, hızlı)  → klasör listesi hemen gelir
 *  - kategori içerikleri (isteğe bağlı, kategori başına)  → büyük sunucuda bile hızlı
 *  - tüm liste (arka planda; ana sayfa rafları, arama ve rastgele seçim için)
 * Biri başarısız olsa diğerleri etkilenmez; her istek 3 kez yeniden denenir.
 */
type Slice<T> = {
  cats: Category[];
  catsLoading: boolean;
  catsError: string | null;
  catsLoaded: boolean;
  items: T[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  byCat: Record<string, T[]>;
};

const empty = <T,>(): Slice<T> => ({
  cats: [],
  catsLoading: false,
  catsError: null,
  catsLoaded: false,
  items: [],
  loading: false,
  loaded: false,
  error: null,
  byCat: {},
});

type State = {
  vod: Slice<VodItem>;
  series: Slice<SeriesItem>;
  episodes: Record<string, Episode[]>;
  /** Klasör listesi */
  loadCats: (mode: Mode, force?: boolean) => Promise<void>;
  /** Tüm liste (arka plan) */
  loadVod: (force?: boolean) => Promise<void>;
  loadSeries: (force?: boolean) => Promise<void>;
  /** Tek kategorinin içeriği; tüm liste yüklüyse oradan süzer */
  loadCategory: (mode: Mode, catId: string, force?: boolean) => Promise<AnyItem[]>;
  loadEpisodes: (seriesId: string) => Promise<Episode[]>;
  reset: () => void;
};

const MSG = {
  vod: 'Filmler yüklenemedi.',
  series: 'Diziler yüklenemedi.',
};

export const useCatalogStore = create<State>((set, get) => {
  const patch = (mode: Mode, p: Partial<Slice<AnyItem>>) =>
    set(s => ({[mode]: {...s[mode], ...p}}) as Partial<State>);

  const fetchers = {
    vod: {
      cats: fetchVodCategories,
      items: fetchVodItems as (c: never, id?: string) => Promise<AnyItem[]>,
    },
    series: {
      cats: fetchSeriesCategories,
      items: fetchSeriesItems as (c: never, id?: string) => Promise<AnyItem[]>,
    },
  } as const;

  const loadCats = async (mode: Mode, force = false) => {
    const account = useIptvStore.getState().account;
    const cur = get()[mode];
    if (!account || cur.catsLoading || (cur.catsLoaded && !force)) {
      return;
    }
    patch(mode, {catsLoading: true, catsError: null});
    try {
      const cats = await withRetry(() => fetchers[mode].cats(account));
      patch(mode, {
        cats,
        catsLoading: false,
        catsLoaded: true,
        catsError: null,
        ...(force ? {byCat: {}} : {}),
      });
    } catch (e) {
      patch(mode, {
        catsLoading: false,
        catsError: e instanceof Error ? e.message : MSG[mode],
      });
    }
  };

  const loadAll = async (mode: Mode, force = false) => {
    const account = useIptvStore.getState().account;
    const cur = get()[mode];
    if (!account || cur.loading || (cur.loaded && !force)) {
      return;
    }
    patch(mode, {loading: true, error: null});
    try {
      const items = await withRetry(
        () => (fetchers[mode].items as (c: unknown) => Promise<AnyItem[]>)(account),
        3,
        1500,
      );
      patch(mode, {items, loading: false, loaded: true, error: null});
    } catch (e) {
      // Başarısız olursa eldeki liste korunur; klasörler yine de çalışır
      patch(mode, {loading: false, error: e instanceof Error ? e.message : MSG[mode]});
    }
  };

  return {
    vod: empty<VodItem>(),
    series: empty<SeriesItem>(),
    episodes: {},

    loadCats,
    loadVod: force => loadAll('vod', force),
    loadSeries: force => loadAll('series', force),

    loadCategory: async (mode, catId, force = false) => {
      const account = useIptvStore.getState().account;
      const cur = get()[mode];
      if (!account) {
        return [];
      }
      if (!force && cur.byCat[catId]) {
        return cur.byCat[catId];
      }
      if (!force && cur.loaded) {
        const local = cur.items.filter(i => i.categoryId === catId);
        patch(mode, {byCat: {...cur.byCat, [catId]: local}});
        return local;
      }
      const items = await withRetry(() =>
        (fetchers[mode].items as (c: unknown, id?: string) => Promise<AnyItem[]>)(
          account,
          catId,
        ),
      );
      patch(mode, {byCat: {...get()[mode].byCat, [catId]: items}});
      return items;
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
      const list = await withRetry(() => fetchSeriesEpisodes(account, seriesId), 3, 600);
      set(state => ({episodes: {...state.episodes, [seriesId]: list}}));
      return list;
    },

    reset: () => set({vod: empty<VodItem>(), series: empty<SeriesItem>(), episodes: {}}),
  };
});
