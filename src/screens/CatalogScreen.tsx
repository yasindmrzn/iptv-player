import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
    Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {PosterCard} from '../components/MediaCard';
import {useCatalogStore} from '../store/useCatalogStore';
import {colors, fonts} from '../theme';
import type {SeriesItem, VodItem} from '../types';

type Item = VodItem | SeriesItem;

type Props = {
  mode: 'vod' | 'series';
  onSelect: (item: Item) => void;
};

const COLS = 3;
const GAP = 10;
const PAD = 12;
const ALL = '__all__';

export function CatalogScreen({mode, onSelect}: Props) {
  const slice = useCatalogStore(s => (mode === 'vod' ? s.vod : s.series));
  const loadVod = useCatalogStore(s => s.loadVod);
  const loadSeries = useCatalogStore(s => s.loadSeries);
  const {width} = useWindowDimensions();

  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const load = useCallback(
    (force = false) => (mode === 'vod' ? loadVod(force) : loadSeries(force)),
    [mode, loadVod, loadSeries],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const items = slice.items as Item[];
  const filtered = useMemo(() => {
    let list = items;
    if (category !== ALL) {
      list = list.filter(i => i.categoryId === category);
    }
    if (debounced) {
      list = list.filter(i => i.name.toLowerCase().includes(debounced));
    }
    return list;
  }, [items, category, debounced]);

  const itemWidth = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

  const renderItem = useCallback(
    ({item}: {item: Item}) => <PosterCard item={item} width={itemWidth} onPress={onSelect} />,
    [itemWidth, onSelect],
  );

  const empty = slice.loading ? (
    <View style={styles.emptyBox}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.emptyText}>{mode === 'vod' ? 'Filmler' : 'Diziler'} yükleniyor…</Text>
    </View>
  ) : slice.error ? (
    <View style={styles.emptyBox}>
      <Text style={styles.errorTitle}>Yüklenemedi</Text>
      <Text style={styles.emptyText}>{slice.error}</Text>
      <Pressable style={styles.retryBtn} onPress={() => void load(true)}>
        <Text style={styles.retryText}>Tekrar dene</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>İçerik bulunamadı.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={mode === 'vod' ? 'Film ara…' : 'Dizi ara…'}
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          <Chip label="Tümü" active={category === ALL} onPress={() => setCategory(ALL)} />
          {slice.cats.map(c => (
            <Chip
              key={c.id}
              label={c.name}
              active={category === c.id}
              onPress={() => setCategory(c.id)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        key={`cols-${COLS}`}
        numColumns={COLS}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        columnWrapperStyle={{gap: GAP}}
        contentContainerStyle={{paddingHorizontal: PAD, paddingTop: 6, paddingBottom: 24}}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={empty}
      />
    </SafeAreaView>
  );
}

function Chip({label, active, onPress}: {label: string; active: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  backText: {color: colors.text, fontSize: 13, fontFamily: fonts.semi},
  title: {color: colors.gold, fontSize: 17, fontFamily: fonts.xbold, letterSpacing: 4},
  searchWrap: {paddingHorizontal: PAD, paddingTop: 6, paddingBottom: 8},
  search: {
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  chipsWrap: {height: 44},
  chips: {paddingHorizontal: PAD, gap: 8, alignItems: 'center'},
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 200,
  },
  chipActive: {backgroundColor: colors.accent},
  chipText: {color: colors.textDim, fontSize: 13, fontFamily: fonts.semi},
  chipTextActive: {color: colors.onAccent},
  poster: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  posterFallback: {color: colors.accent, fontSize: 34, fontFamily: fonts.xbold},
  posterTitle: {color: colors.text, fontSize: 12, fontFamily: fonts.semi, marginTop: 6, lineHeight: 16},
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(7,3,16,0.78)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: {color: colors.gold, fontSize: 10, fontFamily: fonts.bold},
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
