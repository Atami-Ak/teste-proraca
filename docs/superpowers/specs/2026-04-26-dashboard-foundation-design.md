# Dashboard Executivo — Sub-projeto A: Fundação + Visão Executiva
**Date:** 2026-04-26
**Scope:** Sub-projeto A de 4 (ver decomposição completa abaixo)

---

## Contexto e Decomposição

O Dashboard Executivo da Pro Raça Rações é dividido em 4 sub-projetos sequenciais:

- **Sub-projeto A (este):** Fundação + Visão Executiva
- **Sub-projeto B:** Analytics Profundo — Maquinário + Frota
- **Sub-projeto C:** Analytics Operacional — Limpeza, Segurança, Colaboradores, Obras, Compras
- **Sub-projeto D:** Centros de Ação — Aprovações, Documentos, Controle de Acesso

Ordem de build: A → B → C → D. Cada sub-projeto produz software funcional e testável.

---

## Objetivo

Substituir o iframe legado em `/dashboard/dashboard.html` por uma aplicação React completa com:
- Shell de dashboard com tabs horizontais e seletor de período
- Camada de dados híbrida (listeners tempo real + cache Firebase para analytics)
- Módulo **Visão Executiva** com 12 KPI cards, 2 gráficos e feed de alertas

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Navegação | Sub-rotas React Router `/dashboard/*` | URL bookmarkável, lazy loading real por módulo |
| Dados em tempo real | Firestore `onSnapshot` | Aprovações e alertas críticos sempre atuais |
| Analytics pesados | Cache Firebase com TTL | Evita queries caras a cada render |
| Período padrão | 30 dias, seletor D/30d/90d/6m/1a | Padrão operacional, configurável |
| KPI trends | Variação % vs período anterior | Contexto executivo de evolução |
| Charts | Recharts | Padrão React/TS, tree-shakeable, todos os tipos necessários |

---

## Roteamento

### App.tsx — mudanças

Substituir a rota `/dashboard` atual (que renderiza `LegacyPage` iframe) por:

```tsx
// Admin-only dashboard com sub-rotas
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="dashboard" element={<DashboardLayout />}>
    <Route index element={<Navigate to="overview" replace />} />
    <Route path="overview"       element={<Lazy page={<OverviewPage />} />} />
    <Route path="maquinario"     element={<Lazy page={<PlaceholderPage label="Maquinário Analytics" />} />} />
    <Route path="frota"          element={<Lazy page={<PlaceholderPage label="Frota Analytics" />} />} />
    <Route path="limpeza"        element={<Lazy page={<PlaceholderPage label="Limpeza 5S Analytics" />} />} />
    <Route path="seguranca"      element={<Lazy page={<PlaceholderPage label="Segurança Analytics" />} />} />
    <Route path="colaboradores"  element={<Lazy page={<PlaceholderPage label="Colaboradores Analytics" />} />} />
    <Route path="obras"          element={<Lazy page={<PlaceholderPage label="Obras & Empreiteiras Analytics" />} />} />
    <Route path="compras"        element={<Lazy page={<PlaceholderPage label="Compras & Fornecedores Analytics" />} />} />
    <Route path="aprovacoes"     element={<Lazy page={<PlaceholderPage label="Centro de Aprovações" />} />} />
    <Route path="documentos"     element={<Lazy page={<PlaceholderPage label="Centro de Documentos" />} />} />
    <Route path="acesso"         element={<Lazy page={<PlaceholderPage label="Controle de Acesso" />} />} />
  </Route>
</Route>
```

`DashboardLayout` é um layout route (sem `path`) que renderiza o shell e `<Outlet />`.

---

## Estrutura de Arquivos

### Criados neste sub-projeto

```
src/pages/dashboard/
  DashboardLayout.tsx
  DashboardLayout.module.css
  PlaceholderPage.tsx               ← módulo placeholder para sub-projetos B/C/D
  overview/
    OverviewPage.tsx
    OverviewPage.module.css
    components/
      KpiCard.tsx
      KpiCard.module.css
      AlertFeed.tsx
      AlertFeed.module.css
      ModuleHealthBar.tsx
      ModuleHealthBar.module.css
      OverviewCharts.tsx            ← 2 gráficos (AreaChart + LineChart)
      OverviewCharts.module.css

src/lib/
  db-dashboard.ts                   ← funções cache + listeners

src/hooks/
  useDashboardOverview.ts           ← hook principal da Visão Executiva
  usePeriodFilter.ts                ← hook do seletor de período

src/types/
  dashboard.ts                      ← tipos do dashboard

src/context/
  PeriodContext.tsx                 ← Context + Provider do período selecionado
```

