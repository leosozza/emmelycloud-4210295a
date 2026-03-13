INSERT INTO public.payment_gateway_config (gateway, environment, is_active, config)
VALUES ('late_fees', 'production', true, '{"penalty_pct": 10, "interest_monthly_pct": 1, "max_interest_days": 365, "grace_days": 0}')
ON CONFLICT DO NOTHING;