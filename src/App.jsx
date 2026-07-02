import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock, Users, LogIn, LogOut, Home, Calendar, BarChart3,
  Plus, Trash2, Edit2, X, Check, AlertCircle, Coffee,
  ChevronLeft, ChevronRight, Building2, UserCircle, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from "recharts";

/* ---------------------------------------------------------
   RankViz Attendance
   Colors: navy #1B1E36, panel #232743, orange #E8734A,
   lavender bg #EEF0F9, ink #232743, muted #6B7089
--------------------------------------------------------- */

const COLORS = {
  navy: "#12305C",
  navy2: "#1B3D6E",
  orange: "#2F6FED",
  orangeDark: "#1E54C4",
  bg: "#F4F7FD",
  card: "#FFFFFF",
  ink: "#0F1B33",
  muted: "#5E6B85",
  line: "#DDE6F5",
  green: "#2F9E6E",
  amber: "#D99A2B",
  red: "#D9534F",
  blue: "#0EA5E9",
};

const DEPARTMENTS = ["Human Resources", "Engineering", "Design", "Sales", "Marketing", "Operations", "Finance"];

const FONT_DISPLAY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_MONO = "'SFMono-Regular', 'Roboto Mono', Consolas, 'Courier New', monospace";

/* ---------------- Supabase config ----------------
   Fill these in after running supabase_schema.sql in your Supabase project
   (Project Settings → API → Project URL / anon public key)
--------------------------------------------------- */
const SUPABASE_URL = "https://psrumjuuqlsavoydeazp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QEHNXxKJ8tIZiqPLJw5ZVA_hvaRhuw6";
const SUPABASE_CONFIGURED = !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-ANON");

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtHrs(h) {
  if (h == null) return "—";
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesOfDay(d) {
  const dt = new Date(d);
  return dt.getHours() * 60 + dt.getMinutes();
}
function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const GRACE_MIN = 15;
const HALFDAY_HOURS = 4.5;
const MOBILE_BREAKPOINT = 720;

/* Real responsive detection — the previous build used Tailwind-style
   classNames ("hidden md:flex") with no Tailwind installed in the
   project, so they silently did nothing. This hook drives layout from
   actual JS state instead, no CSS framework required. */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function computeStatus(emp, rec, isPastDay, nowMinutes) {
  // rec: {checkIn, checkOut, type} type: office|wfh|leave
  if (!rec || rec.type === "leave") return { label: "Leave", tone: "leave" };
  if (!rec.checkIn) {
    if (!isPastDay) {
      const shiftStartMin = timeToMinutes(emp.shiftStart);
      if (nowMinutes < shiftStartMin) return { label: "Not started", tone: "pending" };
      return { label: "Not checked in", tone: "pending" };
    }
    return { label: "Absent", tone: "absent" };
  }
  const inMin = minutesOfDay(rec.checkIn);
  const shiftStartMin = timeToMinutes(emp.shiftStart);
  const isLate = inMin > shiftStartMin + GRACE_MIN;
  let hours = null;
  if (rec.checkOut) {
    hours = (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;
  }
  const wfhTag = rec.type === "wfh" ? " · WFH" : "";
  if (hours != null && hours < HALFDAY_HOURS) {
    return { label: `Half Day${isLate ? " · Late" : ""}${wfhTag}`, tone: "half" };
  }
  if (isLate) return { label: `Late${wfhTag}`, tone: "late" };
  if (rec.type === "wfh") return { label: "WFH", tone: "wfh" };
  if (!rec.checkOut) return { label: "Present", tone: "present" };
  return { label: "Present", tone: "present" };
}

const TONE_STYLES = {
  present: { bg: "#E7F6EF", fg: COLORS.green, dot: COLORS.green },
  wfh: { bg: "#E9EEFC", fg: COLORS.blue, dot: COLORS.blue },
  late: { bg: "#FBF0DC", fg: COLORS.amber, dot: COLORS.amber },
  half: { bg: "#FBF0DC", fg: COLORS.amber, dot: COLORS.amber },
  absent: { bg: "#FBE8E7", fg: COLORS.red, dot: COLORS.red },
  leave: { bg: "#E9EEFC", fg: "#3E5A9E", dot: "#3E5A9E" },
  pending: { bg: "#EEF0F9", fg: COLORS.muted, dot: "#B7BBD6" },
};

function StatusPill({ label, tone }) {
  const s = TONE_STYLES[tone] || TONE_STYLES.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: s.bg, color: s.fg, fontWeight: 600, fontSize: 12.5,
      padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot }} />
      {label}
    </span>
  );
}

