import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  TextInput, Modal, Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, User, MapPin, Phone, Briefcase, Hash, ChevronDown, X,
  Plus, Trash2, GitBranch, FileText, Clock, CheckCircle, XCircle,
  FolderOpen, Upload, ClipboardList, Search, Folder, Calendar, Eye
} from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';
import DatePickerField from '../../../../components/DatepickerField';
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
  { value: 'disciplinary', label: 'Disciplinary' },
  { value: 'other', label: 'Other' },
];

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

type Employee = {
  id: string;
  full_name: string;
  role: string;
  employee_number: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  id_number: string | null;
  date_joined: string | null;
  site_id: string | null;
  sites: { name: string } | null;
};

type Site = { id: string; name: string };
type Profile = { id: string; full_name: string; role: string };
type CustomField = { id: string; field_name: string; field_value: string | null; field_order: number };
type ApprovalChainRow = { id: string; approver_id: string; approval_order: number; approver: { full_name: string } | null };
type Submission = {
  id: string;
  status: string;
  submitted_at: string;
  template: { name: string; category: string | null } | null;
};
type Document = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  created_at: string;
  document_date: string | null;
  visible_to_employee: boolean;
};
type FormTemplateOption = { id: string; name: string; category: string | null };
type DocGrant = { admin_id: string; categories: string[] | null; admin: { full_name: string } | null };
type EditableGrant = { granted: boolean; categories: string[] | null };

