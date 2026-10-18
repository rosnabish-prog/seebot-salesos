# Finance tax rules — starter catalogue

This **illustrative, inactive** CSV is not a tax determination or production-ready rate table.

Importing or displaying this file must not automatically apply rates, taxes, reverse charges, exemptions, or invoice notes. All template rules have `enabled=false` and require qualified finance review to activate.

Columns:
- `rule_code` immutable unique identifier per organization.
- `jurisdiction` ISO 3166-1 alpha-2 code; `XX` is an unspecified jurisdiction placeholder.
- `treatment` supported invoice tax-classification.
- `rate_percent` intentionally blank except where calculation would be zero and eligibility still needs confirmation.
- `effective_from` / `effective_to` delimit applicable validity.
- `approval_required` requires finance approval before a rule can be used.
- `invoice_note` must be confirmed for jurisdiction-specific invoice wording.

**Required application behavior before production:** an organization-owned TaxRule table with role-restricted editing; effective-date selection; snapshot of the chosen rule and numeric rate on the invoice at approval; tax calculated with fixed-decimal arithmetic and line-level rounding policy; reapproval on changes; issued invoice immutability and credit-note correction process; complete audit history.

**Payment workflow:** retain manually entered payments and double-entry ledger entries; automatic bank feeds and matching can remain disabled.
