# Authenticated SAML connection authority

## Summary

Companion to https://github.com/levenza/uno/pull/5079. The application must know which company connection actually authenticated a SAML login before linking the identity to an existing account. The existing requested tenant is browser routing and is insufficient proof.

## Approach

Save the validated connection's client ID, tenant and product outside assertion claims in encrypted authorization-code state. Carry it into token state, then write it after raw/assertion claims in userinfo and signed ID tokens. Reject an explicit connection hint whose tenant or product differs from the request. Add an HTTP userinfo capability header so consumers can reject old gateway pods that only echo attacker-controlled fields.

## Key decisions

- Base this PR on the maintained `v26.2.0-fix/scim-username-dedup-and-scimtype` branch at the gateway revision used by the deployment build; do not include unrelated mainline differences.
- Existing app clients can ignore the additive authority data/header.
- New app checks require this gateway change to be deployed first, then operator-reviewed connection/domain grants configured in the app's environment.
- This PR does not deploy an image, modify live connections, establish domain ownership, or enable app email linking.
- Both PRs remain unmerged at the requester's instruction.

## Files changed

- `npm/src/controller/sso-handler.ts`: reject foreign explicit connection hints.
- `npm/src/controller/oauth.ts`: preserve actual connection identity through encrypted state and override assertion claims.
- `npm/src/typings.ts`: describe gateway-owned authority.
- `pages/api/oauth/userinfo.ts`: capability header after successful token validation.
- SAML controller regressions and `npm/test/http/userinfo.test.ts`: reject mismatches and pin actual route header behavior.

## Evidence

November 17, 2026 local checks: 170 SAML assertions, 49 adjacent OIDC/federation assertions, 9 actual HTTP-route handler assertions, and library TypeScript no-emit all passed. The OIDC fixture suite uses public discovery metadata. Original pinned code fails four new security assertions; removing the production HTTP header fails its handler regression.

The app's disposable local harness runs fresh signed assertions through these actual controllers, real NextAuth callbacks, guarded Prisma adapter and isolated Postgres; 11 integration scenarios passed. It uses a small HTTP transport shell, and the separate route handler test covers production header wiring. No production deployment was performed.

## Rejected alternatives

Trusting requested routing or raw SAML attributes cannot prove the authenticated connection. Returning only a new JSON field would let an old gateway echo a forged field; the response header distinguishes the patched endpoint.
