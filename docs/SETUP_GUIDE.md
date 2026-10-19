# Mayapuri Stock — Setup guide (for a non-technical person)

You will do this **once**, on a laptop or computer (about 45 minutes). Everything is free and needs **no credit/debit card**.

What you need: a Google account (Gmail), and the unzipped project folder.

---

## Step 1 — Make free accounts
1. **GitHub**: go to https://github.com → *Sign up* (free).
2. **Vercel**: go to https://vercel.com → *Sign Up* → *Continue with GitHub*. Choose the **Hobby (free)** plan.

## Step 2 — Create the Firebase project (the database + login)
1. Go to https://console.firebase.google.com and sign in with Google.
2. Click **Create a project** → name it `mayapuri-stock` → Continue. Turn **Google Analytics OFF** → Create project.
3. Leave it on the free **Spark** plan. Never click "Upgrade".

## Step 3 — Create the database
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: choose **asia-south1 (Mumbai)**. *(Cannot be changed later.)*
3. Choose **Start in production mode** → Create.

## Step 4 — Turn on sign-in
1. Left menu: **Build → Authentication → Get started**.
2. **Google** → Enable → pick your support email → Save.
3. **Email/Password** → Enable. Also switch ON **Email link (passwordless sign-in)** → Save.

## Step 5 — Put in the security rules  ⚠ most important step
1. Open the file `firestore.rules` from the project folder in Notepad.
2. Find this line near the top and put **your father's Gmail** (all small letters) in place of `owner@example.com`:
   `function ownerEmail() { return 'owner@example.com'; }`
3. Select **everything** in the file, copy it.
4. Firebase → **Firestore Database → Rules** tab → delete what is there → paste → **Publish**.

The person with this email becomes the **Owner**. Nobody else can ever become owner.

## Step 6 — Get the 6 connection values
1. Firebase → click the **gear ⚙ → Project settings**.
2. Scroll to **Your apps** → click the **`</>` (Web)** icon → nickname `stock-web` → **Register app** (do not tick Hosting).
3. You will see `firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." }`. Keep this page open — you need these 6 values in Step 8.

## Step 7 — Put the code on GitHub
1. On https://github.com click **+ → New repository** → name `mayapuri-stock` → **Private** → Create.
2. Unzip the project folder on your computer.
3. On the new repository page click **uploading an existing file**. Open the unzipped folder, select **everything inside it** (not the folder itself) and drag into the browser. Wait until all files are listed → **Commit changes**.
   *(If a folder like `src` is missing afterwards, upload it again by dragging that folder.)*

## Step 8 — Publish with Vercel
1. https://vercel.com → **Add New → Project** → pick `mayapuri-stock` → **Import**.
2. Framework should say **Vite**. Open **Environment Variables** and add these 6 (name exactly as written, value from Step 6, without quotes):

| Name | Value from firebaseConfig |
|---|---|
| `VITE_FIREBASE_API_KEY` | apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
| `VITE_FIREBASE_PROJECT_ID` | projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `VITE_FIREBASE_APP_ID` | appId |

3. Click **Deploy**. After a minute you get an address like `mayapuri-stock.vercel.app`. That is your app.

## Step 9 — Allow that address to sign in
Firebase → **Authentication → Settings → Authorized domains → Add domain** → type `mayapuri-stock.vercel.app` (your real Vercel address, without `https://`) → Add.

## Step 10 — First login (owner)
Open your Vercel address in Chrome on the owner's phone → **Sign in with Google** using the **owner email from Step 5**. You land in the app as **Owner** (you will see a *Suppliers* tab).

## Step 11 — Load your stock diary data
1. Open the app → **More → Import**.
2. Choose **Stock** → **Choose file** → select `STOCK_MANAGEMENT_MAYAPURI.xlsx` (a copy is in the `sample-data` folder).
3. It shows e.g. **25 new, 0 skipped, 0 invalid** and the supplier columns it found. Check, then **Confirm import**.
4. Then choose **Supplier names** → same file, sheet *Supplier* → Confirm.
Your sheet's columns (one per supplier) are stored as "stock held from each supplier".

## Step 12 — Install on every phone
1. Open the Vercel address in **Chrome** on the phone.
2. Chrome menu **⋮ → Install app** (or *Add to Home screen*). Or **More → Install app on this phone**.
3. The app icon appears on the home screen. Install it **while online once**; after that it opens offline too.

## Step 13 — Invite the 2 staff
Owner: **More → Staff & invites** → type name + Gmail → **Send invite**. Staff open the app, sign in with **that same Gmail** → they are in. To remove someone: **Remove** (works immediately).

---

## Free limits (Firebase Spark plan — check the Firebase pricing page for current numbers)
About 1 GB of data, 50,000 reads and 20,000 writes per day. A shop with a few hundred items and 3 phones is far below this. The app stops working for the day only if limits are exceeded (it never charges, because no card is attached).

## Free database alternatives I considered
| Option | Free tier | Why not chosen |
|---|---|---|
| **Firebase Firestore (chosen)** | 1 GB, no card, always on | Live sync + offline + login built in |
| Supabase | 500 MB database | Free projects pause after about a week of no use; offline needs extra code |
| Appwrite Cloud | free starter plan | Offline sync is not built in |
| PocketBase / self-hosting | free software | Needs a server you must keep running |

## Back-ups
Once a month: **More → Export & template** → download Stock, Supplier prices and History. Keep them in Google Drive.

## If something goes wrong
* **"Firebase settings are missing"** → a Vercel variable is missing/mistyped (Step 8). Fix it → *Deployments → Redeploy*.
* **"This website address is not yet allowed"** → Step 9.
* **"No access"** → that email was not invited (Step 13) or is not the owner email in the rules (Step 5).
* **Email link opens in the browser instead of the app** → use *Sign in with Google* on phones; it is more reliable.
* **After you change rules or code** → rules: paste and Publish again. Code: upload changed files to GitHub; Vercel redeploys by itself.
