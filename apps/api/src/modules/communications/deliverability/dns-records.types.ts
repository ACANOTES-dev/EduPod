/**
 * Stored shape of `tenant_email_domains.dns_records_json`.
 *
 * Resend's `domains.create` and `domains.get` return one record per DNS entry
 * the tenant must publish. `name`, `type`, and `value` are copied verbatim
 * into the DNS provider; `status` reflects Resend's most recent check.
 *
 * `record` differentiates SPF (sender authorisation), DKIM (signing key), and
 * DMARC (policy / reporting). Multiple DKIM records may appear during key
 * rotation — all records of a given purpose must be `verified` for the
 * purpose-level status to count as verified.
 */
export interface DnsRecord {
  record: 'SPF' | 'DKIM' | 'DMARC';
  name: string; // hostname (e.g. 'school.example.org' or '_dmarc.school.example.org')
  type: 'TXT' | 'MX' | 'CNAME';
  value: string; // record value to copy into the DNS provider
  status: 'pending' | 'verified' | 'failed';
}

export type DnsRecordList = DnsRecord[];
