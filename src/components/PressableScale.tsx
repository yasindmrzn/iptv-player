import React, {useRef} from 'react';
import {Animated, type StyleProp, type ViewStyle} from 'react-native';
import {Pressable} from './Focusable';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
};

/** Basınca yumuşakça küçülen dokunma alanı (native sürücü: UI iş parçacığında akıcı). */
export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.97,
  disabled,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, {
      toValue: v,
      speed: 40,
      bounciness: 0,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}>
      <Animated.View style={[style, {transform: [{scale}]}]}>{children}</Animated.View>
    </Pressable>
  );
}
