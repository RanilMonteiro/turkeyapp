import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Alert, Modal, TextInput
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, FolderOpen, FileText, Trash2, Eye, ChevronDown, X, Upload } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';

import * as FileSystem from 'expo-file-system/legacy';


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
  file_type: string | null;
  visible_to_employee: boolean;
  created_at: string;
  employee: { full_name: string } | null;
  uploader: { full_name: string } | null;

  employee_id: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

export default function DocumentsManager() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showEmployeeFilter, setShowEmployeeFilter] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // Upload form state
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [visibleToEmployee, setVisibleToEmployee] = useState(true);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

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
      fetchData();
    }, [])
  );

  async function fetchData() {
    const [{ data: docs }, { data: emps }] = await Promise.all([
      supabase
        .from('documents')
        .select(`
          *,
          employee:employee_id(full_name),
          uploader:uploaded_by(full_name)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name')
        .neq('role', 'superuser')
        .order('full_name'),
    ]);

    if (docs) setDocuments(docs);
    if (emps) setEmployees(emps);
    setLoading(false);
  }

  function openUploadModal() {
    setDocName('');
    setDocCategory('');
    setSelectedEmployee(null);
    setVisibleToEmployee(true);
    setSelectedFile(null);
    setModalVisible(true);
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
        if (!docName) setDocName(result.assets[0].name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      Alert.alert('Error', 'Could not pick file.');
    }
  }

  async function handleUpload() {
    if (!docName.trim()) {
      Alert.alert('Missing name', 'Please enter a document name.');
      return;
    }
    if (!docCategory) {
      Alert.alert('Missing category', 'Please select a category.');
      return;
    }
    if (!selectedFile) {
      Alert.alert('No file', 'Please select a file to upload.');
      return;
    }

    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `doc_${Date.now()}.${fileExt}`;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(selectedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, arrayBuffer, {
          contentType: selectedFile.mimeType ?? 'application/octet-stream',
        });

      if (uploadError) {
        Alert.alert('Upload error', uploadError.message);
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          name: docName.trim(),
          category: docCategory,
          file_url: urlData.publicUrl,
          file_type: fileExt,
          employee_id: selectedEmployee?.id ?? null,
          uploaded_by: userData.user?.id,
          visible_to_employee: visibleToEmployee,
        });

      if (dbError) {
        Alert.alert('Error', dbError.message);
      } else {
        setModalVisible(false);
        fetchData();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }

    setSaving(false);
  }

  async function deleteDocument(doc: Document) {
    Alert.alert(
      'Delete Document',
      `Delete "${doc.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('documents').delete().eq('id', doc.id);
            fetchData();
          }
        }
      ]
    );
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

  const filtered = documents.filter(doc => {
    if (filterEmployee && doc.employee_id !== filterEmployee)
    if (filterCategory && doc.category !== filterCategory) return false;
    return true;
  });

  const selectedEmployeeFilter = employees.find(e => e.id === filterEmployee);

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Documents</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openUploadModal}>
          <Plus color={colors.black} size={20} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={[styles.filtersRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
          onPress={() => setShowEmployeeFilter(!showEmployeeFilter)}
        >
          <Text style={[styles.filterBtnText, { color: filterEmployee ? theme.text : theme.muted }]}>
            {selectedEmployeeFilter?.full_name ?? 'All Employees'}
          </Text>
          <ChevronDown color={theme.muted} size={14} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
          onPress={() => setShowCategoryFilter(!showCategoryFilter)}
        >
          <Text style={[styles.filterBtnText, { color: filterCategory ? theme.text : theme.muted }]}>
            {CATEGORIES.find(c => c.value === filterCategory)?.label ?? 'All Categories'}
          </Text>
          <ChevronDown color={theme.muted} size={14} />
        </TouchableOpacity>
      </View>

      {/* Employee Filter Dropdown */}
      {showEmployeeFilter && (
        <View style={[styles.filterDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            <TouchableOpacity
              style={[styles.filterDropdownItem, { borderBottomColor: theme.border }]}
              onPress={() => { setFilterEmployee(null); setShowEmployeeFilter(false); }}
            >
              <Text style={[styles.filterDropdownText, { color: theme.subtext }]}>All Employees</Text>
            </TouchableOpacity>
            {employees.map(emp => (
              <TouchableOpacity
                key={emp.id}
                style={[styles.filterDropdownItem, { borderBottomColor: theme.border }, filterEmployee === emp.id && { backgroundColor: `${colors.yellow}20` }]}
                onPress={() => { setFilterEmployee(emp.id); setShowEmployeeFilter(false); }}
              >
                <Text style={[styles.filterDropdownText, { color: filterEmployee === emp.id ? colors.yellow : theme.text }]}>
                  {emp.full_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category Filter Dropdown */}
      {showCategoryFilter && (
        <View style={[styles.filterDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.filterDropdownItem, { borderBottomColor: theme.border }]}
            onPress={() => { setFilterCategory(null); setShowCategoryFilter(false); }}
          >
            <Text style={[styles.filterDropdownText, { color: theme.subtext }]}>All Categories</Text>
          </TouchableOpacity>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.value}
              style={[styles.filterDropdownItem, { borderBottomColor: theme.border }, filterCategory === cat.value && { backgroundColor: `${colors.yellow}20` }]}
              onPress={() => { setFilterCategory(cat.value); setShowCategoryFilter(false); }}
            >
              <Text style={[styles.filterDropdownText, { color: filterCategory === cat.value ? colors.yellow : theme.text }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.countText, { color: theme.subtext }]}>
          {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </Text>

        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <FolderOpen color={theme.muted} size={40} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>No documents</Text>
            <Text style={[styles.emptyHint, { color: theme.muted }]}>
              Tap + to upload a document
            </Text>
          </View>
        ) : (
          filtered.map(doc => {
            const cat = getCategoryColor(doc.category);
            return (
              <View
                key={doc.id}
                style={[styles.docCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={[styles.docIcon, { backgroundColor: `${colors.yellow}20` }]}>
                  <FileText color={colors.yellow} size={22} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>
                    {doc.name}
                  </Text>
                  {doc.employee && (
                    <Text style={[styles.docEmployee, { color: theme.subtext }]}>
                      {doc.employee.full_name}
                    </Text>
                  )}
                  <View style={styles.docMeta}>
                    <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                      <Text style={[styles.catText, { color: cat.text }]}>
                        {doc.category}
                      </Text>
                    </View>
                    {!doc.visible_to_employee && (
                      <Text style={[styles.privateText, { color: theme.muted }]}>Private</Text>
                    )}
                  </View>
                  <Text style={[styles.docDate, { color: theme.muted }]}>
                    {new Date(doc.created_at).toLocaleDateString('en-ZA')}
                  </Text>
                </View>
                <View style={styles.docActions}>
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: theme.input }]}
                    onPress={() => {
                      // Open URL
                      const { Linking } = require('react-native');
                      Linking.openURL(doc.file_url);
                    }}
                  >
                    <Eye color={colors.yellow} size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: isDark ? '#3b1a1a' : '#fee2e2' }]}
                    onPress={() => deleteDocument(doc)}
                  >
                    <Trash2 color="#ef4444" size={16} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Upload Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setModalVisible(false)}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <X color={colors.yellow} size={24} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Upload Document</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

            {/* File Picker */}
            <TouchableOpacity
              style={[styles.filePicker, { backgroundColor: theme.input, borderColor: selectedFile ? colors.yellow : theme.border }]}
              onPress={pickFile}
            >
              <Upload color={selectedFile ? colors.yellow : theme.muted} size={24} />
              <Text style={[styles.filePickerText, { color: selectedFile ? colors.yellow : theme.muted }]}>
                {selectedFile ? selectedFile.name : 'Tap to select a PDF or image'}
              </Text>
            </TouchableOpacity>

            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DOCUMENT NAME *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Employment Contract"
                placeholderTextColor={theme.subtext}
                value={docName}
                onChangeText={setDocName}
              />
            </View>

            {/* Category */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CATEGORY *</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: docCategory ? theme.text : theme.subtext }]}>
                  {CATEGORIES.find(c => c.value === docCategory)?.label ?? 'Select category'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showCategoryDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.value}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, docCategory === cat.value && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setDocCategory(cat.value); setShowCategoryDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: docCategory === cat.value ? colors.yellow : theme.text }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Employee */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ASSIGN TO EMPLOYEE</Text>
              <Text style={[styles.fieldHint, { color: theme.muted }]}>
                Leave blank for company-wide documents
              </Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: selectedEmployee ? theme.text : theme.subtext }]}>
                  {selectedEmployee?.full_name ?? 'No specific employee'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showEmployeeDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    <TouchableOpacity
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                      onPress={() => { setSelectedEmployee(null); setShowEmployeeDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>No specific employee</Text>
                    </TouchableOpacity>
                    {employees.map(emp => (
                      <TouchableOpacity
                        key={emp.id}
                        style={[styles.dropdownItem, { borderBottomColor: theme.border }, selectedEmployee?.id === emp.id && { backgroundColor: `${colors.yellow}20` }]}
                        onPress={() => { setSelectedEmployee(emp); setShowEmployeeDropdown(false); }}
                      >
                        <Text style={[styles.dropdownItemText, { color: selectedEmployee?.id === emp.id ? colors.yellow : theme.text }]}>
                          {emp.full_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Visible to Employee */}
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: theme.text }]}>Visible to Employee</Text>
                <Text style={[styles.switchDesc, { color: theme.subtext }]}>
                  Employee can see this document
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  { backgroundColor: visibleToEmployee ? colors.yellow : theme.input, borderColor: theme.border }
                ]}
                onPress={() => setVisibleToEmployee(!visibleToEmployee)}
              >
                <View style={[
                  styles.toggleThumb,
                  { backgroundColor: colors.white, transform: [{ translateX: visibleToEmployee ? 20 : 2 }] }
                ]} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleUpload}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.saveBtnText}>Upload Document</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  addBtn: {
    backgroundColor: colors.yellow, width: 36, height: 36,
    borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  filtersRow: {
    flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1,
  },
  filterBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 8, gap: 6,
  },
  filterBtnText: { flex: 1, fontSize: 13 },
  filterDropdown: {
    marginHorizontal: 12, borderWidth: 1, borderRadius: 12,
    overflow: 'hidden', zIndex: 999,
  },
  filterDropdownItem: { padding: 12, borderBottomWidth: 1 },
  filterDropdownText: { fontSize: 14 },
  content: { padding: 16, gap: 10 },
  countText: { fontSize: 13, marginBottom: 4 },
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
  docName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  docEmployee: { fontSize: 12, marginBottom: 4 },
  docMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 2 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700' },
  privateText: { fontSize: 10 },
  docDate: { fontSize: 11 },
  docActions: { flexDirection: 'row', gap: 6 },
  docActionBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  modalContent: { paddingBottom: 48 },
  formCard: {
    margin: 16, borderRadius: 20, padding: 20, borderWidth: 1,
  },
  filePicker: {
    borderWidth: 2, borderRadius: 14, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', gap: 10, marginBottom: 20,
  },
  filePickerText: { fontSize: 14, textAlign: 'center' },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  fieldHint: { fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10,
  },
  dropdownBtnText: { flex: 1, fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  switchInfo: { flex: 1 },
  switchLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  switchDesc: { fontSize: 12 },
  toggle: {
    width: 46, height: 26, borderRadius: 13,
    borderWidth: 1, justifyContent: 'center',
  },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
  },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14,
    height: 56, alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});