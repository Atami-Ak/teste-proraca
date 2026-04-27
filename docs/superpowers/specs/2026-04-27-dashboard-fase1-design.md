# Dashboard Principal — Fase 1: KPIs + Alertas

**Data:** 2026-04-27  
**Escopo:** Substituição completa do legacy `dashboard/dashboard.html` por uma `DashboardPage` React na rota `/dashboard`.

---

## Contexto

A fundação já existe:
- `src/types/dashboard.ts` — tipos Period, KpiMetric, AlertItem, KpiCacheDoc, OverviewChartPoint
- `src/lib/db-dashboard.ts` — readKpiCache, computeAndWriteKpiCache, subscribeToAlerts
- `src/context/PeriodContext.tsx` — seletor de período com localStorage
- recharts instalado (para Fase 2)

---

## Arquitetura

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/pages/dashboard/DashboardPage.tsx` | Criar |
| `src/pages/dashboard/DashboardPage.module.css` | Criar |
| `src/App.tsx` | Modificar — trocar LegacyPage por DashboardPage na rota `/dashboard` |

### Componentes locais (funções dentro de DashboardPage.tsx)

- **`KpiCard`** — exibe valor, label, trend (▲/▼), severity color, link ao módulo
- **`AlertPanel`** — lista de alertas live com severidade colorida, link por alerta
- **`PeriodBar`** — botões 30d/90d/6m/1a + botão ↺ Atualizar

### Contexto

`PeriodProvider` envolve o conteúdo da `DashboardPage` internamente (não no App.tsx).

---

## Layout

```
┌────────────────────────────────────────────────────┐
│  "Painel de Gestão"   [30d][90d][6m][1a]   [↺]   │
├────────────────────────────────────────────────────┤
│  GRID KPIs — 4 cols desktop / 2 tablet / 1 mobile  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐  │
│  │OS Abertas│ │Aprovações│ │Manut.Atr.│ │Limp. │  │
│  │  12  ▲  │ │  3   ▼  │ │  5   ▲  │ │ 2  ▲ │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────┘  │
│  + 4 KPIs na segunda linha                          │
├────────────────────────────────────────────────────┤
│  PAINEL DE ALERTAS LIVE                            │
│  🔴 Incidente não resolvido: ...   → /segurança    │
│  🟠 OS atrasada: ...               → /os           │
│  🟡 Manutenção pendente: ...       → /ativos       │
│  (vazio → "Nenhum alerta ativo ✓")                 │
└────────────────────────────────────────────────────┘
```

---

## KPI Cards (8 de 12 do KpiCacheDoc)

| Card | Campo | Severity | Link |
|---|---|---|---|
| OS Abertas | `ordensAbertas` | critical | `/os` |
| Aprovações Pendentes | `aprovacoesPendentes` | critical | `/compras` |
| Manutenção Atrasada | `manutencaoAtrasada` | critical | `/ativos/manutencao` |
| Compras Urgentes | `comprasUrgentes` | warning | `/compras` |
| Falhas Limpeza | `falhasLimpeza` | critical | `/limpeza` |
| Incidentes Segurança | `incidentesSeguranca` | critical | `/seguranca/ocorrencias` |
| Alertas Colaboradores | `alertasColaboradores` | critical | `/colaboradores` |
| Empreiteiras Críticas | `empreiteirasCriticas` | critical | `/empreiteiras` |

---

## Fluxo de Dados

1. Monta → `readKpiCache(period)` 
   - Cache válido (< 15 min, mesmo period) → usa dados
   - Stale/ausente → chama `computeAndWriteKpiCache(period)` → exibe loading skeleton
2. `subscribeToAlerts()` inicia no mount → cleanup no unmount
3. Troca de período → invalida cache → recomputa automaticamente
4. Botão `↺ Atualizar` → força recompute mesmo com cache válido

---

## Estados de UI

- **Loading KPIs:** skeleton retangular por card
- **Erro KPI:** mensagem inline com botão retry
- **Sem alertas:** estado vazio com ícone ✓ verde
- **Alertas:** cores — critical=`#dc2626`, urgent=`#ea580c`, attention=`#f59e0b`

---

## Fora do Escopo (Fase 2)

- Gráfico de visão geral (OverviewChart com recharts)
- Grid de saúde dos módulos (ModuleHealth)
