import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FolderOpen, Search, Folder, ChevronDown } from 'lucide-react-native';
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

const DOC_CATEGORIES = [
  { value: 'personal', label: 'Personal Document' },
  { value: 'policy', label: 'Policy' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'contract', label: 'Contract' },
  { value: 'form', label: 'Form' },
  { value: 'other', label: 'Other' },
];

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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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

  const searchActive = search.trim().length > 0;

  const filteredFlat = documents.filter(d => {
    const q = search.trim().toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.employee?.full_name ?? '').toLowerCase().includes(q);
  });

  // Only categories that actually have at least one granted document
  // show up as a folder — no empty subfolders.
  const docsByCategory = documents.reduce((acc, doc) => {
    (acc[doc.category] ??= []).push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  const categoriesWithDocs = DOC_CATEGORIES.filter(c => (docsByCategory[c.value]?.length ?? 0) > 0);

  function DocRow({ doc }: { doc: Document }) {
    const cat = getCategoryColor(doc.category);
    return (
      <TouchableOpacity
        style={[styles.docRow, { borderColor: theme.border }]}
        onPress={() => {
          const { Linking } = require('react-native');
          Linking.openURL(doc.file_url);
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{doc.name}</Text>
          <View style={styles.docMetaRow}>
            <Text style={[styles.docEmployee, { color: theme.subtext }]} numberOfLines={1}>
              {doc.employee?.full_name ?? 'Unknown Employee'}
            </Text>
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
        <TouchableOpacity onPress={() => (expandedCategory ? setExpandedCategory(null) : router.back())}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {expandedCategory
            ? DOC_CATEGORIES.find(c => c.value === expandedCategory)?.label ?? 'Documents'
            : 'Documents'}
        </Text>
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
        ) : searchActive ? (
          // Search overrides folder view — flat filtered list
          filteredFlat.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.subtext }]}>No documents match your search</Text>
            </View>
          ) : (
            <View style={[styles.folderContentsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {filteredFlat.map(doc => <DocRow key={doc.id} doc={doc} />)}
            </View>
          )
        ) : expandedCategory ? (
          // Inside a category folder
          <View style={[styles.folderContentsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {(docsByCategory[expandedCategory] ?? []).map(doc => <DocRow key={doc.id} doc={doc} />)}
          </View>
        ) : (
          // Top-level: category folders, only ones with documents
          <View style={[styles.folderListCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {categoriesWithDocs.map(cat => {
              const count = docsByCategory[cat.value].length;
              const catColor = getCategoryColor(cat.value);
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.folderRow, { borderColor: theme.border }]}
                  onPress={() => setExpandedCategory(cat.value)}
                >
                  <View style={[styles.folderIcon, { backgroundColor: catColor.bg }]}>
                    <Folder color={catColor.text} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.folderName, { color: theme.text }]}>{cat.label}</Text>
                    <Text style={[styles.folderCount, { color: theme.muted }]}>
                      {count} document{count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <ChevronDown color={theme.muted} size={16} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>
              );
            })}
          </View>
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
  folderListCard: { borderRadius: 14, borderWidth: 1, padding: 8 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8, borderTopWidth: 1,
  },
  folderIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  folderName: { fontSize: 14, fontWeight: '600' },
  folderCount: { fontSize: 12, marginTop: 2 },
  folderContentsCard: { borderRadius: 14, borderWidth: 1, padding: 8 },
  docRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: 8, borderTopWidth: 1, gap: 10,
  },
  docName: { fontSize: 14, fontWeight: '600' },
  docMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  docEmployee: { fontSize: 12, flexShrink: 1 },
  docDate: { fontSize: 11 },
});