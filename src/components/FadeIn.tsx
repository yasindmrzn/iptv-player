import React, {useEffect, useRef} from 'react';
import {Animated, Easing, type StyleProp, type ViewStyle} from 'react-native';

type Props = {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/** Ekran/öğe girişinde hafifçe yukarı kayarak belirir. */
export function FadeIn({children, delay = 0, style}: Props) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
