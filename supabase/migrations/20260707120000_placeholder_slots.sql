alter table public.slider_images
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists placeholder_label text;
