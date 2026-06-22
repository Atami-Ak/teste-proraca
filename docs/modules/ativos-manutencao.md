# Módulo Ativos (EAM) & Manutenção — Documentação Técnica

> Levantamento feito em 2026-06-22 a partir do código atual.

## 1. Visão geral

Gestão patrimonial completa: categorias dinâmicas (campos customizados por tipo de ativo), cadastro de ativos, manutenções especializadas por "engine" (Maquinário/Cozinha, TI, Climatização, Geral), histórico de eventos, localização e custos (EAM). O ponto-chave deste módulo é a **conexão com o sistema de O.S./Compras**: toda manutenção pode gerar automaticamente uma Ordem de Serviço e/ou Pedido de Compra vinculados.

## 2. Arquivos do módulo

| Camada | Arquivo |
|---|---|
| Tipos centrais (Asset, Category, MaintenanceRecord, ServiceOrder, PurchaseOrder) | `src/types/index.ts` |
| Tipos EAM (ciclo de vida, KPIs, health score, custos, previsão) | `src/types/eam.ts` |
| Tipos de histórico/localização | `src/types/asset-history.ts` |
| CRUD principal (categorias, ativos, manutenção, fornecedores, OS, PC, documentos) | `src/lib/db.ts` |
| EAM (ciclo de vida, custos, KPIs, health score, previsão de substituição) | `src/lib/db-eam.ts` |
| Histórico de eventos do ativo | `src/lib/db-asset-history.ts` |
| Histórico de localização (com fotos) | `src/lib/db-asset-location.ts` |
| Upload de fotos de manutenção | `src/lib/db-maintenance-images.ts` |
| Páginas | `AssetsPage`, `AssetFormPage`, `AssetDetailPage` (`src/pages/assets/`) |
| Páginas | `MaintenancePage` (`src/pages/maintenance/`) |
| Componentes | `MaintenanceForm`, `MaintenanceDetails`, `MaintenanceList` (`src/components/maintenance/`) |
| Páginas conectadas | `ServiceOrdersPage`, `PurchaseOrdersPage` (`src/pages/orders/`) |

## 3. Coleções Firestore

- **`asset_categories`** — categoria com schema dinâmico de campos (`fields: FieldSchema[]`) e config de manutenção (`maintenanceTypes`, frequência preventiva). `assetCount` é mantido via `increment()` em `createAsset`/`deleteAsset`.
- **`assets`** — ativo físico. Tem `dynamicData` (valores dos campos da categoria) + campos EAM (`lifecycleStatus`, `serialNumber`, `manufacturer`, `warrantyExpiry`).
- **`asset_maintenance`** — registro de manutenção. Campo `engineCategory` (`machinery`/`it`/`clim`/`default`) determina qual "motor" de formulário/exibição é usado, e `additionalData` guarda o payload específico do engine.
- **`asset_events`** (`asset_history.ts`) — timeline de eventos do ativo (criação, mudança de status, manutenção, ciclo de vida, custo, etc).
- **`asset_location_history`** — transferências de local com fotos.
- **`asset_costs`** — custos do ativo (aquisição, manutenção, reparo, peça, etc) — base para o Health Score e KPIs.
- **`asset_suppliers`** — fornecedores vinculados a categorias (`categoryIds: array-contains`).
- **`inventory_sessions`** — sessões de contagem de inventário físico.
- **`work_orders`** (Ordens de Serviço) e **`purchase_orders`** (Pedidos de Compra) — ver §5, são o ponto de integração.
- **`order_documents`** — documentos formais gerados a partir de OS/PC (PDF/HTML via `document-generator.ts`).

## 4. Engines de manutenção (especialização por categoria)

`resolveEngine(category)` (em `@/types`) decide qual motor usar a partir da categoria do ativo. Cada engine tem campos extras em `additionalData` e template de OS próprio:

| Engine | Tipos disponíveis | Campos extras (`additionalData`) | Template de OS gerado |
|---|---|---|---|
| `machinery` (Maquinário/Cozinha) | preventiva, corretiva | horas de uso, km, falha, downtime, causa raiz, peças substituídas | "Manutenção Industrial: {ativo}" |
| `it` (TI/Comunicação) | software, hardware | ticket, dispositivo, usuário afetado, softwares/peças | "Suporte TI: {ativo}" |
| `clim` (Climatização) | preventiva, corretiva, inspeção | refrigerante, filtro, evaporador/condensador, pressão, reabastecimento de gás | "Manutenção A/C: {ativo}" |
| `standard` (Geral) | preventiva, corretiva, inspeção (config por categoria) | nenhum | "Manutenção: {descrição}" |

