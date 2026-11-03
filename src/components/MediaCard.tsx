import React, {memo, useRef, useState} from 'react';
import {Animated, Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, fonts, goldGlow} from '../theme';
import type {Channel, SeriesItem, VodItem} from '../types';

/**
 * Odak (focus) animasyonu: parmakla basılı tutma, klavye/kumanda odağı ya da uzun basma
 * kartı büyütür ve altın parlama + ince neon hat uygular.
 */
function useFocusFx(scaleTo = 1.07) {
  const scale = useRef(new Animated.Value(1)).current;
  const [focused, setFocused] = useState(false);
  const set = (on: boolean) => {
    setFocused(on);
    Animated.spring(scale, {
      toValue: on ? scaleTo : 1,
      speed: 28,
      bounciness: 5,
      useNativeDriver: true,
    }).start();
  };
  return {
    scale,
    focused,
    handlers: {
      onFocus: () => set(true),
      onBlur: () => set(false),
      onPressIn: () => set(true),
      onPressOut: () => set(false),
    },
  };
}

type PosterItem = VodItem | SeriesItem;

type PosterProps = {
  item: PosterItem;
  width: number;
  onPress: (i: PosterItem) => void;
  /** Satırlarda (yatay raflar) alt boşluğu kaldırmak için */
  compact?: boolean;
};

/** Dikey poster kartı: puan rozeti, odakta altın parlama ve cam bilgi şeridi. */
export const PosterCard = memo(function PosterCard({item, width, onPress, compact}: PosterProps) {
  const {scale, focused, handlers} = useFocusFx();
  const height = Math.round(width * 1.5);
  const rating = item.rating && Number(item.rating) > 0 ? Number(item.rating).toFixed(1) : null;

  return (
    <Pressable
      {...handlers}
      onPress={() => onPress(item)}
      style={{width, marginBottom: compact ? 0 : 16}}>
      <Animated.View
        style={[
          styles.poster,
          {width, height, transform: [{scale}]},
          focused && styles.posterFocused,
          focused && goldGlow,
        ]}>
        {item.cover ? (
          <Image source={{uri: item.cover}} style={{width, height}} resizeMode="cover" />
        ) : (
          <Text style={styles.letter}>{item.name.slice(0, 1).toUpperCase()}</Text>
        )}
        {rating ? (
          <View style={styles.rating}>
            <Text style={styles.ratingText}>★ {rating}</Text>
          </View>
        ) : null}
        {focused ? (
          <View style={styles.infoStrip}>
            <Text style={styles.infoTitle} numberOfLines={2}>
              {item.name}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text style={[styles.title, focused && styles.titleFocused]} numberOfLines={1}>
        {item.name}
      </Text>
    </Pressable>
  );
});

type ChannelCardProps = {
  channel: Channel;
  width: number;
  isCurrent?: boolean;
  nowTitle?: string;
  onPress: (c: Channel) => void;
};

/** Kanal kartı: cam yüzey, logo, canlı rozeti ve şu an yayındaki program. */
export const ChannelCard = memo(function ChannelCard({
  channel,
  width,
  isCurrent,
  nowTitle,
  onPress,
}: ChannelCardProps) {
  const {scale, focused, handlers} = useFocusFx(1.05);
  return (
    <Pressable {...handlers} onPress={() => onPress(channel)} style={{width}}>
      <Animated.View
        style={[
          styles.chCard,
          {width, transform: [{scale}]},
          (focused || isCurrent) && styles.posterFocused,
          focused && goldGlow,
        ]}>
        <View style={styles.chTop}>
          <View style={styles.chLogoBox}>
            {channel.logo ? (
              <Image source={{uri: channel.logo}} style={styles.chLogo} resizeMode="contain" />
            ) : (
              <Text style={styles.chLetter}>{channel.name.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>CANLI</Text>
          </View>
        </View>
        <Text style={styles.chName} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.chSub} numberOfLines={1}>
          {nowTitle ?? channel.group}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  poster: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  posterFocused: {borderColor: colors.gold, borderWidth: 1.5},
  letter: {color: colors.gold, fontSize: 34, fontFamily: fonts.xbold},
  rating: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.scrim,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  ratingText: {color: colors.goldBright, fontSize: 10, fontFamily: fonts.bold},
  infoStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    backgroundColor: colors.glassStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gold,
  },
  infoTitle: {color: colors.text, fontSize: 11, fontFamily: fonts.bold},
  infoSub: {color: colors.gold, fontSize: 9, marginTop: 2},
  title: {color: colors.textDim, fontSize: 12, fontFamily: fonts.medium, marginTop: 8},
  titleFocused: {color: colors.text},

  chCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  chLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chLogo: {width: 36, height: 36},
  chLetter: {color: colors.gold, fontSize: 18, fontFamily: fonts.xbold},
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,59,48,0.16)',
  },
  liveDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: colors.live},
  liveText: {color: colors.live, fontSize: 9, fontFamily: fonts.bold, letterSpacing: 0.8},
  chName: {color: colors.text, fontSize: 13, fontFamily: fonts.bold, marginTop: 12},
  chSub: {color: colors.textDim, fontSize: 11, marginTop: 3},
});
