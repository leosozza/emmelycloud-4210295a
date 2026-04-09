-- Migration: add auto_payment_config to proposals
-- Purpose: Store automatic payment configuration set by Bitrix24 robot
--          emmely_generate_contract when send_payment_after_sign = "Y"
-- The sign-contract Edge Function reads this field after signature to
-- automatically create a charge and send the payment link via WhatsApp.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS auto_payment_config JSONB DEFAULT NULL;

COMMENT ON COLUMN proposals.auto_payment_config IS
  'JSON config for automatic payment creation after contract signing. '
  'Set by robot emmely_generate_contract when send_payment_after_sign=Y. '
  'Shape: { enabled: boolean, payment_method: string, installments: number, deal_id: string }';
