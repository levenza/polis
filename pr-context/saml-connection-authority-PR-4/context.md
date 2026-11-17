# Authenticated SSO connection and domain authority

## Summary

Companion to [uno #5079](https://github.com/levenza/uno/pull/5079). The app must know which connection authenticated a login and which email domains that connection is authorized to claim. Both live on the existing SSO connection; no separate app approval registry or environment variable is needed.

## Approach

Store staff-managed `allowedEmailDomains` on SAML and gateway-managed OIDC connections. Normalize exact domains to lowercase; reject wildcards, email addresses, URLs, malformed labels and invalid list values. Explicit empty lists revoke email authority. Metadata-only updates/reuploads preserve staff approval for the same connection, while deletion/recreation starts without approval.

Save `{ clientID, tenant, product, allowedEmailDomains }` from the validated connection outside assertion claims in encrypted authorization-code state, carry it into token state, and write it after raw/provider claims in userinfo and signed ID tokens. Reject explicit connection hints whose tenant/product differs from the request. Mark successful HTTP userinfo responses with a capability header so the app rejects old gateway pods that could echo forged fields.

Staff manage domains in the existing connection edit page for either SSO protocol. Customer setup pages do not display the field; POST/PATCH attempts to supply it return 403. Admin-session and global API-key routes remain the privileged write paths.

The gateway's own SAML admin login must authenticate through the configured staff tenant/product. Both regular OAuth and IdP-initiated credentials paths check gateway-owned authority before admitting a session. Regular SAML userinfo uses the local patched controller so older pods cannot supply echoed authority. Only a fresh successful sign-in receives the current staff-session marker; refreshing an old JWT cannot upgrade it. Both staff pages and admin APIs reject legacy sessions, so an old session cannot create a replacement staff connection to approve domains. Staff sign in again once after rollout.

## Key decisions

- Base the PR on maintained `v26.2.0-fix/scim-username-dedup-and-scimtype` at pinned base `5433a780171dccf36017c60b50816c713475e0fe`; exclude unrelated mainline changes.
- Staff verify ownership during the existing SSO onboarding process. The connection field stores that decision; merely entering a domain does not verify ownership automatically.
- Existing connections have no email authority until staff configure domains. Never derive approval from editable team metadata or requested routing.
- Deploy this gateway before the app, drain all older gateway pods and verify every remaining pod serves the patched authority, and configure/review domains on each active connection before app rollout.
- No live connections, environment settings, images or production deployments were changed. Both PRs remain unmerged with auto-merge disabled.

## Files changed

- Connection types, shared domain validation, SAML/OIDC controllers: persist staff domain authority.
- OAuth and SSO handler: actual connection state, claim overwrite, foreign-hint rejection.
- Production userinfo route: capability header only after successful authentication.
- Existing connection editor and English locale: staff domain controls.
- Customer setup API and gateway admin auth: protect privileged authority updates.
- Scoped controller and actual route/callback regressions: verify persistence, spoof rejection and protected writes.

## Verification

**301 assertions across 10 scoped suites passed**: SAML/OIDC domain persistence, signed authority overwrite, foreign hints, production userinfo, customer setup restrictions, actual admin SAML callbacks, legacy/fresh staff-session proxy boundaries, and adjacent OIDC/federation cases. The app's final disposable protocol suite passed **12 scenarios** with fresh signed SAML assertions, actual gateway controllers, real NextAuth callbacks, guarded Prisma adapter and isolated Postgres. Source is pinned base plus the companion patch; automatic teardown removes the temporary containers and checkout.

Full gateway and library TypeScript checks, targeted ESLint, Prettier and source whitespace checks pass. Actual local staff UI smoke passed: save/reload normalized and deduplicated domains, wildcard rejection retained prior values, and clearing domains persisted. The fake in-memory server and browser were stopped. Five console errors were observed but not classified; no console-clean claim is made. An independent focused source review found no remaining concrete bypass in the authenticated connection/domain flow or customer setup routes.

## Limits

The app harness is an HTTP protocol driver, not a rendered-browser or production test. Microsoft and non-auth service boundaries are fixtures. The reconnect scenario removes a disposable Account row, not the human-only operational unlink command. The adjacent gateway OIDC fixture uses public discovery metadata. No deployed configuration or exploitability was inspected. Existing historical mutation tests and prior results apply to the earlier connection-identity revision; current results must not be inferred from them.

## Rejected alternatives

Requested routing and raw IdP/provider attributes cannot prove authority. A customer-editable team domain cannot establish ownership. A separate app registry duplicates the connection setup and adds maintenance. A new JSON field without the capability header would allow an old gateway to echo forged authority.
