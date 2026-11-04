import React, {memo, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {Pressable} from './Focusable';

import {colors, ROW_HEIGHT, fonts} from '../theme';
import type {Channel} from '../types';

type Props = {
  channel: Channel;
  isCurrent: boolean;
  isFavorite: boolean;
  /** Şu an yayındaki programın adı (EPG varsa) */
  nowTitle?: string;
  /** 0..1 */
  progress?: number;
  onPress: (c: Channel) => void;
  onToggleFavorite: (id: string) => void;
};

function ChannelItemBase({
  channel,
  isCurrent,
  isFavorite,
  nowTitle,
  progress,
  onPress,
  onToggleFavorite,
}: Props) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!channel.logo && !logoFailed;

  return (
    <Pressable
      onPress={() => onPress(channel)}
      android_ripple={{color: '#ffffff12'}}
      style={[styles.row, isCurrent && styles.rowActive]}>
      <View style={styles.logoBox}>
        {showLogo ? (
          <Image
            source={{uri: channel.logo}}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Text style={styles.initial}>
            {channel.name.trim().charAt(0).toUpperCase() || '?'}
          </Text>
        )}
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.name, isCurrent && styles.nameActive]}
          numberOfLines={1}>
          {channel.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {nowTitle ?? channel.group}
        </Text>
        {nowTitle && progress !== undefined ? (
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${Math.round(progress * 100)}%`}]} />
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => onToggleFavorite(channel.id)}
        hitSlop={10}
        style={styles.starBtn}>
        <Text style={[styles.star, isFavorite && styles.starOn]}>
          {isFavorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export const ChannelItem = memo(
  ChannelItemBase,
  (a, b) =>
    a.channel === b.channel &&
    a.isCurrent === b.isCurrent &&
    a.isFavorite === b.isFavorite &&
    a.nowTitle === b.nowTitle &&
    a.progress === b.progress &&
    a.onPress === b.onPress &&
    a.onToggleFavorite === b.onToggleFavorite,
);

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  rowActive: {backgroundColor: colors.accentSoft},
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {width: 38, height: 38},
  initial: {color: colors.textDim, fontSize: 18, fontFamily: fonts.bold},
  info: {flex: 1, justifyContent: 'center'},
  name: {color: colors.text, fontSize: 15, fontFamily: fonts.semi},
  nameActive: {color: colors.accent},
  sub: {color: colors.textDim, fontSize: 12, marginTop: 2},
  track: {
    height: 2,
    backgroundColor: colors.border,
    borderRadius: 1,
    marginTop: 5,
    overflow: 'hidden',
  },
  fill: {height: 2, backgroundColor: colors.accent},
  starBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  star: {color: colors.textFaint, fontSize: 22},
  starOn: {color: colors.fav},
});
