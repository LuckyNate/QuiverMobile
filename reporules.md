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
