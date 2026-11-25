import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Trash2, Upload, Check } from 'lucide-react-native';
import SignaturePad, { SignaturePadHandle } from './SignaturePad';
import FileDropZone from './FileDropZone';
import { notify, confirm } from '../lib/notify';
import {
  SavedSignature, listSavedSignatures, saveSignature,
  deleteSavedSignature, MAX_SAVED_SIGNATURES,
} from '../lib/savedSignatures';
import { fileToSignatureDataUrl } from '../lib/signatureImage';

const YELLOW = '#fbbf24';

type Theme = { background: string; text: string; subtext: string; border: string };

type Props = {
  visible: boolean;
  onCancel: () => void;
  /** Always a data URL (data:image/...;base64,...) - same shape the old pad returned. */
  onSigned: (dataUrl: string) => void | Promise<void>;
  theme: Theme;
};

type Tab = 'draw' | 'saved' | 'upload';

export default function SignatureModal({ visible, onCancel, onSigned, theme }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [remember, setRemember] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTab('draw');
    setUploaded(null);
    setRemember(false);
    loadSaved();
  }, [visible]);

  async function loadSaved() {
    setLoadingSaved(true);
    try {
      setSaved(await listSavedSignatures());
    } catch {
      // Table not created yet or offline - Draw and Upload still work.
      setSaved([]);
    } finally {
      setLoadingSaved(false);
    }
  }

  // Hands the finished signature back, optionally remembering it first.
  async function finish(dataUrl: string, alreadySaved = false) {
    setBusy(true);
    try {
      if (remember && !alreadySaved) {
        try {
          await saveSignature(dataUrl);
        } catch (e: any) {
          notify('Not saved for later', e.message ?? 'Your signature will still be used on this form.');
        }
      }
      await onSigned(dataUrl);
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(asset?: { uri: string; name: string; mimeType?: string; size?: number }) {
    try {
      let file = asset;
      if (!file) {
        const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.[0]) return;
        const a = res.assets[0];
        file = { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size };
      }
      setBusy(true);
      setUploaded(await fileToSignatureDataUrl(file));
    } catch (e: any) {
      notify('Could not use that image', e.message ?? 'Please try a different file.');
    } finally {
      setBusy(false);
    }
  }

  function removeSaved(s: SavedSignature) {
    confirm('Delete signature', 'Remove this saved signature?', async () => {
      try {
        await deleteSavedSignature(s.id);
        setSaved((prev) => prev.filter((x) => x.id !== s.id));
      } catch (e: any) {
        notify('Error', e.message);
      }
    });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'draw', label: 'Draw' },
    { key: 'saved', label: saved.length ? `Saved (${saved.length})` : 'Saved' },
    { key: 'upload', label: 'Upload' },
  ];

  const showRemember = tab !== 'saved';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onCancel} disabled={busy}>
            <Text style={[styles.cancel, { color: theme.subtext }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Add Signature</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.tabs}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, { borderColor: active ? YELLOW : theme.border, backgroundColor: active ? YELLOW : 'transparent' }]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, { color: active ? '#000' : theme.subtext }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* DRAW */}
        {tab === 'draw' && (
          <View style={{ flex: 1 }}>
            <View style={styles.hintRow}>
              <Text style={[styles.hint, { color: theme.subtext }]}>Draw your signature below</Text>
              <TouchableOpacity onPress={() => padRef.current?.clearSignature()}>
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
            </View>
            <SignaturePad
              ref={padRef}
              onOK={(sig) => finish(sig)}
              onEmpty={() => notify('Empty', 'Please draw your signature first.')}
              style={{ borderWidth: 1, borderColor: theme.border, marginHorizontal: 16, borderRadius: 12, minHeight: 300 }}
            />
          </View>
        )}

        {/* SAVED */}
        {tab === 'saved' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            {loadingSaved ? (
              <ActivityIndicator color={YELLOW} style={{ marginTop: 40 }} />
            ) : saved.length === 0 ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No saved signatures yet</Text>
                <Text style={[styles.hint, { color: theme.subtext }]}>
                  Draw or upload one and switch on "Save for next time" to reuse it on any form.
                </Text>
              </View>
            ) : (
              saved.map((s) => (
                <View key={s.id} style={[styles.savedCard, { borderColor: theme.border }]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => finish(s.image_data, true)} disabled={busy}>
                    <View style={styles.thumbWrap}>
                      <Image source={{ uri: s.image_data }} style={styles.thumb} resizeMode="contain" />
                    </View>
                    <Text style={[styles.savedName, { color: theme.subtext }]}>Tap to use · {s.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeSaved(s)} style={styles.trash} disabled={busy}>
                    <Trash2 size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
            <Text style={[styles.limit, { color: theme.subtext }]}>
              {saved.length}/{MAX_SAVED_SIGNATURES} saved
            </Text>
          </ScrollView>
        )}

        {/* UPLOAD */}
        {tab === 'upload' && (
          <View style={{ flex: 1, padding: 16 }}>
            <FileDropZone onFile={(f) => pickFile(f)}>
              <TouchableOpacity
                style={[styles.dropBox, { borderColor: YELLOW }]}
                onPress={() => pickFile()}
                disabled={busy}
              >
                {uploaded ? (
                  <View style={styles.thumbWrapLarge}>
                    <Image source={{ uri: uploaded }} style={styles.thumb} resizeMode="contain" />
                  </View>
                ) : (
                  <>
                    <Upload size={32} color={YELLOW} />
                    <Text style={[styles.dropTitle, { color: YELLOW }]}>
                      {Platform.OS === 'web' ? 'Drop an image here or click to browse' : 'Tap to choose an image'}
                    </Text>
                    <Text style={[styles.hint, { color: theme.subtext }]}>
                      PNG or JPG of your signature (a transparent PNG looks best)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </FileDropZone>
            {uploaded && (
              <TouchableOpacity onPress={() => setUploaded(null)} style={{ alignSelf: 'center', marginTop: 12 }}>
                <Text style={{ color: theme.subtext, fontSize: 14 }}>Choose a different image</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Footer */}
        {showRemember && (
          <TouchableOpacity style={styles.rememberRow} onPress={() => setRemember((r) => !r)} activeOpacity={0.7}>
            <View style={[styles.checkbox, { borderColor: remember ? YELLOW : theme.border, backgroundColor: remember ? YELLOW : 'transparent' }]}>
              {remember && <Check size={14} color="#000" />}
            </View>
            <Text style={[styles.rememberText, { color: theme.text }]}>Save for next time</Text>
          </TouchableOpacity>
        )}

        {tab !== 'saved' && (
          <TouchableOpacity
            style={[styles.saveBtn, (busy || (tab === 'upload' && !uploaded)) && { opacity: 0.5 }]}
            disabled={busy || (tab === 'upload' && !uploaded)}
            onPress={() => {
              if (tab === 'draw') padRef.current?.readSignature();
              else if (uploaded) finish(uploaded);
            }}
          >
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Use Signature</Text>}
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1,
  },
  cancel: { fontSize: 16, width: 56 },
  title: { fontSize: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  hint: { fontSize: 14, textAlign: 'center' },
  clear: { color: YELLOW, fontWeight: '600', fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  savedCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  thumbWrap: { height: 90, backgroundColor: '#fff', borderRadius: 8, padding: 6 },
  thumbWrapLarge: { width: '100%', height: 200, backgroundColor: '#fff', borderRadius: 10, padding: 8 },
  thumb: { width: '100%', height: '100%' },
  savedName: { fontSize: 12, marginTop: 6 },
  trash: { padding: 10 },
  limit: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  dropBox: {
    minHeight: 220, borderWidth: 2, borderStyle: 'dashed', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8,
  },
  dropTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rememberText: { fontSize: 15 },
  saveBtn: {
    backgroundColor: YELLOW, margin: 16, marginBottom: 32, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
