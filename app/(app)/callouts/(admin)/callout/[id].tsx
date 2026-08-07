import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Linking, Platform, Alert, Image, Modal, TextInput
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Navigation, Clock, User, Wrench, Edit3, X } from 'lucide-react-native';
import { supabase } from '../../../../../lib/supabase';

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

type Callout = {
  id: string;
  title: string;
  site_name: string;
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  date: string;
  time: string;
  status: string;
  assigned_to: string | null;
  profiles: { full_name: string } | null;
  time_in: string | null;
  time_out: string | null;
  machines_tested: number | null;
  signature_url: string | null;
   invoice_number: string | null;
  closed_on_tam: boolean;
  tam_job_number: string | null;
  slip_url: string | null;
};

export default function CalloutDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [callout, setCallout] = useState<Callout | null>(null);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSiteName, setEditSiteName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [invoiceModal, setInvoiceModal] = useState(false);
const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
const [savingInvoice, setSavingInvoice] = useState(false);

  const theme = {
    background: isDark ? colors.black : '#f8fafc',
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useEffect(() => {
    fetchCallout();
  }, [id]);

  async function fetchCallout() {
    const { data } = await supabase
      .from('callouts')
      .select('*, profiles:assigned_to(full_name)')
      .eq('id', id)
      .single();

    if (data) setCallout(data);
    setLoading(false);
  }

  function openEditModal() {
    if (!callout) return;
    setEditTitle(callout.title);
    setEditDescription(callout.description ?? '');
    setEditSiteName(callout.site_name);
    setEditAddress(callout.address);
    setEditDate(callout.date);
    setEditTime(callout.time);
    setEditModal(true);
  }

function openInvoiceModal() {
  setEditInvoiceNumber(callout?.invoice_number ?? '');
  setInvoiceModal(true);
}

async function handleSaveInvoice() {
  setSavingInvoice(true);

  const { error } = await supabase
    .from('callouts')
    .update({ invoice_number: editInvoiceNumber.trim() || null })
    .eq('id', id);

  setSavingInvoice(false);

  if (error) {
    Alert.alert('Error', error.message);
    return;
  }

  setInvoiceModal(false);
  fetchCallout();
}

  async function handleSaveEdit() {
    if (!editTitle.trim() || !editSiteName.trim() || !editAddress.trim() || !editDate.trim() || !editTime.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('callouts')
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        site_name: editSiteName.trim(),
        address: editAddress.trim(),
        date: editDate.trim(),
        time: editTime.trim(),
      })
      .eq('id', id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setEditModal(false);
    fetchCallout();
  }

 function cancelCallout() {
  const message = 'Are you sure you want to cancel this callout? It will no longer be active or available to accept.';

  const performCancel = async () => {
    const { error } = await supabase
      .from('callouts')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      if (Platform.OS === 'web') {
        window.alert(`Error: ${error.message}`);
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      fetchCallout();
    }
  };

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(message);
    if (confirmed) performCancel();
  } else {
    Alert.alert(
      'Cancel Callout',
      message,
      [
        { text: 'No, keep it', style: 'cancel' },
        { text: 'Yes, cancel it', style: 'destructive', onPress: performCancel },
      ]
    );
  }
}

async function deleteCallout() {
  const message = 'Are you sure you want to delete this callout? This cannot be undone.';

  const performDelete = async () => {
    await supabase.from('callouts').delete().eq('id', id);
    router.back();
  };

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(message);
    if (confirmed) await performDelete();
  } else {
    Alert.alert(
      'Delete Callout',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]
    );
  }
}
  function openInMaps() {
    if (!callout?.latitude || !callout?.longitude) return;
    const url = Platform.select({
      ios: `maps:${callout.latitude},${callout.longitude}?q=${callout.address}`,
      android: `geo:${callout.latitude},${callout.longitude}?q=${callout.address}`,
    });
    if (url) Linking.openURL(url);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#3b82f6';
      case 'completed': return '#10b981';
      case 'cancelled': return '#ef4444';
      default: return colors.gray[400];
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'pending': return '#78350f';
        case 'accepted': return '#1e3a5f';
        case 'completed': return '#064e3b';
        case 'cancelled': return '#3b1a1a';
        default: return colors.gray[800];
      }
    } else {
      switch (status) {
        case 'pending': return '#fef3c7';
        case 'accepted': return '#dbeafe';
        case 'completed': return '#d1fae5';
        case 'cancelled': return '#fee2e2';
        default: return colors.gray[200];
      }
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (!callout) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.subtext }}>Callout not found</Text>
      </View>
    );
  }

  const canEditOrCancel = callout.status === 'pending' || callout.status === 'accepted';

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Callout Details</Text>
        {canEditOrCancel ? (
          <TouchableOpacity onPress={openEditModal}>
            <Edit3 color={colors.yellow} size={22} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.content}>

        {/* Title + Status */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {callout.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusBg(callout.status) }]}>
              <Text style={[styles.statusText, { color: getStatusColor(callout.status) }]}>
                {callout.status}
              </Text>
            </View>
          </View>
          <Text style={[styles.siteName, { color: colors.yellow }]}>
            {callout.site_name}
          </Text>
          {callout.description && (
            <Text style={[styles.description, { color: theme.subtext }]}>
              {callout.description}
            </Text>
          )}
        </View>

        {/* Job Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Details</Text>

          <View style={styles.detailRow}>
            <Clock color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.date} at {callout.time}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <MapPin color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.address}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <User color={colors.yellow} size={16} />
            <Text style={[styles.detailText, { color: theme.subtext }]}>
              {callout.profiles?.full_name ?? 'Unassigned'}
            </Text>
          </View>

          {callout.latitude && callout.longitude && (
            <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
              <Navigation color={colors.black} size={16} />
              <Text style={styles.mapsButtonText}>Open in Maps</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Completion Details */}
        {callout.status === 'completed' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Completion Details</Text>

            {callout.time_in && (
              <View style={styles.detailRow}>
                <Clock color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Time in: {callout.time_in}
                </Text>
              </View>
            )}

            {callout.time_out && (
              <View style={styles.detailRow}>
                <Clock color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Time out: {callout.time_out}
                </Text>
              </View>
            )}

            {callout.machines_tested && (
              <View style={styles.detailRow}>
                <Wrench color={colors.yellow} size={16} />
                <Text style={[styles.detailText, { color: theme.subtext }]}>
                  Machines tested: {callout.machines_tested}
                </Text>
              </View>
            )}

            {callout.signature_url && (
              <View style={styles.signatureSection}>
                <Text style={[styles.signatureLabel, { color: theme.subtext }]}>
                  Technician Signature
                </Text>
                <Image
                  source={{ uri: callout.signature_url }}
                  style={[styles.signatureImage, { borderColor: theme.border }]}
                  resizeMode="contain"
                />
              </View>
            )}
          </View>
        )}

        {/* Invoice & TAM Info */}
