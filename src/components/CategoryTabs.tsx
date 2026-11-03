import React, {memo, useCallback} from 'react';
import {FlatList, Pressable, StyleSheet, Text} from 'react-native';

import {colors, fonts} from '../theme';

export const CAT_ALL = '__all__';
export const CAT_FAV = '__fav__';

type Props = {
  groups: string[];
  selected: string;
  favoriteCount: number;
  onSelect: (key: string) => void;
};

type Tab = {key: string; label: string};

function CategoryTabsBase({groups, selected, favoriteCount, onSelect}: Props) {
  const data: Tab[] = [
    {key: CAT_ALL, label: 'Tümü'},
    {key: CAT_FAV, label: `★ Favoriler${favoriteCount ? ` (${favoriteCount})` : ''}`},
    ...groups.map(g => ({key: g, label: g})),
  ];

  const renderItem = useCallback(
    ({item}: {item: Tab}) => {
      const active = item.key === selected;
      return (
        <Pressable
          onPress={() => onSelect(item.key)}
          style={[styles.chip, active && styles.chipActive]}>
          <Text
            style={[styles.chipText, active && styles.chipTextActive]}
            numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [selected, onSelect],
  );

  return (
    <FlatList
      horizontal
      data={data}
      extraData={selected}
      keyExtractor={t => t.key}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.list}
      initialNumToRender={10}
      windowSize={5}
    />
  );
}

export const CategoryTabs = memo(CategoryTabsBase);

const styles = StyleSheet.create({
  list: {flexGrow: 0},
  content: {paddingHorizontal: 12, gap: 8, alignItems: 'center'},
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    maxWidth: 220,
  },
  chipActive: {backgroundColor: colors.accent},
  chipText: {color: colors.textDim, fontSize: 13, fontFamily: fonts.semi},
  chipTextActive: {color: '#fff'},
});