`buildOSContent()` em `MaintenanceForm.tsx` monta o título/descrição/categoria da OS automaticamente a partir do engine e dos dados informados — o usuário não digita a OS do zero.

## 5. Conexão com o sistema de O.S. e Compras (núcleo da integração)

Esta é a relação central do módulo: **manutenção não é um documento isolado — ela é a origem natural de uma Ordem de Serviço e, se houver peças, de um Pedido de Compra.**

### 5.1 Fluxo

1. Usuário registra uma manutenção em `MaintenanceForm` (modal aberto a partir de `MaintenancePage` ou da aba "Manutenções" do `AssetDetailPage`, com `preselectedAssetId`).
2. Ao salvar (`createMaintenance`), se for a primeira vez (não edição), aparece o **`PostSavePanel`** — um painel pós-salvamento que:
   - Mostra um preview da OS que seria criada (`buildOSContent`).
   - Botão **"Abrir Ordem de Serviço"** → `generateOrderNumber('OS')` + `createServiceOrder({ assetId, maintenanceId: savedId, ... })` → grava `serviceOrderId` de volta na manutenção (`updateMaintenance(savedId, { serviceOrderId: id })`).
   - Se `requiresPurchase` ou houver peças substituídas, botão **"Criar Pedido de Compra"** → `generateOrderNumber('PC')` + `createPurchaseOrder({ assetId, maintenanceId: savedId, items: [peças], totalValue })` → grava `purchaseOrderId` de volta na manutenção.
3. O painel só aparece para `machinery`/`it`/`clim`, ou para `corretiva`/`requiresPurchase`/peças — manutenção preventiva simples do engine "standard" não dispara a oferta de criar OS.
4. A `MaintenanceRecord` fica com **referência cruzada** (`serviceOrderId`/`purchaseOrderId`), exibida em "Vínculos" no `MaintenanceDetails`. **Não há referência reversa automática** — `ServiceOrder`/`PurchaseOrder` guardam `maintenanceId`/`assetId`, então a navegação OS→manutenção é possível buscando por esse campo, mas a UI de `ServiceOrdersPage` não exibe esse link de volta para a manutenção de origem (oportunidade de melhoria).
5. Side-effects automáticos: `createMaintenance` com `status: 'andamento'` marca `assets.status = 'manutencao'`; `updateMaintenance` com `status: 'concluida'` volta `assets.status = 'ativo'`. Eventos (`maintenance_created`/`maintenance_completed`) são gravados em `asset_events` em ambos os pontos.

### 5.2 Pontos de entrada da Ordem de Serviço sem vir de manutenção

`ServiceOrdersPage` também permite criar OS direto (sem `maintenanceId`), com `assetId` opcional — ou seja, OS é um conceito mais amplo que manutenção (cobre também serviços gerais, prestadores externos, etc). O campo `assetId` em `ServiceOrder`/`PurchaseOrder` é o que permite, por exemplo, filtrar `getServiceOrders({ assetId })`.

### 5.3 Geração de número sequencial

`generateOrderNumber(type)` em `db.ts` gera `OS-{ano}-{snap.size+1}` / `PC-{ano}-{snap.size+1}` contando o tamanho da coleção inteira — mesmo padrão (e mesmo risco de colisão em criação simultânea) já identificado no módulo de Obras (`obras-empreiteiras.md` §6.2).

## 6. EAM — camada de inteligência sobre o ativo

`db-eam.ts` é puro/calculado (sem regra de negócio escrita em manutenção) e fornece, a partir de `Asset` + `MaintenanceRecord[]`:

- **KPIs** (`computeAssetKPIs`): falhas totais, downtime total, custo total de reparo, MTBF, MTTR, disponibilidade %, idade em anos.
- **Health Score** (`computeAssetHealthScore`): 0–100 em 4 pilares — Disponibilidade (30pts), Qualidade de manutenção/proporção preventiva (25pts), Frequência de falhas/MTBF (25pts), Idade (20pts).
- **Previsão de substituição** (`getReplacementPrediction`): heurística por pontos (idade, health score, disponibilidade, custo de reparo vs. valor do ativo) → `maintain`/`monitor`/`plan_replacement`/`replace_now`.
- **Ciclo de vida** (`updateLifecycleStatus`): 12 estágios (`planejado`→...→`baixado`), grava evento em `asset_events` a cada transição — mas **sem máquina de estados**: qualquer transição é aceita, não há validação de sequência.
- **Custos** (`addAssetCost`/`getAssetCosts`): registro manual, também gera evento de auditoria leve em `asset_events`.

