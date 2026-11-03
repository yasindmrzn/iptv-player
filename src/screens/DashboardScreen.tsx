import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {ChannelCard, PosterCard} from '../components/MediaCard';
import type {TabKey} from '../components/TopTabs';
import {useCatalogStore} from '../store/useCatalogStore';
import {useIptvStore} from '../store/useIptvStore';
import {colors, fonts, goldGlow} from '../theme';
import type {Channel, RecentItem, SeriesItem, VodItem} from '../types';

type Item = VodItem | SeriesItem;
type Opener = (kind: 'vod' | 'series', item: Item) => void;

type Props = {
  onOpenItem: Opener;
  onOpenChannel: (c: Channel) => void;
  onTab: (t: TabKey) => void;
};

type Slide = {key: string; kind: 'vod' | 'series'; item: Item; badge: string};

const PAD = 16;
const FILL = {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0} as const;
const rate = (i: Item) => Number(i.rating) || 0;

export function DashboardScreen({onOpenItem, onOpenChannel, onTab}: Props) {
  const {width} = useWindowDimensions();
  const vod = useCatalogStore(s => s.vod);
  const series = useCatalogStore(s => s.series);
  const loadVod = useCatalogStore(s => s.loadVod);
  const loadSeries = useCatalogStore(s => s.loadSeries);
  const recent = useIptvStore(s => s.recent);
  const favorites = useIptvStore(s => s.favorites);
  const channels = useIptvStore(s => s.channels);
  const loadLive = useIptvStore(s => s.loadLive);

  useEffect(() => {
    void loadVod();
    void loadSeries();
    void loadLive();
  }, [loadVod, loadSeries, loadLive]);

  const topVod = useMemo(
    () => [...vod.items].filter(i => i.cover).sort((a, b) => rate(b) - rate(a)).slice(0, 16),
    [vod.items],
  );
  const topSeries = useMemo(
    () => [...series.items].filter(i => i.cover).sort((a, b) => rate(b) - rate(a)).slice(0, 16),
    [series.items],
  );
  const newest = (items: Item[]) =>
    [...items].filter(i => i.cover && i.added).sort((a, b) => (b.added ?? 0) - (a.added ?? 0)).slice(0, 16);
  const newVod = useMemo(() => newest(vod.items), [vod.items]);
  const newSeries = useMemo(() => newest(series.items), [series.items]);

  const pickRandom = useCallback(() => {
    const pool: {kind: 'vod' | 'series'; item: Item}[] = [
      ...vod.items.filter(i => i.cover).map(item => ({kind: 'vod' as const, item})),
      ...series.items.filter(i => i.cover).map(item => ({kind: 'series' as const, item})),
    ];
    if (pool.length) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      onOpenItem(p.kind, p.item);
    }
  }, [vod.items, series.items, onOpenItem]);

  const favChannels = useMemo(
    () => channels.filter(c => favorites[c.id]).slice(0, 12),
    [channels, favorites],
  );

  // Banner: önce son izlenenler, sonra en yüksek puanlılar (filmler/diziler dönüşümlü)
  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const seen = new Set<string>();
    const add = (kind: 'vod' | 'series', item: Item, badge: string) => {
      const k = `${kind}-${item.id}`;
      if (!item.cover || seen.has(k) || out.length >= 6) {
        return;
      }
      seen.add(k);
      out.push({key: k, kind, item, badge});
    };
    recent.slice(0, 2).forEach((r: RecentItem) => add(r.kind, r.item, 'KALDIĞIN YERDEN'));
    for (let i = 0; i < 6; i++) {
      if (topVod[i]) {
        add('vod', topVod[i], 'ÖNE ÇIKAN FİLM');
      }
      if (topSeries[i]) {
        add('series', topSeries[i], 'ÖNE ÇIKAN DİZİ');
      }
    }
    return out;
  }, [recent, topVod, topSeries]);

  const rowPoster = Math.floor((width - PAD * 2) / 3.3);

  const renderPoster = useCallback(
    (kind: 'vod' | 'series') =>
      ({item}: {item: Item}) => (
        <PosterCard
          item={item}
          width={rowPoster}
          compact
          onPress={i => onOpenItem(kind, i)}
        />
      ),
    [rowPoster, onOpenItem],
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Hero slides={slides} width={width} onOpen={onOpenItem} />

      <Pressable onPress={pickRandom} style={styles.randomBtn}>
        <Text style={styles.randomGlyph}>🎲</Text>
        <Text style={styles.randomText}>RASTGELE SEÇ</Text>
      </Pressable>

      {newVod.length > 0 ? (
        <Shelf title="Son Eklenen Filmler" action="Tümü" onAction={() => onTab('vod')}>
          <FlatList
            horizontal
            data={newVod}
            keyExtractor={i => i.id}
            renderItem={renderPoster('vod')}
            {...shelfProps}
          />
        </Shelf>
      ) : null}

      {newSeries.length > 0 ? (
        <Shelf title="Son Eklenen Diziler" action="Tümü" onAction={() => onTab('series')}>
          <FlatList
            horizontal
            data={newSeries}
            keyExtractor={i => i.id}
            renderItem={renderPoster('series')}
            {...shelfProps}
          />
        </Shelf>
      ) : null}

      {recent.length > 0 ? (
        <Shelf title="Son İzlenenler">
          <FlatList
            horizontal
            data={recent}
            keyExtractor={r => `${r.kind}-${r.item.id}`}
            renderItem={({item: r}) => (
              <PosterCard
                item={r.item}
                width={rowPoster}
                compact
                onPress={i => onOpenItem(r.kind, i)}
              />
            )}
            {...shelfProps}
          />
        </Shelf>
      ) : null}

      {favChannels.length > 0 ? (
        <Shelf title="Favori Kanallar" action="Tümü" onAction={() => onTab('favorites')}>
          <FlatList
            horizontal
            data={favChannels}
            keyExtractor={c => c.id}
            renderItem={({item}) => (
              <ChannelCard channel={item} width={150} onPress={onOpenChannel} />
            )}
            {...shelfProps}
          />
        </Shelf>
      ) : null}

      <Shelf title="Popüler Filmler" action="Tümü" onAction={() => onTab('vod')}>
        <FlatList
          horizontal
          data={topVod}
          keyExtractor={i => i.id}
          renderItem={renderPoster('vod')}
          ListEmptyComponent={<Empty loading={vod.loading} />}
          {...shelfProps}
        />
      </Shelf>

      <Shelf title="Popüler Diziler" action="Tümü" onAction={() => onTab('series')}>
        <FlatList
          horizontal
          data={topSeries}
          keyExtractor={i => i.id}
          renderItem={renderPoster('series')}
          ListEmptyComponent={<Empty loading={series.loading} />}
          {...shelfProps}
        />
      </Shelf>
    </ScrollView>
  );
}

