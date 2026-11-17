import tap from 'tap';
import controllers from '../../src/index';
import { jacksonOptions } from '../utils';
import type { OIDCSSORecord } from '../../src/typings';

const fixture = {
  defaultRedirectUrl: 'https://app.example/callback',
  redirectUrl: ['https://app.example/callback'],
  tenant: 'oidc-authority.example',
  product: 'test',
  oidcMetadata: {
    issuer: 'https://idp.example',
    authorization_endpoint: 'https://idp.example/authorize',
    token_endpoint: 'https://idp.example/token',
    userinfo_endpoint: 'https://idp.example/userinfo',
    jwks_uri: 'https://idp.example/jwks',
  },
  oidcClientId: 'test-client',
  oidcClientSecret: 'test-secret',
};

tap.test('OIDC connections retain the same staff domain authority contract', async (t) => {
  const { connectionAPIController: api } = await controllers(jacksonOptions);
  const connection = await api.createOIDCConnection({ ...fixture, allowedEmailDomains: [' ACME.EXAMPLE '] });
  const credentials = {
    clientID: connection.clientID,
    clientSecret: connection.clientSecret,
    tenant: connection.tenant,
    product: connection.product,
  };
  const get = async () => (await api.getConnections({ clientID: connection.clientID }))[0] as OIDCSSORecord;
  t.same((await get()).allowedEmailDomains, ['acme.example'], 'persists normalized domains');
  await api.updateOIDCConnection({ ...credentials, allowedEmailDomains: ['subsidiary.example'] });
  t.same((await get()).allowedEmailDomains, ['subsidiary.example'], 'staff can replace domains');
  await api.updateOIDCConnection({ ...credentials, name: 'Metadata edit' });
  t.same((await get()).allowedEmailDomains, ['subsidiary.example'], 'metadata edits preserve approvals');
  await api.createOIDCConnection(fixture);
  t.same((await get()).allowedEmailDomains, ['subsidiary.example'], 're-upload preserves approvals');
  await api.updateOIDCConnection({ ...credentials, allowedEmailDomains: [] });
  t.same((await get()).allowedEmailDomains, [], 'staff can revoke domains');
  await api.deleteConnections(credentials);
  const recreated = await api.createOIDCConnection(fixture);
  t.same(recreated.allowedEmailDomains, [], 'recreation cannot restore approvals');
  await api.deleteConnections({ clientID: recreated.clientID, clientSecret: recreated.clientSecret });
  await t.rejects(
    api.createOIDCConnection({ ...fixture, allowedEmailDomains: ['*.example'] }),
    /allowedEmailDomains/
  );
});

tap.teardown(() => process.exit(0));
