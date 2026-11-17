import { useState, type FormEvent } from 'react';
import { useTranslation } from 'next-i18next';
import type { SAMLSSORecord, OIDCSSORecord } from '@boxyhq/saml-jackson';
import { errorToast, successToast } from '@components/Toaster';

/** Edit domain authority alongside the existing connection in the staff portal only. */
const AllowedEmailDomains = ({ connection }: { connection: SAMLSSORecord | OIDCSSORecord }) => {
  const { t } = useTranslation('common');
  const [domains, setDomains] = useState((connection.allowedEmailDomains ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  /** Save an explicit domain approval without changing the connection's metadata. */
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...('idpMetadata' in connection ? { isSAML: true } : { isOIDC: true }),
          clientID: connection.clientID,
          clientSecret: connection.clientSecret,
          tenant: connection.tenant,
          product: connection.product,
          allowedEmailDomains: domains.split(/\s+/).filter(Boolean),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error.message);
      }
      successToast(t('allowed_email_domains_saved'));
    } catch (error) {
      errorToast(error instanceof Error ? error.message : t('allowed_email_domains_save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className='mb-8 border-b border-gray-200 pb-8 dark:border-gray-700'>
      <label htmlFor='allowed-email-domains' className='mb-2 block font-medium'>
        {t('allowed_email_domains')}
      </label>
      <p id='allowed-email-domains-help' className='mb-3 text-sm text-gray-600 dark:text-gray-300'>
        {t('allowed_email_domains_help')}
      </p>
      <textarea
        id='allowed-email-domains'
        aria-describedby='allowed-email-domains-help'
        className='textarea textarea-bordered mb-3 block w-full'
        rows={3}
        value={domains}
        onChange={(event) => setDomains(event.target.value)}
        placeholder='acme.example'
      />
      <button type='submit' className='btn btn-primary' disabled={saving}>
        {t('save_allowed_email_domains')}
      </button>
    </form>
  );
};

export default AllowedEmailDomains;
