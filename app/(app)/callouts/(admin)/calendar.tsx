import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Clock, MapPin, User } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['S','M','T','W','T','F','S'],
  today: 'Today'
};
LocaleConfig.defaultLocale = 'en';

type Callout = {
  id: string;
  title: string;
  site_name: string;
  address: string;
  date: string;
  time: string;
  status: string;
  assigned_to: string | null;
  profiles: { full_name: string } | null;
};

type MarkedDates = {
  [key: string]: {
    marked: boolean;
    dotColor: string;
    selected?: boolean;
    selectedColor?: string;
  };
};

export default function AdminCalendar() {
  const isDark = useColorScheme() === 'dark';
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [loading, setLoading] = useState(true);

  const theme = {
    background: isDark ? '#000000' : '#f8fafc',
    surface: isDark ? '#0f172a' : '#ffffff',
    card: isDark ? '#1e293b' : '#ffffff',
    border: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#ffffff' : '#1e293b',
    subtext: isDark ? '#94a3b8' : '#64748b',
    muted: isDark ? '#64748b' : '#94a3b8',
    accent: '#fbbf24',
  };

  useFocusEffect(
    useCallback(() => {
      fetchCallouts();
    }, [])
  );

  async function fetchCallouts() {
    const { data, error } = await supabase
      .from('callouts')
      .select('*, profiles:assigned_to(full_name)')
      .order('date', { ascending: true });

    if (!error && data) setCallouts(data);
    setLoading(false);
  }

  // Build marked dates from real callouts
  const markedDates: MarkedDates = {};
  callouts.forEach(callout => {
    const existing = markedDates[callout.date];
    let dotColor = '#fbbf24'; // pending - yellow
    if (callout.status === 'accepted') dotColor = '#3b82f6'; // blue
    if (callout.status === 'completed') dotColor = '#10b981'; // green

    if (!existing) {
      markedDates[callout.date] = {
        marked: true,
        dotColor,
      };
    }
  });

  // Mark selected date
  markedDates[selectedDate] = {
    ...markedDates[selectedDate],
    marked: markedDates[selectedDate]?.marked ?? false,
    dotColor: markedDates[selectedDate]?.dotColor ?? theme.accent,
    selected: true,
    selectedColor: '#fbbf24',
  };

  // Filter callouts for selected date
  const selectedCallouts = callouts.filter(c => c.date === selectedDate);

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return '#94a3b8';
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'pending': return '#78350f';
        case 'accepted': return '#1e3a5f';
        case 'completed': return '#064e3b';
        default: return '#334155';
      }
    } else {
      switch (status) {
        case 'pending': return '#fef3c7';
        case 'accepted': return '#dbeafe';
        case 'completed': return '#d1fae5';
        default: return '#f1f5f9';
      }
    }
  }

  function formatDateHeader(dateString: string) {
    const date = new Date(dateString);
    const todayDate = new Date();
    const tomorrow = new Date(todayDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === todayDate.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Calendar */}
      <View style={[styles.calendarWrapper, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Calendar
          current={today}
          markedDates={markedDates}
          onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
          theme={{
            backgroundColor: theme.surface,
            calendarBackground: theme.surface,
            textSectionTitleColor: theme.subtext,
            selectedDayBackgroundColor: '#fbbf24',
            selectedDayTextColor: '#000000',
            todayTextColor: '#fbbf24',
            dayTextColor: theme.text,
            textDisabledColor: theme.muted,
            dotColor: '#fbbf24',
            selectedDotColor: '#000000',
            arrowColor: '#fbbf24',
            monthTextColor: theme.text,
            textDayFontWeight: '400',
            textMonthFontWeight: '600',
            textDayHeaderFontWeight: '500',
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 12,
          }}
        />
      </View>

      {/* Legend */}
      <View style={[styles.legend, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={[styles.legendText, { color: theme.subtext }]}>Pending</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={[styles.legendText, { color: theme.subtext }]}>Accepted</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text style={[styles.legendText, { color: theme.subtext }]}>Completed</Text>
        </View>
      </View>

      {/* Callouts for selected date */}
      <ScrollView style={styles.jobsContainer} showsVerticalScrollIndicator={false}>
        <Text style={[styles.dateHeader, { color: theme.text }]}>
          {formatDateHeader(selectedDate)}
        </Text>

        {selectedCallouts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No callouts on this date</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countText, { color: theme.subtext }]}>
              {selectedCallouts.length} callout{selectedCallouts.length !== 1 ? 's' : ''}
            </Text>
            {selectedCallouts.map((callout) => (
              <View
                key={callout.id}
                style={[styles.calloutCard, {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderLeftColor: getStatusColor(callout.status),
                }]}
              >
                {/* Title + Status */}
                <View style={styles.cardHeader}>
                  <Text style={[styles.calloutTitle, { color: theme.text }]} numberOfLines={1}>
                    {callout.title}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBg(callout.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(callout.status) }]}>
                      {callout.status}
                    </Text>
                  </View>
                </View>

                {/* Site */}
                <Text style={[styles.siteName, { color: '#fbbf24' }]}>
                  {callout.site_name}
                </Text>

                {/* Details */}
                <View style={styles.detailRow}>
                  <Clock size={13} color={theme.subtext} />
                  <Text style={[styles.detailText, { color: theme.subtext }]}>{callout.time}</Text>
                </View>

                <View style={styles.detailRow}>
                  <MapPin size={13} color={theme.subtext} />
                  <Text style={[styles.detailText, { color: theme.subtext }]} numberOfLines={1}>
                    {callout.address}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <User size={13} color={theme.subtext} />
                  <Text style={[styles.detailText, { color: theme.subtext }]}>
                    {callout.profiles?.full_name ?? 'Unassigned'}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calendarWrapper: {
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 12 },
  jobsContainer: { flex: 1, padding: 16 },
  dateHeader: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  countText: { fontSize: 13, marginBottom: 12 },
  emptyCard: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyText: { fontSize: 15 },
  calloutCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  calloutTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  siteName: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  detailText: { fontSize: 13, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '600' },
});