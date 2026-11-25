import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useColorScheme, ActivityIndicator,
  Modal, Image, TextInput, Linking, Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, XCircle, Clock, User, Paperclip, ShieldAlert, Download } from 'lucide-react-native';
import { supabase } from '../../../../lib/supabase';
import { formatRand } from '../../../../lib/money';
import { notify, confirm } from '../../../../lib/notify';
import SignatureModal from '../../../../components/SignatureModal';
import { uploadSignatureDataUrl } from '../../../../lib/signatureImage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
const turnkeyLogo = require('../../../../assets/images/Turnkeylogo.png');


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
  // Whose turn it is, from the database (an approver can't read other approvers' rows directly)
  const [currentStep, setCurrentStep] = useState<{ approval_order: number; approver_id: string; approver_name: string } | null | undefined>(undefined);

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

    const { data: stepData, error: stepError } = await supabase.rpc('get_current_approval_step', { p_submission_ids: [id] });
    if (stepError) setCurrentStep(undefined); // function not installed yet - fall back to the rows we can see
    else setCurrentStep(stepData && stepData.length > 0 ? stepData[0] : null);

    setLoading(false);
  }

  const isSuperuser = currentUserRole === 'superuser';

  const isFinal = submission?.status === 'approved' || submission?.status === 'declined' || submission?.status === 'cancelled';

  // Approvals run strictly in order: the ONLY step that can be actioned
  // is the lowest-numbered one still pending. Later steps wait their turn,
  // and once anyone declines, the whole request is finished.
  const activeApproval = isFinal
    ? null
    : currentStep === undefined
      ? approvals
          .filter(a => a.status === 'pending')
          .sort((a, b) => a.approval_order - b.approval_order)[0] ?? null
      : currentStep
        ? approvals.find(a => a.status === 'pending' && a.approval_order === currentStep.approval_order) ?? null
        : null;

  // Name of whoever's turn it is (for the "waiting" message)
  const waitingOnName =
    currentStep?.approver_name ?? activeApproval?.approver?.full_name ?? 'the approver before you';
  const waitingOnOrder = currentStep?.approval_order ?? activeApproval?.approval_order;

  // The active step, if it belongs to the current user.
  const myPendingApproval =
    activeApproval && activeApproval.approver_id === currentUserId ? activeApproval : undefined;

  // A superuser can override only the active step (not skip ahead).
  const pendingApprovals = activeApproval ? [activeApproval] : [];

  // The step actually being acted on right now.
  const targetApproval = overrideTargetId
    ? (activeApproval && activeApproval.id === overrideTargetId ? activeApproval : null)
    : myPendingApproval ?? null;

  const isOverride = !!overrideTargetId && overrideTargetId !== myPendingApproval?.id;

  const canAct = !!targetApproval && !isFinal;

  async function uploadSignature(dataUrl: string): Promise<string | null> {
    return uploadSignatureDataUrl(dataUrl, `approval_sig_${id}_${currentUserId}_${Date.now()}`);
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
      // Any decline (normal or superuser override) ends the whole request
      const { error } = await supabase
        .from('form_submissions')
        .update({ status: 'declined' })
        .eq('id', id);
      submissionUpdateError = error;
      // Close out the steps that never got their turn
      await supabase
        .from('form_approvals')
        .update({ status: 'cancelled' })
        .eq('submission_id', id)
        .eq('status', 'pending')
        .neq('id', targetApproval.id);
    } else {
      // More steps still waiting after this one? (a superuser override
      // that approves a step still hands the request to the next person)
      const nextApproval = approvals.find(
        a => a.id !== targetApproval.id &&
             a.status === 'pending' &&
             a.approval_order > targetApproval.approval_order
      );

      if (nextApproval) {
        const { error } = await supabase
          .from('form_submissions')
          .update({ status: 'in_review' })
          .eq('id', id);
        submissionUpdateError = error;
      } else {
        // Last step approved - all done
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
    case 'cancelled': return '#94a3b8';
    default: return '#f59e0b';
  }
}

function getStatusBg(status: string) {
  if (isDark) {
    switch (status) {
      case 'approved': return '#064e3b';
      case 'declined': return '#3b1a1a';
      case 'in_review': return '#1e3a5f';
      case 'cancelled': return '#334155';
      default: return '#78350f';
    }
  } else {
    switch (status) {
      case 'approved': return '#d1fae5';
      case 'declined': return '#fee2e2';
      case 'in_review': return '#dbeafe';
      case 'cancelled': return '#e2e8f0';
      default: return '#fef3c7';
    }
  }
}

const isHrOrSuperuser = currentUserRole === 'hr' || currentUserRole === 'superuser';

