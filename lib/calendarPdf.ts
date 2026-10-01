// lib/calendarPdf.ts
//
// Builds a real, shareable PDF of the Operational Calendar for ONE technician:
//   - scope 'month' -> a single landscape page for the chosen month
//   - scope 'year'  -> a year overview page + one full landscape page per month
//
// Requires:  npx expo install expo-print expo-sharing expo-file-system

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

export type PdfScope = 'month' | 'year';

type PdfEntry = {
  entry_date: string;
  mine_name: string;
  contact_person: string | null;
  contact_number: string | null;
  comments: string | null;
  testing_type: string | null;
  tam_status: string | null;
  financial_document_type: string | null;
  financial_document_number: string | null;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FINANCIAL_DOC_ABBR: Record<string, string> = {
  'Invoice Number': 'INV',
  'Order Number': 'PO',
  'Sales Order': 'SO',
};

// A4 landscape in points (1pt = 1/72in)
const PAGE_W = 842;
const PAGE_H = 595;

function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateString(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------

const CSS = `
  @page { size: ${PAGE_W}pt ${PAGE_H}pt; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: ${PAGE_W}pt;
    height: ${PAGE_H - 5}pt;
    padding: 20pt;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }

  .header {
    height: 44pt;
    flex: none;
    background: #1e293b;
    border-left: 6pt solid #fbbf24;
    border-radius: 6pt;
    padding: 0 14pt;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #ffffff;
  }
  .header .kicker { font-size: 7pt; letter-spacing: 1.4pt; text-transform: uppercase; color: #fbbf24; font-weight: 700; }
  .header .title { font-size: 17pt; font-weight: 800; margin-top: 1pt; }
  .header .right { text-align: right; }
  .header .tech { font-size: 11pt; font-weight: 700; }
  .header .count { font-size: 8pt; color: #cbd5e1; margin-top: 2pt; }

  .weekdays {
    flex: none;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-top: 8pt;
  }
  .weekdays div {
    background: #334155;
    color: #ffffff;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.6pt;
    text-transform: uppercase;
    text-align: center;
    padding: 4pt 0;
    border: 0.5pt solid #1e293b;
  }

  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .cell {
    border: 0.5pt solid #94a3b8;
    background: #ffffff;
    padding: 3pt 4pt;
    overflow: hidden;
    min-height: 0;
  }
  .cell.pad { background: #f1f5f9; }
  .cell.filled { background: #d9ead3; }
  .day { font-size: 10pt; font-weight: 800; color: #0f172a; }
  .mine { font-size: 8pt; font-weight: 800; line-height: 1.15; margin-top: 1pt; color: #0f172a; }
  .sub { font-size: 6.5pt; line-height: 1.2; color: #334155; margin-top: 1pt; }
  .comment {
    background: #fff176;
    border: 1pt solid #000000;
    border-radius: 3pt;
    padding: 2pt 3pt;
    margin-top: 3pt;
    font-size: 6.5pt;
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
  }
  .pill {
    border-radius: 6pt;
    padding: 2pt 4pt;
    margin-top: 2.5pt;
    font-size: 6.5pt;
    font-weight: 700;
    text-align: center;
  }
  .pill.test { background: #d1fae5; color: #059669; }
  .pill.tam  { background: #fef3c7; color: #b45309; }
  .inv { margin-top: 3pt; font-size: 7pt; font-weight: 800; color: #dc2626; text-align: center; }

  .footer {
    flex: none;
    height: 14pt;
    padding-top: 5pt;
    display: flex;
    justify-content: space-between;
    font-size: 6.5pt;
    color: #64748b;
  }

  /* Year overview */
  .overview {
    flex: 1;
    min-height: 0;
    margin-top: 10pt;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 9pt;
  }
  .mini { border: 0.5pt solid #cbd5e1; border-radius: 6pt; padding: 6pt 8pt; overflow: hidden; }
  .mini-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4pt; }
  .mini-name { font-size: 9.5pt; font-weight: 800; }
  .mini-count { font-size: 7pt; color: #64748b; font-weight: 600; }
  .mini table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .mini th { font-size: 6pt; color: #64748b; font-weight: 700; padding-bottom: 2pt; }
  .mini td { font-size: 6.5pt; text-align: center; padding: 2pt 0; color: #334155; }
  .mini td.on { background: #86c47a; color: #0f172a; font-weight: 800; border-radius: 2pt; }
  .legend { font-size: 7pt; color: #475569; margin-top: 6pt; }
  .legend span.sw { display: inline-block; width: 8pt; height: 8pt; background: #86c47a; border-radius: 2pt; vertical-align: -1pt; margin-right: 3pt; }

  /* Fit-to-cell: every size scales with --s, which is chosen per month in
     monthPageHtml so the busiest day just fits and quiet months stay roomy.
     The financial document line is pinned to the bottom of the cell. */
  .page { padding: 16pt 20pt; }
  .grid { --s: 1; }
  .cell { display: flex; flex-direction: column; padding: calc(3pt * var(--s)) calc(4pt * var(--s)); }
  .cell .body { flex: 1; min-height: 0; overflow: hidden; }
  .top { display: flex; align-items: flex-start; gap: calc(3pt * var(--s)); }
  .day { font-size: calc(8.5pt * var(--s)); line-height: 1.1; flex: none; min-width: calc(9pt * var(--s)); }
  .mine { font-size: calc(7.5pt * var(--s)); line-height: 1.1; margin-top: 0; flex: 1; }
  .sub { font-size: calc(6.2pt * var(--s)); line-height: 1.15; margin-top: calc(0.5pt * var(--s)); }
  .comment {
    margin-top: calc(2pt * var(--s)); padding: calc(1.5pt * var(--s)) calc(3pt * var(--s));
    font-size: calc(6.2pt * var(--s)); line-height: 1.15; border-radius: calc(3pt * var(--s));
  }
  .pill {
    margin-top: calc(2pt * var(--s)); padding: calc(2pt * var(--s)) calc(4pt * var(--s));
    font-size: calc(6.2pt * var(--s)); line-height: 1.15; border-radius: calc(6pt * var(--s));
  }
  .inv {
    flex: none; margin-top: 0; padding-top: calc(2pt * var(--s));
    font-size: calc(7.5pt * var(--s)); line-height: 1.15; font-weight: 800;
    color: #dc2626; text-align: center; word-break: break-word;
  }
`;

function cellHtml(dateStr: string, entry: PdfEntry | undefined): string {
  const day = parseInt(dateStr.split('-')[2], 10);
  if (!entry) return `<div class="cell"><div class="day">${day}</div></div>`;

  const docAbbr = FINANCIAL_DOC_ABBR[entry.financial_document_type ?? ''] ?? '';
  const doc = entry.financial_document_number
    ? `${docAbbr} ${entry.financial_document_number}`.trim()
    : '';

  return `
    <div class="cell filled">
      <div class="body">
      <div class="top"><div class="day">${day}</div><div class="mine">${esc(entry.mine_name)}</div></div>
      ${entry.contact_person ? `<div class="sub">${esc(entry.contact_person)}</div>` : ''}
      ${entry.contact_number ? `<div class="sub">${esc(entry.contact_number)}</div>` : ''}
      ${entry.comments ? `<div class="comment">${esc(entry.comments)}</div>` : ''}
      ${entry.testing_type ? `<div class="pill test">${esc(entry.testing_type)}</div>` : ''}
      ${entry.tam_status ? `<div class="pill tam">${esc(entry.tam_status)}</div>` : ''}
      </div>
      ${doc ? `<div class="inv">${esc(doc)}</div>` : ''}
    </div>`;
}

function footerHtml(generated: string, pageLabel: string): string {
  return `<div class="footer"><span>Generated ${esc(generated)}</span><span>${esc(pageLabel)}</span></div>`;
}

// Rough height (in pt, at scale 1) of one filled cell. Used to pick a text
// size per month so the busiest day still fits its row.
function estimateEntryHeight(e: PdfEntry): number {
  const lines = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / perLine));
  let h = 6; // cell padding
  h += 8.5 * lines(e.mine_name, 20);
  if (e.contact_person) h += 7.6 * lines(e.contact_person, 28);
  if (e.contact_number) h += 7.6 * lines(e.contact_number, 28);
  if (e.comments) h += 7 + 7.1 * lines(e.comments, 24);
  if (e.testing_type) h += 13.1;
  if (e.tam_status) h += 13.1;
  if (e.financial_document_number) h += 10.6 * lines(e.financial_document_number, 22);
  return h;
}

