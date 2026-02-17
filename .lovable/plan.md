

# Atualizar Roadmap: Integração Bitrix24 Detalhada

## Resumo

Substituir a entrada genérica "Integração Bitrix24" no Roadmap por um bloco completo e detalhado que reflita todos os componentes da integração bidirecional, baseado nos guias fornecidos. A Emmely Cloud mantém banco de dados independente -- o Bitrix24 funciona como camada opcional de CRM/automação.

## Alterações

### Ficheiro editado: `src/pages/Roadmap.tsx`

Remover os itens individuais que agora fazem parte da integração Bitrix24 ("Integração Bitrix24", "WhatsApp Cloud API", "Instagram DM") e substituí-los por uma nova fase/secção dedicada com os seguintes módulos:

**Nova secção: "Integração Bitrix24" (dentro de "Futuro")**

| Módulo | Descrição | Status |
|--------|-----------|--------|
| App Vendors Bitrix24 | Aplicativo publicado no marketplace Bitrix24 | Por iniciar |
| OAuth & Token Refresh | Instalação OAuth, refresh automático de tokens | Por iniciar |
| Conector WhatsApp Oficial | WhatsApp Cloud API via Open Lines do Bitrix24 | Por iniciar |
| Conector Instagram DM | Mensagens diretas Instagram via Open Lines | Por iniciar |
| Mapeamento de Canais | Binding canais WhatsApp/IG para Open Lines | Por iniciar |
| Fluxo Bidirecional Mensagens | Envio/receção de mensagens Emmely <-> Bitrix24 | Por iniciar |
| Prevenção Loops/Duplicações | Sistema anti-loop e deduplicação de mensagens | Por iniciar |
| Auto-Reparo Conector | Reconexão automática e health checks | Por iniciar |
| Robots BizProc | Robots de automação para workflows Bitrix24 | Por iniciar |
| Sync CRM Bidirecional | Leads, Deals, Contactos sincronizados | Por iniciar |
| Conector Stripe/Pagamentos | Pagamentos Stripe integrados com Faturas Bitrix24 | Por iniciar |
| Multi-Binding CRM | Suporte a múltiplos portais Bitrix24 | Por iniciar |

Os itens "WhatsApp Cloud API" e "Instagram DM" que existiam separados na secção "Futuro" serão removidos, pois ficam englobados na integração Bitrix24.

## Detalhes Técnicos

- Apenas o ficheiro `src/pages/Roadmap.tsx` sera editado
- Os novos módulos são adicionados à secção "Futuro" existente, substituindo os 3 itens anteriores (Integração Bitrix24, WhatsApp Cloud API, Instagram DM) por 12 módulos detalhados
- Todos os novos módulos começam com status "por_iniciar" e progress 0%
- A nota de independência do banco de dados fica implícita na arquitectura -- sem alterações de schema necessárias nesta fase