const shelfProps = {
  showsHorizontalScrollIndicator: false,
  contentContainerStyle: {paddingHorizontal: PAD, gap: 12, paddingVertical: 10},
  initialNumToRender: 5,
  windowSize: 5,
  removeClippedSubviews: true,
} as const;

function Empty({loading}: {loading: boolean}) {
  return (
    <Text style={styles.empty}>{loading ? 'Yükleniyor…' : 'İçerik bulunamadı.'}</Text>
  );
}

function Shelf({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHead}>
        <Text style={styles.shelfTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.shelfAction}>{action} ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Yatay kaydırılabilir "Öne Çıkanlar" bannerı: 5 sn'de bir otomatik ilerler. */
function Hero({
  slides,
  width,
  onOpen,
}: {
  slides: Slide[];
  width: number;
  onOpen: Opener;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const touching = useRef(false);
  const cardW = width - PAD * 2;
  const step = cardW + 12;
  const cardH = Math.round(cardW * 0.62);

  useEffect(() => {
    if (slides.length < 2) {
      return;
    }
    const t = setInterval(() => {
      if (touching.current) {
        return;
      }
      setIndex(cur => {
        const next = (cur + 1) % slides.length;
        listRef.current?.scrollToOffset({offset: next * step, animated: true});
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [slides.length, step]);

  if (!slides.length) {
    return <View style={[styles.heroSkeleton, {height: cardH, marginHorizontal: PAD}]} />;
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        horizontal
        data={slides}
        keyExtractor={s => s.key}
        snapToInterval={step}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{paddingHorizontal: PAD, gap: 12}}
        onScrollBeginDrag={() => {
          touching.current = true;
        }}
        onMomentumScrollEnd={e => {
          touching.current = false;
          setIndex(Math.round(e.nativeEvent.contentOffset.x / step));
        }}
        renderItem={({item}) => (
          <Pressable onPress={() => onOpen(item.kind, item.item)}>
            <View style={[styles.hero, {width: cardW, height: cardH}, goldGlow]}>
              <Image
                source={{uri: item.item.cover}}
                style={FILL}
                blurRadius={22}
                resizeMode="cover"
              />
              <View style={styles.heroShade} />
              <Image
                source={{uri: item.item.cover}}
                style={[styles.heroPoster, {height: cardH - 28, width: (cardH - 28) / 1.5}]}
                resizeMode="cover"
              />
              <View style={styles.heroText}>
                <Text style={styles.heroBadge}>{item.badge}</Text>
                <Text style={styles.heroTitle} numberOfLines={3}>
                  {item.item.name}
                </Text>
                {rate(item.item) > 0 ? (
                  <Text style={styles.heroRating}>★ {rate(item.item).toFixed(1)}</Text>
                ) : null}
                <View style={styles.heroBtn}>
                  <Text style={styles.heroBtnText}>DETAYLAR</Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}
      />
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {paddingTop: 16, paddingBottom: 32},
  hero: {
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surface,
  },
  heroSkeleton: {borderRadius: 22, backgroundColor: colors.surface},
  heroShade: {...FILL, backgroundColor: 'rgba(11,11,11,0.62)'},
  heroPoster: {borderRadius: 12, borderWidth: 1, borderColor: colors.glassBorder},
  heroText: {flex: 1, justifyContent: 'center'},
  heroBadge: {color: colors.gold, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.8},
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.xbold,
    lineHeight: 25,
    marginTop: 6,
  },
  heroRating: {color: colors.goldBright, fontSize: 12, fontFamily: fonts.bold, marginTop: 8},
  heroBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.gold,
  },
  heroBtnText: {color: colors.onAccent, fontSize: 11, fontFamily: fonts.xbold, letterSpacing: 1.4},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border},
  dotOn: {width: 20, backgroundColor: colors.gold},
  randomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    marginHorizontal: PAD,
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  randomGlyph: {fontSize: 18},
  randomText: {color: colors.gold, fontSize: 13, fontFamily: fonts.xbold, letterSpacing: 2.5},
  shelf: {marginTop: 22},
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
  },
  shelfTitle: {color: colors.text, fontSize: 17, fontFamily: fonts.xbold, letterSpacing: 0.3},
  shelfAction: {color: colors.gold, fontSize: 12, fontFamily: fonts.semi},
  empty: {color: colors.textFaint, fontSize: 13, paddingVertical: 20},
});
