import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Linking, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, FolderOpen } from 'lucide-react-native';
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
  file_type: string | null;
  created_at: string;
};

export default function MyDocuments() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [documents, setDocuments] = useState<Document[]>([]);
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
      fetchDocuments();
    }, [])
  );

  async function fetchDocuments() {
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('employee_id', userData.user?.id)
      .eq('visible_to_employee', true)
      .order('created_at', { ascending: false });

    if (data) setDocuments(data);
    setLoading(false);
    setRefreshing(false);
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>My Documents</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchDocuments(); }}
            tintColor={colors.yellow}
          />
        }
      >
        {documents.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <FolderOpen color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No documents yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              HR will upload your documents here
            </Text>
          </View>
        ) : (
          documents.map(doc => {
            const cat = getCategoryColor(doc.category);
            return (
              <TouchableOpacity
                key={doc.id}
                style={[styles.docCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => Linking.openURL(doc.file_url)}
                activeOpacity={0.8}
              >
                <View style={[styles.docIcon, { backgroundColor: `${colors.yellow}20` }]}>
                  <FileText color={colors.yellow} size={22} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={[styles.docName, { color: theme.text }]}>{doc.name}</Text>
                  <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                    <Text style={[styles.catText, { color: cat.text }]}>{doc.category}</Text>
                  </View>
                  <Text style={[styles.docDate, { color: theme.muted }]}>
                    {new Date(doc.created_at).toLocaleDateString('en-ZA')}
                  </Text>
                </View>
                <Text style={[styles.openText, { color: colors.yellow }]}>Open</Text>
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
  content: { padding: 16, gap: 10 },
  emptyCard: {
    padding: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', gap: 8, marginTop: 24,
  },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  docCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1, gap: 12,
  },
  docIcon: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 4 },
  catText: { fontSize: 10, fontWeight: '700' },
  docDate: { fontSize: 11 },
  openText: { fontSize: 13, fontWeight: '700' },
});