export default function EmployeeProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isDark = useColorScheme() === 'dark';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);

  // Edit fields
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dateJoined, setDateJoined] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [editableCustomFields, setEditableCustomFields] = useState<
    { id?: string; field_name: string; field_value: string }[]
  >([]);

  // Approval chain (scoped to this employee)
  const [chainApprovers, setChainApprovers] = useState<ApprovalChainRow[]>([]);
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [chainModalVisible, setChainModalVisible] = useState(false);
  const [editableApprovers, setEditableApprovers] = useState<(Profile | null)[]>([null]);
  const [showApproverDropdown, setShowApproverDropdown] = useState<number | null>(null);
  const [savingChain, setSavingChain] = useState(false);

  // Submissions (search + filter)
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<
    'all' | 'pending' | 'in_review' | 'approved' | 'declined'
  >('all');

  // Documents
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docModalVisible, setDocModalVisible] = useState(false);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('');
  const [showDocCategoryDropdown, setShowDocCategoryDropdown] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [visibleToEmployee, setVisibleToEmployee] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docDate, setDocDate] = useState('');
  const [showDocDatePicker, setShowDocDatePicker] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Form visibility (per-employee)
  const [allTemplates, setAllTemplates] = useState<FormTemplateOption[]>([]);
  const [hiddenTemplateIds, setHiddenTemplateIds] = useState<Set<string>>(new Set());
  const [formVisibilityModalVisible, setFormVisibilityModalVisible] = useState(false);
  const [editableHiddenIds, setEditableHiddenIds] = useState<Set<string>>(new Set());
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Document access grants (which admins can see this employee's docs)
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);
  const [docGrants, setDocGrants] = useState<DocGrant[]>([]);
  const [docAccessModalVisible, setDocAccessModalVisible] = useState(false);
  const [editableGrants, setEditableGrants] = useState<Record<string, EditableGrant>>({});
  const [savingDocAccess, setSavingDocAccess] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[50],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    avatarBg: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [id])
  );

  async function fetchAll() {
    await Promise.all([
      fetchProfile(),
      fetchCustomFields(),
      fetchChain(),
      fetchSubmissions(),
      fetchDocuments(),
      fetchFormVisibility(),
      fetchDocAccess(),
    ]);
    setLoading(false);
  }

  async function fetchProfile() {
    const [{ data: emp }, { data: siteData }] = await Promise.all([
      supabase.from('profiles').select('*, sites(name)').eq('id', id).single(),
      supabase.from('sites').select('*').order('name', { ascending: true }),
    ]);

    if (emp) {
      setEmployee(emp);
      setEmployeeNumber(emp.employee_number ?? '');
      setJobTitle(emp.job_title ?? '');
      setDepartment(emp.department ?? '');
      setPhone(emp.phone ?? '');
      setIdNumber(emp.id_number ?? '');
      setDateJoined(emp.date_joined ?? '');
      setSelectedSiteId(emp.site_id ?? null);
    }
    if (siteData) setSites(siteData);
  }

  async function fetchCustomFields() {
    const { data } = await supabase
      .from('employee_custom_fields')
      .select('*')
      .eq('employee_id', id)
      .order('field_order');
    if (data) setCustomFields(data);
  }

  async function fetchChain() {
    const [{ data: chainData }, { data: adminData }] = await Promise.all([
      supabase
        .from('approval_chains')
        .select('id, approver_id, approval_order, approver:approver_id(full_name)')
        .eq('employee_id', id)
        .order('approval_order'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['admin', 'hr', 'superuser'])
        .order('full_name'),
    ]);
    if (chainData) setChainApprovers(chainData as any);
    if (adminData) setAdmins(adminData);
  }

  async function fetchSubmissions() {
    const { data } = await supabase
      .from('form_submissions')
      .select('id, status, submitted_at, template:template_id(name, category)')
      .eq('employee_id', id)
      .order('submitted_at', { ascending: false });
    if (data) setSubmissions(data as any);
  }

  async function fetchDocuments() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('employee_id', id)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data);
  }

  async function fetchFormVisibility() {
    const [{ data: templates }, { data: hidden }] = await Promise.all([
      supabase
        .from('form_templates')
        .select('id, name, category')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('employee_hidden_forms')
        .select('template_id')
        .eq('employee_id', id),
    ]);
    if (templates) setAllTemplates(templates);
    if (hidden) setHiddenTemplateIds(new Set(hidden.map(h => h.template_id)));
  }

  async function fetchDocAccess() {
    const [{ data: admins_ }, { data: grants }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'admin')
        .order('full_name'),
      supabase
        .from('document_access_grants')
        .select('admin_id, categories, admin:admin_id(full_name)')
        .eq('employee_id', id),
    ]);
    if (admins_) setAdminUsers(admins_);
    if (grants) setDocGrants(grants as any);
  }

  // ---------- Profile edit + custom fields ----------

  function openEditModal() {
    setEditableCustomFields(
      customFields.map(f => ({ id: f.id, field_name: f.field_name, field_value: f.field_value ?? '' }))
    );
    setEditModal(true);
  }

  function addCustomField() {
    setEditableCustomFields(prev => [...prev, { field_name: '', field_value: '' }]);
  }

  function removeCustomField(index: number) {
    setEditableCustomFields(prev => prev.filter((_, i) => i !== index));
  }

  function updateCustomField(index: number, key: 'field_name' | 'field_value', value: string) {
    setEditableCustomFields(prev =>
      prev.map((f, i) => (i === index ? { ...f, [key]: value } : f))
    );
  }

  async function handleSave() {
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        employee_number: employeeNumber || null,
        job_title: jobTitle || null,
        department: department || null,
        phone: phone || null,
        id_number: idNumber || null,
        date_joined: dateJoined || null,
        site_id: selectedSiteId,
      })
      .eq('id', id);

    if (error) {
      setSaving(false);
      notify('Error', error.message);
      return;
    }

    // Reconcile custom fields: delete removed, update changed, insert new
    const originalIds = customFields.map(f => f.id);
    const keptIds = editableCustomFields.filter(f => f.id).map(f => f.id!) as string[];
    const removedIds = originalIds.filter(oid => !keptIds.includes(oid));

    if (removedIds.length > 0) {
      await supabase.from('employee_custom_fields').delete().in('id', removedIds);
    }

    const toUpdate = editableCustomFields.filter(f => f.id && f.field_name.trim());
    const toInsert = editableCustomFields.filter(f => !f.id && f.field_name.trim());

    for (const f of toUpdate) {
      await supabase
        .from('employee_custom_fields')
        .update({ field_name: f.field_name.trim(), field_value: f.field_value })
        .eq('id', f.id);
    }

    if (toInsert.length > 0) {
      await supabase.from('employee_custom_fields').insert(
        toInsert.map((f, i) => ({
          employee_id: id,
          field_name: f.field_name.trim(),
          field_value: f.field_value,
          field_order: customFields.length + i,
        }))
      );
    }

    setSaving(false);
    setEditModal(false);
    fetchProfile();
    fetchCustomFields();
  }

  // ---------- Approval chain (scoped to this employee) ----------

  function openChainModal() {
    if (chainApprovers.length > 0) {
      setEditableApprovers(
        chainApprovers.map(c => admins.find(a => a.id === c.approver_id) ?? null)
      );
    } else {
      setEditableApprovers([null]);
    }
    setChainModalVisible(true);
  }

  function addApproverSlot() {
    if (editableApprovers.length >= 4) {
      notify('Maximum reached', 'You can add a maximum of 4 approvers.');
      return;
    }
    setEditableApprovers(prev => [...prev, null]);
  }

  function removeApproverSlot(index: number) {
    if (editableApprovers.length === 1) {
      notify('Minimum required', 'At least 1 approver is required.');
      return;
    }
    setEditableApprovers(prev => prev.filter((_, i) => i !== index));
  }

  function setApproverSlot(index: number, approver: Profile) {
    setEditableApprovers(prev => prev.map((a, i) => (i === index ? approver : a)));
    setShowApproverDropdown(null);
  }

  async function handleSaveChain() {
    if (editableApprovers.some(a => a === null)) {
      notify('Missing approvers', 'Please select all approvers.');
      return;
    }

    setSavingChain(true);

    await supabase.from('approval_chains').delete().eq('employee_id', id);

    const { data: userData } = await supabase.auth.getUser();
    const rows = editableApprovers.map((approver, index) => ({
      employee_id: id,
      approver_id: approver!.id,
      approval_order: index + 1,
      created_by: userData.user?.id,
    }));

    const { error } = await supabase.from('approval_chains').insert(rows);

    setSavingChain(false);

    if (error) {
      notify('Error', error.message);
      return;
    }

    setChainModalVisible(false);
    fetchChain();
  }

  function deleteChain() {
    confirm(
      'Remove Approval Chain',
      `Remove the approval chain for ${employee?.full_name}?`,
      async () => {
        const { error } = await supabase.from('approval_chains').delete().eq('employee_id', id);
        if (error) {
          notify('Error', error.message);
        } else {
          fetchChain();
        }
      }
    );
  }

  // ---------- Form visibility (which forms this employee can see) ----------

  function openFormVisibilityModal() {
    setEditableHiddenIds(new Set(hiddenTemplateIds));
    setFormVisibilityModalVisible(true);
  }

  function toggleTemplateVisibility(templateId: string) {
    setEditableHiddenIds(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  }

  async function handleSaveFormVisibility() {
    setSavingVisibility(true);

    // Reconcile: delete rows for templates newly made visible, insert
    // rows for templates newly hidden. Compare against what was
    // originally loaded (hiddenTemplateIds), not the working copy.
    const newlyVisible = [...hiddenTemplateIds].filter(t => !editableHiddenIds.has(t));
    const newlyHidden = [...editableHiddenIds].filter(t => !hiddenTemplateIds.has(t));

    if (newlyVisible.length > 0) {
      await supabase
        .from('employee_hidden_forms')
        .delete()
        .eq('employee_id', id)
        .in('template_id', newlyVisible);
    }

    if (newlyHidden.length > 0) {
      const { error } = await supabase.from('employee_hidden_forms').insert(
        newlyHidden.map(templateId => ({ employee_id: id, template_id: templateId }))
      );
      if (error) {
        setSavingVisibility(false);
        notify('Error', error.message);
        return;
      }
    }

    setSavingVisibility(false);
    setFormVisibilityModalVisible(false);
    fetchFormVisibility();
  }

  // ---------- Document access grants (which admins see this employee's docs) ----------

  function openDocAccessModal() {
    const initial: Record<string, EditableGrant> = {};
    adminUsers.forEach(admin => {
      const existing = docGrants.find(g => g.admin_id === admin.id);
      initial[admin.id] = existing
        ? { granted: true, categories: existing.categories }
        : { granted: false, categories: null };
    });
    setEditableGrants(initial);
    setDocAccessModalVisible(true);
  }

  function toggleAdminGrant(adminId: string) {
    setEditableGrants(prev => ({
      ...prev,
      [adminId]: {
        granted: !prev[adminId]?.granted,
        categories: prev[adminId]?.categories ?? null,
      },
    }));
  }

  function setGrantToAllCategories(adminId: string) {
    setEditableGrants(prev => ({
      ...prev,
      [adminId]: { ...prev[adminId], categories: null },
    }));
  }

  function toggleGrantCategory(adminId: string, category: string) {
    setEditableGrants(prev => {
      const current = prev[adminId];
      const currentCategories = current?.categories;
      // If currently "all" (null), start narrowing from just this category.
      if (currentCategories === null) {
        return { ...prev, [adminId]: { ...current, categories: [category] } };
      }
      const has = currentCategories!.includes(category);
      const next = has
        ? currentCategories!.filter(c => c !== category)
        : [...currentCategories!, category];
      return { ...prev, [adminId]: { ...current, categories: next } };
    });
  }

  async function handleSaveDocAccess() {
    setSavingDocAccess(true);

    // Simple reconcile: clear existing grants for this employee, then
    // reinsert current state — same pattern used for the approval chain.
    await supabase.from('document_access_grants').delete().eq('employee_id', id);

    const { data: userData } = await supabase.auth.getUser();
    const rows = Object.entries(editableGrants)
      .filter(([_, g]) => g.granted)
      .map(([adminId, g]) => ({
        admin_id: adminId,
        employee_id: id,
        categories: g.categories,
        granted_by: userData.user?.id,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from('document_access_grants').insert(rows);
      if (error) {
        setSavingDocAccess(false);
        notify('Error', error.message);
        return;
      }
    }

    setSavingDocAccess(false);
    setDocAccessModalVisible(false);
    fetchDocAccess();
  }

  // ---------- Submissions search/filter ----------

  const filteredSubmissions = submissions.filter(s => {
    if (submissionFilter !== 'all' && s.status !== submissionFilter) return false;
    if (submissionSearch.trim()) {
      const q = submissionSearch.trim().toLowerCase();
      if (!s.template?.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const submissionCounts = {
    all: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    in_review: submissions.filter(s => s.status === 'in_review').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    declined: submissions.filter(s => s.status === 'declined').length,
  };

  function getStatusColor(status: string) {
    switch (status) {
      case 'approved': return '#10b981';
      case 'declined': return '#ef4444';
      case 'in_review': return '#3b82f6';
      default: return '#f59e0b';
    }
  }

  function getStatusBg(status: string) {
    if (isDark) {
      switch (status) {
        case 'approved': return '#064e3b';
        case 'declined': return '#3b1a1a';
        case 'in_review': return '#1e3a5f';
        default: return '#78350f';
      }
    }
    switch (status) {
      case 'approved': return '#d1fae5';
      case 'declined': return '#fee2e2';
      case 'in_review': return '#dbeafe';
      default: return '#fef3c7';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved': return <CheckCircle color="#10b981" size={13} />;
      case 'declined': return <XCircle color="#ef4444" size={13} />;
      default: return <Clock color="#f59e0b" size={13} />;
    }
  }

  // ---------- Documents ----------

  // Search overrides folder view — when searching, show a flat filtered
  // list across all categories instead of the folder breakdown.
  const docSearchActive = docSearch.trim().length > 0;

  const filteredFlatDocuments = documents.filter(d =>
    d.name.toLowerCase().includes(docSearch.trim().toLowerCase())
  );

  // Only categories that actually have at least one document show up
  // as a folder — no empty subfolders.
  const docsByCategory = documents.reduce((acc, doc) => {
    (acc[doc.category] ??= []).push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  const categoriesWithDocs = DOC_CATEGORIES.filter(c => (docsByCategory[c.value]?.length ?? 0) > 0);

  function openDocModal() {
    setDocName('');
    setDocCategory('');
    setSelectedFile(null);
    setVisibleToEmployee(true);
    setDocDate('');
    setDocModalVisible(true);
  }

  async function pickDocFile() {
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

  async function handleUploadDoc() {
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

    setUploadingDoc(true);

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
        setUploadingDoc(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('documents').insert({
        name: docName.trim(),
        category: docCategory,
        file_url: urlData.publicUrl,
        file_type: fileExt,
        employee_id: id,
        uploaded_by: userData.user?.id,
        visible_to_employee: visibleToEmployee,
        document_date: docDate || null,
      });

      if (dbError) {
        notify('Error', dbError.message);
      } else {
        setDocModalVisible(false);
        fetchDocuments();
      }
    } catch (e: any) {
      notify('Error', e.message ?? 'Something went wrong reading that file.');
    }

    setUploadingDoc(false);
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
          fetchDocuments();
        }
      }
    );
  }

  function getDocCategoryColor(category: string) {
    switch (category) {
      case 'personal': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'policy': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      case 'procedure': return { bg: isDark ? '#064e3b' : '#d1fae5', text: '#10b981' };
      case 'contract': return { bg: isDark ? '#78350f' : '#fef3c7', text: '#f59e0b' };
      case 'disciplinary': return { bg: isDark ? '#7f1d1d' : '#fee2e2', text: '#dc2626'};
      default: return { bg: isDark ? colors.gray[800] : colors.gray[200], text: colors.gray[500] };
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'admin': return { bg: isDark ? '#1e3a5f' : '#dbeafe', text: '#3b82f6' };
      case 'hr': return { bg: isDark ? '#3b1f5f' : '#ede9fe', text: '#8b5cf6' };
      default: return { bg: isDark ? '#1a2e1a' : '#d1fae5', text: '#10b981' };
    }
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (!employee) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.subtext }}>Employee not found</Text>
      </View>
    );
  }

  const badge = getRoleBadgeColor(employee.role);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft color={colors.yellow} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Employee Profile</Text>
        <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar + Name */}
        <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.avatarBg }]}>
            <User color={colors.yellow} size={36} />
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{employee.full_name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.roleText, { color: badge.text }]}>
              {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
            </Text>
          </View>
          {employee.sites && (
            <View style={styles.siteRow}>
              <MapPin color={colors.yellow} size={14} />
              <Text style={[styles.siteName, { color: theme.subtext }]}>{employee.sites.name}</Text>
            </View>
          )}
        </View>

        {/* Work Details */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Work Details</Text>
          <DetailRow icon={<Hash color={colors.yellow} size={16} />} label="Employee Number" value={employee.employee_number} theme={theme} />
          <DetailRow icon={<Briefcase color={colors.yellow} size={16} />} label="Job Title" value={employee.job_title} theme={theme} />
          <DetailRow icon={<Briefcase color={colors.yellow} size={16} />} label="Department" value={employee.department} theme={theme} />
          <DetailRow icon={<Phone color={colors.yellow} size={16} />} label="Phone" value={employee.phone} theme={theme} />
          <DetailRow icon={<Hash color={colors.yellow} size={16} />} label="ID Number" value={employee.id_number} theme={theme} />
          <DetailRow icon={<Briefcase color={colors.yellow} size={16} />} label="Date Joined" value={employee.date_joined} theme={theme} isLast={customFields.length === 0} />
          {customFields.map((f, i) => (
            <DetailRow
              key={f.id}
              icon={<Hash color={colors.yellow} size={16} />}
              label={f.field_name}
              value={f.field_value}
              theme={theme}
              isLast={i === customFields.length - 1}
            />
          ))}
        </View>

        {/* Approval Chain (scoped to this employee) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <GitBranch color={colors.yellow} size={18} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Approval Chain</Text>
            </View>
            {chainApprovers.length > 0 && (
              <TouchableOpacity onPress={deleteChain}>
                <Trash2 color="#ef4444" size={18} />
              </TouchableOpacity>
            )}
          </View>

          {chainApprovers.length === 0 ? (
            <Text style={[styles.emptyInlineText, { color: theme.muted }]}>
              No approvers set up for {employee.full_name} yet.
            </Text>
          ) : (
            chainApprovers.map(a => (
              <View key={a.id} style={styles.chainRow}>
                <View style={[styles.orderBadge, { backgroundColor: `${colors.yellow}20` }]}>
                  <Text style={[styles.orderText, { color: colors.yellow }]}>{a.approval_order}</Text>
                </View>
                <Text style={[styles.chainApproverName, { color: theme.text }]}>{a.approver?.full_name}</Text>
              </View>
            ))
          )}

          <TouchableOpacity style={[styles.inlineActionBtn, { borderColor: colors.yellow }]} onPress={openChainModal}>
            <Text style={[styles.inlineActionBtnText, { color: colors.yellow }]}>
              {chainApprovers.length === 0 ? 'Set Up Approvers' : 'Edit Approvers'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Access (which forms this employee can/can't see) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderLeft}>
            <ClipboardList color={colors.yellow} size={18} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Form Access</Text>
          </View>
          <Text style={[styles.emptyInlineText, { color: theme.muted, fontStyle: 'normal', marginBottom: 12 }]}>
            {hiddenTemplateIds.size === 0
              ? `${employee.full_name} can see all ${allTemplates.length} available forms.`
              : `${hiddenTemplateIds.size} of ${allTemplates.length} forms are hidden from ${employee.full_name}.`}
          </Text>
          <TouchableOpacity style={[styles.inlineActionBtn, { borderColor: colors.yellow }]} onPress={openFormVisibilityModal}>
            <Text style={[styles.inlineActionBtnText, { color: colors.yellow }]}>Manage Form Access</Text>
          </TouchableOpacity>
        </View>

        {/* Submitted Forms (search + filter) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderLeft}>
            <FileText color={colors.yellow} size={18} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Submitted Forms</Text>
          </View>

          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            placeholder="Search by form name..."
            placeholderTextColor={theme.muted}
            value={submissionSearch}
            onChangeText={setSubmissionSearch}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {(['all', 'pending', 'in_review', 'approved', 'declined'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterTab,
                  { borderColor: theme.border },
                  submissionFilter === f && { backgroundColor: colors.yellow, borderColor: colors.yellow },
                ]}
                onPress={() => setSubmissionFilter(f)}
              >
                <Text style={[
                  styles.filterTabText,
                  { color: submissionFilter === f ? colors.black : theme.subtext },
                ]}>
                  {f.replace('_', ' ')} ({submissionCounts[f]})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredSubmissions.length === 0 ? (
            <Text style={[styles.emptyInlineText, { color: theme.muted }]}>No matching submissions.</Text>
          ) : (
            filteredSubmissions.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.submissionRow, { borderColor: theme.border }]}
                onPress={() => router.push(`/(app)/hr/requests/${s.id}` as any)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.submissionName, { color: theme.text }]}>
                    {s.template?.name ?? 'Unknown Form'}
                  </Text>
                  <Text style={[styles.submissionDate, { color: theme.muted }]}>
                    {new Date(s.submitted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(s.status) }]}>
                  <View style={styles.statusInner}>
                    {getStatusIcon(s.status)}
                    <Text style={[styles.statusText, { color: getStatusColor(s.status) }]}>
                      {s.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Documents (scoped to this employee) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <FolderOpen color={colors.yellow} size={18} />
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Documents</Text>
            </View>
            <TouchableOpacity style={styles.smallAddBtn} onPress={openDocModal}>
              <Plus color={colors.black} size={16} />
            </TouchableOpacity>
          </View>

          <View style={[styles.docSearchRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
            <Search color={theme.muted} size={16} />
            <TextInput
              style={[styles.docSearchInput, { color: theme.text }]}
              placeholder="Search documents..."
              placeholderTextColor={theme.muted}
              value={docSearch}
              onChangeText={setDocSearch}
            />
          </View>

          {documents.length === 0 ? (
            <Text style={[styles.emptyInlineText, { color: theme.muted }]}>No documents for this employee yet.</Text>
          ) : docSearchActive ? (
            // Search mode: flat filtered list across all categories
            filteredFlatDocuments.length === 0 ? (
              <Text style={[styles.emptyInlineText, { color: theme.muted }]}>No documents match your search.</Text>
            ) : (
              filteredFlatDocuments.map(doc => (
                <DocumentRow key={doc.id} doc={doc} theme={theme} getDocCategoryColor={getDocCategoryColor} deleteDocument={deleteDocument} />
              ))
            )
          ) : expandedCategory ? (
            // Inside a folder: show just that category's documents
            <View>
              <TouchableOpacity style={styles.folderBackRow} onPress={() => setExpandedCategory(null)}>
                <ArrowLeft color={colors.yellow} size={16} />
                <Text style={{ color: colors.yellow, fontWeight: '600', fontSize: 14 }}>
                  Back to folders
                </Text>
              </TouchableOpacity>
              <Text style={[styles.folderTitle, { color: theme.text }]}>
                {DOC_CATEGORIES.find(c => c.value === expandedCategory)?.label ?? expandedCategory}
              </Text>
              {(docsByCategory[expandedCategory] ?? []).map(doc => (
                <DocumentRow key={doc.id} doc={doc} theme={theme} getDocCategoryColor={getDocCategoryColor} deleteDocument={deleteDocument} />
              ))}
            </View>
          ) : (
            // Folder view: only categories that actually have documents
            categoriesWithDocs.map(cat => {
              const count = docsByCategory[cat.value].length;
              const catColor = getDocCategoryColor(cat.value);
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
            })
          )}
        </View>

        {/* Document Access (which admins can see this employee's docs) */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeaderLeft}>
            <Eye color={colors.yellow} size={18} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Document Access</Text>
          </View>
          <Text style={[styles.emptyInlineText, { color: theme.muted, fontStyle: 'normal', marginBottom: 12 }]}>
            {docGrants.length === 0
              ? `No admins currently have access to ${employee.full_name}'s documents.`
              : docGrants.map(g => g.admin?.full_name).filter(Boolean).join(', ') + ' can see some or all of these documents.'}
          </Text>
          <TouchableOpacity style={[styles.inlineActionBtn, { borderColor: colors.yellow }]} onPress={openDocAccessModal}>
            <Text style={[styles.inlineActionBtnText, { color: colors.yellow }]}>Manage Document Access</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Field label="Employee Number" value={employeeNumber} onChange={setEmployeeNumber} theme={theme} placeholder="e.g. TKI001" />
            <Field label="Job Title" value={jobTitle} onChange={setJobTitle} theme={theme} placeholder="e.g. Field Technician" />
            <Field label="Department" value={department} onChange={setDepartment} theme={theme} placeholder="e.g. Operations" />
            <Field label="Phone" value={phone} onChange={setPhone} theme={theme} placeholder="e.g. 071 234 5678" keyboardType="phone-pad" />
            <Field label="ID Number" value={idNumber} onChange={setIdNumber} theme={theme} placeholder="e.g. 9001015009087" keyboardType="numeric" />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>
                DATE JOINED
              </Text>

              <DatePickerField
                value={dateJoined}
                onChange={setDateJoined}
                placeholder="Select date"
                isDark={isDark}
                theme={theme}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>SITE</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowSiteDropdown(!showSiteDropdown)}
              >
                <MapPin color={colors.yellow} size={16} />
                <Text style={[styles.dropdownBtnText, { color: selectedSiteId ? theme.text : theme.subtext }]}>
                  {selectedSite?.name ?? 'Select a site'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showSiteDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, { borderBottomColor: theme.border }]}
                    onPress={() => { setSelectedSiteId(null); setShowSiteDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, { color: theme.subtext }]}>No site</Text>
                  </TouchableOpacity>
                  {sites.map(site => (
                    <TouchableOpacity
                      key={site.id}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, selectedSiteId === site.id && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setSelectedSiteId(site.id); setShowSiteDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: selectedSiteId === site.id ? colors.yellow : theme.text }]}>
                        {site.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Custom Fields */}
            <View style={[styles.customFieldsHeader]}>
              <Text style={[styles.fieldLabel, { color: theme.subtext, marginBottom: 0 }]}>CUSTOM FIELDS</Text>
              <TouchableOpacity onPress={addCustomField}>
                <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 14 }}>+ Add Field</Text>
              </TouchableOpacity>
            </View>

            {editableCustomFields.map((f, index) => (
              <View key={f.id ?? `new-${index}`} style={styles.customFieldRow}>
                <View style={{ flex: 1, gap: 8 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                    placeholder="Field name (e.g. Emergency Contact)"
                    placeholderTextColor={theme.muted}
                    value={f.field_name}
                    onChangeText={v => updateCustomField(index, 'field_name', v)}
                  />
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                    placeholder="Value"
                    placeholderTextColor={theme.muted}
                    value={f.field_value}
                    onChangeText={v => updateCustomField(index, 'field_value', v)}
                  />
                </View>
                <TouchableOpacity onPress={() => removeCustomField(index)} style={{ paddingTop: 8 }}>
                  <Trash2 color="#ef4444" size={18} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Edit Approval Chain Modal */}
      <Modal visible={chainModalVisible} animationType="slide" transparent={false} onRequestClose={() => setChainModalVisible(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setChainModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Approvers for {employee.full_name}</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.customFieldsHeader}>
              <Text style={[styles.fieldLabel, { color: theme.subtext, marginBottom: 0 }]}>
                APPROVERS (MAX 4, MIN 1)
              </Text>
              {editableApprovers.length < 4 && (
                <TouchableOpacity onPress={addApproverSlot}>
                  <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 14 }}>+ Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {editableApprovers.map((approver, index) => (
              <View key={index} style={styles.approverInputRow}>
                <View style={[styles.orderBadge, { backgroundColor: `${colors.yellow}20` }]}>
                  <Text style={[styles.orderText, { color: colors.yellow }]}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.approverDropdownBtn, { backgroundColor: theme.input, borderColor: theme.border, flex: 1 }]}
                  onPress={() => setShowApproverDropdown(index)}
                >
                  <Text style={[styles.dropdownBtnText, { color: approver ? theme.text : theme.subtext }]}>
                    {approver?.full_name ?? 'Select approver'}
                  </Text>
                  <ChevronDown color={theme.muted} size={14} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeApproverSlot(index)}>
                  <Trash2 color="#ef4444" size={18} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[styles.saveBtn, savingChain && { opacity: 0.6 }]} onPress={handleSaveChain} disabled={savingChain}>
            {savingChain ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Approvers</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Approver Picker Modal — a real Modal instead of an absolutely
          positioned dropdown, so it can't get stuck behind the Save
          button or clipped due to web stacking-context quirks. */}
      <Modal
        visible={showApproverDropdown !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setShowApproverDropdown(null)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowApproverDropdown(null)}
        >
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Approver</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {admins.map(admin => {
                const currentApprover = showApproverDropdown !== null ? editableApprovers[showApproverDropdown] : null;
                const isSelected = currentApprover?.id === admin.id;
                return (
                  <TouchableOpacity
                    key={admin.id}
                    style={[styles.dropdownItem, { borderBottomColor: theme.border }, isSelected && { backgroundColor: `${colors.yellow}20` }]}
                    onPress={() => {
                      if (showApproverDropdown !== null) setApproverSlot(showApproverDropdown, admin);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, { color: isSelected ? colors.yellow : theme.text }]}>
                      {admin.full_name}
                    </Text>
                    <Text style={[styles.dropdownItemSub, { color: theme.subtext }]}>{admin.role}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Upload Document Modal (scoped to this employee) */}
      <Modal visible={docModalVisible} animationType="slide" transparent={false} onRequestClose={() => setDocModalVisible(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setDocModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Document</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.filePicker, { backgroundColor: theme.input, borderColor: selectedFile ? colors.yellow : theme.border }]}
              onPress={pickDocFile}
            >
              <Upload color={selectedFile ? colors.yellow : theme.muted} size={24} />
              <Text style={[styles.filePickerText, { color: selectedFile ? colors.yellow : theme.muted }]}>
                {selectedFile ? selectedFile.name : 'Tap to select a PDF or image'}
              </Text>
            </TouchableOpacity>

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

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>CATEGORY *</Text>
              <TouchableOpacity
                style={[styles.dropdownBtn, { backgroundColor: theme.input, borderColor: theme.border }]}
                onPress={() => setShowDocCategoryDropdown(!showDocCategoryDropdown)}
              >
                <Text style={[styles.dropdownBtnText, { color: docCategory ? theme.text : theme.subtext }]}>
                  {DOC_CATEGORIES.find(c => c.value === docCategory)?.label ?? 'Select category'}
                </Text>
                <ChevronDown color={theme.muted} size={16} />
              </TouchableOpacity>
              {showDocCategoryDropdown && (
                <View style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {DOC_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.value}
                      style={[styles.dropdownItem, { borderBottomColor: theme.border }, docCategory === cat.value && { backgroundColor: `${colors.yellow}20` }]}
                      onPress={() => { setDocCategory(cat.value); setShowDocCategoryDropdown(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: docCategory === cat.value ? colors.yellow : theme.text }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>
                DOCUMENT DATE
              </Text>

              <DatePickerField
                value={docDate}
                onChange={setDocDate}
                placeholder="Select document date"
                isDark={isDark}
                theme={theme}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={[styles.switchLabel, { color: theme.text }]}>Visible to Employee</Text>
                <Text style={[styles.switchDesc, { color: theme.subtext }]}>Employee can see this document</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, { backgroundColor: visibleToEmployee ? colors.yellow : theme.input, borderColor: theme.border }]}
                onPress={() => setVisibleToEmployee(!visibleToEmployee)}
              >
                <View style={[styles.toggleThumb, { backgroundColor: colors.white, transform: [{ translateX: visibleToEmployee ? 20 : 2 }] }]} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, uploadingDoc && { opacity: 0.6 }]} onPress={handleUploadDoc} disabled={uploadingDoc}>
            {uploadingDoc ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Upload Document</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Form Visibility Modal */}
      <Modal visible={formVisibilityModalVisible} animationType="slide" transparent={false} onRequestClose={() => setFormVisibilityModalVisible(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setFormVisibilityModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Form Access</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.fieldHint, { color: theme.muted, marginBottom: 16 }]}>
              Toggle off any form {employee.full_name} should not be able to see or submit.
            </Text>
            {allTemplates.length === 0 ? (
              <Text style={[styles.emptyInlineText, { color: theme.muted }]}>No forms exist yet.</Text>
            ) : (
              allTemplates.map(t => {
                const isVisible = !editableHiddenIds.has(t.id);
                return (
                  <View key={t.id} style={styles.switchRow}>
                    <View style={styles.switchInfo}>
                      <Text style={[styles.switchLabel, { color: theme.text }]}>{t.name}</Text>
                      {t.category && (
                        <Text style={[styles.switchDesc, { color: theme.subtext }]}>{t.category}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.toggle, { backgroundColor: isVisible ? colors.yellow : theme.input, borderColor: theme.border }]}
                      onPress={() => toggleTemplateVisibility(t.id)}
                    >
                      <View style={[styles.toggleThumb, { backgroundColor: colors.white, transform: [{ translateX: isVisible ? 20 : 2 }] }]} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          <TouchableOpacity style={[styles.saveBtn, savingVisibility && { opacity: 0.6 }]} onPress={handleSaveFormVisibility} disabled={savingVisibility}>
            {savingVisibility ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Form Access</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Document Access Modal */}
      <Modal visible={docAccessModalVisible} animationType="slide" transparent={false} onRequestClose={() => setDocAccessModalVisible(false)}>
        <ScrollView
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setDocAccessModalVisible(false)}>
              <X color={theme.muted} size={24} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Document Access</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.fieldHint, { color: theme.muted, marginBottom: 16 }]}>
              Grant specific admins access to {employee.full_name}'s documents. Turn on a category
              restriction to limit them to just that type, or leave on "All Categories" for full access.
            </Text>
            {adminUsers.length === 0 ? (
              <Text style={[styles.emptyInlineText, { color: theme.muted }]}>No admin users exist yet.</Text>
            ) : (
              adminUsers.map(admin => {
                const grant = editableGrants[admin.id] ?? { granted: false, categories: null };
                return (
                  <View key={admin.id} style={styles.docAccessBlock}>
                    <View style={styles.switchRow}>
                      <View style={styles.switchInfo}>
                        <Text style={[styles.switchLabel, { color: theme.text }]}>{admin.full_name}</Text>
                        <Text style={[styles.switchDesc, { color: theme.subtext }]}>
                          {grant.granted
                            ? (grant.categories === null ? 'All categories' : grant.categories.join(', ') || 'No categories selected')
                            : 'No access'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.toggle, { backgroundColor: grant.granted ? colors.yellow : theme.input, borderColor: theme.border }]}
                        onPress={() => toggleAdminGrant(admin.id)}
                      >
                        <View style={[styles.toggleThumb, { backgroundColor: colors.white, transform: [{ translateX: grant.granted ? 20 : 2 }] }]} />
                      </TouchableOpacity>
                    </View>

                    {grant.granted && (
                      <View style={styles.categoryChipsRow}>
                        <TouchableOpacity
                          style={[
                            styles.categoryChip,
                            { borderColor: theme.border },
                            grant.categories === null && { backgroundColor: colors.yellow, borderColor: colors.yellow },
                          ]}
                          onPress={() => setGrantToAllCategories(admin.id)}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: grant.categories === null ? colors.black : theme.subtext }}>
                            All Categories
                          </Text>
                        </TouchableOpacity>
                        {DOC_CATEGORIES.map(cat => {
                          const selected = grant.categories !== null && grant.categories.includes(cat.value);
                          return (
                            <TouchableOpacity
                              key={cat.value}
                              style={[
                                styles.categoryChip,
                                { borderColor: theme.border },
                                selected && { backgroundColor: colors.yellow, borderColor: colors.yellow },
                              ]}
                              onPress={() => toggleGrantCategory(admin.id, cat.value)}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? colors.black : theme.subtext }}>
                                {cat.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <TouchableOpacity style={[styles.saveBtn, savingDocAccess && { opacity: 0.6 }]} onPress={handleSaveDocAccess} disabled={savingDocAccess}>
            {savingDocAccess ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Document Access</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

function DocumentRow({ doc, theme, getDocCategoryColor, deleteDocument }: any) {
  const cat = getDocCategoryColor(doc.category);
  return (
    <View style={[styles.docRow, { borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{doc.name}</Text>
        <View style={styles.docMetaRow}>
          <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
            <Text style={[styles.catText, { color: cat.text }]}>{doc.category}</Text>
          </View>
          <Text style={[styles.docDate, { color: theme.muted }]}>
            {doc.document_date
              ? new Date(doc.document_date).toLocaleDateString('en-ZA')
              : new Date(doc.created_at).toLocaleDateString('en-ZA')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.docActionBtn}
        onPress={() => {
          const { Linking } = require('react-native');
          Linking.openURL(doc.file_url);
        }}
      >
        <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>View</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.docActionBtn} onPress={() => deleteDocument(doc)}>
        <Trash2 color="#ef4444" size={16} />
      </TouchableOpacity>
    </View>
  );
}

function DetailRow({ icon, label, value, theme, isLast }: any) {
  return (
    <View style={[styles.detailRow, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailInfo}>
        <Text style={[styles.detailLabel, { color: theme.subtext }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: value ? theme.text : theme.muted }]}>{value ?? 'Not set'}</Text>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, theme, placeholder, keyboardType }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.subtext }]}>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.fieldInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.subtext}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
      />
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
  editBtn: { backgroundColor: colors.yellow, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  editBtnText: { color: colors.black, fontWeight: '700', fontSize: 14 },
  content: { padding: 16, gap: 16 },
  profileCard: { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 1, gap: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '700' },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 13, fontWeight: '600' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  siteName: { fontSize: 13 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  detailIcon: { width: 24, alignItems: 'center' },
  detailInfo: { flex: 1 },
  detailLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  detailValue: { fontSize: 15 },
  emptyInlineText: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  orderBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  orderText: { fontSize: 13, fontWeight: '700' },
  chainApproverName: { fontSize: 14, fontWeight: '600' },
  inlineActionBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  inlineActionBtnText: { fontSize: 14, fontWeight: '700' },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  filterScroll: { marginBottom: 10 },
  filterTab: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  filterTabText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  submissionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderTopWidth: 1, gap: 10,
  },
  submissionName: { fontSize: 14, fontWeight: '600' },
  submissionDate: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  smallAddBtn: {
    backgroundColor: colors.yellow, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, gap: 10 },
  docName: { fontSize: 14, fontWeight: '600' },
  docMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  catText: { fontSize: 10, fontWeight: '700' },
  docDate: { fontSize: 11 },
  docActionBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  docSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 12,
  },
  docSearchInput: { flex: 1, fontSize: 14 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderTopWidth: 1,
  },
  folderIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  folderName: { fontSize: 14, fontWeight: '600' },
  folderCount: { fontSize: 12, marginTop: 2 },
  folderBackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  folderTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  docAccessBlock: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  categoryChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  // Approver picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerSheet: {
    width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  // Modal
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  fieldHint: { fontSize: 13, lineHeight: 18 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10,
  },
  dropdownBtnText: { flex: 1, fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { padding: 14, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 15 },
  dropdownItemSub: { fontSize: 12, marginTop: 2 },
  customFieldsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  customFieldRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  approverInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  approverDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 48, gap: 8,
  },
  filePicker: {
    borderWidth: 2, borderRadius: 14, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', gap: 10, marginBottom: 20,
  },
  filePickerText: { fontSize: 14, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  switchInfo: { flex: 1 },
  switchLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  switchDesc: { fontSize: 12 },
  toggle: { width: 46, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 56,
    alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});