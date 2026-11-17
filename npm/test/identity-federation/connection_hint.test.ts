import tap from 'tap';
import path from 'path';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { deflateRaw } from 'zlib';
import jackson from '../../src';
import type { SAMLSSORecord } from '../../src';
import { GENERIC_ERR_STRING } from '../../src/controller/utils';
import { jacksonOptions } from '../utils';
import { serviceProvider } from './constants';

const deflateRawAsync = promisify(deflateRaw);
const tenant = 'primary.example';
const secondaryTenant = 'secondary.example';
const product = 'hint-test';
const redirectUri = 'http://localhost:3366/sso/callback';

// Exercise public callers so browser parameters cannot become a trusted tenant list.
tap.test('connection hints respect the caller-owned tenant scope', async (t) => {
  const { connectionAPIController, identityFederationController, oauthController } =
    await jackson(jacksonOptions);
  const rawMetadata = await fs.readFile(path.join(__dirname, 'data/metadata.xml'), 'utf8');
  const connections: SAMLSSORecord[] = [];
  for (const scope of [
    { tenant, product },
    { tenant: secondaryTenant, product },
    { tenant: 'foreign.example', product },
    { tenant: secondaryTenant, product: 'foreign-product' },
  ]) {
    connections.push(
      await connectionAPIController.createSAMLConnection({
        ...scope,
        rawMetadata: rawMetadata
          .replace('https://saml.example.com/entityid', `https://${scope.tenant}/${scope.product}`)
          .replaceAll('https://mocksaml.com/api/saml/sso', `https://${scope.tenant}/${scope.product}/sso`),
        defaultRedirectUrl: redirectUri,
        redirectUrl: JSON.stringify([redirectUri]),
      })
    );
  }
  const [primary, secondary, foreignTenant, foreignProduct] = connections;
  const appParams = { name: 'Scoped federation', tenant, product, tenants: [secondaryTenant] };
  const samlApp = await identityFederationController.app.create({
    ...appParams,
    entityId: serviceProvider.entityId,
    acsUrl: serviceProvider.acsUrl,
  });
  const oidcApp = await identityFederationController.app.create({
    ...appParams,
    type: 'oidc',
    acsUrl: '',
    entityId: '',
    redirectUrl: JSON.stringify([redirectUri]),
  });
  t.teardown(async () => {
    for (const app of [samlApp, oidcApp]) {
      await identityFederationController.app.delete({ id: app.id });
    }
    for (const connection of connections) {
      await connectionAPIController.deleteConnections({
        tenant: connection.tenant,
        product: connection.product,
      });
    }
  });
  const request = Buffer.from(
    await deflateRawAsync(await fs.readFile(path.join(__dirname, 'data/request.xml'), 'utf8'))
  ).toString('base64');
  const oauthParams = {
    redirect_uri: redirectUri,
    state: 'hint-state',
    response_type: 'code',
    client_id: 'dummy',
    code_challenge: '',
    code_challenge_method: '',
  } as const;

  for (const flow of ['saml', 'oidc'] as const) {
    /** Initiate a real federation request using its stored application scope. */
    const authorize = async (idp_hint: string): Promise<{ redirect_url?: string }> =>
      flow === 'saml'
        ? identityFederationController.sso.getAuthorizeUrl({
            request,
            relayState: 'hint-relay-state',
            samlBinding: 'HTTP-Redirect',
            idp_hint,
          })
        : oauthController.authorize({ ...oauthParams, client_id: oidcApp.clientID!, idp_hint });

    await t.test(`${flow} federation accepts a permitted secondary tenant`, async (t) => {
      const response = await authorize(secondary.clientID);
      const url = new URL(response.redirect_url!);
      t.equal(url.origin + url.pathname, secondary.idpMetadata.sso.redirectUrl);
      t.ok(url.searchParams.get('SAMLRequest'), 'starts login at the selected upstream IdP');
    });
    for (const [reason, connection] of [
      ['tenant', foreignTenant],
      ['product', foreignProduct],
    ] as const) {
      await t.test(`${flow} federation rejects a foreign ${reason}`, async (t) => {
        await t.rejects(authorize(connection.clientID), {
          message: GENERIC_ERR_STRING,
          statusCode: 403,
        });
      });
    }
  }

  await t.test('ordinary OAuth cannot expand its tenant scope with browser parameters', async (t) => {
    await t.rejects(
      oauthController.authorize({
        ...oauthParams,
        tenant,
        product,
        tenants: [tenant, secondaryTenant],
        idp_hint: secondary.clientID,
      }),
      { message: GENERIC_ERR_STRING, statusCode: 403 }
    );
  });
  await t.test('ordinary OAuth still accepts its own tenant and product', async (t) => {
    const response = await oauthController.authorize({
      ...oauthParams,
      tenant,
      product,
      idp_hint: primary.clientID,
    });
    t.ok(new URL(response.redirect_url!).searchParams.get('SAMLRequest'));
  });
});

tap.teardown(() => process.exit(0));
