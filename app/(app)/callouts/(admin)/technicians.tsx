import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Modal, FlatList
} from 'react-native';
import { User, Mail, ChevronRight, X, CheckCircle, Clock, Calendar } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  green: { medium: '#10b981', light: '#34d399', dark: '#064e3b' },
  blue: { medium: '#3b82f6', light: '#93c5fd', dark: '#1e3a5f' },
};

type Technician = {
  id: string;
  full_name: string;
  role: string;
  site_id: string | null;
};

type Callout = {
  id: string;
  title: string;
  site_name: string;
  address: string;
  date: string;
  time: string;
  status: string;
};

type GroupedCallouts = {
  [monthYear: string]: Callout[];
};

export default function Technicians() {
  const isDark = useColorScheme() === 'dark';
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [techCallouts, setTechCallouts] = useState<Callout[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    avatarBg: isDark ? colors.gray[800] : colors.gray[100],
    input: isDark ? colors.gray[800] : colors.gray[100],
  };

  useFocusEffect(
    useCallback(() => {
      fetchTechnicians();
    }, [])
  );

  async function fetchTechnicians() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'technician')
      .order('full_name', { ascending: true });

    if (!error && data) setTechnicians(data);
    setLoading(false);
  }

  async function fetchTechCallouts(techId: string) {
    setModalLoading(true);
    const { data, error } = await supabase
      .from('callouts')
      .select('*')
      .eq('assigned_to', techId)
      .order('date', { ascending: false });

    if (!error && data) setTechCallouts(data);
    setModalLoading(false);
  }

  function handleTechPress(tech: Technician) {
    setSelectedTech(tech);
    setModalVisible(true);
    fetchTechCallouts(tech.id);
  }

  // Group callouts by month
  function groupByMonth(callouts: Callout[]): GroupedCallouts {
    const grouped: GroupedCallouts = {};
    callouts.forEach(callout => {
      const date = new Date(callout.date);
      const monthYear = date.toLocaleDateString('en-ZA', {
        month: 'long',
        year: 'numeric',
      });
      if (!grouped[monthYear]) grouped[monthYear] = [];
      grouped[monthYear].push(callout);
    });
    return grouped;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed': return isDark ? colors.green.light : colors.green.medium;
      case 'accepted': return isDark ? colors.blue.light : colors.blue.medium;
      default: return '#f59e0b';
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'completed': return colors.green.dark;
        case 'accepted': return colors.blue.dark;
        default: return '#78350f';
      }
    } else {
      switch (status) {
        case 'completed': return '#d1fae5';
        case 'accepted': return '#dbeafe';
        default: return '#fef3c7';
      }
    }
  }

  const grouped = groupByMonth(techCallouts);
  const months = Object.keys(grouped);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Technicians</Text>
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          {technicians.length} technician{technicians.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {technicians.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.subtext }]}>No technicians yet</Text>
          <Text style={[styles.emptyHint, { color: theme.muted }]}>
            Technicians will appear here once created by the superuser
          </Text>
        </View>
      ) : (
        technicians.map((tech) => (
          <TouchableOpacity
            key={tech.id}
            style={[styles.techCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleTechPress(tech)}
            activeOpacity={0.8}
          >
            <View style={styles.techHeader}>
              <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
                <User size={24} color={colors.yellow} />
              </View>
              <View style={styles.techInfo}>
                <Text style={[styles.techName, { color: theme.text }]}>{tech.full_name}</Text>
                <View style={styles.roleRow}>
                  <View style={[styles.roleBadge, { backgroundColor: `${colors.yellow}20` }]}>
                    <Text style={[styles.roleText, { color: colors.yellow }]}>Technician</Text>
                  </View>
                </View>
              </View>
              <ChevronRight color={theme.muted} size={20} />
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Technician Callouts Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>

            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalAvatar, { backgroundColor: theme.avatarBg }]}>
                  <User size={20} color={colors.yellow} />
                </View>
                <View>
                  <Text style={[styles.modalName, { color: theme.text }]}>
                    {selectedTech?.full_name}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: theme.subtext }]}>
                    {techCallouts.length} callout{techCallouts.length !== 1 ? 's' : ''} total
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color={colors.yellow} size={24} />
              </TouchableOpacity>
            </View>

            {/* Stats Row */}
            {!modalLoading && (
              <View style={[styles.statsRow, { borderBottomColor: theme.border }]}>
                <View style={styles.statItem}>
                  <CheckCircle color={colors.green.medium} size={18} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {techCallouts.filter(c => c.status === 'completed').length}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Completed</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statItem}>
                  <Clock color="#3b82f6" size={18} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {techCallouts.filter(c => c.status === 'accepted').length}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Active</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statItem}>
                  <Calendar color={colors.yellow} size={18} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {months.length}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Months</Text>
                </View>
              </View>
            )}

            {/* Callouts List */}
            {modalLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.yellow} size="large" />
              </View>
            ) : techCallouts.length === 0 ? (
              <View style={styles.emptyModal}>
                <Text style={[styles.emptyText, { color: theme.subtext }]}>No callouts yet</Text>
                <Text style={[styles.emptyHint, { color: theme.muted }]}>
                  This technician hasnt accepted any callouts
                </Text>
              </View>
            ) : (
              <FlatList
                data={months}
                keyExtractor={(item) => item}
                contentContainerStyle={styles.modalList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: month }) => (
                  <View style={styles.monthGroup}>
                    {/* Month Header */}
                    <View style={styles.monthHeader}>
                      <View style={[styles.monthLine, { backgroundColor: theme.border }]} />
                      <Text style={[styles.monthTitle, { color: colors.yellow }]}>{month}</Text>
                      <View style={[styles.monthLine, { backgroundColor: theme.border }]} />
                    </View>

                    {/* Callouts in this month */}
                    {grouped[month].map((callout) => (
                      <View
                        key={callout.id}
                        style={[styles.calloutCard, {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                          borderLeftColor: getStatusColor(callout.status),
                        }]}
                      >
                        <View style={styles.calloutTop}>
                          <Text style={[styles.calloutTitle, { color: theme.text }]} numberOfLines={1}>
                            {callout.title}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusBg(callout.status) }]}>
                            <Text style={[styles.statusText, { color: getStatusColor(callout.status) }]}>
                              {callout.status}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.calloutSite, { color: colors.yellow }]}>
                          {callout.site_name}
                        </Text>
                        <Text style={[styles.calloutDetail, { color: theme.subtext }]}>
                          📍 {callout.address}
                        </Text>
                        <Text style={[styles.calloutDetail, { color: theme.subtext }]}>
                          📅 {callout.date} at {callout.time}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 15 },
  emptyCard: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  techCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  techHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  techInfo: { flex: 1 },
  techName: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  roleRow: { flexDirection: 'row' },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  roleText: { fontSize: 12, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalName: { fontSize: 18, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    marginHorizontal: 8,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  modalList: { padding: 16, paddingBottom: 40 },
  monthGroup: { marginBottom: 8 },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
    gap: 10,
  },
  monthLine: { flex: 1, height: 1 },
  monthTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  calloutCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 10,
  },
  calloutTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  calloutTitle: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  calloutSite: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  calloutDetail: { fontSize: 12, marginBottom: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '600' },
  emptyModal: {
    padding: 60,
    alignItems: 'center',
  },
});