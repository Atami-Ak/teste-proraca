# Construction Intelligence Platform (CIP) — Visão Estratégica de Reconstrução

> Documento de planejamento. Nenhuma linha de código foi alterada a partir daqui — é a base para decidir o que construir e em que ordem.
> Pré-requisito assumido: migração do projeto Firebase para o **plano Blaze** (pago por uso), habilitando Cloud Functions, Cloud Scheduler e Cloud Storage avançado. Ver §16 para estimativa de custo/risco dessa migração.
> Base factual: `docs/modules/obras-empreiteiras.md` (auditoria do estado atual, feita nesta mesma sessão).

## 1. Nova visão do produto

Hoje o módulo Obras & Empreiteiras é um CRUD operacional: cadastra obra, cadastra empreiteira, faz inspeção, avalia, aprova. Funciona, mas é reativo — alguém precisa abrir a tela para descobrir que algo está errado.

A **Construction Intelligence Platform (CIP)** inverte esse modelo: o sistema vigia continuamente (via Cloud Functions agendadas), calcula risco e saúde operacional de cada obra/empreiteira, e empurra alertas para quem precisa agir — em vez de esperar alguém puxar o relatório. O objetivo de produto é "zero surpresa": nenhuma obra deveria virar problema crítico sem que o sistema tenha avisado com antecedência mensurável (SLA, vencimento de documento, queda de score).

## 2. Análise crítica do sistema atual (gargalos)

Já documentado em detalhe em `obras-empreiteiras.md` §6–7. Resumo dos gargalos estruturais que a CIP precisa resolver:

| Gargalo | Causa raiz | Resolvido por |
|---|---|---|
| Tudo é client-side, sem automação | Não há Cloud Functions ativas | Cloud Functions agendadas + triggers (Módulo Automação) |
| Sem inteligência operacional | Scores são lidos, nunca cruzados entre si | Health Score + Risk Engine (Módulos 2–3) |
| Sem governança documental | Documentos (ART, seguro, NRs) não existem no schema | Compliance Center + GED (Módulos 5–6) |
| Sem SLA | Nenhum prazo interno é monitorado (ex: tempo até 1ª inspeção) | SLA Engine (Módulo 7) |
| Sem rastreabilidade de eventos | Só `createdAt`/`updatedAt`; nada de histórico granular | Timeline/Digital Twin (Módulo 4) |
| Sem notificações | Usuário só sabe de um problema se abrir a tela | Notification Engine (Cloud Functions + FCM/e-mail) |
| Aprovação sem trava de papel | Regra do Firestore permite operador aprovar encerramento | Workflow Engine com RBAC por etapa (Módulo 10) |
| Auditoria desconectada | `db-audit.ts` existe mas não é chamado | Audit Engine nativo em cada Cloud Function de escrita |

## 3. Arquitetura completa

```
UI (React/Vite)
  ↓
Pages (rotas por domínio: obras, empreiteiras, noc, compliance, war-room…)
  ↓
Components (cards executivos, matriz de risco, timeline, heatmap)
  ↓
Hooks (useObraHealth, useRiskMatrix, useSlaStatus, useCopilot)
  ↓
Services (camada fina — chama Firestore direto OU Cloud Function via httpsCallable)
  ↓
Cloud Functions (Node/TS)
  ├─ Rules Engine        → valida transições de workflow, bloqueia obra sem compliance
  ├─ Analytics Engine    → recalcula Health Score / Risk Score em trigger onWrite
  ├─ Notification Engine → dispara FCM/e-mail em mudança de SLA/risco/documento vencido
  ├─ Audit Engine        → grava audit_log em toda escrita relevante (wrapper único)
  └─ AI Engine           → função callable que monta contexto (snapshot Firestore) e chama LLM
  ↓
Firestore (fonte de verdade) + Cloud Storage (documentos/evidências)
```

