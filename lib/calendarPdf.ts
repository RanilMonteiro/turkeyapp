// lib/calendarPdf.ts
//
// Builds a real, shareable PDF of the Operational Calendar for ONE technician:
//   - scope 'month' -> a single landscape page for the chosen month
//   - scope 'year'  -> a year overview page + one full landscape page per month
//
// Requires:  npx expo install expo-print expo-sharing expo-file-system

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
      <div class="day">${day}</div>
      <div class="mine">${esc(entry.mine_name)}</div>
      ${entry.contact_person ? `<div class="sub">${esc(entry.contact_person)}</div>` : ''}
      ${entry.contact_number ? `<div class="sub">${esc(entry.contact_number)}</div>` : ''}
      ${entry.comments ? `<div class="comment">${esc(entry.comments)}</div>` : ''}
      ${entry.testing_type ? `<div class="pill test">${esc(entry.testing_type)}</div>` : ''}
      ${entry.tam_status ? `<div class="pill tam">${esc(entry.tam_status)}</div>` : ''}
      ${doc ? `<div class="inv">${esc(doc)}</div>` : ''}
    </div>`;
}

function footerHtml(generated: string, pageLabel: string): string {
  return `<div class="footer"><span>Generated ${esc(generated)}</span><span>${esc(pageLabel)}</span></div>`;
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
    <div class="grid" style="grid-template-rows: repeat(${weeks.length}, 1fr);">${cells}</div>
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

  const { uri } = await Print.printToFileAsync({ html, width: PAGE_W, height: PAGE_H });

  const safeName = technicianName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Technician';
  const period = scope === 'year' ? `${year}` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const finalUri = await renameFile(uri, `Operational_Calendar_${safeName}_${period}.pdf`);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(finalUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Operational Calendar – ${technicianName}`,
  });
}