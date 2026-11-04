import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {Pressable} from '../components/Focusable';
import {SafeAreaView} from 'react-native-safe-area-context';

import {PosterCard} from '../components/MediaCard';
import {useCatalogStore} from '../store/useCatalogStore';
import {colors, fonts} from '../theme';
import {registerBack} from '../utils/backStack';
import type {Category, SeriesItem, VodItem} from '../types';

type Item = VodItem | SeriesItem;

type Props = {
  mode: 'vod' | 'series';
  onSelect: (item: Item) => void;
};

const MIN_COL = 150;
const GAP = 10;
const PAD = 12;
const ALL = '__all__';

/**
 * Televizo tarzı: önce kategori klasörleri (dikey liste), bir klasöre dokununca içeriği
 * poster ızgarası olarak açılır. Yatay kaydırma yok; arama kutusu her iki seviyede çalışır.
 */
export function CatalogScreen({mode, onSelect}: Props) {
  const slice = useCatalogStore(s => (mode === 'vod' ? s.vod : s.series));
  const loadCats = useCatalogStore(s => s.loadCats);
  const loadVod = useCatalogStore(s => s.loadVod);
  const loadSeries = useCatalogStore(s => s.loadSeries);
  const loadCategory = useCatalogStore(s => s.loadCategory);
  const {width} = useWindowDimensions();

  const [open, setOpen] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [catItems, setCatItems] = useState<Item[] | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void loadCats(mode);
    void (mode === 'vod' ? loadVod() : loadSeries());
  }, [mode, loadCats, loadVod, loadSeries]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Klasör açılınca içeriği getir (tüm liste hazırsa yerelden, değilse sunucudan kategori bazlı)
  useEffect(() => {
    if (!open) {
      return;
    }
    let alive = true;
    setCatItems(null);
    setCatError(null);
    const force = attempt > 0;
    const run = open.id === ALL
      ? Promise.resolve().then(async () => {
          await (mode === 'vod' ? loadVod(force) : loadSeries(force));
          return (useCatalogStore.getState()[mode].items as Item[]);
        })
      : loadCategory(mode, open.id, force);
    run
      .then(list => alive && setCatItems(list as Item[]))
      .catch(e => alive && setCatError(e instanceof Error ? e.message : 'Yüklenemedi.'));
    return () => {
      alive = false;
    };
  }, [open, mode, attempt, loadCategory, loadVod, loadSeries]);

  // "Tümü" için tam liste sonradan gelirse güncelle
  useEffect(() => {
    if (open?.id === ALL && slice.loaded) {
      setCatItems(slice.items as Item[]);
    }
  }, [open, slice.loaded, slice.items]);

  // Android geri tuşu: klasörden klasör listesine dön
  useEffect(() => {
    if (!open) {
      return;
    }
    return registerBack(() => {
      setOpen(null);
      setQuery('');
    });
  }, [open]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    if (slice.loaded) {
      (slice.items as Item[]).forEach(i => {
        m[i.categoryId] = (m[i.categoryId] ?? 0) + 1;
      });
    }
    return m;
  }, [slice.items, slice.loaded]);

  const folders = useMemo<Category[]>(() => {
    const all: Category = {id: ALL, name: mode === 'vod' ? 'Tüm Filmler' : 'Tüm Diziler'};
    const list = [all, ...slice.cats];
    return debounced ? list.filter(c => c.name.toLowerCase().includes(debounced)) : list;
  }, [slice.cats, debounced, mode]);

  // Klasör listesindeyken arama: klasör adları + (tam liste hazırsa) içerik eşleşmeleri
  const globalMatches = useMemo(() => {
    if (open || debounced.length < 2 || !slice.loaded) {
      return [];
    }
    return (slice.items as Item[]).filter(i => i.name.toLowerCase().includes(debounced)).slice(0, 60);
  }, [open, debounced, slice.items, slice.loaded]);

  const shown = useMemo(() => {
    const list = catItems ?? [];
    return open && debounced ? list.filter(i => i.name.toLowerCase().includes(debounced)) : list;
  }, [catItems, open, debounced]);

  // Dikey telefonda 3 sütun; yatay (TV) ekranda genişliğe göre daha çok sütun
  const COLS = Math.max(3, Math.floor((width - PAD * 2) / MIN_COL));
  const itemWidth = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const renderPoster = useCallback(
    ({item}: {item: Item}) => <PosterCard item={item} width={itemWidth} onPress={onSelect} />,
    [itemWidth, onSelect],
  );

  const placeholder = open
    ? `${open.name} içinde ara…`
    : mode === 'vod'
      ? 'Film veya kategori ara…'
      : 'Dizi veya kategori ara…';

  const searchBox = (
    <View style={styles.searchWrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );

  // ── Seviye 2: klasör içeriği ───────────────────────────────────────────
  if (open) {
    return (
      <SafeAreaView style={styles.root} edges={[]}>
        <View style={styles.crumb}>
          <Pressable
            onPress={() => {
              setOpen(null);
              setQuery('');
            }}
            hitSlop={10}
            style={styles.crumbBack}>
            <Text style={styles.crumbBackText}>‹ Kategoriler</Text>
          </Pressable>
          <Text style={styles.crumbTitle} numberOfLines={1}>
            {open.name}
          </Text>
        </View>
        {searchBox}
        <FlatList
          data={shown}
          key={`grid-${COLS}`}
          numColumns={COLS}
          keyExtractor={i => i.id}
          renderItem={renderPoster}
          columnWrapperStyle={{gap: GAP}}
          contentContainerStyle={{paddingHorizontal: PAD, paddingTop: 6, paddingBottom: 24}}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            catError ? (
              <Retry text={catError} onPress={() => setAttempt(a => a + 1)} />
            ) : catItems === null ? (
              <Loading text="Yükleniyor…" />
            ) : (
              <Note text="İçerik bulunamadı." />
            )
          }
        />
      </SafeAreaView>
    );
  }

  // ── Seviye 1: kategori klasörleri ──────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={[]}>
      {searchBox}
      <FlatList
        data={folders}
        key="folders"
        keyExtractor={c => c.id}
        contentContainerStyle={styles.folderList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        windowSize={9}
        renderItem={({item}) => (
          <Pressable
            onPress={() => {
              setOpen(item);
              setQuery('');
            }}
            style={({pressed}) => [styles.folder, pressed && styles.folderPressed]}>
            <View style={styles.folderIcon}>
              <Text style={styles.folderGlyph}>{item.id === ALL ? '★' : '▤'}</Text>
            </View>
            <Text style={styles.folderName} numberOfLines={1}>
              {item.name}
            </Text>
            {counts[item.id] || (item.id === ALL && slice.loaded) ? (
              <Text style={styles.folderCount}>
                {item.id === ALL ? slice.items.length : counts[item.id]}
              </Text>
            ) : null}
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={
          globalMatches.length ? (
            <View style={styles.results}>
              <Text style={styles.resultsTitle}>Eşleşen içerikler</Text>
              <View style={styles.resultsGrid}>
                {globalMatches.map(i => (
                  <PosterCard key={i.id} item={i} width={itemWidth} onPress={onSelect} />
                ))}
              </View>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          slice.catsError && !slice.cats.length ? (
            <Retry
              text={slice.catsError}
              onPress={() => {
                void loadCats(mode, true);
              }}
            />
          ) : slice.catsLoading || !slice.catsLoaded ? (
            <Loading text="Kategoriler yükleniyor…" />
          ) : (
            <Note text="Eşleşen kategori yok." />
          )
        }
      />
    </SafeAreaView>
  );
}

function Loading({text}: {text: string}) {
  return (
    <View style={styles.emptyBox}>
      <ActivityIndicator color={colors.gold} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}
function Note({text}: {text: string}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}
function Retry({text, onPress}: {text: string; onPress: () => void}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.errorTitle}>Yüklenemedi</Text>
      <Text style={styles.emptyText}>{text}</Text>
      <Pressable style={styles.retryBtn} onPress={onPress}>
        <Text style={styles.retryText}>Tekrar dene</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  searchWrap: {paddingHorizontal: PAD, paddingTop: 10, paddingBottom: 8},
  search: {
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: PAD,
    paddingTop: 10,
  },
  crumbBack: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  crumbBackText: {color: colors.gold, fontSize: 12, fontFamily: fonts.semi},
  crumbTitle: {flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.xbold},
  folderList: {paddingHorizontal: PAD, paddingBottom: 28, gap: 8},
  folder: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 12,
  },
  folderPressed: {borderColor: colors.gold, backgroundColor: colors.accentSoft},
  folderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderGlyph: {color: colors.gold, fontSize: 16},
  folderName: {flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.semi},
  folderCount: {color: colors.textFaint, fontSize: 12, fontFamily: fonts.semi},
  chev: {color: colors.gold, fontSize: 24, marginTop: -2},
  results: {marginTop: 18},
  resultsTitle: {color: colors.gold, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 1.2, marginBottom: 10},
  resultsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: GAP},
  emptyBox: {alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 10},
  emptyText: {color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20},
  errorTitle: {color: colors.text, fontSize: 16, fontFamily: fonts.bold},
  retryBtn: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {color: colors.onAccent, fontFamily: fonts.bold, fontSize: 14},
});
