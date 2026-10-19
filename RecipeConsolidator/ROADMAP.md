### Recipe Consolidator — Roadmap

### Product direction (north star)
- **Target users**: retreat facilitators + big families / small groups (**8–20 people**)
- **Food direction**: **Whole-Food Plant-Based (WFPB-first)**, with optional “WFPB-ish” flexibility
- **Primary optimization**: **minimize prep labor**
- **Secondary optimizations**: health-first (WFPB), then **cost** / reduce waste
- **Core promise**: plan a weekend menu and instantly get **one consolidated shopping list**, scaled for the group, optimized for ingredient reuse.

### What makes this valuable (vs “just ask ChatGPT”)
- **Persistent library**: saved recipes with normalized ingredients, tags, and sources (works reliably over time)
- **Operations**: group scaling, multipliers, consolidated shopping lists, printable exports, and repeatable templates
- **Workflow**: planning for multiple days/meals, with ingredient reuse to reduce labor and waste
- **Monetization primitives**: attribution + “Buy the book” links embedded in the flow

---

### Phase 0 — Stabilize the foundation (now)
- **Keep local-first assistant** for: ingredient-based recipe matching + simple substitution hints.
- **Improve tagging UX**: make it easy to add/curate tags that power planning.
- **Ensure recipe model consistency**:
  - Ingredients stored in structured form (quantity/unit/name/notes) and round-trip cleanly through export/import.

Definition of done:
- Tagging is easy enough that adding tags to 20–50 recipes feels doable.
- Export/import preserves all fields we care about.

---

### Phase 1 — Weekend Plan Generator (MVP)
Add a button/workflow: **“Generate WFPB Weekend Plan”**

#### Inputs
- **Headcount** (default 8–20, allow any integer)
- **Dates** (or just “this weekend”)
- **Constraints toggles** (start minimal):
  - WFPB strict vs WFPB-ish
  - no-oil (optional)
  - gluten-free / nut-free / soy-free (optional)
  - “kid-friendly” (optional)
- **Labor level**: low / medium (default low)

#### Outputs
- Auto-fill the existing planner:
  - Fri dinner
  - Sat breakfast/lunch/dinner
  - Sun breakfast/lunch/dinner
- Populate shopping list from the plan (existing shopping list pipeline).

#### Recipe selection (deterministic scoring)
Use code to select recipes; do not rely on LLM for correctness.

Recommended scoring heuristics:
- **Hard filters**:
  - tags must include `WFPB` (or `WFPB-ish` depending on toggle)
  - exclude recipes that violate allergy toggles (later: ingredient keyword rules)
- **Labor score** (prefer):
  - `one-pot`, `sheet-pan`, `make-ahead`, `15-min`, `30-min`
  - penalize high ingredient count
  - penalize “fussy” tags (later) like `fried`, `multi-stage`, `lots-of-chopping`
- **Overlap score**:
  - maximize ingredient overlap across the entire weekend plan
  - maximize reuse of “base components” (rice/quinoa, roasted veg, beans, sauces)
- **Cost proxy score** (approx):
  - minimize number of unique **non-pantry** items
  - optional: ingredient “price tier” map (cheap/medium/expensive)

Definition of done:
- One-click plan generation produces a plausible weekend plan from the existing recipe library.
- Plan can be edited manually afterward (already supported).

---

### Phase 2 — Sign-in + cross-device sync (desktop planning → phone checklist)
Goal: let someone do the main planning on a computer, then use their phone while shopping/cooking to **check items off**.

#### Why sign-in exists (core use case)
- Desktop: create/edit recipes, generate weekend plan, generate shopping list
- Phone: open the same plan/list and **tick items off** in real time (or offline and sync later)

#### MVP scope (small but complete)
- **Sign-in**: required for sync. (If not signed in, local-only still works.)
- **Sync these entities**:
  - recipes (library)
  - meal plans (calendar)
  - shopping lists (generated snapshots)
  - **checked state** per shopping list item (this is the key)
- **Phone checklist mode**:
  - large tap targets
  - “unchecked first” sorting
  - optional category collapse/expand
  - optional “pantry / already have” toggle

