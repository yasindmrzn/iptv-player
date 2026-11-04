import React, {useCallback, useEffect, useState} from 'react';
import {Alert, AppState, BackHandler, StatusBar, StyleSheet, Text, View} from 'react-native';
import {Pressable} from './src/components/Focusable';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {ContactSheet} from './src/components/ContactSheet';
import {DetailSheet} from './src/components/DetailSheet';
import {FadeIn} from './src/components/FadeIn';
import {SplashScreen} from './src/components/SplashScreen';
import {TopTabs, type TabKey} from './src/components/TopTabs';
import {CatalogScreen} from './src/screens/CatalogScreen';
import {DashboardScreen} from './src/screens/DashboardScreen';
import {FavoritesScreen} from './src/screens/FavoritesScreen';
import {ProfilesScreen, Avatar} from './src/screens/ProfilesScreen';
import {LoginScreen} from './src/screens/LoginScreen';
import {MainScreen} from './src/screens/MainScreen';
import {PlayerScreen} from './src/screens/PlayerScreen';
import {SeriesDetailScreen} from './src/screens/SeriesDetailScreen';
import {episodeUrl, vodUrl} from './src/services/xtream';
import {VideoPlayer} from './src/components/VideoPlayer';
import {useFullscreenStore} from './src/store/useFullscreenStore';
import {runBack} from './src/utils/backStack';
import {useCatalogStore} from './src/store/useCatalogStore';
import {useIptvStore} from './src/store/useIptvStore';
import {brand} from './src/brand';
import {EiffelMark} from './src/components/EiffelMark';
import {colors, fonts} from './src/theme';
import type {Channel, Episode, SeriesItem, VodItem} from './src/types';

type Overlay =
  | {name: 'seriesDetail'; series: SeriesItem}
  | {name: 'player'; channel: Channel; title: string; subtitle?: string};

type Detail = {kind: 'vod'; item: VodItem} | {kind: 'series'; item: SeriesItem};

/** Kapat (güç) simgesi: View ile çizilir, cihaz fontuna bağlı değildir. */
function PowerIcon() {
  return (
    <View style={styles.powerBox}>
      <View style={styles.powerRing} />
      <View style={styles.powerGap} />
      <View style={styles.powerLine} />
    </View>
  );
}

