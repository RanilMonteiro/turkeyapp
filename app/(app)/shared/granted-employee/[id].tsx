import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Lock } from 'lucide-react-native';
import Avatar from '../../../../components/Avatar';
import RequirePermission from '../../../../components/RequirePermission';
import { supabase } from '../../../../lib/supabase';
import { viewDocument, downloadDocument } from '../../../../lib/documentActions';

const colors = {
  yellow: '#fbbf24', white: '#ffffff', black: '#000000',
  gray: { 50: '#f8fafc', 200: '#e2e8f0', 400: '#94a3b8', 500: '#64748b', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
};

const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal Document', policy: 'Policy', procedure: 'Procedure',
  contract: 'Contract', form: 'Form', training: 'Training', other: 'Other',
};

function fmtDate(v?: string | null) {
  if (!v) return '';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Inner() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useColorScheme() === 'dark';
  const [loading, setLoading] = useState(true);
  const [emp, setEmp] = useState<any>(null);
  const [custom, setCustom] = useState<{ field_name: string; field_value: string | null }[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [hasInfo, setHasInfo] = useState(false);
  const [hasDocs, setHasDocs] = useState(false);

  const theme = {
    background: isDark ? colors.black : colors.gray[50],
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    text: isDark ? colors.white : colors.gray[800],
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
    input: isDark ? colors.gray[800] : colors.gray[200],
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  async function load() {
    if (!id) return;

    const { data: access } = await supabase.rpc('get_my_employee_access');
    const mine = ((access as any[]) ?? []).find(r => r.employee_id === id);
    const info = !!mine?.info;
    const docAccess = !!mine && mine.docs_mode !== 'none';
    setHasInfo(info);
    setHasDocs(docAccess);
    if (!mine) { setEmp(null); setLoading(false); return; }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', id).single();
    setEmp(p);

    if (info) {
      const { data: cf } = await supabase
        .from('employee_custom_fields').select('field_name, field_value, field_order')
        .eq('employee_id', id).order('field_order');
      setCustom((cf as any) ?? []);
    }
    if (docAccess) {
      // RLS already limits this to the categories this admin was granted.
      const { data: d } = await supabase
        .from('documents').select('*').eq('employee_id', id).order('created_at', { ascending: false });
      setDocs(d ?? []);
    }
    setLoading(false);
  }

  if (loading) {
    return <View style={[s.center, { backgroundColor: theme.background }]}><ActivityIndicator color={colors.yellow} size="large" /></View>;
  }

  if (!emp) {
    return (
      <View style={[s.center, { backgroundColor: theme.background, padding: 24 }]}>
        <Lock color={theme.muted} size={32} />
        <Text style={{ color: theme.subtext, marginTop: 10, textAlign: 'center' }}>You don't have access to this employee.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}><Text style={{ color: colors.yellow, fontWeight: '700' }}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const Row = ({ label, value }: { label: string; value?: string | null }) => (
    <View style={[s.row, { borderBottomColor: theme.border }]}>
      <Text style={[s.rowLabel, { color: theme.subtext }]}>{label}</Text>
      <Text style={[s.rowValue, { color: value ? theme.text : theme.muted }]} selectable>{value || '—'}</Text>
    </View>
  );
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[s.cardTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );

  const homeAddress = [emp.address_unit, emp.address_complex, emp.address_street, emp.address_suburb, emp.address_city, emp.address_province, emp.address_postal_code]
    .map((v: any) => (v ?? '').toString().trim()).filter(Boolean).join(', ');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft color={theme.text} size={24} /></TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Employee</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ alignItems: 'center', paddingBottom: 12 }}>
        <Avatar fallback="icon" url={emp.avatar_url} name={emp.full_name} size={80} backgroundColor={theme.input} />
        <Text style={[s.name, { color: theme.text }]}>{emp.full_name}</Text>
        {emp.job_title ? <Text style={{ color: theme.subtext }}>{emp.job_title}</Text> : null}
        <View style={[s.readOnly, { backgroundColor: theme.input }]}>
          <Lock color={theme.subtext} size={12} />
          <Text style={{ color: theme.subtext, fontSize: 12, fontWeight: '700' }}>Read only</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {hasInfo && (
          <>
            <Card title="Employment">
              <Row label="Employee Number" value={emp.employee_number} />
              <Row label="Job Title" value={emp.job_title} />
              <Row label="Department" value={emp.department} />
              <Row label="Date Joined" value={fmtDate(emp.date_joined)} />
              <Row label="Date of Birth" value={fmtDate(emp.date_of_birth)} />
              <Row label="Phone" value={emp.phone} />
              <Row label="ID Number" value={emp.id_number} />
            </Card>

            <Card title="Home Address">
              <Row label="Address" value={homeAddress} />
            </Card>

            <Card title="Next of Kin">
              <Row label="Name" value={emp.next_of_kin_name} />
              <Row label="Relationship" value={emp.next_of_kin_relationship} />
              <Row label="Contact Number" value={emp.next_of_kin_phone} />
              <Row label="Address" value={emp.next_of_kin_address} />
            </Card>

            {(emp.next_of_kin_2_name || emp.next_of_kin_2_phone || emp.next_of_kin_2_address) ? (
              <Card title="Next of Kin 2">
                <Row label="Name" value={emp.next_of_kin_2_name} />
                <Row label="Relationship" value={emp.next_of_kin_2_relationship} />
                <Row label="Contact Number" value={emp.next_of_kin_2_phone} />
                <Row label="Address" value={emp.next_of_kin_2_address} />
              </Card>
            ) : null}

            <Card title="Medical Aid">
              <Row label="Medical Aid Name" value={emp.medical_aid_name} />
              <Row label="Plan" value={emp.medical_aid_plan} />
              <Row label="Policy Number" value={emp.medical_aid_policy_number} />
            </Card>

            {custom.some(c => (c.field_value ?? '').trim()) && (
              <Card title="Other Information">
                {custom.filter(c => (c.field_value ?? '').trim()).map(c => (
                  <Row key={c.field_name} label={c.field_name} value={c.field_value} />
                ))}
              </Card>
            )}
          </>
        )}

        {hasDocs && (
          <Card title="Documents">
            {docs.length === 0 ? (
              <Text style={{ color: theme.muted }}>No documents available.</Text>
            ) : docs.map(d => (
              <View key={d.id} style={[s.docRow, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{d.name}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>
                    {CATEGORY_LABELS[d.category] ?? d.category}
                    {d.document_date ? ` · ${fmtDate(d.document_date)}` : ''}
                    {d.expiry_date ? ` · expires ${fmtDate(d.expiry_date)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={s.docBtn} onPress={() => viewDocument(d.file_url)}>
                  <Text style={s.docBtnText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.docBtn} onPress={() => downloadDocument(d.file_url, d.name, d.file_type)}>
                  <Text style={s.docBtnText}>Download</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        )}

        {!hasInfo && !hasDocs && (
          <Text style={{ color: theme.subtext, textAlign: 'center', marginTop: 20 }}>You don't have access to this employee's information.</Text>
        )}
      </View>
    </ScrollView>
  );
}

export default function GrantedEmployee() {
  return (
    <RequirePermission permission="view_employees" name="Employees">
      <Inner />
    </RequirePermission>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingTop: 60 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  row: { paddingVertical: 10, borderBottomWidth: 1 },
  rowLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  rowValue: { fontSize: 15, marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 6 },
  docBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  docBtnText: { color: colors.yellow, fontWeight: '700', fontSize: 13 },
});
