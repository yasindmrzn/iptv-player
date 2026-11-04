import React, {memo, useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Pressable} from './Focusable';

import {colors, fonts} from '../theme';

export const CAT_ALL = '__all__';
export const CAT_FAV = '__fav__';

type Props = {
  groups: string[];
  selected: string;
  favoriteCount: number;
  /** Grup adı → kanal sayısı (isteğe bağlı) */
  counts?: Record<string, number>;
  total?: number;
  onSelect: (key: string) => void;
};

type Row = {key: string; label: string; count?: number; glyph: string};

/**
 * Yatay kaydırmalı sekmeler yerine Televizo tarzı klasör listesi: geçerli kategori bir
 * çubukta görünür, dokununca tüm kategoriler dikey liste olarak (aramalı) açılır.
 */
function CategoryTabsBase({groups, selected, favoriteCount, counts, total, onSelect}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      {key: CAT_ALL, label: 'Tüm Kanallar', count: total, glyph: '▤'},
      {key: CAT_FAV, label: 'Favoriler', count: favoriteCount, glyph: '★'},
      ...groups.map(g => ({key: g, label: g, count: counts?.[g], glyph: '▤'})),
    ];
    const f = q.trim().toLowerCase();
    return f ? all.filter(r => r.label.toLowerCase().includes(f)) : all;
  }, [groups, counts, total, favoriteCount, q]);

  const current =
    selected === CAT_ALL ? 'Tüm Kanallar' : selected === CAT_FAV ? 'Favoriler' : selected;

  const close = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.bar}>
        <Text style={styles.barGlyph}>{selected === CAT_FAV ? '★' : '▤'}</Text>
        <Text style={styles.barText} numberOfLines={1}>
          {current}
        </Text>
        <Text style={styles.barChev}>Kategoriler ▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>KATEGORİLER</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>Kapat</Text>
            </Pressable>
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Kategori ara…"
            placeholderTextColor={colors.textFaint}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={rows}
            keyExtractor={r => r.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            initialNumToRender={18}
            windowSize={9}
            renderItem={({item}) => {
              const on = item.key === selected;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.key);
                    close();
                  }}
                  style={[styles.row, on && styles.rowOn]}>
                  <Text style={[styles.glyph, on && styles.glyphOn]}>{item.glyph}</Text>
                  <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.count != null ? <Text style={styles.count}>{item.count}</Text> : null}
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Eşleşen kategori yok.</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

export const CategoryTabs = memo(CategoryTabsBase);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  barGlyph: {color: colors.gold, fontSize: 15},
  barText: {flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.semi},
  barChev: {color: colors.gold, fontSize: 12, fontFamily: fonts.semi},
  sheet: {flex: 1, backgroundColor: colors.bg, paddingTop: 16},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {color: colors.gold, fontSize: 15, fontFamily: fonts.xbold, letterSpacing: 4},
  close: {color: colors.text, fontSize: 13, fontFamily: fonts.semi},
  search: {
    height: 42,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  list: {paddingHorizontal: 16, paddingBottom: 30, gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 14,
    gap: 12,
    borderRadius: 16,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  rowOn: {borderColor: colors.gold, backgroundColor: colors.accentSoft},
  glyph: {color: colors.textDim, fontSize: 16, width: 22, textAlign: 'center'},
  glyphOn: {color: colors.gold},
  name: {flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.semi},
  nameOn: {color: colors.goldBright},
  count: {color: colors.textFaint, fontSize: 12, fontFamily: fonts.semi},
  chev: {color: colors.gold, fontSize: 22, marginTop: -2},
  empty: {color: colors.textDim, textAlign: 'center', marginTop: 40},
});
