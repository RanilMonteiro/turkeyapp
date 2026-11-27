import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Modal, TextInput, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, FolderOpen, FileText, Trash2, Eye, Download, ChevronDown, X, Upload, Folder, FolderPlus, FolderInput, Pencil } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';
import { viewDocument, downloadDocument } from '../../../../lib/documentActions';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import FileDropZone from '../../../../components/FileDropZone';

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
  { value: 'training', label: 'Training' },
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
  subfolder_id?: string | null;
};

type Subfolder = { id: string; category: string; name: string };

type Employee = {
  id: string;
  full_name: string;
};

// expo-file-system's readAsStringAsync does not reliably support the
// blob: URIs that expo-document-picker returns on web — it can silently
// fail there. fetch()+blob() works the same way across web and native,
// so we use that path specifically for web and keep the native approach
// (which is well-tested and doesn't need changing) for iOS/Android.
async function fileToUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

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

  // Subfolders (optional neatening inside a category)
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [filterSubfolder, setFilterSubfolder] = useState<string | null>(null); // null = all, 'main' = no subfolder, else id
  const [selectedSubfolder, setSelectedSubfolder] = useState<Subfolder | null>(null);
  const [showSubfolderDropdown, setShowSubfolderDropdown] = useState(false);
  const [newFolderInline, setNewFolderInline] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState('');
  const [folderModal, setFolderModal] = useState<{ mode: 'create' | 'rename'; category: string; folder?: Subfolder } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [movingDoc, setMovingDoc] = useState<Document | null>(null);

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
    const [{ data: docs }, { data: emps }, { data: folders }] = await Promise.all([
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
      supabase.from('document_subfolders').select('id, category, name').order('name'),
    ]);

    if (docs) setDocuments(docs);
    if (emps) setEmployees(emps);
    setSubfolders((folders as Subfolder[]) ?? []);
    setLoading(false);
  }

  function openUploadModal() {
    setDocName('');
    setDocCategory('');
    setSelectedEmployee(null);
    setVisibleToEmployee(true);
    setSelectedFile(null);
    setSelectedSubfolder(null);
    setShowSubfolderDropdown(false);
    setNewFolderInline(false);
    setInlineFolderName('');
    setModalVisible(true);
  }

  function handleDroppedFile(asset: any) {
    const type = (asset.mimeType || '').toLowerCase();
    const name = (asset.name || '').toLowerCase();
    const ok = type === 'application/pdf' || type.startsWith('image/') || /\.(pdf|png|jpe?g|webp|gif|heic)$/.test(name);
    if (!ok) {
      notify('Unsupported file', 'Please drop a PDF or an image.');
      return;
    }
    setSelectedFile(asset);
    if (!docName) setDocName(asset.name.replace(/\.[^.]+$/, ''));
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
      notify('Error', 'Could not pick file.');
    }
  }

  async function handleUpload() {
    if (!docName.trim()) {
      notify('Missing name', 'Please enter a document name.');
      return;
    }
    if (!docCategory) {
      notify('Missing category', 'Please select a category.');
      return;
    }
    if (!selectedFile) {
      notify('No file', 'Please select a file to upload.');
      return;
    }

    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `doc_${Date.now()}.${fileExt}`;

      const arrayBuffer = await fileToUint8Array(selectedFile.uri);

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, arrayBuffer, {
          contentType: selectedFile.mimeType ?? 'application/octet-stream',
        });

      if (uploadError) {
        notify('Upload error', uploadError.message);
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
          ...(selectedSubfolder ? { subfolder_id: selectedSubfolder.id } : {}),
        });

      if (dbError) {
        notify('Error', dbError.message);
      } else {
        setModalVisible(false);
        fetchData();
      }
    } catch (e: any) {
      notify('Error', e.message ?? 'Something went wrong reading that file.');
    }

    setSaving(false);
  }

  // ---- Subfolders ----
  async function createFolder(category: string, name: string): Promise<Subfolder | null> {
    const clean = name.trim();
    if (!clean) { notify('Name needed', 'Please enter a folder name.'); return null; }
    const existing = subfolders.find(f => f.category === category && f.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing; // already there — just use it
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('document_subfolders')
      .insert({ category, name: clean, created_by: userData.user?.id })
      .select('id, category, name')
      .single();
    if (error || !data) {
      notify('Could not create folder', error?.message ?? 'Make sure the document_subfolders SQL has been run in Supabase.');
      return null;
    }
    setSubfolders(prev => [...prev, data as Subfolder].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Subfolder;
  }

  async function saveFolderModal() {
    if (!folderModal) return;
    const clean = folderName.trim();
    if (!clean) { notify('Name needed', 'Please enter a folder name.'); return; }
    if (folderModal.mode === 'create') {
      const f = await createFolder(folderModal.category, clean);
      if (f) { setFilterSubfolder(f.id); setFolderModal(null); }
    } else if (folderModal.folder) {
      const { error } = await supabase.from('document_subfolders').update({ name: clean }).eq('id', folderModal.folder.id);
      if (error) { notify('Error', error.message); return; }
      setSubfolders(prev => prev.map(f => (f.id === folderModal.folder!.id ? { ...f, name: clean } : f)));
      setFolderModal(null);
    }
  }

  function deleteFolder(folder: Subfolder) {
    confirm(
      'Delete Folder',
      `Delete the folder "${folder.name}"? Its documents are not deleted — they move back to the main folder.`,
      async () => {
        const { error } = await supabase.from('document_subfolders').delete().eq('id', folder.id);
        if (error) { notify('Error', error.message); return; }
        if (filterSubfolder === folder.id) setFilterSubfolder(null);
        setFolderModal(null);
        fetchData();
      }
    );
  }

  async function moveDocument(doc: Document, subfolderId: string | null) {
    const { error } = await supabase.from('documents').update({ subfolder_id: subfolderId }).eq('id', doc.id);
    if (error) { notify('Error', error.message); return; }
    setDocuments(prev => prev.map(d => (d.id === doc.id ? { ...d, subfolder_id: subfolderId } : d)));
    setMovingDoc(null);
    setNewFolderInline(false);
    setInlineFolderName('');
  }

  function deleteDocument(doc: Document) {
    confirm(
      'Delete Document',
      `Delete "${doc.name}"? This cannot be undone.`,
      async () => {
        const { error } = await supabase.from('documents').delete().eq('id', doc.id);
        if (error) {
          notify('Error', error.message);
        } else {
          fetchData();
        }
      }
    );
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'personal': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'policy': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      case 'procedure': return { bg: isDark ? '#064e3b' : '#d1fae5', text: '#10b981' };
      case 'contract': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
      case 'training': return { bg: isDark ? '#134e4a' : '#ccfbf1', text: '#14b8a6' };
      default: return { bg: isDark ? colors.gray[800] : colors.gray[200], text: colors.gray[500] };
    }
  }

  const filtered = documents.filter(doc => {
    if (filterEmployee && doc.employee_id !== filterEmployee) return false;
    if (filterCategory && doc.category !== filterCategory) return false;
    if (filterCategory && filterSubfolder) {
      if (filterSubfolder === 'main') { if (doc.subfolder_id) return false; }
      else if (doc.subfolder_id !== filterSubfolder) return false;
    }
    return true;
  });

  const categoryFolders = filterCategory ? subfolders.filter(f => f.category === filterCategory) : [];
  const activeFolder = categoryFolders.find(f => f.id === filterSubfolder) ?? null;
  const folderName_ = (id: string | null | undefined) => subfolders.find(f => f.id === id)?.name ?? null;

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
            onPress={() => { setFilterCategory(null); setFilterSubfolder(null); setShowCategoryFilter(false); }}
          >
            <Text style={[styles.filterDropdownText, { color: theme.subtext }]}>All Categories</Text>
          </TouchableOpacity>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.value}
              style={[styles.filterDropdownItem, { borderBottomColor: theme.border }, filterCategory === cat.value && { backgroundColor: `${colors.yellow}20` }]}
              onPress={() => { setFilterCategory(cat.value); setFilterSubfolder(null); setShowCategoryFilter(false); }}
            >
              <Text style={[styles.filterDropdownText, { color: filterCategory === cat.value ? colors.yellow : theme.text }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Category folders — always visible; tap one to open it and see its subfolders */}
      {!filterCategory && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ color: theme.subtext, fontSize: 11.5, fontWeight: '700', paddingHorizontal: 12, paddingTop: 10 }}>
            FOLDERS — tap a category to open it and use subfolders
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8, alignItems: 'center' }}>
            {CATEGORIES.map(c => {
              const subCount = subfolders.filter(f => f.category === c.value).length;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => { setFilterCategory(c.value); setFilterSubfolder(null); }}
                  style={[styles.folderChip, { borderColor: theme.border, backgroundColor: theme.input }]}
                >
                  <Folder color={colors.yellow} size={14} />
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{c.label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {documents.filter(d => d.category === c.value).length}{subCount ? ` · ${subCount} sub` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Folder strip — appears once a category is chosen */}
      {filterCategory && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8, alignItems: 'center' }}>
            {[
              { key: 'all', id: null as string | null, label: 'All', count: documents.filter(d => d.category === filterCategory).length },
              { key: 'main', id: 'main' as string | null, label: 'Main folder', count: documents.filter(d => d.category === filterCategory && !d.subfolder_id).length },
              ...categoryFolders.map(f => ({ key: f.id, id: f.id as string | null, label: f.name, count: documents.filter(d => d.subfolder_id === f.id).length })),
            ].map(chip => {
              const on = filterSubfolder === chip.id;
              const isFolder = chip.key !== 'all' && chip.key !== 'main';
              return (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => setFilterSubfolder(chip.id)}
                  style={[styles.folderChip, { borderColor: on ? colors.yellow : theme.border, backgroundColor: on ? `${colors.yellow}20` : theme.input }]}
                >
                  {chip.key !== 'all' && <Folder color={on ? colors.yellow : theme.muted} size={14} />}
                  <Text style={{ color: on ? colors.yellow : theme.text, fontSize: 13, fontWeight: '600' }}>{chip.label}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{chip.count}</Text>
                  {on && isFolder && (
                    <TouchableOpacity
                      onPress={() => { setFolderName(chip.label); setFolderModal({ mode: 'rename', category: filterCategory, folder: activeFolder ?? undefined }); }}
                      hitSlop={8}
                    >
                      <Pencil color={colors.yellow} size={13} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => { setFolderName(''); setFolderModal({ mode: 'create', category: filterCategory }); }}
              style={[styles.folderChip, { borderColor: colors.yellow, borderStyle: 'dashed' }]}
            >
              <FolderPlus color={colors.yellow} size={14} />
              <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '700' }}>New folder</Text>
            </TouchableOpacity>
          </ScrollView>
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
                    {folderName_(doc.subfolder_id) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Folder color={theme.muted} size={11} />
                        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>{folderName_(doc.subfolder_id)}</Text>
                      </View>
                    )}
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
                    onPress={() => viewDocument(doc.file_url)}
                  >
                    <Eye color={colors.yellow} size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: theme.input }]}
                    onPress={() => downloadDocument(doc.file_url, doc.name, doc.file_type)}
                  >
                    <Download color={colors.yellow} size={16} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.docActionBtn, { backgroundColor: theme.input }]}
                    onPress={() => { setNewFolderInline(false); setInlineFolderName(''); setMovingDoc(doc); }}
                  >
                    <FolderInput color={colors.yellow} size={16} />
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
            <FileDropZone onFile={handleDroppedFile}>
              <TouchableOpacity
                style={[styles.filePicker, { backgroundColor: theme.input, borderColor: selectedFile ? colors.yellow : theme.border }]}
                onPress={pickFile}
              >
                <Upload color={selectedFile ? colors.yellow : theme.muted} size={24} />
                <Text style={[styles.filePickerText, { color: selectedFile ? colors.yellow : theme.muted }]}>
                  {selectedFile ? selectedFile.name : Platform.OS === 'web' ? 'Drag a PDF or image here, or click to select' : 'Tap to select a PDF or image'}
                </Text>
              </TouchableOpacity>
            </FileDropZone>

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
                  {CATEGORIES.filter(c => c.value !== 'training').map(cat => (
                    <TouchableOpacity
                      key={cat.value}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, docCategory === cat.value && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setDocCategory(cat.value); setSelectedSubfolder(null); setShowCategoryDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: docCategory === cat.value ? colors.yellow : theme.text }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Subfolder (optional) */}
            {!!docCategory && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SUBFOLDER</Text>
                <Text style={[styles.fieldHint, { color: theme.muted }]}>
                  Optional — leave it in the main {CATEGORIES.find(c => c.value === docCategory)?.label} folder or put it in a subfolder
                </Text>
                <TouchableOpacity
                  style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                  onPress={() => setShowSubfolderDropdown(!showSubfolderDropdown)}
                >
                  <Text style={[styles.dropdownBtnText, { color: selectedSubfolder ? theme.text : theme.subtext }]}>
                    {selectedSubfolder?.name ?? 'Main folder (no subfolder)'}
                  </Text>
                  <ChevronDown color={theme.muted} size={16} />
                </TouchableOpacity>
                {showSubfolderDropdown && (
                  <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                      onPress={() => { setSelectedSubfolder(null); setShowSubfolderDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>Main folder (no subfolder)</Text>
                    </TouchableOpacity>
                    {subfolders.filter(f => f.category === docCategory).map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.dropdownItem, { borderBottomColor: theme.border }, selectedSubfolder?.id === f.id && { backgroundColor: `${colors.yellow}20` }]}
                        onPress={() => { setSelectedSubfolder(f); setShowSubfolderDropdown(false); }}
                      >
                        <Text style={[styles.dropdownItemText, { color: selectedSubfolder?.id === f.id ? colors.yellow : theme.text }]}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                      onPress={() => { setShowSubfolderDropdown(false); setNewFolderInline(true); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: colors.yellow, fontWeight: '700' }]}>+ New subfolder</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {newFolderInline && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                      placeholder="New subfolder name"
                      placeholderTextColor={theme.subtext}
                      value={inlineFolderName}
                      onChangeText={setInlineFolderName}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.addBtn, { width: 'auto' as any, paddingHorizontal: 16, borderRadius: 12, height: 48 }]}
                      onPress={async () => {
                        const f = await createFolder(docCategory, inlineFolderName);
                        if (f) { setSelectedSubfolder(f); setNewFolderInline(false); setInlineFolderName(''); }
                      }}
                    >
                      <Text style={{ fontWeight: '700', color: colors.black }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

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

      {/* Move document to a subfolder */}
      <Modal visible={!!movingDoc} transparent animationType="fade" onRequestClose={() => setMovingDoc(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 }} numberOfLines={1}>Move "{movingDoc?.name}"</Text>
              <TouchableOpacity onPress={() => setMovingDoc(null)}><X color={theme.muted} size={22} /></TouchableOpacity>
            </View>
            <Text style={{ color: theme.subtext, fontSize: 12.5, marginBottom: 10 }}>
              Choose where it goes inside {CATEGORIES.find(c => c.value === movingDoc?.category)?.label ?? 'this category'}.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {[{ id: null as string | null, name: 'Main folder (no subfolder)' },
                ...subfolders.filter(f => f.category === movingDoc?.category)].map(f => {
                const current = (movingDoc?.subfolder_id ?? null) === f.id;
                return (
                  <TouchableOpacity
                    key={f.id ?? 'main'}
                    style={[styles.dropdownItem, { borderBottomColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 8 }, current && { backgroundColor: `${colors.yellow}20` }]}
                    onPress={() => movingDoc && moveDocument(movingDoc, f.id)}
                  >
                    <Folder color={current ? colors.yellow : theme.muted} size={16} />
                    <Text style={[styles.dropdownItemText, { color: current ? colors.yellow : theme.text }]}>{f.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {newFolderInline ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  placeholder="New subfolder name"
                  placeholderTextColor={theme.subtext}
                  value={inlineFolderName}
                  onChangeText={setInlineFolderName}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.addBtn, { width: 'auto' as any, paddingHorizontal: 16, borderRadius: 12, height: 48 }]}
                  onPress={async () => {
                    if (!movingDoc) return;
                    const f = await createFolder(movingDoc.category, inlineFolderName);
                    if (f) moveDocument(movingDoc, f.id);
                  }}
                >
                  <Text style={{ fontWeight: '700', color: colors.black }}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setNewFolderInline(true)}>
                <FolderPlus color={colors.yellow} size={16} />
                <Text style={{ color: colors.yellow, fontWeight: '700' }}>New subfolder</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Create / rename folder */}
      <Modal visible={!!folderModal} transparent animationType="fade" onRequestClose={() => setFolderModal(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginBottom: 4 }}>
              {folderModal?.mode === 'rename' ? 'Rename folder' : 'New folder'}
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 12.5, marginBottom: 10 }}>
              Inside {CATEGORIES.find(c => c.value === folderModal?.category)?.label}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Safety Induction"
              placeholderTextColor={theme.subtext}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]} onPress={() => setFolderModal(null)}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: colors.yellow }]} onPress={saveFolderModal}>
                <Text style={{ color: colors.black, fontWeight: '700' }}>{folderModal?.mode === 'rename' ? 'Save' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
            {folderModal?.mode === 'rename' && folderModal.folder && (
              <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} onPress={() => deleteFolder(folderModal.folder!)}>
                <Text style={{ color: '#ef4444', fontWeight: '600' }}>Delete folder</Text>
              </TouchableOpacity>
            )}
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
  folderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 18 },
  sheetBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  docActions: { flexDirection: 'row', flexWrap: 'wrap', width: 80, gap: 6, justifyContent: 'flex-end' },
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