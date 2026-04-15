CREATE POLICY "Authenticated users can read permissions"
ON public.bitrix24_user_permissions
FOR SELECT
TO authenticated
USING (true);