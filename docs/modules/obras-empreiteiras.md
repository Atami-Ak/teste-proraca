# Módulo Obras & Empreiteiras — Documentação Técnica Completa

> Levantamento feito em 2026-06-22 a partir do código atual (não do histórico de memória). Use este documento como base para planejar melhorias.

## 1. Visão geral

Supervisão de obras terceirizadas: cadastro de obras, vínculo com empreiteiras, inspeções técnicas periódicas com checklist ponderado, avaliação final da empreiteira (gera score de recontratação) e aprovação/encerramento do contrato. Há também um módulo de Analytics somente leitura (`/dashboard/obras`).

Não há Cloud Functions — toda a lógica (cálculo de score, agregação, código sequencial) roda client-side em `src/lib/db-obras.ts`.

## 2. Arquivos do módulo

| Camada | Arquivo |
|---|---|
| Tipos | `src/types/obras.ts` |
| Tipos (analytics) | `src/types/obras-analytics.ts` |
| CRUD/regras de negócio | `src/lib/db-obras.ts` |
| Dados (analytics) | `src/lib/db-obras-analytics.ts` |
| Catálogo estático de inspeção | `src/data/inspecao-obra-catalog.ts` |
| Páginas | `ObrasPage`, `ObraFormPage`, `ObraDetailPage`, `InspecaoObraPage` (`src/pages/obras/`) |
| Páginas | `EmpreiteirasPage`, `EmpreiteiraDetailPage` (`src/pages/empreiteiras/`) |
| Páginas (analytics) | `ObrasAnalyticsPage` (`src/pages/dashboard/obras/`) |
| Rotas | `src/App.tsx` |
| Segurança | `firestore.rules` (seções OBRAS) |
| Índices | `firestore.indexes.json` (`inspecoes_obra`, `avaliacoes_empreiteira`) |

## 3. Coleções Firestore

- **`obras`** — projeto de obra (status, financeiro, cronograma, agregados de qualidade).
- **`empreiteiras`** — cadastro com score global calculado.
- **`inspecoes_obra`** — múltiplas por obra; checklist de 8 seções / ~50 itens.
- **`avaliacoes_empreiteira`** — uma por obra; avaliação ponderada de 8 critérios.

Não há subcoleções, nem soft-delete dedicado para `obras` (existe `ativo` em `empreiteiras`, mas obra só tem `status` — "cancelada" é o equivalente).

## 4. Modelo de dados (resumo)

`Obra`: código auto-incremental `OBR-NNN` (calculado lendo **todos** os docs de `obras` a cada criação — ver §6), status, prioridade (`Priority` global, agora inclui `bloqueante`), financeiro (`valorContrato/valorAditivos/valorPago`), cronograma, agregados (`notaMedia`, `totalInspecoes`, `alertasCriticos`), `aprovacaoFinal`.

`Empreiteira`: especialidades, `status` derivado de `scoreGlobal`, `totalObras`/`obrasAprovadas` recalculados a cada avaliação.

`InspecaoObra`: 8 seções com pesos somando 1.0, cada item 0–10 ou `null`. Itens críticos com nota <7 geram alerta `critico` (nota <5) ou `atencao`.

`AvaliacaoEmpreiteira`: 8 critérios (pesos em `AVALIACAO_PESOS`, somam 1.0) → `scoreTotal` 0–100 → `recomendacao` (`sim`/`sim_restricoes`/`nao`/`bloqueado`).

### Regras de scoring

- Status da empreiteira: Preferencial ≥85, Aprovada ≥70, Aprovada c/ Restrições ≥55, Não Recomendada ≥40, Bloqueada <40.
- `scoreGlobal` é a **média simples de todas as avaliações** da empreiteira (não pondera por obra recente nem por porte do contrato).
- Catálogo de inspeção: pesos por seção — Qualidade 25%, Segurança 20%, Prazo 15%, Canteiro/Materiais/Equipe 10% cada, Financeiro/Operações 5% cada (soma 100%).

## 5. Fluxo funcional

1. **Cadastrar empreiteira** (`EmpreiteirasPage`, requer `supervisor+`) → status inicial fixo `aprovada` mesmo sem nenhuma avaliação.
2. **Criar obra** (`ObraFormPage`, requer `operador+`) → vincula empreiteira (opcional).
3. **Inspeções** (`InspecaoObraPage`) → rascunho ou submissão; ao submeter recalcula agregados da obra (`notaMedia`, `alertasCriticos`).
4. **Avaliação final** (`ObraDetailPage`, aba Avaliação) → uma única avaliação por obra; ao salvar recalcula `scoreGlobal` da empreiteira.
5. **Aprovação final** (`ObraDetailPage`, aba Aprovação) → aprova/reprova a entrega; sem trava de papel na UI (qualquer usuário com acesso à tela pode aprovar — ver §7).
6. **Analytics** (`/dashboard/obras`, admin-only) → ranking, risco, tendência, custo. Somente leitura, usa campos pré-computados.

## 6. Achados técnicos (bugs e dívidas)

