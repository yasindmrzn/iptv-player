import React, {useMemo} from 'react';
import {FlatList, StyleSheet, Text, View, useWindowDimensions} from 'react-native';

import {ChannelCard} from '../components/MediaCard';
import {getNowNext} from '../services/epg';
import {useIptvStore} from '../store/useIptvStore';
import {colors, fonts} from '../theme';
import type {Channel} from '../types';

const PAD = 16;
const GAP = 12;

export function FavoritesScreen({onOpenChannel}: {onOpenChannel: (c: Channel) => void}) {
  const {width} = useWindowDimensions();
  const channels = useIptvStore(s => s.channels);
  const favorites = useIptvStore(s => s.favorites);
  const epg = useIptvStore(s => s.epg);
  const loadLive = useIptvStore(s => s.loadLive);
  const current = useIptvStore(s => s.currentChannel);

  React.useEffect(() => {
    void loadLive();
  }, [loadLive]);

  const favs = useMemo(() => channels.filter(c => favorites[c.id]), [channels, favorites]);
  const w = Math.floor((width - PAD * 2 - GAP) / 2);

  return (
    <FlatList
      style={styles.root}
      data={favs}
      numColumns={2}
      keyExtractor={c => c.id}
      columnWrapperStyle={{gap: GAP}}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={{height: GAP}} />}
      renderItem={({item}) => (
        <ChannelCard
          channel={item}
          width={w}
          isCurrent={item.id === current?.id}
          nowTitle={getNowNext(epg, item.tvgId ?? item.epgChannelId ?? item.id, Date.now()).now?.title}
          onPress={onOpenChannel}
        />
      )}
      ListHeaderComponent={<Text style={styles.heading}>Favori Kanallar</Text>}
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Text style={styles.star}>☆</Text>
          <Text style={styles.emptyTitle}>Henüz favori yok</Text>
          <Text style={styles.emptyText}>
            Canlı sekmesinde bir kanalın yanındaki ☆ simgesine dokunarak ekleyin.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {padding: PAD, paddingBottom: 32},
  heading: {color: colors.text, fontSize: 20, fontFamily: fonts.xbold, marginBottom: 14},
  emptyBox: {alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8},
  star: {color: colors.gold, fontSize: 44},
  emptyTitle: {color: colors.text, fontSize: 16, fontFamily: fonts.bold},
  emptyText: {color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 19},
});
