import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/app/navigation';
import { useI18n, useTheme } from '@/app/providers';
import { getMyCheckIns, getOnThisDayCheckIns, getThisMonthCheckIns } from '@/lib/api/client';
import type { CheckIn } from '@/lib/types';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getDatesWithCheckIns(checkIns: CheckIn[]): Set<string> {
  const set = new Set<string>();
  checkIns.forEach((c) => {
    if (c.checked_in_at) {
      const d = new Date(c.checked_in_at);
      set.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
  });
  return set;
}

function getMonthDays(year: number, month: number): { date: Date; isCurrent: boolean }[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: { date: Date; isCurrent: boolean }[] = [];
  const prevMonth = new Date(year, month, 0);
  const prevCount = prevMonth.getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevCount - i), isCurrent: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrent: true });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), isCurrent: false });
  }
  return days;
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    header: { paddingHorizontal: 24, marginBottom: 24 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: { fontSize: 32, fontWeight: '700', color: textMain, letterSpacing: -1 },
    subtitle: { fontSize: 14, color: textSecondary, marginTop: 4, fontWeight: '500' },
    loader: { marginVertical: 24, alignSelf: 'center' },
    errorWrap: { paddingHorizontal: 24, marginBottom: 16 },
    errorText: { color: '#b91c1c', marginBottom: 8 },
    retryButton: { alignSelf: 'flex-start' },
    retryText: { color: tokens.colors.primary, fontWeight: '600' },
    emptyWrap: {
      marginHorizontal: 24,
      paddingVertical: 48,
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    emptyIcon: { fontSize: 48, marginBottom: 16, color: textMuted },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: textMain, marginBottom: 20 },
    emptyCta: {
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    emptyCtaText: { color: '#fff', fontWeight: '600' },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 24,
      marginBottom: 24,
      padding: 24,
      backgroundColor: surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.subtle,
    },
    statsLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    statsRow: { flexDirection: 'row', alignItems: 'baseline' },
    statsTotal: {
      fontSize: 40,
      fontWeight: '300',
      color: isDark ? tokens.colors.primary : tokens.colors.primaryDark,
    },
    statsSuffix: { fontSize: 14, color: textMuted },
    statsLeft: { flex: 1 },
    statsDivider: { width: 1, height: 48, backgroundColor: border, marginHorizontal: 16 },
    statsRight: { alignItems: 'flex-end' },
    statsThisMonthLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: textSecondary,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    statsThisMonthValue: { fontSize: 24, fontWeight: '600', color: textMain },
    statsThisMonthSuffix: {
      fontSize: 10,
      color: textMuted,
      textTransform: 'uppercase',
      fontWeight: 'bold',
    },
    calendarSection: { paddingHorizontal: 24, marginBottom: 24 },
    calendarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    calendarTitle: { fontSize: 18, fontWeight: '600', color: textMain },
    calendarNav: { flexDirection: 'row', gap: 8 },
    calendarNavBtn: { padding: 4 },
    calendarNavIcon: { fontSize: 20, color: textMuted },
    calendarCard: {
      backgroundColor: surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.subtle,
    },
    weekdayRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 12,
    },
    weekdayLabel: { fontSize: 12, fontWeight: '600', color: textMuted },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      position: 'relative',
    },
    dayDot: {
      position: 'absolute',
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#1a2a4e' : '#eff6ff',
    },
    dayDotToday: { backgroundColor: tokens.colors.primary },
    dayNum: { fontSize: 14, color: textMain },
    dayNumMuted: { color: textMuted },
    dayNumBold: {
      fontWeight: '600',
      color: isDark ? tokens.colors.primary : tokens.colors.primaryDark,
    },
    dayNumToday: { color: '#fff', fontWeight: '600' },
    sectionWrap: { marginBottom: 8 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginHorizontal: 24,
      marginBottom: 8,
      marginTop: 16,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: textMuted,
      marginHorizontal: 24,
      marginBottom: 12,
    },
    visitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 24,
      marginBottom: 12,
      padding: 16,
      height: 128,
      backgroundColor: surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.subtle,
    },
    visitThumb: {
      width: 96,
      height: 96,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: isDark ? '#2a3a5e' : tokens.colors.softBlue,
      marginRight: 16,
    },
    ratingBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: tokens.colors.primary,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      flexDirection: 'row',
      alignItems: 'center',
    },
    ratingBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    visitThumbImg: { width: '100%', height: '100%' },
    visitThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    visitThumbIcon: { fontSize: 28, color: textMuted },
    visitBody: { flex: 1, minWidth: 0 },
    visitName: { fontSize: 16, fontWeight: '600', color: textMain },
    visitDate: { fontSize: 12, color: textMuted, marginTop: 4 },
    visitLocation: { fontSize: 11, color: textSecondary, marginTop: 4 },
    chevron: { fontSize: 20, color: textMuted },
  });
}

