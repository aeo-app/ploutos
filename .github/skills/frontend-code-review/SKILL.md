---
name: frontend-code-review
description: "Use when reviewing frontend changes in this monorepo, especially the active React CRA app under frontend/src, API adapters, auth/payment context, SSE flows, pages, components, accessibility, responsive behavior, or build configuration. Finds correctness, UX, contract, security, and regression risks before approving a change."
---

# Frontend Code Review

Review the active CRA application under `frontend/src`. Do not treat root `frontend/App.jsx` or `frontend/index.js` as active code, and do not modify source files during the review unless the user explicitly asks for fixes.

## Review Workflow

1. Identify the complete diff and trace changed components through their callers, contexts, API adapters, and page routing.
2. Read the relevant backend router/model when the change consumes or changes an API contract. Confirm the frontend and backend agree on paths, payloads, status codes, locked preview fields, and error handling.
3. Check the repository guidance in [frontend instructions](../../instructions/frontend.instructions.md) and the [frontend README](../../../frontend/README.md).
4. Run the narrowest useful validation from `frontend/`: `npm run build` is the primary configured check. Also inspect browser-visible behavior when practical and run any repository pre-commit or staged-file checks that are configured. Do not treat a hook or successful build as proof that the workflow is correct.
5. Report findings first, ordered by severity. Each finding must include the file and line, the user-visible or runtime failure, and a concrete remediation direction. Separate confirmed defects from questions and residual test gaps.

## Review Priorities

- **Active source boundary:** Confirm feature work belongs under `frontend/src/` and does not accidentally update the legacy root app.
- **Authentication:** Preserve token storage, refresh/expiry handling, redirect behavior, authorization headers, logout cleanup, and the shared request helpers. Do not expose tokens in logs, URLs, or rendered markup.
- **API and SSE behavior:** Check adapter paths, HTTP methods, JSON payloads, status handling, abort/cleanup, streaming chunks, reconnection behavior, and user-visible errors. POST-based SSE is manually parsed because native `EventSource` cannot send POST bodies or auth headers.
- **Payments:** Keep checkout contextual. Locked preview results should use the existing payment context and unlock flow; do not add a blanket client-side route gate or trust a client-only paid flag.
- **React state and effects:** Check loading, error, empty, retry, unmount, stale-response, and concurrent-request behavior. Look for effects with incomplete dependencies, state updates after unmount, duplicated requests, and context values that change unexpectedly.
- **UI correctness:** Check responsive layouts, text overflow, keyboard navigation, focus management, accessible names/roles, reduced-motion behavior, loading states, and whether destructive or payment actions are clearly recoverable.
- **Data rendering:** Handle null, missing, locked, partial, and unexpected API fields without crashes. Verify keys are stable and displayed values are escaped/rendered safely.
- **Configuration and dependencies:** CRA environment variables are build-time values. Do not add credentials, assume runtime env injection, or change dependencies without updating `package.json` and the lockfile.

## Output Contract

Use this structure:

```text
## Findings

- [P1] path/to/file.js:123 - Concrete defect and why it fails.
  Suggested direction: ...

## Open Questions

- ...

## Validation

- `command` - result

## Summary

Short statement of overall risk and any remaining test gaps.
```

Use P1 for a release-blocking security, data-loss, broken primary workflow, or contract break; P2 for a significant correctness, accessibility, or regression risk; P3 for a lower-impact issue. If there are no findings, say so clearly and list residual risks or missing tests.
