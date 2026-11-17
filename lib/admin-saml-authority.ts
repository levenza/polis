/** Require fresh authentication after tightening the staff SAML boundary. */
export const STAFF_SESSION_AUTHORITY = 'connection-domain-authority-v1';

/** Accept SAML administrator sessions only from the gateway's configured staff connection scope. */
export const isAdminSamlConnection = (
  profile: unknown,
  scope: { tenant: string; product: string }
): boolean => {
  if (!profile || typeof profile !== 'object' || !('authenticatedConnection' in profile)) {
    return false;
  }
  const connection = profile.authenticatedConnection;
  return Boolean(
    connection &&
    typeof connection === 'object' &&
    'clientID' in connection &&
    typeof connection.clientID === 'string' &&
    connection.clientID.length > 0 &&
    'tenant' in connection &&
    connection.tenant === scope.tenant &&
    'product' in connection &&
    connection.product === scope.product
  );
};
