// ─────────────────────────────────────────────────────────────────────────────
// db-roadmap.ts — Firestore CRUD para Templates e Auditoria do Roadmap
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  RoadmapTemplate, RoadmapTemplateStage, RoadmapAuditEntry, RoadmapStageEntry,
} from '@/types/roadmap'

const COL_TEMPLATES = 'roadmap_templates'

// ── Helpers para construção dos stages built-in ───────────────────────────────
function def(
  stageId: string, order: number, name: string, icon: string, descricao: string,
  slaDias?: number, predecessoras?: string[],
  checklist?: { itemId: string; label: string }[],
): RoadmapTemplateStage {
  return { stageId, order, name, icon, descricao, slaDias, predecessoras, checklist }
}

const S_SELECAO = def('SELECAO', 1, 'Seleção', '🔍',
  'Recrutamento, entrevistas e parecer do RH.', 14)

const S_ADMISSAO = def('ADMISSAO', 2, 'Admissão', '📝',
  'Documentação, contrato e exame admissional.', 5, ['SELECAO'], [
    { itemId: 'rg',       label: 'Entrega do RG'           },
    { itemId: 'cpf',      label: 'Entrega do CPF'          },
    { itemId: 'contrato', label: 'Assinatura do contrato'  },
    { itemId: 'exame',    label: 'Exame admissional'       },
    { itemId: 'cadastro', label: 'Cadastro no sistema'     },
  ])

const S_INTEGRACAO = def('INTEGRACAO', 3, 'Integração', '🤝',
  'Cultura organizacional, normas internas e segurança.', 7, ['ADMISSAO'], [
    { itemId: 'cultura',  label: 'Apresentação da cultura' },
    { itemId: 'normas',   label: 'Normas internas'         },
    { itemId: 'cracha',   label: 'Crachá emitido'          },
    { itemId: 'uniforme', label: 'Uniforme entregue'       },
  ])

const S_CAPACITACAO = def('CAPACITACAO', 4, 'Capacitação', '🎓',
  'Treinamentos, NRs e certificações.', 30, ['INTEGRACAO'], [
    { itemId: 'nr05',    label: 'NR-05 CIPA'                      },
    { itemId: 'nr06',    label: 'NR-06 EPI'                       },
    { itemId: 'nr09',    label: 'NR-09 Riscos Ambientais'         },
    { itemId: 'nr11',    label: 'NR-11 Operação de Empilhadeiras' },
    { itemId: 'sistema', label: 'Treinamento sistema interno'     },
  ])

const S_DESENVOLVIMENTO = def('DESENVOLVIMENTO', 5, 'Desenvolvimento', '📈',
  'Avaliações periódicas, habilidades e projetos.', 180, ['CAPACITACAO'])

const S_LIDERANCA = def('LIDERANCA', 6, 'Liderança', '👑',
  'Desenvolvimento de competências de gestão e liderança.', 90, ['DESENVOLVIMENTO'])

const S_PROMOCAO = def('PROMOCAO', 7, 'Promoção', '🎯',
  'Evolução de cargo, função ou remuneração.', undefined, ['DESENVOLVIMENTO'])

const S_DESLIGAMENTO = def('DESLIGAMENTO', 8, 'Desligamento', '🔴',
  'Encerramento formal do vínculo empregatício.')

// ── Templates built-in (6 perfis) ────────────────────────────────────────────
export const BUILT_IN_TEMPLATES: Omit<RoadmapTemplate, 'id' | 'createdAt'>[] = [
  {
    name: 'Completo', tipo: 'completo', isDefault: true,
    descricao: 'Ciclo completo — Seleção até Desligamento',
    stages: [S_SELECAO, S_ADMISSAO, S_INTEGRACAO, S_CAPACITACAO, S_DESENVOLVIMENTO, S_PROMOCAO, S_DESLIGAMENTO],
  },
  {
    name: 'Operacional', tipo: 'operacional', isDefault: true,
    descricao: 'Para operadores, técnicos e auxiliares',
    stages: [S_SELECAO, S_ADMISSAO, S_INTEGRACAO, S_CAPACITACAO, S_DESENVOLVIMENTO],
  },
  {
    name: 'Administrativo', tipo: 'administrativo', isDefault: true,
    descricao: 'Para cargos administrativos e de suporte',
    stages: [S_SELECAO, S_ADMISSAO, S_INTEGRACAO, S_CAPACITACAO, S_DESENVOLVIMENTO, S_PROMOCAO],
  },
  {
    name: 'Gestor / Liderança', tipo: 'gestor', isDefault: true,
    descricao: 'Para gestores, supervisores e líderes de equipe',
    stages: [S_SELECAO, S_ADMISSAO, S_INTEGRACAO, S_CAPACITACAO, S_DESENVOLVIMENTO, S_LIDERANCA, S_PROMOCAO],
  },
  {
    name: 'Estagiário', tipo: 'estagiario', isDefault: true,
    descricao: 'Para estagiários e jovens aprendizes',
    stages: [S_SELECAO, S_ADMISSAO, S_INTEGRACAO, S_CAPACITACAO, S_DESENVOLVIMENTO],
  },
  {
    name: 'Terceirizado', tipo: 'terceirizado', isDefault: true,
    descricao: 'Para colaboradores terceirizados',
    stages: [S_ADMISSAO, S_INTEGRACAO],
  },
]

