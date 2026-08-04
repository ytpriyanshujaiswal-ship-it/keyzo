import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Phone, Plus, Search, LogOut, Users, LayoutGrid, Archive, UserPlus,
  X, ChevronRight, Clock, AlertCircle, CheckCircle2, Trash2, Building2,
  KeyRound, Eye, EyeOff, TrendingUp, FileStack, Trophy, Award, MessageCircle,
  Send, Tag as TagIcon, CalendarClock, Paperclip, Wallet, Upload, Settings, Mail,
  MoreVertical, Pencil, XCircle, ArrowLeftRight, History, Home, Calendar, CalendarDays,
  ArrowUpDown, ChevronLeft
} from "lucide-react";

/* ---------------------------------------------------------
   Keyzo — a private sales-desk CRM with a real backend.
   Talks to the local Keyzo server (Express + JSON storage)
   running at API_BASE.
--------------------------------------------------------- */

const API_BASE = "https://keyzo-server.onrender.com/api";

const STATUS = [
  { id: "new", label: "New", color: "#5B8DEF" },
  { id: "contacted", label: "Contacted", color: "#E8B93A" },
  { id: "followup", label: "Follow-up", color: "#F2A93C" },
  { id: "site_visit", label: "Site Visit", color: "#B07AE0" },
  { id: "negotiation", label: "Negotiation", color: "#3FBF7F" },
  { id: "converted", label: "Converted", color: "#22A85C" },
  { id: "not_interested", label: "Not Interested", color: "#E45D5D" },
];
const statusMeta = (id) => STATUS.find((s) => s.id === id) || STATUS[0];
const SOURCES = ["99acres", "MagicBricks", "Housing.com", "Reference", "Walk-in", "Other"];
const ACTIVITY_TYPES = [
  { id: "call", label: "Call" },
  { id: "visit", label: "Site Visit" },
  { id: "revisit", label: "Revisit" },
  { id: "meeting", label: "Meeting" },
];
const DEFAULT_WA_TEMPLATE = "Hi {name}, this is regarding your interest in {project} {sector}. Let us know a good time to talk. Thank you!";

const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (ts) => new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtShort = (ts) => new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function fillTemplate(tpl, lead) {
  return (tpl || "").replace(/\{name\}/g, lead.name || "").replace(/\{project\}/g, lead.project || "").replace(/\{sector\}/g, lead.sector || "");
}
function digitsOnly(phone) { return (phone || "").replace(/\D/g, ""); }
function waLink(phone, message) {
  let d = digitsOnly(phone);
  if (d.length === 10) d = "91" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}
function smsLink(phone, message) {
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}
function isOverdue(lead) {
  if (!lead.nextActivity || !lead.nextActivity.at) return false;
  if (lead.status === "converted" || lead.status === "not_interested") return false;
  return lead.nextActivity.at < Date.now();
}
function contactLogPatch(lead, channel, actorName) {
  const wasOverdue = isOverdue(lead);
  return {
    history: [...(lead.history || []), { at: Date.now(), by: actorName || "You", action: `Contacted via ${channel}${wasOverdue ? " (overdue reminder cleared)" : ""}` }],
    ...(wasOverdue ? { nextActivity: null } : {}),
  };
}

function useIsMobile() {
  const [mobile, setMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 860 : false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const fn = () => setMobile(mq.matches);
    fn();
    mq.addEventListener ? mq.addEventListener("change", fn) : mq.addListener(fn);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", fn) : mq.removeListener(fn));
  }, []);
  return mobile;
}

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export default function KeyzoCRM() {
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState({ waTemplate: DEFAULT_WA_TEMPLATE });
  const [dataLoading, setDataLoading] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [toast, setToast] = useState(null);
  const isMobile = useIsMobile();

  const notify = useCallback((msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("keyzo_session");
    if (raw) { try { setSession(JSON.parse(raw)); } catch {} }
  }, []);

  const loadData = useCallback(async (sess) => {
    if (!sess) return;
    setDataLoading(true);
    try {
      const [l, s] = await Promise.all([
        api("/leads", { token: sess.token }),
        api("/settings", { token: sess.token }),
      ]);
      setLeads(l);
      setSettings(s);
      if (sess.user.role === "backend") setUsers(await api("/users", { token: sess.token }));
      setServerDown(false);
    } catch (e) { setServerDown(true); }
    finally { setDataLoading(false); }
  }, []);

  useEffect(() => { if (session) loadData(session); }, [session, loadData]);

  const doLogin = async (username, password) => {
    const data = await api("/login", { method: "POST", body: { username, password } });
    const sess = { token: data.token, user: data.user };
    localStorage.setItem("keyzo_session", JSON.stringify(sess));
    setSession(sess);
    notify(`Welcome back, ${data.user.name.split(" ")[0]}`);
  };
  const doLogout = () => { localStorage.removeItem("keyzo_session"); setSession(null); setUsers([]); setLeads([]); };

  const saveTemplate = async (tpl) => {
    try {
      const s = await api("/settings", { method: "PUT", token: session.token, body: { waTemplate: tpl } });
      setSettings(s);
      notify("Template saved");
    } catch (e) { notify(e.message, "err"); }
  };

  if (!session) return <LoginScreen onLogin={doLogin} />;

  if (serverDown) {
    return (
      <div style={S.appShell}>
        <GlobalStyle />
        <div style={S.loginWrap}>
          <div style={{ ...S.loginCard, alignItems: "flex-start", textAlign: "left" }}>
            <AlertCircle size={28} color={T.accent} />
            <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, marginTop: 14 }}>Server se connect nahi ho paya</div>
            <div style={{ color: T.muted, fontSize: 13.5, marginTop: 10, lineHeight: 1.7 }}>
              Keyzo backend chal nahi raha ya reachable nahi hai. Terminal me <code style={S.code}>server</code> folder ke andar <code style={S.code}>npm start</code> chalao, fir yahan reload karo.
            </div>
            <button style={{ ...S.primaryBtn, width: "auto", marginTop: 20 }} onClick={() => loadData(session)}>Retry</button>
            <button className="k-btn" style={{ ...S.smallBtn, marginTop: 10, borderColor: T.hairline, color: T.muted }} onClick={doLogout}>Log out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.appShell}>
      <GlobalStyle />
      {session.user.role === "backend" ? (
        <BackendDashboard me={session.user} token={session.token} users={users} leads={leads} settings={settings} loading={dataLoading} setUsers={setUsers} setLeads={setLeads} saveTemplate={saveTemplate} onLogout={doLogout} notify={notify} isMobile={isMobile} />
      ) : (
        <CallingDashboard me={session.user} token={session.token} leads={leads} settings={settings} loading={dataLoading} setLeads={setLeads} onLogout={doLogout} notify={notify} isMobile={isMobile} />
      )}
      {toast && <div className="k-toast" style={{ ...S.toast, borderColor: toast.tone === "err" ? T.danger : T.accent }}>{toast.msg}</div>}
    </div>
  );
}

/* ---------------- LOGO ---------------- */
function Logo({ size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: T.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M12 1 L23 12 L12 23 L1 12 Z" fill={T.accent} />
        <circle cx="12" cy="12" r="3.4" fill={T.ink} />
      </svg>
    </div>
  );
}