<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
  <View style={styles.titleRow}>
    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Invoice & TAM</Text>
    <TouchableOpacity onPress={openInvoiceModal}>
      <Edit3 color={colors.yellow} size={18} />
    </TouchableOpacity>
  </View>

  <View style={[styles.detailRow, { marginTop: 12 }]}>
    <Text style={[styles.detailText, { color: theme.subtext }]}>
      Invoice Number: {callout.invoice_number ?? 'Not set'}
    </Text>
  </View>

  {callout.tam_job_number && (
    <View style={styles.detailRow}>
      <Text style={[styles.detailText, { color: theme.subtext }]}>
        TAM Job Number: {callout.tam_job_number}
      </Text>
    </View>
  )}

  <View style={styles.detailRow}>
    <Text style={[styles.detailText, { color: callout.closed_on_tam ? '#10b981' : '#ef4444' }]}>
      {callout.closed_on_tam ? '✓ Closed on TAM' : '✗ Not closed on TAM'}
    </Text>
  </View>

  {callout.slip_url && (
    <View style={styles.signatureSection}>
      <Text style={[styles.signatureLabel, { color: theme.subtext }]}>Slip Photo</Text>
      <Image
        source={{ uri: callout.slip_url }}
        style={[styles.signatureImage, { borderColor: theme.border }]}
        resizeMode="contain"
      />
    </View>
  )}
</View>

        {/* Cancel — pending or accepted only */}
        {canEditOrCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={cancelCallout}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>Cancel Callout</Text>
          </TouchableOpacity>
        )}

        {/* Delete — only if pending */}
        {callout.status === 'pending' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={deleteCallout}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteButtonText}>Delete Callout</Text>
          </TouchableOpacity>
        )}

      </View>
<Modal visible={invoiceModal} animationType="slide" transparent={false} onRequestClose={() => setInvoiceModal(false)}>
  <ScrollView
    style={[styles.modalContainer, { backgroundColor: theme.background }]}
    contentContainerStyle={styles.modalContent}
    keyboardShouldPersistTaps="handled"
  >
    <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
      <TouchableOpacity onPress={() => setInvoiceModal(false)}>
        <X color={theme.muted} size={24} />
      </TouchableOpacity>
      <Text style={[styles.modalTitle, { color: theme.text }]}>Invoice Number</Text>
      <View style={{ width: 24 }} />
    </View>

    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>INVOICE NUMBER</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
          value={editInvoiceNumber}
          onChangeText={setEditInvoiceNumber}
          placeholder="e.g. INV-2026-0142"
          placeholderTextColor={theme.muted}
        />
      </View>
    </View>

    <TouchableOpacity
      style={[styles.saveBtn, savingInvoice && { opacity: 0.6 }]}
      onPress={handleSaveInvoice}
      disabled={savingInvoice}
    >
      {savingInvoice ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Invoice Number</Text>}
    </TouchableOpacity>
  </ScrollView>
</Modal>
      {/* Edit Modal */}
      <Modal visible={editModal} animationType="slide" transparent={false} onRequestClose={() => setEditModal(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setEditModal(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Callout</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TITLE *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Callout title"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DESCRIPTION</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Optional description"
                placeholderTextColor={theme.muted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE NAME *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editSiteName}
                onChangeText={setEditSiteName}
                placeholder="Site name"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ADDRESS *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="Address"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DATE * (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="2026-08-15"
                placeholderTextColor={theme.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TIME * (HH:MM)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                value={editTime}
                onChangeText={setEditTime}
                placeholder="14:00"
                placeholderTextColor={theme.muted}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSaveEdit}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </ScrollView>
    
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
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', flex: 1 },
  siteName: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 22, marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  detailText: { fontSize: 14, flex: 1 },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 8,
  },
  mapsButtonText: { color: colors.black, fontWeight: '600', fontSize: 14 },
  signatureSection: { marginTop: 12 },
  signatureLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  signatureImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.white,
  },
  cancelButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { color: colors.black, fontSize: 16, fontWeight: '700' },
  deleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});