/* ---------------- Supabase REST helpers ---------------- */
async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

function empToRow(e) {
  return {
    id: e.id, name: e.name, department: e.department,
    employment_type: e.employmentType, shift_start: e.shiftStart, shift_end: e.shiftEnd,
    zk_user_id: e.zkUserId || null,
  };
}
function rowToEmp(r) {
  return {
    id: r.id, name: r.name, department: r.department,
    employmentType: r.employment_type, shiftStart: r.shift_start, shiftEnd: r.shift_end,
    zkUserId: r.zk_user_id || "",
  };
}

async function loadEmployees() {
  const rows = await supaFetch("employees?select=*&order=name.asc");
  return (rows || []).map(rowToEmp);
}
async function saveEmployees(next, prev) {
  const nextIds = new Set(next.map(e => e.id));
  const removed = prev.filter(e => !nextIds.has(e.id));
  for (const r of removed) {
    await supaFetch(`employees?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" });
  }
  if (next.length) {
    await supaFetch("employees?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(next.map(empToRow)),
    });
  }
}
async function loadAttendance() {
  const rows = await supaFetch("attendance?select=*");
  const map = {};
  (rows || []).forEach(r => {
    map[`${r.employee_id}|${r.date}`] = { checkIn: r.check_in, checkOut: r.check_out, type: r.type };
  });
  return map;
}
async function saveAttendanceRecord(employeeId, date, rec, source) {
  await supaFetch("attendance?on_conflict=employee_id,date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      employee_id: employeeId, date,
      check_in: rec.checkIn || null, check_out: rec.checkOut || null,
      type: rec.type || "office", source: source || "web",
    }]),
  });
}

const SEED_EMPLOYEES = [
  { id: uid("emp"), name: "Ananya Rao", department: "Human Resources", employmentType: "Full-time", shiftStart: "09:30", shiftEnd: "18:30" },
  { id: uid("emp"), name: "Vikram Shah", department: "Engineering", employmentType: "Full-time", shiftStart: "10:00", shiftEnd: "19:00" },
  { id: uid("emp"), name: "Priya Menon", department: "Design", employmentType: "Full-time", shiftStart: "09:30", shiftEnd: "18:30" },
  { id: uid("emp"), name: "Rahul Nair", department: "Sales", employmentType: "Full-time", shiftStart: "09:00", shiftEnd: "18:00" },
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // key: empId|date -> record
  const [tab, setTab] = useState("today");
  const [now, setNow] = useState(new Date());
  const [role, setRole] = useState("admin"); // admin | employee
  const [meId, setMeId] = useState(null);
  const [saveState, setSaveState] = useState("idle");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) { setLoading(false); return; }
    (async () => {
      try {
        let emps = await loadEmployees();
        let att = await loadAttendance();
        if (emps.length === 0) {
          emps = SEED_EMPLOYEES;
          await saveEmployees(emps, []);
        }
        setEmployees(emps);
        setAttendance(att);
        setMeId(emps[0]?.id || null);
      } catch (e) {
        setLoadError(e.message);
      }
      setLoading(false);
    })();
  }, []);

  const persistEmployees = useCallback(async (next) => {
    const prev = employees;
    setEmployees(next);
    setSaveState("saving");
    try { await saveEmployees(next, prev); setSaveState("saved"); }
    catch { setSaveState("error"); }
  }, [employees]);

  const recKey = (empId, date) => `${empId}|${date}`;

  const punch = useCallback((empId, action, type) => {
    const date = todayStr();
    const key = recKey(empId, date);
    const existing = attendance[key] || { type: "office" };
    let rec;
    if (action === "in") rec = { ...existing, checkIn: new Date().toISOString(), type: type || existing.type || "office" };
    else if (action === "out") rec = { ...existing, checkOut: new Date().toISOString() };
    else if (action === "leave") rec = { ...existing, type: "leave", checkIn: null, checkOut: null };
    else if (action === "wfh") rec = { ...existing, type: "wfh" };
    else return;

    setAttendance(prev => ({ ...prev, [key]: rec }));
    setSaveState("saving");
    saveAttendanceRecord(empId, date, rec, "web")
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [attendance]);

  if (!SUPABASE_CONFIGURED) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 460, boxShadow: "0 1px 3px rgba(27,30,54,0.08)" }}>
          <h2 style={{ marginTop: 0 }}>Connect your database</h2>
          <p style={{ color: COLORS.muted, fontSize: 14.5, lineHeight: 1.6 }}>
            This app now runs on Supabase so your fingerprint machine and WFH web/app punches share the same data.
            Run <code>supabase_schema.sql</code> in your Supabase project, then paste your Project URL and anon key
            into the <code>SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code> constants near the top of this file.
          </p>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 460 }}>
          <h2 style={{ marginTop: 0, color: COLORS.red }}>Couldn't reach Supabase</h2>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg }}>
        <style>{"@keyframes rv-spin { to { transform: rotate(360deg); } }"}</style>
        <Loader2 style={{ animation: "rv-spin 0.9s linear infinite" }} color={COLORS.orange} size={32} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: COLORS.bg, minHeight: "100vh", color: COLORS.ink }}>
      <Shell
        tab={tab} setTab={setTab} now={now} role={role} setRole={setRole}
        meId={meId} setMeId={setMeId} employees={employees} saveState={saveState}
      >
        {tab === "today" && (
          <TodayView employees={employees} attendance={attendance} now={now} punch={punch} role={role} />
        )}
        {tab === "log" && (
          <LogView employees={employees} attendance={attendance} now={now} />
        )}
        {tab === "employees" && role === "admin" && (
          <EmployeesView employees={employees} setEmployees={persistEmployees} />
        )}
        {tab === "reports" && (
          <ReportsView employees={employees} attendance={attendance} now={now} />
        )}
        {tab === "mycheckin" && (
          <MyCheckInView employees={employees} attendance={attendance} punch={punch} meId={meId} setMeId={setMeId} now={now} />
        )}
      </Shell>
    </div>
  );
}

/* ---------------- Shell / Nav ---------------- */
function Shell({ children, tab, setTab, now, role, setRole, meId, setMeId, employees, saveState }) {
  const isMobile = useIsMobile();
  const items = [
    { id: "today", label: "Today", icon: Building2 },
    { id: "log", label: "Log", fullLabel: "Attendance Log", icon: Calendar },
    ...(role === "admin" ? [{ id: "employees", label: "Team", fullLabel: "Employees", icon: Users }] : []),
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "mycheckin", label: "Me", fullLabel: "My Check-In", icon: UserCircle },
  ];

  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Mobile top bar: logo + role switch + live clock */}
        <div style={{
          position: "sticky", top: 0, zIndex: 40, background: COLORS.navy, color: "#fff",
          padding: "10px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <LogoMark />
            <div style={{
              background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "5px 10px",
              fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
            }}>
              {now.toLocaleTimeString([], { hour12: false })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.06)", borderRadius: 9, padding: 3 }}>
            {["admin", "employee"].map(r => (
              <button key={r} onClick={() => setRole(r)} style={{
                flex: 1, padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
                background: role === r ? COLORS.orange : "transparent",
                color: role === r ? "#fff" : "#B9BEDD", fontWeight: 700, fontSize: 12, textTransform: "capitalize",
              }}>{r === "admin" ? "HR Admin" : "Employee"}</button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, padding: "16px 14px", paddingBottom: 88 }}>
          {saveState !== "idle" && (
            <div style={{ textAlign: "right", fontSize: 11.5, color: COLORS.muted, fontWeight: 600, marginBottom: 8 }}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
            </div>
          )}
          {children}
        </main>

        {/* Bottom tab bar */}
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
          background: "#fff", borderTop: `1px solid ${COLORS.line}`,
          display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -2px 8px rgba(27,36,32,0.06)",
        }}>
          {items.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "9px 2px 8px", border: "none", background: "transparent", cursor: "pointer",
              }}>
                <Icon size={19} color={active ? COLORS.orange : COLORS.muted} />
                <span style={{
                  fontSize: 10.5, fontWeight: active ? 700 : 600,
                  color: active ? COLORS.orange : COLORS.muted,
                }}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{
        width: 240, background: COLORS.navy, color: "#fff", display: "flex", flexDirection: "column",
        padding: "22px 16px", flexShrink: 0, position: "sticky", top: 0, height: "100vh",
      }}>
        <SidebarInner items={items} tab={tab} setTab={setTab} role={role} setRole={setRole} />
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "24px 32px 60px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <TopBar now={now} saveState={saveState} />
          {children}
        </div>
      </main>
    </div>
  );
}

function LogoMark() {
  return (
    <img src="data:image/png;base64,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" alt="RankViz" style={{ width: 40, height: 40, objectFit: "contain" }} />
  );
}

function SidebarInner({ items, tab, setTab, role, setRole }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", padding: "0 8px 22px" }}>
        <LogoMark />
      </div>

      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4, marginBottom: 18 }}>
        {["admin", "employee"].map(r => (
          <button key={r} onClick={() => setRole(r)} style={{
            flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer",
            background: role === r ? COLORS.orange : "transparent",
            color: role === r ? "#fff" : "#B9BEDD", fontWeight: 700, fontSize: 12.5, textTransform: "capitalize",
          }}>{r === "admin" ? "HR Admin" : "Employee"}</button>
        ))}
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ id, label, fullLabel, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9,
            border: "none", cursor: "pointer", textAlign: "left",
            background: tab === id ? "rgba(47,102,89,0.18)" : "transparent",
            color: tab === id ? "#fff" : "#B9BEDD", fontWeight: 600, fontSize: 14.5,
          }}>
            <Icon size={17} color={tab === id ? COLORS.brass : "#8F94BB"} />
            {fullLabel || label}
          </button>
        ))}
      </nav>
    </>
  );
}

function TopBar({ now, saveState }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600 }}>
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
      </span>
      <div style={{
        background: COLORS.navy, color: "#fff", borderRadius: 10, padding: "8px 16px",
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, letterSpacing: 1,
      }}>
        {now.toLocaleTimeString([], { hour12: false })}
      </div>
    </div>
  );
}

/* ---------------- Today View ---------------- */
function TodayView({ employees, attendance, now, punch, role }) {
  const isMobile = useIsMobile();
  const date = todayStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const rows = employees.map(emp => {
    const rec = attendance[`${emp.id}|${date}`];
    const status = computeStatus(emp, rec, false, nowMinutes);
    return { emp, rec, status };
  });

  const counts = rows.reduce((acc, r) => {
    if (r.status.tone === "present" || r.status.tone === "late" || r.status.tone === "half") acc.present++;
    else if (r.status.tone === "wfh") acc.wfh++;
    else if (r.status.tone === "pending") acc.pending++;
    else if (r.status.tone === "absent") acc.absent++;
    return acc;
  }, { present: 0, wfh: 0, pending: 0, absent: 0 });

  return (
    <div>
      <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px" }}>Today</h1>
      <p style={{ color: COLORS.muted, margin: "0 0 22px", fontSize: 14.5 }}>
        Live view of who's in, who's remote, who hasn't punched in yet — {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 26 }}>
        <StatCard label="Present" value={counts.present} tone="present" />
        <StatCard label="Working from home" value={counts.wfh} tone="wfh" />
        <StatCard label="Not checked in" value={counts.pending} tone="pending" />
        <StatCard label="Absent" value={counts.absent} tone="absent" />
      </div>

      <div style={{ background: COLORS.card, borderRadius: 14, padding: isMobile ? "16px 14px 6px" : "20px 20px 8px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16.5, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Employee status</h3>

        {rows.length === 0 && (
          <p style={{ color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet. Add some in the Employees tab.</p>
        )}

        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 10 }}>
            {rows.map(({ emp, rec, status }) => (
              <div key={emp.id} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{emp.name}</div>
                    <div style={{ color: COLORS.muted, fontSize: 12.5 }}>{emp.department}</div>
                  </div>
                  <StatusPill {...status} />
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: COLORS.muted, marginBottom: role === "admin" ? 10 : 0 }}>
                  <span>In: <strong style={{ color: COLORS.ink, fontFamily: FONT_MONO }}>{fmtTime(rec?.checkIn)}</strong></span>
                  <span>Out: <strong style={{ color: COLORS.ink, fontFamily: FONT_MONO }}>{fmtTime(rec?.checkOut)}</strong></span>
                </div>
                {role === "admin" && <QuickActions emp={emp} rec={rec} punch={punch} />}
              </div>
            ))}
          </div>
        ) : rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
                  <th style={th}>Name</th>
                  <th style={th}>Department</th>
                  <th style={th}>Status</th>
                  <th style={th}>First punch</th>
                  <th style={th}>Last punch</th>
                  {role === "admin" && <th style={th}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, rec, status }) => (
                  <tr key={emp.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                    <td style={td}><strong>{emp.name}</strong></td>
                    <td style={{ ...td, color: COLORS.muted }}>{emp.department}</td>
                    <td style={td}><StatusPill {...status} /></td>
                    <td style={{ ...td, color: COLORS.muted }}>{fmtTime(rec?.checkIn)}</td>
                    <td style={{ ...td, color: COLORS.muted }}>{fmtTime(rec?.checkOut)}</td>
                    {role === "admin" && (
                      <td style={td}>
                        <QuickActions emp={emp} rec={rec} punch={punch} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickActions({ emp, rec, punch }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {!rec?.checkIn && (
        <IconBtn title="Check in" onClick={() => punch(emp.id, "in")}><LogIn size={14} /></IconBtn>
      )}
      {rec?.checkIn && !rec?.checkOut && (
        <IconBtn title="Check out" onClick={() => punch(emp.id, "out")}><LogOut size={14} /></IconBtn>
      )}
      <IconBtn title="Mark WFH" onClick={() => punch(emp.id, "wfh")}><Home size={14} /></IconBtn>
      <IconBtn title="Mark leave" onClick={() => punch(emp.id, "leave")}><Coffee size={14} /></IconBtn>
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 7, border: `1px solid ${COLORS.line}`,
      background: "#fff", color: COLORS.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = COLORS.bg; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
    >{children}</button>
  );
}

function StatCard({ label, value, tone }) {
  const s = TONE_STYLES[tone] || TONE_STYLES.pending;
  return (
    <div style={{ background: COLORS.card, borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: s.dot }} />
        <span style={{ fontSize: 27, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const th = { padding: "9px 12px", fontWeight: 600 };
const td = { padding: "12px 12px", fontSize: 14 };

/* ---------------- Attendance Log ---------------- */
function LogView({ employees, attendance, now }) {
  const isMobile = useIsMobile();
  const [empFilter, setEmpFilter] = useState("all");
  const [start, setStart] = useState(() => { const d = new Date(now); d.setDate(d.getDate() - 6); return todayStr(d); });
  const [end, setEnd] = useState(todayStr(now));

  const dateList = useMemo(() => {
    const list = [];
    let d = new Date(start);
    const endD = new Date(end);
    while (d <= endD) { list.push(todayStr(d)); d.setDate(d.getDate() + 1); }
    return list.reverse();
  }, [start, end]);

  const empList = empFilter === "all" ? employees : employees.filter(e => e.id === empFilter);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const rows = [];
  dateList.forEach(date => {
    const isPast = date < todayStr(now);
    empList.forEach(emp => {
      const rec = attendance[`${emp.id}|${date}`];
      const status = computeStatus(emp, rec, isPast, nowMinutes);
      let hours = null;
      if (rec?.checkIn && rec?.checkOut) hours = (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;
      rows.push({ date, emp, rec, status, hours });
    });
  });

  return (
    <div>
      <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, margin: "0 0 16px", fontFamily: FONT_DISPLAY, color: COLORS.ink }}>Attendance Log</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...selectStyle, flex: isMobile ? "1 1 100%" : "unset" }}>
          <option value="all">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...selectStyle, flex: isMobile ? "1 1 auto" : "unset" }} />
        <span style={{ alignSelf: "center", color: COLORS.muted, fontSize: 13 }}>to</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ ...selectStyle, flex: isMobile ? "1 1 auto" : "unset" }} />
      </div>

      {rows.length === 0 && (
        <div style={{ background: COLORS.card, borderRadius: 14, padding: "26px 20px", textAlign: "center", color: COLORS.muted, boxShadow: "0 1px 3px rgba(27,30,54,0.06)" }}>
          No records for this range.
        </div>
      )}

      {isMobile ? (
        rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ background: COLORS.card, borderRadius: 10, padding: 12, boxShadow: "0 1px 3px rgba(27,30,54,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.emp.name}</div>
                    <div style={{ color: COLORS.muted, fontSize: 12, fontFamily: FONT_MONO }}>
                      {new Date(r.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <StatusPill {...r.status} />
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: COLORS.muted }}>
                  <span>In: <strong style={{ color: COLORS.ink, fontFamily: FONT_MONO }}>{fmtTime(r.rec?.checkIn)}</strong></span>
                  <span>Out: <strong style={{ color: COLORS.ink, fontFamily: FONT_MONO }}>{fmtTime(r.rec?.checkOut)}</strong></span>
                  <span>Hrs: <strong style={{ color: COLORS.ink, fontFamily: FONT_MONO }}>{r.hours != null ? fmtHrs(r.hours) : "—"}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : rows.length > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
                <th style={th}>Date</th>
                <th style={th}>Name</th>
                <th style={th}>Status</th>
                <th style={th}>Check-in</th>
                <th style={th}>Check-out</th>
                <th style={th}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                  <td style={td}>{new Date(r.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  <td style={td}><strong>{r.emp.name}</strong></td>
                  <td style={td}><StatusPill {...r.status} /></td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.checkIn)}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{fmtTime(r.rec?.checkOut)}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{r.hours != null ? fmtHrs(r.hours) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const selectStyle = {
  padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`, background: "#fff",
  fontSize: 13.5, color: COLORS.ink, fontWeight: 500,
};

/* ---------------- Employees View ---------------- */
function EmployeesView({ employees, setEmployees }) {
  const [editing, setEditing] = useState(null); // employee obj or "new"
  const isOpen = editing !== null;

  const remove = (id) => {
    setEmployees(employees.filter(e => e.id !== id));
  };

  const save = (emp) => {
    if (emp.id) {
      setEmployees(employees.map(e => e.id === emp.id ? emp : e));
    } else {
      setEmployees([...employees, { ...emp, id: uid("emp") }]);
    }
    setEditing(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Employees</h1>
        <button onClick={() => setEditing({})} style={primaryBtn}>
          <Plus size={16} /> Add employee
        </button>
      </div>

      <div style={{ background: COLORS.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Department</th>
              <th style={th}>Type</th>
              <th style={th}>Shift</th>
              <th style={th}>ZK ID</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}><strong>{emp.name}</strong></td>
                <td style={{ ...td, color: COLORS.muted }}>{emp.department}</td>
                <td style={{ ...td, color: COLORS.muted }}>{emp.employmentType}</td>
                <td style={{ ...td, color: COLORS.muted }}>{emp.shiftStart}–{emp.shiftEnd}</td>
                <td style={{ ...td, color: COLORS.muted }}>{emp.zkUserId || "—"}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn title="Edit" onClick={() => setEditing(emp)}><Edit2 size={14} /></IconBtn>
                    <IconBtn title="Remove" onClick={() => remove(emp.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen && <EmployeeModal initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function EmployeeModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial.id, name: initial.name || "", department: initial.department || DEPARTMENTS[0],
    employmentType: initial.employmentType || "Full-time",
    shiftStart: initial.shiftStart || "09:30", shiftEnd: initial.shiftEnd || "18:30",
    zkUserId: initial.zkUserId || "",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(27,30,54,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{initial.id ? "Edit employee" : "Add employee"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><X size={20} /></button>
        </div>

        <Field label="Full name">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Ananya Rao" />
        </Field>
        <Field label="Department">
          <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} style={inputStyle}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Employment type">
          <select value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })} style={inputStyle}>
            {["Full-time", "Part-time", "Contract", "Intern"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Shift start" style={{ flex: 1 }}>
            <input type="time" value={form.shiftStart} onChange={e => setForm({ ...form, shiftStart: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Shift end" style={{ flex: 1 }}>
            <input type="time" value={form.shiftEnd} onChange={e => setForm({ ...form, shiftEnd: e.target.value })} style={inputStyle} />
          </Field>
        </div>
        <Field label="ZK Device ID (optional — links this person to the fingerprint machine)">
          <input value={form.zkUserId} onChange={e => setForm({ ...form, zkUserId: e.target.value })} style={inputStyle} placeholder="e.g. 7" />
        </Field>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button
            onClick={() => form.name.trim() && onSave(form)}
            style={{ ...primaryBtn, flex: 1, justifyContent: "center" }}
            disabled={!form.name.trim()}
          >
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`,
  fontSize: 14, color: COLORS.ink, boxSizing: "border-box",
};
const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 7, background: COLORS.orange, color: "#fff",
  border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const secondaryBtn = {
  flex: 1, background: COLORS.bg, color: COLORS.ink, border: `1px solid ${COLORS.line}`,
  borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer",
};

/* ---------------- My Check-In ---------------- */
function MyCheckInView({ employees, attendance, punch, meId, setMeId, now }) {
  const date = todayStr(now);
  const me = employees.find(e => e.id === meId) || employees[0];
  const rec = me ? attendance[`${me.id}|${date}`] : null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const status = me ? computeStatus(me, rec, false, nowMinutes) : null;

  if (!me) return <p style={{ color: COLORS.muted }}>No employees set up yet — ask HR to add you.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 18px" }}>My Check-In</h1>

      <Field label="I am">
        <select value={me.id} onChange={e => setMeId(e.target.value)} style={{ ...inputStyle, maxWidth: 320 }}>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>

      <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(27,30,54,0.06)", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{me.name}</div>
            <div style={{ color: COLORS.muted, fontSize: 13 }}>{me.department} · Shift {me.shiftStart}–{me.shiftEnd}</div>
          </div>
          {status && <StatusPill {...status} />}
        </div>

        <div style={{ display: "flex", gap: 18, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>CHECK-IN</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtTime(rec?.checkIn)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>CHECK-OUT</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtTime(rec?.checkOut)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={!!rec?.checkIn} onClick={() => punch(me.id, "in")}
            style={{ ...primaryBtn, opacity: rec?.checkIn ? 0.4 : 1, cursor: rec?.checkIn ? "not-allowed" : "pointer" }}>
            <LogIn size={16} /> Check in
          </button>
          <button disabled={!rec?.checkIn || !!rec?.checkOut} onClick={() => punch(me.id, "out")}
            style={{ ...secondaryBtn, flex: "unset", opacity: (!rec?.checkIn || rec?.checkOut) ? 0.4 : 1, cursor: (!rec?.checkIn || rec?.checkOut) ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <LogOut size={16} /> Check out
          </button>
          <button onClick={() => punch(me.id, "wfh")}
            style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Home size={16} /> Mark WFH today
          </button>
          <button onClick={() => punch(me.id, "leave")}
            style={{ ...secondaryBtn, flex: "unset", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Coffee size={16} /> Mark leave
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reports ---------------- */
function ReportsView({ employees, attendance, now }) {
  const [ym, setYm] = useState(monthKey(todayStr(now)));

  const shiftMonth = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(monthKey(todayStr(d)));
  };

  const totalDays = daysInMonth(ym);
  const todayFull = todayStr(now);

  const summary = employees.map(emp => {
    let present = 0, late = 0, half = 0, wfh = 0, leave = 0, absent = 0, totalHours = 0, workedDays = 0;
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      if (dateStr > todayFull) continue;
      const isPast = dateStr < todayFull;
      const rec = attendance[`${emp.id}|${dateStr}`];
      const status = computeStatus(emp, rec, isPast, now.getHours() * 60 + now.getMinutes());
      if (status.tone === "present") present++;
      else if (status.tone === "late") { present++; late++; }
      else if (status.tone === "half") { half++; }
      else if (status.tone === "wfh") { wfh++; }
      else if (status.tone === "leave") { leave++; }
      else if (status.tone === "absent") { absent++; }
      if (rec?.checkIn && rec?.checkOut) {
        totalHours += (new Date(rec.checkOut) - new Date(rec.checkIn)) / 3600000;
        workedDays++;
      }
    }
    return { emp, present, late, half, wfh, leave, absent, avgHours: workedDays ? totalHours / workedDays : 0 };
  });

  const chartData = summary.map(s => ({
    name: s.emp.name.split(" ")[0],
    Present: s.present, Late: s.late, "Half Day": s.half, WFH: s.wfh, Leave: s.leave, Absent: s.absent,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Monthly Reports</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 10, padding: "6px 10px", border: `1px solid ${COLORS.line}` }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: "center" }}>
            {new Date(ym + "-01").toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => shiftMonth(1)} style={navBtn}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ background: COLORS.card, borderRadius: 16, padding: "20px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)", marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15.5, fontWeight: 700 }}>Attendance breakdown</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="Present" stackId="a" fill={COLORS.green} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Late" stackId="a" fill={COLORS.amber} />
              <Bar dataKey="Half Day" stackId="a" fill="#E8B94A" />
              <Bar dataKey="WFH" stackId="a" fill={COLORS.blue} />
              <Bar dataKey="Leave" stackId="a" fill="#3E5A9E" />
              <Bar dataKey="Absent" stackId="a" fill={COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: COLORS.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 3px rgba(27,30,54,0.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Present</th>
              <th style={th}>Late</th>
              <th style={th}>Half day</th>
              <th style={th}>WFH</th>
              <th style={th}>Leave</th>
              <th style={th}>Absent</th>
              <th style={th}>Avg hrs/day</th>
            </tr>
          </thead>
          <tbody>
            {summary.map(s => (
              <tr key={s.emp.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <td style={td}><strong>{s.emp.name}</strong></td>
                <td style={td}>{s.present}</td>
                <td style={td}>{s.late}</td>
                <td style={td}>{s.half}</td>
                <td style={td}>{s.wfh}</td>
                <td style={td}>{s.leave}</td>
                <td style={td}>{s.absent}</td>
                <td style={td}>{fmtHrs(s.avgHours)}</td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: "26px 0" }}>No employees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 14 }}>
        Late = check-in more than {GRACE_MIN} min after shift start. Half day = fewer than {HALFDAY_HOURS} hours worked.
      </p>
    </div>
  );
}

const navBtn = {
  background: "none", border: "none", cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
};
