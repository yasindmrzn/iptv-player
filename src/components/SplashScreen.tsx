import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';

import {colors, fonts} from '../theme';

type Props = {onDone: () => void};

/** Açılış ekranı: PASHAPLAY yazısı belirir, altın çizgi açılır, sonra kaybolur. */
export function SplashScreen({onDone}: Props) {
  const title = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const screen = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(title, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(line, {
          toValue: 1,
          duration: 900,
          delay: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // genişlik animasyonu
        }),
      ]),
      Animated.timing(tagline, {toValue: 1, duration: 450, useNativeDriver: true}),
      Animated.delay(650),
      Animated.timing(screen, {toValue: 0, duration: 450, useNativeDriver: true}),
    ]);
    anim.start(({finished}) => {
      if (finished) {
        onDone();
      }
    });
    return () => anim.stop();
  }, [title, line, tagline, screen, onDone]);

  return (
    <Animated.View style={[styles.root, {opacity: screen}]} pointerEvents="auto">
      {/* Arka plan ışıması */}
      <View style={[styles.glow, styles.glowBig]} />
      <View style={[styles.glow, styles.glowSmall]} />

      <Animated.Text
        style={[
          styles.title,
          {
            opacity: title,
            transform: [
              {translateY: title.interpolate({inputRange: [0, 1], outputRange: [14, 0]})},
            ],
          },
        ]}>
        PASHAPLAY
      </Animated.Text>

      <Animated.View
        style={[
          styles.line,
          {width: line.interpolate({inputRange: [0, 1], outputRange: [0, 150]})},
        ]}
      />

      <Animated.View style={{opacity: tagline}}>
        <Text style={styles.tagline}>PREMIUM TV</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  glow: {position: 'absolute', borderRadius: 999, backgroundColor: colors.accent},
  glowBig: {width: 460, height: 460, opacity: 0.1, top: '14%', left: -120},
  glowSmall: {width: 260, height: 260, opacity: 0.12, bottom: '12%', right: -80},
  title: {
    color: colors.text,
    fontSize: 36,
    fontFamily: fonts.xbold,
    letterSpacing: 9,
    paddingLeft: 9, // letterSpacing'in sağa kaydırdığı boşluğu dengeler
  },
  line: {height: 2, backgroundColor: colors.gold, marginTop: 18, borderRadius: 1},
  tagline: {
    color: colors.gold,
    fontSize: 11,
    fontFamily: fonts.semi,
    letterSpacing: 7,
    paddingLeft: 7,
    marginTop: 16,
  },
});
