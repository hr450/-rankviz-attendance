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
async function checkFirstLogin(zkUserId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?zk_user_id=eq.${zkUserId}&select=name,password,email`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const data = await res.json();
  if (!data.length) throw new Error('Attendance ID not found');
  const emp = data[0];
  return { needsSetup: !emp.password, name: emp.name };
}

async function loginEmployee(zkUserId, email, password) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?zk_user_id=eq.${zkUserId}&email=eq.${email}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const data = await res.json();
  if (!data.length || data[0].password !== password) throw new Error('Invalid credentials');
  return { zk_user_id: zkUserId, name: data[0].name, email: data[0].email, role: 'employee' };
}
function LoginFlow({ onLogin }) {
  const [step, setStep] = React.useState('id');
  const [zkUserId, setZkUserId] = React.useState('');
  const [empName, setEmpName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState('');
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
    <img src="data:image/png;base64,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" alt="RankViz" style={{ height: 34, width: "auto", objectFit: "contain", display: "block" }} />
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