#### Data model notes (conceptual)
- `User`
- `Recipe` (owned by user; optionally shareable later)
- `MealPlan` (owned by user)
- `ShoppingList`
  - `items[]`: `{ normalizedName, displayName, quantityText, category, checked, sources[] }`
  - `createdAt`, `basedOnRecipeIds[]`, `notes`

#### Implementation direction (choose later)
- **Simplest**: hosted auth + hosted database (fastest, lowest ops)
- **Self-hosted**: your own API + DB (more control)
- **Hybrid**: keep local-first UI, add sync in the background

Definition of done:
- Same account can load on desktop + phone and see the same shopping list.
- Checking items on phone persists and appears on desktop after refresh.

---

### Phase 3 — “Retreat templates” + print pack
Make the tool “retreat-ready”:
- Saved templates:
  - “Standard WFPB Weekend (low labor)”
  - “WFPB Weekend (gluten-free)”
  - “Kid-friendly weekend”
- Print pack exports:
  - consolidated shopping list (already exists)
  - prep timeline / batch prep checklist (new)
  - per-meal assignment checklist (new)

---

### Phase 4 — Monetization (aligned with attribution + trust)
#### Primary: “Buy the book”
- For curated recipes:
  - show **source type/title/pages/source URL**
  - show a prominent **Buy the book** CTA (affiliate link)

#### Secondary: Pro features (subscription or one-time)
Sell “operations” features, not recipe IP:
- templates, collaboration, pantry exclusions, print packs, cost controls, advanced exports

#### Later: creator recipes + “buy the recipe online”
Only for content creators who own the instructions:
- creators set price (subscription bundle or per-recipe unlock)
- requires accounts + payments + terms

---

### Phase 5 — AI assistant (optional, GPU-hosted)
Goal: natural conversation + better substitution reasoning + narrative explanations.

#### Keep correctness in code
- Retrieval/matching/scaling/planning decisions should be **deterministic** and inspectable.
- LLM is best used for:
  - summarizing options
  - explaining why a plan is low-labor / WFPB
  - suggesting substitutions and variations

#### Architecture
- **Frontend (Cloudflare Pages)**: static site
- **GPU server (4090 / 3080 Ti)**: local model server (Ollama/vLLM/etc.)
- **Public access**: Cloudflare Tunnel + auth/rate limits to prevent abuse

Minimum safety checklist for public endpoint:
- Require an API key or login
- Rate limit per IP / per key
- Add caching for repeated prompts
- Basic abuse monitoring (logs)

---

### Ideas logged (Oct 2026) — not built yet

#### Simpler shopping (mostly no AI needed)
- **Fewer-ingredients sorting**: rank recipes by how few *new* items they add to the current plan's list (ingredient overlap), so a plan needs fewer distinct purchases and wastes less. Deterministic: count unique non-pantry ingredients each recipe would add.
- **"Uses up" suggestions**: when a plan buys e.g. a bunch of cilantro for one recipe, suggest other recipes that use the rest.
- **Easy substitutions**: a small hand-made table (buttermilk → plant milk + lemon, etc.) shown next to shopping items and recipes. AI can extend it later.
- **Package-aware amounts** (later): round to what you actually buy (1 bunch, 1 can) instead of "5/6 tablespoons".

#### In my fridge / pantry
- A **pantry list** (things you already have) that is subtracted from the shopping list.
- **"What can I make now?"**: recipes you can cook with only pantry + fridge items, or needing at most 1–2 purchases.
- **Shared community staples**: a group agrees on staples it always stocks (oats, rice, beans, spices…). Save/share that list as a file so everyone in the community plans against the same pantry.

#### Shared pantry + community grocery list (first home: Sahale)
The pantry stops being a private list and becomes a shared, live picture of what the community has, with a grocery list that fills itself as things run low.

**Core idea**
- Every staple has a status: **in stock**, **low** or **out**, plus where it lives (e.g. "Pantry, shelf 2, left bin").
- Marking something **low** or **out** adds it to the **community grocery list**. Buying it and marking it **in stock** takes it off again.
- The whole pantry is listed online and **searchable** ("do we have tahini? where is it?").

