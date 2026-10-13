-- Coach chat image attachments: private storage + message metadata.
-- Additive only — existing text conversations remain valid.

alter table public.coach_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_kind text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coach_messages_attachment_kind_check'
  ) then
    alter table public.coach_messages
      add constraint coach_messages_attachment_kind_check
      check (
        attachment_kind is null
        or attachment_kind in ('image')
      );
  end if;
end $$;

comment on column public.coach_messages.attachment_path is
  'Private Storage object path in coach-attachments bucket (user_id/...).';
comment on column public.coach_messages.attachment_mime_type is
  'MIME type of the attached image when present.';
comment on column public.coach_messages.attachment_kind is
  'Attachment kind; currently only image. Null for text-only messages.';

-- Private bucket for Coach chat images (not public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-attachments',
  'coach-attachments',
  false,
  8388608,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Paths must be {user_id}/...
drop policy if exists "coach_attachments_select_own" on storage.objects;
create policy "coach_attachments_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'coach-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "coach_attachments_insert_own" on storage.objects;
create policy "coach_attachments_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'coach-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "coach_attachments_update_own" on storage.objects;
create policy "coach_attachments_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'coach-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'coach-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "coach_attachments_delete_own" on storage.objects;
create policy "coach_attachments_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'coach-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
