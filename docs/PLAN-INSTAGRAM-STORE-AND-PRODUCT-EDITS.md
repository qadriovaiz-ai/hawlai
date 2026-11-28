# PLAN — Instagram Store page, and editing products from chat and WhatsApp

Written 28 November 2026, **before any code**, from a read of the
repository. Two asks from the founder; sized separately; one decision
list at the end.

---

## 0. What the code already has — read first, it changes both asks

| Finding | Where | What it means |
|---|---|---|
| **Price, name and description of a product can ALREADY be changed from chat**, one field per approval card, with preview, read-back and undo | `propose_price_change` → `createPublishAction` → `src/lib/publish/platforms/hawlaiShop.ts` (`update_product_price` critical, `update_product_name` / `update_product_description` medium) | Ask 2 is **not starting from zero**. The gap is the **other fields** |
| **WhatsApp text already goes to the same chat** | `src/app/api/webhooks/whatsapp/route.ts:231` → `runMasterBrainChat` | Any chat tool works on WhatsApp too. Its cards are `pending_approvals` rows, so **"haan CODE" already approves them** (`publish/create.ts`). **Never verified live end to end** |
| **Policies already exist**, as `business_knowledge` rows with `category: "policy"`: "Returns and refunds", "Delivery time", "Damaged on arrival" | `src/lib/onboarding/interview.ts:194-295` | The claims guard and the DM reply **read these rows**. New policy text fields would be a **second source of truth**, and the replies would not see them. **The Policies tab should edit these rows** |
| **One catalog for everything** | `products` table; edited on Website & Products → Products (`ProductManager.tsx`) | An "Instagram products" list is the same products. The Products sub-page reuses the same component, so there is still one catalog |
| **No role gating in the navigation** | `src/lib/navTree.ts`, `NavTree.tsx` | Every dashboard page is behind login already. **"Admin-only" is read here as "in the seller's dashboard, never public"**. If it means *owner/admin roles only, not other team members*, that is extra work (§1, S6) |
| **CLAUDE.md Rule 5**: no new pages without a written reason from the owner | — | This request **is** that reason. It goes into DECISIONS, with the overlap noted below |

---

## 1. Instagram Store — one page, four tabs, no public page

**Shape:** `/dashboard/instagram-store?tab=products|shipping|policies|settings`,
ONE page with four tabs (the same pattern Website & Products uses), and a
node under **Store** in the navigation with four leaves. Nothing public.

| # | Piece | Reuse / new | Size | Hours |
|---|---|---|---|---|
| **S1** | **Page and navigation.** Page shell, four tabs, a nav node under Store. Rule 5 reason recorded | new page (the only new page) | S | 1.5 |
| **S2** | **Products.** The existing `ProductManager`, the same catalog. **Added:** each product shows its **`#HawlaiTag: <name>` line with a copy button**, so the seller can paste it into a caption and T1 recognises the post | reuse + small | S | 1.5 |
| **S3** | **Shipping.** The Seller Mode **delivery fee field**, moved here from the Auto-Reply card (same API, same checks, migration 243). A line explains it is for Instagram orders, and that website shipping lives in Website & Products | move | S | 1 |
| **S4** | **Policies.** Edit the **existing** `business_knowledge` policy rows (Returns and refunds, Delivery time, Damaged on arrival), so the DM reply and the claims guard use what the seller writes here. One owner-only API over those rows. A row that doesn't exist yet is created with the same category and title the interview uses | reuse rows + new API | S/M | 2.5 |
| **S5** | **Settings.** **Seller Mode switch + UPI ID moved here** from the Auto-Reply card, the same rules (`sellerModeBlocker`, off never refused). The Auto-Reply card keeps the DM / comment switches and links here | move | S | 1.5 |
| S6 | *(only if "admin-only" means roles)* hide the page and refuse its APIs for team roles below owner/admin | new | S | 1.5 |

**Item 1: about 8 hours**, or 9.5 with S6. **No migration.** Existing tests
that pin the Auto-Reply card's source (`tests/sellerMode.test.ts`) move with
the code; their assertions stay the same and only the file path changes.

**The overlap, said plainly.** Products and Shipping now each have two
doors: Website & Products, and Instagram Store. They are the same data,
except that shipping is genuinely two rules (website shipping vs the flat
Instagram fee). That is the cost of the page the founder asked for. The
alternative is an "Instagram" tab inside Website & Products: no new page,
and Rule 5 is untouched (Decision A).

---

## 2. Editing products from chat and WhatsApp

Price, name and description already work (§0). What remains:

| # | Piece | Reuse / new | Size | Hours |
|---|---|---|---|---|
| **E1** | **Stock, "was" price, category, show/hide** through the **same** tool, pipeline and cards: `update_product_inventory`, `update_product_compare_price`, `update_product_category`, `update_product_visibility` on `hawlaiShop.ts` (preview, execute, read-back, undo). One field per card, as now. `propose_price_change` gains optional fields (**no new tool**, Rule 5). The tool-schema fingerprint is updated per its protocol | extend | M | 4–5 |
| **E2** | **WhatsApp: a live end-to-end check** of "Clay Mug ka price 499 karo" → card → "haan CODE" → changed. Today it should work and **has never been run**. Fix whatever it shows | verify | XS–S | 0.5–2 |
| E3 | **Replace a product's photo from WhatsApp**: a photo with caption "photo: <exact product name>" → a card to replace the image (W1's parser; never a guess at which product) | extend W1 | S/M | 2.5 |
| E4 | Service fields (duration, booking link) from chat | extend | S | 1.5 |

**Item 2: about 5–7 hours for E1 + E2**, or 9–11 with E3 and E4. **No
migration.**

**Proposed risk levels** (Rule 6; the founder may change them):

| Action | Risk | Why |
|---|---|---|
| `update_product_inventory` | medium | Stock 0 stops orders; a wrong number oversells |
| `update_product_compare_price` | **high** | A "was ₹X" is a **discount claim** customers see; the claims layer must not be bypassed |
| `update_product_category` | low | Organisation only |
| `update_product_visibility` | medium | Hiding stops sales; showing makes an unfinished product public |

---

## 3. Decisions for the founder

**A. Item 1's shape.** **(a)** A new page "Instagram Store" with four tabs,
as asked (Rule 5 reason recorded), **or** (b) an "Instagram" tab inside
Website & Products: no new page, but Policies and Seller Mode settings sit
in a page named "Website".

**B. "Admin-only"**: is "dashboard only, never public" enough (as read
here), or must team roles below owner/admin be kept out (S6)?

**C. Policies**: edit the **existing** policy rows the replies already read
(recommended), or separate new fields (which the replies would not read
without extra work)?

**D. Edits from chat and WhatsApp**: an approval card for **every** field
(as price, name and description work today), or straight through for
low-risk ones (category)? Recommended: **a card for all**, to keep one
behaviour.

**E. Order.** Recommended: **E2 first** (half an hour, and it may already
work), then **E1**, then **S1 → S5**. Then E3/E4 if wanted.
