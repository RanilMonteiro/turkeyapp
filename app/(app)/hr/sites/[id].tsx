import { useState, useCallback } from 'react';
import RequirePermission from '../../../../components/RequirePermission';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  TextInput, Modal, Platform, Linking, Image
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, MapPin, Phone, Mail, User, Plus, Trash2, Edit,
  FileText, Upload, MessageSquare, History, X, Image as ImageIcon, Video
} from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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

const TABS = [
  { key: 'info', label: 'Info', icon: MapPin },
  { key: 'contacts', label: 'Contacts', icon: User },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'notes', label: 'Notes', icon: MessageSquare },
  { key: 'history', label: 'History', icon: History }, // only shown to canManage
] as const;
type TabKey = typeof TABS[number]['key'];

type Site = { id: string; name: string; created_at: string };
type SiteDetails = { address: string | null; access_info: string | null };
type Contact = { id: string; name: string; role_title: string | null; phone: string | null; email: string | null };
type SiteDoc = { id: string; name: string; file_url: string; file_type: string | null; uploaded_by: string | null; created_at: string; uploader?: { full_name: string } | null };
type SiteNote = { id: string; note_text: string | null; media_url: string | null; media_type: string | null; created_by: string | null; created_at: string; author?: { full_name: string } | null };
type ActivityRow = { id: string; action: string; description: string | null; created_at: string; actor?: { full_name: string } | null };

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

function SiteDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const siteId = id as string;
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  const [site, setSite] = useState<Site | null>(null);
  const [details, setDetails] = useState<SiteDetails>({ address: null, access_info: null });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<SiteDoc[]>([]);
  const [notes, setNotes] = useState<SiteNote[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [historyFilter, setHistoryFilter] = useState('');

  // Info edit modal
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [accessInfoInput, setAccessInfoInput] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  // Contact modal
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Document upload modal
  const [docModalVisible, setDocModalVisible] = useState(false);
  const [docName, setDocName] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Note modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

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
      fetchAll();
    }, [siteId])
  );

  async function fetchAll() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).single();
    const role = profile?.role;

    let manage = false;
    if (role === 'superuser') {
      manage = true;
    } else if (role === 'admin' || role === 'hr') {
      const { data: grant } = await supabase
        .from('user_permissions')
        .select('granted')
        .eq('user_id', uid)
        .eq('permission', 'can_manage_sites')
        .maybeSingle();
      manage = !!grant?.granted;
    }
    setCanManage(manage);

    await Promise.all([
      fetchSite(),
      fetchDetails(),
      fetchContacts(),
      fetchDocuments(),
      fetchNotes(),
      manage ? fetchActivity() : Promise.resolve(),
    ]);
    setLoading(false);
  }

  async function fetchSite() {
    const { data } = await supabase.from('sites').select('*').eq('id', siteId).single();
    if (data) setSite(data);
  }

  async function fetchDetails() {
    const { data } = await supabase.from('site_details').select('address, access_info').eq('site_id', siteId).maybeSingle();
    setDetails({ address: data?.address ?? null, access_info: data?.access_info ?? null });
  }

  async function fetchContacts() {
    const { data } = await supabase.from('site_contacts').select('*').eq('site_id', siteId).order('name');
    if (data) setContacts(data);
  }

  async function fetchDocuments() {
    const { data } = await supabase
      .from('site_documents')
      .select('*, uploader:uploaded_by(full_name)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as any);
  }

  async function fetchNotes() {
    const { data } = await supabase
      .from('site_notes')
      .select('*, author:created_by(full_name)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });
    if (data) setNotes(data as any);
  }

  async function fetchActivity() {
    const { data } = await supabase
      .from('site_activity_log')
      .select('*, actor:actor_id(full_name)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });
    if (data) setActivity(data as any);
  }

  async function logActivity(action: string, description: string) {
    await supabase.from('site_activity_log').insert({
      site_id: siteId,
      actor_id: userId,
      action,
      description,
    });
    if (canManage) fetchActivity();
  }

  // ---------- Info ----------

  function openInfoModal() {
    setAddressInput(details.address ?? '');
    setAccessInfoInput(details.access_info ?? '');
    setInfoModalVisible(true);
  }

  async function handleSaveInfo() {
    setSavingInfo(true);
    const { error } = await supabase.from('site_details').upsert({
      site_id: siteId,
      address: addressInput.trim() || null,
      access_info: accessInfoInput.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    setSavingInfo(false);
    if (error) {
      notify('Error', error.message);
      return;
    }
    setInfoModalVisible(false);
    fetchDetails();
    logActivity('updated_site_info', 'Updated address / access info');
  }

  // ---------- Contacts ----------

  function openNewContactModal() {
    setEditingContact(null);
    setContactName('');
    setContactRole('');
    setContactPhone('');
    setContactEmail('');
    setContactModalVisible(true);
  }

  function openEditContactModal(contact: Contact) {
    setEditingContact(contact);
    setContactName(contact.name);
    setContactRole(contact.role_title ?? '');
    setContactPhone(contact.phone ?? '');
    setContactEmail(contact.email ?? '');
    setContactModalVisible(true);
  }

  async function handleSaveContact() {
    if (!contactName.trim()) {
      notify('Missing name', 'Please enter a contact name.');
      return;
    }
    setSavingContact(true);

    const payload = {
      site_id: siteId,
      name: contactName.trim(),
      role_title: contactRole.trim() || null,
      phone: contactPhone.trim() || null,
      email: contactEmail.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingContact
      ? await supabase.from('site_contacts').update(payload).eq('id', editingContact.id)
      : await supabase.from('site_contacts').insert({ ...payload, created_by: userId });

    setSavingContact(false);
    if (error) {
      notify('Error', error.message);
      return;
    }
    setContactModalVisible(false);
    fetchContacts();
    logActivity(editingContact ? 'updated_contact' : 'added_contact', contactName.trim());
  }

  function handleDeleteContact(contact: Contact) {
    confirm('Delete Contact', `Remove "${contact.name}" from this site's contacts?`, async () => {
      const { error } = await supabase.from('site_contacts').delete().eq('id', contact.id);
      if (error) {
        notify('Error', error.message);
      } else {
        fetchContacts();
        logActivity('deleted_contact', contact.name);
      }
    });
  }

  // ---------- Documents ----------

  function openDocModal() {
    setDocName('');
    setSelectedFile(null);
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
    if (!selectedFile) {
      notify('No file', 'Please select a file to upload.');
      return;
    }

    setUploadingDoc(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `site_${siteId}_${Date.now()}.${fileExt}`;
      const bytes = await fileToUint8Array(selectedFile.uri);

      const { error: uploadError } = await supabase.storage
        .from('site-documents')
        .upload(fileName, bytes, { contentType: selectedFile.mimeType ?? 'application/octet-stream' });

      if (uploadError) {
        notify('Upload error', uploadError.message);
        setUploadingDoc(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('site-documents').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('site_documents').insert({
        site_id: siteId,
        name: docName.trim(),
        file_url: urlData.publicUrl,
        file_type: fileExt,
        uploaded_by: userId,
      });

      if (dbError) {
        notify('Error', dbError.message);
      } else {
        setDocModalVisible(false);
        fetchDocuments();
        logActivity('added_document', docName.trim());
      }
    } catch (e: any) {
      notify('Error', e.message ?? 'Something went wrong reading that file.');
    }
    setUploadingDoc(false);
  }

  function handleDeleteDoc(doc: SiteDoc) {
    confirm('Delete Document', `Delete "${doc.name}"? This cannot be undone.`, async () => {
      const { error } = await supabase.from('site_documents').delete().eq('id', doc.id);
      if (error) {
        notify('Error', error.message);
      } else {
        fetchDocuments();
        logActivity('deleted_document', doc.name);
      }
    });
  }

  // ---------- Notes ----------

  function openNoteModal() {
    setNoteText('');
    setSelectedMedia(null);
    setNoteModalVisible(true);
  }

  async function pickNoteMedia(type: 'image' | 'video') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('Permission needed', 'Please allow photo library access to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedMedia({ uri: result.assets[0].uri, type });
    }
  }

  async function handleSaveNote() {
    if (!noteText.trim() && !selectedMedia) {
      notify('Empty note', 'Add some text or attach a photo/video.');
      return;
    }

    setSavingNote(true);
    try {
      let mediaUrl: string | null = null;

      if (selectedMedia) {
        const ext = selectedMedia.type === 'image' ? 'jpg' : 'mp4';
        const fileName = `site_${siteId}_${Date.now()}.${ext}`;
        const bytes = await fileToUint8Array(selectedMedia.uri);
        const { error: uploadError } = await supabase.storage
          .from('site-media')
          .upload(fileName, bytes, { contentType: selectedMedia.type === 'image' ? 'image/jpeg' : 'video/mp4' });

        if (uploadError) {
          notify('Upload error', uploadError.message);
          setSavingNote(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('site-media').getPublicUrl(fileName);
        mediaUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from('site_notes').insert({
        site_id: siteId,
        note_text: noteText.trim() || null,
        media_url: mediaUrl,
        media_type: selectedMedia?.type ?? null,
        created_by: userId,
      });

      if (error) {
        notify('Error', error.message);
      } else {
        setNoteModalVisible(false);
        fetchNotes();
        logActivity('added_note', noteText.trim() || `Added ${selectedMedia?.type ?? 'note'}`);
      }
    } catch (e: any) {
      notify('Error', e.message ?? 'Something went wrong.');
    }
    setSavingNote(false);
  }

  function handleDeleteNote(note: SiteNote) {
    confirm('Delete Note', 'Delete this note? This cannot be undone.', async () => {
      const { error } = await supabase.from('site_notes').delete().eq('id', note.id);
      if (error) {
        notify('Error', error.message);
      } else {
        fetchNotes();
        logActivity('deleted_note', note.note_text ?? 'note');
      }
    });
  }

  const filteredActivity = activity.filter(a => {
    if (!historyFilter.trim()) return true;
    const q = historyFilter.trim().toLowerCase();
    return a.action.toLowerCase().includes(q)
      || (a.description ?? '').toLowerCase().includes(q)
      || (a.actor?.full_name ?? '').toLowerCase().includes(q);
  });

  const visibleTabs = TABS.filter(t => t.key !== 'history' || canManage);

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
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{site?.name ?? 'Site'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {visibleTabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, { borderColor: theme.border }, active && { backgroundColor: colors.yellow, borderColor: colors.yellow }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <tab.icon color={active ? colors.black : theme.subtext} size={14} />
              <Text style={[styles.tabChipText, { color: active ? colors.black : theme.subtext }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {/* INFO TAB */}
        {activeTab === 'info' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Site Information</Text>
              {canManage && (
                <TouchableOpacity onPress={openInfoModal}>
                  <Edit color={colors.yellow} size={18} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.subtext }]}>ADDRESS / LOCATION</Text>
              <Text style={[styles.infoValue, { color: details.address ? theme.text : theme.muted }]}>
                {details.address ?? 'Not set'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.subtext }]}>ACCESS INFO</Text>
              <Text style={[styles.infoValue, { color: details.access_info ? theme.text : theme.muted }]}>
                {details.access_info ?? 'Not set'}
              </Text>
            </View>
            {!canManage && (
              <Text style={[styles.viewOnlyNote, { color: theme.muted }]}>View only</Text>
            )}
          </View>
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Contacts</Text>
              {canManage && (
                <TouchableOpacity style={styles.smallAddBtn} onPress={openNewContactModal}>
                  <Plus color={colors.black} size={16} />
                </TouchableOpacity>
              )}
            </View>
            {contacts.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No contacts added yet.</Text>
            ) : (
              contacts.map(c => (
                <View key={c.id} style={[styles.contactRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contactName, { color: theme.text }]}>{c.name}</Text>
                    {c.role_title && <Text style={[styles.contactRole, { color: theme.subtext }]}>{c.role_title}</Text>}
                    <View style={styles.contactActionsRow}>
                      {c.phone && (
                        <TouchableOpacity style={styles.contactActionBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                          <Phone color={colors.yellow} size={13} />
                          <Text style={[styles.contactActionText, { color: theme.subtext }]}>{c.phone}</Text>
                        </TouchableOpacity>
                      )}
                      {c.email && (
                        <TouchableOpacity style={styles.contactActionBtn} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                          <Mail color={colors.yellow} size={13} />
                          <Text style={[styles.contactActionText, { color: theme.subtext }]}>{c.email}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {canManage && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => openEditContactModal(c)}>
                        <Edit color={colors.yellow} size={16} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteContact(c)}>
                        <Trash2 color="#ef4444" size={16} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Documents</Text>
              <TouchableOpacity style={styles.smallAddBtn} onPress={openDocModal}>
                <Plus color={colors.black} size={16} />
              </TouchableOpacity>
            </View>
            {documents.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No documents uploaded yet.</Text>
            ) : (
              documents.map(doc => (
                <View key={doc.id} style={[styles.docRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{doc.name}</Text>
                    <Text style={[styles.docMeta, { color: theme.muted }]}>
                      {doc.uploader?.full_name ?? 'Unknown'} · {new Date(doc.created_at).toLocaleDateString('en-ZA')}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.docActionBtn} onPress={() => Linking.openURL(doc.file_url)}>
                    <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>View</Text>
                  </TouchableOpacity>
                  {canManage && (
                    <TouchableOpacity style={styles.docActionBtn} onPress={() => handleDeleteDoc(doc)}>
                      <Trash2 color="#ef4444" size={16} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Notes</Text>
              <TouchableOpacity style={styles.smallAddBtn} onPress={openNoteModal}>
                <Plus color={colors.black} size={16} />
              </TouchableOpacity>
            </View>
            {notes.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No notes yet.</Text>
            ) : (
              notes.map(n => (
                <View key={n.id} style={[styles.noteCard, { borderColor: theme.border }]}>
                  <View style={styles.noteHeaderRow}>
                    <Text style={[styles.noteAuthor, { color: theme.text }]}>{n.author?.full_name ?? 'Unknown'}</Text>
                    <Text style={[styles.noteDate, { color: theme.muted }]}>
                      {new Date(n.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {n.note_text && <Text style={[styles.noteText, { color: theme.subtext }]}>{n.note_text}</Text>}
                  {n.media_url && n.media_type === 'image' && (
                    <Image source={{ uri: n.media_url }} style={styles.noteImage} resizeMode="cover" />
                  )}
                  {n.media_url && n.media_type === 'video' && (
                    <TouchableOpacity style={styles.videoPlaceholder} onPress={() => Linking.openURL(n.media_url!)}>
                      <Video color={colors.yellow} size={20} />
                      <Text style={{ color: colors.yellow, fontSize: 12, fontWeight: '600' }}>View video</Text>
                    </TouchableOpacity>
                  )}
                  {canManage && (
                    <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 6 }} onPress={() => handleDeleteNote(n)}>
                      <Trash2 color="#ef4444" size={15} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* HISTORY TAB (canManage only) */}
        {activeTab === 'history' && canManage && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Activity History</Text>
            <TextInput
              style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
              placeholder="Filter by person, action, or description..."
              placeholderTextColor={theme.muted}
              value={historyFilter}
              onChangeText={setHistoryFilter}
            />
            {filteredActivity.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.muted }]}>No matching activity.</Text>
            ) : (
              filteredActivity.map(a => (
                <View key={a.id} style={[styles.historyRow, { borderColor: theme.border }]}>
                  <Text style={[styles.historyActor, { color: theme.text }]}>{a.actor?.full_name ?? 'Unknown'}</Text>
                  <Text style={[styles.historyAction, { color: theme.subtext }]}>
                    {a.action.replace(/_/g, ' ')}{a.description ? ` — ${a.description}` : ''}
                  </Text>
                  <Text style={[styles.historyDate, { color: theme.muted }]}>
                    {new Date(a.created_at).toLocaleString('en-ZA')}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Info edit modal */}
      <Modal visible={infoModalVisible} animationType="slide" transparent={false} onRequestClose={() => setInfoModalVisible(false)}>
        <ScrollView style={[styles.modalContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setInfoModalVisible(false)}><X color={theme.muted} size={24} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Site Info</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ADDRESS / LOCATION</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, height: 70, textAlignVertical: 'top' }]}
                placeholder="e.g. Plot 12, Modderfontein Road"
                placeholderTextColor={theme.muted}
                value={addressInput}
                onChangeText={setAddressInput}
                multiline
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ACCESS INFO</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, height: 90, textAlignVertical: 'top' }]}
                placeholder="Gate codes, sign-in procedure, PPE requirements..."
                placeholderTextColor={theme.muted}
                value={accessInfoInput}
                onChangeText={setAccessInfoInput}
                multiline
              />
            </View>
          </View>
          <TouchableOpacity style={[styles.saveBtn, savingInfo && { opacity: 0.6 }]} onPress={handleSaveInfo} disabled={savingInfo}>
            {savingInfo ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Info</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Contact modal */}
      <Modal visible={contactModalVisible} animationType="slide" transparent={false} onRequestClose={() => setContactModalVisible(false)}>
        <ScrollView style={[styles.modalContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setContactModalVisible(false)}><X color={theme.muted} size={24} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{editingContact ? 'Edit Contact' : 'New Contact'}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>NAME *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} placeholder="e.g. Doug Smith" placeholderTextColor={theme.muted} value={contactName} onChangeText={setContactName} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>ROLE / TITLE</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} placeholder="e.g. Site Manager" placeholderTextColor={theme.muted} value={contactRole} onChangeText={setContactRole} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>PHONE</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} placeholder="e.g. 082-448-9345" placeholderTextColor={theme.muted} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>EMAIL</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} placeholder="e.g. doug@mine.co.za" placeholderTextColor={theme.muted} value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>
          <TouchableOpacity style={[styles.saveBtn, savingContact && { opacity: 0.6 }]} onPress={handleSaveContact} disabled={savingContact}>
            {savingContact ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Contact</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Document upload modal */}
      <Modal visible={docModalVisible} animationType="slide" transparent={false} onRequestClose={() => setDocModalVisible(false)}>
        <ScrollView style={[styles.modalContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setDocModalVisible(false)}><X color={theme.muted} size={24} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Upload Document</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity style={[styles.filePicker, { backgroundColor: theme.input, borderColor: selectedFile ? colors.yellow : theme.border }]} onPress={pickDocFile}>
              <Upload color={selectedFile ? colors.yellow : theme.muted} size={24} />
              <Text style={[styles.filePickerText, { color: selectedFile ? colors.yellow : theme.muted }]}>
                {selectedFile ? selectedFile.name : 'Tap to select a PDF or image'}
              </Text>
            </TouchableOpacity>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>DOCUMENT NAME *</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} placeholder="e.g. Site Safety Policy" placeholderTextColor={theme.muted} value={docName} onChangeText={setDocName} />
            </View>
          </View>
          <TouchableOpacity style={[styles.saveBtn, uploadingDoc && { opacity: 0.6 }]} onPress={handleUploadDoc} disabled={uploadingDoc}>
            {uploadingDoc ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Upload Document</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* Note modal */}
      <Modal visible={noteModalVisible} animationType="slide" transparent={false} onRequestClose={() => setNoteModalVisible(false)}>
        <ScrollView style={[styles.modalContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setNoteModalVisible(false)}><X color={theme.muted} size={24} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Note</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.subtext }]}>NOTE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, height: 100, textAlignVertical: 'top' }]}
                placeholder="What happened at the site..."
                placeholderTextColor={theme.muted}
                value={noteText}
                onChangeText={setNoteText}
                multiline
              />
            </View>
            <View style={styles.mediaBtnRow}>
              <TouchableOpacity style={[styles.mediaBtn, { borderColor: theme.border }]} onPress={() => pickNoteMedia('image')}>
                <ImageIcon color={colors.yellow} size={18} />
                <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>Add Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mediaBtn, { borderColor: theme.border }]} onPress={() => pickNoteMedia('video')}>
                <Video color={colors.yellow} size={18} />
                <Text style={{ color: colors.yellow, fontSize: 13, fontWeight: '600' }}>Add Video</Text>
              </TouchableOpacity>
            </View>
            {selectedMedia && (
              <View style={styles.selectedMediaRow}>
                {selectedMedia.type === 'image' ? (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.selectedMediaThumb} />
                ) : (
                  <View style={[styles.selectedMediaThumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Video color={colors.yellow} size={20} />
                  </View>
                )}
                <TouchableOpacity onPress={() => setSelectedMedia(null)}>
                  <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity style={[styles.saveBtn, savingNote && { opacity: 0.6 }]} onPress={handleSaveNote} disabled={savingNote}>
            {savingNote ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Note</Text>}
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
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  tabRow: { flexGrow: 0, paddingVertical: 10 },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8,
  },
  tabChipText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  smallAddBtn: { backgroundColor: colors.yellow, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontStyle: 'italic' },
  infoRow: { marginBottom: 14 },
  infoLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { fontSize: 14, lineHeight: 20 },
  viewOnlyNote: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: 1, gap: 10 },
  contactName: { fontSize: 15, fontWeight: '600' },
  contactRole: { fontSize: 12, marginTop: 2, marginBottom: 6 },
  contactActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  contactActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contactActionText: { fontSize: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, gap: 12 },
  docName: { fontSize: 14, fontWeight: '600' },
  docMeta: { fontSize: 11, marginTop: 2 },
  docActionBtn: { paddingHorizontal: 4 },
  noteCard: { paddingVertical: 12, borderTopWidth: 1 },
  noteHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteAuthor: { fontSize: 13, fontWeight: '700' },
  noteDate: { fontSize: 11 },
  noteText: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  noteImage: { width: '100%', height: 180, borderRadius: 10, marginTop: 4 },
  videoPlaceholder: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: 10, backgroundColor: 'rgba(251,191,36,0.1)', marginTop: 4,
  },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  historyRow: { paddingVertical: 10, borderTopWidth: 1 },
  historyActor: { fontSize: 13, fontWeight: '700' },
  historyAction: { fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  historyDate: { fontSize: 11, marginTop: 2 },
  modalContainer: { flex: 1 },
  modalContent: { paddingBottom: 48 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  formCard: { margin: 16, borderRadius: 20, padding: 20, borderWidth: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  filePicker: {
    borderWidth: 2, borderRadius: 14, borderStyle: 'dashed',
    padding: 24, alignItems: 'center', gap: 10, marginBottom: 20,
  },
  filePickerText: { fontSize: 14, textAlign: 'center' },
  mediaBtnRow: { flexDirection: 'row', gap: 12 },
  mediaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  selectedMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  selectedMediaThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: 'rgba(251,191,36,0.1)' },
  saveBtn: {
    backgroundColor: colors.yellow, borderRadius: 14, height: 56,
    alignItems: 'center', justifyContent: 'center', margin: 16,
  },
  saveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
});

// Guarded entry point: the screen only opens while the "Sites" switch is on for this user.
export default function SiteDetailScreen() {
  return (
    <RequirePermission permission="view_sites" name="Sites">
      <SiteDetail />
    </RequirePermission>
  );
}