function cancelSubmission() {
  confirm(
    'Cancel Submission',
    `Cancel this ${submission?.template?.name ?? 'form'} request? This can be done at any stage.`,
    async () => {
      const { error } = await supabase
        .from('form_submissions')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) {
        notify('Error', error.message);
      } else {
        notify('Cancelled', 'The submission has been cancelled.', () => fetchData());
      }
    },
    'Cancel Submission'
  );
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
    if (field.field_type === 'amount') {
      return (
        <Text style={[styles.responseValue, { color: value ? theme.text : theme.muted, fontWeight: '700' }]}>
          {value ? formatRand(value) : 'Not answered'}
        </Text>
      );
    }

    if (field.field_type === 'attachment') {
      if (!value || !value.url) {
        return <Text style={[styles.responseValue, { color: theme.muted }]}>No attachment provided</Text>;
      }
      const isImage = /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(value.url);
      if (isImage) {
        // Receipts/slips are usually photos: show a preview, tap to open full size.
        return (
          <TouchableOpacity onPress={() => Linking.openURL(value.url)} activeOpacity={0.85}>
            <Image
              source={{ uri: value.url }}
              style={{ width: '100%', height: 220, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: '#ffffff' }}
              resizeMode="contain"
            />
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, textAlign: 'center' }}>Tap to open full size</Text>
          </TouchableOpacity>
        );
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

  function buildSubmissionHtml(logoUri?: string): string {
    if (!submission) return '<html><body>No data</body></html>';

    const statusColor = getStatusColor(submission.status);

    const responsesRows = fields.map(field => {
      const value = submission.form_data[field.id];
      let cell: string;

      if (field.field_type === 'signature' && value) {
        cell = `<img src="${escapeHtml(value)}" style="max-width:220px;max-height:90px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" />`;
      } else if (field.field_type === 'amount') {
        cell = value ? `<b>${escapeHtml(formatRand(value))}</b>` : '<span style="color:#94a3b8;">Not answered</span>';
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
            .submitted-by { margin-top: 14px; padding: 12px 18px; border: 2px solid #fbbf24; border-left: 10px solid #fbbf24; border-radius: 8px; background: #fffbeb; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 260px; }
            .sb-label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #92400e; }
            .sb-name { font-size: 26px; font-weight: 800; color: #0f172a; margin-top: 2px; line-height: 1.15; }
            .sb-title { font-size: 14px; font-weight: 600; color: #475569; margin-top: 2px; }
            .sb-date { font-size: 12px; color: #64748b; margin-top: 6px; }
            .header-row { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}.logo-section{display:flex;flex-direction:column;align-items:flex-end;}.logo{width:100px;height:auto;margin-bottom:12px;}
          </style>
        </head>
        <body>
          <div class="header-row">
            <div>
              <h1>${escapeHtml(submission.template?.name ?? 'Form Submission')}</h1>
              <div class="submitted-by">
                <div class="sb-label">Submitted by</div>
                <div class="sb-name">${escapeHtml(submission.employee?.full_name ?? 'Unknown')}</div>
                ${submission.employee?.job_title ? `<div class="sb-title">${escapeHtml(submission.employee.job_title)}</div>` : ''}
                <div class="sb-date">${formatDateTime(submission.submitted_at)}</div>
              </div>
            </div>
            <div class="logo-section">${logoUri?`<img src="${logoUri}" class="logo" />`:``}<div class="status-badge">${escapeHtml(submission.status.replace('_',' '))}</div></div>
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

  function printHtmlInIframe(html: string): Promise<void> {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText =
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(iframe);

      const win = iframe.contentWindow as Window;
      const doc = win.document;
      doc.open();
      doc.write(html);
      doc.close();

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        iframe.remove();
        resolve();
      };
      win.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 120000); // safety net

      // Wait for logo / signature images before printing.
      const pending = Array.from(doc.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((r) => { img.onload = img.onerror = () => r(null); }));
      Promise.all(pending).then(() => {
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch {
            cleanup();
          }
        }, 150);
      });
    });
  }

  async function handleDownloadPdf() {
    if (!submission) return;
    setDownloadingPdf(true);

    try {
      const asset=Asset.fromModule(turnkeyLogo);
      await asset.downloadAsync();
      const html=buildSubmissionHtml(asset.localUri ?? asset.uri);

      if (Platform.OS === 'web') {
        // Print from a hidden iframe on the same page. The old way opened
        // a new window (window.open) AFTER we'd already awaited the logo
        // download, and by then the browser no longer counted it as a
        // direct click, so it blocked it as a pop-up. An iframe is not a
        // pop-up, so nothing can be blocked, and it still prints only our
        // report (not the app screen).
        await printHtmlInIframe(html);
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

            {isHrOrSuperuser && (
  <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>HR / Superuser Controls</Text>
    <Text style={[styles.actionHint, { color: theme.subtext }]}>
      Edit this submission's answers or cancel it at any stage, regardless of approval status.
    </Text>
    <View style={styles.actionBtns}>
      <TouchableOpacity
        style={[styles.declineBtn, { backgroundColor: '#64748b' }]}
        onPress={cancelSubmission}
      >
        <XCircle color={colors.white} size={18} />
        <Text style={styles.declineBtnText}>Cancel Submission</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.approveBtn, { backgroundColor: colors.yellow }]}
        onPress={() => router.push(`/(app)/hr/edit-submission/${id}` as any)}
      >
        <Text style={styles.approveBtnText}>Edit Submission</Text>
      </TouchableOpacity>
    </View>
  </View>
)}

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
          {isSuperuser && !isFinal && pendingApprovals.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.overrideHeaderRow}>
                <ShieldAlert color="#f59e0b" size={18} />
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Superuser Override</Text>
              </View>
              <Text style={[styles.actionHint, { color: theme.subtext, marginBottom: 12 }]}>
                Act on behalf of the approver whose turn it is — useful if they are unavailable or this needs urgent sign-off. Approving still passes the request to the next approver; declining ends it.
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

          {/* Waiting message — this user has a step on the request, but an
              earlier approver hasn't actioned theirs yet. */}
          {!isFinal && !myPendingApproval && (activeApproval || currentStep) &&
            approvals.some(a => a.approver_id === currentUserId && a.status === 'pending') && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Waiting on previous approver</Text>
              <Text style={[styles.actionHint, { color: theme.subtext }]}>
                Waiting for {waitingOnName}{waitingOnOrder ? ` (Step ${waitingOnOrder})` : ''} to approve first. You'll be able to approve or decline once they have.
              </Text>
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
      <SignatureModal
        visible={showSignatureModal}
        onCancel={() => setShowSignatureModal(false)}
        theme={{ background: theme.background, text: theme.text, subtext: theme.subtext, border: theme.border }}
        onSigned={(sig) => {
          setSignature(sig);
          setShowSignatureModal(false);
        }}
      />
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