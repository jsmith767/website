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


