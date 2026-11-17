import { JacksonError } from '../error';

/** Normalize staff-approved domains; reject email addresses, URLs and wildcard grants. */
export function normalizeAllowedEmailDomains(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((domain) => typeof domain !== 'string')) {
    throw new JacksonError('allowedEmailDomains must be an array of exact domain names', 400);
  }
  const domains = value.map((domain: string) => domain.trim().toLowerCase());
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const domainPattern = new RegExp(`^${label}(?:\\.${label})+$`);
  if (domains.some((domain) => domain.length > 253 || !domainPattern.test(domain))) {
    throw new JacksonError('allowedEmailDomains must contain exact domain names without wildcards', 400);
  }
  return [...new Set(domains)];
}