### Modificados neste sub-projeto

```
src/App.tsx                         ← substituir rota /dashboard
package.json                        ← adicionar recharts
```

---

## Camada de Dados

### Estratégia híbrida

```
┌─────────────────────────────────────────────────────┐
│  Dados TEMPO REAL (onSnapshot)                      │
│  • work_orders com status='open' ou 'in_progress'   │
│  • purchase_orders com status='pending'             │
│  • asset_maintenance com status='pendente' e late   │
│  • Qualquer alerta crítico das coleções existentes  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Dados CACHE (TTL 15min)                            │
│  • KPIs agregados → dashboard_kpi_cache/current     │
│  • Analytics por módulo → dashboard_*_analytics/    │
│    (populados nos Sub-projetos B/C/D)               │
└─────────────────────────────────────────────────────┘
```

### Coleções Firebase criadas neste sub-projeto

**`dashboard_kpi_cache`** — documento único `current`:

```ts
interface KpiCacheDoc {
  generatedAt:          Timestamp
  period:               '30d' | '90d' | '6m' | '1a'
  ordensAbertas:        { value: number; prev: number }
  aprovacoesPendentes:  { value: number; prev: number }
  manutencaoAtrasada:   { value: number; prev: number }
  comprasUrgentes:      { value: number; prev: number }
  alertasMaquinario:    { value: number; prev: number }
  alertasFrota:         { value: number; prev: number }
  falhasLimpeza:        { value: number; prev: number }
  incidentesSeguranca:  { value: number; prev: number }
  alertasColaboradores: { value: number; prev: number }
  empreiteirasCriticas: { value: number; prev: number }
  problemsFornecedores: { value: number; prev: number }
  itensAuditoriaPend:   { value: number; prev: number }
}
```

### Lógica de refresh do cache

```ts
// useDashboardOverview.ts — pseudocódigo
async function loadKpis(period: Period) {
  const cached = await getDoc('dashboard_kpi_cache/current')
  const age = now() - cached.generatedAt.toMillis()
  
  if (cached.exists && age < 15 * 60 * 1000 && cached.period === period) {
    return cached.data  // usa cache
  }
  
  // Computa KPIs consultando coleções reais
  const fresh = await computeKpis(period)
  await setDoc('dashboard_kpi_cache/current', { ...fresh, generatedAt: serverTimestamp(), period })
  return fresh
}
```

### Tipos TypeScript

```ts
// src/types/dashboard.ts

export type Period = '30d' | '90d' | '6m' | '1a'

export interface KpiMetric {
  value:   number
  prev:    number
  trend:   number      // percentual: ((value - prev) / prev) * 100
  label:   string
  icon:    string      // SVG path ou emoji
  unit?:   string      // 'R$', '%', etc.
  module:  DashboardModule
  severity: 'neutral' | 'good' | 'warning' | 'critical'
}

export type DashboardModule =
  | 'overview' | 'maquinario' | 'frota' | 'limpeza'
  | 'seguranca' | 'colaboradores' | 'obras' | 'compras'
  | 'aprovacoes' | 'documentos' | 'acesso'

export interface AlertItem {
  id:        string
  severity:  'critical' | 'urgent' | 'attention'
  title:     string
  module:    DashboardModule
  createdAt: Date
  linkTo:    string   // rota de destino
}

export interface ModuleHealth {
  module:    DashboardModule
  label:     string
  status:    'ok' | 'warning' | 'critical'
  metric:    string  // ex: "3 OS abertas", "Score 5S: 72%"
  icon:      string
}

export interface OverviewChartPoint {
  date:      string  // 'DD/MM'
  value:     number
  value2?:   number  // para charts com 2 séries
}
```

---

## Componentes

### `DashboardLayout.tsx`

