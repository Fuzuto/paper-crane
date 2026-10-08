# Paper Crane

A quiet digital origami experience. Choose paper, make twelve guided folds, give your crane a wish, and collect a thousand little moments of care.

[Live website](https://paper-crane-roan.vercel.app) · [Private GitHub repository](https://github.com/Fuzuto/paper-crane)

## Run locally

Use Node.js 22 LTS and pnpm 11.25.0 (pinned in `package.json`).

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. `pnpm build` creates a fully static site in `out/`, ready for a static hosting provider. `pnpm typecheck` checks TypeScript and `pnpm test` runs the focused persistence and folding checks. The `start` command serves that static export locally after a build.

## Deploy on Vercel

Import this private GitHub repository into Vercel using the Next.js preset. The checked-in `vercel.json` builds with `pnpm build`; Vercel reads the `.next/` build metadata to publish the static site. The build also creates `out/` for other static hosts. Enable Corepack with the build environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pinned pnpm version. No application secrets or runtime environment variables are required.

The `.vercel/` project link and local credentials stay outside Git; `.vercelignore` also excludes local dependencies, test artifacts, and build caches from source uploads.

This repository is connected to the `paper-crane` Vercel project. Pushes to `main` automatically deploy to the live website; Vercel keeps generated preview URLs protected.

Browser checks: `pnpm test:browser` exercises the real journey in temporary contexts, `pnpm test:visual` captures three screen sizes, and `pnpm check:performance` runs Lighthouse against a production preview at port 3001. These tools use installed Edge on Windows or a Playwright Chromium installation (`pnpm exec playwright install chromium`) elsewhere. `QA_URL`, `AUDIT_URL`, and `EDGE_PATH` can override the defaults. Reports are written to the ignored `artifacts/` folder. Automated accessibility checks complement manual keyboard testing; they do not certify screen reader compatibility.

## The experience

- A faceted origami crane with soft lighting, gentle pointer movement, and an immediate SVG fallback.
- Six paper colors and three patterns.
- Twelve guided stages. Grab the marked paper corner with a mouse or touch, drag it to the ring, and release to crease. The paper flap bends with your movement; incomplete folds return gently. Keyboard users move the corner with arrow keys and crease with Enter after reaching the ring. Undo a fold or return to paper selection.
- An optional crane name and wish, plus a private or open-to-sharing preference. “Keep for later” saves immediately with a paper-color name when blank.
- A local collection with editable names and wishes, detail views, visibility filters, sorting, removal, and a downloadable JSON copy.
- A thousand-crane journey with milestones at 1, 10, 100, and 1,000 creations.
- Optional synthesized ambient wind. All animation respects reduced-motion settings.

The folding illustrations are a guided visual prototype, grouping traditional folds into twelve stages. Selected flaps rotate about their crease while the pointer follows a defined fold path. This is not a full physical paper simulation. Pointer and keyboard movement use the same validated gesture and fold reducer; future geometry can extend the independent gesture definitions.

## Data and privacy

Only prototype creation data is kept in localStorage under `paper-crane.collection.v1`. The collection starts empty. Clearing browser data removes it. Downloading a copy keeps a separate JSON record; importing backups is not currently part of the interface.

The public/private control stores a preference. Choosing “Open to sharing” does **not** publish a crane or transmit a wish. Everything stays in the current browser. Wishes are user content rendered as text, never HTML. Storage validation rejects corrupt or unsupported records and preserves their original data. Failed saves keep the wish form available.

There is no authentication, database, AI generation, tracking integration, or community network in this version.

## Structure

```text
app/                         Static Next.js page, metadata, fonts, global styles
components/paper-crane-experience.tsx  Connected experience and accessible controls
components/drag-fold-paper.tsx  Pointer/touch manipulation and animated paper flaps
components/crane-note-editor.tsx  Optional names and wishes, editable later
components/crane-art.tsx      Lightweight SVG and lazy 3D boundary
components/crane-3d.tsx       React Three Fiber paper facets and light
lib/cranes.ts                Validated local persistence and repository contract
lib/folding.ts               Guided instructions and input-independent reducer
lib/fold-gestures.ts         Fold geometry and movement validation
tests/storage.test.ts        Persistence failure and folding transition checks
tests/drag-folding.test.ts   Pointer geometry and deliberate completion checks
```

The fonts are self-hosted Cormorant Garamond and DM Sans under the SIL Open Font License. The 3D artwork is constructed from paper facets in code. It is loaded only for larger visible previews after the first paint; phones, data-saving connections, and collection thumbnails use the same faceted SVG artwork. Device pixel ratio is capped, with a fallback for unavailable WebGL.

## Phase 2 integration

Implement the `CraneRepository` contract with server-backed `list`, `save`, and `remove` operations, then connect the experience to that adapter. Keep the current crane shape and move ownership and authorization checks to the server. Add user profiles, timestamps, aggregate statistics, and a migration/import flow for existing local creations.

Authentication should use server sessions with HttpOnly, Secure, SameSite cookies, expiry, logout invalidation, and CSRF protection where required. Email/password and Google OAuth/OpenID Connect belong on the server. Passwords, authentication tokens, and session secrets must never enter localStorage.

Before enabling public wishes or unique sharing links, require an explicit publish action separate from the local visibility preference. Add ownership checks, revocation, anonymous display options, reporting, rate limits, and moderation. Sending a crane to another person should never expose private wishes without consent. These are integration requirements, not features simulated in Phase 1.
