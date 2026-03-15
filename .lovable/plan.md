

## Problema

A aba Carteira chama `bitrix24-fetch-portfolio` toda vez que e aberta. Esta Edge Function faz queries paginadas sobre 1000+ clientes com joins aninhados (leads → cases → contracts → financial_records), demorando ~5-8 segundos. Alem disso, o **dashboard ja faz a mesma chamada** na carga inicial (linha 423) mas descarta o array `clients` — usa apenas os `totals`.

## Solucao

Cachear a resposta do portfolio no nivel do componente pai e passa-la como prop para `CarteiraAccessView`, eliminando a segunda chamada.

### Alteracoes em `src/pages/Bitrix24App.tsx`

1. **Novo state no componente principal** (~linha 399-404):
   - Adicionar `const [cachedPortfolio, setCachedPortfolio] = useState<any>(null);`

2. **No dashboard `fetchAll`** (~linha 423-426):
   - Apos receber `portfolioRes`, guardar no state: `setCachedPortfolio(portfolioRes);`

3. **Passar prop ao CarteiraAccessView** (~linha 321):
   - `<CarteiraAccessView integration={integration} memberId={memberId} cachedPortfolio={cachedPortfolio} />`

4. **No `CarteiraAccessView`** (~linha 4328-4385):
   - Aceitar prop `cachedPortfolio`
   - No `useEffect`, se `cachedPortfolio` tiver dados validos (`success && clients`), usar diretamente sem fetch
   - Manter botao de refresh manual que forca o fetch real
   - Se `cachedPortfolio` for null (ex: usuario abriu direto na aba), fazer o fetch normal como fallback

Resultado: ao clicar em Carteira, os dados aparecem instantaneamente (ja estavam carregados no dashboard). O fetch so acontece se o cache nao existir ou se o usuario clicar em "Atualizar".

