revoke all on public.disability_company_contacts_pool from anon, authenticated;
revoke all on public.disability_company_contact_template_links from anon, authenticated;
grant all on public.disability_company_contacts_pool to service_role;
grant all on public.disability_company_contact_template_links to service_role;
