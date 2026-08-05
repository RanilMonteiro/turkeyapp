import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Modal, Image, TextInput, Linking, Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, XCircle, Clock, User, Paperclip, ShieldAlert, Download } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { notify, confirm } from '../../../../lib/notify';
import SignaturePad, { SignaturePadHandle } from '../../../../components/SignaturePad';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const colors = {
  yellow: '#fbbf24',
  white: '#ffffff',
  black: '#000000',
  gray: {
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
  field_order: number;
};

type Approval = {
  id: string;
  approver_id: string;
  approval_order: number;
  status: string;
  signature_url: string | null;
  comments: string | null;
  actioned_at: string | null;
  overridden_by: string | null;
  approver: { full_name: string } | null;
  overrider?: { full_name: string } | null;
};

type Submission = {
  id: string;
  status: string;
  submitted_at: string;
  form_data: any;
  employee_id: string;
  employee: { full_name: string; job_title: string | null } | null;
  template: { name: string; category: string | null; requires_approval: boolean } | null;
};

export default function SubmissionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const signatureRef = useRef<SignaturePadHandle>(null);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [actioning, setActioning] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Superuser override: which pending approval step (if any) they've
  // chosen to act on instead of their own assigned step, if any.
  const [overrideTargetId, setOverrideTargetId] = useState<string | null>(null);

  const theme = {
    background: isDark ? colors.black : '#f8fafc',
    card: isDark ? colors.gray[900] : colors.white,
    border: isDark ? colors.gray[700] : colors.gray[200],
    input: isDark ? colors.gray[800] : colors.gray[200],
    text: isDark ? colors.white : '#1e293b',
    subtext: isDark ? colors.gray[400] : colors.gray[500],
    muted: isDark ? colors.gray[500] : colors.gray[400],
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id ?? null);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user?.id)
      .single();
    setCurrentUserRole(profile?.role ?? null);

    const { data: sub } = await supabase
      .from('form_submissions')
      .select(`
        *,
        employee:employee_id(full_name, job_title),
        template:template_id(name, category, requires_approval)
      `)
      .eq('id', id)
      .single();

    if (sub) {
      setSubmission(sub);

      const { data: fieldData } = await supabase
        .from('form_fields')
        .select('*')
        .eq('template_id', sub.template_id)
        .order('field_order');

      if (fieldData) setFields(fieldData);
    }

    const { data: approvalData } = await supabase
      .from('form_approvals')
      .select('*, approver:approver_id(full_name), overrider:overridden_by(full_name)')
      .eq('submission_id', id)
      .order('approval_order');

    if (approvalData) setApprovals(approvalData as any);

    setLoading(false);
  }

  const isSuperuser = currentUserRole === 'superuser';

  // The step assigned to the current user, if any.
  const myPendingApproval = approvals.find(
    a => a.approver_id === currentUserId && a.status === 'pending'
  );

  // All steps still awaiting action — a superuser can pick any of
  // these to override, not just their own.
  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  // The step actually being acted on right now: either the current
  // user's own assigned step, or — for a superuser — whichever step
  // they've explicitly chosen to override.
  const targetApproval = overrideTargetId
    ? approvals.find(a => a.id === overrideTargetId) ?? null
    : myPendingApproval;

  const isOverride = !!overrideTargetId && overrideTargetId !== myPendingApproval?.id;

  const canAct =
    !!targetApproval &&
    submission?.status !== 'approved' &&
    submission?.status !== 'declined';

  async function uploadSignature(base64: string): Promise<string | null> {
    try {
      const base64Data = base64.replace('data:image/png;base64,', '');
      const arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `approval_sig_${id}_${currentUserId}_${Date.now()}.png`;

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

  function requestAction(type: 'approved' | 'declined') {
    if (isOverride && targetApproval) {
      confirm(
        'Override Approval',
        `This bypasses ${targetApproval.approver?.full_name ?? 'the assigned approver'}'s own approval step. Continue?`,
        () => performAction(type),
        type === 'approved' ? 'Approve' : 'Decline'
      );
    } else {
      performAction(type);
    }
  }

  async function performAction(type: 'approved' | 'declined') {
    if (!signature) {
      notify('Signature required', 'Please sign before approving or declining.');
      return;
    }
    if (!targetApproval) return;

    setActioning(true);

    const signatureUrl = await uploadSignature(signature);

    const updatePayload: Record<string, any> = {
      status: type,
      signature_url: signatureUrl,
      comments: comments || null,
      actioned_at: new Date().toISOString(),
    };
    if (isOverride) {
      updatePayload.overridden_by = currentUserId;
    }

    // Update this approval step
    const { error: approvalUpdateError } = await supabase
      .from('form_approvals')
      .update(updatePayload)
      .eq('id', targetApproval.id);

    if (approvalUpdateError) {
      setActioning(false);
      notify('Error', approvalUpdateError.message);
      return;
    }

    let submissionUpdateError = null;

    if (type === 'declined') {
      // Decline the whole submission
      const { error } = await supabase
        .from('form_submissions')
        .update({ status: 'declined' })
        .eq('id', id);
      submissionUpdateError = error;
    } else {
      // Check if there are more approvers after this step
      const nextApproval = approvals.find(
        a => a.approval_order === targetApproval.approval_order + 1
      );

      if (nextApproval) {
        // Move to next approver
        const { error } = await supabase
          .from('form_submissions')
          .update({ status: 'in_review' })
          .eq('id', id);
        submissionUpdateError = error;
      } else {
        // All approved
        const { error } = await supabase
          .from('form_submissions')
          .update({ status: 'approved' })
          .eq('id', id);
        submissionUpdateError = error;
      }
    }

    setActioning(false);
    setShowSignatureModal(false);
    setOverrideTargetId(null);
    setSignature(null);
    setComments('');

    if (submissionUpdateError) {
      notify('Error', submissionUpdateError.message);
      return;
    }

    notify(
      type === 'approved' ? 'Approved' : 'Declined',
      `You have ${type} this request${isOverride ? ' (override)' : ''}.`,
      () => fetchData()
    );
  }

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
    } else {
      switch (status) {
        case 'approved': return '#d1fae5';
        case 'declined': return '#fee2e2';
        case 'in_review': return '#dbeafe';
        default: return '#fef3c7';
      }
    }
  }

  // Renders a single field's answer. Pulled out of the JSX map so the
  // "attachment" branch (which needs its own tap handler) doesn't have
  // to fight with the ternary chain.
  function renderFieldValue(field: Field, value: any) {
    if (field.field_type === 'signature' && value) {
      return (
        <Image
          source={{ uri: value }}
          style={[styles.signatureImage, { borderColor: theme.border }]}
          resizeMode="contain"
        />
      );
    }

    // Attachment fields store { url, name } (see submit-form/[id].tsx),
    // not a plain string like every other field type — rendering that
    // object directly as <Text>{value}</Text> is what was crashing this
    // screen to a blank/black render. Handle it explicitly instead.
    if (field.field_type === 'attachment') {
      if (!value || !value.url) {
        return <Text style={[styles.responseValue, { color: theme.muted }]}>No attachment provided</Text>;
      }
      return (
        <TouchableOpacity
          style={styles.attachmentRow}
          onPress={() => Linking.openURL(value.url)}
        >
          <Paperclip color={colors.yellow} size={16} />
          <Text style={[styles.fileLink, { color: colors.yellow }]} numberOfLines={1}>
            {value.name ?? 'View attachment'}
          </Text>
        </TouchableOpacity>
      );
    }

    // Legacy/alternate "file" type, in case any older template still
    // uses it — kept as its own branch rather than folded into the
    // generic fallback below.
    if (field.field_type === 'file' && value) {
      return <Text style={[styles.fileLink, { color: colors.yellow }]}>📎 File attached</Text>;
    }

    // Generic fallback for text/textarea/date/dropdown/checkbox — value
    // here is always expected to be a primitive (string/boolean), never
    // an object, or this will throw the same way the attachment bug did.
    const displayValue =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value;

    return (
      <Text style={[styles.responseValue, { color: displayValue ? theme.text : theme.muted }]}>
        {displayValue ?? 'Not answered'}
      </Text>
    );
  }

  // ---------- PDF export ----------

  function escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function buildSubmissionHtml(): string {
    if (!submission) return '<html><body>No data</body></html>';

    const statusColor = getStatusColor(submission.status);

    const responsesRows = fields.map(field => {
      const value = submission.form_data[field.id];
      let cell: string;

      if (field.field_type === 'signature' && value) {
        cell = `<img src="${escapeHtml(value)}" style="max-width:220px;max-height:90px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" />`;
      } else if (field.field_type === 'attachment') {
        cell = value?.url
          ? `<a href="${escapeHtml(value.url)}">📎 ${escapeHtml(value.name ?? 'Attachment')}</a>`
          : '<span style="color:#94a3b8;">No attachment provided</span>';
      } else if (field.field_type === 'file' && value) {
        cell = '📎 File attached';
      } else {
        const display = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
        cell = display ? escapeHtml(String(display)) : '<span style="color:#94a3b8;">Not answered</span>';
      }

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#64748b;width:35%;vertical-align:top;">${escapeHtml(field.label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">${cell}</td>
        </tr>`;
    }).join('');

    const approvalBlocks = approvals.map(a => {
      const aColor = getStatusColor(a.status);
      const overrideNote = a.overrider
        ? `<div style="font-size:12px;color:#f59e0b;margin-top:4px;">⚠ Overridden by ${escapeHtml(a.overrider.full_name)}</div>`
        : '';
      const commentsHtml = a.comments
        ? `<div style="font-size:13px;color:#64748b;margin-top:6px;">💬 ${escapeHtml(a.comments)}</div>`
        : '';
      const sigHtml = a.signature_url
        ? `<img src="${escapeHtml(a.signature_url)}" style="max-width:200px;max-height:80px;margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" />`
        : '';
      const actionedHtml = a.actioned_at
        ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">${formatDateTime(a.actioned_at)}</div>`
        : '';

      return `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:700;">Step ${a.approval_order} — ${escapeHtml(a.approver?.full_name ?? 'Unknown')}</div>
            <div style="background:${aColor}20;color:${aColor};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;text-transform:capitalize;">${escapeHtml(a.status)}</div>
          </div>
          ${overrideNote}
          ${commentsHtml}
          ${sigHtml}
          ${actionedHtml}
        </div>`;
    }).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e293b; padding: 32px; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin: 28px 0 12px; border-bottom: 2px solid #fbbf24; padding-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; }
            .meta { color: #64748b; font-size: 13px; margin-bottom: 2px; }
            .status-badge {
              display: inline-block; padding: 6px 14px; border-radius: 20px;
              font-size: 13px; font-weight: 700; text-transform: capitalize;
              background: ${statusColor}20; color: ${statusColor};
            }
            .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          </style>
        </head>
        <body>
          <div class="header-row">
            <div>
              <h1>${escapeHtml(submission.template?.name ?? 'Form Submission')}</h1>
              <div class="meta">Submitted by: ${escapeHtml(submission.employee?.full_name ?? 'Unknown')}</div>
              ${submission.employee?.job_title ? `<div class="meta">${escapeHtml(submission.employee.job_title)}</div>` : ''}
              <div class="meta">${formatDateTime(submission.submitted_at)}</div>
            </div>
            <div class="status-badge">${escapeHtml(submission.status.replace('_', ' '))}</div>
          </div>

          <h2>Form Responses</h2>
          <table>${responsesRows}</table>

          ${approvals.length > 0 ? `<h2>Approval Chain</h2>${approvalBlocks}` : ''}

          <div style="margin-top:32px;font-size:11px;color:#94a3b8;">
            Generated ${formatDateTime(new Date().toISOString())} — TKI Callouts
          </div>
        </body>
      </html>`;
  }

  async function handleDownloadPdf() {
    if (!submission) return;
    setDownloadingPdf(true);

    try {
      const html = buildSubmissionHtml();

      if (Platform.OS === 'web') {
        // expo-print's printAsync on web doesn't reliably swap in
        // custom HTML — it can end up printing whatever's currently
        // on screen (the app itself) instead of our report, cropped
        // to the viewport. Opening a real separate window and writing
        // our HTML directly into it sidesteps that entirely: this is
        // printing an actual standalone document, not a snapshot of
        // the app.
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          notify('Pop-up blocked', 'Please allow pop-ups for this site, then try again.');
          setDownloadingPdf(false);
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Give the window a moment to finish laying out images
        // (signatures) before triggering print, otherwise some
        // browsers print before they've loaded.
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
        // Fallback in case onload doesn't fire (some browsers with
        // document.write-based windows skip it).
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 400);
      } else {
        // On native, generate an actual PDF file, then hand it off
        // via the share sheet so the user can save or send it.
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save submission PDF',
          });
        } else {
          notify('PDF ready', `Saved to: ${uri}`);
        }
      }
    } catch (e: any) {
      notify('Error', e.message ?? 'Could not generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (!submission) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.subtext }}>Submission not found</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft color={colors.yellow} size={24} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Request Details</Text>
          <TouchableOpacity onPress={handleDownloadPdf} disabled={downloadingPdf} style={styles.downloadBtn}>
            {downloadingPdf
              ? <ActivityIndicator color={colors.yellow} size="small" />
              : <Download color={colors.yellow} size={22} />
            }
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Status + Form Info */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.topRow}>
              <Text style={[styles.formName, { color: theme.text }]}>
                {submission.template?.name}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusBg(submission.status) }]}>
                <Text style={[styles.statusText, { color: getStatusColor(submission.status) }]}>
                  {submission.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
            <Text style={[styles.employeeName, { color: theme.subtext }]}>
              Submitted by: {submission.employee?.full_name}
            </Text>
            {submission.employee?.job_title && (
              <Text style={[styles.jobTitle, { color: theme.muted }]}>
                {submission.employee.job_title}
              </Text>
            )}
            <Text style={[styles.submittedAt, { color: theme.muted }]}>
              {new Date(submission.submitted_at).toLocaleDateString('en-ZA', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </Text>

            <TouchableOpacity
              style={[styles.downloadPdfBtn, { borderColor: colors.yellow }, downloadingPdf && { opacity: 0.6 }]}
              onPress={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              {downloadingPdf
                ? <ActivityIndicator color={colors.yellow} size="small" />
                : <Download color={colors.yellow} size={16} />
              }
              <Text style={{ color: colors.yellow, fontWeight: '700', fontSize: 14 }}>
                {downloadingPdf ? 'Preparing...' : 'Download as PDF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Data */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Form Responses</Text>
            {fields.map(field => {
              const value = submission.form_data[field.id];
              return (
                <View key={field.id} style={[styles.responseRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.responseLabel, { color: theme.subtext }]}>{field.label}</Text>
                  {renderFieldValue(field, value)}
                </View>
              );
            })}
          </View>

          {/* Approval Chain */}
          {approvals.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Approval Chain</Text>
              {approvals.map((approval, index) => (
                <View key={approval.id}>
                  <View style={styles.approvalRow}>
                    <View style={[styles.approvalNumber, { backgroundColor: `${colors.yellow}20` }]}>
                      <Text style={[styles.approvalNumberText, { color: colors.yellow }]}>
                        {approval.approval_order}
                      </Text>
                    </View>
                    <View style={styles.approvalInfo}>
                      <Text style={[styles.approvalName, { color: theme.text }]}>
                        {approval.approver?.full_name}
                      </Text>
                      <View style={[styles.approvalStatusBadge, { backgroundColor: getStatusBg(approval.status) }]}>
                        <Text style={[styles.approvalStatusText, { color: getStatusColor(approval.status) }]}>
                          {approval.status}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {approval.overrider && (
                    <View style={styles.overrideNotice}>
                      <ShieldAlert color="#f59e0b" size={13} />
                      <Text style={[styles.overrideNoticeText, { color: theme.subtext }]}>
                        Overridden by {approval.overrider.full_name}
                      </Text>
                    </View>
                  )}

                  {approval.comments && (
                    <Text style={[styles.approvalComments, { color: theme.subtext }]}>
                      💬 {approval.comments}
                    </Text>
                  )}

                  {approval.signature_url && (
                    <Image
                      source={{ uri: approval.signature_url }}
                      style={[styles.approvalSignature, { borderColor: theme.border }]}
                      resizeMode="contain"
                    />
                  )}

                  {approval.actioned_at && (
                    <Text style={[styles.actionedAt, { color: theme.muted }]}>
                      {new Date(approval.actioned_at).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </Text>
                  )}

                  {index < approvals.length - 1 && (
                    <View style={[styles.chainLine, { backgroundColor: theme.border }]} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Superuser Override picker — lets a superuser choose ANY
              pending step to act on, not just their own. */}
          {isSuperuser && submission.status !== 'approved' && submission.status !== 'declined' && pendingApprovals.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.overrideHeaderRow}>
                <ShieldAlert color="#f59e0b" size={18} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Superuser Override</Text>
              </View>
              <Text style={[styles.actionHint, { color: theme.subtext, marginBottom: 12 }]}>
                Act on behalf of any pending approver — useful if someone is unavailable or this needs urgent sign-off.
              </Text>
              {pendingApprovals.map(a => {
                const selected = targetApproval?.id === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.overrideOption,
                      { borderColor: selected ? colors.yellow : theme.border },
                      selected && { backgroundColor: `${colors.yellow}15` },
                    ]}
                    onPress={() => setOverrideTargetId(a.id === myPendingApproval?.id ? null : a.id)}
                  >
                    <Text style={[styles.overrideOptionText, { color: selected ? colors.yellow : theme.text }]}>
                      Step {a.approval_order} — {a.approver?.full_name}
                      {a.approver_id === currentUserId ? ' (you)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Action Buttons — shown for the current user's own assigned
              step, OR for a superuser who has selected an override target */}
          {canAct && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {isOverride ? `Acting for ${targetApproval?.approver?.full_name}` : 'Your Action'}
              </Text>
              <Text style={[styles.actionHint, { color: theme.subtext }]}>
                You need to sign before approving or declining.
              </Text>

              <TextInput
                style={[styles.commentsInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                placeholder="Add comments (optional)"
                placeholderTextColor={theme.muted}
                value={comments}
                onChangeText={setComments}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {signature ? (
                <View>
                  <View style={[styles.signedBox, { borderColor: '#10b981' }]}>
                    <Text style={styles.signedText}>✓ Signature captured</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.resignBtn, { borderColor: theme.border }]}
                    onPress={() => setSignature(null)}
                  >
                    <Text style={[styles.resignBtnText, { color: theme.subtext }]}>Clear & redo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.signBtn, { borderColor: colors.yellow }]}
                  onPress={() => setShowSignatureModal(true)}
                >
                  <Text style={[styles.signBtnText, { color: colors.yellow }]}>Tap to sign</Text>
                </TouchableOpacity>
              )}

              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={[styles.declineBtn, actioning && { opacity: 0.6 }]}
                  onPress={() => requestAction('declined')}
                  disabled={actioning}
                >
                  <XCircle color={colors.white} size={18} />
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, actioning && { opacity: 0.6 }]}
                  onPress={() => requestAction('approved')}
                  disabled={actioning}
                >
                  {actioning
                    ? <ActivityIndicator color={colors.black} />
                    : <>
                        <CheckCircle color={colors.black} size={18} />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Signature Modal */}
      <Modal
        visible={showSignatureModal}
        animationType="slide"
        transparent={false}
      >
        <View style={[styles.sigContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.sigHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowSignatureModal(false)}>
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
            onOK={(sig) => {
              setSignature(sig);
              setShowSignatureModal(false);
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  downloadBtn: { padding: 4 },
  downloadPdfBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginTop: 16,
  },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  formName: { fontSize: 18, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },
  employeeName: { fontSize: 14, marginBottom: 2 },
  jobTitle: { fontSize: 13, marginBottom: 4 },
  submittedAt: { fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  responseRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  responseLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
  responseValue: { fontSize: 15 },
  fileLink: { fontSize: 14, fontWeight: '600' },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signatureImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.white,
  },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  approvalNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalNumberText: { fontSize: 14, fontWeight: '700' },
  approvalInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  approvalName: { fontSize: 15, fontWeight: '600' },
  approvalStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  approvalStatusText: { fontSize: 11, fontWeight: '600' },
  approvalComments: { fontSize: 13, marginLeft: 44, marginTop: 4 },
  approvalSignature: {
    width: '80%',
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 44,
    marginTop: 8,
    backgroundColor: colors.white,
  },
  actionedAt: { fontSize: 11, marginLeft: 44, marginTop: 4 },
  chainLine: { width: 2, height: 16, marginLeft: 15, marginVertical: 4 },
  overrideNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginLeft: 44, marginTop: 4,
  },
  overrideNoticeText: { fontSize: 12, fontStyle: 'italic' },
  overrideHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  overrideOption: {
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  overrideOptionText: { fontSize: 14, fontWeight: '600' },
  actionHint: { fontSize: 13, marginBottom: 12 },
  commentsInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 16,
  },
  signBtn: {
    height: 80,
    borderWidth: 2,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  signBtnText: { fontSize: 16, fontWeight: '600' },
  signedBox: {
    height: 60,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  signedText: { fontSize: 15, fontWeight: '600', color: '#10b981' },
  resignBtn: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  resignBtnText: { fontSize: 14 },
  actionBtns: { flexDirection: 'row', gap: 12 },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 12,
    height: 52,
    gap: 8,
  },
  declineBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow,
    borderRadius: 12,
    height: 52,
    gap: 8,
  },
  approveBtnText: { color: colors.black, fontSize: 16, fontWeight: '700' },
  sigContainer: { flex: 1 },
  sigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
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