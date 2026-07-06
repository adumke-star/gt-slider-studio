-- Guide category per section: matches a section to a row of the in-app
-- slider content guide. Free text (no CHECK), like slider_images.image_type.
alter table public.slider_sections
  add column if not exists guide_category text;

-- One-time backfill via keyword matching on the section name
-- (mirrors guessCategory() in src/lib/sliderGuide.ts).
update public.slider_sections
set guide_category = case
  when kind = 'plp' then 'Main Page'
  when name ilike '%vip%' then 'VIP'
  when name ilike '%travel%' then 'Travel'
  when name ilike '%resell%' then 'Camping Resell'
  when name ilike '%glamping%' or name ilike '%camping%' then 'Glamping & Camping'
  when name ilike '%parking%' then 'Parking'
  when name ilike '%premier%' or (name ilike '%motogp%' and name ilike '%experience%') then 'MotoGP Premier'
  when name ilike '%experience%' then 'F1 Experiences'
  when name ilike '%ticket%' then 'Tickets'
  else null
end
where guide_category is null;