/* ---------------- LOGIN ---------------- */
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try { await onLogin(username.trim(), password.trim()); }
    catch (e) { setErr(e.message || "Login nahi ho paya."); }
    finally { setBusy(false); }
  };

  return (
    <div style={S.appShell}>
      <GlobalStyle />
      <div style={S.loginWrap}>
        <div style={S.loginCard}>
          <Logo size={56} />
          <div style={S.brandTitle}>Keyzo</div>
          <div style={S.brandSub}>Private sales desk</div>
          <div style={{ marginTop: 32, width: "100%" }}>
            <label style={S.label}>Username</label>
            <input style={S.input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. login@proptech" autoFocus autoCapitalize="none" />
            <label style={{ ...S.label, marginTop: 18 }}>Password</label>
            <div style={{ position: "relative" }}>
              <input style={S.input} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && submit()} />
              <button type="button" onClick={() => setShow((s) => !s)} style={S.eyeBtn}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {err && <div style={S.errBox}><AlertCircle size={14} /> {err}</div>}
            <button type="button" disabled={busy} onClick={submit} className="k-btn" style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Checking…" : "Enter Desk"} <ChevronRight size={16} /></button>
          </div>
          <div style={S.hint}>Naya calling-team login chahiye? Backend team apne dashboard se bana sakti hai.</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- BACKEND DASHBOARD ---------------- */
function BackendDashboard({ me, token, users, leads, settings, loading, setUsers, setLeads, saveTemplate, onLogout, notify, isMobile }) {
  const [tab, setTab] = useState("overview");
  const [showAddLead, setShowAddLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDistribute, setShowDistribute] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [q, setQ] = useState("");

  const agents = users.filter((u) => u.role === "calling");
  const liveLeads = leads.filter((l) => !l.removed);
  const removedLeads = leads.filter((l) => l.removed);

  const filtered = liveLeads.filter((l) => {
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterAgent !== "all" && l.assignedTo !== filterAgent) return false;
    if (q) {
      const hay = `${l.name} ${l.phone} ${l.project} ${l.sector} ${(l.tags || []).join(" ")} ${(l.notes || []).map((n) => n.text).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const stats = useMemo(() => {
    const s = { total: liveLeads.length, unassigned: liveLeads.filter((l) => !l.assignedTo).length };
    STATUS.forEach((st) => (s[st.id] = liveLeads.filter((l) => l.status === st.id).length));
    return s;
  }, [liveLeads]);

  const addLead = async (data) => {
    try {
      const lead = await api("/leads", { method: "POST", token, body: data });
      setLeads([lead, ...leads]);
      setShowAddLead(false);
      notify("Naya lead add ho gaya");
    } catch (e) { notify(e.message, "err"); }
  };

  const bulkImport = async (parsedLeads, distributeAmong) => {
    try {
      const res = await api("/leads/bulk", { method: "POST", token, body: { leads: parsedLeads, distributeAmong } });
      setLeads([...res.leads, ...leads]);
      setShowImport(false);
      notify(`${res.count} leads import ho gaye`);
    } catch (e) { notify(e.message, "err"); }
  };

  const distributeExisting = async (assignments) => {
    // assignments: [{ username, count }]
    const pool = leads.filter((l) => !l.removed && !l.assignedTo);
    let cursor = 0;
    const updates = [];
    for (const { username, count } of assignments) {
      const chunk = pool.slice(cursor, cursor + count);
      cursor += count;
      chunk.forEach((lead) => updates.push({ lead, username }));
    }
    try {
      const results = await Promise.all(
        updates.map(({ lead, username }) =>
          api(`/leads/${lead.id}`, {
            method: "PATCH", token,
            body: { assignedTo: username, history: [...(lead.history || []), { at: Date.now(), by: me.name, action: `Assigned to ${username} (bulk distribute)` }] },
          })
        )
      );
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      setLeads(leads.map((l) => byId[l.id] || l));
      setShowDistribute(false);
      notify(`${updates.length} leads distribute ho gaye`);
    } catch (e) { notify(e.message, "err"); }
  };

  const assignLead = async (leadId, username) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const history = [...(lead.history || []), { at: Date.now(), by: me.name, action: `Assigned to ${username || "—"}` }];
    try {
      const updated = await api(`/leads/${leadId}`, { method: "PATCH", token, body: { assignedTo: username, history } });
      setLeads(leads.map((l) => (l.id === leadId ? updated : l)));
    } catch (e) { notify(e.message, "err"); }
  };

  const patchLead = async (leadId, patch) => {
    try {
      const updated = await api(`/leads/${leadId}`, { method: "PATCH", token, body: patch });
      setLeads(leads.map((l) => (l.id === leadId ? updated : l)));
    } catch (e) { notify(e.message, "err"); }
  };

  const addUser = async (data) => {
    try {
      const u = await api("/users", { method: "POST", token, body: data });
      setUsers([...users, u]);
      setShowAddUser(false);
      notify(`${data.name} ka login ban gaya`);
    } catch (e) { notify(e.message, "err"); }
  };

  const toggleAgentActive = async (userId) => {
    const u = users.find((x) => x.id === userId);
    try {
      await api(`/users/${userId}`, { method: "PATCH", token, body: { active: !(u.active !== false) } });
      setUsers(users.map((x) => (x.id === userId ? { ...x, active: !(u.active !== false) } : x)));
    } catch (e) { notify(e.message, "err"); }
  };

  const resetAgentPassword = async (userId, newPassword) => {
    try {
      await api(`/users/${userId}`, { method: "PATCH", token, body: { password: newPassword } });
      setUsers(users.map((x) => (x.id === userId ? { ...x, password: newPassword } : x)));
      notify("Password update ho gaya");
    } catch (e) { notify(e.message, "err"); }
  };

  const NAV = [
    { id: "overview", label: "Overview", icon: <TrendingUp size={isMobile ? 20 : 16} /> },
    { id: "leads", label: "Leads", icon: <LayoutGrid size={isMobile ? 20 : 16} /> },
    { id: "performance", label: "Performance", icon: <Trophy size={isMobile ? 20 : 16} /> },
    { id: "team", label: "Team", icon: <Users size={isMobile ? 20 : 16} /> },
    { id: "removed", label: "Archive", icon: <Archive size={isMobile ? 20 : 16} /> },
  ];

  return (
    <div style={isMobile ? S.dashGridMobile : S.dashGrid}>
      {!isMobile && <Sidebar me={me} tab={tab} setTab={setTab} onLogout={onLogout} role="Backend Ops" items={NAV} />}
      {isMobile && <MobileHeader title={NAV.find((n) => n.id === tab)?.label} onLogout={onLogout} />}

      <main style={isMobile ? S.mainMobile : S.main}>
        {!isMobile && (
          <TopBar
            title={NAV.find((n) => n.id === tab)?.label === "Leads" ? "All Leads" : NAV.find((n) => n.id === tab)?.label}
            right={
              tab === "leads" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="k-btn" style={{ ...S.ctaBtn, background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowImport(true)}><Upload size={15} /> Import</button>
                  <button className="k-btn" style={{ ...S.ctaBtn, background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowDistribute(true)}><ArrowLeftRight size={15} /> Distribute</button>
                  <button className="k-btn" style={S.ctaBtn} onClick={() => setShowAddLead(true)}><Plus size={15} /> New Lead</button>
                </div>
              ) : tab === "team" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="k-btn" style={{ ...S.ctaBtn, background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowTemplate(true)}><Settings size={15} /> WhatsApp Template</button>
                  <button className="k-btn" style={S.ctaBtn} onClick={() => setShowAddUser(true)}><UserPlus size={15} /> New Login</button>
                </div>
              ) : null
            }
          />
        )}

        {tab === "overview" && <OverviewPanel stats={stats} agents={agents} removedCount={removedLeads.length} isMobile={isMobile} />}

        {tab === "leads" && (
          <>
            {isMobile && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button className="k-btn" style={{ ...S.ctaBtn, flex: 1, justifyContent: "center", background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowImport(true)}><Upload size={15} /> Import</button>
                <button className="k-btn" style={{ ...S.ctaBtn, flex: 1, justifyContent: "center", background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowDistribute(true)}><ArrowLeftRight size={15} /> Distribute</button>
              </div>
            )}
            <FilterBar q={q} setQ={setQ} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterAgent={filterAgent} setFilterAgent={setFilterAgent} agents={agents} isMobile={isMobile} />
            {loading && leads.length === 0 ? <SkeletonRows /> : <LeadTable leads={filtered} agents={agents} me={me} onAssign={assignLead} onOpen={setActiveLead} onPatch={patchLead} isMobile={isMobile} />}
          </>
        )}

        {tab === "performance" && <PerformancePanel agents={agents} leads={liveLeads} isMobile={isMobile} />}
        {tab === "team" && (
          <>
            {isMobile && (
              <button className="k-btn" style={{ ...S.ctaBtn, width: "100%", justifyContent: "center", marginBottom: 14, background: "#fff", color: T.ink, border: `1.5px solid ${T.hairline}` }} onClick={() => setShowTemplate(true)}><Settings size={15} /> WhatsApp Template</button>
            )}
            <TeamPanel agents={agents} onToggle={toggleAgentActive} onResetPassword={resetAgentPassword} leads={liveLeads} isMobile={isMobile} />
          </>
        )}
        {tab === "removed" && <RemovedTable leads={removedLeads} isMobile={isMobile} />}
      </main>

      {isMobile && <MobileTabBar items={NAV} tab={tab} setTab={setTab} onFab={tab === "leads" ? () => setShowAddLead(true) : tab === "team" ? () => setShowAddUser(true) : null} />}

      {showAddLead && <LeadFormModal agents={agents} onClose={() => setShowAddLead(false)} onSubmit={addLead} isMobile={isMobile} />}
      {showImport && <BulkImportModal agents={agents} onClose={() => setShowImport(false)} onSubmit={bulkImport} isMobile={isMobile} />}
      {showDistribute && <DistributeModal agents={agents} unassignedCount={liveLeads.filter((l) => !l.assignedTo).length} onClose={() => setShowDistribute(false)} onSubmit={distributeExisting} isMobile={isMobile} />}
      {showAddUser && <UserFormModal onClose={() => setShowAddUser(false)} onSubmit={addUser} isMobile={isMobile} />}
      {showTemplate && <TemplateModal template={settings.waTemplate} onClose={() => setShowTemplate(false)} onSave={saveTemplate} isMobile={isMobile} />}
      {activeLead && (
        <LeadDetailModal lead={leads.find((l) => l.id === activeLead.id) || activeLead} waTemplate={settings.waTemplate} me={me} onClose={() => setActiveLead(null)} isMobile={isMobile} onUpdate={(patch) => patchLead(activeLead.id, patch)} />
      )}
    </div>
  );
}

function OverviewPanel({ stats, agents, removedCount, isMobile }) {
  return (
    <div>
      <div style={isMobile ? S.statGridMobile : S.statGrid}>
        <StatCard label="Live Leads" value={stats.total} icon={<FileStack size={17} />} />
        <StatCard label="Unassigned" value={stats.unassigned} icon={<AlertCircle size={17} />} tone={stats.unassigned ? "warn" : "ok"} />
        <StatCard label="Converted" value={stats.converted} icon={<CheckCircle2 size={17} />} tone="ok" />
        <StatCard label="Team" value={agents.length} icon={<Users size={17} />} />
      </div>
      <div style={S.panel}>
        <div style={S.panelTitle}>Pipeline</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          {STATUS.map((s) => {
            const val = stats[s.id] || 0;
            const pct = stats.total ? Math.round((val / stats.total) * 100) : 0;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: isMobile ? 84 : 112, fontSize: 12.5, color: T.muted }}>{s.label}</div>
                <div style={{ flex: 1, height: 6, background: T.hairline, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 3, transition: "width .5s" }} />
                </div>
                <div style={{ width: 26, fontSize: 12.5, fontFamily: FONT.mono, textAlign: "right" }}>{val}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function StatCard({ label, value, icon, tone }) {
  const color = tone === "warn" ? T.warn : tone === "ok" ? T.success : T.accent;
  return (
    <div className="k-card" style={S.statCard}>
      <div style={{ ...S.statIcon, color }}>{icon}</div>
      <div style={S.statValue}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

/* ---------------- PERFORMANCE ---------------- */
function PerformancePanel({ agents, leads, isMobile }) {
  const rows = useMemo(() => agents.map((a) => {
    const mine = leads.filter((l) => l.assignedTo === a.username);
    const converted = mine.filter((l) => l.status === "converted").length;
    const negotiation = mine.filter((l) => l.status === "negotiation").length;
    const calls = mine.reduce((sum, l) => sum + (l.notes ? l.notes.length : 0), 0);
    const rate = mine.length ? Math.round((converted / mine.length) * 100) : 0;
    return { agent: a, total: mine.length, converted, negotiation, calls, rate };
  }).sort((a, b) => b.converted - a.converted || b.rate - a.rate), [agents, leads]);

  if (rows.length === 0) return <EmptyState text="Team me koi calling agent nahi hai abhi. Team tab se login banao." />;
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.agent.id} className="k-card k-fade-in" style={S.perfCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ ...S.rankBadge, ...(i === 0 ? S.rankGold : i === 1 ? S.rankSilver : i === 2 ? S.rankBronze : {}) }}>{i < 3 ? <Award size={14} /> : i + 1}</div>
            <div style={S.avatarCircle}>{r.agent.name.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={S.leadName}>{r.agent.name}</div><div style={S.leadPhone}>@{r.agent.username}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: T.accent }}>{r.converted}</div><div style={{ fontSize: 10.5, color: T.mutedDim }}>converted</div></div>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 10 : 22, marginTop: 14, flexWrap: "wrap" }}>
            <PerfStat label="Assigned" value={r.total} /><PerfStat label="In Negotiation" value={r.negotiation} /><PerfStat label="Calls Logged" value={r.calls} /><PerfStat label="Conversion" value={`${r.rate}%`} />
          </div>
          <div style={{ marginTop: 12, height: 6, background: T.hairline, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(r.total / maxTotal) * 100}%`, height: "100%", background: T.accent, borderRadius: 3 }} /></div>
        </div>
      ))}
    </div>
  );
}
function PerfStat({ label, value }) {
  return <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONT.display }}>{value}</div><div style={{ fontSize: 10.5, color: T.mutedDim }}>{label}</div></div>;
}

