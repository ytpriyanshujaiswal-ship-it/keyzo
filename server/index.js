/**
 * Keyzo backend — a small self-contained server for one office.
 * Stores everything in db.json next to this file (fine for
 * 10-30 logins and thousands of leads — no external database needed).
 *
 * Run with:  npm install   then   npm start
 * Server runs on http://localhost:4000
 */
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const DB_PATH = path.join(__dirname, "db.json");
// Local-network secret. Fine for an office LAN tool; if you ever expose
// this server to the public internet, replace this with a real secret
// kept out of source control.
const JWT_SECRET = "keyzo-local-office-secret-2026";

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], leads: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// seed the first backend login on first boot
(function seed() {
  const db = readDB();
  if (!db.users.some((u) => u.username.toLowerCase() === "login@proptech")) {
    db.users.push({
      id: "U-" + Date.now(),
      username: "login@proptech",
      password: "Proptech1234",
      passwordHash: bcrypt.hashSync("Proptech1234", 10),
      role: "backend",
      name: "Backend Admin",
      createdAt: Date.now(),
      active: true,
    });
    writeDB(db);
    console.log("Seeded default backend login: login@proptech / Proptech1234");
  }
})();

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired, please log in again." });
  }
}
function requireBackend(req, res, next) {
  if (req.user.role !== "backend") return res.status(403).json({ error: "Backend access only" });
  next();
}

app.get("/api/health", (req, res) => res.json({ ok: true, name: "Keyzo" }));

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const u = db.users.find((x) => x.username.toLowerCase() === String(username || "").trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ""), u.passwordHash)) {
    return res.status(401).json({ error: "Username ya password galat hai." });
  }
  if (u.active === false) return res.status(403).json({ error: "Ye account deactivate hai." });
  const token = jwt.sign({ id: u.id, username: u.username, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id: u.id, username: u.username, role: u.role, name: u.name } });
});

app.get("/api/me", auth, (req, res) => res.json(req.user));

// Lightweight agent directory (names/usernames only) so both backend and
// calling-team users can transfer a lead to a colleague.
app.get("/api/agents", auth, (req, res) => {
  const db = readDB();
  res.json(db.users.filter((u) => u.role === "calling" && u.active !== false).map((u) => ({ username: u.username, name: u.name })));
});

/* ---- Users (backend-only management) ---- */
app.get("/api/users", auth, requireBackend, (req, res) => {
  const db = readDB();
  res.json(db.users.map((u) => ({ id: u.id, username: u.username, password: u.password || "", role: u.role, name: u.name, createdAt: u.createdAt, active: u.active !== false })));
});

app.post("/api/users", auth, requireBackend, (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password || String(password).length < 4) {
    return res.status(400).json({ error: "Name, username, aur 4+ character password chahiye." });
  }
  const db = readDB();
  if (db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) {
    return res.status(409).json({ error: "Ye username pehle se hai." });
  }
  const u = {
    id: "U-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    username,
    password,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "calling",
    name,
    createdAt: Date.now(),
    active: true,
  };
  db.users.push(u);
  writeDB(db);
  res.json({ id: u.id, username: u.username, password: u.password, role: u.role, name: u.name, createdAt: u.createdAt, active: true });
});

app.patch("/api/users/:id", auth, requireBackend, (req, res) => {
  const db = readDB();
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "Not found" });
  if (typeof req.body.active === "boolean") u.active = req.body.active;
  if (req.body.password && String(req.body.password).length >= 4) {
    u.password = req.body.password;
    u.passwordHash = bcrypt.hashSync(req.body.password, 10);
  }
  writeDB(db);
  res.json({ ok: true });
});

/* ---- Leads ---- */
app.get("/api/leads", auth, (req, res) => {
  const db = readDB();
  if (req.user.role === "backend") return res.json(db.leads);
  res.json(db.leads.filter((l) => l.assignedTo === req.user.username));
});

app.post("/api/leads", auth, requireBackend, (req, res) => {
  const db = readDB();
  const lead = {
    id: "L-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: req.body.name || "",
    phone: req.body.phone || "",
    project: req.body.project || "",
    sector: req.body.sector || "",
    source: req.body.source || "Other",
    assignedTo: req.body.assignedTo || "",
    status: "new",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notes: [],
    history: [{ at: Date.now(), by: req.user.name, action: "Lead created" }],
    removed: false,
  };
  db.leads.unshift(lead);
  writeDB(db);
  res.json(lead);
});

app.patch("/api/leads/:id", auth, (req, res) => {
  const db = readDB();
  const lead = db.leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: "Not found" });
  if (req.user.role !== "backend" && lead.assignedTo !== req.user.username) {
    return res.status(403).json({ error: "Ye lead aapko assign nahi hai." });
  }
  Object.assign(lead, req.body, { updatedAt: Date.now() });
  writeDB(db);
  res.json(lead);
});

// Bulk import — backend pastes many leads at once, optionally auto-distributed
// round-robin across chosen agents.
app.post("/api/leads/bulk", auth, requireBackend, (req, res) => {
  const { leads, distributeAmong } = req.body || {};
  if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: "No leads provided" });
  const db = readDB();
  const created = leads.map((raw, i) => {
    const assignedTo = distributeAmong && distributeAmong.length ? distributeAmong[i % distributeAmong.length] : (raw.assignedTo || "");
    return {
      id: "L-" + Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2, 5),
      name: raw.name || "",
      phone: raw.phone || "",
      project: raw.project || "",
      sector: raw.sector || "",
      source: raw.source || "Other",
      assignedTo,
      status: "new",
      tags: [],
      estimate: "",
      nextActivity: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notes: [],
      history: [{ at: Date.now(), by: req.user.name, action: assignedTo ? `Imported & assigned to ${assignedTo}` : "Imported" }],
      removed: false,
    };
  });
  db.leads = [...created, ...db.leads];
  writeDB(db);
  res.json({ count: created.length, leads: created });
});

/* ---- Shared settings (e.g. WhatsApp message template) ---- */
app.get("/api/settings", auth, (req, res) => {
  const db = readDB();
  res.json(db.settings || { waTemplate: "Hi {name}, this is regarding your interest in {project} {sector}. Let us know a good time to talk. Thank you!" });
});
app.put("/api/settings", auth, requireBackend, (req, res) => {
  const db = readDB();
  db.settings = { ...(db.settings || {}), ...req.body };
  writeDB(db);
  res.json(db.settings);
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Keyzo backend running → http://localhost:${PORT}`);
});
