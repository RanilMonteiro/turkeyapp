import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  TextInput, Modal, Platform, Image
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, Paperclip, X, CheckCircle } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify } from '../../../../lib/notify';
import SignaturePad, { SignaturePadHandle } from '../../../../components/SignaturePad';
import DatePickerField from '../../../../components/DatepickerField';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8',
    500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
  }
};

type Field = {
  id: string; label: string; field_type: string; required: boolean;
  placeholder: string | null; options: string[] | null; field_order: number;
  image_url: string | null;
};
type Submission = { id: string; template_id: string; form_data: any; employee: { full_name: string } | null };
type Attachment = { url: string; name: string };

async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export default function EditSubmission() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [formData, setFormData] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSignatureField, setActiveSignatureField] = useState<string | null>(null);
  const [activeDropdownField, setActiveDropdownField] = useState<string | null>(null);
  const [uploadingAttachmentField, setUploadingAttachmentField] = useState<string | null>(null);
  const signatureRef = useRef<SignaturePadHandle>(null);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useEffect(() => {
    if (id) fetchSubmission();
  }, [id]);

  async function fetchSubmission() {
    const { data: sub } = await supabase
      .from('form_submissions')
      .select('id, template_id, form_data, employee:employee_id(full_name)')
      .eq('id', id)
      .single();

    if (sub) {
      setSubmission(sub as any);
      setFormData(sub.form_data ?? {});

      const { data: fieldData } = await supabase
        .from('form_fields')
        .select('*')
        .eq('template_id', sub.template_id)
        .order('field_order');

      if (fieldData) setFields(fieldData);
    }
    setLoading(false);
  }

  function setFieldValue(fieldId: string, value: any) {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  }

  async function pickAttachmentFile(fieldId: string) {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setUploadingAttachmentField(fieldId);
      const fileExt = asset.name.split('.').pop();
      const fileName = `form_attachment_edit_${id}_${fieldId}_${Date.now()}.${fileExt}`;
      const arrayBuffer = await fileToUint8Array(asset.uri);
      const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, arrayBuffer, { contentType: asset.mimeType ?? 'application/octet-stream' });
      if (uploadError) { notify('Upload error', uploadError.message); setUploadingAttachmentField(null); return; }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);
      setFieldValue(fieldId, { url: urlData.publicUrl, name: asset.name } as Attachment);
    } catch (e: any) {
      notify('Error', e.message ?? 'Something went wrong reading that file.');
    } finally {
      setUploadingAttachmentField(null);
    }
  }

  function removeAttachment(fieldId: string) {
    setFieldValue(fieldId, null);
  }

  async function uploadSignatureForField(base64: string, fieldId: string): Promise<string | null> {
    try {
      const base64Data = base64.replace('data:image/png;base64,', '');
      const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `form_sig_edit_${id}_${fieldId}_${Date.now()}.png`;
      const { error } = await supabase.storage.from('signatures').upload(fileName, arrayBuffer, { contentType: 'image/png' });
      if (error) return null;
      const { data } = supabase.storage.from('signatures').getPublicUrl(fileName);
      return data.publicUrl;
    } catch { return null; }
  }

  async function handleSaveEdit() {
    setSaving(true);

    const { error } = await supabase
      .from('form_submissions')
      .update({ form_data: formData })
      .eq('id', id);

    setSaving(false);

    if (error) {
      notify('Error', error.message);
      return;
    }

    notify('Saved', 'The submission has been updated.', () => router.back());
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Edit Submission</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.descCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.description, { color: theme.subtext }]}>
            Editing {submission?.employee?.full_name}'s submission. Changes save directly — this does not reset the approval chain.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {fields.map((field, index) => (
            <View key={field.id} style={[styles.fieldGroup, index < fields.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>{field.label.toUpperCase()}</Text>

              {field.image_url && (
                <Image source={{ uri: field.image_url }} style={styles.fieldImage} resizeMode="contain" />
              )}

              {field.field_type === 'text' && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder={field.placeholder ?? ''}
                  placeholderTextColor={theme.muted}
                  value={formData[field.id] ?? ''}
                  onChangeText={v => setFieldValue(field.id, v)}
                />
              )}

              {field.field_type === 'textarea' && (
                <TextInput
                  style={[styles.input, styles.textarea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder={field.placeholder ?? ''}
                  placeholderTextColor={theme.muted}
                  value={formData[field.id] ?? ''}
                  onChangeText={v => setFieldValue(field.id, v)}
                  multiline numberOfLines={4} textAlignVertical="top"
                />
              )}

              {field.field_type === 'date' && (
                <DatePickerField value={formData[field.id] ?? ''} onChange={v => setFieldValue(field.id, v)} placeholder="Select date" isDark={isDark} theme={theme} />
              )}

              {field.field_type === 'dropdown' && (
                <>
                  <TouchableOpacity
                    style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                    onPress={() => setActiveDropdownField(activeDropdownField === field.id ? null : field.id)}
                  >
                    <Text style={[styles.pickerBtnText, { color: formData[field.id] ? theme.text : theme.muted }]}>
                      {formData[field.id] ?? field.placeholder ?? 'Select an option'}
                    </Text>
                    <ChevronDown color={theme.muted} size={16} />
                  </TouchableOpacity>
                  {activeDropdownField === field.id && field.options && (
                    <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      {field.options.map(option => (
                        <TouchableOpacity
                          key={option}
                          style={[styles.dropdownItem, { borderBottomColor: theme.border }, formData[field.id] === option && { backgroundColor: `${colors.yellow}20` }]}
                          onPress={() => { setFieldValue(field.id, option); setActiveDropdownField(null); }}
                        >
                          <Text style={[styles.dropdownItemText, { color: formData[field.id] === option ? colors.yellow : theme.text }]}>{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {field.field_type === 'checkbox' && (
                <TouchableOpacity style={styles.checkboxRow} onPress={() => setFieldValue(field.id, !formData[field.id])}>
                  <View style={[styles.checkbox, { borderColor: formData[field.id] ? colors.yellow : theme.border }, formData[field.id] && { backgroundColor: colors.yellow }]}>
                    {formData[field.id] && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: theme.text }]}>Yes</Text>
                </TouchableOpacity>
              )}

              {field.field_type === 'attachment' && (
                <>
                  {formData[field.id] ? (
                    <View style={[styles.attachedBox, { borderColor: '#10b981', backgroundColor: theme.input }]}>
                      <CheckCircle color="#10b981" size={18} />
                      <Text style={[styles.attachedText, { color: theme.text }]} numberOfLines={1}>{(formData[field.id] as Attachment).name}</Text>
                      <TouchableOpacity onPress={() => removeAttachment(field.id)} style={styles.attachedRemoveBtn}>
                        <X color="#ef4444" size={18} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.attachBox, { borderColor: theme.border }]}
                      onPress={() => pickAttachmentFile(field.id)}
                      disabled={uploadingAttachmentField === field.id}
                    >
                      {uploadingAttachmentField === field.id ? <ActivityIndicator color={colors.yellow} /> : (
                        <>
                          <Paperclip color={theme.muted} size={20} />
                          <Text style={[styles.attachBoxText, { color: theme.muted }]}>Tap to attach a PDF or image</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}

              {field.field_type === 'signature' && (
                <>
                  {formData[field.id] ? (
                    <View>
                      <View style={[styles.signedBox, { borderColor: '#10b981' }]}>
                        <Text style={styles.signedText}>✓ Signature captured</Text>
                      </View>
                      <TouchableOpacity style={[styles.clearBtn, { borderColor: theme.border }]} onPress={() => setFieldValue(field.id, null)}>
                        <Text style={[styles.clearBtnText, { color: theme.subtext }]}>Clear & redo</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.signBox, { borderColor: colors.yellow }]} onPress={() => setActiveSignatureField(field.id)}>
                      <Text style={[styles.signBoxText, { color: colors.yellow }]}>Tap to sign</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSaveEdit} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.submitBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={activeSignatureField !== null} animationType="slide" transparent={false}>
        <View style={[styles.sigContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.sigHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setActiveSignatureField(null)}>
              <Text style={[styles.sigCancel, { color: theme.subtext }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.sigTitle, { color: theme.text }]}>Sign Here</Text>
            <TouchableOpacity onPress={() => signatureRef.current?.clearSignature()}>
              <Text style={{ color: colors.yellow, fontWeight: '600', fontSize: 16 }}>Clear</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.sigHint, { color: theme.subtext }]}>Draw signature then tap Save Signature</Text>
          <SignaturePad
            ref={signatureRef}
            onOK={async (sig) => {
              if (activeSignatureField) {
                const url = await uploadSignatureForField(sig, activeSignatureField);
                setFieldValue(activeSignatureField, url ?? sig);
                setActiveSignatureField(null);
              }
            }}
            onEmpty={() => notify('Empty', 'Please draw your signature first.')}
            style={{ borderWidth: 1, borderColor: theme.border, margin: 16, borderRadius: 12, minHeight: 300 }}
          />
          <TouchableOpacity style={styles.sigSaveBtn} onPress={() => signatureRef.current?.readSignature()}>
            <Text style={styles.sigSaveBtnText}>Save Signature</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  descCard: { margin: 16, marginBottom: 0, padding: 16, borderRadius: 14, borderWidth: 1 },
  description: { fontSize: 14, lineHeight: 20 },
  card: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { paddingVertical: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 10 },
  fieldImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#ffffff' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textarea: { minHeight: 100, paddingTop: 12 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10 },
  pickerBtnText: { flex: 1, fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: colors.black, fontWeight: '700', fontSize: 14 },
  checkboxLabel: { fontSize: 15 },
  attachBox: { height: 90, borderWidth: 2, borderRadius: 12, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  attachBoxText: { fontSize: 14, fontWeight: '600' },
  attachedBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  attachedText: { flex: 1, fontSize: 14, fontWeight: '600' },
  attachedRemoveBtn: { padding: 4 },
  signBox: { height: 100, borderWidth: 2, borderRadius: 12, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  signBoxText: { fontSize: 16, fontWeight: '600' },
  signedBox: { height: 60, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  signedText: { fontSize: 15, fontWeight: '600', color: '#10b981' },
  clearBtn: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 },
  clearBtnText: { fontSize: 14 },
  submitBtn: { backgroundColor: colors.yellow, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', margin: 16 },
  submitBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
  sigContainer: { flex: 1 },
  sigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1 },
  sigCancel: { fontSize: 16 },
  sigTitle: { fontSize: 18, fontWeight: '700' },
  sigHint: { textAlign: 'center', fontSize: 14, padding: 12 },
  sigSaveBtn: { backgroundColor: colors.yellow, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 24 },
  sigSaveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});