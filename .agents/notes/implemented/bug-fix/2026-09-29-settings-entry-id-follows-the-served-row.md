# Agent Note: the settings form binds the profile entry row the Host actually serves

Status: implemented

## Problem

dsh-skins#17 reported that on Windows, a standalone install of
`@linxin666/dsh-client-ui-skin-center@0.4.3` failed on 「应用」 and
「官方默认 → 恢复默认」: the card showed 应用失败, the custom-theme card showed a
failed save, and the first apply left `active: blue-fantasy` on disk even though
the UI reported failure. The reporter's own control test — POSTing
`{"active": null}` straight to `/api/skin-center/v2/active` — succeeded, which
ruled out the skin directory and the active API.

The reporter located the call chain and flagged one unverified hypothesis: the
standalone `ui-skin-center` entry id, and `servedEntryId()` falling back to
`web-ui-skin-center` when the settings `describe` mirror is not ready.

Two independent defects were behind the report, and the second one had already
landed in `ddf5efd` (2026-09-28), the day AFTER the issue was filed:

1. **The custom-theme deactivation write.** `CustomThemeController.deactivate()`
   wrote `applied: false` through `scope.set()` unconditionally, even when the
   custom theme had never been applied. A refused write rejected the promise,
   which propagated out of `switchAndDeactivateCustomTheme()` and triggered the
   rollback that produced the 「应用失败」 message. `ddf5efd` added the
   `if (!this.config.applied)` early return plus an `unavailable` guard, with
   `tests/custom-theme-controller.spec.ts` covering both branches.

2. **The entry id guess (still open when the report was filed).**
   `ctx.configForms` addresses one form per *profile entry id* and carries no
   package identity, so the client had to decide which row it was. `servedEntryId`
   read the served-namespace list out of the shared describe mirror and returned
   the aggregate's `web-ui-skin-center` whenever the mirror could not be read.
   That mirror is asynchronous: a standalone Web profile reaches this code before
   it lands, binds a row the Host does not serve, and every `settings.mutate`
   is addressed to an entry that does not exist. The Host refuses, the custom
   theme reports a failed save, and the skin switch rolls back. This reproduced
   the report exactly, including the partial commit: the skin switch writes
   `active` first and the settings write fails afterwards, so the file kept the
   new skin while the UI reported failure.

## Decision

The describe mirror is the only authority on which row the profile gave this
package, so `src/client/settings-entry-id.ts` owns the whole decision:

- `servedEntryId(forms)` returns the first candidate the mirror reports, or
  `null`. `null` means **unknown, never "none"** — an unreadable snapshot is the
  pre-boot window, not proof that the package is absent, so it is deliberately
  distinguishable from "served as no candidate".
- `boundEntryId(forms)` resolves that to a bindable id, falling back to
  `ui-skin-center` — this package's OWN row.

The fallback is the fix. Guessing *another package's* row is what made the write
address a foreign entry; guessing *this package's own* row is safe, because an
entry that is not served reports itself `unavailable` and each feature already
handles that by keeping its defaults and reporting a failed save. The candidate
order also changed to put `ui-skin-center` first, since it is the row this
plugin's own `cordis.patch.yml` installs.

The resolver was extracted into its own module rather than left inline in
`index.ts` so the regression test can call the shipped function. The first
draft of that test re-implemented the decision locally, which would have passed
unchanged against the buggy source; it now imports `boundEntryId` and
`servedEntryId` and was mutation-checked by restoring the old
`?? AGGREGATE_ENTRY_ID` fallback, which fails 2 of the 7 cases.

The report's other request — name the namespace and refusal reason in the error
without printing user values — is `CustomThemeController.sectionState()`, which
reports status, writability, mode, and revision only.

## Deferred binding (#1769) and its recursion fix (2026-09-30)

Under an aggregate install the fallback guess itself was wrong: the aggregate
profile has no `ui-skin-center` row at all, so freezing any id before the
mirror answers addresses a row the Host does not serve. `boundConfigForm()`
therefore defers: while the mirror is unanswered the form reports
`unavailable` and refuses writes, and the moment the describe mirror answers it
binds whichever row the Host actually serves and notifies subscribers.

The first deferred version crashed the whole web boot. `getSnapshot()` lazily
calls `bind()`, and `bind()` published on every unresolved pass (a `null`
target never equals the `undefined` sentinel), so a listener that reads the
form from its own notification — the boot reconcile loop does exactly that —
re-entered `bind() -> publish() -> getSnapshot()` until the stack overflowed;
`apply` threw, the fiber failed, and the boot page rendered
`1 entry did not activate`. `bind()` now runs under a re-entrancy guard and
publishes only when the binding actually changed (unbinding a bound form, or
binding a resolved row). The regression test subscribes a listener that reads
the form while the mirror is unanswered and asserts the read completes without
notifying.

## Alternatives considered

- **Wait for the mirror before binding.** The SDK's `whileServed()` can defer a
  registration until a namespace appears, but `bindConfigForm()` is synchronous
  and its result feeds constructors (`BackgroundController`,
  `CustomThemeController`) that read their value in the same tick. Deferring would
  mean restructuring the boot path around a later entry point, for no user-visible
  gain: an unserved entry already degrades safely.
- **Probe both candidate rows and use whichever is writable.** Two forms, two
  write queues, and a race in which a not-yet-loaded row looks unwritable. The
  mirror already answers the question directly.
- **Treat `web-ui-skin-center` as the canonical id and rename the standalone
  row.** Would have fixed this install, but the entry id is owned by the
  profile, not by this package, and the aggregate's generated row is what the
  family installs. Both ids must keep working.

## Consequences

- A standalone install binds the right row from the first paint, so 「应用」 and
  「恢复默认」 stop failing, and a partially committed `active` no longer
  accompanies a reported failure.
- `servedEntryId` and `boundEntryId` are exported for tests; the client bundle
  still exports no new public surface to consumers.
- A refused custom-theme write now names the section, status, writability, mode,
  and revision. No stored configuration value appears in the message.
- The custom-theme deactivation guard from `ddf5efd` is what closes the other
  half of #17; both halves are now covered by tests.