**Princípio de separação**: nenhuma regra de negócio crítica (bloqueio de obra, cálculo de score, decisão de risco) deve viver só no client. O client lê resultados pré-computados; Cloud Functions são a única fonte que escreve `healthScore`, `riskScore`, `slaStatus`. Isso elimina a classe de bug "client recalcula errado" e fecha a brecha de segurança onde a UI confia em validação só no front-end.

## 4. Fluxos operacionais (workflow corporativo — Módulo 10)

```
Criada → Planejamento → Aguardando Documentos → Liberada → Execução
  → Inspeção → (Correção ↺) → Validação → Entrega → Garantia → Encerrada
```

Cada transição é uma Cloud Function callable (`transitionObraStatus`), não um `updateDoc` direto do client. A função:
1. Valida pré-condições da etapa (ex.: "Liberada" exige `complianceStatus == 'ok'`).
2. Verifica RBAC do usuário para aquela transição específica.
3. Grava evento na `timeline`.
4. Atualiza `obras.status` e dispara recálculo de Health Score.
5. Notifica responsáveis da próxima etapa.

A regra do Firestore para `obras.update` passa a **negar escrita direta de `status`** pelo client — só a Cloud Function (via Admin SDK) pode mudar o status. Isso resolve de raiz o achado #4 do documento de auditoria (aprovação sem trava de papel).

## 5. Fluxos de aprovação

| Aprovação | Quem pode | SLA | Bloqueia se não cumprido |
|---|---|---|---|
| Liberação para execução | Supervisor+ | 5 dias úteis | Obra fica em "Aguardando Documentos" |
| Validação de inspeção | Supervisor+ | 48h | Inspeção permanece "submetida" (não conta para score até validada) |
| Avaliação final da empreiteira | Supervisor+ | 72h após entrega | — |
| Aprovação/reprovação de encerramento | Admin ou Supervisor designado como aprovador da obra | 5 dias | Obra trava em "Validação" |
| Exceção de compliance (obra sem documento mas liberada por urgência) | Admin apenas, com justificativa obrigatória registrada na timeline | imediato | gera risco automático categoria "Compliance" |

## 6. Banco de dados completo (novas coleções)

```
obras                — agora só metadados + status (motor de regra movido para Functions)
empreiteiras
contratos            — NOVA: 1+ por obra; valor, vigência, aditivos, cláusulas-chave
inspecoes            — renomeia inspecoes_obra; ganha campo workflowStep
avaliacoes           — renomeia avaliacoes_empreiteira
obra_riscos          — NOVA: categoria, probabilidade, impacto, severidade, responsável, mitigação, prazo, status
nao_conformidades    — NOVA: aberta→em_correcao→validando→resolvida→arquivada
documentos           — NOVA: GED — tipo (ART/seguro/NR10/NR35/ASO/licença), validade, versão, storagePath
sla_regras           — NOVA: catálogo de regras (etapa, prazo, severidade de violação)
workflow_execucoes   — NOVA: instância de workflow por obra, etapa atual, histórico de transições
historico_status     — NOVA: log append-only de toda mudança de status (granular, separado da timeline narrativa)
timeline             — NOVA: eventos narrativos por obra (1 doc por evento, para a UI de Digital Twin)
evidencias            — NOVA: subcoleção de nao_conformidades/inspecoes — fotos, anexos
notificacoes         — NOVA: outbox de notificações por usuário (lidas/não lidas)
comentarios          — NOVA: thread por obra/NC/risco
responsaveis         — NOVA: mapeamento obra→papel→usuário (permite múltiplos aprovadores)
aprovacoes           — NOVA: registro formal de cada decisão de aprovação (quem, quando, parecer)
auditoria            — já existe como audit_log; passa a ser preenchida por toda Cloud Function
dashboards_cache     — cache de Health Score / Risk Score agregados, recalculado em trigger
alertas              — NOVA: outbox específico para War Room (críticos)
predicoes            — NOVA: saída do modelo de previsão de atraso/risco (ver §10)
```

