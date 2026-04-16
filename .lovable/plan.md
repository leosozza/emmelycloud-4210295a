
## Diagnóstico

No `payment-create-link/index.ts`, o `success_url` aponta para:
```
${SUPABASE_URL}/functions/v1/payment-receipt?token=${token}&payment=success
```

Vou verificar a função `payment-receipt` para confirmar como trata o parâmetro `payment=success` e por que está redirecionando para o dashboard de login.