function FilterBar({ q, setQ, filterStatus, setFilterStatus, filterAgent, setFilterAgent, agents, isMobile }) {
  return (
    <div style={isMobile ? S.filterBarMobile : S.filterBar}>
      <div style={S.searchBox}><Search size={15} color={T.mutedDim} /><input style={S.searchInput} placeholder="Search name, phone, project, tag, note…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <select style={{ ...S.select, flex: 1 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {agents.length > 0 && (
          <select style={{ ...S.select, flex: 1 }} value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
            <option value="all">All agents</option><option value="">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.username}>{a.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function LeadTable({ leads, agents, me, onAssign, onOpen, onPatch, isMobile }) {
  if (leads.length === 0) return <EmptyState text="No leads match yet. Adjust filters or add a new lead." />;
  return (
    <div style={S.tableWrap}>
      {leads.map((l) => {
        const meta = statusMeta(l.status);
        const overdue = isOverdue(l);
        return (
          <div key={l.id} className="k-card k-fade-in" style={S.leadRow} onClick={() => onOpen(l)}>
            <div style={{ ...S.rail, background: overdue ? T.danger : T.accent }} />
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={S.leadRowTop}>
                <div style={{ minWidth: 0 }}><div style={S.leadName}>{l.name}</div><div style={S.leadPhone}>{l.phone}</div></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {overdue && <span style={{ ...S.pill, background: T.danger + "22", color: T.danger, borderColor: T.danger + "55" }}>OVERDUE</span>}
                  <span style={{ ...S.pill, background: meta.color + "22", color: meta.color, borderColor: meta.color + "55" }}>{meta.label}</span>
                  {onPatch && <LeadActionsMenu lead={l} agents={agents} me={me} onPatch={(patch) => onPatch(l.id, patch)} />}
                </div>
              </div>
              <div style={S.leadRowMeta}><span>{l.project}{l.sector ? ` · ${l.sector}` : ""}</span>{!isMobile && <span style={{ color: T.mutedDim }}>{l.source}</span>}</div>
              {l.tags && l.tags.length > 0 && <TagRow tags={l.tags} />}
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
                <select style={S.assignSelect} value={l.assignedTo || ""} onChange={(e) => onAssign(l.id, e.target.value)}>
                  <option value="">Unassigned</option>
                  {agents.map((a) => <option key={a.id || a.username} value={a.username}>{a.name}</option>)}
                </select>
              </div>
            </div>
            {!isMobile && <ChevronRight size={16} color={T.mutedDim} />}
          </div>
        );
      })}
    </div>
  );
}

function TagRow({ tags }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
      {tags.map((t, i) => <span key={i} className="k-chip" style={S.tagChip}>{t}</span>)}
    </div>
  );
}

function RemovedTable({ leads, isMobile }) {
  if (leads.length === 0) return <EmptyState text="No leads removed yet. Anything the calling team removes lands here with a reason." />;
  return (
    <div style={S.tableWrap}>
      {leads.sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0)).map((l) => (
        <div key={l.id} style={{ ...S.leadRow, cursor: "default", opacity: 0.82 }}>
          <div style={{ ...S.rail, background: T.danger }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.leadRowTop}><div><div style={S.leadName}>{l.name}</div><div style={S.leadPhone}>{l.phone}</div></div><Trash2 size={14} color={T.danger} /></div>
            <div style={S.leadRowMeta}><span>{l.project}{l.sector ? ` · ${l.sector}` : ""}</span></div>
            <div style={{ fontSize: 12, color: T.mutedDim, marginTop: 8 }}>
              Removed by <b style={{ color: T.text }}>{l.removedByName || l.removedBy}</b> · {fmtDateTime(l.removedAt)}
              {l.removeReason && <div style={{ fontStyle: "italic", marginTop: 2 }}>"{l.removeReason}"</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ agents, onToggle, onResetPassword, leads, isMobile }) {
  const [resetFor, setResetFor] = useState(null);
  if (agents.length === 0) return <EmptyState text="No calling-team logins yet. Create one to get started." />;
  return (
    <div style={S.tableWrap}>
      {agents.map((a) => {
        const count = leads.filter((l) => l.assignedTo === a.username).length;
        return (
          <div key={a.id} style={{ ...S.leadRow, cursor: "default", alignItems: "center" }}>
            <div style={S.avatarCircle}>{a.name.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.leadName}>{a.name}</div>
              <div style={S.leadPhone}>{count} leads · joined {fmtDate(a.createdAt)}</div>
              <div style={S.credRow}>
                <span style={S.credChip}>👤 {a.username}</span>
                <span style={S.credChip}>🔑 {a.password || "—"}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="k-btn" style={{ ...S.smallBtn, borderColor: T.hairline, color: T.muted }} onClick={() => setResetFor(a)}>Reset Password</button>
              <button className="k-btn" style={{ ...S.smallBtn, borderColor: a.active === false ? T.success : T.danger, color: a.active === false ? T.success : T.danger }} onClick={() => onToggle(a.id)}>{a.active === false ? "Activate" : "Pause"}</button>
            </div>
          </div>
        );
      })}
      {resetFor && <ResetPasswordModal agent={resetFor} onClose={() => setResetFor(null)} isMobile={isMobile} onReset={(pwd) => { onResetPassword(resetFor.id, pwd); setResetFor(null); }} />}
    </div>
  );
}

function ResetPasswordModal({ agent, onClose, onReset, isMobile }) {
  const [pwd, setPwd] = useState("");
  const valid = pwd.trim().length >= 4;
  return (
    <ModalShell title={`Reset Password — ${agent.name}`} onClose={onClose} isMobile={isMobile}>
      <Field label="New password"><input style={S.input} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="4+ characters" /></Field>
      <button disabled={!valid} className="k-btn" style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.4 }} onClick={() => onReset(pwd.trim())}>Update Password</button>
    </ModalShell>
  );
}

/* ---------------- CALLING DASHBOARD ---------------- */
function isToday(ts) {
  if (!ts) return false;
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function sortLeads(list, sortKey) {
  const arr = [...list];
  if (sortKey === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === "reminder") arr.sort((a, b) => (a.nextActivity?.at || Infinity) - (b.nextActivity?.at || Infinity));
  else arr.sort((a, b) => b.createdAt - a.createdAt); // newest
  return arr;
}

function CallingDashboard({ me, token, leads, settings, loading, setLeads, onLogout, notify, isMobile }) {
  const [tab, setTab] = useState("home");
  const [activeLead, setActiveLead] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey] = useState("newest");
  const [q, setQ] = useState("");
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    api("/agents", { token }).then(setAgents).catch(() => {});
  }, [token]);

  const mine = leads.filter((l) => !l.removed);
  const closed = leads.filter((l) => l.removed || l.status === "converted");
  const todayLeads = mine.filter((l) => isToday(l.nextActivity?.at));
  const overdueLeads = mine.filter(isOverdue);
  const wonLeads = mine.filter((l) => l.status === "converted");
  const openLeads = mine;

  const applyFilters = (list) => {
    let out = list.filter((l) => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (q) {
        const hay = `${l.name} ${l.phone} ${l.project} ${(l.tags || []).join(" ")} ${(l.notes || []).map((n) => n.text).join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return sortLeads(out, sortKey);
  };

  const listFor = { today: todayLeads, open: openLeads, overdue: overdueLeads, won: wonLeads }[tab];
  const filtered = listFor ? applyFilters(listFor) : [];
  const todayFollowups = mine.filter((l) => l.status === "followup").length;
  const overdueCount = overdueLeads.length;

  const updateLead = async (leadId, patch) => {
    try {
      const updated = await api(`/leads/${leadId}`, { method: "PATCH", token, body: patch });
      setLeads(leads.map((l) => (l.id === leadId ? updated : l)));
    } catch (e) { notify(e.message, "err"); }
  };

  const goNextAfter = (leadId) => {
    const idx = filtered.findIndex((l) => l.id === leadId);
    const next = filtered[idx + 1];
    setActiveLead(next || null);
    if (!next) notify("Wo aakhri lead thi is list me");
  };

  const removeLead = async (leadId, reason) => {
    const lead = leads.find((l) => l.id === leadId);
    const history = [...(lead.history || []), { at: Date.now(), by: me.name, action: `Removed — "${reason}"` }];
    try {
      await api(`/leads/${leadId}`, { method: "PATCH", token, body: { removed: true, removedBy: me.username, removedByName: me.name, removedAt: Date.now(), removeReason: reason, history } });
      setLeads(leads.map((l) => (l.id === leadId ? { ...l, removed: true } : l)));
      setActiveLead(null);
      notify("Lead removed — backend has the record");
    } catch (e) { notify(e.message, "err"); }
  };

  const NAV = [
    { id: "today", label: "Today", icon: <CalendarDays size={isMobile ? 20 : 16} /> },
    { id: "open", label: "Open", icon: <LayoutGrid size={isMobile ? 20 : 16} /> },
    { id: "overdue", label: "Overdue", icon: <AlertCircle size={isMobile ? 20 : 16} /> },
    { id: "won", label: "Won", icon: <Trophy size={isMobile ? 20 : 16} /> },
    { id: "calendar", label: "Calendar", icon: <Calendar size={isMobile ? 20 : 16} /> },
  ];
  const titleFor = { home: "Home", today: "Today's Leads", open: "Open Leads", overdue: "Overdue", won: "Won Leads", calendar: "Calendar" }[tab];

  return (
    <div style={isMobile ? S.dashGridMobile : S.dashGrid}>
      {!isMobile && <Sidebar me={me} tab={tab} setTab={setTab} onLogout={onLogout} role="Calling Desk" items={NAV} onLogoClick={() => setTab("home")} />}
      {isMobile && <MobileHeader title={titleFor} onLogout={onLogout} onTitleClick={() => setTab("home")} />}

      <main style={isMobile ? S.mainMobile : S.main}>
        {tab === "home" ? (
          <HomeScreen me={me} mine={mine} todayLeads={todayLeads} closed={closed} onGo={setTab} />
        ) : tab === "calendar" ? (
          <CalendarPanel leads={mine} onOpen={setActiveLead} isMobile={isMobile} />
        ) : (
          <>
            {!isMobile && <TopBar title={titleFor} right={
              <div style={{ display: "flex", gap: 8 }}>
                {overdueCount > 0 && <span style={{ ...S.followupBadge, background: "#FDEBEA", color: "#B4231B", border: "1.5px solid #F6C6C2" }}><AlertCircle size={13} /> {overdueCount} overdue</span>}
                <span style={S.followupBadge}><Clock size={13} /> {todayFollowups} follow-up{todayFollowups !== 1 ? "s" : ""}</span>
              </div>
            } />}

            <FilterSortBar q={q} setQ={setQ} filterStatus={filterStatus} setFilterStatus={setFilterStatus} sortKey={sortKey} setSortKey={setSortKey} isMobile={isMobile} />

            {filtered.length === 0 ? (
              loading ? <SkeletonCards /> : <EmptyState text="Koi lead nahi mili yahan." />
            ) : (
              <div style={isMobile ? S.cardGridMobile : S.cardGrid}>
                {filtered.map((l, i) => (
                  <LeadCardOD
                    key={l.id} lead={l} index={i} me={me} agents={agents} waTemplate={settings.waTemplate}
                    onOpen={() => setActiveLead(l)}
                    onPatch={(patch) => updateLead(l.id, patch)}
                    onGoNext={() => goNextAfter(l.id)}
                    isLast={i === filtered.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {isMobile && <MobileTabBar items={NAV} tab={tab} setTab={setTab} onFab={null} />}

      {activeLead && (
        <LeadDetailModal lead={leads.find((l) => l.id === activeLead.id) || activeLead} waTemplate={settings.waTemplate} me={me} isAgentView isMobile={isMobile} onClose={() => setActiveLead(null)} onUpdate={(patch) => updateLead(activeLead.id, patch)} onRemove={(reason) => removeLead(activeLead.id, reason)} />
      )}
    </div>
  );
}

function HomeScreen({ me, mine, todayLeads, closed, onGo }) {
  return (
    <div className="k-fade-in">
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: FONT.display, fontSize: "clamp(20px,1.6vw,28px)", fontWeight: 700 }}>Hi, {me.name.split(" ")[0]} 👋</div>
        <div style={{ fontSize: 13, color: T.mutedDim, marginTop: 4 }}>Yahan se apni leads ka overview dekho.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button className="k-card k-btn" style={S.homeStatCard} onClick={() => onGo("open")}>
          <div><div style={S.homeStatNum}>{mine.length}</div><div style={S.homeStatLabel}>Total Leads</div></div>
          <ChevronRight size={18} color={T.mutedDim} />
        </button>
        <button className="k-card k-btn" style={S.homeStatCard} onClick={() => onGo("today")}>
          <div><div style={S.homeStatNum}>{todayLeads.length}</div><div style={S.homeStatLabel}>Today's Leads</div></div>
          <ChevronRight size={18} color={T.mutedDim} />
        </button>
        <button className="k-card k-btn" style={S.homeStatCard} onClick={() => onGo("won")}>
          <div><div style={S.homeStatNum}>{closed.length}</div><div style={S.homeStatLabel}>Archived (Won + Removed)</div></div>
          <ChevronRight size={18} color={T.mutedDim} />
        </button>
      </div>
    </div>
  );
}

function FilterSortBar({ q, setQ, filterStatus, setFilterStatus, sortKey, setSortKey, isMobile }) {
  return (
    <div style={isMobile ? S.filterBarMobile : S.filterBar}>
      <div style={S.searchBox}><Search size={15} color={T.mutedDim} /><input style={S.searchInput} placeholder="Search name, phone, project…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <select style={{ ...S.select, flex: 1 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select style={{ ...S.select, flex: 1 }} value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="newest">Sort: Newest</option>
          <option value="name">Sort: Name A-Z</option>
          <option value="reminder">Sort: Reminder soonest</option>
        </select>
      </div>
    </div>
  );
}

function CalendarPanel({ leads, onOpen, isMobile }) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = {};
  leads.forEach((l) => {
    if (!l.nextActivity?.at) return;
    const d = new Date(l.nextActivity.at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      (byDay[key] = byDay[key] || []).push(l);
    }
  });
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedLeads = selectedDay ? (byDay[selectedDay] || []) : [];
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="k-fade-in">
      <div style={S.calHeader}>
        <button className="k-icon-btn" style={S.iconBtn} onClick={() => { setCursor(new Date(year, month - 1, 1)); setSelectedDay(null); }}><ChevronLeft size={16} /></button>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16 }}>{monthLabel}</div>
        <button className="k-icon-btn" style={S.iconBtn} onClick={() => { setCursor(new Date(year, month + 1, 1)); setSelectedDay(null); }}><ChevronRight size={16} /></button>
      </div>
      <div style={S.calGrid}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={S.calDow}>{d}</div>)}
        {cells.map((d, i) => {
          const count = d ? (byDay[d] || []).length : 0;
          const isToday_ = d && new Date().getDate() === d && new Date().getMonth() === month && new Date().getFullYear() === year;
          return (
            <button key={i} disabled={!d} onClick={() => setSelectedDay(d)} style={{ ...S.calCell, ...(d ? {} : { visibility: "hidden" }), ...(selectedDay === d ? S.calCellActive : {}), ...(isToday_ && selectedDay !== d ? S.calCellToday : {}) }}>
              <span>{d}</span>
              {count > 0 && <span style={S.calDot}>{count}</span>}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{selectedDay} {monthLabel} — {selectedLeads.length} reminder{selectedLeads.length !== 1 ? "s" : ""}</div>
          {selectedLeads.length === 0 ? (
            <div style={{ fontSize: 12.5, color: T.mutedDim }}>Is din koi reminder nahi hai.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedLeads.sort((a, b) => a.nextActivity.at - b.nextActivity.at).map((l) => (
                <div key={l.id} className="k-card" style={{ ...S.leadRow, cursor: "pointer" }} onClick={() => onOpen(l)}>
                  <div style={S.rail} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.leadRowTop}><div><div style={S.leadName}>{l.name}</div><div style={S.leadPhone}>{l.phone}</div></div><span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{fmtShort(l.nextActivity.at)}</span></div>
                    <div style={S.leadRowMeta}><span>{l.project}{l.sector ? ` · ${l.sector}` : ""}</span><span style={{ color: T.mutedDim }}>{ACTIVITY_TYPES.find((a) => a.id === l.nextActivity.type)?.label}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- OneDollarCRM-style lead card ---- */
function LeadCardOD({ lead, index, me, agents, waTemplate, onOpen, onPatch, onGoNext, isLast }) {
  const meta = statusMeta(lead.status);
  const overdue = isOverdue(lead);
  const isHot = (lead.tags || []).some((t) => /hot/i.test(t));
  const lastNote = lead.notes && lead.notes.length ? lead.notes[lead.notes.length - 1].text : null;
  const msg = fillTemplate(waTemplate || DEFAULT_WA_TEMPLATE, lead);
  const daysSince = Math.max(0, Math.floor((Date.now() - lead.createdAt) / 86400000));
  const stop = (e) => e.stopPropagation();
  const logContact = (channel) => onPatch(contactLogPatch(lead, channel, me?.name));

  return (
    <div className="k-card k-fade-in" style={S.odCard} onClick={onOpen}>
      {isHot && <div style={S.hotRibbon}>HOT</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.mutedDim }}>{index + 1}.</span>
          <div style={S.odName}>{lead.name}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {overdue ? <span style={{ ...S.pill, background: "#FDEBEA", color: "#B4231B", borderColor: "#F6C6C2" }}>OVERDUE</span> : <span style={{ ...S.pill, background: meta.color + "22", color: meta.color, borderColor: meta.color + "55" }}>{meta.label}</span>}
          {onPatch && <LeadActionsMenu lead={lead} agents={agents} me={me} onPatch={onPatch} onGoNext={onGoNext} isLast={isLast} />}
        </div>
      </div>

      <div style={S.leadPhone}>{lead.phone}</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{lead.project}{lead.sector ? ` · ${lead.sector}` : ""}</span>
        {lead.estimate && <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>₹{lead.estimate}</span>}
      </div>

      <div style={S.odMetaRow}>
        <span>Lead since {daysSince}d</span>
        <span>Updated {fmtDate(lead.updatedAt)}</span>
      </div>

      {lead.tags && lead.tags.length > 0 && <TagRow tags={lead.tags} />}

      <div style={S.odInfoBox}>
        <div><div style={S.odInfoLabel}>Current Stage</div><div style={S.odInfoVal}>{meta.label}</div></div>
        <div><div style={S.odInfoLabel}>Followup Person</div><div style={S.odInfoVal}>{me?.name || "You"}</div></div>
        <div>
          <div style={S.odInfoLabel}>Next Activity</div>
          <div style={S.odInfoVal}>{lead.nextActivity ? ACTIVITY_TYPES.find((a) => a.id === lead.nextActivity.type)?.label : "—"}</div>
        </div>
        <div>
          <div style={S.odInfoLabel}>Next Reminder</div>
          <div style={{ ...S.odInfoVal, color: overdue ? T.danger : T.text }}>{lead.nextActivity && lead.nextActivity.at ? fmtShort(lead.nextActivity.at) : "—"}</div>
        </div>
      </div>

      {lastNote && <div style={S.odRecentNote}><b>Recent Notes:</b> {lastNote.length > 70 ? lastNote.slice(0, 70) + "…" : lastNote}</div>}

      <div style={S.odIconRow}>
        <div style={S.odIconItem}><CalendarClock size={16} /><span>Reminder</span></div>
        <div style={S.odIconItem}><Paperclip size={16} /><span>Notes{(lead.notes || []).length > 0 ? ` (${lead.notes.length})` : ""}</span></div>
        <div style={S.odIconItem}><Upload size={16} /><span>Files{(lead.files || []).length > 0 ? ` (${lead.files.length})` : ""}</span></div>
        <div style={S.odIconItem}><Wallet size={16} /><span>Estimate</span></div>
      </div>

      <div style={S.odActionRow} onClick={stop}>
        <a href={`tel:${lead.phone}`} onClick={() => logContact("Call")} style={{ ...S.odActionSq, background: "#2E7BD6" }}><Phone size={16} color="#fff" /></a>
        <a href={waLink(lead.phone, msg)} target="_blank" rel="noreferrer" onClick={() => logContact("WhatsApp")} style={{ ...S.odActionSq, background: "#25D366" }}><MessageCircle size={16} color="#fff" /></a>
        <a href={smsLink(lead.phone, msg)} onClick={() => logContact("SMS")} style={{ ...S.odActionSq, background: "#4CAF50" }}><Send size={16} color="#fff" /></a>
        <a href={lead.email ? `mailto:${lead.email}` : undefined} onClick={() => lead.email && logContact("Email")} style={{ ...S.odActionSq, background: lead.email ? "#2E7BD6" : T.mutedDim, pointerEvents: lead.email ? "auto" : "none" }}><Mail size={16} color="#fff" /></a>
      </div>
    </div>
  );
}


/* ---------------- SHARED CHROME ---------------- */
function Sidebar({ me, tab, setTab, onLogout, role, items, onLogoClick }) {
  return (
    <aside style={S.sidebar}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: onLogoClick ? "pointer" : "default" }} onClick={onLogoClick}>
        <Logo size={34} /><div><div style={S.brandTitleSm}>Keyzo</div><div style={S.brandSubSm}>{role}</div></div>
      </div>
      <nav style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => <button key={it.id} onClick={() => setTab(it.id)} className={`k-nav ${tab === it.id ? "k-nav-active" : ""}`} style={{ ...S.navItem, ...(tab === it.id ? S.navItemActive : {}) }}>{it.icon} {it.label}</button>)}
      </nav>
      <div style={S.sidebarFooter}>
        <div style={S.avatarCircle}>{me.name.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={S.footerName}>{me.name}</div><div style={S.footerHandle}>@{me.username}</div></div>
        <button className="k-icon-btn" style={S.iconBtn} onClick={onLogout} title="Log out"><LogOut size={15} /></button>
      </div>
    </aside>
  );
}
function MobileHeader({ title, onLogout, onTitleClick }) {
  return (
    <header style={S.mobileHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: onTitleClick ? "pointer" : "default" }} onClick={onTitleClick}><Logo size={28} /><div style={S.mobileHeaderTitle}>{title}</div></div>
      <button className="k-icon-btn" style={S.iconBtn} onClick={onLogout}><LogOut size={16} /></button>
    </header>
  );
}
function MobileTabBar({ items, tab, setTab, onFab }) {
  return (
    <nav style={S.mobileTabBar}>
      {items.map((it) => <button key={it.id} onClick={() => setTab(it.id)} style={{ ...S.mobileTabItem, color: tab === it.id ? T.accent : T.mutedDim }}>{it.icon}<span style={{ fontSize: 10.5, marginTop: 3 }}>{it.label}</span></button>)}
      {onFab && <button style={S.fab} onClick={onFab}><Plus size={22} color={T.ink} /></button>}
    </nav>
  );
}
function TopBar({ title, right }) { return <div style={S.topBar}><h1 style={S.pageTitle}>{title}</h1><div>{right}</div></div>; }
function EmptyState({ text }) { return <div className="k-fade-in" style={S.emptyState}><Building2 size={26} color={T.mutedDim} /><div style={{ marginTop: 12 }}>{text}</div></div>; }

function SkeletonRows() {
  return (
    <div style={S.tableWrap}>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="k-skeleton" style={{ height: 78, opacity: 1 - i * 0.12 }} />)}
    </div>
  );
}
function SkeletonCards() {
  return (
    <div style={S.cardGrid}>
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="k-skeleton" style={{ height: 220, opacity: 1 - (i % 3) * 0.12 }} />)}
    </div>
  );
}

/* ---------------- FORMS / MODALS ---------------- */
function LeadFormModal({ agents, onClose, onSubmit, isMobile }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", project: "", sector: "", source: SOURCES[0], assignedTo: "", estimate: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && f.phone.trim();

  return (
    <ModalShell title="Add New Lead" onClose={onClose} isMobile={isMobile}>
      <div style={S.formGrid}>
        <Field label="Name"><input style={S.input} value={f.name} onChange={set("name")} placeholder="Buyer's name" /></Field>
        <Field label="Phone"><input style={S.input} value={f.phone} onChange={set("phone")} placeholder="98xxxxxxxx" /></Field>
        <Field label="Email (optional)"><input style={S.input} value={f.email} onChange={set("email")} placeholder="name@email.com" /></Field>
        <Field label="Estimate / Budget"><input style={S.input} value={f.estimate} onChange={set("estimate")} placeholder="e.g. 45L" /></Field>
        <Field label="Project"><input style={S.input} value={f.project} onChange={set("project")} placeholder="e.g. Nirala Estate" /></Field>
        <Field label="Sector"><input style={S.input} value={f.sector} onChange={set("sector")} placeholder="e.g. Techzone 4" /></Field>
        <Field label="Source"><select style={S.select} value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Assign to"><select style={S.select} value={f.assignedTo} onChange={set("assignedTo")}><option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.username}>{a.name}</option>)}</select></Field>
      </div>
      <button disabled={!valid} style={{ ...S.primaryBtn, marginTop: 22, opacity: valid ? 1 : 0.4 }} onClick={() => onSubmit(f)}>Save Lead</button>
    </ModalShell>
  );
}

function BulkImportModal({ agents, onClose, onSubmit, isMobile }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState([]);
  const parsed = useMemo(() => {
    return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return { name: parts[0] || "", phone: parts[1] || "", project: parts[2] || "", sector: parts[3] || "", source: parts[4] || "Other" };
    }).filter((l) => l.name && l.phone);
  }, [text]);

  const toggleAgent = (username) => setSelected((s) => (s.includes(username) ? s.filter((x) => x !== username) : [...s, username]));

  return (
    <ModalShell title="Bulk Import Leads" onClose={onClose} wide isMobile={isMobile}>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 10 }}>
        Har line ek lead — format: <code style={S.code}>Name, Phone, Project, Sector, Source</code><br />
        (Project/Sector/Source optional hai, comma se separate karo)
      </div>
      <textarea style={S.textarea} rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Rahul Sharma, 9876543210, Nirala Estate, Techzone 4, 99acres\nPriya Singh, 9123456789, Supercity Mayfair"} />
      <div style={{ fontSize: 12, color: T.mutedDim, marginTop: 6 }}>{parsed.length} valid lead{parsed.length !== 1 ? "s" : ""} detected</div>

      {agents.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span style={S.detailLabel}>Distribute among (round-robin) — optional</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
            {agents.map((a) => (
              <button key={a.id} onClick={() => toggleAgent(a.username)} style={{ ...S.statusChip, borderColor: selected.includes(a.username) ? T.accent : T.hairline, background: selected.includes(a.username) ? T.accent + "22" : "transparent" }}>{a.name}</button>
            ))}
          </div>
        </div>
      )}

      <button disabled={parsed.length === 0} style={{ ...S.primaryBtn, marginTop: 22, opacity: parsed.length ? 1 : 0.4 }} onClick={() => onSubmit(parsed, selected)}>Import {parsed.length || ""} Leads</button>
    </ModalShell>
  );
}

function DistributeModal({ agents, unassignedCount, onClose, onSubmit, isMobile }) {
  const [counts, setCounts] = useState({});
  const setCount = (username, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setCounts((c) => ({ ...c, [username]: n }));
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const over = total > unassignedCount;
  const valid = total > 0 && !over;

  const submit = () => {
    const assignments = agents.map((a) => ({ username: a.username, count: counts[a.username] || 0 })).filter((x) => x.count > 0);
    onSubmit(assignments);
  };

  if (agents.length === 0) {
    return (
      <ModalShell title="Distribute Leads" onClose={onClose} isMobile={isMobile}>
        <div style={{ fontSize: 13, color: T.mutedDim }}>Pehle Team tab se calling-team login banao, tab distribute kar paoge.</div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Distribute Unassigned Leads" onClose={onClose} isMobile={isMobile}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>
        Abhi <b>{unassignedCount}</b> leads unassigned hain. Har agent ke aage batao kitni chahiye — ye pehli {unassignedCount} leads se order me nikal ke assign ho jayengi, ek-ek karke click karne ki zaroorat nahi.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {agents.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={S.avatarCircle}>{a.name.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
            <input type="number" min="0" style={{ ...S.input, width: 90, textAlign: "center", minHeight: 40 }} value={counts[a.username] || ""} onChange={(e) => setCount(a.username, e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, marginTop: 14, color: over ? T.danger : T.mutedDim, fontWeight: 600 }}>
        Total: {total} / {unassignedCount} available{over ? " — itni leads nahi hain!" : ""}
      </div>
      <button disabled={!valid} className="k-btn" style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.4 }} onClick={submit}>Distribute {total || ""} Leads</button>
    </ModalShell>
  );
}

function TemplateModal({ template, onClose, onSave, isMobile }) {
  const [t, setT] = useState(template || DEFAULT_WA_TEMPLATE);
  return (
    <ModalShell title="WhatsApp Message Template" onClose={onClose} isMobile={isMobile}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10, lineHeight: 1.7 }}>
        Ye template WhatsApp/SMS button dabane par har lead ke liye automatically personalize ho jayega. Use kar sakte ho: <code style={S.code}>{"{name}"}</code>, <code style={S.code}>{"{project}"}</code>, <code style={S.code}>{"{sector}"}</code>
      </div>
      <textarea style={S.textarea} rows={5} value={t} onChange={(e) => setT(e.target.value)} />
      <button style={{ ...S.primaryBtn, marginTop: 18 }} onClick={() => { onSave(t); onClose(); }}>Save Template</button>
    </ModalShell>
  );
}

function UserFormModal({ onClose, onSubmit, isMobile }) {
  const [f, setF] = useState({ name: "", username: "", password: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && f.username.trim() && f.password.trim().length >= 4;
  return (
    <ModalShell title="Create Calling-Team Login" onClose={onClose} isMobile={isMobile}>
      <div style={S.formGrid}>
        <Field label="Full name"><input style={S.input} value={f.name} onChange={set("name")} placeholder="Agent's name" /></Field>
        <Field label="Username"><input style={S.input} value={f.username} onChange={set("username")} placeholder="e.g. rahul.k" /></Field>
        <Field label="Password"><input style={S.input} value={f.password} onChange={set("password")} placeholder="4+ characters" /></Field>
      </div>
      <div style={{ ...S.hint, marginTop: 12, textAlign: "left" }}><KeyRound size={13} style={{ marginRight: 6, verticalAlign: -2 }} />This login works immediately on the calling dashboard.</div>
      <button disabled={!valid} style={{ ...S.primaryBtn, marginTop: 16, opacity: valid ? 1 : 0.4 }} onClick={() => onSubmit(f)}>Create Login</button>
    </ModalShell>
  );
}

function TagInput({ tags, onChange }) {
  const [val, setVal] = useState("");
  const add = () => {
    const v = val.trim();
    if (!v) return;
    if (!tags.includes(v)) onChange([...tags, v]);
    setVal("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tags.map((t, i) => (
          <span key={i} className="k-chip" style={{ ...S.tagChip, display: "inline-flex", alignItems: "center", gap: 5 }}>
            {t} <X size={11} style={{ cursor: "pointer" }} onClick={() => onChange(tags.filter((_, idx) => idx !== i))} />
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...S.input, flex: 1 }} value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Hot Lead, NRI, Budget Issue" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="k-btn" style={S.smallCtaBtn} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function LeadDetailModal({ lead, waTemplate, me, onClose, onUpdate, onRemove, isAgentView, isMobile }) {
  const [note, setNote] = useState("");
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [activityType, setActivityType] = useState(lead.nextActivity?.type || "call");
  const [activityAt, setActivityAt] = useState(lead.nextActivity?.at ? new Date(lead.nextActivity.at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [estimate, setEstimate] = useState(lead.estimate || "");
  const [fileInput, setFileInput] = useState("");
  const meta = statusMeta(lead.status);
  const msg = fillTemplate(waTemplate || DEFAULT_WA_TEMPLATE, lead);
  const actorName = me?.name || "You";
  const logContact = (channel) => onUpdate(contactLogPatch(lead, channel, actorName));

  const addNote = () => {
    if (!note.trim()) return;
    onUpdate({ notes: [...(lead.notes || []), { text: note.trim(), at: Date.now() }] });
    setNote("");
  };
  const setStatus = (id) => onUpdate({ status: id, history: [...(lead.history || []), { at: Date.now(), by: actorName, action: `Status → ${statusMeta(id).label}` }] });
  const saveActivity = () => {
    const at = activityAt ? new Date(activityAt).getTime() : null;
    onUpdate({ nextActivity: at ? { type: activityType, at } : null, history: [...(lead.history || []), { at: Date.now(), by: actorName, action: at ? `Next activity set: ${ACTIVITY_TYPES.find((a) => a.id === activityType)?.label} on ${fmtShort(at)}` : "Next activity cleared" }] });
  };
  const saveEstimate = () => onUpdate({ estimate });
  const addFile = () => {
    if (!fileInput.trim()) return;
    onUpdate({ files: [...(lead.files || []), fileInput.trim()] });
    setFileInput("");
  };
  const saveTags = (tags) => onUpdate({ tags });

  return (
    <ModalShell title={lead.name} onClose={onClose} wide isMobile={isMobile}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ ...S.pill, background: meta.color + "22", color: meta.color, borderColor: meta.color + "55" }}>{meta.label}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 13, color: T.muted }}>{lead.phone}</span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <a href={`tel:${lead.phone}`} onClick={() => logContact("Call")} style={S.odActionBtn}><Phone size={14} /></a>
          <a href={waLink(lead.phone, msg)} target="_blank" rel="noreferrer" onClick={() => logContact("WhatsApp")} style={{ ...S.odActionBtn, background: "#25D366", color: "#fff" }}><MessageCircle size={14} /></a>
          <a href={smsLink(lead.phone, msg)} onClick={() => logContact("SMS")} style={S.odActionBtn}><Send size={14} /></a>
          {lead.email && <a href={`mailto:${lead.email}`} onClick={() => logContact("Email")} style={S.odActionBtn}><Mail size={14} /></a>}
        </div>
      </div>

      <div style={S.detailGrid}>
        <div><span style={S.detailLabel}>Project</span>{lead.project || "—"}</div>
        <div><span style={S.detailLabel}>Sector</span>{lead.sector || "—"}</div>
        <div><span style={S.detailLabel}>Source</span>{lead.source || "—"}</div>
        <div><span style={S.detailLabel}>Added</span>{fmtDate(lead.createdAt)}</div>
      </div>

      <div style={{ marginTop: 20 }}><span style={S.detailLabel}><TagIcon size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Tags</span><TagInput tags={lead.tags || []} onChange={saveTags} /></div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}>Update status</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
          {STATUS.map((s) => <button key={s.id} onClick={() => setStatus(s.id)} style={{ ...S.statusChip, borderColor: s.id === lead.status ? s.color : T.hairline, color: s.id === lead.status ? s.color : T.muted, background: s.id === lead.status ? s.color + "18" : "transparent" }}>{s.label}</button>)}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}><CalendarClock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Next Activity & Reminder</span>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select style={S.select} value={activityType} onChange={(e) => setActivityType(e.target.value)}>{ACTIVITY_TYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
          <input style={{ ...S.input, flex: 1, minWidth: 180 }} type="datetime-local" value={activityAt} onChange={(e) => setActivityAt(e.target.value)} />
          <button className="k-btn" style={S.smallCtaBtn} onClick={saveActivity}>Save</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}><Wallet size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Estimate / Budget</span>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input style={{ ...S.input, flex: 1 }} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 45L" />
          <button className="k-btn" style={S.smallCtaBtn} onClick={saveEstimate}>Save</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}><Paperclip size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Files</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {(lead.files || []).length === 0 && <div style={{ color: T.mutedDim, fontSize: 12.5 }}>No files noted yet.</div>}
          {(lead.files || []).map((f, i) => <div key={i} style={{ fontSize: 12.5, color: T.text, background: T.panelAlt, borderRadius: 8, padding: "7px 10px" }}>{f}</div>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input style={{ ...S.input, flex: 1 }} value={fileInput} onChange={(e) => setFileInput(e.target.value)} placeholder="File name or link" onKeyDown={(e) => e.key === "Enter" && addFile()} />
          <button className="k-btn" style={S.smallCtaBtn} onClick={addFile}>Add</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}>Notes / call log</span>
        <div style={S.notesList}>
          {(lead.notes || []).length === 0 && <div style={{ color: T.mutedDim, fontSize: 13 }}>No notes yet.</div>}
          {(lead.notes || []).slice().reverse().map((n, i) => <div key={i} style={S.noteItem}><div>{n.text}</div><div style={S.noteTime}>{fmtDateTime(n.at)}</div></div>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Add a call note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
          <button className="k-btn" style={S.smallCtaBtn} onClick={addNote}>Add</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <span style={S.detailLabel}>History</span>
        <div style={S.historyList}>{(lead.history || []).slice().reverse().map((h, i) => <div key={i} style={S.historyItem}><span style={{ color: T.mutedDim }}>{fmtDateTime(h.at)}</span> — {h.action} <span style={{ color: T.mutedDim }}>({h.by})</span></div>)}</div>
      </div>

      {isAgentView && onRemove && (
        <div style={{ marginTop: 22, borderTop: `1px solid ${T.hairline}`, paddingTop: 18 }}>
          {!removing ? (
            <button style={S.dangerBtn} onClick={() => setRemoving(true)}><Trash2 size={14} /> Remove this lead</button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Reason — this saves to the backend record.</div>
              <input style={S.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not interested / Wrong number" />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={S.dangerBtn} disabled={!reason.trim()} onClick={() => onRemove(reason.trim())}>Confirm Remove</button>
                <button style={S.smallBtn} onClick={() => setRemoving(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/* ---------------- LEAD ACTIONS (3-dot menu) ---------------- */
function LeadActionsMenu({ lead, agents, me, isMobile, onPatch, onGoNext, isLast }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // 'edit' | 'lost' | 'transfer' | 'activity'
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markWon = () => {
    onPatch({ status: "converted", history: [...(lead.history || []), { at: Date.now(), by: me?.name || "You", action: "Marked as Won" }] });
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button className="k-icon-btn" style={S.dotsBtn} onClick={() => setOpen((o) => !o)}><MoreVertical size={16} /></button>
      {open && (
        <div style={S.dotsMenu}>
          <button style={S.dotsItem} onClick={() => { setModal("edit"); setOpen(false); }}><Pencil size={14} /> Edit Lead</button>
          <button style={S.dotsItem} onClick={markWon}><CheckCircle2 size={14} color={T.success} /> Mark as Won</button>
          <button style={S.dotsItem} onClick={() => { setModal("lost"); setOpen(false); }}><XCircle size={14} color={T.danger} /> Mark as Lost</button>
          {agents && agents.length > 0 && <button style={S.dotsItem} onClick={() => { setModal("transfer"); setOpen(false); }}><ArrowLeftRight size={14} /> Transfer Lead</button>}
          <button style={S.dotsItem} onClick={() => { setModal("activity"); setOpen(false); }}><History size={14} /> Client Activity</button>
        </div>
      )}

      {modal === "edit" && <EditLeadModal lead={lead} onClose={() => setModal(null)} isMobile={isMobile} onSave={(patch) => { onPatch(patch); setModal(null); }} />}
      {modal === "lost" && <LostFormModal lead={lead} onClose={() => setModal(null)} isMobile={isMobile} me={me} onConfirm={(patch) => onPatch(patch)} onNext={() => { setModal(null); onGoNext && onGoNext(); }} isLast={isLast} />}
      {modal === "transfer" && <TransferModal lead={lead} agents={agents} onClose={() => setModal(null)} isMobile={isMobile} me={me} onTransfer={(patch) => { onPatch(patch); setModal(null); }} />}
      {modal === "activity" && <ActivityLogModal lead={lead} onClose={() => setModal(null)} isMobile={isMobile} />}
    </div>
  );
}

function EditLeadModal({ lead, onClose, onSave, isMobile }) {
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);
  const [email, setEmail] = useState(lead.email || "");
  const valid = name.trim() && phone.trim();
  return (
    <ModalShell title="Edit Lead" onClose={onClose} isMobile={isMobile}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Name"><input style={S.input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input style={S.input} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email (optional)"><input style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
      <button disabled={!valid} className="k-btn" style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.4 }} onClick={() => onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() })}>Save Changes</button>
    </ModalShell>
  );
}

function LostFormModal({ lead, onClose, onConfirm, onNext, isMobile, me, isLast }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const submit = () => {
    if (!reason.trim()) return;
    onConfirm({ status: "not_interested", lostReason: reason.trim(), history: [...(lead.history || []), { at: Date.now(), by: me?.name || "You", action: `Marked as Lost — "${reason.trim()}"` }] });
    setDone(true);
  };
  return (
    <ModalShell title="Mark as Lost" onClose={onClose} isMobile={isMobile}>
      {!done ? (
        <>
          <div style={S.detailGrid}>
            <div><span style={S.detailLabel}>Client Name</span>{lead.name}</div>
            <div><span style={S.detailLabel}>Phone</span>{lead.phone}</div>
          </div>
          <div style={{ marginTop: 18 }}>
            <span style={S.detailLabel}>Reason</span>
            <textarea style={{ ...S.textarea, marginTop: 8 }} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bought elsewhere, budget mismatch, not interested…" />
          </div>
          <button disabled={!reason.trim()} className="k-btn" style={{ ...S.dangerBtn, width: "100%", justifyContent: "center", marginTop: 18, opacity: reason.trim() ? 1 : 0.4 }} onClick={submit}>Confirm — Mark as Lost</button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={30} color={T.success} />
          <div style={{ fontFamily: FONT.display, fontSize: 16, fontWeight: 700, marginTop: 10 }}>Marked as Lost</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>Reason saved to this lead's activity log.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="k-btn" style={{ ...S.smallBtn, flex: 1, borderColor: T.hairline, color: T.muted }} onClick={onClose}>Close</button>
            {!isLast && <button className="k-btn" style={{ ...S.smallCtaBtn, flex: 1 }} onClick={onNext}>Next Lead →</button>}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function TransferModal({ lead, agents, onClose, onTransfer, isMobile, me }) {
  const [target, setTarget] = useState("");
  const options = (agents || []).filter((a) => a.username !== lead.assignedTo);
  return (
    <ModalShell title="Transfer Lead" onClose={onClose} isMobile={isMobile}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>{lead.name} ko kis agent ko transfer karna hai?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((a) => (
          <button key={a.username} style={{ ...S.dotsItem, border: `1.5px solid ${target === a.username ? T.accent : T.hairline}`, borderRadius: 10, background: target === a.username ? T.accent + "18" : "transparent" }} onClick={() => setTarget(a.username)}>
            <div style={S.avatarCircle}>{a.name.slice(0, 1).toUpperCase()}</div> {a.name}
          </button>
        ))}
        {options.length === 0 && <div style={{ fontSize: 12.5, color: T.mutedDim }}>Koi aur agent available nahi hai.</div>}
      </div>
      <button disabled={!target} className="k-btn" style={{ ...S.primaryBtn, opacity: target ? 1 : 0.4 }} onClick={() => onTransfer({ assignedTo: target, history: [...(lead.history || []), { at: Date.now(), by: me?.name || "You", action: `Transferred to ${options.find((a) => a.username === target)?.name || target}` }] })}>Transfer</button>
    </ModalShell>
  );
}

function ActivityLogModal({ lead, onClose, isMobile }) {
  const combined = [
    ...(lead.history || []).map((h) => ({ at: h.at, text: h.action, by: h.by, kind: "history" })),
    ...(lead.notes || []).map((n) => ({ at: n.at, text: n.text, by: "", kind: "note" })),
  ].sort((a, b) => b.at - a.at);
  return (
    <ModalShell title={`Activity — ${lead.name}`} onClose={onClose} isMobile={isMobile}>
      {combined.length === 0 ? (
        <div style={{ fontSize: 13, color: T.mutedDim }}>Koi activity record nahi hai abhi.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
          {combined.map((e, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${e.kind === "note" ? T.accent : T.hairline}`, paddingLeft: 12 }}>
              <div style={{ fontSize: 13, color: T.text }}>{e.kind === "note" ? "📝 " : ""}{e.text}</div>
              <div style={{ fontSize: 11, color: T.mutedDim, marginTop: 2 }}>{fmtDateTime(e.at)}{e.by ? ` · ${e.by}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}


function ModalShell({ title, onClose, children, wide, isMobile }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div className={isMobile ? "k-sheet-in" : "k-modal-in"} style={isMobile ? { ...S.sheet } : { ...S.modal, ...(wide ? { maxWidth: 640 } : {}) }} onClick={(e) => e.stopPropagation()}>
        {isMobile && <div style={S.sheetGrabber} />}
        <div style={S.modalHeader}><h2 style={S.modalTitle}>{title}</h2><button className="k-icon-btn" style={S.iconBtn} onClick={onClose}><X size={16} /></button></div>
        <div style={{ padding: isMobile ? "16px 20px 28px" : "22px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div><label style={S.label}>{label}</label>{children}</div>; }

/* ---------------- THEME — black / white / yellow ---------------- */
const T = {
  bg: "#FFFFFF", ink: "#0A0A0A", panel: "#FFFFFF", panelAlt: "#F5F5F5", hairline: "#E7E7E7",
  text: "#0A0A0A", muted: "#5C5C5C", mutedDim: "#9A9A9A", accent: "#FFD400",
  success: "#1F9254", warn: "#C77E12", danger: "#D8433C",
};
const FONT = { display: "'Sora', system-ui, sans-serif", body: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", mono: "'JetBrains Mono', 'Courier New', monospace" };

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body { margin: 0; }
      ::selection { background: ${T.accent}66; }
      input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 1px; }
      input::placeholder, textarea::placeholder { color: ${T.mutedDim}; }
      select { -webkit-appearance: none; appearance: none; }

      .k-card { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
      .k-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); border-color: #D8D8D8; }
      .k-card:active { transform: translateY(0); }

      .k-btn { transition: transform .1s ease, opacity .15s ease, box-shadow .15s ease; }
      .k-btn:hover { opacity: .92; box-shadow: 0 4px 14px rgba(255,212,0,.35); }
      .k-btn:active { transform: scale(.97); }

      .k-nav { transition: background .15s ease, color .15s ease, padding-left .15s ease; }
      .k-nav:hover:not(.k-nav-active) { background: rgba(255,255,255,.06); color: #fff; padding-left: 16px; }

      .k-icon-btn { transition: background .15s ease, border-color .15s ease, transform .1s ease; }
      .k-icon-btn:hover { background: ${T.panelAlt}; border-color: #D8D8D8; }
      .k-icon-btn:active { transform: scale(.94); }

      .k-chip { transition: transform .1s ease, box-shadow .15s ease; }
      .k-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }

      .k-fade-in { animation: kFadeIn .25s ease; }
      @keyframes kFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

      .k-toast { animation: kToastIn .25s cubic-bezier(.2,.8,.2,1); }
      @keyframes kToastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }

      .k-sheet-in { animation: kSheetIn .22s ease; }
      @keyframes kSheetIn { from { transform: translateY(24px); opacity: .6; } to { transform: translateY(0); opacity: 1; } }
      .k-modal-in { animation: kModalIn .18s ease; }
      @keyframes kModalIn { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }

      .k-spin { animation: kSpin .8s linear infinite; }
      @keyframes kSpin { to { transform: rotate(360deg); } }

      .k-skeleton { background: linear-gradient(90deg, #EFEFEF 25%, #F7F7F7 50%, #EFEFEF 75%); background-size: 200% 100%; animation: kShimmer 1.4s ease infinite; border-radius: 12px; }
      @keyframes kShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

      @media (prefers-reduced-motion: reduce) { *, .k-card, .k-btn, .k-nav, .k-icon-btn, .k-chip { animation: none !important; transition: none !important; } }
    `}</style>
  );
}

