KEYZO BACKEND — SETUP (v2: data ab kabhi nahi udta)

DATA KYUN UD RAHA THA?
Render ke free server ki file-disk temporary hoti hai. Server restart ho,
redeploy ho, ya 15 min koi use na kare aur wo sleep ho jaye — har baar
db.json mit jati thi, aur server sirf default login ke saath naya shuru hota tha.

AB KYA BADLA?
Data ab ek alag permanent database (Postgres) me save hota hai. Server
kuch bhi kare (restart / sleep / redeploy), data wahin safe rehta hai.
App (frontend) me koi change nahi karna.


=========================================================
A) ONLINE (Render) — ek baar ka setup, ~10 minute
=========================================================

1. neon.com pe free account banao (card nahi maangta).
   New Project banao (region: Singapore, India ke sabse paas).

2. Project ke dashboard me "Connect" dabao aur Connection String copy karo.
   Wo "postgresql://..." se shuru hoti hai.
   (Render ka apna free Postgres mat lena — wo 30 din me expire ho jata hai.)

3. Render dashboard -> apna keyzo-server service -> "Environment" ->
   Add Environment Variable:

      DATABASE_URL  =  (Neon se copy ki hui connection string)

   Recommended (optional): ek aur variable
      JWT_SECRET    =  koi bhi lamba random text (30+ characters)
   (JWT_SECRET badalne par sab ek baar logout honge, bas.)

   Ye string secret hai — isko kabhi GitHub me mat daalna, sirf Render me.

4. Is folder ki files apne GitHub repo ke server folder me replace/upload karo:
      index.js   store.js   backup-tool.js   package.json
   Repo me purani package-lock.json ho to usko delete kar do.
   Commit karte hi Render khud redeploy karega. (Build Command: npm install)

5. Render ke Logs me ye line dikhni chahiye:
      Storage: postgres (...) — 1 users, 0 leads loaded
   Agar "STOP: Is hosting pe DATABASE_URL set nahi hai" dikhe, to step 3
   dobara check karo (variable ka naam bilkul DATABASE_URL hona chahiye).

6. Test: app me login karo, ek lead add karo, phir Render me service
   restart karo (ya 15-20 min chhod do). Wapas aao — lead wahin milegi.

NOTE: Render free service 15 min idle rehne par sleep ho jati hai, aur
pehla request ~1 minute le sakta hai. Data safe rehta hai, bas pehli
baar khulne me der lagti hai.


=========================================================
B) LOCAL (apne PC pe)
=========================================================

   cd server
   npm install
   npm start

DATABASE_URL set na ho to data "server/db.json" me save hota hai.
Ab ye pehle se safer hai: file aadhi-adhuri kabhi nahi likhi jaati, aur
"server/backups" folder me automatic backups bante rehte hain. Agar
db.json kharab ho jaye to server khud sabse naye backup se wapas le leta hai.

Default login:
   Username: login@proptech
   Password: Proptech1234


=========================================================
C) PURANA DATA ONLINE BHEJNA (agar kisi db.json me hai)
=========================================================

Windows PowerShell:
   $env:DATABASE_URL="postgresql://..."
   node backup-tool.js import db.json

Mac / Linux:
   DATABASE_URL="postgresql://..." node backup-tool.js import db.json

(Database me pehle se leads hon to ye roknga; jaan-boojhkar overwrite
karna ho to end me --force lagao.)


=========================================================
D) BACKUP LENA
=========================================================

   DATABASE_URL="postgresql://..." node backup-tool.js export backup.json

Poora data (users + leads + settings) backup.json me aa jayega.
Wapas daalne ke liye: node backup-tool.js import backup.json --force
Dekhne ke liye (kitne users/leads hain): node backup-tool.js status
