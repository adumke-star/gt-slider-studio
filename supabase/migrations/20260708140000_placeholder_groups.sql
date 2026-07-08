-- Linked placeholder slots move together in the slider (visual only, not exported).
alter table public.slider_images
  add column if not exists placeholder_group_id uuid;
