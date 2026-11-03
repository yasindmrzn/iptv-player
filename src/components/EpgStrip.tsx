import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {formatClock} from '../services/epg';
import {colors, fonts} from '../theme';
import type {Channel, Programme} from '../types';

type Props = {
  channel: Channel | null;
  now?: Programme;
  next?: Programme;
  nowMs: number;
};

function EpgStripBase({channel, now, next, nowMs}: Props) {
  if (!channel) {
    return null;
  }

  const progress = now
    ? Math.min(1, Math.max(0, (nowMs - now.start) / (now.stop - now.start)))
    : 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.channel} numberOfLines={1}>
        {channel.name}
      </Text>

      {now ? (
        <>
          <View style={styles.rowBetween}>
            <Text style={styles.nowTitle} numberOfLines={1}>
              {now.title}
            </Text>
            <Text style={styles.time}>
              {formatClock(now.start)}–{formatClock(now.stop)}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${Math.round(progress * 100)}%`}]} />
          </View>
          {now.description ? (
            <Text style={styles.desc} numberOfLines={2}>
              {now.description}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.noEpg}>Program bilgisi yok</Text>
      )}

      {next ? (
        <Text style={styles.next} numberOfLines={1}>
          Sıradaki · {formatClock(next.start)} {next.title}
        </Text>
      ) : null}
    </View>
  );
}

export const EpgStrip = memo(EpgStripBase);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channel: {color: colors.textDim, fontSize: 12, fontFamily: fonts.semi, marginBottom: 4},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', gap: 10},
  nowTitle: {flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.bold},
  time: {color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums']},
  track: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 7,
    overflow: 'hidden',
  },
  fill: {height: 3, backgroundColor: colors.accent},
  desc: {color: colors.textDim, fontSize: 12, marginTop: 6, lineHeight: 17},
  noEpg: {color: colors.textFaint, fontSize: 13},
  next: {color: colors.textDim, fontSize: 12, marginTop: 6},
});
