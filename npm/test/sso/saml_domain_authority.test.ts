import tap from 'tap';
import controllers from '../../src/index';
import { jacksonOptions } from '../utils';
import { saml_connection } from './fixture';
import { readFileSync } from 'fs';
import path from 'path';

const fixture = {
  ...saml_connection,
  rawMetadata: readFileSync(path.join(__dirname, 'data/metadata/boxyhq.xml'), 'utf8'),
};

tap.test('domain approvals stay on the stored SAML connection', async (t) => {
  const { connectionAPIController: api } = await controllers(jacksonOptions);
  const connection = await api.createSAMLConnection({
    ...fixture,
    tenant: 'domain-authority-test',
    allowedEmailDomains: [' ACME.EXAMPLE ', 'acme.example', 'subsidiary.example'],
  });
  const credentials = {
    clientID: connection.clientID,
    clientSecret: connection.clientSecret,
    tenant: connection.tenant,
    product: connection.product,
  };
  const get = async () => (await api.getConnections({ clientID: connection.clientID }))[0];
  t.same(
    ((await get()) as any).allowedEmailDomains,
    ['acme.example', 'subsidiary.example'],
    'stores normalized unique approvals'
  );
  await api.updateSAMLConnection({ ...credentials, allowedEmailDomains: ['new.example'] });
  t.same(((await get()) as any).allowedEmailDomains, ['new.example'], 'staff can replace approved domains');
  await api.updateSAMLConnection({ ...credentials, name: 'Updated metadata' });
  t.same(
    ((await get()) as any).allowedEmailDomains,
    ['new.example'],
    'normal metadata edits preserve approval'
  );
  await api.createSAMLConnection({ ...fixture, tenant: connection.tenant });
  t.same(
    ((await get()) as any).allowedEmailDomains,
    ['new.example'],
    'same-connection metadata re-upload preserves approval'
  );
  await api.updateSAMLConnection({ ...credentials, allowedEmailDomains: [] });
  t.same(((await get()) as any).allowedEmailDomains, [], 'staff can revoke all domain authority');
  await api.deleteConnections({ clientID: connection.clientID, clientSecret: connection.clientSecret });
  const recreated = await api.createSAMLConnection({ ...fixture, tenant: connection.tenant });
  t.same(recreated.allowedEmailDomains, [], 'deleting and recreating cannot recover an old approval');
  await api.deleteConnections({ clientID: recreated.clientID, clientSecret: recreated.clientSecret });
});

for (const domains of [
  'acme.example',
  ['*.example'],
  ['user@acme.example'],
  ['https://acme.example'],
  ['acme.example/path'],
  [''],
  ['a..example'],
  [null],
]) {
  tap.test(`reject malformed domain approval ${JSON.stringify(domains)}`, async (t) => {
    const { connectionAPIController: api } = await controllers(jacksonOptions);
    await t.rejects(
      api.createSAMLConnection({
        ...fixture,
        allowedEmailDomains: domains as any,
      }),
      /allowedEmailDomains/
    );
  });
}

tap.teardown(() => process.exit(0));
