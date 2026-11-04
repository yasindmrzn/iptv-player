import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Pressable} from './Focusable';

import {fetchVodDetails, trailerUrl} from '../services/xtream';
import {useIptvStore} from '../store/useIptvStore';
import {colors, fonts, goldGlow} from '../theme';
import type {SeriesItem, VodDetails, VodItem} from '../types';

type Props = {
  visible: boolean;
  kind: 'vod' | 'series';
  item: VodItem | SeriesItem | null;
  onClose: () => void;
  /** Film: oynat · Dizi: bölümleri aç */
  onPrimary: () => void;
};

/**
 * Film/dizi ayrıntı kartı (alt sayfa). Cam efekti: posterin bulanık (blurRadius) kopyası
 * koyu bir örtüyle kaplanır. Puan, özet, tür ve fragman bağlantısı gösterilir.
 */
export function DetailSheet({visible, kind, item, onClose, onPrimary}: Props) {
  const account = useIptvStore(s => s.account);
  const [details, setDetails] = useState<VodDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDetails(null);
    if (!visible || !item || kind !== 'vod' || !account) {
      return;
    }
    let alive = true;
    setLoading(true);
    fetchVodDetails(account, item.id)
      .then(d => alive && setDetails(d))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [visible, item, kind, account]);

  if (!item) {
    return null;
  }

  const rating = Number(details?.rating ?? item.rating);
  const plot = details?.plot ?? (kind === 'series' ? (item as SeriesItem).plot : undefined);
  const meta = [details?.year, details?.genre, details?.duration].filter(Boolean).join(' · ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {item.cover ? (
          <Image source={{uri: item.cover}} style={styles.blurBg} blurRadius={28} resizeMode="cover" />
        ) : null}
        <View style={styles.overlay} />
        <View style={styles.grab} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            {item.cover ? (
              <Image source={{uri: item.cover}} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Text style={styles.letter}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.titleBox}>
              <Text style={styles.title} numberOfLines={4}>
                {item.name}
              </Text>
              {rating > 0 ? (
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingText}>IMDb ★ {rating.toFixed(1)}</Text>
                </View>
              ) : null}
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </View>
          </View>

          {loading ? <ActivityIndicator color={colors.gold} style={{marginVertical: 14}} /> : null}

          {plot ? <Text style={styles.plot}>{plot}</Text> : null}
          {details?.director ? (
            <Text style={styles.credit}>
              <Text style={styles.creditKey}>Yönetmen  </Text>
              {details.director}
            </Text>
          ) : null}
          {details?.cast ? (
            <Text style={styles.credit} numberOfLines={3}>
              <Text style={styles.creditKey}>Oyuncular  </Text>
              {details.cast}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={onPrimary} style={[styles.primary, goldGlow]}>
              <Text style={styles.primaryText}>
                {kind === 'vod' ? '▶  OYNAT' : '▶  BÖLÜMLER'}
              </Text>
            </Pressable>
            {details?.trailer ? (
              <Pressable
                onPress={() => void Linking.openURL(trailerUrl(details.trailer as string))}
                style={styles.secondary}>
                <Text style={styles.secondaryText}>Fragman</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
  },
  blurBg: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.9},
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,11,11,0.80)',
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassBorder,
    marginTop: 10,
  },
  content: {padding: 20, paddingBottom: 32},
  top: {flexDirection: 'row', gap: 16},
  cover: {width: 112, height: 168, borderRadius: 14, backgroundColor: colors.surfaceAlt},
  coverFallback: {alignItems: 'center', justifyContent: 'center'},
  letter: {color: colors.gold, fontSize: 40, fontFamily: fonts.xbold},
  titleBox: {flex: 1, justifyContent: 'flex-end'},
  title: {color: colors.text, fontSize: 21, fontFamily: fonts.xbold, lineHeight: 27},
  ratingPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  ratingText: {color: colors.goldBright, fontSize: 12, fontFamily: fonts.bold},
  meta: {color: colors.textDim, fontSize: 12, marginTop: 8},
  plot: {color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 18, opacity: 0.9},
  credit: {color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 10},
  creditKey: {color: colors.gold, fontFamily: fonts.semi},
  actions: {flexDirection: 'row', gap: 12, marginTop: 24},
  primary: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {color: colors.onAccent, fontSize: 14, fontFamily: fonts.xbold, letterSpacing: 1.5},
  secondary: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  secondaryText: {color: colors.gold, fontSize: 14, fontFamily: fonts.bold},
});
