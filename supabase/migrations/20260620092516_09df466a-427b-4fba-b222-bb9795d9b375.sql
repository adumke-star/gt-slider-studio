ALTER TABLE public.slider_images REPLICA IDENTITY FULL;
ALTER TABLE public.slider_sections REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.slider_images;
ALTER PUBLICATION supabase_realtime ADD TABLE public.slider_sections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;