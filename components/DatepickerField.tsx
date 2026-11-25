import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, Modal, Pressable } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';

// One date picker for phone AND web (replaces the old native/web split), with
// fast jumping: year arrows, month arrows, tap the title to pick a month or
// year from a grid, and "+1 yr / +2 yr ..." chips for things like expiry dates.

type Props = {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  isDark?: boolean;
  theme: { input: string; border: string; text: string; muted: string };
  style?: ViewStyle;
  defaultYear?: number; // year to open on when empty (e.g. 1990 for a date of birth)
};

const YELLOW = '#fbbf24';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CHIPS: { label: string; months: number }[] = [
  { label: '+1 mo', months: 1 },
  { label: '+6 mo', months: 6 },
  { label: '+1 yr', months: 12 },
  { label: '+2 yr', months: 24 },
  { label: '+3 yr', months: 36 },
  { label: '+5 yr', months: 60 },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toStr = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function parse(v: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3] };
}
function today() {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
}
function addMonths(base: { y: number; m: number; d: number }, n: number) {
  const total = base.y * 12 + base.m + n;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { y, m, d: Math.min(base.d, daysIn(y, m)) };
}

export default function DatePickerField({ value, onChange, placeholder, isDark, theme, style, defaultYear }: Props) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [view, setView] = useState({ y: 2026, m: 0 });
  const [yearPageStart, setYearPageStart] = useState(2020);
  const [draft, setDraft] = useState<string>('');

  const panel = isDark ? '#1f2937' : '#ffffff';
  const soft = isDark ? '#374151' : '#f3f4f6';
  const text = theme.text;

  function open() {
    const p = parse(value) ?? (defaultYear ? { y: defaultYear, m: 0, d: 1 } : today());
    setDraft(value || '');
    setView({ y: p.y, m: p.m });
    setMode('days');
    setShow(true);
  }

  function commit(v: string) {
    onChange(v);
    setShow(false);
  }

  function shiftView(months: number) {
    const t = view.y * 12 + view.m + months;
    setView({ y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 });
  }

  function applyChip(months: number) {
    const base = parse(draft) ?? today();
    const n = addMonths(base, months);
    setDraft(toStr(n.y, n.m, n.d));
    setView({ y: n.y, m: n.m });
    setMode('days');
  }

  // Calendar cells for the viewed month (Monday first).
  const firstWeekday = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const sel = parse(draft);
  const t = today();

  const NavBtn = ({ onPress, children }: any) => (
    <TouchableOpacity onPress={onPress} style={[s.navBtn, { backgroundColor: soft }]} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
      {children}
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={[s.pickerBtn, { backgroundColor: theme.input, borderColor: theme.border }, style]}
        onPress={open}
      >
        <Calendar color={YELLOW} size={16} />
        <Text style={[s.pickerBtnText, { color: value ? theme.text : theme.muted }]}>
          {value || placeholder || 'Select date'}
        </Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <Pressable style={s.overlay} onPress={() => setShow(false)}>
          <Pressable style={[s.card, { backgroundColor: panel, borderColor: theme.border }]} onPress={() => {}}>
            {/* Header */}
            <View style={s.header}>
              {mode === 'days' ? (
                <>
                  <NavBtn onPress={() => shiftView(-12)}><ChevronsLeft color={YELLOW} size={18} /></NavBtn>
                  <NavBtn onPress={() => shiftView(-1)}><ChevronLeft color={YELLOW} size={18} /></NavBtn>
                  <TouchableOpacity style={s.title} onPress={() => setMode('months')}>
                    <Text style={[s.titleText, { color: text }]}>{MONTHS[view.m]}</Text>
                    <Text
                      style={[s.titleText, { color: YELLOW }]}
                      onPress={() => { setYearPageStart(view.y - 4); setMode('years'); }}
                    >
                      {' '}{view.y}
                    </Text>
                  </TouchableOpacity>
                  <NavBtn onPress={() => shiftView(1)}><ChevronRight color={YELLOW} size={18} /></NavBtn>
                  <NavBtn onPress={() => shiftView(12)}><ChevronsRight color={YELLOW} size={18} /></NavBtn>
                </>
              ) : mode === 'months' ? (
                <>
                  <NavBtn onPress={() => setView({ ...view, y: view.y - 1 })}><ChevronLeft color={YELLOW} size={18} /></NavBtn>
                  <TouchableOpacity style={s.title} onPress={() => { setYearPageStart(view.y - 4); setMode('years'); }}>
                    <Text style={[s.titleText, { color: YELLOW }]}>{view.y}</Text>
                  </TouchableOpacity>
                  <NavBtn onPress={() => setView({ ...view, y: view.y + 1 })}><ChevronRight color={YELLOW} size={18} /></NavBtn>
                </>
              ) : (
                <>
                  <NavBtn onPress={() => setYearPageStart(yearPageStart - 12)}><ChevronLeft color={YELLOW} size={18} /></NavBtn>
                  <View style={s.title}>
                    <Text style={[s.titleText, { color: text }]}>{yearPageStart} – {yearPageStart + 11}</Text>
                  </View>
                  <NavBtn onPress={() => setYearPageStart(yearPageStart + 12)}><ChevronRight color={YELLOW} size={18} /></NavBtn>
                </>
              )}
            </View>

            {/* Body */}
            {mode === 'days' && (
              <>
                <View style={s.row}>
                  {WEEKDAYS.map((w) => (
                    <Text key={w} style={[s.cell, s.weekday, { color: theme.muted }]}>{w}</Text>
                  ))}
                </View>
                <View style={s.grid}>
                  {cells.map((d, i) => {
                    if (d === null) return <View key={i} style={s.cell} />;
                    const isSel = !!sel && sel.y === view.y && sel.m === view.m && sel.d === d;
                    const isToday = t.y === view.y && t.m === view.m && t.d === d;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={s.cell}
                        onPress={() => commit(toStr(view.y, view.m, d))}
                      >
                        <View style={[s.dayInner, isSel && { backgroundColor: YELLOW }, !isSel && isToday && { borderWidth: 1, borderColor: YELLOW }]}>
                          <Text style={{ color: isSel ? '#111827' : text, fontWeight: isSel || isToday ? '800' : '500', fontSize: 14 }}>{d}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Fast forward */}
                <Text style={[s.chipLabel, { color: theme.muted }]}>
                  FAST FORWARD {sel ? `FROM ${toStr(sel.y, sel.m, sel.d)}` : 'FROM TODAY'}
                </Text>
                <View style={s.chips}>
                  {CHIPS.map((c) => (
                    <TouchableOpacity key={c.label} style={[s.chip, { backgroundColor: soft }]} onPress={() => applyChip(c.months)}>
                      <Text style={{ color: YELLOW, fontWeight: '700', fontSize: 13 }}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {mode === 'months' && (
              <View style={s.pickGrid}>
                {MONTHS.map((name, i) => {
                  const active = view.m === i;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[s.pickItem, { backgroundColor: active ? YELLOW : soft }]}
                      onPress={() => { setView({ ...view, m: i }); setMode('days'); }}
                    >
                      <Text style={{ color: active ? '#111827' : text, fontWeight: '700' }}>{name.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {mode === 'years' && (
              <View style={s.pickGrid}>
                {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((yr) => {
                  const active = view.y === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      style={[s.pickItem, { backgroundColor: active ? YELLOW : soft }]}
                      onPress={() => { setView({ ...view, y: yr }); setMode('months'); }}
                    >
                      <Text style={{ color: active ? '#111827' : text, fontWeight: '700' }}>{yr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Footer */}
            <View style={s.footer}>
              <TouchableOpacity onPress={() => commit('')}>
                <Text style={{ color: '#ef4444', fontWeight: '700' }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => commit(toStr(t.y, t.m, t.d))}>
                <Text style={{ color: theme.muted, fontWeight: '700' }}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.doneBtn, { opacity: draft ? 1 : 0.4 }]}
                disabled={!draft}
                onPress={() => commit(draft)}
              >
                <Text style={{ color: '#111827', fontWeight: '800' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  pickerBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10 },
  pickerBtnText: { flex: 1, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 360, borderRadius: 18, borderWidth: 1, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  titleText: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 11, fontWeight: '700', textAlign: 'center', height: 24 },
  dayInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 10, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingVertical: 6 },
  pickItem: { width: '30%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  doneBtn: { backgroundColor: YELLOW, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
