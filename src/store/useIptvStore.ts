import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

import {epgKey, fetchEpg} from '../services/epg';
import {fetchM3U} from '../services/m3uParser';
import {
  fetchXtreamChannels,
  fetchXtreamShortEpg,
  xtreamXmltvUrl,
} from '../services/xtream';
import type {Channel, EpgMap, Source} from '../types';

type State = {
  // ── Kalıcı ──────────────────────────────────────────────
  sources: Source[];
  activeSourceId: string | null;
  favorites: Record<string, true>;
  lastChannelId: string | null;

  // ── Oturum (kalıcı değil) ───────────────────────────────
  channels: Channel[];
  groups: string[];
  epg: EpgMap;
  currentChannel: Channel | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;

  // ── Eylemler ────────────────────────────────────────────
  addSource: (s: Source) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  setActiveSource: (id: string) => Promise<void>;
  loadActiveSource: () => Promise<void>;
  selectChannel: (c: Channel) => void;
  toggleFavorite: (id: string) => void;
  loadChannelEpg: (c: Channel) => Promise<void>;
};

let loadToken = 0;

export const useIptvStore = create<State>()(
  persist(
    (set, get) => ({
      sources: [],
      activeSourceId: null,
      favorites: {},
      lastChannelId: null,

      channels: [],
      groups: [],
      epg: {},
      currentChannel: null,
      loading: false,
      error: null,
      hydrated: false,

      addSource: async s => {
        set(state => ({
          sources: [...state.sources.filter(x => x.id !== s.id), s],
          activeSourceId: s.id,
        }));
        await get().loadActiveSource();
      },

      removeSource: async id => {
        const {sources, activeSourceId} = get();
        const rest = sources.filter(s => s.id !== id);
        const nextActive =
          activeSourceId === id ? rest[0]?.id ?? null : activeSourceId;
        set({sources: rest, activeSourceId: nextActive});
        if (activeSourceId === id) {
          set({channels: [], groups: [], epg: {}, currentChannel: null});
          if (nextActive) {
            await get().loadActiveSource();
          }
        }
      },

      setActiveSource: async id => {
        set({activeSourceId: id});
        await get().loadActiveSource();
      },

      loadActiveSource: async () => {
        const {sources, activeSourceId, lastChannelId} = get();
        const src = sources.find(s => s.id === activeSourceId);
        if (!src) {
          set({channels: [], groups: [], currentChannel: null, loading: false});
          return;
        }

        const token = ++loadToken;
        set({loading: true, error: null, epg: {}});

        try {
          let channels: Channel[];
          let groups: string[];
          let epgUrl: string | undefined;

          if (src.kind === 'm3u') {
            const parsed = await fetchM3U(src.url);
            channels = parsed.channels;
            groups = parsed.groups;
            epgUrl = src.epgUrl || parsed.epgUrls[0];
          } else {
            const res = await fetchXtreamChannels(src.creds);
            channels = res.channels;
            groups = res.groups;
            // Xtream'de kanal başına short-EPG kullanılır (loadChannelEpg);
            // tam XMLTV yalnızca elle istenirse indirilir.
            epgUrl = undefined;
          }

          if (token !== loadToken) {
            return; // daha yeni bir yükleme başladı
          }

          const last = channels.find(c => c.id === lastChannelId) ?? null;
          set({
            channels,
            groups,
            loading: false,
            currentChannel: last,
          });

          if (epgUrl) {
            // Arka planda; arayüzü bekletmez
            const wanted = new Set<string>();
            channels.forEach(c => c.tvgId && wanted.add(epgKey(c.tvgId)));
            fetchEpg(epgUrl, wanted.size ? wanted : undefined)
              .then(epg => {
                if (token === loadToken) {
                  set({epg});
                }
              })
              .catch(() => {
                /* EPG olmadan da çalışır */
              });
          }
        } catch (e) {
          if (token !== loadToken) {
            return;
          }
          set({
            loading: false,
            error: e instanceof Error ? e.message : 'Liste yüklenemedi.',
          });
        }
      },

      selectChannel: c => {
        set({currentChannel: c, lastChannelId: c.id});
        void get().loadChannelEpg(c);
      },

      toggleFavorite: id =>
        set(state => {
          const next = {...state.favorites};
          if (next[id]) {
            delete next[id];
          } else {
            next[id] = true;
          }
          return {favorites: next};
        }),

      loadChannelEpg: async c => {
        const {sources, activeSourceId, epg} = get();
        const src = sources.find(s => s.id === activeSourceId);
        if (!src || src.kind !== 'xtream') {
          return;
        }
        const key = epgKey(c.epgChannelId ?? c.id);
        const cached = epg[key];
        if (cached && cached.some(p => p.stop > Date.now())) {
          return;
        }
        try {
          const list = await fetchXtreamShortEpg(src.creds, c, 6);
          if (list.length) {
            set(state => ({
              epg: {
                ...state.epg,
                [key]: list.map(p => ({...p, channelId: key})),
              },
            }));
          }
        } catch {
          /* sessizce geç */
        }
      },
    }),
    {
      name: 'iptv-player-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({
        sources: s.sources,
        activeSourceId: s.activeSourceId,
        favorites: s.favorites,
        lastChannelId: s.lastChannelId,
      }),
      onRehydrateStorage: () => () => {
        useIptvStore.setState({hydrated: true});
      },
    },
  ),
);

/** Tam XMLTV'yi (Xtream dahil) elle yüklemek için yardımcı. */
export async function loadFullXmltvForActiveSource(): Promise<void> {
  const {sources, activeSourceId, channels} = useIptvStore.getState();
  const src = sources.find(s => s.id === activeSourceId);
  if (!src) {
    return;
  }
  const url =
    src.kind === 'xtream' ? xtreamXmltvUrl(src.creds) : src.epgUrl ?? undefined;
  if (!url) {
    return;
  }
  const wanted = new Set<string>();
  channels.forEach(c => {
    const id = c.tvgId ?? c.epgChannelId;
    if (id) {
      wanted.add(epgKey(id));
    }
  });
  const epg = await fetchEpg(url, wanted.size ? wanted : undefined);
  useIptvStore.setState({epg});
}
