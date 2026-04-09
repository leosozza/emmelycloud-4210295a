

# Corrigir: Robots Não Actualizam + Contrato Não Aparece

## Problema

A acção `repair_fields` (botão "Reparar Campos") **apenas recria os campos UF** — não re-regista os robots. Por isso:
- O robot "Gerar Proposta" continua com o campo `template_name` sem lista de templates
- O robot "Gerar Contrato" nunca foi registado (só seria registado numa reinstalação completa)

## Solução

Adicionar re-registo dos robots dentro da acção `repair_fields`, reutilizando a mesma lógica do install.

## Alterações

### Ficheiro 1: `supabase/functions/bitrix24-install/index.ts`

Na acção `repair_fields` (depois de recriar os campos UF, antes do `return` na linha 374), adicionar:

1. Carregar templates de proposta e contrato da BD (mesmo código das linhas 1051-1078)
2. Definir o array de robots (mesma definição das linhas 1080-1303)
3. Para cada robot: `bizproc.robot.delete` + `bizproc.robot.add` (mesmo padrão das linhas 1306-1327)
4. Adicionar `robots_registered` ao objecto `report`

Isto garante que ao clicar "Reparar Campos":
- Os campos UF são recriados (como já funciona)
- Os robots são re-registados com as opções de template actualizadas
- O robot "Gerar Contrato" é criado se ainda não existir

### Ficheiro 2: `src/pages/Bitrix24App.tsx`

Actualizar o label do botão de "Reparar Campos" para "Reparar Campos e Robots" para reflectir que agora também actualiza os robots. Actualizar também a mensagem de sucesso.

## Nota sobre templates de contrato

Actualmente existem **5 templates de proposta** mas **0 templates de contrato** na base de dados. O dropdown de contratos vai mostrar "(Nenhum template de contrato encontrado)". Para que funcione, é preciso criar pelo menos um template com tipo "contrato" em Propostas > Modelos.

## Ficheiros a editar

1. **`supabase/functions/bitrix24-install/index.ts`** — adicionar re-registo de robots na acção `repair_fields`
2. **`src/pages/Bitrix24App.tsx`** — actualizar label do botão

