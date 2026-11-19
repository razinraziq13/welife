# Security notes

WeLife runs entirely on the player's device. It has no accounts, no server, no analytics and makes no network requests after the app files are cached.

## What the app protects against

| Risk                                                                                                   | Mitigation                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script injection from imported saves, content packs or player-typed text (names, posts, editor fields) | React renders all text as text. The codebase has no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` (checked at release with a search of `src/`). Content packs are data validated by Zod schemas, and never code.                                                                                                                                                      |
| Injected or third-party scripts                                                                        | Production builds include a Content Security Policy (`vite.config.ts`, plugin `welife-csp`). Scripts, styles, workers, fonts and connections must come from the app's own origin. The only inline script, the pre-paint theme snippet in `index.html`, is allowed by its SHA-256 hash, which is computed at build time. Objects, form submissions and foreign `<base>` URLs are blocked. |
| Corrupt or tampered saves                                                                              | Imports are size-limited, checksummed and validated against the world schema and the integrity invariants before they are stored. Stored content packs are re-validated when a save loads (`storedPackIssues`). A save that fails is refused with a reason and never partly applied.                                                                                                     |
| Game state changed outside the rules                                                                   | The UI never writes to IndexedDB. Every gameplay change is a command validated by Zod in the engine worker, and each month is checked against the invariants and the balanced ledger before it is committed.                                                                                                                                                                             |
| Leaking personal data                                                                                  | Nothing leaves the device. Exports are files the player saves themselves.                                                                                                                                                                                                                                                                                                                |

## Limits

- A meta-tag CSP cannot set `frame-ancestors`. If the app is hosted, set `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as an HTTP header too.
- The dev server (`npm run dev`) runs without the policy, because Vite injects inline scripts for hot reload.
- Local data is not encrypted. Anyone with access to the browser profile can read the saves.

## Reporting

Open an issue on the GitHub repository. Do not include real personal data in example saves.
