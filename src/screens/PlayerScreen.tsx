import React, {useEffect, useState} from 'react';
import {AppState, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {VideoPlayer} from '../components/VideoPlayer';
import {colors, fonts} from '../theme';
import type {Channel} from '../types';

type Props = {
  channel: Channel;
  title: string;
  subtitle?: string;
  onBack: () => void;
};

/** Film / dizi bölümü oynatma ekranı (16:9 oynatıcı + arama çubuğu). */
export function PlayerScreen({channel, title, subtitle, onBack}: Props) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => setActive(st === 'active'));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Geri</Text>
        </Pressable>
      </View>

      <VideoPlayer channel={channel} paused={!active} vod />

      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {height: 48, justifyContent: 'center', paddingHorizontal: 14},
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  backText: {color: colors.text, fontSize: 13, fontFamily: fonts.semi},
  info: {padding: 18},
  title: {color: colors.text, fontSize: 18, fontFamily: fonts.xbold},
  subtitle: {color: colors.textDim, fontSize: 13, marginTop: 6},
});