function monthScale(entries: PdfEntry[], weekCount: number): number {
  const rowH = 475 / weekCount; // approx. usable grid height / rows
  const tallest = entries.reduce((m, e) => Math.max(m, estimateEntryHeight(e)), 0);
  if (tallest === 0) return 1.4;
  const scale = (rowH * 0.95) / tallest;
  return Math.round(Math.min(1.5, Math.max(0.8, scale)) * 100) / 100;
}

function monthPageHtml(
  technicianName: string,
  year: number,
  month: number,
  byDate: Record<string, PdfEntry>,
  generated: string,
  pageLabel: string
): string {
  const weeks = buildMonthGrid(year, month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let scheduled = 0;
  for (let d = 1; d <= daysInMonth; d++) if (byDate[toDateString(year, month, d)]) scheduled++;

  const monthEntries: PdfEntry[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const e = byDate[toDateString(year, month, d)];
    if (e) monthEntries.push(e);
  }
  const scale = monthScale(monthEntries, weeks.length);

  const cells = weeks
    .map(week =>
      week
        .map(dateStr => (dateStr ? cellHtml(dateStr, byDate[dateStr]) : `<div class="cell pad"></div>`))
        .join('')
    )
    .join('');

  return `
  <div class="page">
    <div class="header">
      <div>
        <div class="kicker">Operational Calendar</div>
        <div class="title">${MONTH_NAMES[month]} ${year}</div>
      </div>
      <div class="right">
        <div class="tech">${esc(technicianName)}</div>
        <div class="count">${scheduled} scheduled day${scheduled === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="weekdays">${WEEKDAYS.map(w => `<div>${w}</div>`).join('')}</div>
    <div class="grid" style="grid-template-rows: repeat(${weeks.length}, 1fr); --s: ${scale};">${cells}</div>
    ${footerHtml(generated, pageLabel)}
  </div>`;
}

function miniMonthHtml(year: number, month: number, byDate: Record<string, PdfEntry>): string {
  const weeks = buildMonthGrid(year, month);
  let scheduled = 0;
  const rows = weeks
    .map(
      week =>
        `<tr>${week
          .map(dateStr => {
            if (!dateStr) return '<td></td>';
            const day = parseInt(dateStr.split('-')[2], 10);
            const on = !!byDate[dateStr];
            if (on) scheduled++;
            return `<td class="${on ? 'on' : ''}">${day}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  return `
    <div class="mini">
      <div class="mini-head">
        <span class="mini-name">${MONTH_NAMES[month]}</span>
        <span class="mini-count">${scheduled} day${scheduled === 1 ? '' : 's'}</span>
      </div>
      <table>
        <thead><tr>${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(l => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function yearOverviewHtml(
  technicianName: string,
  year: number,
  byDate: Record<string, PdfEntry>,
  total: number,
  generated: string,
  pageLabel: string
): string {
  const minis = Array.from({ length: 12 }, (_, m) => miniMonthHtml(year, m, byDate)).join('');
  return `
  <div class="page">
    <div class="header">
      <div>
        <div class="kicker">Operational Calendar</div>
        <div class="title">${year} Overview</div>
      </div>
      <div class="right">
        <div class="tech">${esc(technicianName)}</div>
        <div class="count">${total} scheduled day${total === 1 ? '' : 's'} this year</div>
      </div>
    </div>
    <div class="overview">${minis}</div>
    <div class="legend"><span class="sw"></span>Scheduled day &nbsp;·&nbsp; Full month pages follow</div>
    ${footerHtml(generated, pageLabel)}
  </div>`;
}

// ---------------------------------------------------------------------------
// Data + file handling
// ---------------------------------------------------------------------------

async function fetchEntriesForRange(technicianId: string, from: string, to: string): Promise<PdfEntry[]> {
  const { data, error } = await supabase
    .from('operational_calendar_entries')
    .select(
      'entry_date, mine_name, contact_person, contact_number, comments, testing_type, tam_status, financial_document_type, financial_document_number'
    )
    .eq('technician_id', technicianId)
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as PdfEntry[];
}

// Gives the PDF a readable file name so it doesn't save as "Print-8f3a....pdf".
async function renameFile(uri: string, fileName: string): Promise<string> {
  try {
    let FS: any;
    try {
      FS = require('expo-file-system/legacy');
    } catch {
      FS = require('expo-file-system');
    }
    const dest = uri.substring(0, uri.lastIndexOf('/') + 1) + fileName;
    await FS.moveAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

// Web only: expo-print can't produce files in a browser (it just opens the
// print dialog), so render each .page of the HTML in a hidden iframe, snapshot
// it, and assemble a real PDF that downloads straight away.
// jsPDF + html2canvas are loaded from a CDN at the moment of export instead of
// being bundled, because Metro can't bundle jsPDF's Node build. No npm install
// needed for them.
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

function loadScript(src: string, globalName: string): Promise<any> {
  const w = window as any;
  if (w[globalName]) return Promise.resolve(w[globalName]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () =>
      w[globalName] ? resolve(w[globalName]) : reject(new Error('PDF library failed to initialise.'));
    s.onerror = () =>
      reject(new Error('Could not load the PDF library. Check your internet connection and try again.'));
    document.head.appendChild(s);
  });
}

async function savePdfOnWeb(html: string, fileName: string): Promise<void> {
  const html2canvas = await loadScript(HTML2CANVAS_URL, 'html2canvas');
  const jsPDF = (await loadScript(JSPDF_URL, 'jspdf')).jsPDF;

  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('Could not prepare the PDF.'));
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Could not prepare the PDF.');
    try {
      await (doc as any).fonts?.ready;
    } catch {
      // fonts API not available — fine
    }

    const pageEls = Array.from(doc.querySelectorAll('.page')) as HTMLElement[];
    if (pageEls.length === 0) throw new Error('Nothing to export.');

    const pdfH = PAGE_H - 5; // matches .page height in the CSS
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [PAGE_W, pdfH] });

    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      if (i > 0) pdf.addPage([PAGE_W, pdfH], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PAGE_W, pdfH);
    }

    pdf.save(fileName);
  } finally {
    document.body.removeChild(iframe);
  }
}

export async function exportCalendarPdf(opts: {
  technicianId: string;
  technicianName: string;
  scope: PdfScope;
  year: number;
  month: number; // 0-11, only used when scope === 'month'
}): Promise<void> {
  const { technicianId, technicianName, scope, year, month } = opts;

  const from = scope === 'year' ? `${year}-01-01` : toDateString(year, month, 1);
  const to =
    scope === 'year'
      ? `${year}-12-31`
      : toDateString(year, month, new Date(year, month + 1, 0).getDate());

  const entries = await fetchEntriesForRange(technicianId, from, to);
  const byDate: Record<string, PdfEntry> = {};
  entries.forEach(e => { byDate[e.entry_date] = e; });

  const generated = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  let pages: string;
  if (scope === 'month') {
    pages = monthPageHtml(technicianName, year, month, byDate, generated, 'Page 1 of 1');
  } else {
    const totalPages = 13;
    const parts = [
      yearOverviewHtml(technicianName, year, byDate, entries.length, generated, `Page 1 of ${totalPages}`),
    ];
    for (let m = 0; m < 12; m++) {
      parts.push(monthPageHtml(technicianName, year, m, byDate, generated, `Page ${m + 2} of ${totalPages}`));
    }
    pages = parts.join('');
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${CSS}</style></head><body>${pages}</body></html>`;

  const safeName = technicianName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Technician';
  const period = scope === 'year' ? `${year}` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const fileName = `Operational_Calendar_${safeName}_${period}.pdf`;

  // Browser: build the PDF ourselves and download it directly.
  if (Platform.OS === 'web') {
    await savePdfOnWeb(html, fileName);
    return;
  }

  // iOS / Android: real PDF file + share sheet.
  const result = await Print.printToFileAsync({ html, width: PAGE_W, height: PAGE_H });
  if (!result?.uri) throw new Error('Could not create the PDF file.');
  const finalUri = await renameFile(result.uri, fileName);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(finalUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Operational Calendar – ${technicianName}`,
  });
}