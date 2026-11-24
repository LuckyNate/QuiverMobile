# QuiverMobile — Repository Rules

## 1. Authority and approval

- The repository owner has final authority over scope, design, implementation, and releases.
- Discuss proposed changes and agree on their exact scope before modifying the repository.
- After agreement, obtain an explicit go-ahead before any write.
- Approval applies only to the specifically agreed changes. Do not infer permission for unrelated edits, refactors, cleanup, file operations, tests, commits, pushes, or other work.
- When a change is unclear, ask instead of assuming.

## 2. Smallest necessary change

- Change only the requested behavior and the code directly required to support it.
- Work hierarchically when necessary: establish or repair the core, then affected branches, then leaves.
- Minimize blast radius. Do not touch unaffected systems.
- Do not remove files, features, or working behavior without explicit authorization.
- Do not perform opportunistic refactoring or structural reorganization.

## 3. Working state and persistence

- Preserve a functioning, buildable application as work proceeds.
- Keep user data, settings, and project state persistent unless a specifically approved change requires otherwise.
- Prefer small, reviewable changes with clear rollback paths.
- Preserve the last known working state when diagnosing regressions.
- Do not present unverified changes as tested or working.

## 4. Change workflow

1. Identify the requested result and relevant code or documentation.
2. Explain the proposed changes and their direct dependencies.
3. Show the proposed diff or exact contents for review.
4. Wait for agreement and an explicit instruction to execute.
5. Make only the authorized edits.
6. Perform only the checks that were explicitly authorized.
7. Report precisely what changed, what was checked, and any remaining limitations.

## 5. Commits and GitHub

- Make commits or pushes only when explicitly authorized.
- Keep each authorized commit focused on the approved change.
- Do not silently alter workflows, dependencies, repository settings, branches, or release configuration.
- Never force-push, rewrite history, or delete branches without explicit permission.
- GitHub Actions may build APKs once its workflow has been separately approved and added.

## 6. Architecture discipline

- Keep engine systems modular: world representation, spatial queries, physics, renderer, input, and Android platform integration.
- Do not replace core design decisions without discussion and approval.
- Android is the first target; VR is a later target of the same engine core.
- Treat open questions in `spec.md` as undecided, not as permission to choose an implementation unilaterally.
- Update specifications and repository rules only with explicit approval.

## 7. Communication

- Treat the owner as the technical decision-maker.
- Be concise and specific about causes, alternatives, tradeoffs, and impact.
- Distinguish observations, assumptions, proposals, and verified results.
- Stop at the agreed scope; request new permission for additional work.

## 8. Working rhythm

The owner works in incremental, singular fixes. Default to one small change per
round, with a small blast radius:

- **One change per round.** Make exactly the requested change; nothing adjacent.
- **Smallest diff.** No refactors, renames or cleanup alongside a fix. Report
  anything adjacent that was noticed, and leave it alone.
- **Always running.** Build, commit and push each fix to `main` as soon as it is
  done, so the deployed build is current. This is standing authorization for that
  loop, and it supersedes the per-change go-ahead in section 1 and the
  commit/push restriction in section 5 for routine fixes.
- **Short reports.** State what changed, whether the build passed, and what to
  look at. Nothing more.

Standing authorization covers the fix → build → commit → push loop only. It does
not authorize force-pushing, branch deletion, workflow or dependency changes, or
expanding the scope of a requested change; if a fix cannot stay small, say so and
let the owner split it.
