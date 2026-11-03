import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {MainScreen} from './src/screens/MainScreen';
import {colors} from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider style={{backgroundColor: colors.bg}}>
      <StatusBar barStyle="light-content" />
      <MainScreen />
    </SafeAreaProvider>
  );
}