**Ways to update it (start with the simplest)**
1. **Tell the chatbot (start here).** Message a WhatsApp bot in plain words: "oats are low", "we're out of tahini", "got oats and rice". The bot updates the pantry and the list, and answers "what's on the grocery list?" or "do we have miso?". No app or new habit beyond a message.
2. **Grocery list online.** The same list as a web page anyone in the community can open, tick off while shopping, and share.
3. **NFC tags (tap your phone, no camera).** Small NFC stickers on each staple's shelf spot or bin, or in a binder with one tag per item. Tapping with a phone opens that item's link ("Oats: mark low / out / restocked"). Print a QR code on the same label for phones without NFC. Recent iPhones and most Android phones read NFC links without an app; stickers cost well under $1 each.

**How it connects to recipes**
- Recipes and plans know what is already in stock: in-stock items drop off the shopping list automatically.
- **"What can we make now?"** ranks recipes by how few items they need that aren't in stock.
- Low or out items show on a recipe so the cook knows before starting.
- From a plan's shopping list: **"Add missing items to the community grocery list."**

**Building blocks and open questions**
- **Needs a small shared backend** (the first feature that does): a single list everyone reads and writes. Simplest start: a Google Sheet + Apps Script web app (the same pattern the site's contact form already uses). It is free, reliable and easy for people to read directly. Later it can move to Julian's local server.
- **WhatsApp bot (Julian's plan)**: a third-party bot service on a dedicated low-cost phone number (about $5/month), added to the **community group chat** so anyone can say "oats are low" where they already talk. Decision: start with the simple route even if the service automates a regular WhatsApp account, which WhatsApp's terms don't allow and which can get the number banned. Keep that risk small: use the dedicated number only (never someone's personal one), keep the pantry and grocery list in the Sheet so a banned number loses nothing, keep the bot quiet (it replies when spoken to, no broadcasts), and move to the official API or a Signal/Telegram bot if it becomes a problem. Understanding loose phrasing ("almost out of the good olive oil") is where an AI helps; exact item names can work without one.
- **One canonical item list with aliases** ("oats" = "rolled oats" = "old-fashioned oats") so chat messages, tags and recipe ingredients all point to the same item.
- **Who can edit**: anyone with the community link or in the chat; keep a simple history (who changed what, and when) so mistakes are easy to undo.
- **Staples vs. everything**: start with the agreed staples (the ones with a fixed storage spot), not every item in the fridge.

**Suggested order**
1. Staples list + grocery list in a Sheet, with a simple web page to view and tick off.
2. Chatbot that can mark low/out/in stock and read the list back.
3. Pantry page: searchable, with locations; recipes subtract in-stock items.
4. NFC/QR labels on shelves or in a binder.
5. "What can we make now?" and "add missing to the grocery list" from plans.

#### Trip mode (backpacking) — building Oct 2026
- Same tool, its own front door: `?trip` link, its own home-screen name/icon, its own saved plan.
- Calorie and weight per ingredient from a built-in table of trail staples (approximate USDA FoodData Central values); unknown foods get entered once from the package label and are remembered ("My foods").
- Live calories-per-gram (and per ounce) while writing a recipe; per-serving calories and weight.
- Plan: hikers, daily calorie target, drinking water per day; each day shows calories, food weight and camp water per person.
- Shop: buy list plus a pack-by-day list.
- Later: home prep list (cook, dehydrate, bag), Julian's own trail recipes as the starter set, fuel estimate.

#### Later, with a local server
- Small backend for syncing and recipe submissions (instead of the contact-form relay).
- AI assistant (natural-language entry, smarter substitutions), only on Julian's own local GPU server.

---

### Tagging taxonomy (starting point)
Core tags:
- `WFPB`, `WFPB-ish`, `gluten-free`, `nut-free`, `soy-free`, `kid-friendly`, `high-protein`
Labor tags:
- `make-ahead`, `one-pot`, `sheet-pan`, `15-min`, `30-min`, `60-min`, `bulk-prep`
Meal tags:
- `breakfast`, `lunch`, `dinner`, `snack`

---

### Open questions (next session)
- Decide on **servings model**: do we store “servings” per recipe or keep multipliers-only?
- Decide on “cost” proxy:
  - price tier per ingredient vs per recipe vs simple “unique non-pantry items” score
- Decide if “WFPB strict” means:
  - no oil? (toggle)
  - no refined sugar? (toggle)
  - how strict to be about processed foods


