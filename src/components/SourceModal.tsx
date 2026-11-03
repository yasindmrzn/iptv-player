import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types as pickerTypes,
} from '@react-native-documents/picker';
import React, {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {normalizeServer, xtreamAuthenticate} from '../services/xtream';
import {useIptvStore} from '../store/useIptvStore';
import {colors} from '../theme';
import type {Source} from '../types';

type Props = {visible: boolean; onClose: () => void};
type Mode = 'm3u' | 'xtream' | 'file';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function SourceModal({visible, onClose}: Props) {
  const sources = useIptvStore(s => s.sources);
  const activeSourceId = useIptvStore(s => s.activeSourceId);
  const addSource = useIptvStore(s => s.addSource);
  const removeSource = useIptvStore(s => s.removeSource);
  const setActiveSource = useIptvStore(s => s.setActiveSource);

  const [mode, setMode] = useState<Mode>('m3u');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setUrl('');
    setEpgUrl('');
    setServer('');
    setUsername('');
    setPassword('');
    setError(null);
  };

  /** Kaynağı ekler; liste yüklenemezse geri alır ve hatayı gösterir. */
  const commit = async (src: Source) => {
    await addSource(src);
    const err = useIptvStore.getState().error;
    if (err) {
      await removeSource(src.id);
      throw new Error(err);
    }
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'm3u') {
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) {
          throw new Error('Adres http:// veya https:// ile başlamalı.');
        }
        await commit({
          id: uid(),
          kind: 'm3u',
          name: name.trim() || 'M3U Listesi',
          url: u,
          epgUrl: epgUrl.trim() || undefined,
        });
      } else if (mode === 'xtream') {
        if (!server.trim() || !username.trim() || !password) {
          throw new Error('Sunucu, kullanıcı adı ve şifre gerekli.');
        }
        const creds = {
          server: normalizeServer(server),
          username: username.trim(),
          password,
        };
        await xtreamAuthenticate(creds);
        await commit({
          id: uid(),
          kind: 'xtream',
          name: name.trim() || `Xtream · ${creds.username}`,
          creds,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setError(null);
    try {
      const [file] = await pick({type: [pickerTypes.allFiles]});
      setBusy(true);
      const fileName = file.name ?? `liste-${uid()}.m3u`;
      const [copy] = await keepLocalCopy({
        files: [{uri: file.uri, fileName}],
        destination: 'documentDirectory',
      });
      if (copy.status !== 'success') {
        throw new Error(`Dosya kopyalanamadı: ${copy.copyError}`);
      }
      await commit({
        id: uid(),
        kind: 'm3u',
        name: fileName.replace(/\.(m3u8?|txt)$/i, ''),
        url: copy.localUri,
      });
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setError(e instanceof Error ? e.message : 'Dosya okunamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Kaynaklar</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.close}>Kapat</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}>
              {sources.length > 0 && (
                <View style={styles.block}>
                  {sources.map(s => {
                    const active = s.id === activeSourceId;
                    return (
                      <View key={s.id} style={styles.sourceRow}>
                        <Pressable
                          style={styles.sourceMain}
                          onPress={() => {
                            if (!active) {
                              void setActiveSource(s.id);
                            }
                            onClose();
                          }}>
                          <Text style={styles.sourceName} numberOfLines={1}>
                            {active ? '● ' : '○ '}
                            {s.name}
                          </Text>
                          <Text style={styles.sourceMeta}>
                            {s.kind === 'xtream' ? 'Xtream Codes' : 'M3U'}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => void removeSource(s.id)} hitSlop={10}>
                          <Text style={styles.remove}>Sil</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={styles.sectionLabel}>Yeni kaynak ekle</Text>
              <View style={styles.segment}>
                {(
                  [
                    ['m3u', 'M3U Linki'],
                    ['xtream', 'Xtream'],
                    ['file', 'Dosya'],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setMode(key);
                      setError(null);
                    }}
                    style={[styles.segBtn, mode === key && styles.segBtnActive]}>
                    <Text style={[styles.segText, mode === key && styles.segTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {mode !== 'file' && (
                <Field
                  label="Ad (isteğe bağlı)"
                  value={name}
                  onChangeText={setName}
                  placeholder="Evdeki liste"
                />
              )}

              {mode === 'm3u' && (
                <>
                  <Field
                    label="M3U / M3U8 adresi"
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://ornek.com/liste.m3u"
                    keyboardType="url"
                  />
                  <Field
                    label="EPG (XMLTV) adresi — isteğe bağlı"
                    value={epgUrl}
                    onChangeText={setEpgUrl}
                    placeholder="https://ornek.com/epg.xml.gz"
                    keyboardType="url"
                  />
                </>
              )}

              {mode === 'xtream' && (
                <>
                  <Field
                    label="Sunucu URL"
                    value={server}
                    onChangeText={setServer}
                    placeholder="http://sunucu.com:8080"
                    keyboardType="url"
                  />
                  <Field
                    label="Kullanıcı adı"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="kullanici"
                  />
                  <Field
                    label="Şifre"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secure
                  />
                </>
              )}

              {mode === 'file' && (
                <Text style={styles.hint}>
                  Cihazınızdaki bir .m3u veya .m3u8 dosyasını seçin. Dosyanın bir
                  kopyası uygulama içinde saklanır.
                </Text>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                disabled={busy}
                onPress={mode === 'file' ? pickFile : submit}
                style={[styles.submit, busy && styles.submitBusy]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>
                    {mode === 'file' ? 'Dosya seç' : 'Ekle ve yükle'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'url' | 'default';
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secure}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'},
  backdropTap: {flex: 1},
  sheetWrap: {maxHeight: '88%'},
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingBottom: 18,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: {color: colors.text, fontSize: 18, fontWeight: '700'},
  close: {color: colors.accent, fontSize: 15, fontWeight: '600'},
  scroll: {paddingHorizontal: 18, paddingBottom: 12},
  block: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    marginBottom: 18,
    overflow: 'hidden',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  sourceMain: {flex: 1},
  sourceName: {color: colors.text, fontSize: 15, fontWeight: '600'},
  sourceMeta: {color: colors.textDim, fontSize: 12, marginTop: 2},
  remove: {color: colors.danger, fontSize: 14, fontWeight: '600'},
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  segBtn: {flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8},
  segBtnActive: {backgroundColor: colors.accent},
  segText: {color: colors.textDim, fontSize: 13, fontWeight: '600'},
  segTextActive: {color: '#fff'},
  field: {marginBottom: 12},
  label: {color: colors.textDim, fontSize: 12, marginBottom: 6},
  input: {
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  hint: {color: colors.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14},
  error: {color: colors.danger, fontSize: 13, marginBottom: 12},
  submit: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBusy: {opacity: 0.7},
  submitText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
