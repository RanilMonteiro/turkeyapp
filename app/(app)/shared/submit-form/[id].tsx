import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  TextInput, Modal
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, Calendar } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify } from '../../../../lib/notify';
import SignaturePad, { SignaturePadHandle } from '../../../../components/SignaturePad';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

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

type Field = {
  id: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder: string | null;
  options: string[] | null;
  field_order: number;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  requires_approval: boolean;
};

export default function SubmitForm() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [formData, setFormData] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeSignatureField, setActiveSignatureField] = useState<string | null>(null);
  const [activeDateField, setActiveDateField] = useState<string | null>(null);
  const [activeDropdownField, setActiveDropdownField] = useState<string | null>(null);
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
    if (id) fetchForm();
  }, [id]);

  async function fetchForm() {
    const [{ data: tmpl }, { data: fieldData }] = await Promise.all([
      supabase.from('form_templates').select('*').eq('id', id).single(),
      supabase.from('form_fields').select('*').eq('template_id', id).order('field_order'),
    ]);

    if (tmpl) setTemplate(tmpl);
    if (fieldData) {
      setFields(fieldData);
      // Pre-fill auto fields
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, employee_number, job_title, department, sites(name)')
        .eq('id', userData.user?.id)
        .single();

      const autoData: { [key: string]: string } = {};
      fieldData.forEach((field: Field) => {
        const lowerLabel = field.label.toLowerCase();
        if (lowerLabel.includes('name') && profile?.full_name) autoData[field.id] = profile.full_name;
        if (lowerLabel.includes('employee number') && profile?.employee_number) autoData[field.id] = profile.employee_number;
        if (lowerLabel.includes('job title') && profile?.job_title) autoData[field.id] = profile.job_title;
        if (lowerLabel.includes('department') && profile?.department) autoData[field.id] = profile.department;
      });
      setFormData(autoData);
    }

    setLoading(false);
  }

  function setFieldValue(fieldId: string, value: any) {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  }

  async function uploadSignatureForField(base64: string, fieldId: string): Promise<string | null> {
    try {
      const base64Data = base64.replace('data:image/png;base64,', '');
      const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `form_sig_${id}_${fieldId}_${Date.now()}.png`;

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

  async function handleSubmit() {
    // Validate required fields
    for (const field of fields) {
      if (field.required && !formData[field.id]) {
        notify('Missing field', `"${field.label}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();

    const { data: submission, error: subError } = await supabase
      .from('form_submissions')
      .insert({
        template_id: id,
        employee_id: userData.user?.id,
        form_data: formData,
        status: template?.requires_approval ? 'pending' : 'approved',
      })
      .select()
      .single();

    if (subError || !submission) {
      notify('Error', subError?.message ?? 'Failed to submit');
      setSubmitting(false);
      return;
    }

    // Create approval steps if needed
    if (template?.requires_approval) {
      const { data: chain } = await supabase
        .from('approval_chains')
        .select('*')
        .eq('employee_id', userData.user?.id)
        .order('approval_order');

      if (chain && chain.length > 0) {
        const approvalRows = chain.map((c: any) => ({
          submission_id: submission.id,
          approver_id: c.approver_id,
          approval_order: c.approval_order,
          status: 'pending',
        }));
        const { error: approvalError } = await supabase
          .from('form_approvals')
          .insert(approvalRows);

        if (approvalError) {
          notify(
            'Warning',
            'Your form was submitted, but the approval workflow could not be started. Please contact HR.'
          );
        }
      } else {
        notify(
          'No approver assigned',
          'This form requires approval but no approval chain has been set up for you yet. Your submission was saved — please contact HR so it can be reviewed.'
        );
      }
    }

    setSubmitting(false);
    notify(
      'Submitted',
      template?.requires_approval
        ? 'Your request has been submitted and is awaiting approval.'
        : 'Your request has been submitted.',
      () => router.back()
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
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{template?.name}</Text>
          <View style={{ width: 24 }} />
        </View>

        {template?.description && (
          <View style={[styles.descCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.description, { color: theme.subtext }]}>{template.description}</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {fields.map((field, index) => (
            <View
              key={field.id}
              style={[styles.fieldGroup, index < fields.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            >
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>
                {field.label.toUpperCase()}{field.required ? ' *' : ''}
              </Text>

              {/* Text */}
              {field.field_type === 'text' && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder={field.placeholder ?? ''}
                  placeholderTextColor={theme.muted}
                  value={formData[field.id] ?? ''}
                  onChangeText={v => setFieldValue(field.id, v)}
                />
              )}

              {/* Textarea */}
              {field.field_type === 'textarea' && (
                <TextInput
                  style={[styles.input, styles.textarea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder={field.placeholder ?? ''}
                  placeholderTextColor={theme.muted}
                  value={formData[field.id] ?? ''}
                  onChangeText={v => setFieldValue(field.id, v)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              )}

              {/* Date */}
              {field.field_type === 'date' && (
                <>
                  <TouchableOpacity
                    style={[styles.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                    onPress={() => setActiveDateField(field.id)}
                  >
                    <Calendar color={colors.yellow} size={16} />
                    <Text style={[styles.pickerBtnText, { color: formData[field.id] ? theme.text : theme.muted }]}>
                      {formData[field.id] ?? 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  {activeDateField === field.id && (
                    <DateTimePicker
                      value={formData[field.id] ? new Date(formData[field.id]) : new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                      onChange={(_, date) => {
                        setActiveDateField(null);
                        if (date) setFieldValue(field.id, date.toISOString().split('T')[0]);
                      }}
                      themeVariant={isDark ? 'dark' : 'light'}
                    />
                  )}
                </>
              )}

              {/* Dropdown */}
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
                          <Text style={[styles.dropdownItemText, { color: formData[field.id] === option ? colors.yellow : theme.text }]}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Checkbox */}
              {field.field_type === 'checkbox' && (
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setFieldValue(field.id, !formData[field.id])}
                >
                  <View style={[
                    styles.checkbox,
                    { borderColor: formData[field.id] ? colors.yellow : theme.border },
                    formData[field.id] && { backgroundColor: colors.yellow }
                  ]}>
                    {formData[field.id] && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: theme.text }]}>Yes</Text>
                </TouchableOpacity>
              )}

              {/* Signature */}
              {field.field_type === 'signature' && (
                <>
                  {formData[field.id] ? (
                    <View>
                      <View style={[styles.signedBox, { borderColor: '#10b981' }]}>
                        <Text style={styles.signedText}>✓ Signature captured</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.clearBtn, { borderColor: theme.border }]}
                        onPress={() => setFieldValue(field.id, null)}
                      >
                        <Text style={[styles.clearBtnText, { color: theme.subtext }]}>Clear & redo</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.signBox, { borderColor: colors.yellow }]}
                      onPress={() => setActiveSignatureField(field.id)}
                    >
                      <Text style={[styles.signBoxText, { color: colors.yellow }]}>Tap to sign</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.submitBtnText}>Submit Form</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Signature Modal */}
      <Modal
        visible={activeSignatureField !== null}
        animationType="slide"
        transparent={false}
      >
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
          <Text style={[styles.sigHint, { color: theme.subtext }]}>
            Draw your signature then tap Save Signature
          </Text>
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
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              margin: 16,
              borderRadius: 12,
              minHeight: 300,
            }}
          />
          <TouchableOpacity
            style={styles.sigSaveBtn}
            onPress={() => signatureRef.current?.readSignature()}
          >
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  descCard: { margin: 16, marginBottom: 0, padding: 16, borderRadius: 14, borderWidth: 1 },
  description: { fontSize: 14, lineHeight: 20 },
  card: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { paddingVertical: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 10 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textarea: { minHeight: 100, paddingTop: 12 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, height: 52, gap: 10,
  },
  pickerBtnText: { flex: 1, fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  checkmark: { color: colors.black, fontWeight: '700', fontSize: 14 },
  checkboxLabel: { fontSize: 15 },
  signBox: {
    height: 100, borderWidth: 2, borderRadius: 12,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  signBoxText: { fontSize: 16, fontWeight: '600' },
  signedBox: {
    height: 60, borderWidth: 2, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  signedText: { fontSize: 15, fontWeight: '600', color: '#10b981' },
  clearBtn: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 },
  clearBtnText: { fontSize: 14 },
  submitBtn: {
    backgroundColor: colors.yellow, borderRadius: 14,
    height: 56, alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  submitBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
  sigContainer: { flex: 1 },
  sigHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 60, borderBottomWidth: 1,
  },
  sigCancel: { fontSize: 16 },
  sigTitle: { fontSize: 18, fontWeight: '700' },
  sigHint: { textAlign: 'center', fontSize: 14, padding: 12 },
  sigSaveBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sigSaveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});