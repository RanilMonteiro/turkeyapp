import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, ClipboardList, Edit, Trash2 } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';
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

type FormTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  requires_approval: boolean;
  is_active: boolean;
  created_at: string;
};

export default function FormsManager() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[50],
  };

  useFocusEffect(
    useCallback(() => {
      fetchForms();
    }, [])
  );

  async function fetchForms() {
    const { data } = await supabase
      .from('form_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setForms(data);
    setLoading(false);
  }

  async function toggleActive(form: FormTemplate) {
    const { error } = await supabase
      .from('form_templates')
      .update({ is_active: !form.is_active })
      .eq('id', form.id);
    if (error) {
      notify('Error', error.message);
      return;
    }
    fetchForms();
  }

  function deleteForm(form: FormTemplate) {
    confirm(
      'Delete Form',
      `Are you sure you want to delete "${form.name}"? All submissions will also be deleted.`,
      async () => {
        const { error } = await supabase
          .from('form_templates')
          .delete()
          .eq('id', form.id);

        if (error) {
          notify('Error', error.message);
        } else {
          fetchForms();
        }
      }
    );
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
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Forms</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(app)/hr/forms/create' as any)}
        >
          <Plus color={colors.black} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {forms.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ClipboardList color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No forms yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              Tap + to create your first form
            </Text>
          </View>
        ) : (
          forms.map((form) => {
            const cat = getCategoryColor(form.category);
            return (
              <View
                key={form.id}
                style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={styles.formTop}>
                  <View style={styles.formInfo}>
                    <Text style={[styles.formName, { color: theme.text }]}>{form.name}</Text>
                    {form.description && (
                      <Text style={[styles.formDesc, { color: theme.subtext }]} numberOfLines={1}>
                        {form.description}
                      </Text>
                    )}
                    <View style={styles.formMeta}>
                      {form.category && (
                        <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                          <Text style={[styles.catText, { color: cat.text }]}>
                            {form.category.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.statusBadge, {
                        backgroundColor: form.is_active
                          ? isDark ? '#064e3b' : '#d1fae5'
                          : isDark ? colors.gray[800] : colors.gray[200]
                      }]}>
                        <Text style={[styles.statusText, {
                          color: form.is_active ? '#10b981' : theme.muted
                        }]}>
                          {form.is_active ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                      {form.requires_approval && (
                        <View style={[styles.statusBadge, { backgroundColor: isDark ? '#78350f' : '#fef3c7' }]}>
                          <Text style={[styles.statusText, { color: '#f59e0b' }]}>Needs Approval</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={[styles.formActions, { borderTopColor: theme.border }]}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => router.push(`/(app)/hr/forms/${form.id}` as any)}
                  >
                    <Edit color={colors.yellow} size={16} />
                    <Text style={[styles.actionText, { color: colors.yellow }]}>Edit</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => toggleActive(form)}
                  >
                    <Text style={[styles.actionText, { color: form.is_active ? theme.subtext : '#10b981' }]}>
                      {form.is_active ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => deleteForm(form)}
                  >
                    <Trash2 color="#ef4444" size={16} />
                    <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.yellow,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, gap: 12 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  formTop: { padding: 16 },
  formInfo: { flex: 1 },
  formName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  formDesc: { fontSize: 13, marginBottom: 8 },
  formMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '600' },
  formActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  divider: { width: 1, marginVertical: 8 },
});