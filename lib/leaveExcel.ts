// Leave export to Excel: one row per employee, one column per day between
// "from" and "to", the leave type written in the cells they were off.
// Weekend columns and leave days are shaded grey, like the HR sheet.
//
// Web: builds a real .xlsx (ExcelJS loaded from a CDN on demand, same trick as
// lib/htmlToPdf.ts) and downloads it. Phone: writes an Excel-readable file and
// opens the share sheet.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const GREY_HEX = 'D9D9D9';
export const MAX_EXPORT_DAYS = 366;

export type ExportEmployee = { id: string; fullName: string; number: string | null };
export type ExportLeave = { employeeId: string; leaveType: string | null; fromDate: string; toDate: string };

const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) {
    out.push(toStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const isWeekend = (ds: string) => {
  const d = new Date(ds + 'T00:00:00').getDay();
  return d === 0 || d === 6;
};

// full_name is stored as one string, so: last word = last name, the rest = first names.
function splitName(full: string): { last: string; first: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { last: parts[0], first: '' };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') };
}

function buildMatrix(employees: ExportEmployee[], leaves: ExportLeave[], days: string[]) {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const byEmp = new Map<string, string[][]>(); // employeeId -> per-day list of types
  leaves.forEach(l => {
    if (!l.fromDate || !l.toDate) return;
    const grid = byEmp.get(l.employeeId) ?? days.map(() => [] as string[]);
    const start = l.fromDate < days[0] ? days[0] : l.fromDate;
    const end = l.toDate > days[days.length - 1] ? days[days.length - 1] : l.toDate;
    if (start <= end) {
      daysBetween(start, end).forEach(d => {
        const i = dayIndex.get(d);
        if (i === undefined) return;
        const type = l.leaveType || 'Leave';
        if (!grid[i].includes(type)) grid[i].push(type);
      });
    }
    byEmp.set(l.employeeId, grid);
  });

  const rows = employees
    .map(e => ({ e, ...splitName(e.fullName) }))
    .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
    .map(({ e, last, first }) => {
      const grid = byEmp.get(e.id);
      return {
        number: e.number ?? '',
        last,
        first,
        cells: days.map((_, i) => (grid ? grid[i].join(', ') : '')),
      };
    });
  return rows;
}

function loadExcelJs(): Promise<any> {
  const w = window as any;
  if (w.ExcelJS) return Promise.resolve(w.ExcelJS);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXCELJS_URL;
    s.async = true;
    s.onload = () => (w.ExcelJS ? resolve(w.ExcelJS) : reject(new Error('Excel library failed to load.')));
    s.onerror = () => reject(new Error('Could not load the Excel library. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function exportLeaveToExcel(opts: {
  employees: ExportEmployee[];
  leaves: ExportLeave[];
  from: string;
  to: string;
}): Promise<void> {
  const days = daysBetween(opts.from, opts.to);
  if (days.length === 0) throw new Error('"To" date must be on or after the "From" date.');
  if (days.length > MAX_EXPORT_DAYS) throw new Error(`Please choose a range of ${MAX_EXPORT_DAYS} days or less.`);

  const rows = buildMatrix(opts.employees, opts.leaves, days);
  const fileBase = `Leave_${opts.from}_to_${opts.to}`;

  if (Platform.OS === 'web') {
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leave', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });

    ws.columns = [
      { header: 'Number', key: 'n', width: 12 },
      { header: 'Last name', key: 'l', width: 20 },
      { header: 'First name', key: 'f', width: 24 },
      ...days.map((d, i) => ({ header: d, key: `d${i}`, width: 13 })),
    ];
    ws.getRow(1).font = { bold: true };

    const grey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GREY_HEX } };
    const border = { style: 'thin', color: { argb: 'FFE5E7EB' } };

    rows.forEach(r => {
      const row = ws.addRow([r.number, r.last, r.first, ...r.cells]);
      row.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        if (col >= 4) {
          const day = days[col - 4];
          if (r.cells[col - 4] || isWeekend(day)) cell.fill = grey;
        }
      });
    });
    // Weekend header cells + any empty body area get the same grey
    days.forEach((d, i) => {
      if (isWeekend(d)) ws.getCell(1, i + 4).fill = grey;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }

  // ---- Phone: SpreadsheetML (opens in Excel / Sheets) + share sheet ----
  const cell = (v: string, style?: string) =>
    `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
  const header =
    `<Row>${cell('Number', 'h')}${cell('Last name', 'h')}${cell('First name', 'h')}` +
    days.map(d => cell(d, isWeekend(d) ? 'hg' : 'h')).join('') +
    `</Row>`;
  const body = rows
    .map(r =>
      `<Row>${cell(r.number)}${cell(r.last)}${cell(r.first)}` +
      r.cells.map((c, i) => cell(c, c || isWeekend(days[i]) ? 'g' : undefined)).join('') +
      `</Row>`)
    .join('');
  const xml =
    `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles>` +
    `<Style ss:ID="h"><Font ss:Bold="1"/></Style>` +
    `<Style ss:ID="hg"><Font ss:Bold="1"/><Interior ss:Color="#${GREY_HEX}" ss:Pattern="Solid"/></Style>` +
    `<Style ss:ID="g"><Interior ss:Color="#${GREY_HEX}" ss:Pattern="Solid"/></Style></Styles>` +
    `<Worksheet ss:Name="Leave"><Table>${header}${body}</Table></Worksheet></Workbook>`;

  const path = `${FileSystem.cacheDirectory}${fileBase}.xls`;
  await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/vnd.ms-excel', dialogTitle: 'Leave export' });
  } else {
    throw new Error(`Saved to ${path}`);
  }
}
