/**
 * Keyzo backend — ek office ke liye chhota self-contained server.
 *
 * Data kahan save hota hai (store.js dekho):
 *   - DATABASE_URL set hai  -> Postgres database (online hosting ke liye, data kabhi nahi udta)
 *   - DATABASE_URL set nahi -> db.json file (sirf apne PC pe local chalane ke liye)
 *
 * Run:  npm install   phir   npm start
 */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createStore, onHostedPlatform } = require("./store");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Online deploy karte waqt JWT_SECRET env variable me apna lamba random secret daalo.
const JWT_SECRET = process.env.JWT_SECRET || "keyzo-local-office-secret-2026";
const PORT = process.env.PORT || 4000;

const store = createStore({ dataDir: __dirname });

// async route me error aaye to Express ko pass karo (warna request latak jaati hai)
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_WA_TEMPLATE =
  "Hi {name}, this is regarding your interest in {project} {sector}. Let us know a good time to talk. Thank you!";

async function seedAdmin() {
  if (await store.getUserByUsername("login@proptech")) return;
  await store.addUser({
    id: "U-" + Date.now(),
    username: "login@proptech",
    password: "Proptech1234",
    passwordHash: bcrypt.hashSync("Proptech1234", 10),
    role: "backend",
    name: "Backend Admin",
    createdAt: Date.now(),
    active: true,
  });
  console.log("Seeded default backend login: login@proptech / Proptech1234");
}

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

app.get("/api/health", (req, res) => res.json({ ok: true, name: "Keyzo", storage: store.mode }));

app.post(
  "/api/login",
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    const u = await store.getUserByUsername(username);
    if (!u || !bcrypt.compareSync(String(password || ""), u.passwordHash)) {
      return res.status(401).json({ error: "Username ya password galat hai." });
    }
    if (u.active === false) return res.status(403).json({ error: "Ye account deactivate hai." });
    const token = jwt.sign({ id: u.id, username: u.username, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: u.id, username: u.username, role: u.role, name: u.name } });
  })
);

app.get("/api/me", auth, (req, res) => res.json(req.user));

// Lightweight agent directory (names/usernames only) so both backend and
// calling-team users can transfer a lead to a colleague.
app.get(
  "/api/agents",
  auth,
  ah(async (req, res) => {
    const users = await store.listUsers();
    res.json(users.filter((u) => u.role === "calling" && u.active !== false).map((u) => ({ username: u.username, name: u.name })));
  })
);

/* ---- Users (backend-only management) ---- */
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  password: u.password || "",
  role: u.role,
  name: u.name,
  createdAt: u.createdAt,
  active: u.active !== false,
});

app.get(
  "/api/users",
  auth,
  requireBackend,
  ah(async (req, res) => {
    res.json((await store.listUsers()).map(publicUser));
  })
);

app.post(
  "/api/users",
  auth,
  requireBackend,
  ah(async (req, res) => {
    const { name, username, password } = req.body || {};
    if (!name || !username || !password || String(password).length < 4) {
      return res.status(400).json({ error: "Name, username, aur 4+ character password chahiye." });
    }
    const u = {
      id: "U-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      username: String(username).trim(),
      password,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "calling",
      name,
      createdAt: Date.now(),
      active: true,
    };
    try {
      await store.addUser(u);
    } catch (e) {
      if (e.code === "DUPLICATE_USERNAME") return res.status(409).json({ error: "Ye username pehle se hai." });
      throw e;
    }
    res.json(publicUser(u));
  })
);

app.patch(
  "/api/users/:id",
  auth,
  requireBackend,
  ah(async (req, res) => {
    const patch = {};
    if (typeof req.body.active === "boolean") patch.active = req.body.active;
    if (req.body.password && String(req.body.password).length >= 4) {
      patch.password = req.body.password;
      patch.passwordHash = bcrypt.hashSync(String(req.body.password), 10);
    }
    const u = await store.patchUser(req.params.id, patch);
    if (!u) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  })
);

/* ---- Leads ---- */
app.get(
  "/api/leads",
  auth,
  ah(async (req, res) => {
    res.json(await store.listLeads(req.user.role === "backend" ? undefined : req.user.username));
  })
);

app.post(
  "/api/leads",
  auth,
  requireBackend,
  ah(async (req, res) => {
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
    await store.addLeads([lead]);
    res.json(lead);
  })
);

app.patch(
  "/api/leads/:id",
  auth,
  ah(async (req, res) => {
    const lead = await store.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Not found" });
    if (req.user.role !== "backend" && lead.assignedTo !== req.user.username) {
      return res.status(403).json({ error: "Ye lead aapko assign nahi hai." });
    }
    const patch = { ...req.body };
    delete patch.id; // lead ki ID kabhi badalni nahi chahiye
    patch.updatedAt = Date.now();
    const updated = await store.patchLead(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  })
);

// Bulk import — backend pastes many leads at once, optionally auto-distributed
// round-robin across chosen agents.
app.post(
  "/api/leads/bulk",
  auth,
  requireBackend,
  ah(async (req, res) => {
    const { leads, distributeAmong } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: "No leads provided" });
    const created = leads.map((raw, i) => {
      const assignedTo = distributeAmong && distributeAmong.length ? distributeAmong[i % distributeAmong.length] : raw.assignedTo || "";
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
    await store.addLeads(created);
    res.json({ count: created.length, leads: created });
  })
);

/* ---- Shared settings (e.g. WhatsApp message template) ---- */
app.get(
  "/api/settings",
  auth,
  ah(async (req, res) => {
    res.json((await store.getSettings()) || { waTemplate: DEFAULT_WA_TEMPLATE });
  })
);
app.put(
  "/api/settings",
  auth,
  requireBackend,
  ah(async (req, res) => {
    res.json(await store.patchSettings(req.body || {}));
  })
);

// error handler: server crash/latak jaane ke bajaye saaf JSON error
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: err.expose ? err.message : "Server me dikkat aayi, thodi der baad dobara try karo." });
});

/* ---- start ---- */
async function main() {
  // Online hosting (Render etc.) pe file-storage ka matlab hai ki data har restart pe ud jaata hai.
  // Isliye bina database ke start hi nahi hone dete — chupchaap data khone se behtar hai ki saaf error aaye.
  if (store.mode === "file" && onHostedPlatform() && !process.env.DATA_DIR && process.env.ALLOW_EPHEMERAL_STORAGE !== "1") {
    console.error(
      [
        "",
        "============================================================",
        " STOP: Is hosting pe DATABASE_URL set nahi hai.",
        " Bina database ke data HAR RESTART PE UD JAYEGA.",
        "",
        " Fix: ek free Postgres (jaise Neon) banao aur uska connection",
        " string yahan Environment Variable DATABASE_URL me daalo.",
        " Steps README.txt me likhe hain.",
        "============================================================",
        "",
      ].join("\n")
    );
    process.exit(1);
  }

  await store.init();
  await seedAdmin();
  const counts = await store.counts();

  const server = app.listen(PORT, () => {
    console.log(`Keyzo backend running → http://localhost:${PORT}`);
    console.log(`Storage: ${store.mode} (${store.where}) — ${counts.users} users, ${counts.leads} leads loaded`);
  });

  const shutdown = async (sig) => {
    console.log(`${sig} mila, band kar rahe hain...`);
    server.close();
    try { await store.close(); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("Startup fail:", e);
  process.exit(1);
});