```
Props: none
State: period (via PeriodContext)
Renders:
  - Header com título, seletor período, botão atualizar
  - Tab bar com 11 tabs + badge de aprovações pendentes (onSnapshot)
  - <Outlet />

Tab structure:
  { path: 'overview',      label: 'Visão Geral',      icon: HomeIcon,   priority: true  }
  { path: 'maquinario',    label: 'Maquinário',        icon: WrenchIcon, star: true      }
  { path: 'frota',         label: 'Frota',             icon: TruckIcon                  }
  { path: 'limpeza',       label: 'Limpeza 5S',        icon: SparklesIcon               }
  { path: 'seguranca',     label: 'Segurança',         icon: ShieldIcon                 }
  { path: 'colaboradores', label: 'Colaboradores',     icon: UsersIcon                  }
  { path: 'obras',         label: 'Obras',             icon: HammerIcon                 }
  { path: 'compras',       label: 'Compras',           icon: CartIcon                   }
  { path: 'aprovacoes',    label: 'Aprovações',        icon: CheckIcon,  badge: pending }
  { path: 'documentos',    label: 'Documentos',        icon: FileIcon                   }
  { path: 'acesso',        label: 'Acesso',            icon: CogIcon                    }
```

### `KpiCard.tsx`

```
Props:
  metric: KpiMetric

Renders:
  - Ícone do módulo
  - Label
  - Valor principal (número grande)
  - Trend badge: "▲ +15%" verde se bom, vermelho se mau
  - Detalhe contextual (linha pequena)
  - Clique → navega para o módulo

Trend color logic:
  - severity=good  + trend>0  → verde
  - severity=good  + trend<0  → vermelho
  - severity=critical + trend>0 → vermelho (é ruim subir)
  - severity=critical + trend<0 → verde (é bom cair)
  - severity=neutral            → cinza
```

### `AlertFeed.tsx`

```
Props:
  alerts: AlertItem[]   (recebidos via onSnapshot do hook)

Renders:
  - Header "Alertas Ativos" com contador
  - Lista de AlertItem ordenada por severity (critical→urgent→attention)
  - Cada item: ícone colorido, título, módulo-origem, tempo relativo, link
  - Scroll interno com max-height

Severity colors:
  critical  → vermelho (#dc2626)
  urgent    → laranja (#ea580c)
  attention → amarelo (#d97706)
```

### `ModuleHealthBar.tsx`

```
Props:
  modules: ModuleHealth[]

Renders:
  - Grid horizontal de 8 cards (4+4 em mobile)
  - Cada card: ícone, nome, dot colorido (status), métrica principal
  - Clique → navega para o módulo

Status dot:
  ok       → verde (#16a34a)
  warning  → laranja (#ea580c)
  critical → vermelho (#dc2626)
```

### `OverviewCharts.tsx`

Dois gráficos Recharts side-by-side (50%/50% em desktop, stack em mobile):

**Gráfico 1 — OS Abertas vs Concluídas (AreaChart)**
- Fonte: `work_orders` agrupados por data dentro do período
- Séries: `abertas` (laranja, área semitransparente), `concluídas` (verde, área)
- X: datas no período, Y: contagem

**Gráfico 2 — Custo Operacional Total (LineChart)**
- Fonte: `asset_maintenance` somando `cost` por data no período
- Série única: custo total (R$) por dia/semana
- X: datas, Y: valor em R$ formatado

Ambos usam as cores da identidade visual: `--brand-accent (#ea580c)`, `--brand-green (#16a34a)`.

---

## Critical Alerts Banner

Barra vermelha colapsável no topo da Visão Executiva quando há alertas críticos:

```
🔴  3 máquinas em estado crítico  ·  2 OS atrasadas +5 dias  ·  1 incidente de segurança não resolvido
                                                                              [Ver detalhes →]
```

- Renderizado apenas se `alerts.filter(a => a.severity === 'critical').length > 0`
- Auto-oculta quando não há críticos
- Clique em "Ver detalhes" foca o AlertFeed

---

## `useDashboardOverview.ts` — Interface do Hook

```ts
interface DashboardOverviewData {
  kpis:        KpiMetric[]          // 12 KPIs
  alerts:      AlertItem[]          // live
  moduleHealth: ModuleHealth[]      // 8 módulos
  chartData: {
    osTimeline:   OverviewChartPoint[]
    costTimeline: OverviewChartPoint[]
  }
  loading:     boolean
  error:       string | null
  lastUpdated: Date | null
  refresh:     () => Promise<void>  // força recompute ignorando TTL
}

function useDashboardOverview(period: Period): DashboardOverviewData
```

---

## `PeriodContext.tsx`

