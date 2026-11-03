import {NativeModules, Platform} from 'react-native';

type Native = {set: (on: boolean) => void};
const native: Native | undefined = NativeModules.Immersive;

/** Sistem çubuklarını ve çentik kenar boşluğunu gizler/geri getirir (yalnızca Android). */
export function setImmersive(on: boolean): void {
  if (Platform.OS === 'android') {
    try {
      native?.set(on);
    } catch {
      /* yok say */
    }
  }
}
