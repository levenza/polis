import tap from 'tap';
import path from 'path';
import { register } from 'tsconfig-paths';

// The npm tests normally compile only the library; this test also loads a Next route.
const unregister = register({
  baseUrl: path.resolve(__dirname, '../../..'),
  paths: { '@lib/*': ['lib/*'] },
});
tap.teardown(unregister);

const profile = {
  id: 'test-subject',
  email: 'user@example.test',
  authenticatedConnection: {
    clientID: 'test-connection',
    tenant: 'example.test',
    product: 'test-product',
    allowedEmailDomains: ['example.test'],
  },
};

for (const scenario of [
  { name: 'authenticated userinfo', method: 'GET', token: 'valid', status: 200, authority: '1' },
  { name: 'invalid access token', method: 'GET', token: 'invalid', status: 403, authority: undefined },
  { name: 'missing access token', method: 'GET', token: undefined, status: 401, authority: undefined },
  { name: 'unsupported method', method: 'POST', token: 'valid', status: 405, authority: undefined },
]) {
  tap.test(`capability header is scoped to success: ${scenario.name}`, async (t) => {
    // Exercise the production HTTP handler; only its service dependencies are replaced.
    const { default: handler } = t.mockRequire('../../../pages/api/oauth/userinfo', {
      '@lib/jackson': {
        __esModule: true,
        default: async () => ({
          oauthController: {
            userInfo: async (token: string) => {
              if (token !== 'valid') {
                throw { message: 'Invalid token', statusCode: 403 };
              }
              return profile;
            },
          },
        }),
      },
      '@lib/auth': {
        extractAuthToken: (req: { headers: { authorization?: string } }) => req.headers.authorization,
      },
      '@lib/logger': { logger: { error: () => {} } },
    });

    let statusCode = 200;
    let body: unknown;
    const headers = new Map<string, string>();
    const response = {
      status: (value: number) => {
        statusCode = value;
        return response;
      },
      setHeader: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
        return response;
      },
      json: (value: unknown) => {
        body = value;
        return response;
      },
    };

    await handler(
      { method: scenario.method, headers: { authorization: scenario.token }, query: {} },
      response
    );

    t.equal(statusCode, scenario.status, 'preserves the authentication outcome');
    t.equal(
      headers.get('x-levenza-saml-authority'),
      scenario.authority,
      'only validated userinfo advertises the gateway-owned authority capability'
    );
    if (scenario.status === 200) {
      t.same(body, profile, 'returns the authenticated profile');
    }
  });
}
