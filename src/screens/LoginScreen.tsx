import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {ContactLinks} from '../components/ContactSheet';
import {FadeIn} from '../components/FadeIn';
import {PressableScale} from '../components/PressableScale';
import {brand} from '../brand';
import {EiffelMark} from '../components/EiffelMark';
import {useIptvStore} from '../store/useIptvStore';
import {colors, fonts} from '../theme';

type InputRef = React.ComponentRef<typeof TextInput>;

export function LoginScreen() {
  const login = useIptvStore(s => s.login);
  const saved = useIptvStore(s => s.account);

  const [server, setServer] = useState(saved?.server ?? '');
  const [username, setUsername] = useState(saved?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<InputRef>(null);
  const passRef = useRef<InputRef>(null);

  const submit = async () => {
    if (busy) {
      return;
    }
    if (!server.trim() || !username.trim() || !password) {
      setError('Sunucu, kullanıcı adı ve şifreyi girin.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await login({server, username, password});
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Bağlanılamadı. Bilgileri ve internet bağlantınızı kontrol edin.',
      );
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <EiffelMark height={620} opacity={0.07} style={styles.bgTower} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <FadeIn style={styles.brandBox}>
            <EiffelMark height={96} style={{marginBottom: 14}} />
            <Text style={[styles.brand, brand.name.length > 9 && styles.brandLong]}>{brand.name}</Text>
            <View style={styles.rule} />
            <Text style={styles.tagline}>{brand.tagline}</Text>
          </FadeIn>

          <FadeIn delay={120} style={styles.card}>
            <Text style={styles.cardTitle}>Giriş yap</Text>
            <Text style={styles.cardSub}>Abonelik bilgilerinizi girin</Text>

            <Field
              label="Sunucu"
              value={server}
              onChangeText={setServer}
              placeholder="http://sunucu.com:8080"
              keyboardType="url"
              returnKeyType="next"
              onSubmitEditing={() => userRef.current?.focus()}
            />
            <Field
              inputRef={userRef}
              label="Kullanıcı adı"
              value={username}
              onChangeText={setUsername}
              placeholder="kullanıcı adı"
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
            />
            <Field
              inputRef={passRef}
              label="Şifre"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secure
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PressableScale onPress={submit} disabled={busy} style={styles.button}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>GİRİŞ YAP</Text>
              )}
            </PressableScale>
          </FadeIn>
          <ContactLinks />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secure,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'url' | 'default';
  secure?: boolean;
  inputRef?: React.RefObject<InputRef | null>;
  returnKeyType?: 'next' | 'go';
  onSubmitEditing?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secure}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  flex: {flex: 1},
  bgTower: {position: 'absolute', bottom: -30, right: -40},
  brandLong: {fontSize: 25, letterSpacing: 5, paddingLeft: 5},
  scroll: {flexGrow: 1, justifyContent: 'center', padding: 22},
  brandBox: {alignItems: 'center', marginBottom: 34},
  brand: {
    color: colors.text,
    fontSize: 32,
    fontFamily: fonts.xbold,
    letterSpacing: 8,
    paddingLeft: 8,
  },
  rule: {width: 120, height: 2, backgroundColor: colors.gold, marginTop: 14, borderRadius: 1},
  tagline: {
    color: colors.gold,
    fontSize: 11,
    fontFamily: fonts.semi,
    letterSpacing: 6,
    paddingLeft: 6,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTitle: {color: colors.text, fontSize: 20, fontFamily: fonts.bold},
  cardSub: {color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 18},
  field: {marginBottom: 14},
  label: {color: colors.textDim, fontSize: 12, marginBottom: 6, letterSpacing: 0.4},
  input: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: {borderColor: colors.accent},
  error: {color: colors.danger, fontSize: 13, marginBottom: 12, lineHeight: 18},
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonText: {color: colors.onAccent, fontSize: 15, fontFamily: fonts.xbold, letterSpacing: 2},
});
