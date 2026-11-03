import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useCatalogStore} from '../store/useCatalogStore';
import {colors} from '../theme';
import type {Episode, SeriesItem} from '../types';

type Props = {
  series: SeriesItem;
  onBack: () => void;
  onPlay: (episode: Episode, series: SeriesItem) => void;
};

export function SeriesDetailScreen({series, onBack, onPlay}: Props) {
  const loadEpisodes = useCatalogStore(s => s.loadEpisodes);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setEpisodes(null);
    setError(null);
    loadEpisodes(series.id)
      .then(list => {
        if (!alive) {
          return;
        }
        setEpisodes(list);
        setSeason(list.length ? Math.min(...list.map(e => e.season)) : null);
      })
      .catch(e => {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Bölümler yüklenemedi.');
        }
      });
    return () => {
      alive = false;
    };
  }, [series.id, loadEpisodes, attempt]);

  const seasons = useMemo(
    () => Array.from(new Set((episodes ?? []).map(e => e.season))).sort((a, b) => a - b),
    [episodes],
  );
  const list = useMemo(
    () =>
      (episodes ?? [])
        .filter(e => e.season === season)
        .sort((a, b) => a.number - b.number),
    [episodes, season],
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {series.name}
        </Text>
        <View style={{width: 64}} />
      </View>

      <FlatList
        data={list}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {series.cover ? (
                <Image source={{uri: series.cover}} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Text style={styles.coverLetter}>{series.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.heroText}>
                <Text style={styles.name}>{series.name}</Text>
                {series.rating && Number(series.rating) > 0 ? (
                  <Text style={styles.rating}>★ {Number(series.rating).toFixed(1)}</Text>
                ) : null}
                {series.plot ? (
                  <Text style={styles.plot} numberOfLines={6}>
                    {series.plot}
                  </Text>
                ) : null}
              </View>
            </View>

            {seasons.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.seasons}>
                {seasons.map(s => (
                  <Pressable
                    key={s}
                    onPress={() => setSeason(s)}
                    style={[styles.seasonChip, season === s && styles.seasonChipActive]}>
                    <Text style={[styles.seasonText, season === s && styles.seasonTextActive]}>
                      {s}. Sezon
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() => onPlay(item, series)}
            style={({pressed}) => [styles.episode, pressed && styles.episodePressed]}>
            <View style={styles.epNum}>
              <Text style={styles.epNumText}>{item.number}</Text>
            </View>
            <View style={styles.epInfo}>
              <Text style={styles.epTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.duration ? <Text style={styles.epMeta}>{item.duration}</Text> : null}
            </View>
            <Text style={styles.play}>▶</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            {error ? (
              <>
                <Text style={styles.emptyText}>{error}</Text>
                <Pressable style={styles.retryBtn} onPress={() => setAttempt(a => a + 1)}>
                  <Text style={styles.retryText}>Tekrar dene</Text>
                </Pressable>
              </>
            ) : episodes === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.emptyText}>Bölüm bulunamadı.</Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
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
    gap: 8,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  backText: {color: colors.text, fontSize: 13, fontWeight: '600'},
  headerTitle: {flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center'},
  content: {paddingHorizontal: 14, paddingBottom: 28},
  hero: {flexDirection: 'row', gap: 14, paddingTop: 8, paddingBottom: 16},
  cover: {width: 112, height: 168, borderRadius: 12, backgroundColor: colors.surfaceAlt},
  coverFallback: {alignItems: 'center', justifyContent: 'center'},
  coverLetter: {color: colors.accent, fontSize: 40, fontWeight: '800'},
  heroText: {flex: 1},
  name: {color: colors.text, fontSize: 20, fontWeight: '800'},
  rating: {color: colors.gold, fontSize: 13, fontWeight: '700', marginTop: 6},
  plot: {color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 8},
  seasons: {gap: 8, paddingBottom: 12},
  seasonChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonChipActive: {backgroundColor: colors.accent},
  seasonText: {color: colors.textDim, fontSize: 13, fontWeight: '600'},
  seasonTextActive: {color: '#fff'},
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  episodePressed: {backgroundColor: colors.surfaceAlt},
  epNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epNumText: {color: colors.gold, fontWeight: '800', fontSize: 14},
  epInfo: {flex: 1, marginHorizontal: 12},
  epTitle: {color: colors.text, fontSize: 14, fontWeight: '600'},
  epMeta: {color: colors.textFaint, fontSize: 11, marginTop: 2},
  play: {color: colors.gold, fontSize: 16},
  emptyBox: {alignItems: 'center', paddingTop: 30, gap: 10},
  emptyText: {color: colors.textDim, fontSize: 14, textAlign: 'center'},
  retryBtn: {backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10},
  retryText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
