-- Admin auth extensions. The admin_users table is created in 000000_initial_schema.sql.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.admin_users (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_user_meta_data->>'role' = 'admin')
  EXECUTE FUNCTION public.handle_new_user();

-- Replace the earlier policy rather than adding a permissive policy beside it.
DROP POLICY IF EXISTS "Admin users are accessible by admin role only" ON public.admin_users;
DROP POLICY IF EXISTS "Admin must have MFA enrolled" ON public.admin_users;
CREATE POLICY "Admin users require verified MFA"
  ON public.admin_users
  FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    AND role = 'admin'
    AND (SELECT auth.jwt()->>'aal') = 'aal2'
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND role = 'admin'
    AND (SELECT auth.jwt()->>'aal') = 'aal2'
  );