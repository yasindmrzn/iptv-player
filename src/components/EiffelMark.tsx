import React from 'react';
import {Image, type StyleProp, type ImageStyle} from 'react-native';

import {brand} from '../brand';
import {colors} from '../theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SOURCE = require('../assets/eiffel.png');
const RATIO = 360 / 670;

type Props = {
  height: number;
  opacity?: number;
  tint?: string;
  style?: StyleProp<ImageStyle>;
};

/** Eyfel Kulesi silüeti (yalnızca ParisPlayer'da çizilir). */
export function EiffelMark({height, opacity = 1, tint, style}: Props) {
  if (!brand.eiffel) {
    return null;
  }
  return (
    <Image
      source={SOURCE}
      pointerEvents="none"
      resizeMode="contain"
      style={[{height, width: height * RATIO, opacity, tintColor: tint ?? colors.gold}, style]}
    />
  );
}
