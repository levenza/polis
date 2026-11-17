# Authenticated SSO connection authority

## Summary

Reduced companion to [uno #5079](https://github.com/levenza/uno/pull/5079). The app uses staff-managed `Team.domains` for domain authority and needs trustworthy proof of which SSO connection authenticated the login. This gateway PR exposes that proof; it adds no domain registry, field or editor.

## Approach

Carry validated `{ clientID, tenant, product }` outside assertion claims in encrypted authorization-code state and token state. Write it after raw/provider claims in userinfo and signed ID tokens. Reject explicit connection hints naming a different tenant/product. Set a capability header only on successful authenticated HTTP userinfo so old pods cannot satisfy the new app checks by echoing forged fields.

Protect gateway configuration too: regular and IdP-initiated admin SAML login must match the configured staff tenant/product, and regular userinfo uses the local patched controller. Only a fresh successful staff sign-in receives the session marker; old JWT refresh cannot upgrade it. Staff pages and admin APIs reject legacy sessions. Staff reauthenticate once after rollout.

## Why the companion remains necessary

In pinned base `5433a780171dccf36017c60b50816c713475e0fe`, actual connection clientID is encrypted internally but not returned by userinfo. ID-token audience identifies the requested OAuth client (`dummy` here), while subject/idHash derive from asserted identity. PKCE exchange does not add connection-specific client credential binding. These cannot independently prove which configured company connection authenticated the user.

Protecting gateway admin configuration remains relevant without an allowed-domain field: a non-staff gateway administrator could create/rebind a connection under a trusted Team.id. The old SAML admin path did not enforce staff connection scope. This is a confirmed source boundary issue; deployed settings/exploitability were not inspected.

## Key decisions

- Target maintained `v26.2.0-fix/scim-username-dedup-and-scimtype` matching the pinned deployment source, excluding unrelated mainline changes.
- Domain management stays exclusively in the existing Levenza staff portal's Team.domains workflow. The previous connection field/editor and its screenshot are removed from the PR.
- Rollout: fully deploy [uno #8812](https://github.com/levenza/uno/pull/8812), drain old customer-write-capable app pods, have staff review existing domain mappings, deploy this gateway and drain its old pods, then deploy #5079 after refreshing its main dependency and remaining review acceptance.
- Neither this PR nor local test success configures or approves real domains. No production state was changed. Keep all related PRs unmerged.

## Files changed

- OAuth/SSO controllers and types: encrypted actual-connection identity and assertion overwrite; foreign-hint rejection.
- Production HTTP userinfo handler: capability header after successful validation.
- Gateway admin auth/helper/proxy: staff scope and fresh-session boundaries.
- Scoped regressions: SAML/OIDC/federation authority, actual userinfo/admin callback/proxy behavior.

## Verification

**276 assertions across 7 scoped suites passed**, including both SAML OAuth suites, adjacent OIDC/federation, actual production userinfo, admin SAML callbacks and staff-session proxy boundaries. Full gateway and library TypeScript checks, targeted ESLint, Prettier and source whitespace checks passed.

The matching app harness passed **13 scenarios** with fresh signed SAML assertions, actual gateway controllers, real NextAuth callbacks, guarded Prisma adapter and isolated Postgres. The app suite snapshots team/domain state as well as users/accounts/memberships and session absence; it checks missing staff configuration and subsequent domain removal.

## Limits

This is local protocol/controller/handler evidence, not a production rollout or live provider/browser acceptance. Microsoft and non-auth boundaries are fixtures. The adjacent gateway OIDC fixture uses public discovery metadata. The entire upstream suite was not run. No deployed identity-provider setting or current Team.domains data was inspected.

## Rejected alternatives

Browser routing, raw IdP claims, token audience/subject and per-connection credentials in the existing PKCE/dummy-client flow cannot replace this actual-connection proof. Duplicating domains on gateway records is unnecessary once existing Team.domains is made staff-managed.