Volume esperado é baixo (dezenas de obras, não milhares) — o gargalo nunca foi escala de dados, foi ausência de automação. Isso simplifica a estratégia de índices: poucas coleções precisam de índice composto além das já existentes.

## 7. Regras de negócio (núcleo)

- **Health Score** (Módulo 2) é recalculado por Cloud Function a cada escrita relevante (inspeção, avaliação, atualização financeira, documento) — nunca pelo client.
- **Bloqueio automático por compliance**: se `documentos` obrigatórios (definidos por `tipo de obra`) tiverem algum vencido/ausente, a Cloud Function força `obras.complianceStatus = 'bloqueado'`, e o Rules Engine impede transição para "Liberada"/"Execução".
- **Recontratação**: `empreiteiras.scoreGlobal` passa a ser média ponderada pelas últimas 5 avaliações (peso decrescente), substituindo a média simples atual.

## 8. Regras de segurança (Firestore) + RBAC completo

Princípio novo: **escritas sensíveis passam a exigir Cloud Function (Admin SDK)**; client só pode criar registros de entrada (rascunho de inspeção, comentário, evidência). Tabela RBAC:

| Recurso | Leitura | Criar | Validar/Aprovar | Excluir |
|---|---|---|---|---|
| `obras` (dados) | qualquer papel | operador | — | admin |
| `obras.status` (transição) | — | — | Cloud Function only, RBAC por etapa (tabela §5) | — |
| `contratos` | supervisor+ | supervisor | admin | admin |
| `obra_riscos` | qualquer papel | operador | supervisor (validar mitigação) | admin |
| `nao_conformidades` | qualquer papel | operador | supervisor | admin |
| `documentos` | qualquer papel | operador (upload) | supervisor (validar) | admin |
| `aprovacoes` | qualquer papel | Cloud Function only | — | — |
| `auditoria` | supervisor+ | Cloud Function only | — | admin |

## 9. Automações (Cloud Functions agendadas)

- `checkSlaViolations` (a cada 1h): varre `sla_regras` vs. estado atual, grava em `alertas` e dispara notificação.
- `checkDocumentExpiry` (diário): varre `documentos`, gera alertas em 30/15/7/1 dias e no vencimento.
- `recalcHealthScores` (trigger onWrite em `inspecoes`/`avaliacoes`/`documentos`): recalcula incrementalmente, não em lote.
- `recalcRiskMatrix` (diário): recompila `obra_riscos` em matriz agregada para o War Room.

## 10. Inteligência operacional / IA (Módulo 13 — Copilot)

Fase realista: function callable `askCopilot(question)` que:
1. Monta um snapshot estruturado (não manda o Firestore bruto) com `obras` em risco, `empreiteiras` com queda de score, SLAs estourados, documentos vencidos — já pré-filtrado por Cloud Function.
2. Envia esse snapshot + a pergunta para um modelo Claude via API, com prompt fixo (sem ferramentas, sem ações — só leitura/resumo).
3. Devolve resposta em linguagem natural na UI.

Importante: o Copilot **não deve ter permissão de escrita**. Ele responde perguntas, não executa ações — qualquer ação sugerida exige confirmação humana na UI normal. Previsão de atraso (`predicoes`) na V1 pode ser uma heurística simples (regressão linear sobre `delayDays` histórico da empreiteira/tipo de obra), não ML treinado — modelo estatístico básico já entrega 80% do valor com 5% do custo de um pipeline de ML real.

## 11–12. Analytics e Dashboards

Reaproveita `ObrasAnalyticsPage` como base, mas passa a ler de `dashboards_cache` (pré-computado por Cloud Function) em vez de recalcular no client a cada carregamento — elimina o padrão atual de "buscar tudo e agregar no browser" que não escalará bem com `obra_riscos`, `nao_conformidades` e `timeline` somados.

Telas novas: **Centro de Operações (NOC)**, **War Room**, **Portal da Empreiteira** (cada empreiteira só vê seus próprios dados — exige regra de Firestore filtrando por `empreiteiraId` vinculado ao usuário, hoje inexistente no schema de `users`).

