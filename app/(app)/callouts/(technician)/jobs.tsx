import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, RefreshControl,
  ActivityIndicator, Alert, Linking, Platform,
  Modal
} from 'react-native';
import { Navigation, CheckCircle, Clock, ChevronDown } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import SignatureCanvas from 'react-native-signature-canvas';
import DateTimePicker from '@react-native-community/datetimepicker';

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
};

export default function TechnicianJobs() {
  const isDark = useColorScheme() === 'dark';
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [myCallouts, setMyCallouts] = useState<Callout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [completionModal, setCompletionModal] = useState(false);
  const [selectedCallout, setSelectedCallout] = useState<Callout | null>(null);
  const [timeIn, setTimeIn] = useState(new Date());
  const [timeOut, setTimeOut] = useState(new Date());
  const [showTimeIn, setShowTimeIn] = useState(false);
  const [showTimeOut, setShowTimeOut] = useState(false);
  const [machineCount, setMachineCount] = useState<number | null>(null);
  const [showMachineDropdown, setShowMachineDropdown] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const signatureRef = useRef<any>(null);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
  };

  async function fetchData() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    setUserId(uid ?? null);

    const { data: available } = await supabase
      .from('callouts')
      .select('*')
      .eq('status', 'pending')
      .is('assigned_to', null)
      .order('date', { ascending: true });

    const { data: mine } = await supabase
      .from('callouts')
      .select('*')
      .eq('assigned_to', uid)
      .neq('status', 'completed')
      .order('date', { ascending: true });

    if (available) setCallouts(available);
    if (mine) setMyCallouts(mine);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  async function acceptCallout(calloutId: string) {
    Alert.alert(
      'Accept Callout',
      'Are you sure you want to accept this callout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            const { error } = await supabase
              .from('callouts')
              .update({ assigned_to: userId, status: 'accepted' })
              .eq('id', calloutId)
              .eq('status', 'pending')
              .is('assigned_to', null);

            if (error) {
              Alert.alert('Error', 'Could not accept callout. It may have already been taken.');
            } else {
              Alert.alert('Accepted!', 'The callout has been assigned to you.');
              fetchData();
            }
          }
        }
      ]
    );
  }

  function openCompletionModal(callout: Callout) {
    setSelectedCallout(callout);
    setTimeIn(new Date());
    setTimeOut(new Date());
    setMachineCount(null);
    setSignature(null);
    setCompletionModal(true);
  }

  function formatTime(t: Date) {
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }

  async function uploadSignature(base64: string, calloutId: string): Promise<string | null> {
    try {
      const base64Data = base64.replace('data:image/png;base64,', '');
      const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `signature_${calloutId}_${Date.now()}.png`;

      const { error } = await supabase.storage
        .from('signatures')
        .upload(fileName, arrayBuffer, { contentType: 'image/png' });

      if (error) return null;

      const { data } = supabase.storage.from('signatures').getPublicUrl(fileName);
      return data.publicUrl;
    } catch {
      return null;
    }
  }

  async function handleComplete() {
    if (!machineCount) {
      Alert.alert('Missing info', 'Please select the number of machines tested.');
      return;
    }
    if (!signature) {
      Alert.alert('Missing signature', 'Please provide a signature before completing.');
      return;
    }
    if (!selectedCallout) return;

    setSubmitting(true);

    const signatureUrl = await uploadSignature(signature, selectedCallout.id);

    const { error } = await supabase
      .from('callouts')
      .update({
        status: 'completed',
        time_in: formatTime(timeIn),
        time_out: formatTime(timeOut),
        machines_tested: machineCount,
        signature_url: signatureUrl,
      })
      .eq('id', selectedCallout.id);

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCompletionModal(false);
      Alert.alert('Done!', 'Callout marked as completed.');
      fetchData();
    }
  }

  function openInMaps(lat: number, lng: number, address: string) {
    const url = Platform.select({
      ios: `maps:${lat},${lng}?q=${address}`,
      android: `geo:${lat},${lng}?q=${address}`,
    });
    if (url) Linking.openURL(url);
  }

  const signatureWebStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      width: 100%;
      height: 100%;
    }
    .m-signature-pad--body {
      border: none;
      width: 100%;
    }
    .m-signature-pad--footer {
      display: none;
    }
    body {
      background-color: ${isDark ? '#1e293b' : '#ffffff'};
      margin: 0;
    }
  `;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={colors.yellow}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <Text style={[styles.greeting, { color: theme.subtext }]}>Technician</Text>
          <Text style={[styles.title, { color: isDark ? colors.yellow : '#1e293b' }]}>
            Callouts
          </Text>
        </View>

        {/* My Active Callouts */}
        {myCallouts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>My Active Callouts</Text>
            {myCallouts.map((callout) => (
              <View
                key={callout.id}
                style={[styles.calloutCard, {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderLeftColor: '#3b82f6',
                }]}
              >
                <Text style={[styles.calloutTitle, { color: theme.text }]}>{callout.title}</Text>
                <Text style={[styles.siteName, { color: colors.yellow }]}>{callout.site_name}</Text>

                {callout.description && (
                  <Text style={[styles.description, { color: theme.subtext }]}>
                    {callout.description}
                  </Text>
                )}

                <Text style={[styles.detail, { color: theme.subtext }]}>📍 {callout.address}</Text>
                <Text style={[styles.detail, { color: theme.subtext }]}>📅 {callout.date} at {callout.time}</Text>

                <View style={styles.actions}>
                  {callout.latitude && callout.longitude && (
                    <TouchableOpacity
                      style={styles.mapsBtn}
                      onPress={() => openInMaps(callout.latitude!, callout.longitude!, callout.address)}
                    >
                      <Navigation color={colors.black} size={14} />
                      <Text style={styles.mapsBtnText}>Navigate</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.completeBtn}
                    onPress={() => openCompletionModal(callout)}
                  >
                    <CheckCircle color={colors.black} size={14} />
                    <Text style={styles.completeBtnText}>Complete Job</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Available Callouts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Available Callouts ({callouts.length})
          </Text>

          {callouts.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.subtext }]}>No available callouts</Text>
              <Text style={[styles.emptyHint, { color: theme.subtext }]}>Pull down to refresh</Text>
            </View>
          ) : (
            callouts.map((callout) => (
              <View
                key={callout.id}
                style={[styles.calloutCard, {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderLeftColor: colors.yellow,
                }]}
              >
                <Text style={[styles.calloutTitle, { color: theme.text }]}>{callout.title}</Text>
                <Text style={[styles.siteName, { color: colors.yellow }]}>{callout.site_name}</Text>

                {callout.description && (
                  <Text style={[styles.description, { color: theme.subtext }]}>
                    {callout.description}
                  </Text>
                )}

                <Text style={[styles.detail, { color: theme.subtext }]}>📍 {callout.address}</Text>
                <Text style={[styles.detail, { color: theme.subtext }]}>📅 {callout.date} at {callout.time}</Text>

                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => acceptCallout(callout.id)}
                >
                  <Text style={styles.acceptBtnText}>Accept Callout</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Completion Modal */}
      <Modal
        visible={completionModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setCompletionModal(false)}
      >
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setCompletionModal(false)}>
              <Text style={[styles.cancelText, { color: theme.subtext }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Complete Job</Text>
            <View style={{ width: 50 }} />
          </View>

          {/* Job Info */}
          <View style={[styles.jobInfoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.jobInfoTitle, { color: theme.text }]}>{selectedCallout?.title}</Text>
            <Text style={[styles.jobInfoSite, { color: colors.yellow }]}>{selectedCallout?.site_name}</Text>
          </View>

          {/* Time In / Out */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formSectionTitle, { color: theme.text }]}>Job Times</Text>

            <Text style={[styles.fieldLabel, { color: theme.subtext }]}>TIME IN</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
              onPress={() => setShowTimeIn(true)}
            >
              <Clock color={colors.yellow} size={16} />
              <Text style={[styles.pickerBtnText, { color: theme.text }]}>{formatTime(timeIn)}</Text>
            </TouchableOpacity>

            {showTimeIn && (
              <DateTimePicker
                value={timeIn}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                onChange={(_, selected) => {
                  setShowTimeIn(false);
                  if (selected) setTimeIn(selected);
                }}
                themeVariant={isDark ? 'dark' : 'light'}
              />
            )}

            <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 16 }]}>TIME OUT</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
              onPress={() => setShowTimeOut(true)}
            >
              <Clock color={colors.yellow} size={16} />
              <Text style={[styles.pickerBtnText, { color: theme.text }]}>{formatTime(timeOut)}</Text>
            </TouchableOpacity>

            {showTimeOut && (
              <DateTimePicker
                value={timeOut}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                onChange={(_, selected) => {
                  setShowTimeOut(false);
                  if (selected) setTimeOut(selected);
                }}
                themeVariant={isDark ? 'dark' : 'light'}
              />
            )}
          </View>

          {/* Machines Tested */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formSectionTitle, { color: theme.text }]}>Machines Tested</Text>

            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
              onPress={() => setShowMachineDropdown(!showMachineDropdown)}
            >
              <Text style={[styles.pickerBtnText, { color: machineCount ? theme.text : theme.subtext }]}>
                {machineCount ? `${machineCount} machine${machineCount > 1 ? 's' : ''}` : 'Select number of machines'}
              </Text>
              <ChevronDown color={theme.subtext} size={18} />
            </TouchableOpacity>

            {showMachineDropdown && (
              <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: theme.border },
                        machineCount === num && { backgroundColor: `${colors.yellow}20` },
                      ]}
                      onPress={() => {
                        setMachineCount(num);
                        setShowMachineDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: machineCount === num ? colors.yellow : theme.text }
                      ]}>
                        {num} machine{num > 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Signature */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formSectionTitle, { color: theme.text }]}>Signature</Text>
            <Text style={[styles.fieldLabel, { color: theme.subtext }]}>
              Sign to confirm job completion
            </Text>

            {signature ? (
              <View>
                <View style={[styles.signaturePreview, { borderColor: '#10b981' }]}>
                  <Text style={styles.signedText}>✓ Signature captured</Text>
                </View>
                <TouchableOpacity
                  style={[styles.clearSignatureBtn, { borderColor: theme.border }]}
                  onPress={() => setSignature(null)}
                >
                  <Text style={[styles.clearSignatureText, { color: theme.subtext }]}>Clear & redo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.signatureBox, { borderColor: colors.yellow }]}
                onPress={() => setShowSignature(true)}
              >
                <Text style={[styles.signaturePrompt, { color: colors.yellow }]}>
                  Tap to sign
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleComplete}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.submitBtnText}>Mark as Complete</Text>
            }
          </TouchableOpacity>
        </ScrollView>

        {/* Signature Canvas Modal */}
        <Modal
          visible={showSignature}
          animationType="slide"
          transparent={false}
        >
          <View style={[styles.signatureCanvasContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.signatureCanvasHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setShowSignature(false)}>
                <Text style={[styles.cancelText, { color: theme.subtext }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Sign Here</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity onPress={() => signatureRef.current?.clearSignature()}>
                  <Text style={{ color: theme.subtext, fontWeight: '600', fontSize: 16 }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => signatureRef.current?.readSignature()}>
                  <Text style={{ color: colors.yellow, fontWeight: '600', fontSize: 16 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.signatureHint, { color: theme.subtext }]}>
              Draw your signature then tap Save
            </Text>

            <SignatureCanvas
              ref={signatureRef}
              onOK={(sig) => {
                setSignature(sig);
                setShowSignature(false);
              }}
              onEmpty={() => Alert.alert('Empty', 'Please draw your signature first.')}
              descriptionText=""
              clearText="Clear"
              confirmText="Save"
              webStyle={signatureWebStyle}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                margin: 16,
                borderRadius: 12,
                minHeight: 400,
              }}
            />
          </View>
        </Modal>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { fontSize: 14 },
  title: { fontSize: 28, fontWeight: 'bold' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  calloutCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  calloutTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  siteName: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  description: { fontSize: 14, marginBottom: 8, lineHeight: 20 },
  detail: { fontSize: 13, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[400],
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  mapsBtnText: { color: colors.black, fontWeight: '600', fontSize: 13 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  completeBtnText: { color: colors.black, fontWeight: '600', fontSize: 13 },
  acceptBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  acceptBtnText: { color: colors.black, fontWeight: '700', fontSize: 15 },
  emptyCard: {
    padding: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 14 },
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  cancelText: { fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  jobInfoCard: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  jobInfoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  jobInfoSite: { fontSize: 14, fontWeight: '600' },
  formCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  formSectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  pickerBtnText: { flex: 1, fontSize: 15 },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
  },
  dropdownText: { fontSize: 15 },
  signatureBox: {
    height: 120,
    borderWidth: 2,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signaturePrompt: { fontSize: 16, fontWeight: '600' },
  signaturePreview: {
    height: 80,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedText: { fontSize: 16, fontWeight: '600', color: '#10b981' },
  clearSignatureBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  clearSignatureText: { fontSize: 14 },
  submitBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
  },
  submitBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
  signatureCanvasContainer: { flex: 1 },
  signatureCanvasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  signatureHint: {
    textAlign: 'center',
    fontSize: 14,
    padding: 12,
  },
});