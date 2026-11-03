import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

import {epgKey} from '../services/epg';
import {
  fetchXtreamChannels,
  fetchXtreamShortEpg,
  normalizeServer,
  xtreamAuthenticate,
  type XtreamAccountInfo,
} from '../services/xtream';
import type {Channel, EpgMap, RecentItem, XtreamCredentials} from '../types';

type State = {
  // ── Kalıcı ──────────────────────────────────────────────
  account: XtreamCredentials | null;
  favorites: Record<string, true>;
  lastChannelId: string | null;
  /** Son izlenen film/diziler (en yeni başta, en çok 12) */
  recent: RecentItem[];

  // ── Oturum (kalıcı değil) ───────────────────────────────
  accountInfo: XtreamAccountInfo | null;
  channels: Channel[];
  groups: string[];
  epg: EpgMap;
  currentChannel: Channel | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;

  // ── Eylemler ────────────────────────────────────────────
  /** Doğrular ve kaydeder; hatalı girişte Error fırlatır. */
  login: (creds: XtreamCredentials) => Promise<void>;
  logout: () => void;
  /** Kayıtlı hesabın bilgilerini (bitiş tarihi vb.) sessizce yeniler. */
  refreshAccount: () => Promise<void>;
  loadLive: (force?: boolean) => Promise<void>;
  selectChannel: (c: Channel) => void;
  toggleFavorite: (id: string) => void;
  addRecent: (r: RecentItem) => void;
  loadChannelEpg: (c: Channel) => Promise<void>;
};

let liveToken = 0;

export const useIptvStore = create<State>()(
  persist(
    (set, get) => ({
      account: null,
      favorites: {},
      lastChannelId: null,
      recent: [],

      accountInfo: null,
      channels: [],
      groups: [],
      epg: {},
      currentChannel: null,
      loading: false,
      error: null,
      hydrated: false,

      login: async creds => {
        const clean: XtreamCredentials = {
          server: normalizeServer(creds.server),
          username: creds.username.trim(),
          password: creds.password,
        };
        const info = await xtreamAuthenticate(clean);
        liveToken++; // süren eski yüklemeleri geçersiz kıl
        set({
          account: clean,
          accountInfo: info,
          channels: [],
          groups: [],
          epg: {},
          currentChannel: null,
          error: null,
        });
      },

      logout: () => {
        liveToken++;
        set({
          account: null,
          accountInfo: null,
          channels: [],
          groups: [],
          epg: {},
          currentChannel: null,
          lastChannelId: null,
          recent: [],
          error: null,
          loading: false,
        });
      },

      refreshAccount: async () => {
        const {account} = get();
        if (!account) {
          return;
        }
        try {
          const info = await xtreamAuthenticate(account);
          set({accountInfo: info});
        } catch {
          /* çevrimdışı olabilir; mevcut bilgiyle devam */
        }
      },

      loadLive: async (force = false) => {
        const {account, channels, lastChannelId} = get();
        if (!account || (!force && channels.length > 0)) {
          return;
        }
        const token = ++liveToken;
        set({loading: true, error: null});
        try {
          const res = await fetchXtreamChannels(account);
          if (token !== liveToken) {
            return;
          }
          set({
            channels: res.channels,
            groups: res.groups,
            loading: false,
            currentChannel:
              res.channels.find(c => c.id === lastChannelId) ?? get().currentChannel,
          });
        } catch (e) {
          if (token !== liveToken) {
            return;
          }
          set({
            loading: false,
            error: e instanceof Error ? e.message : 'Kanallar yüklenemedi.',
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

      addRecent: r =>
        set(state => ({
          recent: [
            r,
            ...state.recent.filter(x => !(x.kind === r.kind && x.item.id === r.item.id)),
          ].slice(0, 12),
        })),

      loadChannelEpg: async c => {
        const {account, epg} = get();
        if (!account) {
          return;
        }
        const key = epgKey(c.epgChannelId ?? c.id);
        const cached = epg[key];
        if (cached && cached.some(p => p.stop > Date.now())) {
          return;
        }
        try {
          const list = await fetchXtreamShortEpg(account, c, 6);
          if (list.length) {
            set(state => ({
              epg: {...state.epg, [key]: list.map(p => ({...p, channelId: key}))},
            }));
          }
        } catch {
          /* sessizce geç */
        }
      },
    }),
    {
      name: 'pashaplay-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({
        account: s.account,
        favorites: s.favorites,
        lastChannelId: s.lastChannelId,
        recent: s.recent,
      }),
      onRehydrateStorage: () => () => {
        useIptvStore.setState({hydrated: true});
      },
    },
  ),
);
