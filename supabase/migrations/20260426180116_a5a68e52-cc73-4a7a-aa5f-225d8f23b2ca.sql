UPDATE public.conversations
SET contact_phone = '5511978659280'
WHERE id IN (
  'df886b15-d9e4-404a-9389-44345f5bf011',
  '89c299f8-e903-4d42-b498-759bdce639ed'
)
AND contact_phone IS NULL
AND contact_lid IN ('196847578665004', '196847578665004@lid');