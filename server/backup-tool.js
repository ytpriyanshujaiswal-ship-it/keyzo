/**
 * Keyzo backup / migration tool.
 *
 *   node backup-tool.js status                  -> kitne users/leads hain, data kahan hai
 *   node backup-tool.js export backup.json      -> poora data ek file me nikalo (backup)
 *   node backup-tool.js import backup.json      -> file se data wapas daalo (khaali database me)
 *   node backup-tool.js import backup.json --force   -> database me data ho tab bhi overwrite
 *
 * Ye usi storage pe kaam karta hai jis pe server chalta hai:
 *   DATABASE_URL set ho to Postgres pe, warna local db.json pe.
 *
 * Purani local db.json ko online database me bhejne ke liye:
 *   DATABASE_URL="postgres://..." node backup-tool.js import db.json
 */
const fs = require("fs");
const { createStore } = require("./store");

async function main() {
  const [cmd, file, ...flags] = process.argv.slice(2);
  const force = flags.includes("--force");
  const store = createStore({ dataDir: __dirname });
  await store.init();

  try {
    if (cmd === "status") {
      const c = await store.counts();
      console.log(`Storage: ${store.mode} (${store.where})`);
      console.log(`${c.users} users, ${c.leads} leads`);
    } else if (cmd === "export" && file) {
      const data = await store.exportAll();
      fs.writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2));
      console.log(`Backup ban gaya: ${file} (${data.users.length} users, ${data.leads.length} leads)`);
    } else if (cmd === "import" && file) {
      const doc = JSON.parse(fs.readFileSync(file, "utf-8"));
      const users = Array.isArray(doc.users) ? doc.users.length : 0;
      const leads = Array.isArray(doc.leads) ? doc.leads.length : 0;
      if (!users) throw new Error("Is file me users nahi mile — kya ye sahi backup/db.json hai?");
      const cur = await store.counts();
      if (cur.leads > 0 && !force) {
        throw new Error(`Database me pehle se ${cur.leads} leads hain. Overwrite karna hai to command ke end me --force lagao.`);
      }
      await store.replaceAll(doc);
      console.log(`Import ho gaya: ${users} users, ${leads} leads → ${store.mode} (${store.where})`);
    } else {
      console.log("Use: node backup-tool.js status | export <file> | import <file> [--force]");
      process.exitCode = 1;
    }
  } finally {
    await store.close();
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
