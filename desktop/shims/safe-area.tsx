import React from 'react';
import {View} from 'react-native-web';

export const SafeAreaProvider = ({children}: {children?: React.ReactNode}) => <>{children}</>;
export const SafeAreaView = View;
export const useSafeAreaInsets = () => ({top: 0, bottom: 0, left: 0, right: 0});
