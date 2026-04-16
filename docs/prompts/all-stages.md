# Run-all-stages prompt

Paste this into a fresh coding-agent session to execute the entire build plan (Stages 1–6) in one sitting.

---

You are building `native-platform-explorer` — a client-only Dash Platform block explorer powered exclusively by `@dashevo/evo-sdk`. The project repo already exists at `/Users/pasta/workspace/native-platform-explorer/`. Work inside that directory. Do not touch anything outside of it.

Your job is to execute **all six stages of the build plan, end to end, in this single session**, commit by commit, without returning to me between stages unless you are genuinely blocked. When you are done, the project must match the PRD.

## Step 0 — Orient yourself (read before writing any code)

Read these files carefully and in this order. You can parallelize reads across multiple `Read` calls.

1. `/Users/pasta/workspace/native-platform-explorer/docs/PRD.md` — the full product requirements document. This is the source of truth. If a stage prompt and the PRD disagree, the PRD wins and you must flag the discrepancy.
2. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/README.md` — conventions for running the stages.
3. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-1-foundation.md`
4. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-2-detail-pages.md`
5. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-3-browse-home.md`
6. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-4-governance.md`
7. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-5-proofs.md`
8. `/Users/pasta/workspace/native-platform-explorer/docs/prompts/stage-6-write-mode.md`

Each stage prompt itself lists reference files you should consult during that stage — read them when you enter the stage, not up-front.

Relevant sibling projects on disk you may need to reference:

- `/Users/pasta/workspace/platform-explorer` — the indexer-backed sibling whose styling and component patterns we clone (Stages 1–4 draw heavily from it).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk` — the SDK we integrate against (every stage uses it).
- `/Users/pasta/workspace/dash-platform-extension` — the browser-extension signer adapter target (Stage 6).
- `/Users/pasta/workspace/evo-sdk-website` — the SDK team's own interactive demo; reference for Stage 6's broadcast console.

## Step 1 — Plan your session

Use `TaskCreate` to create six tasks, one per stage, each describing the stage's deliverable. Mark Stage 1 `in_progress` when you begin it. Mark each completed as soon as it is **actually** complete — never optimistically.

You may also spawn Explore subagents to read/search reference repos in parallel. Do not spawn subagents to *write* code — you own the build.

## Step 2 — Execute stages 1 through 6, sequentially

For each stage, **strictly follow the stage prompt**. Specifically:

1. Confirm prerequisites from the stage prompt's "Assumed state entering this stage" section. If the state doesn't match (e.g. Stage 1 didn't land cleanly), fix the predecessor first — do not start the next stage on a broken base.
2. Do every item in that stage's "Scope — in" section.
3. Do **not** touch anything in "Scope — out" — later stages own that.
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (or the equivalent if you chose a different package manager in Stage 1) and verify everything passes **before** committing.
5. Commit with `--no-gpg-sign` and an explicit, conventional-commits message. Use multiple `-m` flags for title + body if needed. Never `git add -A`; stage files explicitly. Larger stages may use multiple commits.
6. Update `docs/progress.md` with the stage's commit SHA(s) and mark the row complete.
7. Verify every item in that stage's "Acceptance criteria" is genuinely met. Any unmet criterion is a blocker — see "Blocker protocol" below.
8. Immediately proceed to the next stage. Do **not** wait for my approval between stages unless you are blocked.

## Step 3 — Final release

After Stage 6 passes its acceptance criteria:

1. Tag the repo `v1.0.0`.
2. Verify `docs/progress.md` shows every stage ✅ Complete with commit SHAs.
3. Produce a final report (see "Final report" below).

## Blocker protocol

If you genuinely cannot complete a task within a stage:

1. **Exhaust reasonable avenues first** — read the relevant SDK source, check sibling repos, try an alternative approach described in the PRD. Do not escalate at the first sign of friction.
2. If still blocked, do **not** fabricate, stub over the top of, or skip acceptance criteria. Do the work you can, commit it clearly marked, and document the blocker in `docs/progress.md` under a "Blockers" section with: (a) what was attempted, (b) what the specific failure was, (c) what I (the user) would need to unblock you.
3. Continue to later stages that do not depend on the blocker. Mark any skipped downstream work as "Blocked by Stage N" in progress.md.
4. Only stop the session entirely if the blocker makes all subsequent stages impossible (e.g. Stage 1 can't produce a buildable Next.js app at all).

## Ground rules

- **The PRD is the source of truth.** If a stage prompt and the PRD conflict, follow the PRD and document the discrepancy in the stage's report.
- **No purple/violet anywhere in the palette.** Stick to the documented brand colors (see PRD §9.1). This is a hard styling constraint.
- **Never persist private keys or mnemonics** anywhere — localStorage, sessionStorage, disk, commits. Ever. Stage 6 specifies the in-memory-only lifecycle.
- **Never commit secrets** (`.env.local`, any file containing real keys or mnemonics, test mnemonics used in E2E).
- **Match `platform-explorer`'s visual vocabulary** (fonts, glass cards, identifier rendering, tabs, breadcrumbs) so the two products feel like siblings.
- **Use git safely**: `--no-gpg-sign`, explicit file paths in `git add`, conventional-commits messages. Never `--no-verify`. Never force-push. Never `git add -A`.
- **Trust but verify the stage prompts.** If a prompt specifies a library version or path that no longer exists, adapt, then flag the deviation in the stage report.
- **Static export must work** (`output: 'export'` in `next.config.mjs`). If this conflicts with the SDK's WASM loader, solve the conflict in Stage 1 — do not defer it to Stage 6.

## Final report

When every stage is complete (or completed-as-much-as-possible), produce a report covering:

1. **Per-stage summary**: one paragraph per stage — what shipped, any deviations, any unmet acceptance criteria.
2. **Cumulative file inventory**: approximate LOC and component/page counts.
3. **Known issues / deferred work**: anything Stage 6's hardening pass flagged, any SDK quirks you discovered, any TODO comments left in the code (and why).
4. **Testing results**: unit + Playwright summary, number of tests passing, Lighthouse score on `/`.
5. **Deployment**: commit SHAs, the `v1.0.0` tag, whether the CI deploy workflow succeeded against testnet.
6. **Recommended next steps** for me.

## Begin

Start with Step 0. Read the PRD and prompts, then execute Stage 1.
