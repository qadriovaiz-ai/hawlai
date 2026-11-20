# Where the Shopify app's scopes live, and how to change them

Written 20 November 2026, because `SHOPIFY_SCOPES` in the code is only
half the story and the other half is not in this repository.

---

## 1. Where the configuration actually is

**Not in this repo, and it never was.** Checked: no `shopify.app.toml`
has ever been committed (`git log --all --diff-filter=A` finds none),
there is no Shopify CLI dependency in `package.json`, and nothing is
gitignored for it.

So the app version was **not** deployed from this codebase. The active
version — `hawlai-3`, created and released 4 September 2026 — was made
directly in Shopify's own dashboard.

That date is corroborated inside the code. `shopifyAuth.ts` records
that on 2026-09-04 "a real install declaring all six scopes came back
granting exactly `read_customers,read_orders,write_products,write_content`".
Six scopes declared, and the dashboard today shows exactly six:

```
read_customers, read_orders, read_products,
write_products, read_content, write_content
```

**The scopes are stored in the app version at Shopify. The constant in
`shopifyAuth.ts` is the callback's REQUIREMENT, checked against what a
token actually carries.** Two separate things, and only one of them is
in version control.

---

## 2. What this means for the content work

| Scope | In the active version? | Needed for |
|---|---|---|
| `write_products` | ✅ already there | products, **collections** |
| `write_content` | ✅ already there | pages, blog posts |
| `write_files` | ❌ **missing** | images |

**So most of the content work needs no Shopify-side change at all.**
Pages, blog posts, products and collections are already granted —
`write_products` covers Collection, and both write scopes carry their
reads. That is better than the plan assumed.

**Images are the exception**, and `write_files` is the one thing to
deploy.

**One live consequence, worth knowing before deploying the app:**
`SHOPIFY_SCOPES` in the repo now requires all three. Until the app
version declares `write_files`, a NEW Shopify connection will fail with
`scope_not_granted` — and the error will name `write_files` as the
missing one, which is what the 3.1 change to that message was for.
No existing connection is affected, and there are no real merchants
connected, so the window is harmless. **Do the version release before
the next connect attempt and it never comes up.**

---

## 3. Adding `write_files` — the recommended route

**Use the Dev Dashboard. No CLI, no file in this repo.**

Shopify's own Dev Dashboard documentation says a version's fields —
including Scopes — are filled in when you **create a version**, and
then you Release it. The page you were looking at shows a version that
is already released, and a released version is a record rather than a
form. That is why there was no edit button.

Steps:

1. Dev Dashboard → your app → **Versions**
2. **Create a new version** (not "view" the active one)
3. In **Scopes**, enter the full list — it replaces rather than merges,
   so include everything that must stay:

```
read_customers,read_orders,read_products,write_products,read_content,write_content,write_files
```

4. **Release** that version
5. Reconnect the test store from Hawlai's Settings and confirm the
   connect succeeds

**Step 3 is the one to be careful about.** The documentation does not
say the Scopes field merges, and it is a comma-separated string that
reads like a replacement. Leaving one out would silently drop it, and
dropping a scope does NOT prompt the merchant — Shopify's words: the
app "loses access to those scopes automatically when the merchant opens
the app". A quiet loss is harder to notice than a loud failure.

---

## 4. The CLI route, and why not to take it now

It exists and is documented, and it is the wrong tool for this change.

```
shopify app config link     # pulls the existing app's config into a TOML
# edit [access_scopes] scopes = "..."
shopify app deploy          # creates AND releases a new version
```

Three reasons to leave it:

- **It brings a live app under new management for a one-line change.**
  Shopify's own guidance for an app not built with the CLI is to follow
  a separate *migrate from dashboard* path, which is a bigger decision
  than adding a scope.
- **The documentation does not say what `config link` overwrites.** It
  describes re-linking for a config that is "deleted, corrupted, or
  out-of-sync", and says nothing about what happens to a configuration
  it did not create.
- **`deploy` creates and releases in one step**, and no documented flag
  separates them. For a first CLI run against the merchant-facing app,
  that is a lot of trust in a summary screen.

If the CLI is wanted later — and there is a real argument for it, since
it would put the scopes in version control where this document would
not be necessary — it should be its own decision, with the migration
path read first.

---

## 5. Existing installs do not auto-update

Shopify is explicit: when scopes change in a new version, "updates
aren't applied automatically to the stores your app is installed on.
Merchants still need to manually approve the new scopes in the Shopify
admin." There is an `app/scopes_update` webhook that fires on approval;
Hawlai does not subscribe to it and does not need to.

With no real merchant connected, this costs nothing today. It is the
thing that would have cost something if the content work had been built
a year into a merchant base — which is the strongest argument for doing
it now.

---

## 6. On `read_customers` and `read_orders`

These are in the active version and are **deliberate** — the founder's
clarification of 20 November 2026. They are read-only, for analytics
and reporting ("how many orders came in"), and the product's
"orders and customers, never" rule is about **write and edit access**,
not about reading for a report.

Recorded here so it is not re-flagged. It was raised once as a possible
scope-policy breach and it is not one: nothing in this codebase writes
to an order or a customer, and no write scope for either is requested
or will be.
