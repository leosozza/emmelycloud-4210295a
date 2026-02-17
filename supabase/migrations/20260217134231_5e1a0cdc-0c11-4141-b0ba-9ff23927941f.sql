
-- 1. Create function to auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.assign_admin_if_first_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Trigger to assign admin on profile creation
CREATE TRIGGER on_profile_created_assign_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_admin_if_first_user();

-- 3. Remove permissive policies from leads
DROP POLICY IF EXISTS "Allow all read leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all insert leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all update leads" ON public.leads;
DROP POLICY IF EXISTS "Allow all delete leads" ON public.leads;

-- 4. Remove permissive policies from cases
DROP POLICY IF EXISTS "Allow all read cases" ON public.cases;
DROP POLICY IF EXISTS "Allow all insert cases" ON public.cases;
DROP POLICY IF EXISTS "Allow all update cases" ON public.cases;
DROP POLICY IF EXISTS "Allow all delete cases" ON public.cases;

-- 5. Remove permissive policies from proposals
DROP POLICY IF EXISTS "Allow all read proposals" ON public.proposals;
DROP POLICY IF EXISTS "Allow all insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Allow all update proposals" ON public.proposals;
DROP POLICY IF EXISTS "Allow all delete proposals" ON public.proposals;

-- 6. Remove permissive policies from contracts
DROP POLICY IF EXISTS "Allow all read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Allow all insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Allow all update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Allow all delete contracts" ON public.contracts;

-- 7. Remove permissive policies from financial_records
DROP POLICY IF EXISTS "Allow all read financial" ON public.financial_records;
DROP POLICY IF EXISTS "Allow all insert financial" ON public.financial_records;
DROP POLICY IF EXISTS "Allow all update financial" ON public.financial_records;
DROP POLICY IF EXISTS "Allow all delete financial" ON public.financial_records;

-- 8. Conversations: replace permissive with authenticated
DROP POLICY IF EXISTS "Allow all access to conversations" ON public.conversations;
CREATE POLICY "Authenticated can read conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (true);

-- 9. Messages: replace permissive with authenticated
DROP POLICY IF EXISTS "Allow all access to messages" ON public.messages;
CREATE POLICY "Authenticated can read messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

-- 10. client_contacts
DROP POLICY IF EXISTS "Allow all access to client_contacts" ON public.client_contacts;
CREATE POLICY "Authenticated can access client_contacts" ON public.client_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. clients
DROP POLICY IF EXISTS "Allow all access to clients" ON public.clients;
CREATE POLICY "Authenticated can access clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. quick_replies
DROP POLICY IF EXISTS "Allow all access to quick_replies" ON public.quick_replies;
CREATE POLICY "Authenticated can access quick_replies" ON public.quick_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. sef_locations
DROP POLICY IF EXISTS "Allow all access to sef_locations" ON public.sef_locations;
CREATE POLICY "Authenticated can access sef_locations" ON public.sef_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. services
DROP POLICY IF EXISTS "Allow all access to services" ON public.services;
CREATE POLICY "Authenticated can access services" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
