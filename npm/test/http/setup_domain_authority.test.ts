import tap from 'tap';
import path from 'path';
import { register } from 'tsconfig-paths';

const unregister = register({
  baseUrl: path.resolve(__dirname, '../../..'),
  paths: { '@lib/*': ['lib/*'] },
});
tap.teardown(unregister);

for (const method of ['POST', 'PATCH']) {
  tap.test(`customer setup ${method} cannot approve email domains`, async (t) => {
    const { default: handler } = t.mockRequire('../../../pages/api/setup/[token]/sso-connection/index', {
      '@lib/jackson': {
        __esModule: true,
        default: async () => {
          t.fail('domain approval must be rejected before any setup or connection mutation');
        },
      },
      '@lib/utils': { strategyChecker: () => ({ isSAML: true, isOIDC: false }) },
      '@lib/development-mode': { validateDevelopmentModeLimits: async () => {} },
      '@lib/logger': { logger: { error: () => {} } },
    });
    let status = 200;
    let body: any;
    const response = {
      status: (value: number) => {
        status = value;
        return response;
      },
      json: (value: unknown) => {
        body = value;
        return response;
      },
    };
    await handler(
      { method, query: { token: 'customer-token' }, body: { allowedEmailDomains: ['victim.example'] } },
      response
    );
    t.equal(status, 403);
    t.match(body.error.message, /Only gateway staff/);
  });
}