function formatExpiry(ms?: number): string | null {
  if (!ms) {
    return null;
  }
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  const hydrated = useIptvStore(s => s.hydrated);
  const account = useIptvStore(s => s.account);
  const info = useIptvStore(s => s.accountInfo);

  const [tab, setTab] = useState<TabKey>('home');
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const overlay = overlays[overlays.length - 1];
  const fsReq = useFullscreenStore(s => s.req);
  const profileScreen = useIptvStore(s => s.profileScreen);
  const profiles = useIptvStore(s => s.profiles);
  const activeProfileId = useIptvStore(s => s.activeProfileId);
  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const pushOverlay = useCallback((o: Overlay) => setOverlays(s => [...s, o]), []);
  const popOverlay = useCallback(() => setOverlays(s => s.slice(0, -1)), []);

  // Yeni eklenen kanal/film/dizilerin otomatik görünmesi: her açılışta ve
  // uygulama uzun süre arka planda kaldıktan sonra öne gelince listeler sunucudan yeniden çekilir.
  const refreshAll = useCallback(() => {
    void useIptvStore.getState().refreshAccount();
    void useIptvStore.getState().loadLive(true);
    void useCatalogStore.getState().loadCats('vod', true);
    void useCatalogStore.getState().loadCats('series', true);
    void useCatalogStore.getState().loadVod(true);
    void useCatalogStore.getState().loadSeries(true);
  }, []);

  useEffect(() => {
    if (account) {
      refreshAll();
    } else {
      setTab('home');
      setOverlays([]);
      setDetail(null);
    }
  }, [account?.server, account?.username, !!account]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', st => {
      if (st === 'background') {
        leftAt = Date.now();
      } else if (st === 'active' && leftAt && Date.now() - leftAt > 10 * 60 * 1000) {
        leftAt = 0;
        if (useIptvStore.getState().account) {
          refreshAll();
        }
      }
    });
    return () => sub.remove();
  }, [refreshAll]);

  // Android geri tuşu: üst katman → ana sayfa sekmesi → uygulamadan çık
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (runBack()) {
        return true;
      }
      if (useIptvStore.getState().profileScreen && useIptvStore.getState().profilePicked) {
        useIptvStore.getState().setProfileScreen(false);
        return true;
      }
      if (detail) {
        setDetail(null);
        return true;
      }
      if (overlays.length > 0) {
        popOverlay();
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [detail, overlays.length, tab, popOverlay]);

  const openItem = useCallback((kind: 'vod' | 'series', item: VodItem | SeriesItem) => {
    setDetail(kind === 'vod' ? {kind, item: item as VodItem} : {kind, item: item as SeriesItem});
  }, []);

  const openChannel = useCallback((c: Channel) => {
    useIptvStore.getState().selectChannel(c);
    setTab('live');
  }, []);

  const onSheetPrimary = useCallback(() => {
    const acc = useIptvStore.getState().account;
    if (!detail || !acc) {
      return;
    }
    const {addRecent} = useIptvStore.getState();
    setDetail(null);
    if (detail.kind === 'vod') {
      addRecent({kind: 'vod', item: detail.item, ts: Date.now()});
      pushOverlay({
        name: 'player',
        channel: {
          id: `vod-${detail.item.id}`,
          name: detail.item.name,
          url: vodUrl(acc, detail.item),
          group: 'VOD',
        },
        title: detail.item.name,
      });
    } else {
      addRecent({kind: 'series', item: detail.item, ts: Date.now()});
      pushOverlay({name: 'seriesDetail', series: detail.item});
    }
  }, [detail, pushOverlay]);

  const playEpisode = useCallback(
    (e: Episode, s: SeriesItem) => {
      const acc = useIptvStore.getState().account;
      if (!acc) {
        return;
      }
      pushOverlay({
        name: 'player',
        channel: {
          id: `ep-${e.id}`,
          name: `${s.name} - ${e.title}`,
          url: episodeUrl(acc, e),
          group: 'Dizi',
        },
        title: s.name,
        subtitle: `${e.season}. Sezon · ${e.number}. Bölüm — ${e.title}`,
      });
    },
    [pushOverlay],
  );

  const confirmLogout = () =>
    Alert.alert('Çıkış yap', 'Hesaptan çıkış yapılsın mı?', [
      {text: 'Vazgeç', style: 'cancel'},
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          useCatalogStore.getState().reset();
          useIptvStore.getState().logout();
        },
      },
    ]);

  let content: React.ReactNode = null;
  let contentKey = 'login';
  if (hydrated) {
    if (!account) {
      content = <LoginScreen />;
    } else if (profileScreen) {
      contentKey = 'profiles';
      content = <ProfilesScreen />;
    } else if (overlay?.name === 'seriesDetail') {
      contentKey = `series-${overlay.series.id}`;
      content = (
        <SeriesDetailScreen series={overlay.series} onBack={popOverlay} onPlay={playEpisode} />
      );
    } else if (overlay?.name === 'player') {
      contentKey = `player-${overlay.channel.id}`;
      content = (
        <PlayerScreen
          channel={overlay.channel}
          title={overlay.title}
          subtitle={overlay.subtitle}
          onBack={popOverlay}
        />
      );
    } else {
      contentKey = 'shell';
      const expiry = formatExpiry(info?.expiresAt);
      content = (
        <SafeAreaView style={styles.shell} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <EiffelMark height={34} />
              <View>
              <Text style={[styles.logo, brand.name.length > 9 && styles.logoLong]}>{brand.name}</Text>
              {expiry ? <Text style={styles.expiry}>Bitiş · {expiry}</Text> : null}
              </View>
            </View>
            <View style={styles.headerBtns}>
              <Pressable onPress={() => setContactOpen(true)} hitSlop={10} style={styles.logout}>
                <Text style={styles.contactText}>İletişim</Text>
              </Pressable>
              {activeProfile ? (
                <Pressable
                  onPress={() => useIptvStore.getState().setProfileScreen(true)}
                  hitSlop={8}>
                  <Avatar profile={activeProfile} size={32} />
                </Pressable>
              ) : null}
              <Pressable onPress={confirmLogout} hitSlop={10} style={styles.powerBtn}>
                <PowerIcon />
              </Pressable>
            </View>
          </View>
          <TopTabs active={tab} onChange={setTab} />
          <FadeIn key={tab} style={styles.body}>
            {tab === 'home' && (
              <DashboardScreen onOpenItem={openItem} onOpenChannel={openChannel} onTab={setTab} />
            )}
            {tab === 'live' && <MainScreen />}
            {tab === 'vod' && (
              <CatalogScreen mode="vod" onSelect={i => openItem('vod', i as VodItem)} />
            )}
            {tab === 'series' && (
              <CatalogScreen mode="series" onSelect={i => openItem('series', i as SeriesItem)} />
            )}
            {tab === 'favorites' && <FavoritesScreen onOpenChannel={openChannel} />}
          </FadeIn>
          <ContactSheet visible={contactOpen} onClose={() => setContactOpen(false)} />
          <DetailSheet
            visible={!!detail}
            kind={detail?.kind ?? 'vod'}
            item={detail?.item ?? null}
            onClose={() => setDetail(null)}
            onPrimary={onSheetPrimary}
          />
        </SafeAreaView>
      );
    }
  }

  return (
    <SafeAreaProvider style={{backgroundColor: colors.bg}}>
      <StatusBar barStyle="light-content" />
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        <FadeIn key={contentKey} style={{flex: 1}}>
          {content}
        </FadeIn>
      </View>
      {fsReq ? (
        <View style={styles.fsLayer}>
          <VideoPlayer
            channel={fsReq.channel}
            vod={fsReq.vod}
            fullscreenMode
            startAt={fsReq.startAt}
            onExitFullscreen={fsReq.onExit}
          />
        </View>
      ) : null}
      {!splashDone && (
        <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}>
          <SplashScreen onDone={onSplashDone} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fsLayer: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 50, elevation: 50},
  shell: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  logoRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  logoLong: {fontSize: 16, letterSpacing: 3},
  logo: {color: colors.gold, fontSize: 19, fontFamily: fonts.xbold, letterSpacing: 5},
  expiry: {color: colors.textFaint, fontSize: 10, marginTop: 2, letterSpacing: 0.4},
  logout: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  headerBtns: {flexDirection: 'row', alignItems: 'center', gap: 10},
  powerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerBox: {width: 18, height: 18, alignItems: 'center'},
  powerRing: {
    position: 'absolute',
    top: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  powerGap: {position: 'absolute', top: -1, width: 7, height: 6, backgroundColor: colors.surfaceAlt},
  powerLine: {position: 'absolute', top: -1, width: 2, height: 9, borderRadius: 1, backgroundColor: colors.gold},
  contactText: {color: colors.gold, fontSize: 12, fontFamily: fonts.semi},
  body: {flex: 1},
});
