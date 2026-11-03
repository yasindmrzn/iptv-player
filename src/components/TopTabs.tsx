import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {colors, fonts} from '../theme';

export type TabKey = 'home' | 'live' | 'vod' | 'series' | 'favorites';

const TABS: {key: TabKey; label: string}[] = [
  {key: 'home', label: 'Ana Sayfa'},
  {key: 'live', label: 'Canlı'},
  {key: 'vod', label: 'Filmler'},
  {key: 'series', label: 'Diziler'},
  {key: 'favorites', label: 'Favoriler'},
];

type Props = {active: TabKey; onChange: (k: TabKey) => void};

/** Minimalist üst sekmeler: etkin sekme altın, altında neon çizgi. */
export function TopTabs({active, onChange}: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {TABS.map(t => {
          const on = t.key === active;
          return (
            <Pressable key={t.key} onPress={() => onChange(t.key)} style={styles.tab} hitSlop={6}>
              <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
              <View style={[styles.line, on && styles.lineOn]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border},
  row: {paddingHorizontal: 16, gap: 22},
  tab: {paddingTop: 10, alignItems: 'center'},
  label: {color: colors.textFaint, fontSize: 14, fontFamily: fonts.semi, letterSpacing: 0.3},
  labelOn: {color: colors.gold},
  line: {height: 2, width: '100%', marginTop: 8, borderRadius: 1, backgroundColor: 'transparent'},
  lineOn: {
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 0},
    elevation: 4,
  },
});
