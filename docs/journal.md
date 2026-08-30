# Journal de développement — YEELEN AgriConnect

Historique daté des correctifs, décisions techniques et chantiers livrés.
Extrait de `CLAUDE.md` le 2026-08-28 pour alléger le contexte chargé à chaque session.

---

### Calendrier & Récoltes — now backed by the database (fixed 2026-08-13)

Both modules used to be pure `localStorage` (`agri-calendar-${farmId}` / `agri-recoltes-${farmId}`, `farmId` = the logged-in user's email) — see the browser-pass entry above for why that was a real multi-tenant bug, not just a nice-to-have. Fixed by extending the schema and following the exact remote-with-local-fallback pattern `AchatModule` already established (`App.jsx:1086-1214`: try the API, fall back to `storageGet`/`storageSet` only if the network call itself fails — keeps the app usable offline without it being the primary store):
- **`calendar_events`** — new table (`server/src/db/migrate.js`), `entreprise_id`/`user_id`/`date`/`type`/`title`/`description`. New `server/src/routes/calendar.js` (`GET`/`POST` only — the UI has no edit/delete, so neither does the route).
- **`recoltes`** — turned out to already exist as an **orphaned table** (confirmed via `\d recoltes` in the live DB and `grep`ping every route file: zero queries against it anywhere), alongside an equally-orphaned `cultures` catalog table (`recoltes.culture_id` FKs to it) — both leftovers from an earlier architecture, abandoned once the app settled on `parcelles.culture` as free text. Reused rather than shadowed with a same-purpose table under a different name: extended it with `user_id`/`parcelle`/`culture`/`qualite`/`destination` columns to match what the `HarvestsModule` form actually captures; `culture_id`/`unite`/`observations` (pre-existing columns) stay unused. New `server/src/routes/recoltes.js`, same `GET`/`POST`-only shape.
- `AgriculturalCalendarModule` and `HarvestsModule` in `App.jsx` rewired accordingly (`getCalendarEvents`/`createCalendarEvent`, `getRecoltes`/`createRecolte` in `src/lib/api.js`, writes go through `safeRequest` for the existing offline-queue mechanism). Verified via the browser: created one of each as the test entreprise, confirmed both rows landed correctly `entreprise_id`-scoped via direct `psql` queries, then cleaned up along with the rest of the test data.
- Not addressed, out of scope for this fix: neither module has an edit/delete UI today (so neither do the new routes) — add both if that UI need ever comes up. Both `HarvestsModule` and the Cultures/Poulailler achat forms also silently no-op on a missing required field with no visible error (confirmed hitting this on `Destination` while testing) — a pre-existing UX rough edge, not unique to these two modules, not touched here.

### Traçabilité parcelle → récolte → vente (added 2026-08-13)

Gap-analysis against mature agricultural ERPs (des ERP agricoles établis (Agrivi, Cropio)...) found Récoltes/Devis/Finances were disconnected islands — no way to tell which parcelle's harvest a given sale came from. Full context and the two options considered are in memory `project_tracabilite_parcelle_vente`; the user picked the lightweight option (nullable FK tags, no stock/quantity enforcement) over building real lot-depletion tracking, deliberately deferring the latter until the Devis state machine has a stable production track record.

**Investigation finding that simplified the work**: the app has two superficially-parallel "vente" code paths — `cultures_mouvements`/`MovementTab` and `devis_lignes`/`DevisModule` — but only the second is actually live. `MovementTab` (`App.jsx:174-549`) and `createCulturesMouvement`/`updateCulturesMouvement`/`deleteCulturesMouvement` (`src/lib/api.js`) are dead code: imported/defined but never rendered or called anywhere. Both Cultures' and Poulailler's "Ventes" tabs render `<VentesWithDevis>` → `DevisModule`, so `devis_lignes` was the only real anchor point needed.

- `recoltes.parcelle_id` (nullable FK → `parcelles.id`) and `devis_lignes.recolte_id` (nullable FK → `recoltes.id`) added in `server/src/db/migrate.js`. The pre-existing free-text `recoltes.parcelle` column is kept alongside `parcelle_id` for display/fallback, not replaced.
- **Tenant-isolation validation added on both new FKs** — `server/src/routes/recoltes.js`'s `POST /` and `server/src/routes/devis.js`'s `POST /`/`PUT /:id` (via a shared `validerRecolteIds` helper in `devis.js`) verify the referenced `parcelle`/`recolte` actually belongs to `req.user.entrepriseId` before storing the id, silently storing `null` otherwise rather than erroring — mirrors the seriousness the codebase already gives this class of bug (see the `achats_lignes` cross-tenant deletion hole documented above). Verified with real cross-tenant curl calls (two throwaway entreprises, one token per company): a devis ligne referencing another company's `recolteId`, and a récolte referencing another company's `parcelleId`, both came back `null` in the response and in the DB — no leak, no 500.
- Frontend: `HarvestsModule`'s "Parcelle" field is now a `<Select>` sourced from `getParcelles()` (with an "Autre parcelle" free-text fallback) instead of a free-text `Field`, and `DevisModule`'s per-ligne form gained an optional "Récolte liée" `<Select>` sourced from `getRecoltes()`. Both mirror `AchatModule`'s existing fournisseur-dropdown pattern (`App.jsx:1116-1125` load, `~1307-1316` JSX, `~1136-1138` derived display name) verbatim rather than inventing a new one. The devis detail modal resolves `ligne.recolteId` against the already-loaded `recoltes` list and shows a small "🌾 Parcelle A — 13/08/2026" line under the product name when set — traceability that's actually visible, not just stored.
- Accepted limitation: `DevisModule` has no `moduleType` prop (unlike `AchatModule`), so the "Récolte liée" dropdown shows up even when creating a devis from the Poulailler screen, where it's simply not relevant/usable. Not fixed — would need threading a prop through `VentesWithDevis` for no real benefit yet.

### Navigation — sticky header, and a `category` field prepping future grouping (added 2026-08-13)

User feedback (real product/design opinion, not a bug report): the top nav is 15 flat chips (`availableTabs`) that already wrap to 2-3 rows and, worse, weren't pinned — scrolling into any module's content lost access to switching tabs entirely, forcing a scroll back to the top every time. Compared unfavorably to des ERP établis (SAP Business One, NetSuite), which group nav into a sidebar/mega-menu and always keep it reachable.

Two changes, deliberately scoped to **not** change the visible layout beyond making it pinned (a real IA redesign — sidebar, grouped mega-menu — was explicitly deferred until there's real usage data to base groupings on):
- **`category` field added to every `availableTabs` entry** (`App.jsx`, `~line 4269`) — `'operations'` (Calendrier/Récoltes/Cultures/Poulailler/Notifications/Observations), `'analyse'` (Assistant IA/Prévisions/Rapports), `'commercial'` (Clients/Fournisseurs), `'finance'` (Finances), `'rh'` (Employés), or `null` for Accueil/Profil. **Nothing reads this field yet** — pure data-prep so a future grouped-nav UI (sidebar or otherwise) is a rendering change on top of already-categorized data, not a data-modeling change bundled with a risky visual redesign.
- **Header made `position: sticky`**: the topbar + online/sync-status row + the nav-chip row were restructured into one shared sticky wrapper (previously the nav-chip row lived inside `dashboard-shell`, a separate, non-sticky sibling — moved to render inside the same wrapper as the topbar, conditioned on `screen === 'dashboard'`, so all three stay pinned together without needing to hand-calculate stacked `top` offsets for multiple independent sticky elements).
  - **Real bug hit and fixed along the way**: `.topbar`'s `backdrop-filter: blur(10px)` (paired with `background: rgba(255,255,255,0.96)`) caused a genuine Chromium rendering glitch once the element became `position: sticky` — inconsistent/stale paints during scroll (topbar appearing to detach, render at the wrong vertical position, or leave blank gaps), reproduced via automated scrolling and confirmed via `getBoundingClientRect()` mismatches against what was actually painted. This is a known bug class (`backdrop-filter` + `position: sticky` compositing in Chromium). Fixed by dropping `backdrop-filter` and making the background fully opaque (`#FFFFFF`) — the blur was pointless anyway once the whole sticky header got its own solid `COLORS.bg` background from the wrapper.
  - Verified via real scrolling (both the module-selection screen and actual dashboard/module content) after the fix: header stays correctly pinned, no repaint artifacts, tab-switching works mid-scroll, `npm test` still green.

### `Card` silently dropped `onClick` — broke selecting anything but the first Client/Fournisseur (fixed 2026-08-13)

User-reported: in Clients, clicking any card other than the first did nothing — the detail panel on the right never updated. Root cause in `src/components/ui.jsx`: `export function Card({ children, style })` only destructured `children`/`style` and forwarded neither `onClick` nor any other prop to the underlying `<div>` — so `<Card onClick={() => setSelectedId(client.id)}>` (`ClientsModule`, `App.jsx`) silently did nothing on every card. The *first* client only ever appeared selected because `ClientsModule`'s load effect auto-selects `loaded[0].id` on mount — not because clicking worked.

Same copy-pasted pattern, same bug, in `FournisseursModule` (`App.jsx`) — confirmed and fixed identically. Grepped for any other `<Card ... onClick` usage in `App.jsx`; these two were the only ones (everything else that needs click behavior already uses `<button>`/`<Button>`, which do handle `onClick` correctly).

Fixed by widening `Card`'s signature to `{ children, style, ...rest }` and spreading `{...rest}` onto the `<div>` — mirrors the pattern `Button` in the same file already uses (`{...rest}`), so `Card` now transparently forwards `onClick` and anything else callers pass, instead of only the two props someone happened to need when it was first written. Verified with 3 throwaway clients and 2 fournisseurs: clicking any non-first card now updates the detail panel and its selection border correctly.

### Hosting/HTTPS — deployable config ready, going live still blocked on the user (2026-08-13)

User decided the approach: a VPS (**DigitalOcean**, chosen over a managed PaaS like Railway/Render specifically to reuse the existing docker-compose stack as-is) with **Caddy** in front for automatic HTTPS (zero-config Let's Encrypt — no manual certbot). No domain picked yet, so nothing is actually deployed publicly; what's below is prepared and locally verified, waiting on the user to create the DigitalOcean account/Droplet and buy a domain — account creation and purchases aren't something to do on someone's behalf.

- **`docker-compose.prod.yml`** (new, override file — `docker-compose.yml` itself is untouched) — adds a `caddy` service (image `caddy:2-alpine`, publishes `80`/`443`, persists Let's Encrypt state in `caddy_data`/`caddy_config` named volumes so certs survive restarts and don't hit Let's Encrypt's rate limits), and strips the direct host-port publishing from `db`/`backend`/`frontend` so only Caddy is reachable from outside the Droplet — otherwise the raw HTTP backend/frontend and even Postgres itself would still be sitting open on the public internet, defeating the point of adding HTTPS. Removing a list-typed key (`ports:`) in a Compose override needs the `!reset []` tag (plain `ports: []` does **not** work — verified empirically: Compose's default list-merge behavior left the base ports untouched, silently). Local dev is unaffected: plain `docker-compose up` (no `-f docker-compose.prod.yml`) still publishes `5433`/`4000`/`8090` exactly as before.
- **`Caddyfile`** (new) — routes `/api/*` to `backend:4000`, everything else to `frontend:80`, both under one `{$DOMAIN}` (env var, set in `.env` once a domain exists). Putting frontend and backend on the same public origin means production `VITE_API_URL` becomes `https://<domain>/api` — frontend and backend share an origin in prod, sidestepping the cross-origin `cors()`-wide-open situation that exists in local dev (`:8090` vs `:4000`) rather than needing to lock CORS down separately.
- **Verified locally** (`DOMAIN=localhost docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d`, then torn back down): Caddy started, correctly fell back to its internal local CA for TLS (expected — Let's Encrypt only works for real publicly-resolvable domains, so this is what confirms the config is right without owning a domain yet), HTTP→HTTPS redirect returned `308`, the frontend served over HTTPS returned `200`, and `POST /api/auth/login` through `/api/*` reached the real Express backend (confirmed via its actual JSON error body, not a Caddy-level error page). Confirmed `db`/`backend`/`frontend` no longer had any `ports:` block in the merged config. Afterward, reverted to plain `docker-compose up` and confirmed `:8090`/`:4000` both serve normally again — no regression to local dev.
- **Deploy command once there's a Droplet + domain**: `DOMAIN=<domain> docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` (with `.env`/`server/.env` populated with real prod values, `DOMAIN=<domain>` added to the root `.env`, and `VITE_API_URL=https://<domain>/api` for the frontend build arg).
- **Still needed from the user, in order**: (1) create a DigitalOcean account + Droplet (Ubuntu, smallest plan is enough to start), (2) buy a domain and point its DNS `A` record at the Droplet's IP, (3) install Docker/Docker Compose on the Droplet and clone the repo there, (4) fill in `.env`/`server/.env` with real production secrets. Happy to walk through each step live once the user's ready — didn't pre-write a detailed step-by-step here since exact steps depend on choices not made yet (Droplet region, registrar).

### `observations` table now created by `migrate.js` (fixed 2026-08-13)

Closed the process gap flagged repeatedly above: the `CREATE TABLE observations` statement (already FK-fixed to `users`, not `utilisateurs`) from `migrations/001_create_observations_table.sql` is now folded directly into `server/src/db/migrate.js`. Any environment that runs the documented migration command gets this table automatically now — no more manual `psql -f` step. Verified by rebuilding the backend image and re-running `migrate.js` against the dev DB: succeeded with no error (idempotent — the table already existed from the earlier manual fix, so this mainly confirms the `CREATE TABLE`/FK syntax is valid, which is what matters for a genuinely fresh database). `migrations/001_create_observations_table.sql` itself is now superseded/historical, not deleted.

### "Configurer votre entreprise" — reappears every login until admin/directeur actually validates it (fixed 2026-08-13, corrected same day)

User-reported: after finishing (or skipping) the post-registration "Configurer votre entreprise" onboarding screen (banques/salariés wizard, `screen === 'onboarding-choice'` in `App.jsx`), it kept coming back on every subsequent login and every page reload — forever, not just for new entreprises.

**First attempt was wrong, corrected the same day after clarifying the actual requirement with the user.** The initial fix persisted a one-time "done" flag in `localStorage` (`agri-onboarding-done`) — any exit from the wizard (skip or complete) marked it permanently done and it never showed again. That's not what was actually wanted: the real spec is (a) only **admin**/**directeur** should ever see this screen, never other roles, and (b) it should keep reappearing **every login** until the entreprise's banking and staffing setup is genuinely resolved — either real data exists, or the director explicitly confirms it isn't needed. A one-time browser flag can't express "resolved" as an ongoing fact about the entreprise, and `localStorage` is scoped to one browser anyway — the same director logging in from a second device would wrongly see it again. Landed on a fully server-driven design instead, per explicit user instruction ("tout doit passer par le serveur").

- **`entreprises.banque_non_requise` / `entreprises.salarie_non_requis`** (both `BOOLEAN NOT NULL DEFAULT FALSE`, `server/src/db/migrate.js`) — explicit "I don't need this" confirmations, one per wizard step.
- **`server/src/routes/entreprise.js`**: `GET /onboarding-status` (any authenticated user of the entreprise) computes `{ banqueOk, salarieOk }` — `banqueOk` = at least one row in `banques` for the entreprise **OR** `banque_non_requise`; `salarieOk` = at least one non-`Inactif` row in `salaries` **OR** `salarie_non_requis`. `PUT /onboarding-status` (`requireRole('admin', 'directeur')`, same gate as the `finances` write routes) sets either flag, `COALESCE`-style partial update like the existing `PUT /entreprise` in the same file. `src/lib/api.js` wrappers: `getOnboardingStatus()`, `updateOnboardingStatus(payload)`.
- **`App.jsx`**: new shared `checkOnboardingNeeded(uiRole)` helper (called from both `handleAuth` and the mount-time token-check effect, replacing the old `storageGet`/`storageSet` calls) — for any role other than `admin`/`directeur` it sets `isOnboarding(false)` **without calling the API at all** (verified via the browser's network tab: zero requests to `/entreprise/onboarding-status` when logged in as `ouvrier`); for admin/directeur it fetches the real status and sets `isOnboarding(!(banqueOk && salarieOk))`. `goToDashboard` no longer marks anything as done — completion is recomputed fresh from the server on every login, not memorized at exit, which is exactly what makes "Plus tard" naturally mean "ask me again next time" instead of "never ask again."
- The wizard's two "Passer cette étape" buttons (`onboarding-banques`, `onboarding-salaries`) were relabeled into real, persisted confirmations instead of silent skips: **"Je n'ai pas de compte bancaire (caisse uniquement)"** calls `updateOnboardingStatus({ banqueNonRequise: true })`, **"Je travaille seul, pas de salarié à ajouter"** calls `updateOnboardingStatus({ salarieNonRequis: true })` — both before advancing to the next screen. The "Suivant"/"Terminer" buttons are untouched: if the director adds a real bank account or employee through `BanquesModule`/`EmployeesModule` on those same screens, `banqueOk`/`salarieOk` are already `true` next login purely from the real data, no confirmation click needed.
- Verified end-to-end with throwaway entreprises: fresh admin registration → wizard shown → clicked both confirmation buttons → `psql` confirmed both columns flipped to `true` → reload and explicit logout/login both skipped the wizard. Repeated via direct API calls with a *second* throwaway entreprise using real data instead of confirmations (`POST /api/banques` + `POST /api/salaries`, no confirmation calls) — `GET /onboarding-status` still correctly returned `{banqueOk:true, salarieOk:true}`. Created an `ouvrier`-role employee login in the first entreprise and confirmed logging in as them lands straight on the dashboard with no wizard and no `/onboarding-status` network call. All test data cleaned up after.

### Employés — coordonnées de contact + formulaire de modification (fixed 2026-08-13)

User-reported: impossible to edit an already-registered employee's info at all. Root cause: `EmployeesModule` (`App.jsx`) had an "Ajouter un employé" form and a list, but the list only ever had a delete (`Trash2`) button — no edit UI existed, even though `PUT /api/salaries/:id` already worked server-side. On top of that, the user specifically wanted contact fields (email/téléphone/adresse) added, which didn't exist in the `salaries` schema at all before this fix.

- **`salaries.email` / `salaries.telephone` / `salaries.adresse`** (all nullable `TEXT`, `server/src/db/migrate.js`) — the employee's *personal* contact info, distinct from the login-account email on `users` (joined via `entreprise_utilisateurs`).
- **`server/src/routes/salaries.js`**: `SALARIE_COLUMNS` extended with `s.email, s.telephone, s.adresse`; the pre-existing joined login-account email (`u.email`) renamed from `email` to `compteEmail` in the SELECT alias to avoid a name collision with the new personal `email` column — this also required renaming the account-creation request field in `POST /` (was `email`, now `compteEmail`) so "create a login for this employee" and "this employee's personal email" can't be confused in the request body. `POST /` and `PUT /:id` both now accept/persist `email`, `telephone`, `adresse`.
- **`src/App.jsx` (`EmployeesModule`)**: add-form gained "Email personnel"/"Téléphone"/"Adresse" fields (and its account-creation email field was relabeled "Email de connexion", bound to `form.compteEmail`). A real edit flow was built from scratch: a gear-shaped (`Settings2`, chosen deliberately over the codebase's usual `PencilLine` pencil icon — user explicitly asked for a non-pencil alternative, offered a few options via `AskUserQuestion`, they picked the gear) button per employee row opens a modal pre-filled with all fields (including the new contact ones) and saves via `updateSalarie` (id, payload) — the first real caller of that function, which had been imported but dead code until now. The employee-list row display was updated to show `emp.telephone`/`emp.email` (personal) and, separately, `emp.compteEmail` prefixed "Connexion :" when the employee has a linked login account.
- Verified end-to-end, both via direct API calls and a real browser click-through (throwaway entreprise, cleaned up after): created an employee with all three contact fields via the UI, confirmed they saved and displayed correctly, then opened the edit modal, changed téléphone/adresse, saved, and confirmed both the UI list and a direct `psql` query reflected the update. `npm test` (root) and `server/npm test` still green.

### Cultures Stocks + universal modal-edit + gear icon + Calendrier edit (2026-08-13)

User-requested batch: (1) a "Stocks" tab in Cultures & irrigation (Poulailler already had one), (2) the ability to correct a stock quantity in both modules (Poulailler previously had **no edit at all**, only add/delete), (3) `PencilLine` (crayon) replaced by `Settings2` (engrenage) everywhere as the "modifier" icon — user explicitly rejected the pencil after being shown alternatives via `AskUserQuestion`, matching the choice already made for `EmployeesModule` earlier the same day, (4) every "Modifier" action opens a **separate window**, not an inline form, (5) Calendrier gains the ability to edit an event (previously add-only).

- **DB** (`server/src/db/migrate.js`): new `cultures_stocks` table, identical shape to `poulailler_stocks` but with `entreprise_id` (`NOT NULL`) present from creation. **Real bug found and fixed while modeling the new table**: `poulailler_stocks.entreprise_id` exists live (`NOT NULL`, FK'd) but was never created by this script — only `user_id` was ever added via `ALTER TABLE`; `entreprise_id` must have been added out-of-band at some point (same class of gap as `salaries`/`observations` documented elsewhere in this file). A genuinely fresh DB running the documented migration would have crashed the moment `routes/poulailler.js` touched the stocks table. Fixed by adding `entreprise_id` to the `CREATE TABLE` (fresh installs) plus a nullable `ALTER TABLE ADD COLUMN IF NOT EXISTS` fallback + index (already-migrated installs) — not forced `NOT NULL` via migration to avoid breaking any existing rows on an install that hit this gap.
- **Backend**: `routes/poulailler.js` gained `PUT /stocks/:id` (didn't exist before — stock quantities were add/delete only). `routes/cultures.js` gained a full `GET/POST/PUT/DELETE /stocks` set mirroring Poulailler's, with its own `STOCK_COLUMNS`. `routes/calendar.js` gained `PUT /:id` (previously GET/POST only, per the existing "no edit UI, so no route" convention documented above — that convention no longer applies, edit UI now exists).
- **`StocksTab` generalized** (`src/App.jsx`) rather than duplicated — same pattern already used for `AchatModule`'s `moduleType` prop. New `STOCK_API` lookup table maps `moduleType` (`'Poulailler'` | `'Cultures'`) to its `{get,create,update,remove}` functions; `CULTURES_STOCK_CATS = ['Semences', 'Engrais', 'Produits phytosanitaires', 'Autre']` replaces Poulailler's categories when `moduleType === 'Cultures'`. The Poulailler-specific `DEFAULT_STOCKS` seeding (3 fake starter items) only fires for `moduleType === 'Poulailler'` — Cultures starts genuinely empty rather than seeding invented agricultural data. `CulturesModule` gained a `Stocks` tab (`Package` icon) between Carte and Ventes.
- **Universal modal-edit refactor**: `MovementTab`, `DevisModule`, `AchatModule`, `ClientsModule`, `FournisseursModule` all previously reused their single "Ajouter..." form for editing too (repopulate + relabel button to "Mettre à jour") — the *only* prior modal-edit precedent in the whole app was `EmployeesModule` (built earlier the same day). All five now follow that same precedent: a separate `editForm`/`editingId`/`editSubmitting` state trio, `startEdit`/`cancelEdit`/`saveEdit` (or `submitEditForm`) functions, and a `position: fixed` overlay modal — the add-form goes back to being purely for adding, never repurposed for editing. `StocksTab`'s brand-new edit capability was built the same way from the start, for consistency. `MovementTab`'s edit modal still requires the mandatory "raison de la modification" `window.prompt()` for remote (non-local) rows, same as before — only *where* the form renders changed, not the audit-trail requirement. `DevisModule`'s edit modal reimplements the full multi-ligne product-row editor (add/remove/update ligne, récolte-liée selector) inside the modal, since a devis edit needs the same rich form as creation.
- **Icon swap**: `PencilLine` import removed entirely from `App.jsx` (was only used by the 5 components above) — `Settings2` is now the sole "modifier" icon across the whole app, consistent with `EmployeesModule`/`StocksTab`.
- **Calendrier** (`AgriculturalCalendarModule`): the "Prochaines activités" card (next 6 *upcoming* events only) is now "Tous les événements" — all events, past and future, in a scrollable list — specifically so a data-entry error on an already-past event is still reachable to fix, not just future ones. Each row gets a gear button opening an edit modal (date/type/titre/description), wired to the new `updateCalendarEvent`.
- Verified via direct API calls (stock CRUD both modules incl. a cross-tenant `PUT` correctly 404ing instead of leaking) and a real browser click-through (throwaway entreprise, cleaned up after): added + edited a Cultures stock item via its new modal, edited a client via its new modal (confirmed the add-form stayed empty/independent throughout), and fixed a typo'd calendar event via its new modal — all three round-tripped correctly through the UI, toast, and list re-render. `npm run build`, root `npm test`, and `server/npm test` all still pass.

### Achats never synced to Finances, and Comptabilité showed nothing real (fixed 2026-08-13)

User-reported: purchases made in Cultures/Poulailler never showed up in either the module's own "Comptabilité" sub-tab or in the global Finances module. Root cause: `AchatModule` (the actual multi-lignes purchase form users interact with) writes to `achats_documents`/`achats_lignes`, a table introduced later than — and never connected to — two older mechanisms that predate it:
- `routes/achats.js` never called `financeSync.js` at all, so no purchase ever created a `finances` row, regardless of module.
- `ComptabiliteTab`'s `remoteVentes`/`remoteAchats` props (in both `CulturesModule` and `PoulaillerModule`) were still wired to `getCulturesMouvements`/`getPoulaillerMouvements` — the `cultures_mouvements`/`poulailler_mouvements` tables, which are dead code fed by nothing (`MovementTab`, the only thing that ever wrote to them, isn't rendered anywhere — see the "Traçabilité" section above, which already flagged this for ventes; it turns out achats have the exact same disconnect). So the sub-tab was structurally incapable of showing a real purchase, no matter how many were made.

**Finances sync** (`server/src/utils/financeSync.js`, `server/src/routes/achats.js`): added `syncAchatDocumentFinance`/`updateAchatDocumentFinance` — document-level siblings of the existing `syncFinanceEntry`/`updateFinanceEntry`, which take a pre-computed `total` instead of `quantite × prixUnitaire` (an `achats_documents` row is multi-line, so there's no single quantite/prixUnitaire to work from). Wired into `POST /achats` (create → `-total` finance entry), `PUT /achats/:id` (update → finance entry's montant/description updated in place, same `updateFinanceEntry` philosophy of preserving history instead of delete+recreate), and `DELETE /achats/:id` (removes the finance entry via the existing generic `removeFinanceEntry` — the delete route now selects `module` before deleting the document, needed to find the matching finance row).

**Comptabilité reconnected to real data** — but ventes and achats needed different treatment, discovered while planning: `achats_documents` has a `module` column (`'Cultures'`/`'Poulailler'`), so achats can be correctly split per module; `devis` (the real ventes source, via `DevisModule`) has **no module column at all** — a limitation already called out as deliberately accepted in the Traçabilité section above (no `moduleType` prop on `DevisModule`). Presented this to the user as a real decision (same-total-everywhere vs. add a module column to devis vs. leave ventes broken) — chose **same total everywhere**: no schema change, `Ventes` in both Cultures's and Poulailler's Comptabilité tabs shows the entreprise's whole sales figure, not a per-module split.
- `GET /api/achats/ledger?module=X` (new, `routes/achats.js`) — flattens `achats_lignes` (joined to `achats_documents` for `date`/`fournisseur_nom`) into the flat `{id, date, produit, partenaire, quantite, prixUnitaire}` shape `ComptabiliteTab` already expects, scoped by module.
- `GET /api/devis/ledger` (new, `routes/devis.js`) — same flattening for `devis_lignes` (joined to `devis`/`clients`), entreprise-wide (no module filter, per the decision above), **excluding `Brouillon`** devis — a draft isn't a committed sale yet, so it shouldn't count as a "vente" in this ledger (mirrors the general principle already used for Finances: money/sales only get recorded once a transaction is real, not while still provisional).
- `src/lib/api.js`: `getAchatsLedger(module)`, `getVentesLedger()`. `App.jsx`: both `ComptabiliteTab` call sites (`CulturesModule`, `PoulaillerModule`) rewired from the dead `getCulturesMouvements`/`getPoulaillerMouvements` to these new ledgers.
- **Deliberately not touched**: the "Historique des modifications et suppressions" button inside `ComptabiliteTab` still reads from `mouvementHistorique.js`'s log of edits/deletes on the old `cultures_mouvements`/`poulailler_mouvements` rows — it was already disconnected from real achats/ventes before this fix (nothing ever wrote to that historique for `achats_documents`/`devis` edits) and remains so; fixing it would mean extending the audit-log mechanism to achats/devis edits, out of scope for what was asked here.
- Verified end-to-end: direct API test (create achat → `finances` shows `-total` immediately; update → finance entry's montant updates in place; delete → finance entry removed; `achats/ledger` correctly module-scoped, confirmed empty when queried under the other module) plus a devis test (Brouillon excluded from `devis/ledger`, appears immediately after `valider-manuel` moves it to `Signé`, with the client's full name resolved correctly as `partenaire`) plus a full real-browser pass (registered a throwaway entreprise, created a real achat through `AchatModule`'s UI, confirmed it appeared correctly in both the Comptabilité sub-tab and the Finances module). All test data cleaned up after.

### Finances module misclassified auto-synced achats as revenue (fixed 2026-08-14)

Follow-up to the achats→Finances sync fix above, caught by the user immediately after: their new achat *did* land in Finances (confirmed the sync itself worked), but rendered in **green with `+-29 975 FCFA`** instead of red with `-29 975 FCFA`, and didn't count toward the "Dépenses" total/chart. Root cause in `src/modules/finances.jsx` (frontend-only, no backend change needed): `isDepense` was determined purely by `categorie` membership in `CATEGORIES_DEPENSES` (`['Depenses diverses', 'Carburant', 'Salaire', 'Entretien']`) — but `syncFinanceEntry`/`syncAchatDocumentFinance`/`syncDevisPaiement` (all pre-existing or added in the section above) always use `categorie = 'Caisse'` or `'Banque'` for auto-synced entries, since that field doubles as "which account did the money move in/out of" for those rows, encoding revenue-vs-expense purely in the sign of `montant` instead (positive for vente/paiement, negative for achat) — a genuinely different convention from manually-entered rows, where `montant` is always stored as a positive magnitude and Caisse/Banque vs. a Dépenses-category is what carries the sign. The display logic only ever handled the manual-entry convention.

Fixed by combining both signals: `isDepenseEntry = (e) => CATEGORIES_DEPENSES.includes(e.categorie) || Number(e.montant) < 0`, then using `Math.abs(Number(entry.montant))` everywhere a magnitude is displayed or summed (the row's amount cell, `totalDepenses`, `totalRevenus`, and both mini-chart datasets) instead of the raw signed value — this uniformly handles both storage conventions without ever double-applying the sign. `totalCaisse`/`totalBanque` (and `soldesParBanque`) were deliberately left summing the **signed** `montant` as before — those represent a running account balance, where an achat correctly needs to subtract and a vente correctly needs to add, so the sign must stay real there; only the revenue/expense *classification and display* needed fixing, not the balance math.

Verified via a real browser pass (throwaway entreprise, achat created via `AchatModule`'s UI): the row now shows a red "Caisse" badge and `-30 000 FCFA` in red (no more `+-`), "Depenses" card reads `30 000 FCFA`, "Benefice net" reads `-30 000 FCFA`, and the achat appears in the "Depenses recentes" mini-chart. All test data cleaned up after.

**Backfilled 2026-08-15**: of the achats predating the original sync fix in the user's real entreprise (`entreprise_id = 1`), only **one** actually turned out to be missing a `finances` row on inspection (not two, as first estimated) — `achats_documents.id = 4` (Cultures, fournisseur "vfgfdg", 28 000 FCFA, created 2026-08-13 21:27:42). The other two documents in that entreprise (`id = 7`, `id = 9`, both Poulailler) were created after the 23:40 fix and were already correctly synced. Backfilled by hand with a direct `INSERT INTO finances` mirroring `syncAchatDocumentFinance`'s exact shape (`type = 'Banque'`, `montant = -28000.00`, same `banque_id` the other synced entries use), using the document's **original** `created_at` timestamp rather than today's date, so it sorts correctly in Finances history. Verified the row exists (`finances.id = 78`) with the right values.

### Rapports/Prévisions read dead `localStorage` keys, and a real nginx caching bug found while verifying the fix (2026-08-15)

Gap-analysis against the roadmap flagged `ReportsModule`/`ForecastingModule` (the "Rapports"/"Prévisions" tabs) as suspicious: unlike every other module already migrated to the real backend, both still read via `storageGet` from `localStorage` keys (`poulailler-ventes-${farmId}`, `poulailler-achats-cultures-${farmId}`, `poulailler-clients-${farmId}`, `poulailler-finances-${farmId}`, `cultures-parcelles-${farmId}`, etc.) that nothing has written to since the app moved to `achats_documents`/`devis`/`finances` — the same dead-data pattern already fixed elsewhere (Calendrier/Récoltes, Achats↔Finances sync). Confirmed both were rendering empty/fallback-default numbers instead of real figures.

**Fixed** by rewiring both to the real endpoints already used elsewhere in the app: `getAchatsLedger('Cultures'|'Poulailler')` + `getVentesLedger()` (entreprise-wide, excludes `Brouillon`, same source `ComptabiliteTab` already uses) + `getRecoltes()` for `ReportsModule`; `getParcelles()` + `getPoulaillerStocks()` + `getVentesLedger()` + `getRecoltes()` + `getFinances()` for `ForecastingModule`. Both gate the achats/parcelles/stocks calls on `activated.cultures`/`activated.poulailler` (mirroring `HomeOverview`'s existing pattern) since those are ungated for ventes/récoltes/finances. `ForecastingModule`'s revenue/expense split also carried the **same pre-fix bug** the Finances module had (`categorie` was compared against `['Caisse','Banque']`/`['Dépenses diverses',...]` — the manual-entry-only convention, which misses auto-synced achats/ventes entirely since those use `categorie='Caisse'|'Banque'` with the sign carrying the classification) — fixed in the same pass by reusing the corrected `isDepenseEntry` convention from `finances.jsx` (`CATEGORIES_DEPENSES.includes(categorie) || montant < 0`). `ForecastingModule`'s "chiffre d'affaires historique généré par les clients" note (previously read a nonexistent `client.historique` array) now sums the real `getVentesLedger()` total.

**A second, more consequential bug was found while verifying this fix in the browser, not in the code being reviewed**: after rebuilding and redeploying the `frontend` Docker image multiple times, the running app kept showing the *old* pre-fix numbers no matter how many times the page was reloaded — confirmed via `docker exec` that the container was serving the correct freshly-built JS bundle (new content hash each time), and via a direct `fetch(..., {cache:'no-store'})` from the browser that the server-side `index.html` correctly referenced the new hash — yet `document.querySelector('script[type="module"]').src` on the *live* page kept resolving to a stale bundle hash from an earlier build. Root cause: `nginx.conf` served `index.html` with no `Cache-Control` header at all, so the browser applied HTTP heuristic caching and kept reusing an old cached copy of `index.html` (which embeds the current build's hashed script filename) indefinitely across reloads, never re-requesting it from the server. Since Vite already content-hashes everything under `/assets/*`, this is backwards: `index.html` (the one file that must always be revalidated) was cacheable, while the hashed assets (safe to cache forever) had no explicit long-lived cache policy either.

**Fixed in `nginx.conf`**: `/assets/` now gets `Cache-Control: public, max-age=31536000, immutable` (safe — a new build always gets a new filename); `/` (i.e. `index.html` via the SPA fallback) now gets `Cache-Control: no-cache` (always revalidates with the server, so a new deploy is picked up on next load without users needing a hard-refresh). This is a real, previously-unnoticed **production deployment bug** independent of the Rapports/Prévisions fix — without it, every future `docker-compose up -d --build frontend` deploy (including the eventual real Jalon 4 production rollout) would leave already-open browser tabs/returning users stuck on stale JS until they manually hard-refreshed. Verified by curling both routes post-fix and confirming the headers; the stale-bundle behavior could still be reproduced against the *browser's pre-existing cache entry* from before the header fix (expected — the fix only prevents *future* staleness, it can't retroactively invalidate what a browser already cached under the old, header-less responses) but resolved cleanly with a cache-busted URL, confirming real production users (whose browsers never cached the old header-less responses) won't hit this.

Verified end-to-end in the real browser (production Docker build, real entreprise data, not throwaway test data): Prévisions now shows real figures (e.g. "34 431 361 FCFA" ventes prévues, "831 316 585 FCFA" de chiffre d'affaires client historique, matching the real `devis/ledger` total exactly); Rapports (Mensuel) shows "1 325 375 FCFA" ventes / "2 579 491 FCFA" achats (the achats figure matches "Dépenses du mois" on the dashboard exactly) / "1 000 kg" récoltes (matches the one real `recoltes` row). `npm run build`, `npx vite build`, and root `npm test` all still pass.

**`AIAssistantModule` and `NotificationsModule` fixed the same day**, same dead-`localStorage`-key pattern, same real-endpoint rewiring:
- `AIAssistantModule` ("Assistant IA" Q&A facts): `getParcelles()`/`getPoulaillerStocks()` (gated on `activated.cultures`/`activated.poulailler`, matching `ForecastingModule`'s pattern) + `getVentesLedger()` + `getFinances()`, with the same corrected `isDepenseEntry` revenue/expense classification. The "client qui achète le plus" fact used to read a `client.historique` array that only ever existed in the old `poulailler-clients-*` localStorage shape and has no backend equivalent — replaced with an aggregation of `getVentesLedger()` by `partenaire` (the client's full name string, as returned by the ledger — no separate id/prenom/nom to key on), summing `quantite × prixUnitaire` per name and taking the top spender. `facts.bestClient` shape changed from `{prenom, nom, total}` to `{nom, total}` accordingly (the one string interpolation reading it was updated to match).
- `NotificationsModule` ("Notifications" alert list): `getParcelles()`/`getPoulaillerStocks()`/`getPoulaillerLivraisons()` (same `activated`-gated pattern — this module didn't receive `activated` as a prop before, now does, threaded through from its `App.jsx` render call) + `getDevisListe()`. The "client n'a pas payé" alert used to read `c.detteRestante` — a field that only ever existed on the fictional localStorage client shape (`clients` table has no debt/balance column at all, confirmed via `\d clients`). Replaced with a real signal: devis whose `statut` is `'Non payé'` or `'Payé partiellement'` (the app's actual unpaid-invoice states, see the Devis state machine described earlier in this file), showing the client name, devis numéro, and total.

Verified end-to-end against the real entreprise data (not throwaway test data) in the browser (production Docker build — see the caching note above for why a cache-busted URL was needed to see the fresh bundle during this same testing session): "Quel client achète le plus ?" returned a real aggregated name+total from actual ventes; "Quel est mon bénéfice ce mois-ci ?" returned "29 301 399 FCFA (31 880 890 FCFA de revenus, 2 579 491 FCFA de dépenses)" — matching the dashboard's own figures exactly; Notifications showed "Sol sec — Parcelle B nécessite un arrosage", matching the dashboard's "1 parcelle à arroser" alert. `npx vite build` and root `npm test` both pass.

### Forum de feedback — MVP Must-have, built as a simple submission form, not a community forum (2026-08-15)

User's actual need (their words): just collect suggestions/frustrations/recommendations from real farmers to drive the backlog iteratively — not a public forum with threads/voting. Recommended and built the minimal version: a submission form (any authenticated user, any role) + a simple triaged list (only the platform owner, not each entreprise's admin).

**Key architectural decision, confirmed with the user**: this is the first feature in the app that needs to be visible *across* entreprises — everything else is strictly cloisonné by `entreprise_id` (see the Multi-tenant model section above), but feedback about the app itself needs to reach *the developer*, not stay siloed inside each customer's company. Rather than hardcoding a specific email as "the owner" (fragile — the user explicitly flagged they might not keep their current login email after their training), added `users.is_platform_admin` (`BOOLEAN NOT NULL DEFAULT FALSE`, `server/src/db/migrate.js`) — a flag on a normal user row, orthogonal to the existing entreprise-scoped `role` system, not a new role tier. Whoever needs to see cross-tenant feedback in the future is just one `UPDATE users SET is_platform_admin = TRUE WHERE id = ...` away, no code/redeploy needed. Bootstrapped onto the user's actual working account, `admin@agriconnect.com` (`users.id = 7`, `entreprise_id = 1`) — not `ousmane.niakate@iprec.fr`, which turned out to not match any account in this app's `users` table at all (that's the user's Claude-session identity, unrelated to their AgriConnect login).

- **`feedback` table** (`server/src/db/migrate.js`): `entreprise_id` (FK, cascade), `user_id` (FK, set-null), `type` (`'Suggestion'|'Frustration'|'Bug'|'Autre'`, default `'Suggestion'`), `message`, `statut` (`'Nouveau'|'Lu'|'Traité'`, default `'Nouveau'`, for the platform owner's triage), `created_at`.
- **`server/src/middleware/requirePlatformAdmin.js`** — mirrors `requireRole.js`'s shape but checks `req.user.isPlatformAdmin` (a JWT claim, not a live DB read — same convention `role` already uses, meaning a flag change only takes effect on the affected user's *next login*, not their current session).
- **`server/src/routes/feedback.js`**: `POST /` (`authRequired` only — any role, any entreprise, matching the "capture the most signal" decision) inserts scoped to the caller's own `entreprise_id`/`user_id`. `GET /` (`requirePlatformAdmin`) deliberately has **no** `entreprise_id` filter — reads every entreprise's feedback, joined to `entreprises`/`users` for context (`entrepriseNom`, `userEmail`). `PATCH /:id` (`requirePlatformAdmin`) updates `statut` only.
- **`server/src/routes/auth.js`**: `register`/`login`/`GET /me` all now embed `isPlatformAdmin` (JWT claim + response body) — `register` always `false` (brand-new accounts), `login`/`me` read the real `users.is_platform_admin` value. `GET /me` needed `u.is_platform_admin` added to its `SELECT`.
- **Frontend**: `src/components/FeedbackModule.jsx` (new, follows the `ObservationListView.jsx` extraction precedent rather than growing `App.jsx` further) — everyone sees the submission form; the `isPlatformAdmin` prop (threaded from `App.jsx`'s own `isPlatformAdmin` state, itself set from `login`/`register`/`me` responses and reset to `false` on logout) additionally renders the full cross-tenant list with a per-row `statut` `<select>`. New ungated `{ id: 'feedback', ... }` tab entry in `availableTabs`, same treatment as `Observations`/`Profil` (no role/`activated` gating — every user should be able to leave feedback).
- Verified end-to-end against the real `admin@agriconnect.com` account after a fresh login (needed to pick up the new `isPlatformAdmin: true` JWT claim — the token issued *before* the DB flag was set still carried `false` and would have been silently rejected by `requirePlatformAdmin` despite `/me` reporting the flag correctly, since the middleware trusts the JWT claim, not a fresh DB lookup): submitted a real "Suggestion" feedback row, confirmed it appeared instantly in the "Tous les retours reçus" list with correct entreprise/user/date, changed its `statut` to "Traité" via the dropdown and confirmed the change persisted in the DB. Test row deleted after. `npx vite build`, root `npm test`, and `server/npm test` all pass.

### Doc utilisateur minimale — page "Aide" statique dans l'app, pas un tuto interactif (2026-08-15)

Same MVP-minimal reasoning as the feedback forum: user wanted the smallest useful thing now, and let the (newly-built) feedback forum surface where users actually get stuck before investing in a real guided tour — a contextual/interactive onboarding was explicitly named as the alternative, deliberately deferred.

- **`src/components/FeedbackModule.jsx`-style extraction, no backend at all**: `src/components/HelpModule.jsx` (new) is pure static content — a hardcoded `SECTIONS` array (one entry per module: Tableau de bord, Calendrier, Récoltes, Cultures & irrigation, Poulailler, Clients & Fournisseurs, Finances & Banques, Devis & Factures, Salariés, Observations, Assistant IA, Prévisions & Rapports, Notifications, Feedback, Profil & sécurité), rendered as a single-open-at-a-time accordion (click a section header to expand it, collapses whichever was open — plain `useState` holding one open `id`, no library). New ungated `{ id: 'aide', ... }` tab in `availableTabs`, same treatment as `Observations`/`Feedback`/`Profil` (no role/`activated` gating).
- **Real, unrelated bug found and fixed while building this**: `src/index.css`'s `#root` rule (a leftover from the original Vite scaffold) sets `text-align: center` globally, and `Card` (`src/components/ui.jsx`) never resets it — so any Card content that doesn't explicitly set its own `textAlign` inherits centered text. This already affects the (already-shipped, user-accepted) `FeedbackModule`/`ObservationListView` intro text too, just not enough to be visually jarring there. Fixed locally in `HelpModule.jsx` only (explicit `textAlign: 'left'` on the intro `Card` and on each accordion section's content) rather than touching the global `#root` rule — removing `text-align: center` app-wide is the real fix but is out of scope for this task and untested against every other screen (e.g. `LoginScreen`'s centered card layout might be relying on it); flagged here, not fixed globally.
- Verified in the browser (production Docker build): all 15 sections present, accordion opens/closes correctly (single-open behavior confirmed by opening "Cultures & irrigation" while "Tableau de bord" was open — the first closed automatically), text renders left-aligned. `npx vite build` and root `npm test` pass.

### Inventaire matériel (Équipements) — premier chantier du Jalon 2 (2026-08-15)

MVP roadmap's Should-have "simple equipment inventory" item. Confirmed scope with the user before building: a fiche per equipment (nom/catégorie/état/date d'acquisition/valeur/notes) plus a maintenance-history sub-resource, and write access (create/update/delete equipement + maintenance entries) restricted to `admin`/`directeur`/`gestionnaire` — read access open to any authenticated user of the entreprise, matching how the tab itself is gated (see below), so in practice only those three roles ever see it at all.

- **DB** (`server/src/db/migrate.js`): `equipements` (`entreprise_id`, `user_id`, `nom`, `categorie`, `etat` default `'Fonctionnel'`, `date_acquisition`, `valeur`, `notes`) + `equipements_maintenance` (`equipement_id` FK `ON DELETE CASCADE`, `user_id`, `date`, `description`, `cout`) — mirrors the `cultures_stocks`/`observations` shape exactly (`entreprise_id NOT NULL REFERENCES entreprises ON DELETE CASCADE`, indexed).
- **Backend** (`server/src/routes/equipements.js`, mounted at `/api/equipements`): full CRUD on equipements (`requireRole('admin','directeur','gestionnaire')` on write, `authRequired` only on `GET`) + `GET/POST /:id/maintenance` and `DELETE /maintenance/:maintenanceId`. Every maintenance route verifies the parent `equipement` belongs to `req.user.entrepriseId` **before** touching `equipements_maintenance` (a `findOwnedEquipement` helper, or a `DELETE ... USING equipements e WHERE ... e.entreprise_id = $2` join for the delete) — deliberately following the lesson already documented above from the `achats_lignes` cross-tenant deletion hole, rather than repeating it. Verified with real cross-tenant curl calls (two throwaway entreprises): every cross-tenant read/write/delete attempt on another company's equipement or maintenance entry came back 404, never a leak.
- **Frontend**: new `src/components/EquipementsModule.jsx` (extraction pattern, like `ObservationListView`/`FeedbackModule`/`HelpModule`) — add-form Card, table list, a separate edit modal (`Settings2` icon, universal modal-edit convention) gated behind a `canManage` prop, and a detail modal (`Wrench` icon, open to everyone) showing maintenance history with its own inline add-form (also `canManage`-gated) and delete buttons. New `equipements` permission key added to `ROLE_DEFINITIONS` (`src/components/roles.js`) for `admin`/`directeur`/`gestionnaire` only — gates both the tab's visibility (`roleConfig.permissions.includes('equipements')` in `App.jsx`'s `availableTabs`) and the `canManage` prop (`['admin','directeur','gestionnaire'].includes(role)`, passed at the `{tab === 'equipements' && ...}` render site). Unlike Cultures/Poulailler/Finances, this tab is **not** gated by the `activated` module-toggle system — equipment tracking is a role-scoped utility, not a farm-activity module a company opts in/out of.
- Verified end-to-end via a real browser click-through (throwaway entreprise "Equip Browser Test SARL", registered/exercised/fully deleted after — `entreprises`/`users` rows both cleaned up, same as every other pass documented in this file): added an equipement via the UI, confirmed it listed with the correct état badge color, opened the maintenance modal and added an intervention (date defaulted to today, cost formatted correctly), then deleted the equipement and confirmed the list emptied. `npx vite build`, root `npm test`, and `server/npm test` all pass.
- Not built in this pass (explicitly out of scope, matches the Jalon 2 backlog): equipment-to-parcelle/poulailler affectation, PDF/CSV export of the inventory. RH enrichie (présences/congés/avances) — the other named Jalon 2 chantier — is untouched.

### RH enrichie — présences/congés/avances (second chantier du Jalon 2, 2026-08-15)

Second half of the MVP roadmap's "richer HR" Should-have (the first half, equipment inventory, is documented above). Investigation before building found the `salaries` table already had `presence`/`avances`/`conges` columns, but they're flat fields — a single current-status enum and two manually-typed running totals, no dates, no history, no workflow — exactly the gap the roadmap flags. Confirmed scope with the user before building: real per-day presence log, a congé workflow with an actual Demandé→Approuvé/Refusé state (not an already-decided log entry — the user explicitly chose the fuller option), and an avances ledger — all three admin-only to write (matching the existing `requireRole('admin')` gate already on every other `salaries` write route, stricter than Équipements' three-role gate), and all three **additive**, coexisting with the existing flat fields rather than replacing them (the user explicitly chose not to touch the existing add/edit employee form in this pass).

- **Found and fixed in passing**: `salaries` itself was never created by `migrate.js` — same class of gap as `poulailler_stocks.entreprise_id` documented above (a live table that grew out-of-band, with the migration script never updated to match). A genuinely fresh database would have 500'd on the very first `/api/salaries` call. Fixed by adding a `CREATE TABLE IF NOT EXISTS salaries` to `migrate.js` matching the live schema exactly (verified via `\d salaries` against the running DB first) — harmless on an already-migrated install (`IF NOT EXISTS`), fixes it for a fresh one.
- **DB** (`server/src/db/migrate.js`): `salaries_presences` (`salarie_id` FK cascade, `date`, `statut`, `notes`, `UNIQUE(salarie_id, date)` — a day is a single upserted row, not an append-only log, so re-marking today just corrects it rather than accumulating duplicates), `salaries_conges` (`date_debut`, `date_fin`, `motif`, `statut` default `'Demandé'`, `decided_by`/`decided_at`), `salaries_avances` (`date`, `montant`, `motif`).
- **Backend** (`server/src/routes/salaries.js`, extended rather than a new file — the user already had this file open, and it keeps every `salaries`-scoped route in one place): `GET/POST /:id/presences` (POST is an `ON CONFLICT (salarie_id, date) DO UPDATE` upsert), `GET/POST /:id/conges` + `PUT /conges/:congeId` (statut transition, admin-only, stamps `decided_by`/`decided_at`) + `DELETE /conges/:congeId`, `GET/POST /:id/avances` + `DELETE /avances/:avanceId`. Every route verifies the parent `salarie_id` belongs to `req.user.entrepriseId` first (`findOwnedSalarie` helper, or an `UPDATE/DELETE ... USING salaries s WHERE ... s.entreprise_id = $N` join) — same ownership-first pattern used for Équipements' maintenance sub-resource, for the same reason (the `achats_lignes` cross-tenant lesson documented above). **A real bug caught before it shipped, not after**: the first draft of `PUT /conges/:congeId`'s `RETURNING` clause reused the `CONGE_COLUMNS` constant via two chained `.replace()` calls to table-qualify it for the `UPDATE ... FROM` join — but `salaries_conges` and `salaries` both have `statut` and `created_at` columns, so the un-replaced occurrences of those two names in the returned row would have thrown "column reference is ambiguous" the first time this route actually ran. Caught by re-reading the query before testing (not by the test itself); fixed by writing the qualified column list out explicitly instead of string-hacking a shared constant across a join.
- **Frontend**: new `src/components/EmployeeRhModal.jsx` — a "Fiche RH" modal per employee (new `ClipboardList` icon added to each `EmployeesModule` row, alongside the existing edit/delete icons) with an in-modal 3-way section switch (Présences/Congés/Avances, plain `useState` holding the active section — same single-open pattern as `HelpModule`'s accordion). Congés shows Approuver/Refuser (`Check`/`X` icons) only while `statut === 'Demandé'`, so a decided request's buttons disappear rather than staying clickable. `EmployeesModule` now receives a `role` prop (threaded from `App.jsx`'s `{tab === 'employees' && <EmployeesModule farmId={user} role={role} />}` — it didn't receive one before this) to compute `canManageRh = role === 'admin'`, gating every write control in the modal (matching the backend's `requireRole('admin')`); read (viewing history) is open to whoever can already open `EmployeesModule` (admin/directeur/gestionnaire, per the `employees` permission).
- Verified end-to-end: real HTTP calls (Node `fetch`, not curl — curl's `-d` mangled accented UTF-8 like `'Présent'`/`'Approuvé'` in this shell, a shell-encoding artifact confirmed harmless by re-running the same calls through Node) against two throwaway entreprises confirmed the presence upsert (same-day re-mark updates in place, doesn't duplicate), the congé create→approve flow (`decidedBy` correctly stamped with the acting admin's user id), and cross-tenant isolation (every attempt to read/approve/delete another company's employee's présences/congés/avances came back 404). Also a full real-browser click-through (throwaway entreprise "RH Browser Test SARL", registered/exercised/fully deleted after): added an employee, opened the Fiche RH, logged a presence, requested and approved a congé, logged an avance and confirmed the running total updated. `npx vite build`, root `npm test`, and `server/npm test` all pass.
- Not built in this pass (explicitly out of scope): reconciling the new ledgers with the existing flat `presence`/`avances`/`conges` fields (e.g. making them computed/read-only) — deliberately deferred, see the scope decision above; no employee self-service (an `ouvrier` logged in as themselves still can't see or request their own congé — only admin/directeur/gestionnaire can reach `EmployeesModule` at all, so a congé "request" is really an admin logging one on an employee's behalf, same real-world flow as the rest of this module).

### Navigation — sidebar groupée par catégorie, remplace les 17 chips à plat (2026-08-15)

Follow-up to the "Navigation — sticky header" entry above: the `category` field added then to `availableTabs` was pure data-prep with nothing reading it yet. User feedback this time was a straight aesthetic complaint ("moche de voir tous les menus les uns à côté des autres") — by now 17 tabs (post-Équipements/Feedback/Aide) wrapped to 3 rows. Presented three concrete options via an interactive HTML comparison artifact (grouped sidebar / two-tier horizontal tabs / floating mega-dropdown, all built with the app's real tab labels and palette so the user could click through each) before writing any code — see memory `project_navigation_grouped_sidebar` for the full comparison and the two options not picked, kept on file in case of a future change of mind. User picked the **grouped sidebar**.

- **`SidebarNav` component** (`src/App.jsx`, defined just above `export default function App`) — a left rail with a pinned section (tabs where `category` is `null`: Accueil/Feedback/Aide/Profil) and one collapsible group per `NAV_CATEGORIES` entry (new module-level constant next to `COLORS`: `operations`→green, `analyse`→blue, `commercial`→ochre, `finance`→red, `rh`→purple `#9B6BD6`, matching the taxonomy the `category` field already used). Groups with zero matching tabs (e.g. `finance` when Finances is deactivated) render nothing. Collapse state is local `useState` per group, not persisted — reopens expanded on next load, deliberately kept simple rather than wiring it through `localStorage`.
- **Layout restructure**: the nav-chip row (previously the third row inside the sticky header wrapper) is gone; the header wrapper now holds only the topbar (logo/user/logout) and the online/sync-status row. Below it, `{screen === 'dashboard' && ...}` now renders a `.dashboard-layout` flex row (`SidebarNav` + `.dashboard-shell` content pane) instead of `.dashboard-shell` alone — `.dashboard-shell`'s old `max-width:1500px; margin:0 auto` moved onto the new `.dashboard-layout` wrapper (it's now the flex row that gets centered/capped, `.dashboard-shell` itself is just `flex:1; min-width:0`).
- **Keeping the sidebar visible while scrolling** (the whole reason the header became sticky in the first place, back in the "sticky header" entry above) needed the sidebar's own `position: sticky; top: <header height>` — hand-calculating that offset would break the moment the header's content wraps to another line (long email, narrow viewport), so it's measured live instead: a `headerRef` on the sticky header wrapper + a `ResizeObserver` writing into `headerHeight` state, which `SidebarNav` receives as its `top` prop (`maxHeight: calc(100vh - headerHeight)`, `overflowY: auto`, so an overlong sidebar scrolls internally rather than pushing the page).
  - **Real bug shipped in the first pass, caught by an actual scroll test, not code review**: the `ResizeObserver` effect had `useEffect(..., [])` — runs once on mount. But `screen` is `'login'` on first mount, so the sticky header `<div ref={headerRef}>` (rendered only when `screen !== 'login'`) doesn't exist in the DOM yet; the effect's own `if (!headerRef.current) return` bailed immediately and never ran again, leaving `headerHeight` stuck at `0` for the rest of the session. Visually this didn't look broken at the top of the page (a `top: 0` sidebar looks identical to a correctly-offset one before any scrolling), but scrolling down revealed it: the sidebar, stuck at `top: 0`, sat directly *underneath* the also-`top:0`, higher-`z-index` header, hiding Accueil/Feedback/Aide/Profil behind it — looked exactly like the pinned items had vanished or the sidebar had scrolled internally (confirmed via `getBoundingClientRect()`/`getComputedStyle` mid-bug: `top: "0px"`, no actual internal `scrollTop`, i.e. correctly rendered, just occluded). Fixed with a one-line dependency change, `[]` → `[screen]`, so the observer (re)attaches once the header div actually exists. A lesson worth remembering for any future `ResizeObserver`/`useRef` pairing gated behind conditional rendering: mounting-effect-with-empty-deps assumes the ref target exists at first render, which isn't true here (or anywhere else a ref'd element is behind a conditional).
- **Mobile fallback**: below 760px, `.sidebar-nav` drops its sticky positioning and fixed width (`position: static`, `width: 100%`) and stacks above the content (`.dashboard-layout` switches to `flex-direction: column`) — kept deliberately simple (no attempt to lay the grouped structure out horizontally, which the two-tier-tabs option that wasn't chosen would have suited better) since this is a smaller, lower-priority piece of the change.
- Verified end-to-end via a real browser click-through (throwaway entreprise "Sidebar Visual Test SARL", all modules activated to populate every category group, cleaned up after — note this entreprise had auto-seeded `parcelles`/`poulailler_stocks` rows, which aren't `ON DELETE CASCADE` from `entreprises` per the cleanup caveat documented earlier in this file, so those needed deleting explicitly before the entreprise itself would drop): all 17 tabs render in their correct groups, clicking a tab both selects it (green highlight) and loads its module content, collapsing/expanding a group works, and — after the fix above — the sidebar stays correctly pinned just below the header through a full scroll of a tall module (Cultures & irrigation, 3 parcelles + historique). `npx vite build` and root `npm test` pass.

### `#root`'s leftover Vite-scaffold CSS made the whole app shrink-to-fit per page (fixed 2026-08-15)

User-reported straight after the sidebar landed: "la taille de la page des menus n'est pas les mêmes" — different tabs visibly had different overall page widths, cutting off the topbar's right-side content (user email/role badge/logout icon) on narrower pages. Not a perception issue — confirmed by zooming into a screenshot mid-scroll: on the Feedback tab (one narrow form card), the whole white app area including the topbar ended around x≈1180 with the dark backdrop showing through past it, while Accueil (wide dashboard card grid) filled the full 1500px cap.

Root cause: `src/index.css`'s `#root` rule — a leftover from the original Vite scaffold, already flagged elsewhere in this file for its unrelated `text-align: center` side effect — also still had `width: 1126px; display: flex; flex-direction: column;`. `.app-shell` (`src/App.jsx`, the top-level rendered div) has its own `max-width: 1500px; margin: 0 auto`. Inside a column flex container, an item's horizontal `margin: auto` overrides `align-items: stretch` (the flex default) per spec — the item gets sized to its own shrink-to-fit content width instead of stretching to the container's cross size, then centered via the auto margins. So `.app-shell`'s rendered width was actually just whatever its *widest content row* needed, which varies enormously per tab (a 5-across stat-card grid on Accueil vs. one ~550px form card on Feedback) — and the sidebar+topbar shrank right along with it. This didn't cause a visibly broken layout with the old flat chip row (chips just wrapped to fewer/more rows depending on available width, which read as normal responsive wrapping) but became blatant with the new fixed-width sidebar, since the whole left rail and the topbar's right-aligned content would shift or get clipped depending on which tab was open.

Fixed by stripping `#root` down to `max-width: 100%; text-align: center; min-height: 100svh; box-sizing: border-box;` — dropped `width: 1126px` (the actual cause), `display: flex; flex-direction: column` (not needed for anything `.app-shell` relies on, and removing it is what stops the auto-margin/stretch conflict for good rather than just this one instance of it), and `border-inline` (a 1px side border sized for the old fixed-width reading column; with `#root` now full-bleed it would've drawn a vertical line down each edge of the viewport instead). `text-align: center` was deliberately left alone — same already-documented, out-of-scope-for-now issue as before, unrelated to this bug.

Verified via a real browser pass (throwaway entreprise, all modules activated): Accueil and Feedback (previously the most extreme width mismatch — a full card grid vs. a single narrow form) now render at the exact same width, topbar included, confirmed by direct visual comparison of both screenshots. `npx vite build` and root `npm test` pass.

### Stocks reliés aux Achats/Ventes — plus deux îlots séparés (2026-08-15)

User asked for a gap-analysis of Achats/Ventes in Cultures/Poulailler against des ERP établis (type SAP B1). Investigation found the core gap: `cultures_stocks`/`poulailler_stocks` and the achats/devis (ventes) flows were completely disconnected — recording a purchase never increased stock, recording a sale never decreased it; only `StocksTab`'s manual edit ever touched `quantite`. Consequence: the low-stock alerts in `NotificationsModule` read real stock data but that data never reflected actual purchase/sale activity, only whatever was typed by hand. Also confirmed missing (deliberately **not** built in this pass, next step if the need holds up in practice): no product catalog (both `achats_lignes.produit` and `devis_lignes.produit` are free text retyped every line, no reusable list, no default/catalog price) and no purchase-order/commitment concept on the achats side (`achats_documents` has no `statut`, every row is already-happened, unlike `devis`'s real lifecycle).

Fixed the stock-disconnect specifically (smallest viable version, matching the project's usual minimal-first approach) — matching by product name, not by a catalog id (since none exists yet):

- **`server/src/utils/stockSync.js`** (new, mirrors `financeSync.js`'s pattern: plain `pool.query` calls, catch-and-log rather than throw, called after the main transaction commits): `applyAchatLignesToStock`/`reverseAchatLignesFromStock` (module-scoped — `achats_documents.module` picks `cultures_stocks` or `poulailler_stocks`) and `applyVenteLignesToStock`/`reverseVenteLignesToStock` (devis has no module column, so it checks both stock tables by name and stops at the first match). All four are no-ops when a line's `produit` doesn't match any existing stock row — a free-text product that isn't stock-tracked is a legitimate case, not an error.
- **`achats.js`**: `POST /` applies stock after `syncAchatDocumentFinance`. `PUT /:id` now fetches the *old* `module` + lines before overwriting them, reverses the old effect, then applies the new one (handles a module change between Cultures/Poulailler correctly, same idea as `updateFinanceEntry`'s update-in-place philosophy). `DELETE /:id` fetches lines before deleting them, reverses after.
- **`devis.js`** — chose the **"Signé"** transition as the stock-commitment point (not creation, which is always `'Brouillon'`; not facturation, which never touches lines): it's the moment `devis_lignes` becomes immutable (`PUT`/`DELETE` only allow `['Brouillon','Devis']`) and the moment the ventes ledger already treats as a real sale. Wired into both paths that reach `'Signé'` — `POST /:id/valider-manuel` and the unauthenticated `POST /public/:token/signer` (needed to add `entreprise_id` to that route's own `SELECT`, since it has no `req.user` to read it from). `POST /:id/remettre-brouillon` reverses the stock **only if** the devis's statut before the reset was `'Signé'` or later (`Facturé`/`Non payé`/`Payé partiellement`/`Payé` — a new `STATUTS_APRES_SIGNATURE` list) — resetting from `'Envoyé'` or earlier never decremented stock in the first place, so there's nothing to give back. `facturer` itself needs no hook (never touches lines, decrement already happened at signature) and `DELETE /devis/:id` needs none either (only allowed pre-signature, before any stock ever moved).
- Verified end-to-end via real HTTP calls (Node `fetch`, not curl — same accent-mangling shell issue as the RH-enrichie pass, confirmed harmless the same way) against throwaway entreprises: an achat's create/update/delete cycle moved stock +5 → +3 (net delta, not a flat re-apply) → back to baseline exactly; a devis's Brouillon→Signé→remise-en-brouillon→re-Signé cycle left stock untouched while Brouillon, decremented once at Signé, fully restored at remise-en-brouillon, and decremented again (not double-decremented) on re-signing — confirming no leak across the reversal/reapply cycle. Also verified the **public** e-signature path decrements correctly (real `/envoyer` → `/public/:token/signer` round-trip; hit the already-known "email not configured in this Docker env" limitation getting the token, worked around by reading `token_public` directly from the DB after the expected 500, per the already-documented devis-email caveat above) and that cross-tenant isolation holds — two companies with an identically-named stock item ("Riz"), only the signing company's stock moved. `npx vite build`, root `npm test`, `server/npm test` all pass.

### Catalogue produit — prix par défaut sur les stocks, autocomplete dans Achats/Devis (2026-08-15)

Direct follow-up to the "Stocks reliés aux Achats/Ventes" fix above — user initially agreed to defer this until that fix proved out, then immediately asked to proceed anyway in the same session. Deliberately did **not** create a new `produits` table: an article already in `cultures_stocks`/`poulailler_stocks` already *is* a reusable product (name, category, unit) — it only lacked a default price. Building a separate catalog table would have meant two parallel product lists to keep in sync (and two things to reconcile against the stock-name-matching sync from the previous fix); extending the existing stock tables keeps exactly one source of truth.

- **DB**: `prix_defaut NUMERIC(12,2)` (nullable) added to both `cultures_stocks` and `poulailler_stocks` via `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- **Backend** (`routes/cultures.js`, `routes/poulailler.js`): `STOCK_COLUMNS` now selects `prix_defaut::float8 AS "prixDefaut"`; `POST`/`PUT /stocks` accept and persist `prixDefaut` (nullable — `''`/`null`/`undefined` all normalize to SQL `NULL`, matching the "optional" field convention already used elsewhere, e.g. `achats_documents.notes`).
- **Frontend — `StocksTab`**: new "Prix par défaut (FCFA)" field in both the add-form and the edit modal, plus a new column in the stocks table (`—` when unset) so the price is actually visible without opening the edit modal.
- **Frontend — `AchatModule`/`DevisModule`**: chose a native HTML `<datalist>` (a single text `<input list="...">`) over rebuilding the fournisseur/parcelle/récolte `<Select>` + `__autre__`-sentinel pattern already used elsewhere in the app. That pattern needs a separate transient "custom text mode" flag per line to know when to show a free-text fallback field, which would have meant extending the `ligne` shape (`{produit, quantite, prixUnitaire}`) in four separate forms (add + edit, in each of two components) just to track UI mode. A `datalist` gets the same result — pick from a list *or* type anything — in one input, no new per-line state, and works identically whether the user picks a suggestion or free-types a non-catalog product. `AchatModule` (already `moduleType`-aware) sources its list from that module's own stocks; `DevisModule` (no module concept, per the traçabilité-parcelle-vente entry above) merges both `cultures_stocks` and `poulailler_stocks`. In both, the produit field's `onChange` checks the new value against the loaded catalog (case-insensitive exact match) and — only if `prixUnitaire` is still empty, so it never clobbers a price the user already typed — fills it from that item's `prixDefaut`. Wired into all four line-editing surfaces (`AchatModule` add-form + edit-modal, `DevisModule` add-form + edit-modal); the two free-text product fields in `MovementTab` (confirmed dead code, never rendered — see the Achats↔Finances entry above) were deliberately left untouched.
- Verified end-to-end: direct API calls confirmed `prixDefaut` round-trips through create/update/list on both stock endpoints, including staying `null` when omitted. A real browser pass (throwaway entreprise) created a stock item "Engrais NPK" at 15 000 FCFA default, then in the Achats form typed the exact same name into the produit field — `prixUnitaire` auto-filled to `15000` immediately, confirmed visually. `npx vite build`, root `npm test`, `server/npm test` all pass.

### Passe de vérification post-déploiement local (2026-08-16)

À la demande de l'utilisateur ("vérifie que l'app fonctionne bien en prod"), vérification de bout en bout de la stack Docker locale en mode production — reconstruite `docker-compose up -d --build` à partir exactement du code déjà poussé sur `origin/main` (commit `75d7eee`, working tree propre au moment du test), pas d'un environnement hébergé en ligne : celui-ci n'existe toujours pas (bloqué sur la création du compte DigitalOcean/Droplet + l'achat d'un nom de domaine par l'utilisateur, voir la section Hébergement/HTTPS plus haut).

- **Démarrage** : les 4 services (`db`, `backend`, `frontend`, `backup`) démarrent proprement ; `node src/db/migrate.js` s'exécute sans erreur ; logs backend/frontend propres (aucune erreur au démarrage) ; `curl` confirme `200` sur `http://localhost:8090` (frontend) et `http://localhost:4000/` (backend).
- **Passage navigateur réel** (entreprise jetable "Prod Check SARL", inscription → tableau de bord → parcours de plusieurs modules touchés pendant la session → nettoyage complet après) :
  - Sidebar groupée : rendu correct, tous les groupes/items présents, navigation fonctionnelle.
  - Largeur de page cohérente entre pages courtes et longues (Accueil vs Feedback comparés côte à côte) — confirme que le correctif `#root` tient dans un environnement rebuild à froid, pas seulement dans la session où il a été fait.
  - Équipements et Fiche RH (présences/congés/avances) : les deux accessibles et fonctionnels.
  - **Stocks ↔ Achats** : créé un article "Semences Maïs" à 20 en stock avec un prix par défaut de 5 000 FCFA ; dans le formulaire d'achat, taper le nom exact de l'article a préempli automatiquement le prix unitaire (catalogue produit) ; après enregistrement de l'achat (5 unités), le stock est passé de 20 à **25** — confirme que la synchronisation stocks↔achats fonctionne de bout en bout dans un environnement rebuild à froid, pas seulement via les appels API directs utilisés pour la valider au moment de l'implémenter.
  - Aucune erreur dans la console du navigateur pendant tout le parcours.
- **Limite de cette vérification** : couvre la stack locale uniquement (ce qui tourne sur cette machine), pas un déploiement réel — reste à faire une fois l'hébergement effectivement en place.

### Rapprochement stock par identifiant + historique des mouvements (2026-08-16)

Direct follow-up to the ERP gap-analysis artifact — the two items flagged as genuinely high-impact (not "bloat ERP"): the stock↔achats/ventes sync added the day before matched purely by product name, and adjusted `quantite` in place with no record of individual movements. Both fixed together since a reliable audit trail needs to know exactly *which* stock row moved, not infer it from a name string each time.

- **DB**: `achats_lignes.stock_id` and `devis_lignes.stock_id`/`stock_module` (all nullable, no DB-level FK — see below for why) + a new append-only `stock_mouvements` table (`entreprise_id`, `stock_module`, `stock_id`, `stock_nom` — a snapshot, survives a later rename/delete of the article, `delta`, `raison`, `document_type`/`document_id`, `user_id`, `created_at`).
- **Why no FK constraint on `stock_id`**: it can point into `cultures_stocks` *or* `poulailler_stocks` depending on context, and Postgres has no clean way to declare a foreign key conditional on another column's value — the two tables would need merging into one to get a real constraint, which is a much larger change (every route/frontend piece already reading `cultures_stocks`/`poulailler_stocks` separately, cf. `StocksTab`, `NotificationsModule`, `ForecastingModule`, etc.) for a benefit this fix doesn't need. Instead, `server/src/utils/stockSync.js` resolves the row by `stock_id` first (fast, exact) and falls back to the existing case-insensitive name match only when `stock_id` is absent (legacy lines, or a free-text product never linked to the catalog) — additive, not a breaking change to the previous day's sync.
- **How `stock_id` gets populated without changing the input mechanism**: the produit field is still the single `<datalist>`-backed text input from the "Catalogue produit" work (deliberately kept, for the same reason as before — no per-line UI-mode state). Its `onChange` already computed a `match` against the catalog to prefill price; it now also writes `match.id` (and, for `DevisModule`, `match._stockModule` — catalog items tagged by source table when the two stock lists are merged) into the ligne's `stockId`/`stockModule` fields, clearing them back to `null` the moment the text no longer matches exactly. Wired into all four line-editing surfaces (`AchatModule`/`DevisModule` × add-form/edit-modal) — same set touched by the catalog work.
- **Tenant isolation on the new ids**: `achats.js`'s `validerStockIds` and `devis.js`'s `validerStockLigneIds` mirror the existing `validerRecolteIds` pattern (silently store `null` for a `stockId` that doesn't belong to the caller's entreprise, never reject the whole request) — same lesson as the `achats_lignes` cross-tenant hole documented earlier in this file.
- **Movement logging, wired at every point stock already changed** (five `raison` values, one per call site): `achat_creation`/`achat_modification`/`achat_suppression` in `achats.js` (the `PUT` handler now also fetches the *old* lines' `stock_id` before overwriting them, so the reversal is exact-by-id too, not a re-guess by name), `devis_signature` (both `valider-manuel` and the unauthenticated public e-signature route — the latter needed `entreprise_id` added to its own `SELECT` since it has no `req.user`) and `devis_remise_en_brouillon` in `devis.js`.
- **Frontend — `StocksTab`**: new `History` icon per row (leftmost of the three action icons, read-only — this is deliberately an append-only audit log, no edit/delete UI, same posture as `mouvementHistorique.js`'s existing history views) opening a modal listing that article's movements (raison, timestamp, signed delta in green/red) via new `GET /cultures/stocks/:id/mouvements` / `GET /poulailler/stocks/:id/mouvements` routes — same maintenance-history-modal shape already established for `EquipementsModule`.
- Verified end-to-end via real HTTP calls (Node `fetch`) against a throwaway entreprise: an achat with an explicit `stockId` correctly resolved and logged (`+10`, raison `achat_creation`); a devis Brouillon→Signé→remise-en-brouillon→re-Signé cycle produced exactly the right three-then-more movements in order with no drift (delta sum always matched the actual stock delta from baseline); an achat with **no** `stockId` (old-style free-text) still resolved via the name fallback and logged correctly, confirming the previous day's flows keep working unchanged; cross-tenant `GET .../mouvements` from a second throwaway entreprise returned an empty list, never another company's history. A real browser pass (separate throwaway entreprise) confirmed the UI end-to-end: created a stock item, opened its (empty) history, made a purchase through the Achats form with the datalist match, and watched the history modal show "Achat enregistré" with the correct timestamp and `+5`. `npx vite build`, root `npm test`, `server/npm test` all pass.

### Cycle de vie des Achats : Brouillon → Commandé → Reçu (2026-08-16)

Third round on the ERP gap-analysis, user's explicit pick ("ce qui se rapproche le plus d'un ERP de référence") from the "à discuter au cas par cas" tier — closes the biggest structural asymmetry between Ventes and Achats: a devis has always had a real lifecycle (`Brouillon→Envoyé→Signé→Facturé`), but an achat was always "already happened" the moment it was created (stock/finance synced immediately in `POST /achats`). Mirrors a reference ERP's RFQ→PO→Receipt shape, deliberately trimmed to 3 states rather than a fuller model (no partial receipts, no separate vendor-bill step) — matches the project's usual minimal-first approach and the "maybe, not urgent" framing this item had in the comparison artifact.

- **DB**: `achats_documents.statut` (`Brouillon`/`Commandé`/`Reçu`, `DEFAULT 'Reçu'`) + `date_reception`. The `DEFAULT 'Reçu'` is deliberate and asymmetric: it back-fills every *pre-existing* row to match their real state (already synced before this change), while `POST /achats` explicitly inserts `'Brouillon'` for anything created going forward — the column default only ever applies to history, never silently to a new row.
- **Where stock/finance now actually fire**: moved out of `POST /achats` entirely, into a new `POST /:id/recevoir` — the only place `syncAchatDocumentFinance`/`applyAchatLignesToStock` are called from now. `POST /:id/commander` (Brouillon→Commandé) is a pure statut flip with zero side effects, mirroring devis's Envoyé transition. `POST /:id/annuler-reception` (Reçu→Commandé) reverses both (`removeFinanceEntry` + `reverseAchatLignesFromStock`), mirroring `remettre-brouillon`.
- **A real simplification this enabled**: since `PUT`/`DELETE` are now only reachable pre-`Reçu` (guarded — 400 error otherwise, mirroring devis's own `['Brouillon','Devis']` edit guard), neither one ever needs to touch stock or finance anymore — nothing was synced yet at that point in the lifecycle. This *removed* the reverse-then-reapply stock/finance dance `PUT` used to do (from the previous day's stock-linking work) and the reversal calls `DELETE` used to make — both routes got shorter and simpler, not more complex, as a side effect of adding the state machine. `updateAchatDocumentFinance` (in `financeSync.js`) is now unused dead code as a result — left in place rather than deleted, matching the codebase's existing tolerance for a few no-longer-called exports (e.g. `updateBanque`/`updateSalarie`, documented elsewhere in this file).
- **A labeling bug caught before shipping, not after**: the first draft of `/recevoir`/`/annuler-reception` reused the old `achat_creation`/`achat_suppression` `raison` values for the stock-movement log — meaning cancelling a reception (the document still exists, just un-received) would have shown "Achat supprimé" in the history modal, which is actively misleading since nothing was deleted. Caught on review before the browser pass; introduced two accurate new values (`achat_reception`, `achat_annulation_reception`) instead, and kept the old ones in the frontend's label map only for backward-compatible display of history rows logged before this change.
- **Frontend (`AchatModule`)**: new "Statut" column (badge: ochre `Brouillon` / blue `Commandé` / green `Reçu`) in the achats table; row actions are now statut-conditional — `Brouillon` shows a "Commander" button, `Commandé` shows "Marquer reçu", `Reçu` shows "Annuler réception"; the edit (`Settings2`) and delete (`Trash2`) icons only render while `['Brouillon','Commandé'].includes(statut)`, matching the backend guard exactly rather than letting a 400 be the only thing stopping an edit attempt.
- Verified end-to-end via real HTTP calls: created an achat (statut `Brouillon`, stock/finance untouched) → confirmed `recevoir` from `Brouillon` is correctly rejected (400) → `commander` → `Commandé` (still untouched) → `recevoir` → `Reçu` (`dateReception` set, stock +10, one finance entry created) → confirmed `DELETE` on a `Reçu` document is rejected (400, "annulez la réception d'abord") → `annuler-reception` → back to `Commandé` (stock restored to baseline, finance entry gone) → stock history showed exactly `achat_reception:+10` then `achat_annulation_reception:-10`, in order, no drift. A real browser pass (throwaway entreprise) walked the full UI cycle — Brouillon badge → click "Commander" → Commandé badge → click "Marquer reçu" → Reçu badge with the exact toast text, edit/delete icons gone, only "Annuler réception" left. `npx vite build`, root `npm test`, `server/npm test` all pass.

### Listes de prix par client (2026-08-16)

Fourth round on the ERP gap-analysis. User's pick from the two dimensions offered (par client vs par quantité): client-specific pricing, additive on top of the existing `prix_defaut` — a sale with no negotiated price for that client just uses the article's normal default, exactly like before this change.

- **DB**: `client_prix` (`entreprise_id`, `client_id`, `stock_module`, `stock_id`, `prix`, `UNIQUE(client_id, stock_module, stock_id)` — at most one negotiated price per client+article, so re-saving the same pair corrects it rather than piling up duplicates). Same no-FK-on-`stock_id` situation as everywhere else in this file (two possible target tables) — app-validated ownership instead.
- **Backend** (`routes/prixClient.js`, new, mounted at `/api/prix-client`): `GET /?clientId=X` (joins each of `cultures_stocks`/`poulailler_stocks` separately per module, matching the pattern already used for the stock-movement history reads), `POST /` (upsert via `ON CONFLICT DO UPDATE`, validates both the client and the stock article belong to the caller's entreprise before writing — same ownership-first posture as everywhere else this session), `DELETE /:id`.
- **Frontend — `ClientPrixSection`** (new sub-component, rendered inside `ClientsModule`'s existing detail panel for the selected client): a small add-form using the same datalist-driven produit picker as `AchatModule`/`DevisModule` (built from the same merged Cultures+Poulailler catalog), plus a list of that client's overrides with delete. Placed directly on the client record because that's where a negotiated price conceptually belongs — no new top-level nav entry needed.
- **Frontend — `DevisModule`**: two client-scoped price maps (`clientPrixMap` for the add-form, `editClientPrixMap` for the edit-modal — the two forms can have two *different* clients open at once, so one shared map would leak prices across them), refetched via `getPrixClient` whenever `form.clientId`/`editForm.clientId` changes. A new `prixPourMatch(match, prixMap)` helper — negotiated price if one exists for that client+article, else the article's `prixDefaut`, never the reverse — replaces the direct `match.prixDefaut` check in both produit `onChange` handlers, so selecting a catalog item now prefills the *right* price for whichever client is already selected on that form, still only when `prixUnitaire` is empty (never overwrites a price the user already typed).
- Verified end-to-end via real HTTP calls: created a client-specific price (500 default → 350 negotiated), confirmed a second client's price list stayed empty (no cross-client leak) and a devis for the negotiated client's the right client came back at 350; re-POSTing the same client+article updated in place rather than duplicating; deletion round-tripped correctly; cross-tenant `GET`/`POST` against another company's client or stock article both correctly 404'd. A real browser pass (throwaway entreprise) confirmed the full path visually: added "Tomates Prix" at 500 FCFA default, opened a client's "Prix négociés" panel and set 350 for that article, then in a new devis for that same client typed the exact article name — the unit price field filled in with 350, not 500. `npx vite build`, root `npm test`, `server/npm test` all pass.

### Produits unifiés (fusion cultures_stocks/poulailler_stocks) — étape 1 d'un alignement structurel sur un ERP de référence (2026-08-18)

Point de départ : question de l'utilisateur sur l'intérêt réel de fusionner `cultures_stocks`/`poulailler_stocks`. Après une comparaison honnête avantages/inconvénients, l'utilisateur a demandé une inspection en direct de son propre compte ERP réel (`le compte ERP de l'utilisateur`, société SAS SCORECONECT — 1171 produits, 6161 contacts, 7193 devis/commandes) via l'extension Chrome, puis a explicitement élargi l'objectif : faire ressembler les structures de données de l'app à celles d'un ERP de référence, de façon exhaustive mais **exécutée par étapes vérifiées une à une** — voir la mémoire `project_erp_full_architecture_alignment` pour la feuille de route complète (étape 1 ci-dessous faite, étapes 2-4 — contacts unifiés, listes de prix, lignes de devis enrichies — identifiées mais pas encore conçues) et `project_erp_reference_account` pour le détail de ce qui a été observé sur un ERP de référence.

**Conception** (voir le plan complet dans la session correspondante pour le détail SQL) :
- `produits` (nouvelle table) unifie `cultures_stocks`/`poulailler_stocks` — `SERIAL` propre, `module` (`Cultures`/`Poulailler`), colonnes de provenance `legacy_table`/`legacy_id` (`UNIQUE`) servant à la fois de trace d'audit et de clé de correspondance pour le repointage.
- `produit_categories` (nouvelle table) remplace le texte libre non validé qu'était `categorie` — **vraie ressource CRUD par entreprise** (pas une liste figée globale), inspirée de l'inspection d'un ERP de référence (Inventaire > Configuration > Catégories de produits, 19 catégories réellement gérées par l'utilisateur là-bas). Pré-remplie avec les 7 libellés déjà utilisés dans l'app (Semences/Engrais/Produits phytosanitaires/Autre, Aliment/Œufs/Volailles vivantes/Autre).
- `produits.user_id` harmonisé sur `ON DELETE SET NULL` partout (`cultures_stocks` l'avait déjà, `poulailler_stocks` avait `ON DELETE CASCADE` — décision explicite de l'utilisateur : un utilisateur supprimé ne doit plus jamais supprimer l'inventaire qu'il a créé).
- Surface API consolidée : `/api/produits` + `/api/produit-categories` remplacent entièrement `/api/cultures/stocks*`/`/api/poulailler/stocks*` (pas de shim de compatibilité — décision explicite de l'utilisateur, cohérente avec l'objectif de ressemblance structurelle).

**Migration des données** (`server/src/db/migrate.js:mergeStocksIntoProduits`, fonction séparée du bloc SQL principal avec sa propre transaction explicite `BEGIN`/`COMMIT`/`ROLLBACK` — le bloc SQL principal, lui, n'a jamais eu de transaction globale) : fusionne les deux tables, repointe `achats_lignes`/`devis_lignes`/`stock_mouvements`/`client_prix` vers les nouveaux ids via une jointure sur `legacy_table`/`legacy_id`, vérifie (comptes + zéro orphelin sur les 4 tables référentes) avant `COMMIT`, puis renomme (ne supprime pas) `cultures_stocks`/`poulailler_stocks` en `*_legacy_<date>` comme filet de sécurité.

**Deux bugs réels trouvés en répétant la migration sur une copie de sauvegarde restaurée** (avant de toucher la production — voir Vérification ci-dessous), ni l'un ni l'autre visible en relisant le code une seule fois :
- **Idempotence cassée** : relancer `migrate.js` une seconde fois recréait des tables `cultures_stocks`/`poulailler_stocks` vides (`CREATE TABLE IF NOT EXISTS` du bloc SQL principal ne sait pas qu'une fusion a déjà eu lieu), ce qui faisait échouer la vérification post-fusion à chaque redéploiement futur. Corrigé en basant la garde d'idempotence sur l'existence d'une table `*_legacy_%` (robuste même si le bloc principal recrée une coquille vide) plutôt que sur l'existence de `cultures_stocks` elle-même ; les coquilles vides sont supprimées immédiatement si détectées.
- **Catégories manquantes pour toute nouvelle entreprise** : la fusion ne crée les 7 catégories par défaut que pour les entreprises qui avaient déjà du stock au moment de la migration — une entreprise inscrite après coup se serait retrouvée avec une liste de catégories vide, bloquant de fait l'ajout du moindre article tant qu'un admin n'en crée pas une à la main. Corrigé en ajoutant le même seed dans `POST /api/auth/register` (`CATEGORIES_PRODUITS_PAR_DEFAUT`, même liste que `migrate.js`, dans la même transaction que la création de l'entreprise).

**Backend** : `routes/produits.js` (nouveau, CRUD + historique des mouvements) et `routes/produitCategories.js` (nouveau, CRUD) remplacent le bloc `/stocks*` supprimé de `routes/cultures.js`/`routes/poulailler.js`. `utils/stockSync.js` collapse `STOCK_TABLES` (dupliqué indépendamment dans 5 fichiers avant cette fusion) en une seule cible `produits` — le repli par nom (`findStockRow`) gagne un filtre `module` pour qu'un "Riz" Cultures ne matche jamais un "Riz" Poulailler, un id étant désormais non-ambigu à lui seul contrairement au nom. `routes/achats.js`/`routes/devis.js` : `validerStockIds`/`validerStockLigneIds` gagnent un filtre `module` explicite — nécessaire depuis l'unification de l'espace d'ids (avant, un id ne pouvait appartenir qu'à une seule des deux tables, donc jamais "valide mais mauvais module"). `routes/prixClient.js` : la boucle sur 2 tables devient une seule jointure.

**Frontend** : `src/lib/api.js` — `getProduits`/`createProduit`/`updateProduit`/`deleteProduit`/`getProduitMouvements` + `getProduitCategories`/`createProduitCategorie`/`updateProduitCategorie`/`deleteProduitCategorie` remplacent les deux jeux de fonctions parallèles. `StocksTab` (`src/App.jsx`) : les constantes figées `STOCK_CATS`/`CULTURES_STOCK_CATS` disparaissent, remplacées par un chargement via `getProduitCategories(moduleType)` + une petite UI inline "Gérer les catégories" (ajout/suppression, même esprit que le reste de l'app — pas de nouvelle page dédiée). `DevisModule`/`ClientPrixSection` : la fusion manuelle des deux catalogues + tagging `_stockModule` disparaît (un seul appel `getProduits()`, chaque item porte déjà son `module`) — corrige au passage un bug de collision de clé React déjà repéré dans le `<datalist>` de `DevisModule` (keyé par `item.id` seul, alors que les ids pouvaient collisionner entre les deux anciennes tables). `AIAssistantModule`/`ForecastingModule`/`HomeOverview`/`NotificationsModule` : `getPoulaillerStocks()` → `getProduits('Poulailler')`.

**Vérification** (suivant le protocole du plan approuvé — répétition avant production, pas de raccourci) :
- **Répétition complète sur une copie restaurée** : dump explicite pris avant toute action (`backups/pre_produits_migration_2026-08-18.dump`), restauré dans un conteneur Postgres jetable, `migrate.js` exécuté deux fois de suite dessus (la deuxième exécution a révélé le bug d'idempotence ci-dessus), puis un backend complet lancé contre cette copie pour une passe HTTP complète (voir ci-dessous) — c'est cette répétition qui a permis de trouver les deux bugs avant qu'ils n'atteignent la production.
- **Migration réelle** : appliquée via `docker-compose run --rm backend node src/db/migrate.js` (image fraîchement construite, avant redémarrage du backend réel — respecte le séquencement "schéma+fusion doit terminer avant que le nouveau backend ne serve du trafic") contre la vraie base de production. Résultat vérifié directement en base : 3 `produits` (1 Cultures + 2 Poulailler, correspondant exactement aux données réelles de l'entreprise 1), 8 `produit_categories`, zéro orphelin sur `achats_lignes`/`devis_lignes`/`stock_mouvements`/`client_prix`.
- **HTTP réel contre la production** (entreprise jetable, nettoyée après — cascade incomplète comme d'habitude, nettoyage manuel de `devis`/`clients` avant `entreprises` en plus des tables listées dans la note de nettoyage plus haut dans ce fichier) : CRUD produits/catégories, cycle achat Brouillon→Commandé→Reçu→annulation avec vérification exacte des quantités et de `stock_mouvements`, devis avec des lignes des deux modules dans un même document (confirme la non-collision d'ids), isolation cross-tenant (lecture/écriture/suppression d'une autre entreprise → 404 ou liste vide, jamais de fuite), rejet correct d'un `stockId` valide mais du mauvais module, catégorie protégée contre la suppression tant qu'un produit l'utilise (409) puis suppression réussie une fois l'article retiré.
- **Navigateur réel** (entreprise jetable "Browser Verify Produits SARL", nettoyée après) : onglet Stocks (ajout d'article, catégorie affichée correctement, modale d'historique), gestionnaire de catégories inline (ajout d'une catégorie confirmé visuellement), formulaire Achats — taper le nom exact d'un article a bien préempli le prix unitaire depuis le nouveau catalogue `produits`. Aucune erreur dans la console du navigateur liée à l'app.
- `npx vite build`, `npm test` (racine), `server/npm test` tous verts après chaque étape de code.

Pas encore fait dans cette passe (étapes 2-4 de la feuille de route ERP, voir la mémoire correspondante) : contacts unifiés (`clients`/`fournisseurs` → une seule ressource type `un modèle de contact standard`), vraies listes de prix nommées et réutilisables (remplaçant `client_prix`), lignes de devis enrichies (remise %, lignes de section/note, quantités livrée/facturée séparées).

### Contacts unifiés (fusion clients/fournisseurs) — étape 2 de l'alignement ERP (2026-08-18)

Suite de l'étape 1 (`produits`, commit `58c150f`). Cette fois l'utilisateur a explicitement demandé, à l'inverse de ma recommandation initiale, de **tenter un rapprochement automatique** des fiches `clients`/`fournisseurs` existantes qui représentent déjà la même entité (aujourd'hui deux fiches sans aucun lien) — voir mémoire `project_erp_full_architecture_alignment` pour la feuille de route complète.

**Conception** :
- `contacts` unifie `clients`/`fournisseurs` avec deux booléens indépendants `est_client`/`est_fournisseur` (`CHECK (est_client OR est_fournisseur)`) — contrairement à `produits.module` (un enum, un article n'est que Cultures OU Poulailler), un contact réel peut légitimement être les deux à la fois, ce qui est le but même de la fusion.
- **Rapprochement à deux niveaux** : tier 1 (SIRET identique non vide, confiance haute) puis tier 2 (nom+prénom identiques, seulement si la correspondance est non-ambiguë — un seul candidat de chaque côté, sinon on ne devine pas). Chaque paire fusionnée journalisée en clair pendant la migration. **Sur les vraies données de production, zéro paire candidate trouvée** (8 clients / 2 fournisseurs, aucun nom ni SIRET en commun) — la logique de rapprochement a été testée positive/négative avec des paires synthétiques dans un environnement jetable avant de conclure ça, donc "zéro fusion" reflète l'état réel des données, pas un bug du matching.
- **Anti-collision d'ids** : contrairement à `produits.legacy_table`/`legacy_id` (une seule origine possible), un contact fusionné vient des deux tables à la fois — deux colonnes nullables séparées `legacy_client_id`/`legacy_fournisseur_id` (chacune `UNIQUE`) à la place.
- **Différence structurelle avec l'étape 1** : `devis.client_id`, `client_prix.client_id`, `achats_documents.fournisseur_id` sont de **vraies contraintes FK** (contrairement à `stock_id`, qui n'en a jamais eu) — il a fallu les supprimer avant de repointer les colonnes puis en recréer de nouvelles vers `contacts(id)` avec les mêmes `ON DELETE` qu'avant (noms de contraintes retrouvés dynamiquement via `pg_constraint`, aucune n'étant nommée explicitement dans le schéma d'origine).
- **Harmonisation** (même raisonnement qu'à l'étape 1 pour `produits.user_id`) : `contacts.entreprise_id` en `CASCADE` (`clients.entreprise_id` n'avait aucun `ON DELETE`), `contacts.user_id` en `SET NULL` (`clients.user_id` était `CASCADE`) — changement de comportement réel, vérifié en répétition avant production.
- **Surface API** : nouvelle ressource `/api/contacts` (`GET ?type=client|fournisseur`), remplace `/api/business/clients*`/`/api/business/fournisseurs*` (bloc supprimé de `business.js`, qui garde `finances` intact).
- **Frontend** : `ClientsModule`/`FournisseursModule` (quasi identiques octet pour octet) fusionnés en un seul `ContactsTab({ type })`, même principe que `StocksTab({ moduleType })` à l'étape 1. Case à cocher "Est aussi fournisseur"/"Est aussi client" dans le formulaire d'ajout et la modale d'édition. `roles.js` inchangé — l'asymétrie `comptable` (voit Clients, pas Fournisseurs) reste garantie par les mêmes clés de permission, qui pilotent simplement quel `type` est rendu.

**Idempotence de la migration corrigée dès l'écriture initiale cette fois** (bug trouvé à l'étape 1 par une répétition, anticipé ici directement) : garde basée sur l'existence d'une table `clients_legacy_%`, pas sur l'existence de `clients` elle-même (le bloc SQL principal recrée sans le vouloir une coquille vide à chaque relance de `migrate.js` une fois la vraie fusion faite).

**Un vrai bug SQL trouvé et corrigé pendant la répétition** (avant de toucher la production) : la requête d'insertion des contacts fusionnés (tier 1, SIRET) référençait `client_id`/`fournisseur_id` dans une sous-requête sans les aliaser depuis `cl2.id`/`fo2.id` — "column client_id does not exist". Corrigé en explicitant les alias.

**Vérification** :
- Étape supplémentaire propre à cette migration (au-delà de la répétition déjà systématique) : la requête de rapprochement elle-même testée en isolation (lecture seule) sur une copie des vraies données avant d'écrire la fonction de fusion complète, avec des paires synthétiques insérées temporairement pour confirmer les détections positives (SIRET, nom non ambigu) et négatives (nom ambigu — 1 client vs 2 fournisseurs du même nom, correctement exclu) — la logique n'a été considérée fiable qu'après ces deux confirmations.
- Répétition complète (dump explicite, conteneur Postgres jetable, `migrate.js` lancé deux fois — idempotence confirmée dès la première tentative), y compris la création d'un nouveau devis et d'un nouvel achat contre la copie migrée pour confirmer que les nouvelles contraintes FK acceptent bien les nouveaux ids `contacts`.
- Migration réelle appliquée en production (10 contacts, 0 rapprochement — cohérent avec la prévisualisation), zéro orphelin sur `devis`/`client_prix`/`achats_documents`.
- HTTP réel contre la production (entreprises jetables, nettoyées après) : CRUD contacts, contact double-rôle visible dans les deux listes filtrées, devis/achat/`client_prix` fonctionnels sur des contacts réels, suppression bloquée par un devis renvoie toujours `409` avec le message mis à jour, isolation cross-tenant.
- Navigateur réel (entreprise jetable "Browser Verify Contacts SARL", nettoyée après) : contact double-rôle créé depuis l'onglet Clients avec la case "Est aussi fournisseur", confirmé visible et correctement étiqueté dans les deux onglets Clients ET Fournisseurs (couleur d'accent, libellés adaptés par type) — le comportement central que cette étape devait permettre. Aucune erreur console liée à l'app.
- `npx vite build`, `npm test` (racine), `server/npm test` tous verts.

Reste à faire (étapes 3-4 de la feuille de route ERP) : listes de prix nommées et réutilisables (remplaçant `client_prix`), lignes de devis enrichies (remise %, sections/notes, quantités livrée/facturée séparées).

### Listes de prix nommées et réutilisables (remplace client_prix) — étape 3 de l'alignement ERP (2026-08-18)

Suite des étapes 1 (`produits`, commit `58c150f`) et 2 (`contacts`, commit `5354940`). `client_prix` (une ligne = un prix négocié pour **un seul client**, jamais réutilisable) remplacée par `listes_prix`/`listes_prix_lignes` — un objet nommé assignable à plusieurs contacts à la fois, comme le champ "Liste de prix" d'une commande dans un ERP de référence.

**Contexte de risque** : `client_prix` était **vide en production** au moment de cette migration (zéro ligne, vérifié directement — les seules lignes passées étaient des données de vérification déjà nettoyées lors des étapes 1/2), ce qui a beaucoup réduit le risque côté données.

**Bug trouvé en préparant le plan, avant même d'écrire du code** : `server/src/db/migrate.js` avait deux fonctions (`mergeStocksIntoProduits`, `mergeClientsFournisseursIntoContacts`) qui touchaient `client_prix` sans condition, en s'appuyant sur le fait qu'elle existait toujours (jamais renommée, seulement modifiée sur place par les étapes précédentes). Cette étape supprime le `CREATE TABLE IF NOT EXISTS client_prix` du bloc SQL principal (une base neuve n'en a plus besoin) — **sans corriger ces deux fonctions, une base neuve aurait planté dès le premier `migrate.js`** (`relation "client_prix" does not exist"), un échec pire que celui visé par le changement. Corrigé en gardant chaque instruction touchant `client_prix` derrière un test `to_regclass('public.client_prix') IS NOT NULL`, dans les deux fonctions.

- **DB** : `listes_prix` (`entreprise_id`, `nom`, `UNIQUE(entreprise_id, nom)`) et `listes_prix_lignes` (`liste_prix_id`, `stock_id`, `prix`, `UNIQUE(liste_prix_id, stock_id)`) — **contrairement à l'ancienne `client_prix`, pas de colonne `stock_module`** : depuis la fusion produits (étape 1), `stock_id` est non-ambigu à lui seul, et `listes_prix_lignes.stock_id` a même une vraie contrainte `FOREIGN KEY REFERENCES produits(id)` (impossible avant, `client_prix` datant d'avant cette fusion). `contacts.liste_prix_id` (nullable, `ON DELETE SET NULL`) assigne une liste à un contact — `NULL` = pas de liste, chaque article garde son `prix_defaut`.
- **Migration** (`migrateClientPrixToListesPrix`, appelée après la fusion contacts) : idempotente sur l'absence de `client_prix` (couvre à la fois "déjà migrée" et "base neuve qui ne l'a jamais créée"). Chemin réel (0 ligne) : `DROP TABLE` direct. Chemin défensif non exercé par les vraies données (>0 lignes, ex. autre environnement) : une liste par client concerné nommée "Tarifs {nom}" (dédoublonnée si besoin), ses lignes copiées sans `stock_module`, le contact réassigné.
- **Backend** : nouvelle ressource `server/src/routes/listesPrix.js` (`/api/listes-prix` — CRUD des listes + leurs lignes, suppression d'une ligne via jointure `USING listes_prix`, même pattern que la suppression d'une intervention de maintenance dans `equipements.js`). `routes/prixClient.js` supprimé entièrement. `routes/contacts.js` : `liste_prix_id` ajouté à `CONTACT_COLUMNS`, nouvelle route `GET /:id/prix-effectifs`. **Piège réel dans `PUT /contacts/:id`** : le pattern `COALESCE($n, colonne)` déjà utilisé pour tous les autres champs ne permet jamais d'écrire explicitement `NULL` — or "désassigner une liste" est une écriture légitime de `NULL`, que `COALESCE` aurait silencieusement ignorée en gardant l'ancienne valeur pour toujours. Corrigé avec `Object.prototype.hasOwnProperty.call(req.body, 'listePrixId')` pour distinguer "non fourni" de "fourni à null", et un `CASE WHEN` au lieu d'un `COALESCE` pour cette seule colonne.
- **Frontend** : `ClientPrixSection` (par contact) remplacée par `ListesPrixManager` (par entreprise, panneau repliable même esprit que "Gérer les catégories" de `StocksTab` à l'étape 1) — gère toutes les listes et leurs lignes, indépendamment de tout contact sélectionné. `ContactsTab` gagne un sélecteur "Liste de prix" (gated `type === 'client'`) dans le formulaire d'ajout et la modale d'édition, plus une ligne en lecture seule dans le détail du contact. `DevisModule` : `loadClientPrixMap` appelle `getContactPrixEffectifs` au lieu de `getPrixClient` ; la map passe de la clé composite `${module}:${id}` à `stockId` seul (simplification permise depuis la fusion produits, l'ancienne `client_prix` datant d'avant).
- **Vérification** : au-delà de la répétition standard (dump, conteneur jetable, `migrate.js` ×3 pour confirmer l'idempotence), une répétition **supplémentaire contre une base totalement neuve** (jamais migrée) a spécifiquement exercé le chemin où les deux fonctions corrigées tournent sans que `client_prix` ait jamais existé — c'est le seul moyen de vérifier que le bug trouvé est bien corrigé, pas juste contourné. HTTP réel : liste créée, assignée à 2 contacts différents, prix identiques confirmés via `prix-effectifs` et préremplissage devis, désassignation explicite (`listePrixId: null`) vérifiée, suppression de liste confirmée détacher les contacts (`ON DELETE SET NULL`) sans les supprimer, nom de liste dupliqué → 409, isolation cross-tenant. Navigateur réel (entreprise jetable) : `ListesPrixManager` (création, dépliage, ajout/suppression de ligne), sélecteur "Liste de prix" dans la modale d'édition confirmé fonctionnel (un premier essai de clic sur l'option d'un `<select>` natif via l'automatisation avait raté la sélection — pas un bug de l'app, confirmé en refaisant via le clavier). `npx vite build`, `npm test` (racine), `server/npm test` tous verts.

Reste à faire (étape 4 de la feuille de route ERP) : lignes de devis enrichies (remise %, sections/notes, quantités livrée/facturée séparées).

### Lignes de devis enrichies (remise %, sections, quantités livrée/facturée) — étape 4 et dernière de l'alignement ERP (2026-08-18)

Suite des étapes 1 (`produits`, commit `58c150f`), 2 (`contacts`, commit `5354940`) et 3 (`listes_prix`, commit `3d2b5f6`). Inspirée de la commande réelle SO8934 inspectée en direct sur le compte ERP de l'utilisateur (mémoire `project_erp_reference_account`) : trois enrichissements de `devis_lignes`, jusqu'ici une simple table à plat sans notion de remise en pourcentage, de ligne non-produit, ni de suivi post-signature.

**Choix délibéré, cohérent avec la philosophie minimale du projet** : `quantite_livree`/`quantite_facturee` sont des champs de suivi **manuels**, pas un vrai moteur de workflow — l'app n'a aucun concept de livraison partielle ni de facturation par ligne (la facturation reste un événement au niveau du document entier). Reproduire le calcul automatique d'un ERP de référence (basé sur de vrais mouvements de stock/factures) aurait été disproportionné ; on affiche et permet de corriger l'information sans la dériver d'un vrai sous-système.

**Point de conception** : ces deux champs n'ont de sens qu'après signature, mais la modale d'édition classique (`editForm`/`PUT /devis/:id`) n'est accessible qu'en `Brouillon`. Plutôt que d'ouvrir l'édition post-signature (ce qui aurait aussi rouvert la porte à modifier prix/quantités d'un document déjà engagé), ils sont éditables uniquement depuis la **popup de détail en lecture seule** (accessible à tout statut), via une route dédiée sans verrou de statut.

**Conversion `remise` (montant fixe) → `remise_pourcentage`** : une seule ligne réelle en production avait une remise non nulle (`devis_lignes.id=33`, `devis_id=16`, sous-total 45×555=24 975, `remise=10.00`) → convertie en `remise_pourcentage=0.04%`, avec un écart résiduel documenté et accepté de 0.01 FCFA (limite de précision `NUMERIC(5,2)`) sur cette seule ligne historique — le total du devis lui-même (`devis.total`) n'est jamais touché par cette conversion, vérifié avant et après migration (`24 965.00` inchangé).

- **DB** (`server/src/db/migrate.js`) : `devis_lignes` gagne `remise_pourcentage NUMERIC(5,2) DEFAULT 0`, `type TEXT DEFAULT 'produit'` (`CHECK (type IN ('produit','section'))`), `quantite_livree`/`quantite_facturee NUMERIC(12,2) DEFAULT 0` ; l'ancienne `remise NUMERIC(12,2)` retirée de la `CREATE TABLE` d'origine. Un backfill de cohérence met `quantite_facturee = quantite` pour toute ligne produit d'un devis déjà `Facturé`/`Non payé`/`Payé partiellement` avant cette étape (sinon incohérent avec ce que `POST /:id/facturer` applique désormais pour toute future facturation) — `quantite_livree` n'est volontairement **pas** rétro-remplie, aucun événement de livraison n'existant dans l'app pour l'inférer.
- **Bug de migration trouvé pendant la répétition, même classe qu'aux étapes 1-3** : une instruction `ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS remise NUMERIC(12,2) DEFAULT 0` **préexistante à cette session** (datant de l'introduction initiale de `remise`, jamais touchée par les étapes 1-3) recréait silencieusement la colonne juste retirée à chaque relance de `migrate.js`, avant que `migrateRemiseToPourcentage()` s'exécute — qui la retrouvait alors "encore là", reconvertissait 0 ligne (fraîchement à zéro) et la re-supprimait, masquant la casse d'idempotence derrière un message de succès à chaque fois. La leçon déjà tirée aux étapes précédentes ("vérifier toutes les instructions qui pourraient ressusciter un objet retiré, pas seulement celle qu'on modifie") s'applique donc aussi à du code que la session en cours n'avait pas écrit. Corrigé en supprimant cette instruction et en retirant `remise` de la `CREATE TABLE` d'origine pour cohérence totale avec la convention des étapes 1-3.
- **`migrateRemiseToPourcentage()`** : idempotente sur l'existence de la colonne `remise` (`information_schema.columns`). Calcule `remise_pourcentage = ROUND((remise / NULLIF(quantite*prix_unitaire,0)) * 100, 2)`, vérifie l'écart maximal entre l'ancien total et le nouveau (tolérance 0.02, couvre l'écart de 0.01 documenté ci-dessus), lève une erreur (`ROLLBACK`) si dépassée, puis `DROP COLUMN remise`.
- **Backend** (`server/src/routes/devis.js`) : deux helpers `normalizeLigne`/`ligneTotal` (défense en profondeur côté serveur — une section a toujours `quantite`/`prixUnitaire`/`remisePourcentage` à 0 et `recolteId`/`stockId`/`stockModule` à `null`, quoi que le client envoie). `getDevisComplet`, `GET /public/:token`, `GET /public/:token/pdf` : SELECT gagne `type, remise_pourcentage` (remplace `remise`) ; `getDevisComplet` seul expose aussi `quantite_livree`/`quantite_facturee` (routes publiques exclues — champs de suivi interne, pas destinés au client). `POST /`, `PUT /:id` : total recalculé via `ligneTotal`, INSERT à 10 colonnes (`type`/`remise_pourcentage` remplacent `remise`). `GET /ledger` : ajoute `AND dl.type = 'produit'` — une section n'entre jamais dans la Comptabilité comme vente fantôme, vérifié en navigateur (voir plus bas). `POST /:id/facturer` : nouvel `UPDATE devis_lignes SET quantite_facturee = quantite WHERE devis_id = $1 AND type = 'produit'` dans la même transaction — seul événement réel de "ceci est facturé" que l'app modélise, symétrique au mouvement de stock déjà déclenché à la signature. Nouvelle route `PATCH /:id/lignes-quantites` (`requireRole('admin')`, aucun verrou de statut — réinscriptible même après l'auto-remplissage de `facturer`), qui met à jour librement `quantite_livree`/`quantite_facturee` par ligne. `server/src/utils/stockSync.js` : **aucun changement nécessaire** — une ligne de section a `quantite=0` donc `delta` falsy, le garde-fou déjà en place (`if (!nom || !delta) return;`) la neutralise sans code supplémentaire, confirmé par la sync stock qui ne bouge que sur la ligne produit (95 après signature, jamais affectée par la section).
- **`server/src/utils/devisPdf.js`** : colonne "Remise" relabellée "Remise (%)", affichée en `%` au lieu de FCFA. Une ligne `type==='section'` s'affiche en gras sur toute la largeur, sans les colonnes numériques (skip du reste de l'itération). `quantite_livree`/`quantite_facturee` volontairement **jamais imprimés** — champ de suivi interne non garanti à jour, pas destiné à figurer sur un document que le client pourrait prendre pour un bordereau de livraison officiel. Le test existant (`devisPdf.test.js`, lignes sans `type`/`remisePourcentage`) passe sans modification (`undefined` retombe proprement sur les valeurs par défaut).
- **Frontend** (`src/App.jsx`, `DevisModule`) : `emptyLigne` gagne `type: 'produit'`/`remisePourcentage` (remplace `remise`) ; nouveau `emptySectionLigne`. Bouton "Ajouter une section" à côté de "Ajouter une ligne" (formulaire d'ajout et modale d'édition). Rendu conditionnel par ligne : une section n'affiche qu'un champ titre + bouton supprimer, un produit garde la grille complète avec "Remise (%)". `totalForm`/`totalEditForm` sautent les sections et appliquent la formule pourcentage via un `ligneTotal` local (miroir du helper backend). Popup de détail : en-tête `Produit | Qté | P.U. | Remise (%) | Livré | Facturé | Total`, une section s'affiche en une seule cellule pleine largeur en gras, les lignes produit gagnent deux champs Livré/Facturé éditables (state local `quantitesEdit`, peuplé à l'ouverture depuis les valeurs serveur) visibles uniquement hors `Brouillon`, plus un bouton "Enregistrer les quantités" appelant la nouvelle route puis rafraîchissant la popup. `src/lib/api.js` : `updateDevisLigneQuantites(id, lignes)`.
- **Vérification** : répétition complète contre une copie restaurée de la production réelle (dump explicite, conteneur jetable, `migrate.js` ×3) — confirme `devis_lignes.id=33 → remise_pourcentage=0.04`, `quantite_facturee=45.00` rétro-rempli (devis 16, `statut='Facturé'`), `devis.total` inchangé (`24 965.00`), colonne `remise` disparue, idempotence sur les runs suivants ; migration réelle appliquée en production avec un résultat identique. HTTP réel (throwaway) : devis section+produit+remise 10%/20% → total exact à la FCFA près dans les deux sens (création et `PUT`), validation manuelle → mouvement de stock uniquement sur la ligne produit (jamais la section), `facturer` → `quantite_facturee` auto-remplie sur la ligne produit seule, `GET /ledger` exclut la section, `PATCH lignes-quantites` persiste et n'est jamais réinitialisé par les autres routes, route publique (`GET /public/:token`, `POST /public/:token/signer`, `GET /public/:token/pdf`) correctement exposée avec `type`/`remisePourcentage` et sans les champs de suivi interne, `remettre-brouillon` restitue exactement le stock décrémenté à la signature. PDF (privé et public) généré sans erreur y compris sur la ligne réelle historique `id=33`. Navigateur réel (entreprise jetable "Browser Verify Devis SARL", nettoyée après) : création d'un devis avec section + remise 20% (total live-recalculé à 16 000 FCFA), popup de détail affichant correctement la section en gras et les champs Livré/Facturé, édition et persistance de `Livré=2` confirmée après fermeture/réouverture de la popup, "Valider et facturer" → `Facturé=4` auto-rempli en préservant `Livré=2`, Comptabilité confirmant une seule ligne de vente (la section n'apparaît jamais). `npx vite build`, `npm test` (racine), `server/npm test` tous verts à chaque étape.

**feuille de route ERP terminée** — les 4 étapes (`produits`+catégories, `contacts` unifiés, `listes_prix` nommées, lignes de devis enrichies) sont toutes conçues, exécutées et vérifiées en production. Rien n'est identifié comme prochaine étape de cette initiative ; toute suite (ex. facturation fournisseur, comptabilité en partie double) serait une nouvelle décision produit, pas la continuation d'un plan déjà arrêté.

### RH complète — alignement sur le module RH open source de l'ERP (2026-08-27/28)

Gros chantier : le module Employés passe d'une fiche à plat (nom/poste texte/salaire/champs `presence`/`avances`/`conges` plats) à une vraie RH. 6 volets, tous **additifs** (les colonnes/tables RH pré-existantes ne sont pas retirées) — voir la mémoire correspondante pour la feuille de route et les 5 simplifications assumées vs l'ERP (pas de moteur de paie — `hr_payroll` est Enterprise, absent du clone ; contrats = table dédiée pas le modèle « versions » ; validation congé 1 niveau ; calendrier de travail minimal ; feuilles de temps imputées directement parcelle/poulailler).

- **DB** (`server/src/db/migrate.js`, bloc « RH complète ») : `departements`, `postes`, `jours_feries`, `conges_types`, `conges_droits`, `salaries_contrats`, `salaries_temps` (toutes `entreprise_id NOT NULL ON DELETE CASCADE`) + colonnes sur `salaries` (`poste_id`, `departement_id`, `manager_id` auto-réf., `photo` base64, état civil/contact urgence/pièce identité, `date_depart`/`motif_depart`, `cout_horaire`, `heures_hebdo`, `jours_travailles` CSV) + `salaries_conges` enrichie (`type_id`, `nb_jours`, `demi_jour_debut`/`_fin`) + `equipements.salarie_id`. 3 fonctions d'amorçage idempotentes (`seedCongesTypesForExistingEntreprises`, `migratePostesFromSalaries` : crée un `postes` par intitulé texte distinct + relie `poste_id` ; `migrateContratsFromSalaries` : un CDI amorcé depuis `salaries.salaire`). `salaries` elle-même n'avait jamais été créée par `migrate.js` (même trou que `poulailler_stocks.entreprise_id`) — `CREATE TABLE IF NOT EXISTS` ajouté. Register (`auth.js`) seede aussi les 4 types de congés par défaut.
- **Calcul de la durée d'un congé** : `server/src/utils/congesJours.js` — jours ouvrés hors dimanche + jours fériés (`jours_feries` par entreprise, aucune liste pré-remplie — appli multi-continents) + calendrier `jours_travailles` du salarié si renseigné, demi-journées `-0,5`. **Congé approuvé → lignes de présence `'Congé'` posées automatiquement** sur chaque jour ouvré ; retirées au refus / repassage en Demandé depuis Approuvé / suppression d'un congé approuvé.
- **Backend** : `server/src/routes/rh.js` (nouveau, `/api/rh` — CRUD départements/postes/jours-fériés/types-de-congés) + `server/src/routes/salaries.js` réécrit : self-service (`GET /moi`, helper `resolveAccessibleSalarie` = admin OU le salarié lié OU son manager direct), contrats (nouveau contrat désactive les précédents + resync `salaries.salaire`), droits & **solde** (`alloué − Σ nb_jours approuvés de l'année`), feuilles de temps (imputables parcelle/poulailler, validées entreprise), **bulletin mensuel estimé** (`net ≈ salaire − avances du mois − retenue absences non payées`, lecture seule), `journal_modifications`/`activites`/`messages` branchés sur `ressource_type='salarie'` (ajouté à `RESSOURCES_VALIDES` dans `activites.js`/`messages.js`). Écritures RH = `requireRole('admin')`, **sauf** la création d'une demande de congé (self-service : admin OU soi) ; l'approbation reste admin OU manager, jamais soi-même.
- **Frontend** : `EmployeesModule` (`App.jsx`) réécrit — avatar (`ContactAvatar` réutilisé), sélecteurs Poste/Département/Manager, bloc « informations complémentaires » repliable, filtre par département, vue trombinoscope, « créer un compte de connexion » depuis la modale d'édition, statut/date/motif de départ, panneau `RhReferentiels` repliable. `src/components/EmployeeRhModal.jsx` réécrit en notebook 10 onglets (Infos/Présences/Congés/Avances/Contrats/Temps/Bulletin/Historique/Activités/Messages), gabarit 800px, `.data-table`/`.field-group`. `src/components/MonEspaceRh.jsx` (nouveau) — onglet « Mon espace RH » ungated (comme Profil/Aide), self-service : sa fiche + solde + demande de congé + présences/avances/bulletin en lecture seule ; état vide propre si aucune fiche liée. `src/components/RhReferentiels.jsx` (nouveau). `roles.js` inchangé (le tab `employees` reste gaté admin/directeur/gestionnaire).
- **Vérifié** : migration base neuve (ordre des FK OK) + base existante ×3 idempotente ; HTTP réel bout en bout (solde/décompte/congé→absence, contrat qui resync le salaire, bulletin, cross-tenant 404, self-service : ouvrier voit `/moi`, pose un congé, ne peut pas l'approuver → 403) ; navigateur réel sur entreprise jetable (supprimée après). `npx vite build` + les deux `npm test` verts.

### Internationalisation — plomberie i18n + devise/locale par entreprise (étape 1, 2026-08-28)

Décision produit forte, réaffirmée 3×, à traiter comme **prérequis de mise en production** et non du backlog : l'appli vise **tous les continents dès l'ouverture**, donc UI multilingue + formats localisés sont dans la définition de « livrable » (voir la mémoire `feedback_global_scope_not_local`). Étape 1 = la plomberie + une tranche verticale de référence, **pas** la traduction des ~6000 chaînes (migration au fil de l'eau ensuite).

- **Deux axes distincts, modèle ERP** : (1) **langue de l'UI = choix par utilisateur**, persistée `localStorage` (`agri-lang`, + flag `agri-lang-explicit`), gérée par `i18next` + `react-i18next` + `i18next-browser-languagedetector` (nouvelles deps, `--legacy-peer-deps`). (2) **devise + locale de formatage = par entreprise** (`entreprises.devise` TEXT DEFAULT `'XOF'`, `entreprises.locale` TEXT DEFAULT `'fr-FR'`) — une entreprise = une devise, l'affichage seul est localisé, **pas** de conversion multi-devise (les colonnes montants ne changent pas).
- **Fichiers** : `src/i18n/index.js` (config, catalogues `fr.json`/`en.json` importés en dur pour l'instant — passer à `import()` par langue quand la liste s'allongera), `src/i18n/locales/{fr,en}.json` (amorcés avec la tranche de référence seulement), `src/lib/locale.jsx` (`LocaleProvider` + `useLocale()` + helpers `fmtMoney`/`fmtNumber`/`fmtDate` via `Intl.*` lisant un `_config` module-level tenu synchro — appelables aussi hors composant ; + `fmtMoneyWith`/`fmtDateWith` à locale/devise explicites pour les aperçus ; listes `DEVISES`/`LOCALES`). `main.jsx` importe `./i18n` et enrobe `<App>` d'un `<LocaleProvider>`.
- **Backend** : `auth.js` (register accepte `devise`/`locale` ; register/login/`/me` les renvoient dans `entreprise`), `entreprise.js` (`GET`/`PUT /entreprise` les exposent ; `updateEntreprise`/`getEntreprise` ajoutés à `src/lib/api.js` — `PUT /entreprise` n'était câblé à aucune UI jusqu'ici).
- **App.jsx** : `handleAuth` + l'effet de vérification du token appellent `applyEntrepriseLocale(entreprise)` → `setLocaleConfig({devise, locale})` + (si aucun choix de langue explicite) aligne la langue UI sur la locale entreprise (`en-US` → `en`). Tranche convertie : libellés de `availableTabs` (`t('nav.*')`), en-têtes de groupe `SidebarNav` (`NAV_CATEGORIES` porte un `labelKey`), tout `LoginScreen` (+ 2 sélecteurs devise/locale à l'inscription), et `ProfilModule` (nouvelle carte « Préférences » : sélecteur de langue par utilisateur + devise/locale entreprise réservés admin + aperçu live montant/date + « Enregistrer »).
- **Convention pour la suite** (migration incrémentale des ~5900 chaînes restantes) : toute chaîne visible ajoutée passe par `t('namespace.clé')` avec l'entrée correspondante dans `fr.json` **et** `en.json` ; tout montant affiché passe par `fmtMoney(...)` (ou `useLocale().fmtMoney`) au lieu de `x.toLocaleString('fr-FR') + ' FCFA'` ; toute date par `fmtDate(...)`. Ne **jamais** ajouter de nouvelle chaîne française en dur ni de `' FCFA'` concaténé.
- **Vérifié navigateur réel** (entreprise jetable EUR/`en-US`, supprimée après) : register renvoie bien `devise`/`locale` ; à la connexion l'UI bascule en anglais automatiquement (`agri-lang=en`, libellés nav EN, zéro reliquat FR) et les montants se formatent en `€` ; carte Préférences OK (sélecteur langue bascule l'UI sans reload + pose le flag explicite ; changer devise/locale met l'aperçu à jour immédiatement ; « Enregistrer » persiste — `GET /entreprise` confirme `XOF`/`fr-CI`). `npx vite build` + les deux `npm test` verts.

**Migration incrémentale — passe 1 (2026-08-28)** : tout le parcours de première impression est bilingue (chrome de l'app + premier écran). Convertis : topbar (`shell.*` — Gérer les options / En ligne-Hors ligne / synchro, `role.*` pour le badge de rôle, `fmtDate` pour la date de dernière synchro), les 3 écrans d'onboarding (`onboarding.*`), `ModulesScreen` + `OptionCard` (`modulesScreen.*` avec `features` en tableaux via `returnObjects:true`, `optionCard.*`), `HomeOverview` (`home.*` — 8 cartes via `fmtMoney`, alertes avec pluriels `_one`/`_other` et `{{amount}}` via `fmtMoney`), `NotificationsModule` (`notifications.*` — messages interpolés, montant facture via `fmtMoney`). Vérifié navigateur (entreprise jetable USD/en-US) : ces écrans 100% EN, aucun reliquat FR, aucune erreur console i18n ; bascule retour FR OK ; le `$` reste appliqué même en UI française (devise = par entreprise, langue = par utilisateur — comportement voulu). **Reste** : tous les gros modules métier (Cultures, Poulailler, Devis, Finances, Contacts, Achats, RH, Calendrier, Récoltes, Rapports, Prévisions, Assistant, Observations, Équipements, Feedback, Aide…) — encore en FR en dur, à migrer module par module en suivant la même convention.

### 2FA par email + nettoyage de la carte « Méthode de vérification (entreprise) » (2026-08-29)

Chantier Jalon 1 (plan validé, cf. mémoire `project_mfa_cleanup_email_2fa`). Avant : seule la 2FA
TOTP (application d'authentification) fonctionnait de bout en bout ; `ProfilModule` affichait en
plus une carte admin « Méthode de vérification (entreprise) » qui appelait `GET`/`PUT
/api/mfa/company-method` — **route inexistante**, échecs silencieux, réglage jamais persisté ni lu
au login. `mailer.js` avait déjà `sendMfaCodeEmail()` complète mais **zéro appelant**.

**Inspiration de l'ERP de référence** (`addons/auth_totp` + `auth_totp_mail` du clone local) : le
code envoyé par email n'est **jamais stocké**. Il est *dérivé* à la demande d'une clé serveur +
identité utilisateur sur un pas de temps, puis recalculé à la vérification. Repris tel quel.

- **`server/src/utils/mfaCode.js`** (nouveau) : `generateEmailCode`/`verifyEmailCode` — HOTP maison
  sur HMAC-SHA256, clé `HMAC(JWT_SECRET, 'mfa-email:'+userId+':'+email)`, pas de 10 min, tolérance
  ±1 pas (validité effective 10-20 min). Aucune colonne de code, aucun nettoyage d'expiration ;
  changer `JWT_SECRET` invalide tous les codes. Aussi : `maskEmail()` (`o****@iprec.fr`) et
  `requestContext(req)` (sniff minimal navigateur/OS/IP pour l'email de code, sans dépendance).
- **Migration** (`migrate.js`) : `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method VARCHAR(10)
  NOT NULL DEFAULT 'totp'` — seule colonne ajoutée. Les comptes ayant déjà activé la 2FA restent en
  TOTP (défaut).
- **`routes/mfa.js`** : `/setup` et `/verify` prennent `{ method: 'totp' | 'email' }` ; nouveau
  `/resend` (renvoi du code email à l'enrôlement) ; `/disable` remet `mfa_method='totp'`. Chaque
  utilisateur choisit sa méthode à l'activation (modèle GitHub/Google) — **pas** de réglage 2FA au
  niveau entreprise. Rate-limit d'envoi : 5 emails / heure / compte (compteur = lignes `audit_log`
  action `mfa_email_code_sent`), sinon 429. Nouvelle action d'audit : `mfa_email_code_sent`.
- **`routes/auth.js`** login : si `mfa_method='email'` et pas de `mfaCode` → génère + envoie le
  code (échec d'envoi non bloquant, comme `devis.js`), renvoie `{ mfaRequired:true,
  mfaMethod:'email' }` ; vérifie via `verifyEmailCode` au lieu d'otplib. Rate-limit de vérification :
  5 `login_failed_mfa` / heure → 429 (parité `code_check` de l'ERP de référence). `GET /auth/me`
  renvoie désormais `mfaMethod`.
- **`utils/auditLog.js`** : `countRecentAuditEvents(email, actions, sinceMinutes)` (renvoie 0 en cas
  d'erreur SQL — le rate-limiting ne doit jamais bloquer une connexion légitime).
- **`mailer.js`** : `sendMfaCodeEmail(to, code, context)` — ajoute une ligne appareil/navigateur/IP
  de la tentative (repère anti-phishing, même intention que l'email de code de l'ERP de référence).
- **Frontend** : `api.js` — `setupMfa(method)`/`verifyMfa(code, method)`/`resendMfaEmail()`,
  suppression de `getMfaCompanyMethod`/`setMfaCompanyMethod`. `ProfilModule` — carte « Méthode de
  vérification (entreprise) » **entièrement supprimée** (+ son state) ; carte « Sécurité du
  compte » : choix TOTP/Email avant activation, branche email avec lien « Renvoyer le code », ligne
  « Méthode active : … » une fois activée. `LoginScreen` — écran MFA affiche un hint spécifique
  quand `mfaMethod==='email'`. i18n : `auth.mfaHintEmail`, `profil.mfaChooseMethod` /
  `mfaMethodActive` / `mfaResend` / `mfaResent` ajoutés ; `companyMethod*` / `smsNote` /
  `methodSms` retirés (fr + en).
- **SMS** : toujours non traité (prestataire payant, hors budget) ; `mfa_method` reste extensible à
  `'sms'`. L'enforcement de la 2FA par politique reste reporté à l'avant-prod.
- **Vérifs** : `npx vite build` OK, `server/npm test` + racine `npm test` verts. Test HTTP e2e réel
  contre la stack Docker (script jetable, 12 assertions vertes) : parcours email complet (setup →
  502 attendu sans `EMAIL_*` mais code dérivable → verify → login 2 étapes → mauvais code 401 → bon
  code token) **et** TOTP non régressé (setup QR → verify → login). Entreprises/comptes de test
  supprimés après (nettoyage multi-tables : `produit_categories`, `audit_log`,
  `entreprise_utilisateurs`, `entreprises`, `users`).
### Journal d'audit — actions financières des devis (2026-08-29)

Dernier trou identifié du chantier « Journal d'audit » du Jalon 1 (cf. CLAUDE.md). Les
transitions de `routes/devis.js` réservées à l'admin ne laissaient qu'une trace partielle
(`finances.user_id` + `devis.statut` + le `journal_modifications` par enregistrement) ;
rien dans `audit_log`, la table de sécurité relue par `GET /api/auth/audit-log`.

- **`routes/devis.js`** : import de `logAuditEvent`, puis un appel après l'`UPDATE`/`COMMIT`
  réussi de chaque route admin, **en plus** du `logFieldChanges` existant (table et finalité
  différentes) :
  - `POST /:id/valider-manuel` → `devis_valide_manuel` (`details`: devisId, numero, statutAvant, confirmePar)
  - `POST /:id/annuler` → `devis_annule` (devisId, numero, statutAvant)
  - `POST /:id/facturer` → `devis_facture` (devisId, numero, total, modePaiement, modalitePaiement, nbEcheances)
  - `POST /:id/remettre-brouillon` → `devis_remis_brouillon` (devisId, numero, statutAvant)
  - `POST /:id/echeances/:echeanceId/payer` → `devis_echeance_payee` (devisId, numero, echeanceId, montant, nouveauStatut)
  - `PATCH /:id/lignes-quantites` → `devis_quantites_ajustees` (devisId, numero, nbLignes)
  - `userId`/`email` de la ligne = l'admin acteur ; IP/User-Agent captés via `req`.
  - 4 `SELECT` de contrôle étendus pour récupérer `numero` là où le handler ne l'avait pas.
- **Hors périmètre, assumé** : `POST /:id/envoyer` (pas gated admin, pas une transition
  financière ; garde son `logFieldChanges` + token public). Pas d'UI : il n'existe aucun
  écran de journal d'audit dans l'app (les connexions n'en ont pas non plus) — accès
  uniquement via l'API admin, cohérent avec l'existant.
- **`logAuditEvent`** avale déjà ses propres erreurs (jamais de throw) → aucun try/catch au
  point d'appel, le chemin financier ne peut pas casser à cause du journal.
- **Vérifs** : `server/npm test` vert. Test HTTP e2e contre la stack Docker (17 assertions
  vertes) : entreprise + admin jetables, un devis passé par valider-manuel → facturer
  (échelonné, 2 échéances) → payer échéance → lignes-quantites → remettre-brouillon, un
  second devis annulé, puis `GET /api/auth/audit-log` et assert de chaque action + `details`
  (devisId, numero, montants, statuts) + présence de l'email acteur et du User-Agent.
  Données de test supprimées après (nettoyage multi-tables : finances, echeances_paiement,
  devis_lignes, devis, journal_modifications, contacts, produit_categories, audit_log,
  entreprise_utilisateurs, entreprises, users).
### Backups — alerte à l'échec + test de restauration automatisé (2026-08-29)

Dernier item de code autonome du Jalon 1. Avant : `server/backup.sh` vérifiait déjà le
code retour de `pg_dump` et la non-vacuité du fichier, mais un cycle en échec ne faisait
que logger et attendre 6 h ; aucun test de restauration en dehors d'une vérif manuelle
ponctuelle (cf. section « Backups » de CLAUDE.md).

Le conteneur `backup` est une image `postgres:18-alpine` nue (pas de node → pas d'accès
au `mailer` de l'app), donc « alerte » = **fichiers sentinelles** dans `./backups/`
(monté sur l'hôte), à surveiller par un opérateur ou un futur check :
- `.last_success` — réécrit (horodatage + taille) à chaque dump réussi.
- `.last_failure` — écrit (horodatage + raison) si `pg_dump` échoue ou rend un fichier
  vide ; **supprimé** au dump réussi suivant. Présent = un dump est actuellement cassé.
- `.last_restore_test` — résultat du dernier test de restauration, `"<ts> OK …"` ou
  `"<ts> FAIL …"`. Volontairement **pas** écrit dans `.last_failure` (qu'un dump réussi
  ultérieur effacerait, masquant l'échec) — un `FAIL` en tête de ce fichier est sa propre
  alerte.

Test de restauration (`run_restore_test`, dans le même script) :
- Ne tourne qu'une fois tous les `RESTORE_TEST_INTERVAL_HOURS` (env, défaut 168 ≈ hebdo ;
  vérifié via `find -mmin` sur `.last_restore_test`), **après** dump + rotation et jamais
  de façon bloquante (`run_restore_test || true`).
- `createdb agri_app_restore_test` → `pg_restore` du dump le plus récent → comparaison
  base restaurée vs base live : nb de tables du schéma `public` + nb de lignes de `users`
  et `entreprises` → `dropdb`. `rc != 0` de `pg_restore` **ou** un compteur qui diffère
  → `FAIL`. `DB_USER` = superuser Postgres (`POSTGRES_USER`), donc create/drop autorisés.

Vérifié de bout en bout contre la stack locale : cycle normal écrit `.last_success` ;
test de restauration forcé OK (`tables 54/54 users 13/13 entreprises 9/9 rc=0`) et base
jetable bien supprimée (aucun résidu) ; échec de `pg_dump` simulé (mauvais `DB_NAME`)
écrit `.last_failure` + `exit 1` sans toucher `.last_success` ; le cycle réussi suivant
efface `.last_failure`. `find -mmin` confirmé supporté par le busybox de l'image.

`Dockerfile.backup` et `docker-compose.yml` inchangés (boucle 6 h et env identiques ;
`RESTORE_TEST_INTERVAL_HOURS` peut être posé sur le service `backup` si besoin). Reste à
faire : transformer les sentinelles en vraie alerte poussée (email/webhook) — reporté à
quand l'hébergement + un SMTP existeront.
### Nettoyage post-audit statique : code mort + trou i18n dates + imports inutilisés (2026-08-29)

Suite à la passe de durcissement statique (pas de navigateur dispo cette session), trois
points relevés puis traités :

1. **Code mort supprimé** — `MovementTab` (~444 lignes) et son helper `renderInvoiceHtml`
   (~26 lignes) dans `src/App.jsx`. Confirmé jamais rendu : les onglets « Ventes » de
   Cultures/Poulailler passent par `VentesWithDevis` → `DevisModule` depuis longtemps, et
   `MovementTab` n'apparaissait dans aucun JSX. Il traînait 12 occurrences de
   `' FCFA'` / `toLocaleString('fr-FR')` en dur — sans impact car mort, mais autant les
   faire disparaître. Net : `App.jsx` −489 / +15 lignes.

2. **Trou i18n sur les dates** — `formatDateFr` / `formatDateTimeFr` (helpers de rendu
   utilisés par de nombreuses tables) forçaient le format `fr-FR` quelle que soit la
   locale de l'entreprise → une entreprise `en-US` voyait quand même `JJ/MM/AAAA`.
   Réécrits pour déléguer à `fmtDate` (de `src/lib/locale.jsx`, fonction autonome au
   niveau module, tenue à jour par `LocaleProvider` — appelable hors composant). Repli sur
   la valeur brute conservé pour les entrées illisibles. Résultat : **plus aucune**
   occurrence de `' FCFA'` / `toLocaleString('fr-FR')` dans `App.jsx`.

3. **Warnings oxlint** — 11 imports inutilisés retirés de `App.jsx` (`Sun`,
   `TrendingDown`, `Printer`, `createFinance`, `deleteFinance`,
   `create/update/deleteCulturesMouvement`, `updateProduitCategorie`,
   `create/update/deletePoulaillerMouvement`, `get{Poulailler,Cultures}MouvementHistorique`,
   `mapUiRoleToBackend`) + variable morte `toneFor`. Certains n'étaient utilisés que par
   `MovementTab`. Restent 2 warnings cosmétiques (paramètre `farmId` non utilisé dans
   deux composants) — laissés tels quels, retirer un prop change le contrat du composant
   pour un gain nul.

Vérifs : `npx vite build` OK, racine `npm test` (6) vert, `oxlint` sans erreur. Backend
non touché.
### Suite de tests d'intégration backend (2026-08-29)

Avant : 2 fichiers de test pour 25 routes (1 backend `devisPdf`, 1 frontend `ObservationListView`).
Tout le test d'API se faisait via des scripts jetables lancés à la main contre la stack
Docker. Rien ne figeait ces vérifs.

- **`server/src/app.js` (recréé)** : fabrique de l'app Express (montage de toutes les
  routes `/api/*`), sans `listen()` ni `testDatabase()`. `server.js` l'importe et se
  limite désormais à vérifier la base puis ouvrir le port. Même source de montage pour la
  prod et pour supertest. (Un ancien `app.js` — simple doublon — avait été supprimé le
  2026-08-16 ; celui-ci a un rôle différent et assumé.)
- **otplib `createRequire` → `import` ESM** dans `auth.js` et `mfa.js`. otplib 13 est
  dual ESM/CJS ; le chemin CJS tire `@scure/base` que le runtime de Jest ne sait pas
  charger (`Must use import to load ES Module`). L'import ESM natif marche aussi bien
  sous `node` qu'avec Jest `--experimental-vm-modules`. Vérifié : le serveur Docker
  reconstruit démarre et `/mfa/setup` renvoie toujours secret + QR.
- **`npm run test:integration`** (`server/jest.integration.config.cjs`) : supertest en
  ESM natif (`transform: {}`), `globalSetup` (re)crée + migre une base dédiée
  `agri_app_test` sur le conteneur `db` (port hôte 5433, **jamais** la base de dev),
  `globalTeardown` la supprime (`TEST_DB_KEEP=1` pour la garder). `env.js` (setupFiles)
  force les variables DB et vide `EMAIL_*` (les envois échouent, comportement attendu et
  asserté). `npm test` (unitaire) reste sans base : `testPathIgnorePatterns` exclut
  `src/test/integration/`.
- **Couverture (12 tests, 3 fichiers)** :
  - `auth.test.js` — register (+ email en double refusé), login (bon/mauvais mot de
    passe/email inconnu), route protégée sans token → 401, `requireRole` (ouvrier →
    403 sur `POST /business/finances`), isolation multi-tenant (contacts non listés/non
    modifiables entre entreprises, devis non lisible entre entreprises).
  - `devis.test.js` — cycle brouillon → validé manuel → facturé échelonné → paiement
    d'échéance → suivi quantités → remise en brouillon ; assertions sur chaque ligne
    `audit_log` (`devis_valide_manuel`/`_facture`/`_echeance_payee`/`_quantites_ajustees`/
    `_remis_brouillon`/`_annule`, détails + email acteur + IP) ; workflow financier
    réservé admin (ouvrier → 403).
  - `mfa.test.js` — TOTP setup/verify + login 2 étapes (mauvais code → 401) ; code par
    email (setup → 502 sans SMTP mais code dérivable, verify OK, `mfaMethod` renvoyé par
    `/auth/me` et par l'étape 1 du login, mauvais code → 401).
- Dépendance ajoutée : `supertest` (dev). Vérifié : `npm test` unitaire toujours vert,
  `npm run test:integration` 12/12 vert, base de dev `agri_app` intacte après coup,
  `agri_app_test` bien supprimée.
### Tests d'intégration — extension Achats + RH (2026-08-29)

Suite de la mise en place supertest : 12 → 23 tests, 3 → 5 fichiers.

- **`achats.test.js`** — cycle document d'achat `Brouillon → Commandé → Reçu → réception
  annulée` ; vérifie que `recevoir` crée bien une écriture `finances`
  (`Achat — <fournisseur> (<module>)`, montant négatif = `-total`) et que
  `annuler-reception` la retire ; garde-fous de transition (`recevoir` sur brouillon → 400,
  double `commander` → 400) ; validation d'entrée (module invalide / sans fournisseur /
  sans lignes → 400) ; isolation multi-tenant (B ne peut ni `GET /:id` ni `commander` le
  document de A → 404, absent de la liste).
- **`rh.test.js`** — référentiels `/api/rh` : admin crée département + poste rattaché,
  `GET` les liste, ouvrier sur `POST /departements` → 403 ; `register` seede déjà des
  types de congé par défaut (asserté) ; **congés self-service** : l'employé (via
  `GET /salaries/moi`) demande un congé Lun→Ven → `nbJours === 5`, statut `Demandé` ; il
  **ne peut pas** approuver sa propre demande (403) ; l'admin approuve → `Approuvé` ;
  `GET /:id/conges-solde` décompte correctement (`alloués 25, pris 5, restant 20`) ;
  avances réservées admin (ouvrier non lié → 403) ; nouveau contrat → un seul `actif` ;
  isolation multi-tenant (B ne voit pas l'employé de A, `POST conges-droits` sur son id
  avec le token de B → 404).
- **Helper** : `createEmployeeLogin` renvoie désormais aussi `salarieId` (nécessaire aux
  routes `/salaries/:id/*`).

Vérifs : `npm run test:integration` 23/23 vert, `npm test` unitaire toujours vert, base
de dev `agri_app` intacte (9 entreprises / 9 salariés / 4 docs d'achat inchangés),
`agri_app_test` bien supprimée après.
### Tests d'intégration — extension Contacts + Listes de prix (2026-08-30)

23 → 35 tests, 5 → 7 fichiers.

- **`contacts.test.js`** — asymétrie client/fournisseur (création client seul / fournisseur
  seul / ni l'un ni l'autre → 400 ; filtres `?type=client|fournisseur` ; un contact mixte
  apparaît des deux côtés ; `PUT` qui bascule client→fournisseur le sort de `?type=client` ;
  `PUT {false,false}` → 400) ; société + sous-contacts (`parentId`/`parentNom`, filtre
  `?parentId=`) ; tags (`POST /contact-tags`, création avec `tagIds`, `PUT {tagIds:[]}`
  détague) ; suppression (simple OK ; contact référencé par un devis → 409) ; isolation
  multi-tenant.
- **`listesPrix.test.js`** — CRUD liste (nom en double → 409, `nombreLignes`) ; lignes
  (ajout, **upsert** sur même article via `ON CONFLICT`, validation → 400, article d'une
  autre entreprise → 404, liste inexistante → 404, `stockNom`/`module` renvoyés,
  `DELETE /lignes/:id` puis re-DELETE → 404) ; assignation à un contact
  (`PUT contacts {listePrixId}`) → `GET /contacts/:id/prix-effectifs` renvoie les lignes ;
  contact sans liste → `{prix:[]}` ; **supprimer la liste détache le contact**
  (`ON DELETE SET NULL`) → `prix-effectifs` redevient `[]` ; isolation multi-tenant.
- **Helper** : `createProduit(token, {module})` (récupère une catégorie seedée puis crée le
  produit) pour alimenter les lignes de liste de prix.

- **Bug trouvé + corrigé** (par `contacts.test.js`) : `DELETE /api/contacts/:id` était bien
  cloisonné par `entreprise_id` (pas de suppression cross-tenant) mais ne testait jamais
  `rowCount` → renvoyait `{ success: true }` / 200 même sur 0 ligne (mauvais tenant ou id
  bidon), incohérent avec `PUT /:id` et tous les autres `DELETE`. Corrigé : 404 sur 0 ligne.

Vérifs : `npm run test:integration` 35/35 vert, `npm test` unitaire vert, backend Docker
reconstruit et OK, base de dev `agri_app` intacte, `agri_app_test` supprimée après.
### Tests d'intégration — extension Banques + Équipements (+ gate /api/banques) (2026-08-30)

35 → 45 tests, 7 → 9 fichiers.

- **`banques.test.js`** — CRUD (nom requis → 400, `GET` scopé, `PUT` met à jour, `DELETE`
  retire, `PUT`/`DELETE` sur id inexistant → 404) ; **rôles** : ouvrier sur
  `POST`/`PUT`/`DELETE` → 403, lecture OK ; **compte principal**
  (`PUT /entreprise/banque-principale` admin, ouvrier → 403) + effet métier : un achat
  reçu avec banque principale posée → l'écriture `finances` sort en `categorie: 'Banque'`
  (+ `banqueId`) au lieu de `Caisse` ; isolation multi-tenant.
- **`equipements.test.js`** — CRUD (nom requis, `PUT`/`DELETE` id inexistant → 404) ;
  **rôles** : ouvrier → 403 sur les écritures, `gestionnaire` (rôle autorisé) → 201,
  lecture ouverte ; **maintenance** (description requise, liste, suppression + re-
  suppression → 404, sous-route sur équipement inexistant → 404) ; isolation multi-tenant
  y compris les sous-routes.

- **`/api/banques` gated `requireRole('admin', 'directeur')`** (décision utilisateur
  explicite) sur `POST`/`PUT`/`DELETE` — avant : aucune garde, un `ouvrier` pouvait
  créer/modifier/supprimer des comptes bancaires, incohérent avec le gate des écritures
  financières (`/business/finances`) alors que les comptes sont ce que ces écritures
  référencent. `GET /` reste ouvert à tous les rôles.
- **Même classe de bug que `DELETE contacts` la veille** : `DELETE /api/banques/:id`
  renvoyait `{ success: true }` / 200 et `PUT /api/banques/:id` renvoyait `{ banque: null }`
  / 200 même sur 0 ligne (mauvais tenant / id bidon). Corrigé → 404 sur 0 ligne.
  `banquesService.deleteBanque` renvoie désormais `rowCount > 0` au lieu de `true`.

Vérifs : `npm run test:integration` 45/45 vert, `npm test` unitaire vert, backend Docker
reconstruit et OK, base de dev `agri_app` intacte (3 banques / 0 équipements inchangés),
`agri_app_test` supprimée après.
### Tests d'intégration — extension Observations + Récoltes (2026-08-30)

45 → 53 tests, 9 → 11 fichiers.

- **`observations.test.js`** — CRUD (`notes` requises → 400, `localisation`/`dateObservation`
  conservées, `PUT` partiel via COALESCE laisse `localisation` inchangée, `PUT`/`DELETE`
  id inexistant → 404, `DELETE` retire de la liste) ; `POST` en `ouvrier` → 201 (module
  volontairement ouvert à tous les rôles) ; isolation multi-tenant.
- **`recoltes.test.js`** — `GET`/`POST` uniquement (pas de `PUT`/`DELETE`) : golden path,
  chaque champ requis manquant → 400, `quantite: 0` accepté (≠ `''`/`undefined`),
  `GET` scopé ; **validation d'appartenance de `parcelleId`** — parcelle de la même
  entreprise → liée, parcelle étrangère ou id bidon → `parcelleId: null` stocké
  silencieusement (201, défense volontaire) ; isolation multi-tenant.

- **Correctif trouvé par `recoltes.test.js`** : `RECOLTE_COLUMNS` renvoyait `quantite`
  sans cast → chaîne JSON `"1200.00"` au lieu d'un nombre, contrairement à tous les autres
  `*_COLUMNS` du code (`::float8` partout). Le frontend le contournait déjà avec
  `Number(...)` systématiquement. Corrigé : `quantite::float8 AS quantite`.

Vérifs : `npm run test:integration` 53/53 vert, `npm test` unitaire vert, backend Docker
reconstruit et OK, base de dev `agri_app` intacte (1 observation / 1 récolte inchangées),
`agri_app_test` supprimée après.
### Tests d'intégration — extension Calendrier + Feedback + Planning (2026-08-30)

53 → 62 tests, 11 → 14 fichiers. Aucun bug backend trouvé cette passe.

- **`calendar.test.js`** — `GET`/`POST`/`PUT` uniquement (pas de `DELETE`) : `date` + `type`
  + `title` requis → 400 ; `description` conservée ; `GET` scopé et trié par date
  croissante ; `PUT` partiel (COALESCE, `type` non passé inchangé) ; `PUT` id inexistant
  → 404 ; `POST` en `ouvrier` → 201 (module ouvert) ; isolation multi-tenant.
- **`feedback.test.js`** — soumission ouverte à tout compte connecté (`message` requis,
  `type` hors liste → « Autre », renvoie `{ ok: true }`) ; `GET /` et `PATCH /:id`
  réservés au **platform admin** : un admin d'entreprise normal → 403 ; un platform admin
  (promu via `pool` + reconnexion pour rafraîchir la claim JWT) lit les retours de **toutes
  les entreprises** (lecture cross-entreprise volontaire, avec `entrepriseNom`/`userEmail`),
  `PATCH {statut}` → 200, `statut` invalide → 400, `PATCH` id inexistant → 404.
- **`planning.test.js`** — `POST` renvoie **200** (pas 201 : la persistance est un TODO
  commenté) + un plan générique de 5 jalons (Semis → Récolte) trié par date ;
  `cultureId` = un `parcelles.id` ; sans `cultureId` → 400 ; parcelle d'une autre
  entreprise ou id bidon → 404 (cloisonnement dans `getCulturePlanDetails`).
- **Helper** : `createParcelle(token)` promu dans `helpers.js` (était inline dans
  `recoltes.test.js`), réutilisé par `planning.test.js`.

Vérifs : `npm run test:integration` 62/62 vert, `npm test` unitaire vert, aucun changement
de code applicatif (fichiers de test + helper uniquement), `agri_app_test` supprimée après.
### Tests d'intégration — Cultures + Poulailler + Business + 2 correctifs backend (2026-08-30)

62 → 78 tests, 14 → 17 fichiers. **Modules restants tous couverts.**

- **`cultures.test.js`** — parcelles CRUD (nom requis, PUT partiel COALESCE, id inexistant
  → 404) ; historique des vannes (`parcelleId`+`action` requis, parcelle étrangère → 404) ;
  mouvements vente/achat ↔ synchro `finances` (POST crée la ligne, montant +qté×PU pour
  une vente / négatif pour un achat ; PUT avec `raison` la **met à jour sans doublon** +
  entrée `modification` dans l'historique ; DELETE avec `raison` supprime mouvement +
  finance + entrée `suppression`) ; filtre `?type=` ; isolation multi-tenant.
- **`poulailler.test.js`** — mouvements ↔ `finances` `(Poulailler)` (même structure) ;
  livraisons (client+produit requis, statut initial « En attente », `PUT {statut}`,
  `PUT`/`DELETE` inexistant → 404) ; suivi quotidien (type+quantite requis) ; isolation
  multi-tenant.
- **`business.test.js`** — écritures financières manuelles (montant requis, catégorie
  défaut `Caisse`, `Banque` sans `banqueId` → 400, avec → `banqueNom` relu) ; gate
  `admin/directeur` (ouvrier → 403 sur POST/DELETE, GET ouvert) ; `DELETE` + id
  inexistant → 404 ; isolation multi-tenant.

**Correctif migration — dérive `migrate.js` vs base de dev.** `parcelles_historique`,
`cultures_mouvements`, `poulailler_mouvements`, `poulailler_livraisons`, `poulailler_suivi`
filtrent et insèrent tous sur `entreprise_id`, mais leur `CREATE TABLE` ne l'incluait pas
et aucun `ADD COLUMN IF NOT EXISTS entreprise_id` n'existait — la base de dev l'avait
acquise par dérive manuelle, un déploiement neuf (et la base de test d'intégration) partait
cassé (500 sur toute écriture cultures/poulailler mouvement/historique/livraison/suivi).
Ajout des 5 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS entreprise_id` + backfill (par la
parcelle pour l'historique, sinon première entreprise) + index. `migrate.js` rejoué sur la
base de dev : no-op propre (colonnes déjà présentes). La suite d'intégration, qui migre une
base jetable de zéro à chaque exécution, garde désormais contre les deux sens de dérive.

**Correctifs 404** (même classe que `contacts`/`banques`) : `DELETE /api/cultures/parcelles/:id`,
`DELETE /api/poulailler/livraisons/:id`, `DELETE /api/business/finances/:id` renvoyaient
`{ success: true }` / 200 même sur 0 ligne → 404 sur 0 ligne.

Vérifs : `npm run test:integration` 78/78 vert, `npm test` unitaire (back + front) vert,
`migrate.js` idempotent sur la base de dev, backend Docker reconstruit, base de dev
`agri_app` intacte, `agri_app_test` supprimée après.
### CI — GitHub Actions (2026-08-30)

`.github/workflows/ci.yml` (nouveau, aucun `.github/` n'existait). Déclenché sur chaque
`push` et les `pull_request` vers `main`, `concurrency` annule le run précédent d'une même
ref.

- **Job `backend`** : service `postgres:18-alpine` (user/pass `postgres`, health-check
  `pg_isready`), Node 22, cache npm sur `server/package-lock.json`, `npm ci` dans
  `server/`, puis `npm test` (unitaire) + `npm run test:integration`. L'intégration reçoit
  `TEST_DB_HOST=localhost` / `TEST_DB_PORT=5432` (le service CI écoute directement sur
  5432, contrairement au remap 5433 local) / `DB_USER=DB_PASSWORD=postgres` /
  `JWT_SECRET=ci-test-secret`. Pas de secret GitHub : la base est un conteneur éphémère.
  Le `globalSetup` y migre une base `agri_app_test` de zéro → CI sert aussi de garde
  contre la dérive `migrate.js` vs base de dev.
- **Job `frontend`** : Node 22, `npm ci --legacy-peer-deps` (racine, comme le Dockerfile —
  `vite-plugin-pwa@0.9.3` déclare un peer `vite@^2`), `npm test` + `npm run build`.

Vérifié en local : la suite d'intégration passe (78/78) avec les mêmes variables
d'environnement explicites que le workflow (host/port/user/pass/jwt), ce qui confirme que
`testDb.cjs` + `env.js` privilégient bien l'environnement sur le repli `server/.env`
(absent en CI puisque gitignoré).
### Tests frontend — batch 1 : modules de logique pure (2026-08-30)

6 → 58 tests, 1 → 5 fichiers. Aucune régression : `vite build` OK, l'unique test
pré-existant (`ObservationListView`) passe toujours.

- **Infra** : `babel.config.cjs` gagne un bloc `env.test` avec un petit plugin inline qui
  réécrit `import.meta` → `({})` — **sous Jest uniquement** (Vite gère `import.meta`
  nativement et n'applique pas `env.test`). Sans ça, `src/lib/api.js` (dont la 1re ligne
  lit `import.meta.env.VITE_API_URL`) ne peut être chargé sous babel-jest que via un
  `jest.mock` complet. La ligne d'`api.js` est aussi rendue défensive
  (`typeof import.meta !== 'undefined' && import.meta.env?.…`), repli d'URL explicite.
  (Tentative avec `babel-plugin-transform-import-meta` abandonnée : le paquet ne
  transforme rien avec ce `@babel/core` — remplacé par le plugin inline de 8 lignes.)
- **`src/components/roles.test.js`** — forme de `ROLE_DEFINITIONS` (chaque rôle a des
  permissions non vides, `home` commun, `directeur` = `admin`, `gestionnaire` = `admin`
  moins `employees`, `assistant_direction` = `comptable` + `fournisseurs`, `ouvrier` sans
  finances/employees/modules) ; `mapUiRoleToBackend`/`mapBackendRoleToUi` (aller-retour
  stable, alias `worker`/`manager`/`director`/`assistante_direction`, inconnu/vide → `admin`).
- **`src/lib/locale.test.jsx`** — `fmtNumber`/`fmtMoney`/`fmtDate`/`fmtMoneyWith`/
  `fmtDateWith` : vide/`NaN` → « — », `0` reste formaté, XOF sans décimale vs EUR à deux
  décimales, `$`/`€` et séparateurs selon la locale, devise invalide → repli
  « <n> <devise> », dates ISO/`Date`, `juin` vs `Jun` selon la locale ;
  `setLocaleConfigGlobal` normalise ; `useLocale` hors `Provider` retombe sur les helpers,
  dans un `Provider` expose un `setLocaleConfig` réactif.
- **`src/lib/api.test.js`** (`global.fetch` mocké) — `get/set/clearToken` ;
  `request` : bearer joint, échec réseau → message convivial, 401 → token vidé +
  événement `agri-auth-expired` + throw, non-ok → message serveur ; `safeRequest` :
  erreur réseau → opération en file `agri-offline-queue` + `null`, vraie 4xx/5xx →
  rethrow sans rien mettre en file ; `flushOfflineQueue` : no-op hors ligne, rejoue et
  vide + `agri-last-sync`, garde les échecs, JSON corrompu → `{flushed:0}` + nettoyage.
- **`src/utils/storage.test.js`** (`../lib/api.js` mocké) — `storageGet` parse/fallback,
  `storageSet` écrit + n'empile dans `agri-sync-queue` que hors ligne + émet
  `agri-sync-status-changed`, `syncPendingChanges` compte la file hors ligne / délègue à
  `flushOfflineQueue` en ligne / `synced:false` si le flush jette.

Le job `frontend` du workflow CI exécute déjà ces 58 tests (`npm test`).
Batch 2 (tests de composants des vues) reste à faire.
### Tests frontend — batch 2 : composants (2026-08-30)

58 → 87 tests, 5 → 9 fichiers. `vite build` OK, aucune régression.

- **`src/components/ui.test.jsx`** — `Card` transmet `onClick` + props DOM (la régression
  documentée dans CLAUDE.md où `Card` avalait `onClick`) ; `Button` : `type` défaut
  `button`, `disabled` bloque le clic + curseur, variantes = fonds distincts ;
  `Field`/`Select` : label rendu, `value`/`onChange`/`placeholder` transmis, `className`
  fusionné avec `flat-input`, `AideChamp` seulement si `aide` fourni (tooltip au clic) ;
  `Badge` : ton inconnu → repli `green` ; `MiniChart` : « Aucune donnée » vs une barre par
  point ; toasts : `notifySuccess`/`notifyError` affichent le message (via `act`), retiré
  au clic sur ✕, `notifyError` utilise `err.message` sinon le repli.
- **`src/components/FeedbackModule.test.jsx`** (`../lib/api.js` + `notify*` mockés) —
  message vide → `notifyError`, aucun appel API ; message rempli → `createFeedback(form)`,
  textarea réinitialisée, `notifySuccess` ; `isPlatformAdmin=false` → pas de
  `getAllFeedback`, section admin absente ; `true` → chargement + affichage, erreur
  affichée, changement de statut → maj optimiste + `updateFeedbackStatus(id, statut)`.
- **`src/components/GlobalSearch.test.jsx`** (`rechercheGlobale` mocké) — < 2 caractères →
  invite, pas d'appel ; ≥ 2 caractères → après debounce, `rechercheGlobale(query)` appelé
  une fois, résultats groupés Contacts/Produits/Devis rendus ; clic → `onSelect({kind,
  item})` ; `Échap` / clic sur le fond → `onClose` ; réponse vide → « Aucun résultat ».
- **`src/components/RhReferentiels.test.jsx`** (les 12 fonctions RH de l'api mockées) —
  `canManage=false` → rien ; `canManage=true` → replié, aucun chargement ; à l'ouverture,
  `getDepartements/getPostes/getJoursFeries/getCongesTypes` appelés + liste rendue ; ajout
  d'un département → `createDepartement({nom})` + rechargement + `onChanged` ; suppression
  → `deleteDepartement(id)`.

Reste hors de portée : les gros modules-vues de `App.jsx` (`EmployeesModule`,
`DevisModule`, `CulturesModule`…), non extraits donc non testables directement.
### Récoltes — édition + suppression (2026-08-30)

Constat utilisateur : une récolte ne pouvait pas être corrigée une fois saisie. Ce n'était
pas un choix métier — `recoltes.js` n'avait jamais eu que `GET`/`POST` (voir l'entrée
« Calendrier & Récoltes »). Ajouté :

- **`server/src/routes/recoltes.js`** : `PUT /:id` (remplacement complet, mêmes champs
  requis que le `POST`, `parcelleId` vérifié → `null` si étranger/invalide, `WHERE id
  AND entreprise_id`, 0 ligne → 404) et `DELETE /:id` (0 ligne → 404). Helper
  `resolveParcelleId` factorisé entre `POST` et `PUT`.
- **`src/lib/api.js`** : `updateRecolte(id, payload)` (PUT) et `deleteRecolte(id)` (DELETE),
  via `safeRequest` comme le reste du module.
- **`src/App.jsx` `HarvestsModule`** : colonne d'actions dans le tableau — bouton ⚙️
  (modale d'édition, 7 champs identiques au formulaire d'ajout, patron repris de la
  modale du Calendrier) et bouton 🗑️ (`window.confirm`). Les deux gèrent le mode
  hors-ligne (branche `useRemote === false` : maj/filtre du state local, `storageSet` via
  l'effet existant). Reconstruction de la valeur du `<select>` parcelle à l'ouverture de
  la modale (id si la parcelle existe encore, sinon « Autre parcelle » + nom libre).
  Clés i18n `harvests.editTitle` / `updated` / `updateError` / `deleteConfirm` / `deleted`
  / `deleteError` ajoutées (fr + en).
- **`server/src/test/integration/recoltes.test.js`** : `PUT` met à jour (relu via `GET`),
  champ requis manquant → 400, id inexistant → 404, `parcelleId` étranger → `null` ;
  `DELETE` → 200 + absent, re-`DELETE` → 404 ; isolation multi-tenant (`PUT`/`DELETE` sur
  la récolte d'une autre entreprise → 404).

Vérifs : `vite build` OK, front `npm test` 87/87, `test:integration` 82/82, back `npm test`
vert, smoke HTTP réel contre la stack Docker (POST → PUT 200 → DELETE 200 → re-DELETE 404),
entreprise de test supprimée.
### Recherche globale — champ lisible + boutons Rechercher / Fermer (2026-08-30)

Retour utilisateur : dans la modale de recherche globale (loupe de la barre du haut,
`src/components/GlobalSearch.jsx`), le champ de saisie était mal rendu (forme/couleur) et
il manquait un bouton pour valider et un bouton pour fermer.

- **Lisibilité du champ** : le panneau de la modale force désormais `colorScheme: 'light'`
  et l'`<input>` a un `background`/`color` explicites + une classe `.global-search-input`
  (App.css) pour la couleur du placeholder — sans ça, la règle `color-scheme: light dark`
  de `index.css` rendait le champ natif illisible sous un thème OS sombre (même gotcha que
  celui déjà documenté pour les lignes de résultats).
- **Bouton « Rechercher »** : l'input est maintenant dans un `<form onSubmit>` avec un
  bouton vert qui déclenche la recherche **immédiatement** (annule la temporisation de
  250 ms). Extraction d'un `runSearch(q)` partagé entre la frappe temporisée et le submit,
  avec un compteur de requête pour qu'une réponse lente n'écrase pas une plus récente.
- **Bouton « Fermer »** : vrai bouton ✕ (`title="Fermer (Échap)"`) dans l'en-tête, en
  plus du clic sur le fond et de la touche Échap qui ferment toujours.
- **Tests** (`GlobalSearch.test.jsx`) : bouton Fermer → `onClose` ; submit → appel
  `rechercheGlobale` immédiat (sans `waitFor`).

Vérifs : `vite build` OK, front `npm test` 88/88, conteneur frontend reconstruit
(bundle contient bien les nouveaux éléments).
### ERP Comptabilité — Étape 0 : validité devis, suppression Annulé, conditions de paiement (2026-08-30)

Début de la roadmap « Comptabilité » (réplication du modèle `sale`/`account` d'un ERP de
référence, mêmes rails que `project_erp_full_architecture_alignment` : design → répétition
contre une copie restaurée → confirmation → exécution → vérif, une étape à la fois).
Étapes 1-6 (taxes, journaux/plan comptable, `account.move` factures, immuabilité, avoirs,
paiements/rapprochement) auront chacune leur propre passe.

- **`devis.validity_date`** (`ALTER TABLE` + backfill `date + 30 j`) + booléen calculé
  `expired` dans `DEVIS_COLUMNS` (`statut IN (Brouillon/Devis/Envoyé) AND validity_date <
  CURRENT_DATE`, non stocké — comme `is_expired`). `POST /devis` défaut = +30 j, `PUT`
  modifiable en Brouillon/Devis. Front : champ « Valable jusqu'au » (formulaire + panneau
  méta du détail) + badge rouge « Expiré » dans la liste.
- **Suppression d'un devis Annulé** autorisée (`DELETE /:id` : `Brouillon`/`Devis`/`Annulé`
  — aligné sur « draft or cancel »).
- **`payment_terms` + `payment_term_lines`** (`account.payment.term`-like : `value`
  percent/fixed/balance, `delay_type` days_after / days_after_end_of_month, `nb_days`).
  Route `/api/payment-terms` (GET ouvert, POST/PUT/DELETE `requireRole('admin','directeur')`).
  Jeu par défaut seedé à `register` **et** par `migrate.js:seedPaymentTermsForExistingEntreprises`
  (« Paiement immédiat », « 30 jours », « Fin de mois suivant », « 30 % à la commande, solde
  à 30 j »).
- **`POST /devis/:id/facturer`** accepte `paymentTermId` (+ `acompte` `{method, value}`
  optionnel) → génère les `echeances_paiement` depuis le terme (`genererEcheancesDepuisTerme`)
  au lieu de la saisie manuelle, qui reste en repli. Terme « paiement immédiat » (1 échéance
  due aujourd'hui, sans acompte) → traité comme paiement complet (échéance déjà réglée +
  synchro finances). `devis.payment_term_id` (FK `ON DELETE SET NULL`), remis à NULL par
  `remettre-brouillon`.
- Front : `PaymentTermsPanel` (référentiel repliable, patron `RhReferentiels`) dans
  `DevisModule` ; sélecteur « Condition de paiement » + acompte dans la modale de
  facturation. i18n fr + en.
- **Bugs corrigés en passant** : double `client.release()` sur les retours anticipés de
  `facturer` (`pg-pool` `throwOnDoubleRelease` — latent, jamais déclenché par un test
  avant) ; `validity_date` / `date_echeance` renvoyés via `to_char(…, 'YYYY-MM-DD')` pour
  éviter le décalage d'un jour DATE Postgres → objet Date JS → `.toISOString()`.
  `test:integration` passe en `--forceExit` (un handle keep-alive résiduel bloquait la
  sortie de jest).

Répétition migration : `pg_dump` de `agri_app` → restauration jetable → `migrate.js` ×2
(idempotent, aucune erreur au 2ᵉ passage) → compteurs inchangés (9 entreprises / 9 devis /
14 échéances), `payment_terms` = 9×4, `payment_term_lines` = 9×5, tous les devis avec
`validity_date`. Puis appliquée à `agri_app`.

Vérifs : `vite build` OK, front `npm test` 88/88, `test:integration` 94/94, back `npm test`
vert, smoke HTTP réel (devis validityDate +30 j / expired ; facturer terme 30 j + acompte
25 % → échéances 2500 aujourd'hui + 7500 à J+30). Conteneurs backend + frontend reconstruits.