// ── Templates CRUD ────────────────────────────────────────────────────────────
export async function getRoadmapTemplates(): Promise<RoadmapTemplate[]> {
  const snap = await getDocs(collection(db, COL_TEMPLATES))
  if (snap.empty) {
    await seedBuiltInTemplates()
    const snap2 = await getDocs(collection(db, COL_TEMPLATES))
    return snap2.docs.map(d => ({ ...(d.data() as Omit<RoadmapTemplate, 'id'>), id: d.id }))
  }
  return snap.docs.map(d => ({ ...(d.data() as Omit<RoadmapTemplate, 'id'>), id: d.id }))
}

export async function seedBuiltInTemplates(): Promise<void> {
  for (const tpl of BUILT_IN_TEMPLATES) {
    await addDoc(collection(db, COL_TEMPLATES), { ...tpl, createdAt: serverTimestamp() })
  }
}

// ── Construção de stages a partir do template ─────────────────────────────────
export function buildStagesFromTemplate(
  template: RoadmapTemplate,
  emp: { dataAdmissao?: Date; status?: string; dataDemissao?: Date },
): RoadmapStageEntry[] {
  return template.stages.map(def => {
    const entry: RoadmapStageEntry = {
      stageId:   def.stageId,
      name:      def.name,
      icon:      def.icon,
      descricao: def.descricao,
      order:     def.order,
      slaDias:   def.slaDias,
      status:    'pendente',
      checklist: def.checklist?.map(c => ({ ...c, done: false })),
    }
    if (def.stageId === 'SELECAO' || def.stageId === 'ADMISSAO') {
      entry.status        = 'concluida'
      entry.dataInicio    = emp.dataAdmissao
      entry.dataConclusao = emp.dataAdmissao
    }
    if (def.stageId === 'INTEGRACAO') {
      entry.status     = 'em_andamento'
      entry.dataInicio = emp.dataAdmissao
      if (emp.dataAdmissao && def.slaDias) {
        entry.dataPrevisao = new Date(emp.dataAdmissao.getTime() + def.slaDias * 86_400_000)
      }
    }
    if (def.stageId === 'DESLIGAMENTO' && emp.status === 'desligado') {
      entry.status        = 'concluida'
      entry.dataConclusao = emp.dataDemissao
    }
    return entry
  })
}

// Migra stages v1 (com campo 'etapa') para v2 (com campo 'stageId')
export function migrateStagesV1toV2(stages: RoadmapStageEntry[]): RoadmapStageEntry[] {
  return stages.map(st => ({
    ...st,
    stageId: st.stageId ?? ((st.etapa as string | undefined) ?? '').toUpperCase(),
    name:    st.name    ?? st.etapa ?? st.stageId ?? '',
    icon:    st.icon    ?? '📍',
    order:   st.order   ?? 0,
  }))
}

// ── Auditoria ─────────────────────────────────────────────────────────────────
export async function logRoadmapAudit(
  employeeId: string,
  entry: Omit<RoadmapAuditEntry, 'id' | 'changedAt'>,
): Promise<void> {
  await addDoc(
    collection(db, 'employees', employeeId, 'roadmap_audit'),
    { ...entry, changedAt: serverTimestamp() },
  )
}

export async function getRoadmapAudit(employeeId: string): Promise<RoadmapAuditEntry[]> {
  const snap = await getDocs(
    query(
      collection(db, 'employees', employeeId, 'roadmap_audit'),
      orderBy('changedAt', 'desc'),
      limit(50),
    ),
  )
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id:            d.id,
      stageId:       data.stageId       as string,
      stageName:     data.stageName     as string,
      campo:         data.campo         as string,
      valorAnterior: data.valorAnterior as string,
      valorNovo:     data.valorNovo     as string,
      changedBy:     data.changedBy     as string,
      changedAt:     data.changedAt?.toDate?.() ?? new Date(),
    } as RoadmapAuditEntry
  })
}
