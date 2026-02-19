
# Sincronização de Tema Bitrix24 no iframe da aplicação

## Contexto e Investigação

### O que o Bitrix24 oferece para sincronização de tema

Após análise da documentação oficial e do SDK oficial (`b24jssdk`), existem três mecanismos disponíveis:

1. **BX24 JS SDK (legacy)**: `BX24.getAuth()` não retorna informação de tema. O BX24 tem `BX24.bind()` para eventos, mas não existe um evento de tema documentado publicamente no SDK legado.

2. **b24jssdk (novo SDK oficial)**: O `B24Frame` tem um `ThemeManager` interno que acede ao tema via mensagens `postMessage` com o frame pai. Usa o campo `ThemeType` (`dark` | `light`) detectado pela comunicação com o iframe pai.

3. **Mecanismo nativo do iframe**: O Bitrix24 injeta variáveis CSS no documento pai e comunica com o iframe via `postMessage`. A forma mais fiável e testada em produção é **detectar a preferência de cor do sistema** (já que o Bitrix24 sincroniza o seu tema com o sistema operativo do utilizador) **combinada com escuta de mensagens postMessage** do parent frame.

### Como funciona o tema no Bitrix24

O Bitrix24 tem dois conceitos:
- **Tema de fundo/header**: é uma imagem/cor personalizada (azul, roxo, gradiente, etc.) — este é o tema visual de "branding"
- **Modo claro/escuro**: determina se o texto e os ícones são claros ou escuros — este é o que realmente importa para o design da aplicação iframe

O `BX24Frame` do novo SDK detecta o modo claro/escuro lendo `prefers-color-scheme` do browser do utilizador **e** escutando mensagens do parent. O Bitrix24 usa `prefers-color-scheme` do sistema do utilizador como base do seu modo escuro.

### Abordagem escolhida: sem dependência extra

Como o projeto usa React + Tailwind (não Vue/Nuxt), **não** é prático instalar o `@bitrix24/b24ui` (que é exclusivamente Vue/Nuxt). Em vez disso, implementamos:

1. **Hook `useBitrix24Theme`**: detecta e sincroniza o tema em tempo real
2. **Fonte de verdade**: `prefers-color-scheme` como base + `postMessage` do BX24 parent como override
3. **Aplicação via classe `dark`** no elemento raiz do `Bitrix24App`, compatível com o sistema de CSS variables já existente

## Solução Técnica

### Como aplicar o tema

O Tailwind já tem o `.dark { ... }` definido no `src/index.css` com todas as CSS variables. Basta aplicar a classe `dark` ao wrapper root do `Bitrix24App`, **sem afectar o resto da aplicação principal** (que tem o seu próprio `ThemeProvider`).

### Detecção de tema — três camadas em sequência

```
Camada 1: BX24.appOption (tema guardado nas opções da app no Bitrix24)
    ↓ (fallback)
Camada 2: postMessage do parent Bitrix24 (quando o utilizador muda o tema em tempo real)
    ↓ (fallback)
Camada 3: prefers-color-scheme do sistema operativo
```

### Estrutura do postMessage do Bitrix24

O Bitrix24 envia mensagens `postMessage` ao iframe em formato:
```json
{ "action": "ChangeColorScheme", "scheme": "dark" }
```
ou via o SDK legado com `BX24.bind('changeColorScheme', callback)`.

## Ficheiros a Alterar

### 1. Novo ficheiro: `src/hooks/useBitrix24Theme.ts`

Hook React que:
- Lê `prefers-color-scheme` do browser via `window.matchMedia`
- Escuta `window.addEventListener('message', ...)` para mensagens do parent Bitrix24 com informação de tema
- Tenta ler `BX24.getAppOption('colorScheme')` se o BX24 SDK estiver disponível
- Usa `BX24.bind('themeChange', ...)` para mudanças em tempo real (quando disponível)
- Retorna `{ isDark: boolean, scheme: 'dark' | 'light' }`

```typescript
// Pseudo-código do hook
export function useBitrix24Theme() {
  const [isDark, setIsDark] = useState(() => {
    // Preferência inicial do sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Camada 1: prefers-color-scheme
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMQ = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handleMQ);

    // Camada 2: postMessage do parent Bitrix24
    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return;
      const { action, scheme, colorScheme } = e.data;
      if (action === 'ChangeColorScheme' || action === 'themeChange') {
        setIsDark(scheme === 'dark' || colorScheme === 'dark');
      }
    };
    window.addEventListener('message', handleMessage);

    // Camada 3: BX24 SDK bind (quando disponível)
    const BX24 = (window as any).BX24;
    if (BX24?.bind) {
      try {
        BX24.bind('themeChange', (data: any) => {
          setIsDark(data?.scheme === 'dark');
        });
      } catch {}
    }

    return () => {
      mq.removeEventListener('change', handleMQ);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return { isDark, scheme: isDark ? 'dark' : 'light' };
}
```

### 2. `src/pages/Bitrix24App.tsx` — usar o hook e aplicar a classe

No componente `Bitrix24App`, usar o hook e aplicar `dark` ou `light` ao wrapper raiz:

```tsx
const { isDark } = useBitrix24Theme();

return (
  <div className={cn("min-h-screen bg-background flex", isDark && "dark")}>
    {/* ... resto do conteúdo ... */}
  </div>
);
```

Também aplicar ao loading state:
```tsx
if (view === "loading") {
  return (
    <div className={cn("min-h-screen bg-background flex items-center justify-center", isDark && "dark")}>
      ...
    </div>
  );
}
```

### Por que esta abordagem funciona

- O Tailwind aplica as CSS variables do `.dark { ... }` para todos os elementos dentro do wrapper
- **Sem afectar** o resto da app (o wrapper `.dark` está isolado ao `Bitrix24App`)
- Reage **em tempo real** às mudanças de tema (sem reload)
- Funciona mesmo sem o Bitrix24 (fallback para `prefers-color-scheme`)
- Zero dependências extras — apenas React hooks nativos

### Resultado visual esperado

| Bitrix24 theme | App iframe |
|---|---|
| Claro (padrão) | `bg-background` branco, `text-foreground` escuro |
| Escuro | `dark` class aplicada → fundos escuros, textos claros |
| Utilizador muda o tema | Reage em tempo real via `postMessage` |
| Fora do Bitrix24 (dev) | Segue o tema do sistema operativo |

## Ficheiros a Criar/Editar

| Ficheiro | Acção |
|---|---|
| `src/hooks/useBitrix24Theme.ts` | CRIAR — hook de sincronização de tema |
| `src/pages/Bitrix24App.tsx` | EDITAR — usar o hook, aplicar classe `dark` ao wrapper |

## O que NÃO muda

- `src/index.css` — as CSS variables do `.dark` já existem e estão correctas
- `tailwind.config.ts` — já tem `darkMode: ["class"]` configurado
- Edge functions, base de dados, resto da aplicação — sem alterações
