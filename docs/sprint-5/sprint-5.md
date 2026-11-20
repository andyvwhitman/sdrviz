# Sprint 5: frequencies and nodes replace banks

Started 2026-11-20. Owner decisions 66-70 in docs/decisions.md.

Goal: one Frequencies list; each frequency is assigned to nodes and enabled or disabled per node; a node decodes,
and the server records, exactly its enabled frequencies. Banks go everywhere. Live Ops listens to one node.
Feeds & Banks becomes Feeds (SDR feeds + GTFS sources). Waterfall: hold to listen, right-click to add.

Ground rules as Sprint 4 (ports, pythonic, small tested steps, agents per role, deploy at will after clean-worktree
tests, verify on production). Banks disappear in one release: G and I-1/I-2 deploy together.

## Model

- `Assignment(frequency_id, feed_id, enabled)`, primary key (frequency_id, feed_id). Keyed by feed id so node feeds
  (`node-N`) and dev sim feeds work the same. A feed hears exactly its enabled assignments (replaces `Feed.hears` as the
  source of truth; sim seed `hears` become enabled assignments).
- `Bank` table, `/api/banks`, `Prefs.active_bank` and the `banks` node preset go. New node preset `assigned` (the
  default): the AAR channels of that node's enabled assignments, plus any held listens. Pushed to that node only,
  whenever its list changes.
- `Prefs.listen_feed` replaces `active_bank`/`displayed_feed`: the node Live Ops listens to (default: first online
  node feed, else first feed).
- `Recording.node_id` added (ALTER TABLE, backfilled from feed `node-N` → node id). `feed_lat`/`feed_lon` already hold
  the node's position at the time (node feeds take it from the node row); documented as such.
- Migration `python -m app.migrate_banks --export PATH --bank bank-nec --feed node-1`: one-shot, idempotent; writes all
  banks to JSON, makes the bank's frequencies enabled assignments on the feed, relabels waterfall-made frequencies
  (`live-chNN`, label `CHNN`) to `NNNN`, drops the bank table.

## G. Backend

| ID | Ticket | Done when |
|---|---|---|
| G-1 | **Assignment table + migration script** (above); seed path for dev (sim feeds' hears → assignments). | Tests: migration on a copy of a bank DB; idempotent. |
| G-2 | **Frequency API**: list/read include `assignments: [{feed_id, enabled}]`; `PUT /api/frequencies/{id}/assignments/{feed_id}` `{enabled}`, `DELETE` same; `POST /api/frequencies/from-channel` `{aar_channel, feed_id}` (admin; label `NNNN`, or reuse the existing frequency on that channel) → assigned + enabled. Delete a frequency removes its assignments. `/api/banks` removed. | API tests. |
| G-3 | **What a node decodes**: preset `assigned`, per-node push on change (replaces `bank_channels`). Recording only for a frequency enabled on the feed that heard it; `node_id` stored. | Tests; node gets its list on connect and on change. |
| G-4 | **Live state without banks**: `listen_feed` in prefs; `channels` = that feed's enabled frequencies sorted by MHz; drop banks, off-bank, bank views; sim scenarios pick a feed, not a bank. | Tests; snapshot shape documented in types. |
| G-5 | **Hold to listen**: ws ops `listen_hold {feed_id, aar_channel}` / `listen_release`; the server adds the channel to that node's decode list while any client holds it (renewed every 5 s by the client, dropped after 15 s without renewal or on disconnect), streams its audio keyed by AAR channel, never records. | Tests with a fake node. |

## H. Design

| ID | Ticket | Done when |
|---|---|---|
| H-1 | **GMUNK direction**: Frequencies page (table, filters, editor, per-node assignment chips with enable toggle, add, delete), Feeds page (SDR feed cards + GTFS sources), Live Ops node picker in place of bank tabs (desktop and phone), waterfall hold feedback (marker, "LISTENING · CH54" while held) and right-click result (toast "5454 ADDED · ENABLED ON SDR-01"). | docs/sprint-5/direction.md |

## I. Frontend

| ID | Ticket | Done when |
|---|---|---|
| I-1 | **Live Ops without banks**: node picker replaces bank tabs/lever; tile list = live channels low to high; phone too. | vitest, screens at 1920/1280/390. |
| I-2 | **Waterfall gestures**: hold → listen while held (mouse and touch; iOS callout and selection suppressed); right-click → create (admin; browser menu replaced on the spectrograph only); short click selects a listed channel; alt-click removed. | vitest on the gesture logic; manual check. |
| I-3 | **Frequencies page** `/frequencies` (menu FREQUENCIES): sortable, filterable table; edit drawer; assignments; add; delete. Fluid layout. | vitest, screens. |
| I-4 | **Feeds page**: renamed; frequency catalogue, bank editor and membership table removed (the overlapping bottom goes with them); GTFS sources moved from Settings. Settings keeps nodes and backend. | vitest, screens; no overlap at 1280/1920. |
| I-5 | **GMUNK review** of Frequencies, Feeds and the Live Ops changes; fix the must-fix list. | APPROVE. |

## Release

Clean-worktree tests → push → deploy → run the migration on production (`docker compose exec api python -m
app.migrate_banks ...`) → check SDR-01 decodes the 8 NEC channels, recordings carry `node_id`, Live Ops lists the 8.