const S = {
  appShell: { height: "100vh", background: T.bg, fontFamily: FONT.body, color: T.text, display: "flex", flexDirection: "column", overflow: "hidden" },
  loginWrap: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" },
  loginCard: { width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 32px", background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,.06)" },
  brandTitle: { fontFamily: FONT.display, fontWeight: 700, fontSize: 28, letterSpacing: -0.5, marginTop: 18 },
  brandTitleSm: { fontFamily: FONT.display, fontWeight: 700, fontSize: 18, letterSpacing: -0.3 },
  brandSub: { fontSize: 12.5, color: T.mutedDim, marginTop: 5, letterSpacing: 0.3 },
  brandSubSm: { fontSize: 11, color: T.mutedDim, marginTop: 2, letterSpacing: 0.3 },
  label: { display: "block", fontSize: 11.5, color: T.mutedDim, marginBottom: 7, fontWeight: 600, textAlign: "left", letterSpacing: 0.3, textTransform: "uppercase" },
  input: { width: "100%", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 15, fontFamily: FONT.body, minHeight: 46 },
  textarea: { width: "100%", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: "12px 14px", color: T.text, fontSize: 13.5, fontFamily: FONT.mono, resize: "vertical" },
  eyeBtn: { position: "absolute", right: 6, top: 6, background: "none", border: "none", color: T.mutedDim, cursor: "pointer", padding: 10 },
  errBox: { display: "flex", alignItems: "center", gap: 6, color: T.danger, fontSize: 12.5, marginTop: 12, textAlign: "left" },
  primaryBtn: { width: "100%", marginTop: 26, background: T.accent, color: T.ink, border: "none", borderRadius: 999, padding: "14px 16px", fontWeight: 700, fontSize: 14.5, letterSpacing: 0.2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48, boxShadow: "0 2px 10px rgba(255,212,0,.25)" },
  hint: { marginTop: 26, fontSize: 12, color: T.mutedDim, lineHeight: 1.7 },
  code: { background: T.panelAlt, padding: "1px 6px", borderRadius: 4, fontFamily: FONT.mono, color: T.text },
  toast: { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", border: `1.5px solid ${T.accent}`, borderRadius: 999, padding: "10px 20px", fontSize: 13, boxShadow: "0 10px 30px rgba(0,0,0,.25)", zIndex: 60, whiteSpace: "nowrap" },
  dashGrid: { display: "flex", flex: 1, height: "100%", width: "100%", justifyContent: "center", overflow: "hidden" },
  dashGridMobile: { display: "flex", flexDirection: "column", flex: 1, minHeight: "100vh" },
  sidebar: { width: 232, height: "100%", flexShrink: 0, background: T.ink, color: "#fff", padding: "28px 20px", display: "flex", flexDirection: "column", overflowY: "auto" },
  navItem: { display: "flex", alignItems: "center", gap: 11, background: "none", border: "none", color: "#B5B5B5", padding: "11px 12px", borderRadius: 10, fontSize: 13.5, fontFamily: FONT.body, fontWeight: 500, cursor: "pointer", textAlign: "left" },
  navItemActive: { background: T.accent, color: T.ink, fontWeight: 700 },
  sidebarFooter: { marginTop: "auto", display: "flex", alignItems: "center", gap: 10, paddingTop: 18, borderTop: "1px solid #262626" },
  footerName: { fontSize: 13, color: "#fff", fontWeight: 600 },
  footerHandle: { fontSize: 11, color: "#8A8A8A" },
  avatarCircle: { width: 36, height: 36, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontWeight: 700, fontSize: 14, color: T.ink, flexShrink: 0 },
  iconBtn: { background: "none", border: `1.5px solid ${T.hairline}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, cursor: "pointer", flexShrink: 0 },
  mobileHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: T.ink, color: "#fff", position: "sticky", top: 0, zIndex: 20 },
  mobileHeaderTitle: { fontFamily: FONT.display, fontSize: 17, fontWeight: 700, color: "#fff" },
  mobileTabBar: { position: "sticky", bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-around", background: T.ink, padding: "8px 8px calc(8px + env(safe-area-inset-bottom))", zIndex: 20 },
  mobileTabItem: { display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", padding: "6px 14px", cursor: "pointer", minWidth: 56 },
  fab: { position: "absolute", right: 16, top: -22, width: 48, height: 48, borderRadius: "50%", background: T.accent, border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(255,212,0,.4)", cursor: "pointer" },
  main: { flex: 1, height: "100%", padding: "30px 36px", overflowY: "auto", width: "100%", maxWidth: 1440, margin: "0 auto" },
  mainMobile: { flex: 1, minHeight: 0, padding: "18px 16px 24px", overflowY: "auto", width: "100%" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26, flexWrap: "wrap", gap: 10 },
  pageTitle: { fontFamily: FONT.display, fontSize: "clamp(20px, 1.6vw, 30px)", fontWeight: 700, margin: 0, letterSpacing: -0.3 },
  ctaBtn: { display: "flex", alignItems: "center", gap: 6, background: T.accent, color: T.ink, border: "none", borderRadius: 999, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  followupBadge: { display: "flex", alignItems: "center", gap: 6, background: "#FFF7D6", color: "#8A5C00", border: "1.5px solid #FFE68A", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 },
  followupBadgeMobile: { display: "flex", alignItems: "center", gap: 6, background: "#FFF7D6", color: "#8A5C00", border: "1.5px solid #FFE68A", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 600 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 26 },
  statGridMobile: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 },
  statCard: { background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 14, padding: "18px 18px" },
  statIcon: { marginBottom: 12 },
  statValue: { fontFamily: FONT.display, fontSize: "clamp(20px, 1.8vw, 30px)", fontWeight: 700 },
  statLabel: { fontSize: 11.5, color: T.mutedDim, marginTop: 3, letterSpacing: 0.2 },
  panel: { background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 14, padding: 22 },
  panelTitle: { fontFamily: FONT.display, fontSize: 16, fontWeight: 700 },
  filterBar: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" },
  filterBarMobile: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  searchBox: { display: "flex", alignItems: "center", gap: 9, background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: "11px 14px", flex: 1, minWidth: 180 },
  searchInput: { flex: 1, background: "none", border: "none", color: T.text, fontSize: 14, outline: "none", minHeight: 22 },
  select: { background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, fontFamily: FONT.body, minHeight: 40 },
  tableWrap: { display: "flex", flexDirection: "column", gap: 8 },
  leadRow: { display: "flex", alignItems: "flex-start", gap: 14, background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 14, padding: "16px 18px", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  rail: { width: 3, alignSelf: "stretch", background: T.accent, borderRadius: 2, flexShrink: 0 },
  leadRowTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  leadRowMeta: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.muted, marginTop: 5 },
  leadName: { fontSize: 15, fontWeight: 700, color: T.text },
  leadPhone: { fontFamily: FONT.mono, fontSize: 12, color: T.muted, marginTop: 2 },
  credRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 },
  credChip: { fontFamily: FONT.mono, fontSize: 11, background: T.panelAlt, border: `1px solid ${T.hairline}`, borderRadius: 6, padding: "3px 8px", color: T.text },
  pill: { fontSize: 10.5, fontWeight: 700, padding: "5px 11px", borderRadius: 999, border: "1.5px solid", whiteSpace: "nowrap", letterSpacing: 0.2 },
  tagChip: { fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: T.ink, color: T.accent },
  assignSelect: { width: "100%", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 12.5, minHeight: 38 },
  smallBtn: { background: "none", border: "1.5px solid", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 },
  cardGridMobile: { display: "flex", flexDirection: "column", gap: 10 },
  odCard: { background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 16, padding: 18, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.04)", position: "relative", overflow: "hidden" },
  hotRibbon: { position: "absolute", top: 14, right: -34, background: T.danger, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 36px", transform: "rotate(45deg)", letterSpacing: 1 },
  odName: { fontSize: 16, fontWeight: 700, color: T.text },
  odMetaRow: { display: "flex", justifyContent: "space-between", fontSize: 11, color: T.mutedDim, marginTop: 6, fontStyle: "italic" },
  odInfoBox: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", background: T.panelAlt, borderRadius: 10, padding: "10px 12px", marginTop: 10 },
  odInfoLabel: { fontSize: 9.5, color: T.mutedDim, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 },
  odInfoVal: { fontSize: 12.5, fontWeight: 600, marginTop: 2 },
  odRecentNote: { fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.5 },
  odIconRow: { display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.hairline}` },
  odIconItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: T.mutedDim, fontSize: 9.5, fontWeight: 600, flex: 1 },
  odActionRow: { display: "flex", gap: 8, marginTop: 14 },
  odActionSq: { flex: 1, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" },
  odActionBtn: { width: 36, height: 36, borderRadius: "50%", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink, textDecoration: "none", flexShrink: 0 },
  dotsBtn: { width: 30, height: 30, borderRadius: 8, background: "none", border: `1.5px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, cursor: "pointer", flexShrink: 0 },
  dotsMenu: { position: "absolute", top: 36, right: 0, background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.14)", padding: 6, minWidth: 190, zIndex: 40, display: "flex", flexDirection: "column", gap: 2 },
  dotsItem: { display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: T.text, cursor: "pointer", textAlign: "left", width: "100%" },
  smallCtaBtn: { background: T.accent, color: T.ink, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", minHeight: 44, flexShrink: 0 },
  perfCard: { background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 16, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,.04)" },
  homeStatCard: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 16, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,.04)", width: "100%", textAlign: "left", cursor: "pointer" },
  homeStatNum: { fontFamily: FONT.display, fontSize: 28, fontWeight: 700, color: T.text },
  homeStatLabel: { fontSize: 12.5, color: T.mutedDim, marginTop: 2 },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },
  calDow: { textAlign: "center", fontSize: 11, color: T.mutedDim, fontWeight: 700, padding: "4px 0" },
  calCell: { position: "relative", aspectRatio: "1", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, cursor: "pointer", color: T.text },
  calCellActive: { background: T.ink, color: "#fff", borderColor: T.ink },
  calCellToday: { borderColor: T.accent, borderWidth: 2 },
  calDot: { position: "absolute", bottom: 4, fontSize: 8.5, fontWeight: 800, background: T.accent, color: T.ink, borderRadius: 999, padding: "0 4px", minWidth: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: "50%", background: T.panelAlt, border: `1.5px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  rankGold: { background: "#FFD400", color: T.ink, border: "none" },
  rankSilver: { background: "#D9D9D9", color: T.ink, border: "none" },
  rankBronze: { background: "#E3B27A", color: T.ink, border: "none" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 20px", color: T.mutedDim, fontSize: 13.5, textAlign: "center", background: T.panelAlt, border: `1.5px dashed ${T.hairline}`, borderRadius: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(10,10,10,.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", background: "#fff", border: `1.5px solid ${T.hairline}`, borderRadius: 18, boxShadow: "0 30px 80px rgba(0,0,0,.3)", margin: "auto" },
  sheet: { width: "100%", maxHeight: "92vh", overflowY: "auto", background: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: "0 -10px 40px rgba(0,0,0,.25)" },
  sheetGrabber: { width: 40, height: 4, borderRadius: 2, background: T.hairline, margin: "10px auto 0" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1.5px solid ${T.hairline}` },
  modalTitle: { fontFamily: FONT.display, fontSize: 18, fontWeight: 700, margin: 0 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13.5 },
  detailLabel: { display: "block", fontSize: 10.5, color: T.mutedDim, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 },
  statusChip: { border: "1.5px solid", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "none", minHeight: 34 },
  notesList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 140, overflowY: "auto", marginTop: 8 },
  noteItem: { background: T.panelAlt, borderRadius: 10, padding: "10px 12px", fontSize: 13 },
  noteTime: { fontSize: 10.5, color: T.mutedDim, marginTop: 4 },
  historyList: { display: "flex", flexDirection: "column", gap: 7, maxHeight: 120, overflowY: "auto", marginTop: 8, fontSize: 11.5, color: T.muted },
  historyItem: { borderLeft: `2px solid ${T.hairline}`, paddingLeft: 9 },
  dangerBtn: { display: "flex", alignItems: "center", gap: 6, background: "none", border: `1.5px solid ${T.danger}`, color: T.danger, borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44 },
};