export default function CheckInsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'CheckInsList'>>();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [onThisDay, setOnThisDay] = useState<CheckIn[]>([]);
  const [thisMonth, setThisMonth] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      getMyCheckIns(),
      getOnThisDayCheckIns().catch(() => [] as CheckIn[]),
      getThisMonthCheckIns().catch(() => [] as CheckIn[]),
    ])
      .then(([all, otd, tm]) => {
        setCheckIns(all);
        setOnThisDay(otd);
        setThisMonth(tm);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const datesSet = useMemo(() => getDatesWithCheckIns(checkIns), [checkIns]);
  const totalCount = checkIns.length;
  const now = new Date();

  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );
  const monthDays = useMemo(
    () => getMonthDays(calendarMonth.year, calendarMonth.month),
    [calendarMonth],
  );

  const goPrevMonth = () => {
    setCalendarMonth((m) =>
      m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 },
    );
  };
  const goNextMonth = () => {
    setCalendarMonth((m) =>
      m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 },
    );
  };

  const dateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hasCheckIn = (d: Date) => datesSet.has(dateKey(d));
  const isToday = (d: Date) => dateKey(d) === dateKey(now);

  const recentCheckIns = useMemo(
    () =>
      [...checkIns]
        .sort((a, b) => (b.checked_in_at || '').localeCompare(a.checked_in_at || ''))
        .slice(0, 10),
    [checkIns],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={fetchList}
          colors={[tokens.colors.primary]}
          tintColor={tokens.colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="arrow-back"
            size={20}
            color={isDark ? '#fff' : tokens.colors.textDark}
          />
        </TouchableOpacity>
        <Text style={styles.title}>{t('journey.journeyLog')}</Text>
        <Text style={styles.subtitle}>
          {t('checkins.historySubtitle') || 'Relive your pilgrimage moments'}
        </Text>
      </View>

      {loading && (
        <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />
      )}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchList} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error && checkIns.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>⊕</Text>
          <Text style={styles.emptyTitle}>{t('profile.noCheckInsYet')}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('Main' as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>{t('profile.exploreCta')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && checkIns.length > 0 && (
        <>
          <View style={styles.statsCard}>
            <View style={styles.statsLeft}>
              <Text style={styles.statsLabel}>{t('journey.totalVisits')}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statsTotal}>{totalCount}</Text>
              </View>
              <Text style={styles.statsSuffix}>{t('journey.sacredPlaces')}</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsRight}>
              <Text style={styles.statsThisMonthLabel}>{t('journey.thisMonth')}</Text>
              <Text style={styles.statsThisMonthValue}>{thisMonth.length}</Text>
              <Text style={styles.statsThisMonthSuffix}>
                {t('journey.checkIns') || 'Check-ins'}
              </Text>
            </View>
          </View>

          {/* On This Day */}
          {onThisDay.length > 0 && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>{t('checkins.onThisDay')}</Text>
              <Text style={styles.sectionSubtitle}>{t('checkins.onThisDayDescription')}</Text>
              {onThisDay.map((c) => (
                <TouchableOpacity
                  key={c.check_in_code}
                  style={styles.visitCard}
                  onPress={() => navigation.navigate('PlaceDetail', { placeCode: c.place_code })}
                  activeOpacity={0.8}
                >
                  <View style={styles.visitThumb}>
                    {c.place_image_url || c.place?.images?.[0]?.url ? (
                      <Image
                        source={{
                          uri: getFullImageUrl(c.place_image_url || c.place?.images?.[0]?.url),
                        }}
                        style={styles.visitThumbImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.visitThumbPlaceholder}>
                        <Text style={styles.visitThumbIcon}>⊕</Text>
                      </View>
                    )}
                    {c.place?.average_rating ? (
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingBadgeText}>
                          ★ {c.place.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.visitBody}>
                    <Text style={styles.visitName} numberOfLines={1}>
                      {c.place?.name ?? c.place_name ?? c.place_code}
                    </Text>
                    <Text style={styles.visitDate}>
                      {c.checked_in_at
                        ? new Date(c.checked_in_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : (c.date ?? '')}
                    </Text>
                    {(c.location || c.place?.address) && (
                      <Text style={styles.visitLocation} numberOfLines={1}>
                        {(c.location || c.place?.address || '').split(',')[0].trim()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.calendarSection}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <View style={styles.calendarNav}>
                <TouchableOpacity onPress={goPrevMonth} style={styles.calendarNavBtn}>
                  <Text style={styles.calendarNavIcon}>‹</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={goNextMonth} style={styles.calendarNavBtn}>
                  <Text style={styles.calendarNavIcon}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.calendarCard}>
              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((l, i) => (
                  <Text key={i} style={styles.weekdayLabel}>
                    {l}
                  </Text>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {monthDays.map(({ date, isCurrent }, i) => {
                  const has = hasCheckIn(date);
                  const today = isCurrent && isToday(date);
                  return (
                    <View key={i} style={styles.dayCell}>
                      {has && <View style={[styles.dayDot, today && styles.dayDotToday]} />}
                      <Text
                        style={[
                          styles.dayNum,
                          !isCurrent && styles.dayNumMuted,
                          has && styles.dayNumBold,
                          today && styles.dayNumToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* This Month */}
          {thisMonth.length > 0 && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>{t('checkins.thisMonth')}</Text>
              {thisMonth.map((c) => (
                <TouchableOpacity
                  key={c.check_in_code}
                  style={styles.visitCard}
                  onPress={() => navigation.navigate('PlaceDetail', { placeCode: c.place_code })}
                  activeOpacity={0.8}
                >
                  <View style={styles.visitThumb}>
                    {c.place_image_url || c.place?.images?.[0]?.url ? (
                      <Image
                        source={{
                          uri: getFullImageUrl(c.place_image_url || c.place?.images?.[0]?.url),
                        }}
                        style={styles.visitThumbImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.visitThumbPlaceholder}>
                        <Text style={styles.visitThumbIcon}>⊕</Text>
                      </View>
                    )}
                    {c.place?.average_rating ? (
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingBadgeText}>
                          ★ {c.place.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.visitBody}>
                    <Text style={styles.visitName} numberOfLines={1}>
                      {c.place?.name ?? c.place_name ?? c.place_code}
                    </Text>
                    <Text style={styles.visitDate}>
                      {c.checked_in_at
                        ? new Date(c.checked_in_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : (c.date ?? '')}
                    </Text>
                    {(c.location || c.place?.address) && (
                      <Text style={styles.visitLocation} numberOfLines={1}>
                        {(c.location || c.place?.address || '').split(',')[0].trim()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('journey.recentVisits')}</Text>
          {recentCheckIns.map((c) => (
            <TouchableOpacity
              key={c.check_in_code}
              style={styles.visitCard}
              onPress={() => navigation.navigate('PlaceDetail', { placeCode: c.place_code })}
              activeOpacity={0.8}
            >
              <View style={styles.visitThumb}>
                {c.place_image_url || c.place?.images?.[0]?.url ? (
                  <Image
                    source={{
                      uri: getFullImageUrl(c.place_image_url || c.place?.images?.[0]?.url),
                    }}
                    style={styles.visitThumbImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.visitThumbPlaceholder}>
                    <Text style={styles.visitThumbIcon}>⊕</Text>
                  </View>
                )}
                {c.place?.average_rating ? (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>
                      ★ {c.place.average_rating.toFixed(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.visitBody}>
                <Text style={styles.visitName} numberOfLines={1}>
                  {c.place?.name ?? c.place_name ?? c.place_code}
                </Text>
                <Text style={styles.visitDate}>
                  {c.checked_in_at
                    ? new Date(c.checked_in_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : (c.date ?? '')}
                  {c.time ? ` · ${c.time}` : ''}
                </Text>
                {(c.location || c.place?.address) && (
                  <Text style={styles.visitLocation} numberOfLines={1}>
                    {(c.location || c.place?.address || '').split(',')[0].trim() ||
                      c.place?.address}
                  </Text>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}
