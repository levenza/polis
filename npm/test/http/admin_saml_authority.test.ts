import tap from 'tap';
import path from 'path';
import { register } from 'tsconfig-paths';

const unregister = register({
  baseUrl: path.resolve(__dirname, '../../..'),
  paths: { '@lib/*': ['lib/*'] },
});
tap.teardown(unregister);

const scope = { tenant: 'staff-tenant', product: 'staff-product' };
for (const scenario of [
  { name: 'staff connection', authority: { clientID: 'staff', ...scope }, accepted: true },
  {
    name: 'customer connection',
    authority: { clientID: 'customer', tenant: 'customer-tenant', product: scope.product },
    accepted: false,
  },
  {
    name: 'wrong product',
    authority: { clientID: 'customer', tenant: scope.tenant, product: 'customer-product' },
    accepted: false,
  },
  { name: 'old token without gateway authority', authority: undefined, accepted: false },
]) {
  tap.test(`admin SAML rejects customer authority: ${scenario.name}`, async (t) => {
    const profile = {
      id: 'subject',
      email: 'staff@acme.example',
      authenticatedConnection: scenario.authority,
    };
    const { default: options } = t.mockRequire('../../../pages/api/auth/[...nextauth]', {
      'next-auth': { __esModule: true, default: (options: unknown) => options },
      'next-auth/providers/boxyhq-saml': { __esModule: true, default: (options: unknown) => options },
      'next-auth/providers/credentials': { __esModule: true, default: (options: unknown) => options },
      'next-auth/providers/email': { __esModule: true, default: (options: unknown) => options },
      '@lib/jackson': {
        __esModule: true,
        default: async () => ({
          oauthController: {
            token: async () => ({ access_token: 'test-token' }),
            userInfo: async () => profile,
          },
        }),
      },
      '@lib/nextAuthAdapter': { __esModule: true, default: () => ({}) },
      '@lib/utils': { validateEmailWithACL: () => true },
      '@lib/env': {
        jacksonOptions: { externalUrl: 'https://gateway.example' },
        adminPortalSSODefaults: scope,
      },
      '@lib/constants': { sessionName: 'test-session' },
    });
    const legacyToken = await options.callbacks.jwt({ token: {}, account: undefined });
    t.notOk(
      legacyToken.staffSessionAuthority,
      'refreshing a legacy session never grants new staff authority'
    );
    const freshToken = await options.callbacks.jwt({ token: {}, account: { provider: 'credentials' } });
    t.equal(
      freshToken.staffSessionAuthority,
      'connection-domain-authority-v1',
      'successful initial authentication marks a fresh staff session'
    );
    const accepted = await options.callbacks.signIn({
      user: { email: profile.email },
      account: { provider: 'boxyhq-saml' },
      profile,
    });
    t.equal(accepted, scenario.accepted, 'regular SAML login binds the actual gateway connection');
    const credentialsProvider = options.providers.find(
      (provider: any) => provider.id === 'boxyhq-saml-idplogin'
    );
    const user = await credentialsProvider.authorize({ code: 'test-code' });
    t.equal(
      Boolean(user),
      scenario.accepted,
      'IdP-initiated login cannot mint an admin session from a customer connection'
    );
    const backchannelProfile = await options.providers[0].userinfo.request({
      tokens: { access_token: 'test-token' },
    });
    t.same(
      backchannelProfile,
      profile,
      'regular SAML uses the local gateway controller instead of trusting an old HTTP endpoint'
    );
  });
}
