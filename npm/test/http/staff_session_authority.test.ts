import tap from 'tap';
import path from 'path';
import { register } from 'tsconfig-paths';
import { NextRequest } from 'next/server';

const unregister = register({
  baseUrl: path.resolve(__dirname, '../../..'),
  paths: { '@lib/*': ['lib/*'] },
});
tap.teardown(unregister);

for (const scenario of [
  { name: 'no session', token: null, apiStatus: 401, pageStatus: 307 },
  { name: 'legacy session', token: {}, apiStatus: 401, pageStatus: 307 },
  {
    name: 'fresh staff session',
    token: { staffSessionAuthority: 'connection-domain-authority-v1' },
    apiStatus: 200,
    pageStatus: 200,
  },
]) {
  tap.test(`staff gateway rejects old authentication: ${scenario.name}`, async (t) => {
    const { proxy, config } = t.mockRequire('../../../proxy', {
      'next-auth/jwt': { getToken: async () => scenario.token },
      '@lib/auth': { validateApiKey: () => false, extractAuthToken: () => '' },
      '@lib/constants': { sessionName: 'test-session' },
    });
    t.ok(config.matcher.includes('/admin/:path*'), 'staff pages are covered alongside API routes');
    const apiResponse = await proxy(new NextRequest('https://gateway.example/api/admin/connections'));
    t.equal(apiResponse.status, scenario.apiStatus, 'legacy cookies cannot modify staff SSO configuration');
    const pageResponse = await proxy(
      new NextRequest('https://gateway.example/admin/sso-connection', {
        headers: { cookie: 'test-session.0=legacy-part; test-session.1=legacy-part' },
      })
    );
    t.equal(pageResponse.status, scenario.pageStatus, 'staff pages require a newly authenticated session');
    if (scenario.pageStatus === 307) {
      t.equal(pageResponse.headers.get('location'), 'https://gateway.example/admin/auth/login');
      t.match(
        pageResponse.headers.get('set-cookie'),
        /test-session\.0=;/,
        'clears chunked stale cookies before login'
      );
      t.match(pageResponse.headers.get('set-cookie'), /test-session\.1=;/);
    }
    const loginResponse = await proxy(new NextRequest('https://gateway.example/admin/auth/login'));
    t.equal(loginResponse.status, 200, 'fresh authentication remains reachable');
  });
}
