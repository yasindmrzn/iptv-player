import React from 'react';
import {Alert, Linking, Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, fonts, goldGlow} from '../theme';

export const WHATSAPP_NUMBER = '+44 7853 701384';
export const CONTACT_EMAIL = 'pashaservers@gmail.com';

const open = (url: string) =>
  Linking.openURL(url).catch(() =>
    Alert.alert('Açılamadı', 'Bu bağlantıyı açabilecek bir uygulama bulunamadı.'),
  );

export const openWhatsApp = () =>
  open(`https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, '')}`);
export const openEmail = () => open(`mailto:${CONTACT_EMAIL}`);

/** Giriş ekranı altında kullanılan iki satırlık iletişim bağlantıları. */
export function ContactLinks() {
  return (
    <View style={styles.links}>
      <Pressable onPress={openWhatsApp} hitSlop={8}>
        <Text style={styles.link}>WhatsApp · {WHATSAPP_NUMBER}</Text>
      </Pressable>
      <Pressable onPress={openEmail} hitSlop={8}>
        <Text style={styles.link}>{CONTACT_EMAIL}</Text>
      </Pressable>
    </View>
  );
}

/** Ana ekranda "İletişim" düğmesiyle açılan alt sayfa. */
export function ContactSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.title}>İLETİŞİM</Text>

        <Pressable onPress={openWhatsApp} style={[styles.primary, goldGlow]}>
          <Text style={styles.primaryText}>WhatsApp</Text>
          <Text style={styles.primarySub}>{WHATSAPP_NUMBER}</Text>
        </Pressable>

        <Pressable onPress={openEmail} style={styles.secondary}>
          <Text style={styles.secondaryText}>E-posta</Text>
          <Text style={styles.secondarySub}>{CONTACT_EMAIL}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {
    backgroundColor: colors.glassStrong,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    padding: 22,
    paddingBottom: 34,
    gap: 12,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassBorder,
    marginBottom: 6,
  },
  title: {color: colors.gold, fontSize: 14, fontFamily: fonts.xbold, letterSpacing: 4, marginBottom: 6},
  primary: {borderRadius: 16, backgroundColor: colors.gold, padding: 16},
  primaryText: {color: colors.onAccent, fontSize: 16, fontFamily: fonts.xbold},
  primarySub: {color: colors.onAccent, fontSize: 13, marginTop: 2, opacity: 0.8},
  secondary: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  secondaryText: {color: colors.gold, fontSize: 16, fontFamily: fonts.bold},
  secondarySub: {color: colors.textDim, fontSize: 13, marginTop: 2},
  links: {alignItems: 'center', gap: 8, marginTop: 26},
  link: {color: colors.textDim, fontSize: 12, letterSpacing: 0.3},
});
