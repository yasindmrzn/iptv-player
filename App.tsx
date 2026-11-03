import React, {useCallback, useEffect, useState} from 'react';
import {BackHandler, StatusBar, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {FadeIn} from './src/components/FadeIn';
import {SplashScreen} from './src/components/SplashScreen';
import {CatalogScreen} from './src/screens/CatalogScreen';
import {HomeScreen} from './src/screens/HomeScreen';
import {LoginScreen} from './src/screens/LoginScreen';
import {MainScreen} from './src/screens/MainScreen';
import {PlayerScreen} from './src/screens/PlayerScreen';
import {SeriesDetailScreen} from './src/screens/SeriesDetailScreen';
import {episodeUrl, vodUrl} from './src/services/xtream';
import {useIptvStore} from './src/store/useIptvStore';
import {colors} from './src/theme';
import type {Channel, Episode, SeriesItem, VodItem} from './src/types';

type Route =
  | {name: 'home'}
  | {name: 'live'}
  | {name: 'vod'}
  | {name: 'series'}
  | {name: 'seriesDetail'; series: SeriesItem}
  | {name: 'player'; channel: Channel; title: string; subtitle?: string};

const HOME: Route = {name: 'home'};

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  const hydrated = useIptvStore(s => s.hydrated);
  const account = useIptvStore(s => s.account);
  const [stack, setStack] = useState<Route[]>([HOME]);
  const route = stack[stack.length - 1];

  const push = useCallback((r: Route) => setStack(s => [...s, r]), []);
  const pop = useCallback(
    () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)),
    [],
  );

  // Çıkış yapılınca yığını sıfırla
  useEffect(() => {
    if (!account) {
      setStack([HOME]);
    }
  }, [account]);

  // Android geri tuşu: önce üst ekrandan çık; ana menüde uygulamadan çıkma
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const playVod = useCallback(
    (v: VodItem) => {
      const acc = useIptvStore.getState().account;
      if (!acc) {
        return;
      }
      push({
        name: 'player',
        channel: {id: `vod-${v.id}`, name: v.name, url: vodUrl(acc, v), group: 'VOD'},
        title: v.name,
      });
    },
    [push],
  );

  const playEpisode = useCallback(
    (e: Episode, s: SeriesItem) => {
      const acc = useIptvStore.getState().account;
      if (!acc) {
        return;
      }
      push({
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
    [push],
  );

  let content: React.ReactNode = null;
  if (hydrated) {
    if (!account) {
      content = <LoginScreen />;
    } else {
      switch (route.name) {
        case 'home':
          content = <HomeScreen onOpen={name => push({name})} />;
          break;
        case 'live':
          content = <MainScreen onBack={pop} />;
          break;
        case 'vod':
          content = (
            <CatalogScreen mode="vod" onBack={pop} onSelect={i => playVod(i as VodItem)} />
          );
          break;
        case 'series':
          content = (
            <CatalogScreen
              mode="series"
              onBack={pop}
              onSelect={i => push({name: 'seriesDetail', series: i as SeriesItem})}
            />
          );
          break;
        case 'seriesDetail':
          content = (
            <SeriesDetailScreen series={route.series} onBack={pop} onPlay={playEpisode} />
          );
          break;
        case 'player':
          content = (
            <PlayerScreen
              channel={route.channel}
              title={route.title}
              subtitle={route.subtitle}
              onBack={pop}
            />
          );
          break;
      }
    }
  }

  return (
    <SafeAreaProvider style={{backgroundColor: colors.bg}}>
      <StatusBar barStyle="light-content" />
      {/* Ekranlar arkada hazırlanır; açılış ekranı üstte oynar */}
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        <FadeIn key={account ? route.name : 'login'} style={{flex: 1}}>
          {content}
        </FadeIn>
      </View>
      {!splashDone && (
        <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}>
          <SplashScreen onDone={onSplashDone} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
