---
name: backend-code-review
description: "Use when reviewing backend changes in this monorepo, especially FastAPI routers, Pydantic models, authentication, payments, DynamoDB, AWS integrations, SSE, schedulers, or Terraform. Finds correctness, security, contract, persistence, and operational risks before approving a change."
---

# Backend Code Review

Review the change as a FastAPI service change in a monorepo. Do not modify source files during the review unless the user explicitly asks for fixes.

## Review Workflow

1. Identify the complete change set from the diff and its callers. Include related frontend API adapters when a request or response contract changed.
2. Read the nearest router, model, service, database helper, and security dependency involved. Follow the actual call path instead of reviewing only the edited file.
3. Check the repository guidance in [backend instructions](../../instructions/backend.instructions.md) and the [backend README](../../../backend/README.md).
4. Run the narrowest useful validation from `backend/`: targeted `uv run pytest` tests when available, import/startup checks when practical, and any repository pre-commit or staged-file checks that are configured. Do not treat a hook passing as proof that behavior is correct.
5. Report findings first, ordered by severity. Each finding must include the file and line, the failure mode, and a concrete remediation direction. Separate confirmed defects from questions and residual test gaps.

## Review Priorities

- **Authentication and authorization:** Verify Cognito JWT handling, user scoping, admin checks, dependency injection, and that unauthenticated webhook routes use signature verification instead of bearer auth.
- **Payment behavior:** Preserve contextual free previews and locked placeholders. Check that payment status is not trusted from client input, plan pricing remains server-side, and webhook signatures use the raw request body and configured secret.
- **API contracts:** Confirm `/api/v1/...` prefixes, status codes, error shapes, Pydantic validation, optional fields, and frontend consumers remain compatible.
- **Persistence:** Check DynamoDB key construction, table/GSI selection, update expressions, serialization, ownership filtering, pagination, idempotency, and failure handling.
- **External services:** Check AWS, Bedrock, Airwallex, Cognito, S3, and HTTP calls for credential leakage, timeouts, retries, response validation, and provider errors. Do not approve production credentials or unsafe local bypasses.
- **Streaming and background work:** Verify SSE framing, disconnect/error handling, cleanup, async boundaries, and scheduler behavior. The scheduler is in-process and requires a persistent backend process.
- **AI-generated content:** Check structured parsing, fallback behavior, token accounting, preview limits, and that unconfirmed facts are not presented as verified data.
- **Infrastructure and configuration:** Treat Terraform state, `.env` files, and `*.tfvars` as sensitive. Review IAM scope, public exposure, encryption, TTL, and environment defaults when infrastructure changes.

## Output Contract

Use this structure:

```text
## Findings

- [P1] path/to/file.py:123 - Concrete defect and why it fails.
  Suggested direction: ...

## Open Questions

- ...

## Validation

- `command` - result

## Summary

Short statement of overall risk and any remaining test gaps.
```

Use P1 for a release-blocking security, data-loss, outage, or contract break; P2 for a significant correctness or maintainability risk; P3 for a lower-impact issue. If there are no findings, say so clearly and list residual risks or missing tests.
