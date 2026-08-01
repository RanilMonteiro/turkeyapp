import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FolderOpen, Search, User } from 'lucide-react-native';
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

type Document = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  created_at: string;
  document_date: string | null;
  employee_id: string | null;
  employee: { full_name: string } | null;
};

export default function GrantedDocuments() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useFocusEffect(
    useCallback(() => {
      fetchDocuments();
    }, [])
  );

  async function fetchDocuments() {
    // RLS already restricts this to exactly the employees/categories
    // this admin has been granted — no extra filtering needed here.
    const { data } = await supabase
      .from('documents')
      .select('*, employee:employee_id(full_name)')
      .order('created_at', { ascending: false });

    if (data) setDocuments(data as any);
    setLoading(false);
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'personal': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'policy': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      case 'procedure': return { bg: isDark ? '#064e3b' : '#d1fae5', text: '#10b981' };
      case 'contract': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
      default: return { bg: isDark ? colors.gray[800] : colors.gray[200], text: colors.gray[500] };
    }
  }

  const filtered = documents.filter(d => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return d.name.toLowerCase().includes(q) || d.employee?.full_name?.toLowerCase().includes(q);
  });

  // Group by employee for a clearer overview
  const grouped = filtered.reduce((acc, doc) => {
    const key = doc.employee?.full_name ?? 'Unknown Employee';
    (acc[key] ??= []).push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Documents</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
          <Search color={theme.muted} size={16} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by document or employee name..."
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {documents.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <FolderOpen color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No documents yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              You haven't been granted access to any employee documents. Contact HR if you believe you should have access.
            </Text>
          </View>
        ) : Object.keys(grouped).length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No documents match your search</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([employeeName, docs]) => (
            <View key={employeeName} style={[styles.employeeGroup, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.employeeHeader}>
                <User color={colors.yellow} size={16} />
                <Text style={[styles.employeeName, { color: theme.text }]}>{employeeName}</Text>
              </View>
              {docs.map(doc => {
                const cat = getCategoryColor(doc.category);
                return (
                  <TouchableOpacity
                    key={doc.id}
                    style={[styles.docRow, { borderColor: theme.border }]}
                    onPress={() => {
                      const { Linking } = require('react-native');
                      Linking.openURL(doc.file_url);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{doc.name}</Text>
                      <View style={styles.docMetaRow}>
                        <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                          <Text style={[styles.catText, { color: cat.text }]}>{doc.category}</Text>
                        </View>
                        <Text style={[styles.docDate, { color: theme.muted }]}>
                          {doc.document_date
                            ? new Date(doc.document_date).toLocaleDateString('en-ZA')
                            : new Date(doc.created_at).toLocaleDateString('en-ZA')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>View</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14 },
  content: { padding: 16, gap: 12 },
  emptyCard: {
    padding: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  employeeGroup: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  employeeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  employeeName: { fontSize: 15, fontWeight: '700' },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, gap: 10 },
  docName: { fontSize: 14, fontWeight: '600' },
  docMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700' },
  docDate: { fontSize: 11 },
});