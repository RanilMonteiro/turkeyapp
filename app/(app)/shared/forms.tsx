import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ClipboardList, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    200: '#e2e8f0',
    400: '#94a3b8',
    500: '#64748b',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  }
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  requires_approval: boolean;
};

export default function FormsList() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useFocusEffect(
    useCallback(() => {
      fetchTemplates();
    }, [])
  );

  async function fetchTemplates() {
    const { data: userData } = await supabase.auth.getUser();

    const [{ data: allTemplates }, { data: hidden }] = await Promise.all([
      supabase
        .from('form_templates')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('employee_hidden_forms')
        .select('template_id')
        .eq('employee_id', userData.user?.id),
    ]);

    const hiddenIds = new Set((hidden ?? []).map(h => h.template_id));
    const visible = (allTemplates ?? []).filter(t => !hiddenIds.has(t.id));

    setTemplates(visible);
    setLoading(false);
    setRefreshing(false);
  }

  function getCategoryColor(category: string | null) {
    switch (category) {
      case 'leave': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'ppe': return { bg: isDark ? '#064e3b' : '#d1fae5', text: '#10b981' };
      case 'vehicle': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
      case 'loan': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      case 'card_signout': return { bg: isDark ? '#1a2e1a' : '#d1fae5', text: '#10b981' };
      case 'slip': return { bg: isDark ? '#3b1a1a' : '#fee2e2', text: '#ef4444' };
      default: return { bg: isDark ? colors.gray[800] : colors.gray[200], text: colors.gray[500] };
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Forms</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/shared/my-requests' as any)}>
          <Text style={[styles.myRequestsBtn, { color: colors.yellow }]}>My Requests</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchTemplates(); }}
            tintColor={colors.yellow}
          />
        }
      >
        {templates.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ClipboardList color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No forms available</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              HR will add forms here
            </Text>
          </View>
        ) : (
          templates.map(template => {
            const cat = getCategoryColor(template.category);
            return (
              <TouchableOpacity
                key={template.id}
                style={[styles.templateCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => router.push(`/(app)/shared/submit-form/${template.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconBox, { backgroundColor: `${colors.yellow}20` }]}>
                  <ClipboardList color={colors.yellow} size={24} />
                </View>
                <View style={styles.templateInfo}>
                  <Text style={[styles.templateName, { color: theme.text }]}>{template.name}</Text>
                  {template.description && (
                    <Text style={[styles.templateDesc, { color: theme.subtext }]} numberOfLines={1}>
                      {template.description}
                    </Text>
                  )}
                  <View style={styles.templateMeta}>
                    {template.category && (
                      <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                        <Text style={[styles.catText, { color: cat.text }]}>
                          {template.category.replace('_', ' ')}
                        </Text>
                      </View>
                    )}
                    {template.requires_approval && (
                      <Text style={[styles.approvalNote, { color: theme.muted }]}>
                        Requires approval
                      </Text>
                    )}
                  </View>
                </View>
                <ChevronRight color={theme.muted} size={18} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  myRequestsBtn: { fontSize: 14, fontWeight: '600' },
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  templateCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 14, borderWidth: 1, gap: 12,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  templateInfo: { flex: 1 },
  templateName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  templateDesc: { fontSize: 13, marginBottom: 6 },
  templateMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  approvalNote: { fontSize: 11 },
});