1. **Corrigido nesta sessão**: `PRIORITY_META` local em `ObraFormPage.tsx` não tinha a chave `bloqueante`, causando erro de tipo (o tipo `Priority` global ganhou esse valor recentemente, para o módulo de Recomendações). Já ajustado.
2. **Geração de código sequencial não é atômica.** `nextObrasCode()` lê toda a coleção `obras` e escolhe `max+1` sem transação — duas criações simultâneas podem gerar o mesmo `OBR-NNN`. Baixo risco hoje (poucos usuários simultâneos), mas vale uma transação Firestore (`runTransaction`) se o uso crescer.
3. **`scoreGlobal` da empreiteira é a média simples de todas as avaliações**, sem decaimento temporal nem peso por valor de contrato. Uma empreiteira "preferencial" antiga não cai de status mesmo após resultados ruins recentes, até a média total descer — isso pode mascarar queda de desempenho recente. Vale considerar média ponderada pelas N avaliações mais recentes.
4. **Sem trava de papel na aprovação final da obra.** A action `updateAprovacao` (encerramento de contrato) é chamada sem checar `user.role` na UI, e a regra do Firestore para `obras` permite `isOperador()` em `update` — ou seja, qualquer operador pode aprovar/reprovar o encerramento de uma obra, não só supervisor/admin. Dado que essa decisão tem peso financeiro e contratual, considerar restringir a regra (`isSupervisor()`) e/ou esconder os botões na UI por papel.
5. **Sem exclusão (delete) de obra ou empreiteira na UI.** `deleteObra`/`deleteEmpreiteira` existem em `db-obras.ts` mas não são chamados em nenhuma página — não há como remover um cadastro incorreto, só "cancelar" (obra) ou desativar (`ativo`, empreiteira). Pode ser intencional (auditoria), mas vale confirmar com o usuário.
6. **Sem paginação.** `getObras()` e `getEmpreiteiras()` sempre buscam a coleção inteira. Funciona bem em baixo volume; se o número de obras crescer (anos de histórico), vai pesar o carregamento de `ObrasPage`/`EmpreiteirasPage`.
7. **Inspeções não têm fluxo de aprovação por supervisor.** O tipo `InspecaoStatus` inclui `'aprovada'`, e a regra do Firestore comenta "supervisor pode aprovar", mas não há nenhum botão na UI para transicionar de `submetida` → `aprovada` — esse estado nunca é atingido na prática (fica travado como `readOnly` apenas quando já está `aprovada`, mas nada seta esse status).
8. **Central de Auditoria Global (`db-audit.ts`, criada ontem) não está conectada a este módulo.** Nenhuma chamada a `logAudit()` existe em `db-obras.ts` ou nas páginas de obras/empreiteiras — criar obra, aprovar, avaliar empreiteira, etc. não deixam rastro na auditoria global, apesar da infraestrutura (coleção + regras) já existir.
9. **`EmpreiteirasPage` link `/obras?emp=${id}`** (botão "Ver Obras" em `EmpreiteiraDetailPage`) **não tem efeito** — `ObrasPage` não lê query params, só filtra pelo dropdown interno.
10. **`empreiteiraNome` é desnormalizado em `Obra`** no momento da criação/edição, mas nunca é atualizado se a empreiteira for renomeada depois — pode ficar dessincronizado do campo `nome` real da empreiteira (mitigado parcialmente porque a maioria das telas busca o nome via `empMap`/`getEmpreiteira`, mas o campo `empreiteiraNome` em si fica obsoleto).

## 7. Controle de acesso (RBAC) atual

| Ação | Papel mínimo (Firestore rule) | Trava na UI? |
|---|---|---|
| Ler obras/empreiteiras | qualquer papel válido | — |
| Criar/editar obra | operador | Não (tela acessível a qualquer logado nas rotas `/obras/*`) |
| Criar/editar empreiteira | supervisor | Sim (rule bloqueia, sem aviso amigável na UI) |
| Inspeção (criar/editar) | operador | — |
| Avaliação final | supervisor | **Não** — UI permite a qualquer usuário autenticado tentar salvar; só falha silenciosamente se a regra do Firestore rejeitar |
| Aprovação final da obra | operador (rule) | **Não** — nenhuma checagem de papel |
| Excluir (qualquer) | admin | N/A (sem botão de exclusão) |
| Analytics (`/dashboard/obras`) | admin (rota) | Sim |

Ponto de atenção: itens 4–6 da tabela mostram que a UI não informa o usuário quando a ação será rejeitada pela regra (ex.: operador tentando salvar avaliação final vai receber só "Erro ao salvar avaliação" genérico, sem explicar que falta nível de acesso).

## 8. Sugestões de melhoria (priorizadas)

**Curto prazo / baixo esforço:**
- Restringir regra de `obras.update` para aprovação (`isSupervisor()`) ou separar em subcampo com regra própria.
- Remover/corrigir o link morto `/obras?emp=` ou implementar o filtro via query param.
- Adicionar checagem de papel na UI antes de mostrar os botões de avaliação/aprovação (`useStore(st => st.user?.role)`), com mensagem explicativa em vez de erro genérico.

**Médio prazo:**
- Conectar `logAudit()` (de `db-audit.ts`) às operações de criação/edição/aprovação de obras e avaliações — já existe toda a infraestrutura, falta só chamar.
- Implementar o fluxo de aprovação de inspeção por supervisor (botão "Aprovar Inspeção" que seta `status: 'aprovada'`).
- Trocar `scoreGlobal` para média ponderada pelas avaliações mais recentes (ex.: últimas 5, ou decaimento por tempo).

**Longo prazo / estrutural:**
- Migrar `nextObrasCode()` para `runTransaction` ou contador dedicado (como já existe em `meta/` para insumos) para evitar colisão de código.
- Paginação/`limit()` em `getObras()`/`getEmpreiteiras()` quando o volume crescer.
- Adicionar exclusão lógica de obra (campo tipo `arquivada: boolean`) para registros criados por erro, sem perder histórico de auditoria.
