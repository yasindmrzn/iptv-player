import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {ContactLinks} from '../components/ContactSheet';
import {EiffelMark} from '../components/EiffelMark';
import {FadeIn} from '../components/FadeIn';
import {PressableScale} from '../components/PressableScale';
import {Pressable} from '../components/Focusable';
import {brand, showContact} from '../brand';
import {useCatalogStore} from '../store/useCatalogStore';
import {useIptvStore} from '../store/useIptvStore';
import {colors, fonts} from '../theme';
import type {XtreamAccountInfo} from '../services/xtream';

/** Hesap süresi dolmuş / devre dışı mı? (süresiz hesaplarda exp_date boştur) */
export function isAccountBlocked(info: XtreamAccountInfo | null): boolean {
  if (!info) {
    return false;
  }
  const st = (info.status ?? '').toLowerCase();
  if (st && st !== 'active') {
    return true;
  }
  return !!info.expiresAt && info.expiresAt < Date.now();
}

const fmt = (ms?: number) => {
  if (!ms) {
    return null;
  }
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function ExpiredScreen() {
  const info = useIptvStore(s => s.accountInfo);
  const [busy, setBusy] = useState(false);
  const st = (info?.status ?? '').toLowerCase();
  const disabled = st !== '' && st !== 'active' && st !== 'expired';
  const date = fmt(info?.expiresAt);

  const recheck = async () => {
    setBusy(true);
    await useIptvStore.getState().refreshAccount();
    setBusy(false);
  };
  const logout = () => {
    useCatalogStore.getState().reset();
    useIptvStore.getState().logout();
  };

  return (
    <SafeAreaView style={styles.root}>
      <EiffelMark height={620} opacity={0.06} style={styles.bgTower} />
      <FadeIn style={styles.center}>
        <EiffelMark height={72} style={{marginBottom: 12}} />
        <Text style={styles.brand}>{brand.name}</Text>
        <View style={styles.card}>
          <Text style={styles.icon}>⏳</Text>
          <Text style={styles.title}>
            {disabled ? 'Hesabınız devre dışı' : 'Aboneliğinizin süresi doldu'}
          </Text>
          {date && !disabled ? <Text style={styles.date}>Bitiş tarihi: {date}</Text> : null}
          <Text style={styles.sub}>
            İzlemeye devam etmek için aboneliğinizi yenilemeniz gerekir. Yenileme sonrası
            aşağıdaki düğmeyle tekrar kontrol edin.
          </Text>
          <PressableScale onPress={recheck} disabled={busy} style={styles.button}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>TEKRAR KONTROL ET</Text>
            )}
          </PressableScale>
          <Pressable onPress={logout} style={styles.ghost}>
            <Text style={styles.ghostText}>Çıkış yap</Text>
          </Pressable>
        </View>
        {showContact ? <ContactLinks /> : null}
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  bgTower: {position: 'absolute', bottom: -30, right: -40},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22},
  brand: {color: colors.text, fontSize: 24, fontFamily: fonts.xbold, letterSpacing: 6, marginBottom: 22},
  card: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 26,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  icon: {fontSize: 34, marginBottom: 8},
  title: {color: colors.text, fontSize: 20, fontFamily: fonts.bold, textAlign: 'center'},
  date: {color: colors.gold, fontSize: 13, fontFamily: fonts.semi, marginTop: 8},
  sub: {color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center', marginVertical: 16},
  button: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {color: colors.onAccent, fontSize: 14, fontFamily: fonts.xbold, letterSpacing: 2},
  ghost: {marginTop: 14, padding: 8},
  ghostText: {color: colors.textDim, fontSize: 13, fontFamily: fonts.semi},
});
