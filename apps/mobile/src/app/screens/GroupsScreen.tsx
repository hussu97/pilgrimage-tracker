import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroups } from '../../lib/api/client';
import type { Group } from '../../lib/types';
import { useI18n } from '../providers';

type MainTabParamList = { Home: undefined; Favorites: undefined; Groups: undefined; Profile: undefined };

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Groups'>>();
  const stackNav = tabNav.getParent();
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(() => {
    setLoading(true);
    setError('');
    getGroups()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionLabel}>{t('groups.title')}</Text>
          <Text style={styles.title}>My Groups</Text>
        </View>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => (stackNav as { navigate: (name: 'CreateGroup') => void })?.navigate('CreateGroup')}
          activeOpacity={0.8}
        >
          <Text style={styles.createButtonIcon}>+</Text>
          <Text style={styles.createButtonText}>{t('groups.createGroup')}</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchGroups} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && groups.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>◉</Text>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptyDesc}>Create a group or join one with an invite link.</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => (stackNav as { navigate: (name: 'CreateGroup') => void })?.navigate('CreateGroup')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>{t('groups.createGroup')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loading && !error && groups.length > 0 && (
        <View style={styles.list}>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.group_code}
              style={styles.card}
              onPress={() => (stackNav as { navigate: (name: 'GroupDetail', params: { groupCode: string }) => void })?.navigate('GroupDetail', { groupCode: g.group_code })}
              activeOpacity={0.8}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardName} numberOfLines={1}>{g.name}</Text>
                {g.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{g.description}</Text>
                ) : null}
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaText}>{g.member_count ?? 0} {t('groups.members')}</Text>
                  {g.created_at ? (
                    <Text style={styles.cardMetaText}>
                      Created {new Date(g.created_at).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0d9488',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexShrink: 0,
  },
  createButtonIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  createButtonText: { color: '#fff', fontWeight: '600' },
  loader: { marginVertical: 24 },
  errorWrap: { marginBottom: 16 },
  errorText: { color: '#c00', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: '#0d9488', fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: '#9ca3af' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  emptyCta: { backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: '#fff', fontWeight: '600' },
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#111' },
  cardDesc: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cardMetaText: { fontSize: 12, color: '#6b7280' },
  chevron: { fontSize: 20, color: '#9ca3af' },
});