## 13–15. Componentes, páginas e estrutura de pastas

```
src/pages/obras-cip/
  noc/NOCPage.tsx
  war-room/WarRoomPage.tsx
  obras/ObrasPage.tsx (existente, evolui)
  obras/ObraDetailPage.tsx (ganha abas: Riscos, Compliance, Timeline, NCs)
  empreiteiras/PortalEmpreiteiraPage.tsx
  compliance/ComplianceCenterPage.tsx
  copilot/CopilotPanel.tsx (componente flutuante, não página)
src/components/cip/
  HealthScoreRing.tsx
  RiskMatrix.tsx
  TimelineView.tsx
  SlaBadge.tsx
  NotificationCenter.tsx
src/hooks/
  useObraHealth.ts, useRiskMatrix.ts, useSlaStatus.ts, useCopilot.ts
functions/src/
  rules-engine/, analytics-engine/, notification-engine/, audit-engine/, ai-engine/
```

## 16. Estratégia de escalabilidade e custo (Blaze)

Volume real do negócio (obras/empreiteiras de uma fábrica de ração) é pequeno — a escalabilidade que importa é **de funcionalidade**, não de tráfego. Estimativa de custo mensal Blaze para este volume: Cloud Functions (poucas invocações/dia) + Cloud Scheduler (4 jobs) tende a ficar dentro da camada gratuita do Blaze (2M invocações/mês) — custo real esperado é baixo, mas **precisa ser confirmado com cartão de cobrança ativo antes do deploy**, e a IA via API tem custo por token que deve ser orçado separadamente (uso esporádico do Copilot, não chat contínuo).

## 17. Estratégia de auditoria

Toda Cloud Function de escrita usa um wrapper único (`withAudit(fn)`) que grava em `audit_log` automaticamente — em vez de cada função lembrar de chamar `logAudit()` manualmente (que é exatamente o motivo do gap atual: ninguém chama).

## 18. Estratégia de notificações

V1: in-app (`notificacoes` outbox + badge no header). V2: e-mail (Firebase Extensions "Trigger Email" ou SendGrid). V3: push via FCM se houver app mobile/PWA.

## 19. Estratégia de IA

Read-only, sem ações automáticas, custo controlado por limite de chamadas/dia, contexto sempre pré-filtrado (nunca manda dump bruto do Firestore para o modelo).

## 20. Roadmap V1 → V5

- **V1 (não exige Blaze) — ✅ ENTREGUE em 2026-06-22**: Health Score 8-fatores (`src/lib/db-obras-health.ts`, exibido em `ObraDetailPage`), Timeline básica (coleção `obra_timeline`, escrita client-side, aba "Timeline" em `ObraDetailPage`), Centro de Operações (`/dashboard/noc`, reaproveita `fetchObrasAnalytics`). Documentação/Compliance no Health Score usam nota neutra (placeholder) até V2/V3. Resolve parte dos achados #2–#9 do `obras-empreiteiras.md` sem mudar infraestrutura.
- **V2 (exige Blaze)**: Cloud Functions para Rules Engine + Audit Engine automático + recálculo server-side de Health/Risk Score. Resolve o achado #4 (aprovação sem trava) de forma definitiva.
- **V3**: Compliance Center + GED com alertas de vencimento (Cloud Scheduler) + SLA Engine.
- **V4**: Workflow Engine completo (BPM), Portal da Empreiteira, Não Conformidades.
- **V5**: AI Copilot + Predição de atraso (heurística) + War Room.

## Próximo passo

Este documento é a visão completa pedida. Para começar a implementar, a recomendação é abrir com **V1** — entrega valor real (achados #2, #3, #6, #7, #9 do audit já resolvidos) sem custo de infraestrutura nem dependência de upgrade de plano. Diga quais itens do V1 quer que eu comece a codificar nesta sessão.
