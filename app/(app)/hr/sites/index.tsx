import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Alert, TextInput, Modal
} from 'react-native';
import { Plus, MapPin, Edit, Trash2, X } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

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

type Site = {
  id: string;
  name: string;
  created_at: string;
};

export default function SitesManager() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteName, setSiteName] = useState('');
  const [saving, setSaving] = useState(false);

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
      fetchSites();
    }, [])
  );

  async function fetchSites() {
    const { data } = await supabase
      .from('sites')
      .select('*')
      .order('name', { ascending: true });
    if (data) setSites(data);
    setLoading(false);
  }

  function openCreateModal() {
    setEditingSite(null);
    setSiteName('');
    setModalVisible(true);
  }

  function openEditModal(site: Site) {
    setEditingSite(site);
    setSiteName(site.name);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!siteName.trim()) {
      Alert.alert('Missing name', 'Please enter a site name.');
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    if (editingSite) {
      const { error } = await supabase
        .from('sites')
        .update({ name: siteName.trim() })
        .eq('id', editingSite.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setModalVisible(false);
        fetchSites();
      }
    } else {
      const { error } = await supabase
        .from('sites')
        .insert({ name: siteName.trim(), created_by: userData.user?.id });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setModalVisible(false);
        fetchSites();
      }
    }
    setSaving(false);
  }

  async function handleDelete(site: Site) {
    Alert.alert(
      'Delete Site',
      `Are you sure you want to delete "${site.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sites')
              .delete()
              .eq('id', site.id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              fetchSites();
            }
          }
        }
      ]
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
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Sites</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreateModal}>
          <Plus color={colors.black} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sites.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <MapPin color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No sites yet</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              Tap + to add your first site
            </Text>
          </View>
        ) : (
          sites.map((site) => (
            <View
              key={site.id}
              style={[styles.siteCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={styles.siteLeft}>
                <View style={[styles.siteIcon, { backgroundColor: `${colors.yellow}20` }]}>
                  <MapPin color={colors.yellow} size={20} />
                </View>
                <View>
                  <Text style={[styles.siteName, { color: theme.text }]}>{site.name}</Text>
                  <Text style={[styles.siteDate, { color: theme.muted }]}>
                    Added {new Date(site.created_at).toLocaleDateString('en-ZA')}
                  </Text>
                </View>
              </View>
              <View style={styles.siteActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.input }]}
                  onPress={() => openEditModal(site)}
                >
                  <Edit color={colors.yellow} size={16} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: isDark ? '#3b1a1a' : '#fee2e2' }]}
                  onPress={() => handleDelete(site)}
                >
                  <Trash2 color="#ef4444" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingSite ? 'Edit Site' : 'New Site'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X color={theme.muted} size={24} />
              </TouchableOpacity>
            </View>

            {/* Site Name Input */}
            <View style={styles.modalBody}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE NAME *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Sibanye Gold Mine"
                placeholderTextColor={theme.subtext}
                value={siteName}
                onChangeText={setSiteName}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.black} />
                  : <Text style={styles.saveBtnText}>
                    {editingSite ? 'Save Changes' : 'Create Site'}
                  </Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  siteLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  siteIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  siteDate: { fontSize: 12 },
  siteActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});