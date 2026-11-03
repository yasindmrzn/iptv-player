import React, {useEffect} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {FadeIn} from '../components/FadeIn';
import {PressableScale} from '../components/PressableScale';
import {useCatalogStore} from '../store/useCatalogStore';
import {useIptvStore} from '../store/useIptvStore';
import {colors} from '../theme';

type Props = {
  onOpen: (screen: 'live' | 'vod' | 'series') => void;
};

const CARDS = [
  {key: 'live' as const, title: 'CANLI', sub: 'Canlı TV kanalları', glyph: '◉'},
  {key: 'vod' as const, title: 'VOD', sub: 'Filmler', glyph: '▶'},
  {key: 'series' as const, title: 'SERİES', sub: 'Diziler', glyph: '❖'},
];

function formatExpiry(ms?: number): string | null {
  if (!ms) {
    return null;
  }
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${d.getFullYear()}`;
}

export function HomeScreen({onOpen}: Props) {
  const account = useIptvStore(s => s.account);
  const info = useIptvStore(s => s.accountInfo);
  const refreshAccount = useIptvStore(s => s.refreshAccount);
  const logout = useIptvStore(s => s.logout);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  const confirmLogout = () =>
    Alert.alert('Çıkış yap', 'Hesaptan çıkış yapılsın mı?', [
      {text: 'Vazgeç', style: 'cancel'},
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          useCatalogStore.getState().reset();
          logout();
        },
      },
    ]);

  const expiry = formatExpiry(info?.expiresAt);

  return (
    <SafeAreaView style={styles.root}>
      <FadeIn style={styles.header}>
        <View>
          <Text style={styles.brand}>PASHAPLAY</Text>
          {account ? <Text style={styles.user}>{account.username}</Text> : null}
        </View>
        <Pressable onPress={confirmLogout} hitSlop={10} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </Pressable>
      </FadeIn>

      {expiry ? (
        <FadeIn delay={60} style={styles.expiryRow}>
          <Text style={styles.expiryText}>Abonelik bitişi · {expiry}</Text>
        </FadeIn>
      ) : null}

      <View style={styles.cards}>
        {CARDS.map((c, i) => (
          <FadeIn key={c.key} delay={120 + i * 90} style={styles.cardWrap}>
            <PressableScale style={styles.card} onPress={() => onOpen(c.key)}>
              <View style={styles.accentBar} />
              <View style={styles.glowCircle} />
              <View style={styles.glyphBox}>
                <Text style={styles.glyph}>{c.glyph}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Text style={styles.cardSub}>{c.sub}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </PressableScale>
          </FadeIn>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  brand: {color: colors.gold, fontSize: 20, fontWeight: '800', letterSpacing: 5},
  user: {color: colors.textDim, fontSize: 12, marginTop: 4},
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  logoutText: {color: colors.text, fontSize: 13, fontWeight: '600'},
  expiryRow: {paddingHorizontal: 22, marginTop: 10},
  expiryText: {color: colors.textFaint, fontSize: 12},
  cards: {flex: 1, justifyContent: 'center', paddingHorizontal: 18, gap: 16},
  cardWrap: {},
  card: {
    height: 118,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 18,
    bottom: 18,
    width: 4,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.gold,
  },
  glowCircle: {
    position: 'absolute',
    right: -50,
    top: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
    opacity: 0.14,
  },
  glyphBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.14)',
  },
  glyph: {color: colors.gold, fontSize: 22},
  cardText: {flex: 1, marginLeft: 18},
  cardTitle: {color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 3},
  cardSub: {color: colors.textDim, fontSize: 13, marginTop: 3},
  chevron: {color: colors.gold, fontSize: 34, marginTop: -4},
});
