-- 1. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 3. Allowlist (admin-managed)
CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read allowed_emails" ON public.allowed_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage allowed_emails" ON public.allowed_emails FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed first admin
INSERT INTO public.allowed_emails (email, role) VALUES ('a.dumke@global-tickets.com', 'admin');

-- 4. Signup gate trigger: only allowlisted emails get a profile + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(NEW.email);
  v_allowed public.allowed_emails%ROWTYPE;
BEGIN
  SELECT * INTO v_allowed FROM public.allowed_emails WHERE lower(email) = v_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese E-Mail-Adresse ist nicht freigeschaltet. Bitte beim Admin melden.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_allowed.role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Comments + Mentions
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.slider_images(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_image_id_idx ON public.comments(image_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read comments" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert own comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "author update own comment" ON public.comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "author or admin delete comment" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notified_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, mentioned_user_id)
);
CREATE INDEX comment_mentions_user_idx ON public.comment_mentions(mentioned_user_id, read_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_mentions TO authenticated;
GRANT ALL ON public.comment_mentions TO service_role;
ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read mentions" ON public.comment_mentions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert mentions" ON public.comment_mentions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.author_id = auth.uid()));
CREATE POLICY "mentioned user updates own read state" ON public.comment_mentions FOR UPDATE TO authenticated
  USING (auth.uid() = mentioned_user_id) WITH CHECK (auth.uid() = mentioned_user_id);

-- 6. Tighten existing tables: only authenticated users
DROP POLICY IF EXISTS "Public read races" ON public.races;
DROP POLICY IF EXISTS "Public write races" ON public.races;
DROP POLICY IF EXISTS "Public update races" ON public.races;
DROP POLICY IF EXISTS "Public delete races" ON public.races;
CREATE POLICY "auth all races" ON public.races FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read images" ON public.slider_images;
DROP POLICY IF EXISTS "Public write images" ON public.slider_images;
DROP POLICY IF EXISTS "Public update images" ON public.slider_images;
DROP POLICY IF EXISTS "Public delete images" ON public.slider_images;
CREATE POLICY "auth all images" ON public.slider_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read sections" ON public.slider_sections;
DROP POLICY IF EXISTS "Public write sections" ON public.slider_sections;
DROP POLICY IF EXISTS "Public update sections" ON public.slider_sections;
DROP POLICY IF EXISTS "Public delete sections" ON public.slider_sections;
CREATE POLICY "auth all sections" ON public.slider_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);