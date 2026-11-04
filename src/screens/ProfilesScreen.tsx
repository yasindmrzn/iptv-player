import React, {useState} from 'react';
import {
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
import {SafeAreaView} from 'react-native-safe-area-context';

import {FadeIn} from '../components/FadeIn';
import {PROFILE_COLORS, useIptvStore} from '../store/useIptvStore';
import {colors, fonts, goldGlow} from '../theme';
import type {Profile} from '../types';

const MAX_PROFILES = 5;

export function Avatar({profile, size = 96}: {profile: Profile; size?: number}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: profile.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{color: '#0b0b0b', fontSize: size * 0.46, fontFamily: fonts.xbold}}>
        {profile.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

/** Netflix tarzı "Kim izliyor?" ekranı: profil seç, ekle, düzenle, sil. */
export function ProfilesScreen() {
  const profiles = useIptvStore(s => s.profiles);
  const activeId = useIptvStore(s => s.activeProfileId);
  const picked = useIptvStore(s => s.profilePicked);
  const switchProfile = useIptvStore(s => s.switchProfile);
  const addProfile = useIptvStore(s => s.addProfile);
  const updateProfile = useIptvStore(s => s.updateProfile);
  const deleteProfile = useIptvStore(s => s.deleteProfile);
  const setProfileScreen = useIptvStore(s => s.setProfileScreen);

  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROFILE_COLORS[0]);

  const openEditor = (p: Profile | 'new') => {
    setEditing(p);
    if (p === 'new') {
      setName('');
      setColor(PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]);
    } else {
      setName(p.name);
      setColor(p.color);
    }
  };

  const save = () => {
    if (editing === 'new') {
      const id = addProfile(name, color);
      setEditing(null);
      if (!editMode) {
        switchProfile(id);
      }
    } else if (editing) {
      updateProfile(editing.id, name, color);
      setEditing(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        {picked ? (
          <Pressable onPress={() => setProfileScreen(false)} hitSlop={12}>
            <Text style={styles.topBtn}>‹ Geri</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={() => setEditMode(m => !m)} hitSlop={12}>
          <Text style={styles.topBtn}>{editMode ? 'Bitti' : 'Düzenle'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <FadeIn>
          <Text style={styles.title}>KİM İZLİYOR?</Text>
          <View style={styles.rule} />
        </FadeIn>

        <View style={styles.grid}>
          {profiles.map((p, i) => (
            <FadeIn key={p.id} delay={80 + i * 60}>
              <Pressable
                onPress={() => (editMode ? openEditor(p) : switchProfile(p.id))}
                style={styles.tile}>
                <View style={[styles.avatarWrap, p.id === activeId && !editMode && styles.avatarActive]}>
                  <Avatar profile={p} />
                  {editMode ? (
                    <View style={styles.editBadge}>
                      <Text style={styles.editBadgeText}>Düzenle</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            </FadeIn>
          ))}
          {profiles.length < MAX_PROFILES ? (
            <FadeIn delay={80 + profiles.length * 60}>
              <Pressable onPress={() => openEditor('new')} style={styles.tile}>
                <View style={styles.addBox}>
                  <Text style={styles.plus}>+</Text>
                </View>
                <Text style={styles.name}>Profil ekle</Text>
              </Pressable>
            </FadeIn>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={editing != null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing === 'new' ? 'Yeni profil' : 'Profili düzenle'}</Text>
            <View style={styles.previewRow}>
              <Avatar profile={{id: 'x', name: name || '?', color}} size={72} />
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Profil adı"
              placeholderTextColor={colors.textFaint}
              maxLength={14}
              style={styles.input}
              autoFocus={editing === 'new'}
            />
            <View style={styles.colors}>
              {PROFILE_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorDot, {backgroundColor: c}, color === c && styles.colorDotOn]}
                />
              ))}
            </View>
            <Pressable onPress={save} style={[styles.saveBtn, goldGlow]}>
              <Text style={styles.saveText}>KAYDET</Text>
            </Pressable>
            {editing && editing !== 'new' && profiles.length > 1 ? (
              <Pressable
                onPress={() => {
                  deleteProfile(editing.id);
                  setEditing(null);
                }}
                style={styles.deleteBtn}>
                <Text style={styles.deleteText}>Profili sil</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  top: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12},
  topBtn: {color: colors.gold, fontSize: 14, fontFamily: fonts.semi},
  content: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24},
  title: {color: colors.text, fontSize: 24, fontFamily: fonts.xbold, letterSpacing: 5, textAlign: 'center'},
  rule: {alignSelf: 'center', width: 80, height: 2, backgroundColor: colors.gold, marginTop: 14, marginBottom: 34},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 26, paddingHorizontal: 20},
  tile: {alignItems: 'center', width: 104},
  avatarWrap: {borderRadius: 30, padding: 3, borderWidth: 2, borderColor: 'transparent'},
  avatarActive: {borderColor: colors.gold},
  editBadge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  editBadgeText: {color: '#fff', fontSize: 10, fontFamily: fonts.semi},
  name: {color: colors.textDim, fontSize: 13, fontFamily: fonts.semi, marginTop: 10},
  addBox: {
    width: 96,
    height: 96,
    margin: 5,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {color: colors.gold, fontSize: 44, fontFamily: fonts.medium, marginTop: -4},
  modalWrap: {flex: 1, justifyContent: 'center', padding: 24},
  modalBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)'},
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  modalTitle: {color: colors.gold, fontSize: 14, fontFamily: fonts.xbold, letterSpacing: 3, textAlign: 'center'},
  previewRow: {alignItems: 'center', marginVertical: 18},
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  colors: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 18},
  colorDot: {width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent'},
  colorDotOn: {borderColor: '#fff'},
  saveBtn: {height: 50, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center'},
  saveText: {color: colors.onAccent, fontSize: 14, fontFamily: fonts.xbold, letterSpacing: 2},
  deleteBtn: {alignItems: 'center', paddingTop: 16},
  deleteText: {color: colors.danger, fontSize: 13, fontFamily: fonts.semi},
});