Esses cálculos rodam 100% no client a cada carregamento da aba "Indicadores" do `AssetDetailPage` — não há cache (`dashboards_cache` não é usado aqui).

## 7. `AssetDetailPage` — visão 360° (5 abas)

Carrega tudo de uma vez no mount (`Promise.all`: ativo, histórico, localização, custos; + hook separado de manutenção) — sem paginação. Volume baixo hoje, mas a timeline (que mescla `asset_events` + `asset_location_history`) pode crescer sem limite ao longo dos anos.

1. **Geral** — dados cadastrais, campos dinâmicos da categoria, fornecedores da categoria (com atalhos "Nova O.S." / "Novo P.C." — só navegação para `/os` e `/compras`, não cria nada direto), ciclo de vida, últimas 3 localizações.
2. **Manutenções** — lista filtrável das manutenções do ativo; botão "Nova" abre `MaintenanceForm` (é aqui, dentro do form, que nasce a OS/PC — ver §5); "Ver tudo" navega para `/ativos/manutencao?assetId=`.
3. **Indicadores** — KPIs + Health Score + previsão de substituição, tudo vindo pronto de `db-eam.ts`; distribuição por tipo de manutenção é calculada localmente na página.
4. **Custos** — soma de custos extras (excluindo aquisição) + valor do ativo = custo total acumulado (cálculo feito na própria página, não em `db-eam.ts`); modal "Novo Custo" chama `addAssetCost`.
5. **Timeline** — mescla eventos de `asset_events` e `asset_location_history` em uma linha do tempo única.

Ações do header: Transferir (local), Nova Manutenção (modal), Editar, Dar Baixa, Excluir. Nenhuma cria OS/PC diretamente — isso só acontece dentro do `MaintenanceForm`.

## 8. RBAC (Firestore rules)

| Coleção | Leitura | Criar | Atualizar | Excluir |
|---|---|---|---|---|
| `asset_categories` | qualquer papel | supervisor | supervisor | admin |
| `assets` | qualquer papel | operador | supervisor (qualquer campo) / operador (exceto categoria/código) | admin |
| `asset_maintenance` | qualquer papel | operador | operador | admin |
| `asset_events` | qualquer papel | operador | **bloqueado para todos** (imutável) | admin |
| `asset_costs` | qualquer papel | operador | supervisor | admin |
| `asset_location_history` | qualquer papel | operador | operador | admin |
| `asset_suppliers` | qualquer papel | supervisor | supervisor | admin |
| `inventory_sessions` | qualquer papel | operador | operador | admin |
| `work_orders` | qualquer papel | operador | supervisor (qualquer campo) / operador (exceto status/prioridade) | admin |
| `purchase_orders` | qualquer papel | operador | supervisor (aprova/rejeita) / operador (outros campos) | admin |
| `order_documents` | qualquer papel | operador | supervisor | admin |

Diferente do módulo de Obras, aqui a trava de papel em campos sensíveis (`status`/`prioridade` em OS, `status`/`aprovadoPor` em PC) **já existe na regra do Firestore** — um operador não pode aprovar/mudar status sozinho. Esse é um padrão mais maduro que o de Obras e vale replicar lá.

## 9. Achados técnicos

1. **Geração de código de ativo e número de OS/PC não é atômica** (mesmo padrão do achado #2 em Obras) — `generateAssetCode`/`generateOrderNumber` leem o tamanho da coleção e somam 1, sem transação.
2. **Sem referência reversa visível OS/PC → Manutenção** na UI de `ServiceOrdersPage`/`PurchaseOrdersPage`, apesar do campo `maintenanceId` existir no documento — quem abre a OS não vê de qual manutenção ela nasceu sem consultar o Firestore diretamente.
3. **Ciclo de vida (EAM) sem máquina de estados** — `updateLifecycleStatus` aceita qualquer transição (ex.: `operacional` → `planejado` é uma transição "voltando no tempo" que a UI permite sem aviso).
4. **Indicadores recalculados no client a cada visita** — sem cache, sem Cloud Function; aceitável no volume atual, mas se o número de manutenções por ativo crescer, a aba "Indicadores" vai requerer mais processamento no browser a cada abertura.
5. **PostSavePanel só oferece criar UMA OS e UMA PC por manutenção** — se o usuário fechar o painel sem criar e quiser fazer depois, não há botão "Criar OS" na tela de detalhe/edição da manutenção já salva (só no momento do primeiro save).
6. **Padrão de RBAC em campos sensíveis (status/aprovação) já implementado em OS/PC** — oportunidade de aplicar o mesmo padrão na aprovação final de Obras (ver `obras-empreiteiras.md` achado #4).
