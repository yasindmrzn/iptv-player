import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {CAT_ALL, CAT_FAV, CategoryTabs} from '../components/CategoryTabs';
import {ChannelItem} from '../components/ChannelItem';
import {EpgStrip} from '../components/EpgStrip';
import {SourceModal} from '../components/SourceModal';
import {VideoPlayer} from '../components/VideoPlayer';
import {getNowNext} from '../services/epg';
import {useIptvStore} from '../store/useIptvStore';
import {colors, ROW_HEIGHT} from '../theme';
import type {Channel} from '../types';

const SWIPE_THRESHOLD = 48;
const epgIdOf = (c: Channel) => c.tvgId ?? c.epgChannelId ?? c.id;

export function MainScreen() {
  const insets = useSafeAreaInsets();

  // ── Store ────────────────────────────────────────────────────────────────
  const hydrated = useIptvStore(s => s.hydrated);
  const sources = useIptvStore(s => s.sources);
  const channels = useIptvStore(s => s.channels);
  const groups = useIptvStore(s => s.groups);
  const epg = useIptvStore(s => s.epg);
  const favorites = useIptvStore(s => s.favorites);
  const currentChannel = useIptvStore(s => s.currentChannel);
  const loading = useIptvStore(s => s.loading);
  const error = useIptvStore(s => s.error);
  const selectChannel = useIptvStore(s => s.selectChannel);
  const toggleFavorite = useIptvStore(s => s.toggleFavorite);
  const loadActiveSource = useIptvStore(s => s.loadActiveSource);

  // ── Yerel durum ──────────────────────────────────────────────────────────
  const [category, setCategory] = useState(CAT_ALL);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(true);
  const listRef = useRef<FlatList<Channel>>(null);
  const autoOpened = useRef(false);

  // Açılışta (kalıcı veri yüklendikten sonra) aktif kaynağı yükle
  useEffect(() => {
    if (hydrated) {
      void loadActiveSource();
    }
  }, [hydrated, loadActiveSource]);

  // Hiç kaynak yoksa ekleme penceresini bir kez otomatik aç
  useEffect(() => {
    if (hydrated && sources.length === 0 && !autoOpened.current) {
      autoOpened.current = true;
      setModalOpen(true);
    }
  }, [hydrated, sources.length]);

  // EPG ilerleme çubukları için dakikada bir saat tikle
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Uygulama arka plana geçince yayını duraklat
  useEffect(() => {
    const sub = AppState.addEventListener('change', st =>
      setAppActive(st === 'active'),
    );
    return () => sub.remove();
  }, []);

  // Arama kutusu: 200 ms debounce (50 bin kanalda her tuşta süzmeyi önler)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Kaynak değişince, artık var olmayan kategoriyi sıfırla
  useEffect(() => {
    if (category !== CAT_ALL && category !== CAT_FAV && !groups.includes(category)) {
      setCategory(CAT_ALL);
    }
  }, [groups, category]);

  // ── Süzme ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = channels;
    if (category === CAT_FAV) {
      list = list.filter(c => favorites[c.id]);
    } else if (category !== CAT_ALL) {
      list = list.filter(c => c.group === category);
    }
    if (debouncedQuery) {
      list = list.filter(c => c.name.toLowerCase().includes(debouncedQuery));
    }
    return list;
  }, [channels, category, favorites, debouncedQuery]);

  const favoriteCount = useMemo(
    () => channels.reduce((n, c) => (favorites[c.id] ? n + 1 : n), 0),
    [channels, favorites],
  );

  const currentIndex = useMemo(
    () => (currentChannel ? filtered.findIndex(c => c.id === currentChannel.id) : -1),
    [filtered, currentChannel],
  );

  // ── Hızlı kanal değiştirme (zapping) ─────────────────────────────────────
  const zap = useCallback(
    (dir: 1 | -1) => {
      if (!filtered.length) {
        return;
      }
      const base = currentIndex === -1 ? (dir === 1 ? -1 : 0) : currentIndex;
      const next = (base + dir + filtered.length) % filtered.length;
      selectChannel(filtered[next]);
      try {
        listRef.current?.scrollToIndex({
          index: next,
          viewPosition: 0.3,
          animated: true,
        });
      } catch {
        /* liste henüz ölçülmediyse yok say */
      }
    },
    [filtered, currentIndex, selectChannel],
  );

  // PanResponder bir kez oluşturulur; güncel zap'e ref üzerinden ulaşır
  const zapRef = useRef(zap);
  zapRef.current = zap;

  const swipe = useRef(
    PanResponder.create({
      // Dikey sürükleme ebeveyne geçer; basit dokunuşlar oynatıcı kontrolünde kalır
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dy) > 16 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dy <= -SWIPE_THRESHOLD) {
          zapRef.current(1); // yukarı kaydır → sonraki kanal
        } else if (g.dy >= SWIPE_THRESHOLD) {
          zapRef.current(-1); // aşağı kaydır → önceki kanal
        }
      },
    }),
  ).current;

  // ── Liste satırları ──────────────────────────────────────────────────────
  const currentId = currentChannel?.id;
  const renderItem = useCallback(
    ({item}: {item: Channel}) => {
      const {now} = getNowNext(epg, epgIdOf(item), nowMs);
      const progress = now
        ? Math.min(1, Math.max(0, (nowMs - now.start) / (now.stop - now.start)))
        : undefined;
      return (
        <ChannelItem
          channel={item}
          isCurrent={item.id === currentId}
          isFavorite={!!favorites[item.id]}
          nowTitle={now?.title}
          progress={progress}
          onPress={selectChannel}
          onToggleFavorite={toggleFavorite}
        />
      );
    },
    [epg, nowMs, currentId, favorites, selectChannel, toggleFavorite],
  );

  const extraData = useMemo(
    () => ({currentId, favorites, epg, tick: Math.floor(nowMs / 60000)}),
    [currentId, favorites, epg, nowMs],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const {now: nowProg, next: nextProg} = currentChannel
    ? getNowNext(epg, epgIdOf(currentChannel), nowMs)
    : {};

  // ── Boş / hata durumları ─────────────────────────────────────────────────
  const listEmpty = (
    <View style={styles.emptyBox}>
      {loading ? (
        <>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.emptyText}>Kanallar yükleniyor…</Text>
        </>
      ) : error ? (
        <>
          <Text style={styles.errorTitle}>Liste yüklenemedi</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void loadActiveSource()}>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </>
      ) : sources.length === 0 ? (
        <>
          <Text style={styles.errorTitle}>Henüz kaynak yok</Text>
          <Text style={styles.emptyText}>
            M3U bağlantısı, dosya veya Xtream Codes hesabı ekleyin.
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => setModalOpen(true)}>
            <Text style={styles.retryText}>Kaynak ekle</Text>
          </Pressable>
        </>
      ) : category === CAT_FAV && !favoriteCount ? (
        <Text style={styles.emptyText}>
          Henüz favori yok. Bir kanalın yanındaki ☆ simgesine dokunun.
        </Text>
      ) : (
        <Text style={styles.emptyText}>Eşleşen kanal bulunamadı.</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Üst başlık */}
      <View style={styles.header}>
        <Text style={styles.brand}>IPTV</Text>
        <Pressable onPress={() => setModalOpen(true)} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Kaynaklar</Text>
        </Pressable>
      </View>

      {/* Oynatıcı: 16:9, üstte sabit; dikey kaydırma = kanal değiştir */}
      <View {...swipe.panHandlers}>
        <VideoPlayer channel={currentChannel} paused={!appActive} />
      </View>

      <EpgStrip channel={currentChannel} now={nowProg} next={nextProg} nowMs={nowMs} />

      {/* Arama + kategori sekmeleri */}
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Kanal ara…"
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <CategoryTabs
        groups={groups}
        selected={category}
        favoriteCount={favoriteCount}
        onSelect={setCategory}
      />

      {/* Kanal listesi */}
      <FlatList
        ref={listRef}
        style={styles.list}
        data={filtered}
        extraData={extraData}
        keyExtractor={c => c.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={listEmpty}
      />

      {/* Alt çubuk: tek elle erişilebilir hızlı kanal değiştirme */}
      <View style={[styles.zapBar, {paddingBottom: Math.max(insets.bottom, 10)}]}>
        <Pressable
          onPress={() => zap(-1)}
          disabled={!filtered.length}
          style={({pressed}) => [styles.zapBtn, pressed && styles.zapBtnPressed]}>
          <Text style={styles.zapGlyph}>‹</Text>
          <Text style={styles.zapLabel}>Önceki</Text>
        </Pressable>

        <Pressable
          style={styles.zapCenter}
          onPress={() => {
            if (currentIndex >= 0) {
              try {
                listRef.current?.scrollToIndex({
                  index: currentIndex,
                  viewPosition: 0.3,
                  animated: true,
                });
              } catch {
                /* yok say */
              }
            }
          }}>
          <Text style={styles.zapName} numberOfLines={1}>
            {currentChannel ? currentChannel.name : 'Kanal seçilmedi'}
          </Text>
          <Text style={styles.zapSub}>
            {currentIndex >= 0
              ? `${currentIndex + 1} / ${filtered.length}`
              : `${filtered.length} kanal`}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => zap(1)}
          disabled={!filtered.length}
          style={({pressed}) => [styles.zapBtn, pressed && styles.zapBtnPressed]}>
          <Text style={styles.zapLabel}>Sonraki</Text>
          <Text style={styles.zapGlyph}>›</Text>
        </Pressable>
      </View>

      <SourceModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  brand: {color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 1.2},
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  headerBtnText: {color: colors.text, fontSize: 13, fontWeight: '600'},
  searchWrap: {paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8},
  search: {
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  list: {flex: 1, marginTop: 8},
  emptyBox: {alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 10},
  emptyText: {color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20},
  errorTitle: {color: colors.text, fontSize: 16, fontWeight: '700'},
  retryBtn: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {color: '#fff', fontWeight: '700', fontSize: 14},
  zapBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  zapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  zapBtnPressed: {backgroundColor: colors.border},
  zapGlyph: {color: colors.text, fontSize: 24, marginTop: -3},
  zapLabel: {color: colors.text, fontSize: 13, fontWeight: '600'},
  zapCenter: {flex: 1, alignItems: 'center'},
  zapName: {color: colors.text, fontSize: 14, fontWeight: '700'},
  zapSub: {color: colors.textDim, fontSize: 11, marginTop: 2},
});
