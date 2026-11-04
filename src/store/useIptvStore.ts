import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';

import {brand} from '../brand';
import {epgKey} from '../services/epg';
import {
  fetchXtreamChannels,
  fetchXtreamShortEpg,
  normalizeServer,
  xtreamAuthenticate,
  type XtreamAccountInfo,
} from '../services/xtream';
import type {
  Channel,
  EpgMap,
  Profile,
  ProfileData,
  RecentItem,
  XtreamCredentials,
} from '../types';

type State = {
  // ── Kalıcı ──────────────────────────────────────────────
  account: XtreamCredentials | null;
  favorites: Record<string, true>;
  lastChannelId: string | null;
  /** Son izlenen film/diziler (en yeni başta, en çok 12) */
  recent: RecentItem[];

  /** Profiller: her birinin kendi favorileri ve izleme geçmişi vardır */
  profiles: Profile[];
  activeProfileId: string | null;
  /** Etkin olmayan profillerin kayıtlı verisi (etkin profilinki üstteki alanlarda tutulur) */
  profileData: Record<string, ProfileData>;

  // ── Oturum (kalıcı değil)
  profileScreen: boolean;
  profilePicked: boolean;
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
  addProfile: (name: string, color: string) => string;
  updateProfile: (id: string, name: string, color: string) => void;
  deleteProfile: (id: string) => void;
  switchProfile: (id: string) => void;
  setProfileScreen: (open: boolean) => void;
  loadChannelEpg: (c: Channel) => Promise<void>;
};

let liveToken = 0;

export const PROFILE_COLORS = [
  brand.palette.gold,
  '#E5484D',
  '#3E63DD',
  '#30A46C',
  '#8E4EC6',
  '#F76B15',
  '#12A594',
  '#D6409F',
];

const state0 = (get: () => State) => get().profileData;

export const useIptvStore = create<State>()(
  persist(
    (set, get) => ({
      account: null,
      favorites: {},
      lastChannelId: null,
      recent: [],
      profiles: [],
      activeProfileId: null,
      profileData: {},
      profileScreen: false,
      profilePicked: false,

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
          profileData: Object.fromEntries(
            Object.entries(state0(get)).map(([k, v]) => [k, {...v, recent: []}]),
          ),
          profileScreen: false,
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

      addProfile: (name, color) => {
        const id = `p${Date.now().toString(36)}`;
        set(s => ({
          profiles: [...s.profiles, {id, name: name.trim() || 'Profil', color}].slice(0, 5),
          profileData: {...s.profileData, [id]: {favorites: {}, recent: [], lastChannelId: null}},
        }));
        return id;
      },

      updateProfile: (id, name, color) =>
        set(s => ({
          profiles: s.profiles.map(p =>
            p.id === id ? {...p, name: name.trim() || p.name, color} : p,
          ),
        })),

      switchProfile: id =>
        set(s => {
          if (!s.profiles.some(p => p.id === id)) {
            return {};
          }
          const saved: Record<string, ProfileData> = {...s.profileData};
          if (s.activeProfileId) {
            saved[s.activeProfileId] = {
              favorites: s.favorites,
              recent: s.recent,
              lastChannelId: s.lastChannelId,
            };
          }
          const next = saved[id] ?? {favorites: {}, recent: [], lastChannelId: null};
          return {
            activeProfileId: id,
            profileData: saved,
            favorites: next.favorites,
            recent: next.recent,
            lastChannelId: next.lastChannelId,
            currentChannel: s.channels.find(c => c.id === next.lastChannelId) ?? null,
            profilePicked: true,
            profileScreen: false,
          };
        }),

      deleteProfile: id => {
        const s = get();
        if (s.profiles.length <= 1) {
          return;
        }
        if (s.activeProfileId === id) {
          const other = s.profiles.find(p => p.id !== id)!;
          get().switchProfile(other.id);
        }
        set(st => {
          const data = {...st.profileData};
          delete data[id];
          return {profiles: st.profiles.filter(p => p.id !== id), profileData: data};
        });
      },

      setProfileScreen: open =>
        set(s => ({profileScreen: open, profilePicked: open ? true : s.profilePicked})),

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
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        profileData: s.profileData,
      }),
      onRehydrateStorage: () => () => {
        const s = useIptvStore.getState();
        if (s.profiles.length === 0) {
          // İlk açılış / eski sürümden geçiş: mevcut favoriler ilk profile aktarılır
          useIptvStore.setState({
            profiles: [{id: 'p1', name: 'Profil 1', color: PROFILE_COLORS[0]}],
            activeProfileId: 'p1',
          });
        }
        useIptvStore.setState({
          hydrated: true,
          profileScreen: useIptvStore.getState().profiles.length > 1,
        });
      },
    },
  ),
);
