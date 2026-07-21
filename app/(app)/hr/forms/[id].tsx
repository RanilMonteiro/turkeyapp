import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, TextInput,
  Alert, ActivityIndicator, Switch, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, ChevronDown, GripVertical } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';

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

const CATEGORIES = [
  { value: 'leave', label: 'Leave' },
  { value: 'ppe', label: 'PPE Request' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'loan', label: 'Loan' },
  { value: 'card_signout', label: 'Card Sign Out' },
  { value: 'slip', label: 'Slip Upload' },
  { value: 'other', label: 'Other' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'signature', label: 'Signature' },
  { value: 'file', label: 'File Upload' },
];

type Field = {
  id: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder: string;
  options: string[];
  field_order: number;
  isNew?: boolean;
  isDeleted?: boolean;
};

export default function EditForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);

  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');
  const [fieldOptions, setFieldOptions] = useState('');
  const [showFieldTypeDropdown, setShowFieldTypeDropdown] = useState(false);

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
    const [{ data: template }, { data: fieldData }] = await Promise.all([
      supabase.from('form_templates').select('*').eq('id', id).single(),
      supabase.from('form_fields').select('*').eq('template_id', id).order('field_order'),
    ]);

    if (template) {
      setName(template.name);
      setDescription(template.description ?? '');
      setCategory(template.category ?? '');
      setRequiresApproval(template.requires_approval);
    }

    if (fieldData) {
      setFields(fieldData.map(f => ({
        id: f.id,
        label: f.label,
        field_type: f.field_type,
        required: f.required,
        placeholder: f.placeholder ?? '',
        options: f.options ?? [],
        field_order: f.field_order,
      })));
    }

    setLoading(false);
  }

  function openAddField() {
    setEditingField(null);
    setFieldLabel('');
    setFieldType('text');
    setFieldRequired(false);
    setFieldPlaceholder('');
    setFieldOptions('');
    setShowFieldModal(true);
  }

  function openEditField(field: Field) {
    setEditingField(field);
    setFieldLabel(field.label);
    setFieldType(field.field_type);
    setFieldRequired(field.required);
    setFieldPlaceholder(field.placeholder);
    setFieldOptions(field.options.join(', '));
    setShowFieldModal(true);
  }

  function saveField() {
    if (!fieldLabel.trim()) {
      Alert.alert('Missing label', 'Please enter a field label.');
      return;
    }

    const options = fieldType === 'dropdown'
      ? fieldOptions.split(',').map(o => o.trim()).filter(Boolean)
      : [];

    if (editingField) {
      setFields(prev => prev.map(f =>
        f.id === editingField.id
          ? { ...f, label: fieldLabel, field_type: fieldType, required: fieldRequired, placeholder: fieldPlaceholder, options }
          : f
      ));
    } else {
      const newField: Field = {
        id: `new_${Date.now()}`,
        label: fieldLabel,
        field_type: fieldType,
        required: fieldRequired,
        placeholder: fieldPlaceholder,
        options,
        field_order: fields.length + 1,
        isNew: true,
      };
      setFields(prev => [...prev, newField]);
    }
    setShowFieldModal(false);
  }

  function removeField(fieldId: string) {
    setFields(prev => prev.filter(f => f.id !== fieldId));
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter a form name.');
      return;
    }
    if (fields.length === 0) {
      Alert.alert('No fields', 'Please add at least one field.');
      return;
    }

    setSaving(true);

    // Update template
    const { error: templateError } = await supabase
      .from('form_templates')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        category: category || null,
        requires_approval: requiresApproval,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (templateError) {
      Alert.alert('Error', templateError.message);
      setSaving(false);
      return;
    }

    // Delete all existing fields and reinsert
    await supabase.from('form_fields').delete().eq('template_id', id);

    const fieldRows = fields.map((f, i) => ({
      template_id: id,
      label: f.label,
      field_type: f.field_type,
      required: f.required,
      placeholder: f.placeholder || null,
      options: f.options.length > 0 ? f.options : null,
      field_order: i + 1,
    }));

    const { error: fieldsError } = await supabase
      .from('form_fields')
      .insert(fieldRows);

    setSaving(false);

    if (fieldsError) {
      Alert.alert('Error', fieldsError.message);
    } else {
      Alert.alert('Saved', 'Form has been updated.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
  }

  const selectedCategory = CATEGORIES.find(c => c.value === category);
  const selectedFieldType = FIELD_TYPES.find(f => f.value === fieldType);

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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Edit Form</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Form Details</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.subtext }]}>FORM NAME *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Leave Request Form"
              placeholderTextColor={theme.subtext}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.subtext }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="What is this form for?"
              placeholderTextColor={theme.subtext}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.subtext }]}>CATEGORY</Text>
            <TouchableOpacity
              style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
              onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
            >
              <Text style={[styles.dropdownBtnText, { color: category ? theme.text : theme.subtext }]}>
                {selectedCategory?.label ?? 'Select a category'}
              </Text>
              <ChevronDown color={theme.muted} size={16} />
            </TouchableOpacity>
            {showCategoryDropdown && (
              <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[styles.dropdownItem, { borderBottomColor: theme.border }, category === cat.value && { backgroundColor: `${colors.yellow}20` }]}
                    onPress={() => { setCategory(cat.value); setShowCategoryDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, { color: category === cat.value ? colors.yellow : theme.text }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>Requires Approval</Text>
              <Text style={[styles.switchDesc, { color: theme.subtext }]}>
                Submissions go through approval chain
              </Text>
            </View>
            <Switch
              value={requiresApproval}
              onValueChange={setRequiresApproval}
              trackColor={{ false: isDark ? colors.gray[700] : colors.gray[200], true: `${colors.yellow}80` }}
              thumbColor={requiresApproval ? colors.yellow : colors.gray[400]}
            />
          </View>
        </View>

        {/* Fields */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.fieldsHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Form Fields ({fields.length})
            </Text>
            <TouchableOpacity style={styles.addFieldBtn} onPress={openAddField}>
              <Plus color={colors.black} size={16} />
              <Text style={styles.addFieldBtnText}>Add Field</Text>
            </TouchableOpacity>
          </View>

          {fields.length === 0 ? (
            <View style={[styles.emptyFields, { borderColor: theme.border }]}>
              <Text style={[styles.emptyFieldsText, { color: theme.muted }]}>
                No fields — tap Add Field to add some
              </Text>
            </View>
          ) : (
            fields.map((field, index) => (
              <View
                key={field.id}
                style={[styles.fieldItem, { borderColor: theme.border }, index === fields.length - 1 && { borderBottomWidth: 0 }]}
              >
                <GripVertical color={theme.muted} size={16} />
                <View style={styles.fieldItemInfo}>
                  <Text style={[styles.fieldItemLabel, { color: theme.text }]}>{field.label}</Text>
                  <View style={styles.fieldItemMeta}>
                    <Text style={[styles.fieldItemType, { color: colors.yellow }]}>
                      {FIELD_TYPES.find(t => t.value === field.field_type)?.label}
                    </Text>
                    {field.required && (
                      <Text style={[styles.requiredBadge, { color: '#ef4444' }]}>Required</Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => openEditField(field)} style={styles.fieldAction}>
                  <Text style={[styles.fieldActionText, { color: colors.yellow }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeField(field.id)} style={styles.fieldAction}>
                  <Trash2 color="#ef4444" size={16} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={colors.black} />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Add/Edit Field Modal */}
      <Modal
        visible={showFieldModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowFieldModal(false)}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowFieldModal(false)}>
              <ArrowLeft color={colors.yellow} size={24} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {editingField ? 'Edit Field' : 'Add Field'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.subtext }]}>FIELD LABEL *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Start Date"
                placeholderTextColor={theme.subtext}
                value={fieldLabel}
                onChangeText={setFieldLabel}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.subtext }]}>FIELD TYPE *</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowFieldTypeDropdown(!showFieldTypeDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: theme.text }]}>
                  {selectedFieldType?.label ?? 'Select type'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showFieldTypeDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {FIELD_TYPES.map(ft => (
                    <TouchableOpacity
                      key={ft.value}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, fieldType === ft.value && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setFieldType(ft.value); setShowFieldTypeDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: fieldType === ft.value ? colors.yellow : theme.text }]}>
                        {ft.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.subtext }]}>PLACEHOLDER TEXT</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Select your leave type"
                placeholderTextColor={theme.subtext}
                value={fieldPlaceholder}
                onChangeText={setFieldPlaceholder}
              />
            </View>

            {fieldType === 'dropdown' && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.subtext }]}>OPTIONS</Text>
                <Text style={[styles.hint, { color: theme.muted }]}>
                  Separate options with commas
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder="e.g. Annual, Sick, Unpaid"
                  placeholderTextColor={theme.subtext}
                  value={fieldOptions}
                  onChangeText={setFieldOptions}
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: theme.text }]}>Required</Text>
                <Text style={[styles.switchDesc, { color: theme.subtext }]}>
                  Employee must fill in this field
                </Text>
              </View>
              <Switch
                value={fieldRequired}
                onValueChange={setFieldRequired}
                trackColor={{ false: isDark ? colors.gray[700] : colors.gray[200], true: `${colors.yellow}80` }}
                thumbColor={fieldRequired ? colors.yellow : colors.gray[400]}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveField}>
            <Text style={styles.saveBtnText}>
              {editingField ? 'Save Field' : 'Add Field'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
  headerTitle: { fontSize: 20, fontWeight: '700' },
  card: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textarea: { minHeight: 80, paddingTop: 12 },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  dropdownBtnText: { flex: 1, fontSize: 15 },
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
  dropdownItemText: { fontSize: 15 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchInfo: { flex: 1 },
  switchLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  switchDesc: { fontSize: 12 },
  fieldsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.yellow,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addFieldBtnText: { color: colors.black, fontWeight: '700', fontSize: 13 },
  emptyFields: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
  },
  emptyFieldsText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  fieldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  fieldItemInfo: { flex: 1 },
  fieldItemLabel: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  fieldItemMeta: { flexDirection: 'row', gap: 8 },
  fieldItemType: { fontSize: 12, fontWeight: '600' },
  requiredBadge: { fontSize: 12, fontWeight: '600' },
  fieldAction: { padding: 4 },
  fieldActionText: { fontSize: 13, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginTop: 20,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});