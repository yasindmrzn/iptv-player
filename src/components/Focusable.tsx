import React, {useState} from 'react';
import {Pressable as RNPressable, type PressableProps} from 'react-native';

import {colors} from '../theme';

const RING = {
  outlineColor: colors.gold,
  outlineWidth: 2,
  outlineOffset: 2,
  outlineStyle: 'solid',
} as const;

/**
 * RN Pressable'ın yerine geçer: kumanda (D-pad) / klavye odağı geldiğinde altın bir halka çizer.
 * Android TV'de hangi öğenin seçili olduğu bu halkayla görülür.
 */
export function Pressable({style, onFocus, onBlur, ...rest}: PressableProps) {
  const [focused, setFocused] = useState(false);
  return (
    <RNPressable
      {...rest}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={state => [typeof style === 'function' ? style(state) : style, focused && RING]}
    />
  );
}
