import React, {useCallback, useState} from 'react';
import {StatusBar, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {SplashScreen} from './src/components/SplashScreen';
import {MainScreen} from './src/screens/MainScreen';
import {colors} from './src/theme';

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <SafeAreaProvider style={{backgroundColor: colors.bg}}>
      <StatusBar barStyle="light-content" />
      {/* Ana ekran arkada hazırlanır (liste yüklenir); açılış ekranı üstte oynar */}
      <MainScreen ready={splashDone} />
      {!splashDone && (
        <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}>
          <SplashScreen onDone={onSplashDone} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
