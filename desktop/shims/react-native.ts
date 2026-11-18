// react-native → react-native-web, masaüstüne uyarlanan birkaç eksikle
import {Alert as RNWAlert} from 'react-native-web';
export * from 'react-native-web';

declare const __BRAND__: string;
/** Marka ve iletişim ayarı derleme zamanında seçilir (src/brand.ts bunu okur). */
export const NativeModules = {
  Immersive: {brand: __BRAND__, tv: false, noContact: __BRAND__ === 'paris'},
};

type Btn = {text?: string; style?: string; onPress?: () => void};

export const Alert = {
  ...RNWAlert,
  alert(title: string, message?: string, buttons?: Btn[]) {
    const text = message ? `${title}\n\n${message}` : title;
    if (!buttons || buttons.length < 2) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const ok = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    if (window.confirm(text)) {
      ok.onPress?.();
    }
  },
};

// Geri tuşu: Esc ve fare "geri" düğmesi
type Listener = () => boolean | null | undefined;
const listeners: Listener[] = [];
function fire() {
  for (let i = listeners.length - 1; i >= 0; i--) {
    if (listeners[i]()) {
      return;
    }
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      fire();
    }
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 3) {
      fire();
    }
  });
}
export const BackHandler = {
  addEventListener(_name: string, fn: Listener) {
    listeners.push(fn);
    return {
      remove() {
        const i = listeners.indexOf(fn);
        if (i >= 0) {
          listeners.splice(i, 1);
        }
      },
    };
  },
  exitApp() {
    window.close();
  },
};
