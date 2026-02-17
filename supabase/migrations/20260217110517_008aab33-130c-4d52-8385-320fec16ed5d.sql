-- Add permissive policies for anon/authenticated to allow access without role requirements
-- This matches the original intent: permissive access for Bitrix24 iframe usage

-- LEADS
CREATE POLICY "Allow all read leads" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Allow all insert leads" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update leads" ON public.leads FOR UPDATE USING (true);
CREATE POLICY "Allow all delete leads" ON public.leads FOR DELETE USING (true);

-- CASES
CREATE POLICY "Allow all read cases" ON public.cases FOR SELECT USING (true);
CREATE POLICY "Allow all insert cases" ON public.cases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update cases" ON public.cases FOR UPDATE USING (true);
CREATE POLICY "Allow all delete cases" ON public.cases FOR DELETE USING (true);

-- PROPOSALS
CREATE POLICY "Allow all read proposals" ON public.proposals FOR SELECT USING (true);
CREATE POLICY "Allow all insert proposals" ON public.proposals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update proposals" ON public.proposals FOR UPDATE USING (true);
CREATE POLICY "Allow all delete proposals" ON public.proposals FOR DELETE USING (true);

-- CONTRACTS
CREATE POLICY "Allow all read contracts" ON public.contracts FOR SELECT USING (true);
CREATE POLICY "Allow all insert contracts" ON public.contracts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update contracts" ON public.contracts FOR UPDATE USING (true);
CREATE POLICY "Allow all delete contracts" ON public.contracts FOR DELETE USING (true);

-- FINANCIAL RECORDS
CREATE POLICY "Allow all read financial" ON public.financial_records FOR SELECT USING (true);
CREATE POLICY "Allow all insert financial" ON public.financial_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update financial" ON public.financial_records FOR UPDATE USING (true);
CREATE POLICY "Allow all delete financial" ON public.financial_records FOR DELETE USING (true);