```ts
interface PeriodContextValue {
  period:   Period
  setPeriod:(p: Period) => void
  dateRange:{ from: Date; to: Date }   // calculado: from = now() - period, to = now()
  prevRange:{ from: Date; to: Date }   // período anterior equivalente (para trend)
}
```

Persistido em `localStorage` com chave `'dashboard-period'`.

---

## Visual Design

### Layout desktop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER (h: 64px)                                                             │
│ [📊 Dashboard Executivo · Pro Raça Rações]     [30d ▼]  [↻ Atualizar]      │
├─────────────────────────────────────────────────────────────────────────────┤
│ TABS (h: 48px, overflow-x: auto)                                             │
│ [Visão Geral] [Maquinário★] [Frota] [Limpeza] [Segurança] [Colaboradores] │
│ [Obras] [Compras] [Aprovações 🔴3] [Documentos] [Acesso]                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ CONTENT (flex 1, overflow-y: auto)                                           │
│ <Outlet />                                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Visão Executiva layout

```
┌────────────────────────────────────────────────────────────────┐
│ CRITICAL ALERTS BANNER (condicional)                           │
├──────────┬─────────────────────────────────────────────────────┤
│ ALERT    │ KPI GRID — 4 cols × 3 rows = 12 cards              │
│ FEED     │                                                     │
│ (280px)  │ [OS Abertas] [Aprv.Pend.] [Mant.Atr.] [Compras Urg]│
│          │ [Alertas Maq] [Alertas Fr] [Falhas 5S] [Incid.Seg] │
│          │ [Alertas Col] [Empr.Crít.] [Prob.Forn] [Audit.Pend]│
│          ├─────────────────────────────────────────────────────┤
│          │ CHARTS — 2 × 50%                                   │
│          │ [OS Timeline (Area)]  [Custo Operacional (Line)]   │
├──────────┴─────────────────────────────────────────────────────┤
│ MODULE HEALTH BAR — 8 módulos em grid horizontal              │
└────────────────────────────────────────────────────────────────┘
```

### Tokens de cor do dashboard

Reutiliza os tokens globais do projeto:
```css
--brand-main:   #166534  /* verde escuro — positivo */
--brand-green:  #16a34a  /* verde médio — OK */
--brand-accent: #ea580c  /* laranja — atenção/destaque */
--danger:       #dc2626  /* vermelho — crítico */
--warning:      #f59e0b  /* amarelo — atenção */
--bg:           #F5F7FA  /* fundo geral */
--bg-card:      #FFFFFF  /* cards */
```

---

## Regras Críticas de UX

1. **Nenhum botão de criação** — o dashboard só lê, monitora e navega
2. **Nenhum formulário** — zero inputs exceto filtro de período e campo de busca de alertas
3. **Clique sempre navega** — KPI cards, module health cards, alert items sempre levam ao módulo correspondente
4. **Estado de loading visível** — skeleton loaders nos KPI cards enquanto cache carrega
5. **Erro gracioso** — se Firebase query falhar, mostra valor "—" com tooltip de erro, não quebra o layout

---

## Firestore Rules — Adições Necessárias

```js
// dashboard_kpi_cache — somente admin lê/escreve
match /dashboard_kpi_cache/{docId} {
  allow read:  if isAuthenticated() && isAdmin();
  allow write: if isAuthenticated() && isAdmin();
}
```

---

## Dependências a Instalar

```bash
yarn add recharts
yarn add @types/recharts  # se necessário, recharts >= 2.x tem tipos próprios
```

Recharts >= 2.0 tem TypeScript types built-in. Não requer `@types/recharts`.

---

## Constraints

- O `dashboard.html` legacy **não é deletado** neste sub-projeto — apenas a rota React substitui o iframe. O arquivo pode ser removido após validação.
- `DashboardLayout` renderiza dentro do `<Outlet>` do `AppLayout` existente (o GlobalSidebar já está presente). O `DashboardLayout` **não** re-renderiza sidebar — apenas adiciona seu próprio header de dashboard e tabs acima do `<Outlet>` interno.
- `PlaceholderPage` é um componente simples com título, ícone e mensagem "Módulo em construção — disponível em breve". Remove a necessidade de rotas quebradas.
- Charts só são renderizados quando a aba está ativa (lazy). Recharts não renderiza componentes fora do viewport.
- O período selecionado persiste em `localStorage` e é restaurado ao reabrir o dashboard.
