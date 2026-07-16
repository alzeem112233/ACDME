-- Allow dashboard cleanup actions and normalize readable Arabic values.

drop policy if exists "registration_requests_public_delete" on public.registration_requests;
drop policy if exists "platform_accounts_public_delete" on public.platform_accounts;
drop policy if exists "academy_cloud_data_public_delete" on public.academy_cloud_data;

create policy "registration_requests_public_delete"
  on public.registration_requests
  for delete
  using (true);

create policy "platform_accounts_public_delete"
  on public.platform_accounts
  for delete
  using (true);

create policy "academy_cloud_data_public_delete"
  on public.academy_cloud_data
  for delete
  using (true);

update public.registration_requests
set status = case status
  when U&'\0642\064A\062F \0627\0644\0645\0631\0627\062C\0639\0629' then 'pending'
  when U&'\0645\0642\0628\0648\0644' then 'approved'
  when U&'\0645\0631\0641\0648\0636' then 'rejected'
  else status
end
where status in (
  U&'\0642\064A\062F \0627\0644\0645\0631\0627\062C\0639\0629',
  U&'\0645\0642\0628\0648\0644',
  U&'\0645\0631\0641\0648\0636'
);

update public.platform_accounts
set status = U&'\0646\0634\0637'
where status = 'active';

update public.platform_accounts
set password_status = U&'\0645\0634\0641\0631\0629'
where password_status is null or password_status = 'encrypted';

update public.platform_accounts
set password_status = U&'\062A\0645 \0625\0639\0627\062F\0629 \0627\0644\062A\0639\064A\064A\0646'
where password_status = 'reset';

alter table public.platform_accounts
  alter column status set default U&'\0646\0634\0637';
