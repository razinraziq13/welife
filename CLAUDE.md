# WeLife: guidance for Claude

## Source of truth

- Design spec: `C:\Users\RAZIN\Downloads\WeLife_Claude_Development_Specification.md` (v1.0). Treat it as authoritative.
- Approved decisions and engineering resolutions: `docs/DECISIONS.md`. Do not re-ask them.
- Progress and the milestone checklist: `DEVELOPMENT_PROGRESS.md`. Update it at every milestone.
- Requirement mapping: `docs/TRACEABILITY.md`. Update statuses when requirements are verified.

## Working rules

- **Review gate after every milestone.** Stop and wait for the user's approval before starting the next one.
- One branch per milestone (`milestone-N`; M1 and M2 share `milestone-1-2`, M3 and M4 share `milestone-3-4`). Commit only when the user asks.
- Never mark something done if it is mocked, disconnected or untested. Report real command output.
- No placeholder screens or fake buttons. Add a route only when its screen works. A disabled control must explain why.
- The engine (`src/engine`) is pure and deterministic. Never use `Math.random`, `Date`, timers or browser globals there; ESLint, tsconfig and dependency-cruiser enforce this.
- All gameplay writes go UI → validated request → worker. The UI never touches IndexedDB.
- Money is stored as integer minor units (BigInt) in a balanced double-entry ledger (from M4).
- Dexie schema: add a new `version(n)` block for each change; never edit old blocks.

## Commands

- `npm run verify`: run before declaring any milestone done.
- `npm run e2e`: runs Playwright against a production build. Firefox is opt-in locally (`WELIFE_E2E_FIREFOX=1`), because Windows security policy blocks its binary on this machine.

## Toolchain pins

- TypeScript stays on 6.0.x until typescript-eslint supports 7.x.
- ESLint stays on 9.x until eslint-plugin-jsx-a11y supports 10.x.
