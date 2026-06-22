import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  getEmployee, getEmployeeHistory, getEmployeeEvaluations,
  getEmployeeWarnings, getEmployeeRecognitions, getSupervisorNotes,
  createSupervisorNote, createWarning, resolveWarning, deactivateEmployee,
  ensureRoadmapStages, saveRoadmapStage, addHistoryEvent, syncCertificationStats,
  getEmployeeTimebankEntries, createTimebankEntry,
  getTimebankRegistros, createTimebankRegistro, approveTimebankRegistro,
} from '@/lib/db-employees'
import {
  getEmployeeDocuments, uploadEmployeeDocument, deleteEmployeeDocument,
} from '@/lib/db-employee-documents'
import type {
  Employee, EmployeeHistoryEvent, EmployeeEvaluation,
  EmployeeWarning, EmployeeRecognition, SupervisorNote, CategoriaNota, TipoAviso,
  EmployeeDocument, EmployeeDocumentType, RoadmapStageEntry, StatusEtapa,
  TimebankEntry, TipoLancamentoBancoHoras,
  TimebankRegistro, StatusRegistroBH,
} from '@/types/employee'
import {
  STATUS_PERFORMANCE_META, STATUS_EMPLOYEE_META, TIPO_VINCULO_META,
  TIPO_EVENTO_META, TIPO_AVISO_META, TIPO_RECONHECIMENTO_META,
  EMPLOYEE_DOC_META,
  STATUS_CERTIFICACAO_META, computeCertStatus,
  TIPO_LANCAMENTO_BH_META, calcScore360, scoreToStatus,
  STATUS_REGISTRO_BH_META, calcHorasFromTimes, fmtSaldo,
} from '@/types/employee'
import {
  STATUS_ETAPA_META, STATUS_ETAPA_ORDER, SLA_STATUS_META, calcSlaStatus, isStatusTerminal,
} from '@/types/roadmap'
import type { RoadmapAuditEntry, RoadmapTemplate } from '@/types/roadmap'
import { getRoadmapAudit, getRoadmapTemplates } from '@/lib/db-roadmap'
import { getKPIEvaluations } from '@/lib/db-performance'
import type { KPIEvaluation } from '@/types/performance'
import { PERFORMANCE_PERIOD_META, PARECER_META } from '@/types/performance'
import { toast } from '@/components/ui/Toast'
import s from './EmployeeProfilePage.module.css'

type Tab = 'roadmap' | 'timeline' | 'avaliacoes' | 'kpieval' | 'disciplinar' | 'bancohoras' | 'notas' | 'seguranca' | 'documentos'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function toInputDate(d?: Date): string {
  return d ? d.toISOString().split('T')[0] : ''
}

function fmtShort(d: Date | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000))
}

type StageForm = {
  status:        StatusEtapa
  dataInicio:    string
  dataConclusao: string
  responsavel:   string
  observacoes:   string
  evidencias:    string[]
  checklist?:    import('@/types/roadmap').ChecklistItem[]
}

function formFromStage(st: RoadmapStageEntry | undefined): StageForm {
  return {
    status:        st?.status ?? 'pendente',
    dataInicio:    toInputDate(st?.dataInicio),
    dataConclusao: toInputDate(st?.dataConclusao),
    responsavel:   st?.responsavel ?? '',
    observacoes:   st?.observacoes ?? '',
    evidencias:    st?.evidencias ?? [],
    checklist:     st?.checklist,
  }
}

function fmtScore(score: number) {
  const meta = STATUS_PERFORMANCE_META[
    score >= 90 ? 'excelente' : score >= 75 ? 'muito_bom' : score >= 60 ? 'bom' : score >= 40 ? 'atencao' : 'critico'
  ]
  return <span className={s.scorePill} style={{ color: meta.color, background: meta.bg }}>{score}/100 — {meta.label}</span>
}

export default function EmployeeProfilePage() {
  const { id }  = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [emp, setEmp]         = useState<Employee | null>(null)
  const [history, setHistory] = useState<EmployeeHistoryEvent[]>([])
  const [evals, setEvals]     = useState<EmployeeEvaluation[]>([])
  const [warns, setWarns]     = useState<EmployeeWarning[]>([])
  const [reconhs, setReconhs] = useState<EmployeeRecognition[]>([])
  const [timebank, setTimebank]     = useState<TimebankEntry[]>([])
  const [registros, setRegistros]   = useState<TimebankRegistro[]>([])
  const [bhSubTab, setBhSubTab]     = useState<'registros' | 'lancamentos'>('registros')
  const [notes, setNotes]     = useState<SupervisorNote[]>([])
  const [docs, setDocs]       = useState<EmployeeDocument[]>([])
  const [kpiEvals, setKpiEvals] = useState<KPIEvaluation[]>([])
  const [tab, setTab]         = useState<Tab>('roadmap')
  const [loading, setLoading] = useState(true)

  // Roadmap / Jornada do Colaborador
  const [stages, setStages]               = useState<RoadmapStageEntry[]>([])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [stageForm, setStageForm]         = useState<StageForm>(formFromStage(undefined))
  const [stageSaving, setStageSaving]     = useState(false)
  const [justSavedId, setJustSavedId]     = useState<string | null>(null)
  const [auditLog, setAuditLog]           = useState<RoadmapAuditEntry[]>([])
  const [templates, setTemplates]         = useState<RoadmapTemplate[]>([])
  const [showAudit, setShowAudit]         = useState(false)

  // Document upload modal
  const [showDocModal,  setShowDocModal]  = useState(false)
  const [docType,       setDocType]       = useState<EmployeeDocumentType>('contrato')
  const [docName,       setDocName]       = useState('')
  const [docFile,       setDocFile]       = useState<File | null>(null)
  const [docPreview,    setDocPreview]    = useState<string | null>(null)
  const [docUploading,  setDocUploading]  = useState(false)
  const [docDataRealizacao, setDocDataRealizacao] = useState('')
  const [docDataValidade,   setDocDataValidade]   = useState('')
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null)

  // Warning form
  const [showWarnForm, setShowWarnForm] = useState(false)
  const [warnTipo,     setWarnTipo]     = useState<TipoAviso>('verbal')
  const [warnTitulo,   setWarnTitulo]   = useState('')
  const [warnDesc,     setWarnDesc]     = useState('')
  const [warnAssinado, setWarnAssinado] = useState(false)
  const [warnSaving,   setWarnSaving]   = useState(false)

  // New note form
  const [noteText, setNoteText]     = useState('')
  const [noteCat, setNoteCat]       = useState<CategoriaNota>('geral')
  const [notePos, setNotePos]       = useState(true)
  const [noteConf, setNoteConf]     = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)

  // Timebank manual form
  const [showTbForm, setShowTbForm] = useState(false)
  const [tbTipo,     setTbTipo]     = useState<TipoLancamentoBancoHoras>('credito')
  const [tbHoras,    setTbHoras]    = useState('')
  const [tbMotivo,   setTbMotivo]   = useState('')
  const [tbSaving,   setTbSaving]   = useState(false)

  // Registro de ponto form
  const [showRegForm,    setShowRegForm]    = useState(false)
  const [regData,        setRegData]        = useState('')
  const [regEntrada,     setRegEntrada]     = useState('')
  const [regInicioPausa, setRegInicioPausa] = useState('')
  const [regFimPausa,    setRegFimPausa]    = useState('')
  const [regSaida,       setRegSaida]       = useState('')
  const [regJornada,     setRegJornada]     = useState('8')
  const [regMotivo,      setRegMotivo]      = useState('')
  const [regSaving,      setRegSaving]      = useState(false)

  useEffect(() => {
    if (!id) return
    getEmployee(id).then(async e => {
      if (!e) { toast.error('Colaborador não encontrado.'); navigate('/colaboradores'); return }
      const [h, ev, w, r, n, d, roadmap, tb, kpi, regs, tpls, audit] = await Promise.all([
        getEmployeeHistory(id).catch(() => [] as EmployeeHistoryEvent[]),
        getEmployeeEvaluations(id).catch(() => [] as EmployeeEvaluation[]),
        getEmployeeWarnings(id).catch(() => [] as EmployeeWarning[]),
        getEmployeeRecognitions(id).catch(() => [] as EmployeeRecognition[]),
        getSupervisorNotes(id).catch(() => [] as SupervisorNote[]),
        getEmployeeDocuments(id).catch(() => [] as EmployeeDocument[]),
        ensureRoadmapStages(id, e).catch(() => [] as RoadmapStageEntry[]),
        getEmployeeTimebankEntries(id).catch(() => [] as TimebankEntry[]),
        getKPIEvaluations(id).catch(() => [] as KPIEvaluation[]),
        getTimebankRegistros(id).catch(() => [] as TimebankRegistro[]),
        getRoadmapTemplates().catch(() => [] as RoadmapTemplate[]),
        getRoadmapAudit(id).catch(() => [] as RoadmapAuditEntry[]),
      ])
      setEmp({ ...e, roadmapStages: roadmap })
      setHistory(h); setEvals(ev); setWarns(w); setReconhs(r); setNotes(n); setDocs(d)
      setTimebank(tb); setKpiEvals(kpi); setRegistros(regs)
      setStages(roadmap); setTemplates(tpls); setAuditLog(audit)
      const current = roadmap.find(st => st.status !== 'concluida') ?? roadmap[roadmap.length - 1]
      if (current) {
        setSelectedStageId(current.stageId)
        setStageForm(formFromStage(current))
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [id, navigate])

  function selectStage(stageId: string) {
    setSelectedStageId(stageId)
    setStageForm(formFromStage(stages.find(st => st.stageId === stageId)))
  }

  function toggleEvidencia(docId: string) {
    setStageForm(prev => ({
      ...prev,
      evidencias: prev.evidencias.includes(docId)
        ? prev.evidencias.filter(d => d !== docId)
        : [...prev.evidencias, docId],
    }))
  }

  function buildUpdatedStage(stageId: string, form: StageForm): RoadmapStageEntry {
    const prev = stages.find(st => st.stageId === stageId)
    return {
      stageId,
      etapa:         prev?.etapa,
      name:          prev?.name ?? stageId,
      icon:          prev?.icon,
      order:         prev?.order,
      slaDias:       prev?.slaDias,
      descricao:     prev?.descricao,
      checklist:     form.checklist,
      status:        form.status,
      dataInicio:    form.dataInicio ? new Date(form.dataInicio + 'T12:00:00') : undefined,
      dataConclusao: form.dataConclusao ? new Date(form.dataConclusao + 'T12:00:00') : undefined,
      responsavel:   form.responsavel.trim() || undefined,
      observacoes:   form.observacoes.trim() || undefined,
      evidencias:    form.evidencias.length ? form.evidencias : undefined,
    }
  }

  function advanceToNextPending(updatedStages: RoadmapStageEntry[], doneStageId: string) {
    const sorted = [...updatedStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const next = sorted.find(s => s.stageId !== doneStageId && !isStatusTerminal(s.status))
    if (next) {
      setSelectedStageId(next.stageId)
      setStageForm(formFromStage(next))
    }
  }

  async function persistStage(updated: RoadmapStageEntry, prevStatus: StatusEtapa | undefined) {
    const updatedStages = await saveRoadmapStage(id!, emp!, updated, 'Sistema')
    setStages(updatedStages)
    setEmp(prev => prev ? { ...prev, roadmapStages: updatedStages } : prev)
    setStageForm(formFromStage(updated))
    setJustSavedId(updated.stageId)
    setTimeout(() => setJustSavedId(null), 2200)
    if (updated.status === 'concluida' && prevStatus !== 'concluida') {
      getEmployeeHistory(id!).then(setHistory).catch(console.error)
      setTimeout(() => advanceToNextPending(updatedStages, updated.stageId), 600)
    }
    return updatedStages
  }

  async function handleSaveStage() {
    if (!id || !emp || !selectedStageId) return
    const prev = stages.find(st => st.stageId === selectedStageId)
    const hasChange =
      stageForm.status     !== (prev?.status     ?? 'pendente') ||
      stageForm.responsavel.trim() !== (prev?.responsavel ?? '') ||
      stageForm.observacoes.trim() !== (prev?.observacoes ?? '') ||
      stageForm.dataInicio  !== toInputDate(prev?.dataInicio) ||
      stageForm.dataConclusao !== toInputDate(prev?.dataConclusao) ||
      (stageForm.checklist?.some((item, i) => item.done !== (prev?.checklist?.[i]?.done ?? false)) ?? false)
    if (!hasChange) {
      toast.error('Nenhuma alteração detectada. Modifique ao menos um campo antes de salvar.')
      return
    }
    setStageSaving(true)
    try {
      const updated = buildUpdatedStage(selectedStageId, stageForm)
      await persistStage(updated, prev?.status)
      toast.success(`Etapa "${updated.name ?? updated.stageId}" salva com sucesso.`)
    } catch { toast.error('Erro ao salvar etapa. Tente novamente.') }
    finally { setStageSaving(false) }
  }

  async function quickAction(newStatus: StatusEtapa, extraDates?: { dataInicio?: string; dataConclusao?: string }) {
    if (!id || !emp || !selectedStageId || stageSaving) return
    const prev = stages.find(st => st.stageId === selectedStageId)
    if (newStatus === 'concluida') {
      const cl = stageForm.checklist ?? prev?.checklist ?? []
      const done = cl.filter(c => c.done).length
      if (cl.length > 0 && done < cl.length) {
        const ok = window.confirm(`Checklist incompleto (${done}/${cl.length} itens). Concluir mesmo assim?`)
        if (!ok) return
      }
    }
    const today = new Date().toISOString().split('T')[0]
    const newForm: StageForm = {
      ...stageForm,
      status: newStatus,
      dataInicio:    extraDates?.dataInicio    ?? stageForm.dataInicio    ?? (newStatus === 'em_andamento' ? today : ''),
      dataConclusao: extraDates?.dataConclusao ?? stageForm.dataConclusao ?? (newStatus === 'concluida'   ? today : ''),
    }
    setStageForm(newForm)
    setStageSaving(true)
    try {
      const updated = buildUpdatedStage(selectedStageId, newForm)
      await persistStage(updated, prev?.status)
      const label = STATUS_ETAPA_META[newStatus].label
      toast.success(`Etapa "${updated.name ?? updated.stageId}" → ${label}`)
    } catch { toast.error('Erro ao atualizar etapa. Tente novamente.') }
    finally { setStageSaving(false) }
  }

  function handleDocFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setDocFile(file)
    if (file.type.startsWith('image/')) {
      if (docPreview) URL.revokeObjectURL(docPreview)
      setDocPreview(URL.createObjectURL(file))
    } else {
      setDocPreview(null)
    }
    e.target.value = ''
  }

  function resetDocModal() {
    setDocType('contrato'); setDocName(''); setDocFile(null)
    setDocDataRealizacao(''); setDocDataValidade('')
    if (docPreview) URL.revokeObjectURL(docPreview)
    setDocPreview(null); setShowDocModal(false)
  }

  async function handleDocUpload() {
    if (!docFile || !id || !emp) return
    if (!docName.trim()) { toast.error('Informe um nome para o documento.'); return }
    setDocUploading(true)
    try {
      const dataRealizacao = docDataRealizacao ? new Date(docDataRealizacao) : undefined
      const dataValidade   = docDataValidade   ? new Date(docDataValidade)   : undefined
      const newDoc = await uploadEmployeeDocument(id, {
        type: docType, name: docName.trim(), dataRealizacao, dataValidade,
      }, docFile)
      const newDocs = [newDoc, ...docs]
      setDocs(newDocs)
      const counts = await syncCertificationStats(id, newDocs)
      setEmp(prev => prev ? { ...prev, totalCertificacoesVencidas: counts.vencidas, totalCertificacoesAVencer: counts.aVencer } : prev)
      if (docType === 'treinamento' && dataRealizacao) {
        await addHistoryEvent({
          employeeId:    id,
          tipo:          'treinamento',
          titulo:        `Treinamento: ${docName.trim()}`,
          descricao:     dataValidade ? `Válido até ${dataValidade.toLocaleDateString('pt-BR')}.` : 'Sem data de validade definida.',
          positivo:      true,
          registradoPor: 'Sistema',
          data:          dataRealizacao,
          referenceId:   newDoc.id,
          referenceType: 'document',
        })
        getEmployeeHistory(id).then(setHistory).catch(console.error)
      }
      toast.success('Documento enviado.')
      resetDocModal()
    } catch { toast.error('Erro ao enviar documento.') }
    finally { setDocUploading(false) }
  }

  async function handleDocDelete(doc: EmployeeDocument) {
    if (!id) return
    if (!window.confirm(`Remover "${doc.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteEmployeeDocument(id, doc.id, doc.fileUrl)
      const newDocs = docs.filter(d => d.id !== doc.id)
      setDocs(newDocs)
      const counts = await syncCertificationStats(id, newDocs)
      setEmp(prev => prev ? { ...prev, totalCertificacoesVencidas: counts.vencidas, totalCertificacoesAVencer: counts.aVencer } : prev)
      toast.success('Documento removido.')
    } catch { toast.error('Erro ao remover documento.') }
  }

  function fmtFileSize(bytes: number): string {
    if (bytes < 1024)         return `${bytes} B`
    if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleAddNote() {
    if (!noteText.trim() || !id || !emp) return
    setNoteSaving(true)
    try {
      const note = await createSupervisorNote({
        employeeId:    id,
        supervisorNome:'Sistema',
        nota:          noteText.trim(),
        categoria:     noteCat,
        positivo:      notePos,
        data:          new Date(),
        confidencial:  noteConf,
      })
      setNotes(prev => [{
        id: note, employeeId: id, supervisorNome: 'Sistema',
        nota: noteText.trim(), categoria: noteCat, positivo: notePos,
        data: new Date(), confidencial: noteConf,
      }, ...prev])
      setNoteText('')
      toast.success('Nota adicionada.')
    } catch { toast.error('Erro ao salvar nota.') }
    finally { setNoteSaving(false) }
  }

  async function handleCreateWarning() {
    if (!warnTitulo.trim() || !warnDesc.trim() || !id || !emp) return
    setWarnSaving(true)
    try {
      const newId = await createWarning({
        employeeId:  id,
        tipo:        warnTipo,
        titulo:      warnTitulo.trim(),
        descricao:   warnDesc.trim(),
        data:        new Date(),
        emissorNome: 'Sistema',
        assinado:    warnAssinado,
        resolvido:   false,
      })
      setWarns(prev => [{
        id: newId, employeeId: id, tipo: warnTipo,
        titulo: warnTitulo.trim(), descricao: warnDesc.trim(),
        data: new Date(), emissorNome: 'Sistema',
        assinado: warnAssinado, resolvido: false,
      }, ...prev])
      setEmp(prev => prev ? { ...prev, totalAvisos: prev.totalAvisos + 1 } : prev)
      setWarnTitulo(''); setWarnDesc(''); setWarnAssinado(false); setShowWarnForm(false)
      toast.success('Advertência registrada.')
    } catch { toast.error('Erro ao registrar advertência.') }
    finally { setWarnSaving(false) }
  }

  async function handleAddTimebankEntry() {
    const horas = Number(tbHoras)
    if (!id || !emp || !tbMotivo.trim() || !horas || horas <= 0) return
    setTbSaving(true)
    try {
      const novaData = new Date()
      const newId = await createTimebankEntry({
        employeeId:  id,
        tipo:        tbTipo,
        horas,
        motivo:      tbMotivo.trim(),
        data:        novaData,
        registradoPorNome: 'Sistema',
      })
      const saldoAnterior   = emp.saldoBancoHoras
      const delta           = tbTipo === 'credito' ? horas : -horas
      const saldoResultante = saldoAnterior + delta
      setTimebank(prev => [{
        id: newId, employeeId: id, tipo: tbTipo, horas,
        motivo: tbMotivo.trim(), data: novaData,
        saldoResultante, registradoPorNome: 'Sistema',
      }, ...prev])
      setEmp(prev => prev ? { ...prev, saldoBancoHoras: saldoResultante } : prev)
      setTbHoras(''); setTbMotivo(''); setTbTipo('credito'); setShowTbForm(false)
      toast.success('Lançamento registrado.')
    } catch { toast.error('Erro ao registrar lançamento.') }
    finally { setTbSaving(false) }
  }

  async function handleCreateRegistro() {
    if (!id || !emp || !regData) return
    const jornada = Number(regJornada) || 8
    const horasTrabalhadas = (regEntrada && regSaida)
      ? calcHorasFromTimes(regEntrada, regSaida, regInicioPausa || undefined, regFimPausa || undefined)
      : jornada
    const saldoDia = parseFloat((horasTrabalhadas - jornada).toFixed(2))
    setRegSaving(true)
    try {
      const dataObj = new Date(regData + 'T12:00:00')
      const newId = await createTimebankRegistro({
        employeeId:        id,
        data:              dataObj,
        entrada:           regEntrada     || undefined,
        inicioPausa:       regInicioPausa || undefined,
        fimPausa:          regFimPausa    || undefined,
        saida:             regSaida       || undefined,
        jornadaPrevista:   jornada,
        horasTrabalhadas,
        saldoDia,
        motivo:            regMotivo.trim() || undefined,
        status:            'pendente',
        registradoPorNome: 'Sistema',
      })
      setRegistros(prev => [{
        id: newId, employeeId: id, data: dataObj,
        entrada: regEntrada || undefined, inicioPausa: regInicioPausa || undefined,
        fimPausa: regFimPausa || undefined, saida: regSaida || undefined,
        jornadaPrevista: jornada, horasTrabalhadas, saldoDia,
        motivo: regMotivo.trim() || undefined, status: 'pendente',
        registradoPorNome: 'Sistema',
      }, ...prev])
      setRegData(''); setRegEntrada(''); setRegInicioPausa(''); setRegFimPausa('')
      setRegSaida(''); setRegMotivo(''); setShowRegForm(false)
      toast.success('Registro adicionado. Aguardando aprovação.')
    } catch { toast.error('Erro ao criar registro.') }
    finally { setRegSaving(false) }
  }

  async function handleApproveRegistro(reg: TimebankRegistro, action: StatusRegistroBH) {
    if (!id || !emp) return
    try {
      await approveTimebankRegistro(reg.id, id, reg.saldoDia, 'Sistema', action)
      setRegistros(prev => prev.map(r => r.id === reg.id ? { ...r, status: action } : r))
      if (action === 'aprovado') {
        const novoSaldo = parseFloat((emp.saldoBancoHoras + reg.saldoDia).toFixed(2))
        setEmp(prev => prev ? { ...prev, saldoBancoHoras: novoSaldo } : prev)
        getEmployeeTimebankEntries(id).then(setTimebank).catch(console.error)
        toast.success(`Aprovado! Saldo: ${fmtSaldo(novoSaldo)}`)
      } else {
        toast.success('Registro rejeitado.')
      }
    } catch { toast.error('Erro ao processar aprovação.') }
  }

  async function handleResolveWarning(warnId: string) {
    const res = window.prompt('Descreva a resolução desta advertência:')
    if (!res) return
    try {
      await resolveWarning(warnId, res)
      setWarns(prev => prev.map(w => w.id === warnId ? { ...w, resolvido: true, resolucao: res } : w))
      toast.success('Advertência marcada como resolvida.')
    } catch { toast.error('Erro ao resolver advertência.') }
  }

  async function handleDeactivate() {
    if (!id || !emp) return
    const motivo = window.prompt(`Confirma o desligamento de ${emp.nome}? Informe o motivo:`)
    if (!motivo) return
    try {
      await deactivateEmployee(id, motivo, 'Sistema')
      setEmp(prev => prev ? { ...prev, status: 'desligado' } : prev)
      toast.success('Colaborador desligado.')
    } catch { toast.error('Erro ao desligar colaborador.') }
  }

  if (loading) return <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
  if (!emp)    return null

  const perfMeta = STATUS_PERFORMANCE_META[emp.statusPerformance]
  const statMeta = STATUS_EMPLOYEE_META[emp.status]
  const vincMeta = TIPO_VINCULO_META[emp.tipoVinculo]
  const score360 = calcScore360(emp)
  const score360Meta = STATUS_PERFORMANCE_META[scoreToStatus(score360)]

  return (
    <div className={s.page}>

      {/* ── Hero card ── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.bigAvatar}>{emp.nome[0]?.toUpperCase()}</div>
          <div className={s.heroInfo}>
            <h1 className={s.heroName}>{emp.nome}</h1>
            <p className={s.heroCargo}>{emp.cargo} · {emp.setor}</p>
            <p className={s.heroMeta}>Matrícula {emp.matricula} · {vincMeta.label} · Turno {emp.turno}</p>
            <div className={s.heroBadges}>
              <span className={s.badge} style={{ color: statMeta.color, background: statMeta.bg }}>{statMeta.label}</span>
              <span className={s.badge} style={{ color: perfMeta.color, background: perfMeta.bg }}>{perfMeta.label}</span>
              <span className={s.badge} style={{ color: vincMeta.color, background: `${vincMeta.color}1a` }}>{vincMeta.label}</span>
            </div>
          </div>
        </div>
        <div className={s.heroStats}>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: perfMeta.color }}>{emp.scorePerformance}</div>
            <div className={s.heroStatLbl}>Score Avaliação</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: score360Meta.color }}>{score360}</div>
            <div className={s.heroStatLbl}>Score 360°</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal}>{emp.totalEvaluacoes}</div>
            <div className={s.heroStatLbl}>Avaliações</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: emp.totalAvisos > 0 ? '#dc2626' : 'inherit' }}>{emp.totalAvisos}</div>
            <div className={s.heroStatLbl}>Advertências</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: '#166534' }}>{emp.totalReconhecimentos}</div>
            <div className={s.heroStatLbl}>Reconhecimentos</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal}>{emp.totalDDSPresencas}</div>
            <div className={s.heroStatLbl}>DDI</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: emp.saldoBancoHoras >= 0 ? '#166534' : '#dc2626' }}>
              {emp.saldoBancoHoras > 0 ? '+' : ''}{emp.saldoBancoHoras}h
            </div>
            <div className={s.heroStatLbl}>Saldo BH</div>
          </div>
        </div>
        <div className={s.heroActions}>
          <Link to={`/colaboradores/${emp.id}/editar`} className={s.btnEdit}>✏️ Editar</Link>
          <Link to={`/colaboradores/${emp.id}/avaliacao`} className={s.btnEval}>📊 Nova Avaliação</Link>
          {emp.status === 'ativo' && (
            <button className={s.btnDeactivate} onClick={handleDeactivate}>Desligar</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        {([
          ['roadmap',     '🧭 Roadmap'],
          ['timeline',    '📅 Timeline'],
          ['avaliacoes',  '📊 Avaliações'],
          ['kpieval',     `📋 KPI${kpiEvals.length ? ` (${kpiEvals.length})` : ''}`],
          ['disciplinar', '⚠️ Disciplinar'],
          ['bancohoras',  '⏱️ Banco de Horas'],
          ['notas',       '📝 Notas do Supervisor'],
          ['seguranca',   '🛡️ Segurança'],
          ['documentos',  `📁 Documentos${docs.length ? ` (${docs.length})` : ''}`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`${s.tab} ${tab === t ? s.tabActive : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Jornada do Colaborador (Roadmap v2) ── */}
      {tab === 'roadmap' && (() => {
        const sortedStages = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const stageMap     = new Map(sortedStages.map(st => [st.stageId, st]))
        const concluidas   = sortedStages.filter(s => s.status === 'concluida').length
        const atrasadas    = sortedStages.filter(s => {
          const { slaStatus } = calcSlaStatus(s.status, s.dataInicio, s.slaDias)
          return slaStatus === 'atrasada'
        }).length
        const progressPct  = sortedStages.length > 0
          ? Math.round((concluidas / sortedStages.length) * 100) : 0
        const etapaAtual   = sortedStages.find(s => s.status !== 'concluida' && s.status !== 'cancelada' && s.status !== 'nao_aplicavel')
        const templateName = emp.roadmapTemplateId
          ? (templates.find(t => t.id === emp.roadmapTemplateId)?.name ?? '—')
          : 'Padrão (legado)'

        return (
        <div className={s.tabContent}>

          {/* ── Overview ── */}
          <div className={s.roadmapOverview}>
            <div className={s.roadmapOverviewHeader}>
              <div>
                <span className={s.roadmapOverviewTitle}>Jornada do Colaborador</span>
                <span className={s.rdmTemplBadge}>📋 {templateName}</span>
              </div>
              <span className={s.roadmapOverviewPct}>{progressPct}%</span>
            </div>
            <div className={s.roadmapProgressTrack}>
              <div className={s.roadmapProgressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={s.roadmapOverviewStats}>
              <span>🟢 <strong>{concluidas}</strong> concluídas</span>
              <span>🟡 <strong>{sortedStages.filter(s => s.status === 'em_andamento').length}</strong> em andamento</span>
              {atrasadas > 0 && <span style={{ color: '#dc2626' }}>⚠️ <strong>{atrasadas}</strong> atrasadas</span>}
              {etapaAtual && <span>📍 Atual: <strong>{etapaAtual.name ?? etapaAtual.stageId}</strong></span>}
            </div>
          </div>

          {/* ── Stepper ── */}
          <div className={s.roadmapStepper}>
            {sortedStages.map((st, idx) => {
              const stMeta   = STATUS_ETAPA_META[st.status]
              const { slaStatus } = calcSlaStatus(st.status, st.dataInicio, st.slaDias)
              const slaMeta  = SLA_STATUS_META[slaStatus]
              const isActive = selectedStageId === st.stageId
              return (
                <div key={st.stageId} className={s.roadmapNodeWrap}>
                  <button
                    type="button"
                    className={`${s.roadmapNode} ${isActive ? s.roadmapNodeActive : ''} ${justSavedId === st.stageId ? s.roadmapNodeFlash : ''}`}
                    onClick={() => selectStage(st.stageId)}
                  >
                    <div
                      className={`${s.roadmapCircle} ${st.status === 'em_andamento' ? s.roadmapCirclePulse : ''}`}
                      style={{
                        borderColor: stMeta.color,
                        background:  st.status === 'concluida' ? stMeta.color : stMeta.bg,
                        color:       st.status === 'concluida' ? '#fff' : stMeta.color,
                      }}
                    >
                      {st.status === 'concluida' ? '✓' : (st.icon ?? '📍')}
                    </div>
                    <span className={s.roadmapLabel}>{(st.order ?? idx + 1)}. {st.name ?? st.stageId}</span>
                    <span className={s.roadmapStatusBadge} style={{ color: stMeta.color, background: stMeta.bg }}>
                      {stMeta.icon} {stMeta.label}
                    </span>
                    {slaStatus !== 'nao_aplicavel' && (
                      <span className={s.rdmSlaChip} style={{ color: slaMeta.color, background: slaMeta.bg }}>
                        ⏱ {slaMeta.label}
                      </span>
                    )}
                    <span className={s.roadmapNodeDates}>
                      {fmtShort(st.dataInicio) && (
                        fmtShort(st.dataConclusao)
                          ? `${fmtShort(st.dataInicio)} → ${fmtShort(st.dataConclusao)}`
                          : `${fmtShort(st.dataInicio)} → ...`
                      )}
                    </span>
                  </button>
                  {idx < sortedStages.length - 1 && (
                    <div className={s.roadmapLine}
                      style={{ background: st.status === 'concluida' ? '#166534' : '#e2e8f0' }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Painel de detalhes da etapa ── */}
          {selectedStageId && (() => {
            const st = stageMap.get(selectedStageId)
            if (!st) return null
            const stMeta = STATUS_ETAPA_META[st.status]
            const { slaStatus, diasDecorridos, diasRestantes } = calcSlaStatus(st.status, st.dataInicio, st.slaDias)
            const slaMeta = SLA_STATUS_META[slaStatus]
            let duracaoLabel: string | null = null
            if (st.status === 'concluida' && st.dataInicio && st.dataConclusao) {
              const dias = daysBetween(st.dataInicio, st.dataConclusao)
              duracaoLabel = `Concluída em ${dias} dia${dias === 1 ? '' : 's'}`
            } else if (st.status === 'em_andamento' && st.dataInicio) {
              const dias = daysBetween(st.dataInicio, new Date())
              duracaoLabel = `Em andamento há ${dias} dia${dias === 1 ? '' : 's'}`
            }

            const checklistItems = stageForm.checklist ?? st.checklist ?? []
            const checkDone  = checklistItems.filter(c => c.done).length
            const checkTotal = checklistItems.length

            return (
              <div className={s.roadmapDetail}>
                <div className={s.roadmapDetailHeader}>
                  <div>
                    <h3 className={s.roadmapDetailTitle}>
                      {st.icon ?? '📍'} {st.order ?? ''}. {st.name ?? st.stageId}
                    </h3>
                    <p className={s.roadmapDetailDesc}>{st.descricao}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {duracaoLabel && <span className={s.roadmapDurationChip}>{duracaoLabel}</span>}
                    {slaStatus !== 'nao_aplicavel' && (
                      <span className={s.roadmapDurationChip} style={{ color: slaMeta.color, background: slaMeta.bg }}>
                        ⏱ {slaMeta.label}
                        {diasRestantes !== null && diasRestantes >= 0 && ` · ${diasRestantes}d restantes`}
                        {diasRestantes !== null && diasRestantes < 0 && ` · ${Math.abs(diasRestantes)}d atrasado`}
                        {diasDecorridos !== null && diasDecorridos >= 0 && ` · ${diasDecorridos}d decorridos`}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Botões de Ação Rápida ── */}
                <div className={s.rdmActionBar}>
                  {st.status === 'pendente' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnIniciar}`}
                      onClick={() => quickAction('em_andamento')}>
                      ▶ Iniciar Etapa
                    </button>
                  )}
                  {st.status === 'agendada' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnIniciar}`}
                      onClick={() => quickAction('em_andamento')}>
                      ▶ Iniciar Etapa
                    </button>
                  )}
                  {(st.status === 'em_andamento' || st.status === 'reaberta') && (<>
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnConcluir}`}
                      onClick={() => quickAction('concluida')}>
                      ✓ Concluir Etapa
                    </button>
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnPausar}`}
                      onClick={() => quickAction('pausada')}>
                      ⏸ Pausar
                    </button>
                  </>)}
                  {st.status === 'pausada' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnIniciar}`}
                      onClick={() => quickAction('em_andamento')}>
                      ▶ Retomar Etapa
                    </button>
                  )}
                  {st.status === 'concluida' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnReabrir}`}
                      onClick={() => quickAction('reaberta')}>
                      🔄 Reabrir Etapa
                    </button>
                  )}
                  {st.status === 'aguardando_aprovacao' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnConcluir}`}
                      onClick={() => quickAction('concluida')}>
                      ✓ Aprovar e Concluir
                    </button>
                  )}
                  {st.status !== 'nao_aplicavel' && st.status !== 'cancelada' && (
                    <button type="button" disabled={stageSaving}
                      className={`${s.rdmActionBtn} ${s.rdmBtnNa}`}
                      onClick={() => quickAction('nao_aplicavel')}>
                      — Não Aplicável
                    </button>
                  )}
                </div>

                <div className={s.roadmapDetailGrid}>
                  <div className={s.roadmapDetailMain}>
                    <div className={s.roadmapFormRow}>
                      <div className={s.docFormGroup}>
                        <label className={s.docLabel}>Status</label>
                        <select className={s.select} value={stageForm.status}
                          onChange={e => setStageForm(prev => ({ ...prev, status: e.target.value as StatusEtapa }))}>
                          {STATUS_ETAPA_ORDER.map(sv => (
                            <option key={sv} value={sv}>{STATUS_ETAPA_META[sv].icon} {STATUS_ETAPA_META[sv].label}</option>
                          ))}
                        </select>
                      </div>
                      <div className={s.docFormGroup}>
                        <label className={s.docLabel}>Data de Início</label>
                        <input type="date" className={s.docInput} value={stageForm.dataInicio}
                          onChange={e => setStageForm(prev => ({ ...prev, dataInicio: e.target.value }))} />
                      </div>
                      <div className={s.docFormGroup}>
                        <label className={s.docLabel}>Data de Conclusão</label>
                        <input type="date" className={s.docInput} value={stageForm.dataConclusao}
                          onChange={e => setStageForm(prev => ({ ...prev, dataConclusao: e.target.value }))} />
                      </div>
                      <div className={s.docFormGroup}>
                        <label className={s.docLabel}>Responsável</label>
                        <input className={s.docInput} value={stageForm.responsavel}
                          placeholder="Nome do responsável…"
                          onChange={e => setStageForm(prev => ({ ...prev, responsavel: e.target.value }))} />
                      </div>
                    </div>

                    <div className={s.docFormGroup}>
                      <label className={s.docLabel}>Observações</label>
                      <textarea className={s.textarea} rows={3} value={stageForm.observacoes}
                        placeholder="Anotações, evidências e detalhes sobre esta etapa…"
                        onChange={e => setStageForm(prev => ({ ...prev, observacoes: e.target.value }))} />
                    </div>

                    {/* Checklist */}
                    {checklistItems.length > 0 && (
                      <div className={s.rdmChecklist}>
                        <div className={s.rdmChecklistHeader}>
                          <span className={s.roadmapSectionTitle}>
                            ☑️ Checklist ({checkDone}/{checkTotal})
                          </span>
                          <div className={s.rdmCheckProgress}>
                            <div className={s.rdmCheckFill}
                              style={{ width: `${checkTotal > 0 ? Math.round(checkDone / checkTotal * 100) : 0}%` }} />
                          </div>
                        </div>
                        {checklistItems.map((item, ci) => (
                          <label key={item.itemId} className={s.rdmCheckItem}>
                            <input type="checkbox" checked={item.done}
                              onChange={() => {
                                const newList = [...checklistItems]
                                newList[ci] = { ...item, done: !item.done }
                                setStageForm(prev => ({ ...prev, checklist: newList }))
                              }} />
                            <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? '#94a3b8' : '#374151' }}>
                              {item.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={s.roadmapDetailSide}>
                    <h4 className={s.roadmapSectionTitle}>📎 Evidências (documentos)</h4>
                    {docs.length === 0 ? (
                      <p className={s.roadmapNoDocs}>Nenhum documento cadastrado. Adicione na aba "Documentos".</p>
                    ) : (
                      <div className={s.roadmapEvidList}>
                        {docs.map(doc => {
                          const docMeta = EMPLOYEE_DOC_META[doc.type]
                          return (
                            <label key={doc.id} className={s.roadmapEvidItem}>
                              <input type="checkbox"
                                checked={stageForm.evidencias.includes(doc.id)}
                                onChange={() => toggleEvidencia(doc.id)} />
                              {docMeta.icon} {doc.name}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <span className={s.badge} style={{ color: stMeta.color, background: stMeta.bg, fontSize: '0.78rem' }}>
                        {stMeta.icon} {stMeta.label}
                      </span>
                      {st.slaDias && (
                        <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>
                          SLA previsto: {st.slaDias} dias
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className={s.tabActions}>
                  <button className={s.btnPrimary} disabled={stageSaving} onClick={handleSaveStage}>
                    {stageSaving ? 'Salvando…' : '💾 Salvar Etapa'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* ── Auditoria ── */}
          <div className={s.rdmAuditSection}>
            <button className={s.rdmAuditToggle} onClick={() => {
              setShowAudit(v => !v)
              if (!showAudit && auditLog.length === 0 && id) {
                getRoadmapAudit(id).then(setAuditLog).catch(() => {})
              }
            }}>
              🔍 {showAudit ? 'Ocultar' : 'Ver'} Histórico de Alterações
              {auditLog.length > 0 && ` (${auditLog.length})`}
            </button>
            {showAudit && (
              auditLog.length === 0 ? (
                <p className={s.empty}>Nenhuma alteração registrada ainda.</p>
              ) : (
                <div className={s.rdmAuditList}>
                  {auditLog.map((entry, i) => (
                    <div key={entry.id ?? i} className={s.rdmAuditEntry}>
                      <div className={s.rdmAuditHeader}>
                        <span className={s.rdmAuditStage}>{entry.stageName}</span>
                        <span className={s.rdmAuditDate}>{fmt(entry.changedAt)} · {entry.changedBy}</span>
                      </div>
                      <div className={s.rdmAuditChange}>
                        <span className={s.rdmAuditField}>{entry.campo}</span>
                        {entry.valorAnterior && (
                          <><span className={s.rdmAuditOld}>{entry.valorAnterior}</span>
                          <span style={{ color: '#94a3b8' }}>→</span></>
                        )}
                        <span className={s.rdmAuditNew}>{entry.valorNovo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

        </div>
        )
      })()}

      {/* ── Tab: Timeline ── */}
      {tab === 'timeline' && (
        <div className={s.tabContent}>
          {history.length === 0 ? (
            <div className={s.empty}>Nenhum evento registrado.</div>
          ) : (
            <div className={s.timeline}>
              {history.map(ev => {
                const meta = TIPO_EVENTO_META[ev.tipo]
                return (
                  <div key={ev.id} className={`${s.timelineItem} ${ev.positivo ? s.positive : s.negative}`}>
                    <div className={s.timelineDot} style={{ background: ev.positivo ? '#166534' : '#dc2626' }}>
                      {meta.icon}
                    </div>
                    <div className={s.timelineBody}>
                      <div className={s.timelineHeader}>
                        <span className={s.timelineTitle}>{ev.titulo}</span>
                        <span className={s.timelineDate}>{fmt(ev.data)}</span>
                      </div>
                      <p className={s.timelineDesc}>{ev.descricao}</p>
                      <span className={s.timelinePor}>Por: {ev.registradoPor}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Avaliações ── */}
      {tab === 'avaliacoes' && (
        <div className={s.tabContent}>
          <div className={s.tabActions}>
            <Link to={`/colaboradores/${emp.id}/avaliacao`} className={s.btnPrimary}>+ Nova Avaliação</Link>
          </div>
          {evals.length === 0 ? (
            <div className={s.empty}>Nenhuma avaliação registrada.</div>
          ) : (
            <div className={s.evalList}>
              {evals.map(ev => {
                const meta = STATUS_PERFORMANCE_META[ev.status]
                return (
                  <div key={ev.id} className={s.evalCard}>
                    <div className={s.evalTop}>
                      <div>
                        <div className={s.evalPeriodo}>{ev.periodo}</div>
                        <div className={s.evalDate}>{fmt(ev.data)}</div>
                      </div>
                      {fmtScore(ev.score)}
                      <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                    </div>
                    {ev.comentarios && <p className={s.evalComent}>{ev.comentarios}</p>}
                    {ev.planoMelhoria && (
                      <div className={s.evalPlan}>
                        <strong>Plano de melhoria:</strong> {ev.planoMelhoria}
                      </div>
                    )}
                    <div className={s.evalAval}>Avaliador: {ev.avaliadorNome}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Avaliação KPI ── */}
      {tab === 'kpieval' && (
        <div className={s.tabContent}>
          <div className={s.tabActions}>
            <Link to={`/colaboradores/${emp.id}/avaliacao-kpi`} className={s.btnPrimary}>
              + Nova Avaliação KPI
            </Link>
          </div>
          {kpiEvals.length === 0 ? (
            <div className={s.empty}>Nenhuma avaliação KPI registrada.</div>
          ) : (
            <div className={s.evalList}>
              {kpiEvals.map(ev => {
                const pm     = PARECER_META[ev.parecer]
                const period = PERFORMANCE_PERIOD_META[ev.periodo]?.label ?? ev.periodo
                return (
                  <div key={ev.id} className={s.evalCard}>
                    <div className={s.evalTop}>
                      <div>
                        <div className={s.evalPeriodo}>{period}/{ev.ano}</div>
                        <div className={s.evalDate}>{fmt(ev.data)}</div>
                      </div>
                      <span style={{ fontSize: '1.4rem', fontWeight: 700, color: pm.color }}>
                        {ev.notaFinal.toFixed(1)}<span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>/10</span>
                      </span>
                      <span className={s.badge} style={{ color: pm.color, background: pm.bg }}>{pm.label}</span>
                      <Link
                        to={`/colaboradores/${emp.id}/avaliacao-kpi/${ev.id}`}
                        className={s.badge}
                        style={{ color: '#2563eb', background: 'rgba(37,99,235,0.1)', textDecoration: 'none' }}
                      >
                        Ver detalhes →
                      </Link>
                    </div>
                    {ev.observacoes && <p className={s.evalComent}>{ev.observacoes}</p>}
                    <div className={s.evalAval}>Avaliador: {ev.avaliadorNome}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Disciplinar ── */}
      {tab === 'disciplinar' && (
        <div className={s.tabContent}>

          {/* ── Formulário Nova Advertência ── */}
          {showWarnForm ? (
            <div className={s.noteForm}>
              <div className={s.noteFormTitle}>⚠️ Nova Advertência</div>
              <div className={s.noteFormRow}>
                <select className={s.select} value={warnTipo} onChange={e => setWarnTipo(e.target.value as TipoAviso)}>
                  <option value="verbal">Advertência Verbal</option>
                  <option value="escrito">Advertência Escrita</option>
                  <option value="suspensao">Suspensão</option>
                  <option value="conduta">Ocorrência de Conduta</option>
                  <option value="compliance">Falha de Compliance</option>
                </select>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={warnAssinado} onChange={e => setWarnAssinado(e.target.checked)} />
                  Colaborador assinou
                </label>
              </div>
              <input
                className={s.textarea}
                style={{ padding: '8px 12px', marginBottom: 8 }}
                placeholder="Título da advertência…"
                value={warnTitulo}
                onChange={e => setWarnTitulo(e.target.value)}
              />
              <textarea
                className={s.textarea} rows={3}
                placeholder="Descreva o motivo e os fatos que originaram a advertência…"
                value={warnDesc}
                onChange={e => setWarnDesc(e.target.value)}
              />
              <div className={s.noteFormRow} style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className={s.btnOutline} onClick={() => setShowWarnForm(false)}>Cancelar</button>
                <button
                  className={s.btnPrimary}
                  style={{ background: '#dc2626' }}
                  disabled={warnSaving || !warnTitulo.trim() || !warnDesc.trim()}
                  onClick={handleCreateWarning}
                >
                  {warnSaving ? 'Salvando…' : '⚠️ Registrar Advertência'}
                </button>
              </div>
            </div>
          ) : (
            <div className={s.tabActions}>
              <button className={s.btnPrimary} style={{ background: '#dc2626' }} onClick={() => setShowWarnForm(true)}>
                + Nova Advertência
              </button>
            </div>
          )}

          <div className={s.twoColTabs}>

            <div className={s.subSection}>
              <h3 className={s.subTitle}>⚠️ Advertências ({warns.length})</h3>
              {warns.length === 0 ? (
                <div className={s.empty}>Nenhuma advertência registrada.</div>
              ) : (
                warns.map(w => {
                  const meta = TIPO_AVISO_META[w.tipo]
                  return (
                    <div key={w.id} className={s.disciplCard}>
                      <div className={s.disciplTop}>
                        <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                        <span className={s.disciplDate}>{fmt(w.data)}</span>
                        {w.resolvido && <span className={s.resolvedBadge}>✓ Resolvida</span>}
                      </div>
                      <div className={s.disciplTitle}>{w.titulo}</div>
                      <p className={s.disciplDesc}>{w.descricao}</p>
                      {w.resolucao && <p className={s.resolucao}>Resolução: {w.resolucao}</p>}
                      <div className={s.disciplMeta}>Emitido por: {w.emissorNome}</div>
                      {!w.resolvido && (
                        <button className={s.btnResolve} onClick={() => handleResolveWarning(w.id)}>
                          ✓ Marcar como resolvida
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className={s.subSection}>
              <h3 className={s.subTitle}>🏆 Reconhecimentos ({reconhs.length})</h3>
              {reconhs.length === 0 ? (
                <div className={s.empty}>Nenhum reconhecimento registrado.</div>
              ) : (
                reconhs.map(r => {
                  const meta = TIPO_RECONHECIMENTO_META[r.tipo]
                  return (
                    <div key={r.id} className={s.reconhCard}>
                      <div className={s.reconhTop}>
                        <span className={s.reconhIcon}>{meta.icon}</span>
                        <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                        <span className={s.disciplDate}>{fmt(r.data)}</span>
                      </div>
                      <div className={s.disciplTitle}>{r.titulo}</div>
                      <p className={s.disciplDesc}>{r.descricao}</p>
                      <div className={s.disciplMeta}>Por: {r.emissorNome} {r.publico ? '· público' : '· privado'}</div>
                    </div>
                  )
                })
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Tab: Banco de Horas ── */}
      {tab === 'bancohoras' && (() => {
        const now         = new Date()
        const startMes    = new Date(now.getFullYear(), now.getMonth(), 1)
        const creditosMes = timebank.filter(t => t.data >= startMes && t.tipo === 'credito').reduce((s, t) => s + t.horas, 0)
        const debitosMes  = timebank.filter(t => t.data >= startMes && t.tipo === 'debito').reduce((s, t) => s + t.horas, 0)
        const pendentes   = registros.filter(r => r.status === 'pendente').length

        const regHorasTrab = (regEntrada && regSaida)
          ? calcHorasFromTimes(regEntrada, regSaida, regInicioPausa || undefined, regFimPausa || undefined)
          : null
        const regSaldoPrev = regHorasTrab !== null ? parseFloat((regHorasTrab - Number(regJornada || 8)).toFixed(2)) : null

        return (
        <div className={s.tabContent}>

          {/* ── KPI cards ── */}
          <div className={s.bhKpiBar}>
            <div className={s.bhKpiCard}>
              <div className={s.bhKpiVal} style={{ color: emp.saldoBancoHoras >= 0 ? '#166534' : '#dc2626' }}>
                {fmtSaldo(emp.saldoBancoHoras)}
              </div>
              <div className={s.bhKpiLbl}>Saldo Atual</div>
            </div>
            <div className={s.bhKpiCard}>
              <div className={s.bhKpiVal} style={{ color: '#166534' }}>{fmtSaldo(creditosMes)}</div>
              <div className={s.bhKpiLbl}>Créditos no Mês</div>
            </div>
            <div className={s.bhKpiCard}>
              <div className={s.bhKpiVal} style={{ color: '#dc2626' }}>{fmtSaldo(debitosMes)}</div>
              <div className={s.bhKpiLbl}>Débitos no Mês</div>
            </div>
            <div className={s.bhKpiCard}>
              <div className={s.bhKpiVal} style={{ color: pendentes > 0 ? '#d97706' : '#94a3b8' }}>{pendentes}</div>
              <div className={s.bhKpiLbl}>Aguard. Aprovação</div>
            </div>
          </div>

          {/* ── Sub-tabs ── */}
          <div className={s.bhSubTabs}>
            <button className={bhSubTab === 'registros'   ? s.bhSubTabActive : s.bhSubTabBtn} onClick={() => setBhSubTab('registros')}>
              📋 Registros de Ponto
            </button>
            <button className={bhSubTab === 'lancamentos' ? s.bhSubTabActive : s.bhSubTabBtn} onClick={() => setBhSubTab('lancamentos')}>
              ✏️ Lançamentos Manuais
            </button>
          </div>

          {/* ── Sub-tab: Registros de Ponto ── */}
          {bhSubTab === 'registros' && (
            <>
              {showRegForm ? (
                <div className={s.noteForm}>
                  <div className={s.noteFormTitle}>📋 Registrar Ponto</div>

                  <div className={s.noteFormRow}>
                    <div style={{ flex: 1 }}>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Data *</div>
                      <input type="date" className={s.docInput} value={regData}
                        onChange={e => setRegData(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Jornada Prevista (h)</div>
                      <input type="number" min="1" max="12" step="0.5" className={s.docInput}
                        value={regJornada} onChange={e => setRegJornada(e.target.value)} />
                    </div>
                  </div>

                  <div className={s.bhTimeGrid}>
                    <div>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Entrada</div>
                      <input type="time" className={s.docInput} value={regEntrada}
                        onChange={e => setRegEntrada(e.target.value)} />
                    </div>
                    <div>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Início Pausa</div>
                      <input type="time" className={s.docInput} value={regInicioPausa}
                        onChange={e => setRegInicioPausa(e.target.value)} />
                    </div>
                    <div>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Fim Pausa</div>
                      <input type="time" className={s.docInput} value={regFimPausa}
                        onChange={e => setRegFimPausa(e.target.value)} />
                    </div>
                    <div>
                      <div className={s.docLabel} style={{ marginBottom: 4 }}>Saída</div>
                      <input type="time" className={s.docInput} value={regSaida}
                        onChange={e => setRegSaida(e.target.value)} />
                    </div>
                  </div>

                  {regHorasTrab !== null && regSaldoPrev !== null && (
                    <div className={s.bhCalcPreview}>
                      <div className={s.bhCalcItem}>
                        <div className={s.bhCalcVal}>{regHorasTrab.toFixed(2)}h</div>
                        <div className={s.bhCalcLbl}>Horas Trabalhadas</div>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>−</div>
                      <div className={s.bhCalcItem}>
                        <div className={s.bhCalcVal}>{regJornada}h</div>
                        <div className={s.bhCalcLbl}>Jornada Prevista</div>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '1.2rem' }}>=</div>
                      <div className={s.bhCalcItem}>
                        <div className={s.bhCalcVal} style={{ color: regSaldoPrev >= 0 ? '#166534' : '#dc2626', fontSize: '1.3rem' }}>
                          {fmtSaldo(regSaldoPrev)}
                        </div>
                        <div className={s.bhCalcLbl}>Saldo do Dia</div>
                      </div>
                    </div>
                  )}

                  <textarea className={s.textarea} rows={2} value={regMotivo}
                    placeholder="Observações (opcional)…"
                    onChange={e => setRegMotivo(e.target.value)} />

                  <div className={s.noteFormRow} style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button className={s.btnOutline} onClick={() => setShowRegForm(false)}>Cancelar</button>
                    <button className={s.btnPrimary} disabled={regSaving || !regData}
                      onClick={handleCreateRegistro}>
                      {regSaving ? 'Salvando…' : '📋 Registrar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={s.tabActions}>
                  <button className={s.btnPrimary} onClick={() => setShowRegForm(true)}>
                    + Registrar Ponto
                  </button>
                </div>
              )}

              {registros.length === 0 ? (
                <div className={s.empty}>Nenhum registro de ponto.</div>
              ) : (
                <div className={s.bhTable}>
                  <table className={s.bhTableEl}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Entrada → Saída</th>
                        <th>Trabalhadas</th>
                        <th>Jornada</th>
                        <th>Saldo Dia</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.map(reg => {
                        const meta   = STATUS_REGISTRO_BH_META[reg.status]
                        const horStr = reg.entrada && reg.saida
                          ? `${reg.entrada} → ${reg.saida}${reg.inicioPausa && reg.fimPausa ? ` (pausa ${reg.inicioPausa}–${reg.fimPausa})` : ''}`
                          : '—'
                        return (
                          <tr key={reg.id}>
                            <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(reg.data)}</td>
                            <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{horStr}</td>
                            <td>{reg.horasTrabalhadas.toFixed(2)}h</td>
                            <td>{reg.jornadaPrevista}h</td>
                            <td>
                              <span className={reg.saldoDia >= 0 ? s.bhSaldoPos : s.bhSaldoNeg}>
                                {fmtSaldo(reg.saldoDia)}
                              </span>
                            </td>
                            <td>
                              <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                            <td>
                              {reg.status === 'pendente' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className={`${s.bhActBtn} ${s.bhApproveBtn}`}
                                    onClick={() => handleApproveRegistro(reg, 'aprovado')}>
                                    ✅ Aprovar
                                  </button>
                                  <button className={`${s.bhActBtn} ${s.bhRejectBtn}`}
                                    onClick={() => handleApproveRegistro(reg, 'rejeitado')}>
                                    ❌ Rejeitar
                                  </button>
                                </div>
                              )}
                              {reg.status !== 'pendente' && reg.aprovadoPorNome && (
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                  por {reg.aprovadoPorNome}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Sub-tab: Lançamentos Manuais ── */}
          {bhSubTab === 'lancamentos' && (
            <>
              {showTbForm ? (
                <div className={s.noteForm}>
                  <div className={s.noteFormTitle}>✏️ Lançamento Manual</div>
                  <div className={s.noteFormRow}>
                    <select className={s.select} value={tbTipo}
                      onChange={e => setTbTipo(e.target.value as TipoLancamentoBancoHoras)}>
                      <option value="credito">Crédito (horas extras)</option>
                      <option value="debito">Débito (compensação / falta)</option>
                    </select>
                    <input type="number" min="0" step="0.5" className={s.textarea}
                      style={{ padding: '8px 12px' }} placeholder="Horas"
                      value={tbHoras} onChange={e => setTbHoras(e.target.value)} />
                  </div>
                  <textarea className={s.textarea} rows={3}
                    placeholder="Motivo do lançamento…" value={tbMotivo}
                    onChange={e => setTbMotivo(e.target.value)} />
                  <div className={s.noteFormRow} style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button className={s.btnOutline} onClick={() => setShowTbForm(false)}>Cancelar</button>
                    <button className={s.btnPrimary}
                      disabled={tbSaving || !tbMotivo.trim() || !Number(tbHoras) || Number(tbHoras) <= 0}
                      onClick={handleAddTimebankEntry}>
                      {tbSaving ? 'Salvando…' : '✏️ Lançar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={s.tabActions}>
                  <button className={s.btnPrimary} onClick={() => setShowTbForm(true)}>
                    + Novo Lançamento
                  </button>
                </div>
              )}

              {timebank.length === 0 ? (
                <div className={s.empty}>Nenhum lançamento registrado.</div>
              ) : (
                timebank.map(t => {
                  const meta = TIPO_LANCAMENTO_BH_META[t.tipo]
                  return (
                    <div key={t.id} className={s.disciplCard}>
                      <div className={s.disciplTop}>
                        <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>
                          {meta.icon} {meta.label} · {t.horas}h
                        </span>
                        <span className={s.disciplDate}>{fmt(t.data)}</span>
                      </div>
                      <p className={s.disciplDesc}>{t.motivo}</p>
                      <div className={s.disciplMeta}>
                        Por: {t.registradoPorNome}
                        {t.saldoResultante !== undefined && (
                          <> · Saldo: <strong>{fmtSaldo(t.saldoResultante)}</strong></>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </>
          )}

        </div>
        )
      })()}

      {/* ── Tab: Notas do Supervisor ── */}
      {tab === 'notas' && (
        <div className={s.tabContent}>
          <div className={s.noteForm}>
            <div className={s.noteFormTitle}>Nova observação</div>
            <div className={s.noteFormRow}>
              <select className={s.select} value={noteCat} onChange={e => setNoteCat(e.target.value as CategoriaNota)}>
                <option value="geral">Geral</option>
                <option value="comportamento">Comportamento</option>
                <option value="desempenho">Desempenho</option>
                <option value="presenca">Presença</option>
                <option value="seguranca">Segurança</option>
                <option value="desenvolvimento">Desenvolvimento</option>
              </select>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={notePos} onChange={e => setNotePos(e.target.checked)} /> Observação positiva
              </label>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={noteConf} onChange={e => setNoteConf(e.target.checked)} /> Confidencial
              </label>
            </div>
            <textarea className={s.textarea} rows={3} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Descreva a observação…" />
            <button className={s.btnPrimary} disabled={noteSaving || !noteText.trim()} onClick={handleAddNote}>
              {noteSaving ? 'Salvando…' : 'Adicionar nota'}
            </button>
          </div>

          {notes.length === 0 ? (
            <div className={s.empty}>Nenhuma nota registrada.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} className={`${s.noteCard} ${n.positivo ? s.notePositive : s.noteNegative}`}>
                <div className={s.noteTop}>
                  <span className={s.noteCat}>{n.categoria}</span>
                  {n.confidencial && <span className={s.confBadge}>🔒 Confidencial</span>}
                  <span className={s.disciplDate}>{fmt(n.data)}</span>
                </div>
                <p className={s.noteText}>{n.nota}</p>
                <div className={s.disciplMeta}>Por: {n.supervisorNome}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Segurança ── */}
      {tab === 'seguranca' && (
        <div className={s.tabContent}>
          <div className={s.safetyGrid}>
            <div className={s.safetyCard}>
              <span className={s.safetyIcon}>📢</span>
              <div className={s.safetyVal}>{emp.totalDDSPresencas}</div>
              <div className={s.safetyLbl}>Presenças em DDI</div>
              <Link to={`/seguranca/dds`} className={s.safetyLink}>Ver DDI →</Link>
            </div>
            <div className={s.safetyCard}>
              <span className={s.safetyIcon}>🦺</span>
              <div className={s.safetyVal}>{emp.totalEpisAtivos}</div>
              <div className={s.safetyLbl}>EPIs Ativos</div>
              <Link to={`/seguranca/epi`} className={s.safetyLink}>Ver Ficha EPI →</Link>
            </div>
            <div className={s.safetyCard} style={{ borderColor: emp.totalIncidentesSeg > 0 ? '#dc2626' : undefined }}>
              <span className={s.safetyIcon}>🚨</span>
              <div className={s.safetyVal} style={{ color: emp.totalIncidentesSeg > 0 ? '#dc2626' : 'inherit' }}>{emp.totalIncidentesSeg}</div>
              <div className={s.safetyLbl}>Incidentes de Segurança</div>
              <Link to={`/seguranca/ocorrencias`} className={s.safetyLink}>Ver Ocorrências →</Link>
            </div>
          </div>
          <div className={s.safetyInfo}>
            <p>Os contadores de segurança são atualizados automaticamente pelos módulos de DDS, EPI e Ocorrências quando este colaborador é vinculado por <strong>ID</strong>.</p>
          </div>
        </div>
      )}

      {/* ── Tab: Documentos ── */}
      {tab === 'documentos' && (
        <div className={s.tabContent}>

          <div className={s.docHeader}>
            <div className={s.docHeaderLeft}>
              <span className={s.docCount}>{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
              {(emp.totalCertificacoesVencidas > 0 || emp.totalCertificacoesAVencer > 0) && (
                <div className={s.certAlertRow}>
                  {emp.totalCertificacoesVencidas > 0 && (
                    <span className={s.certAlertBadge} style={{ color: STATUS_CERTIFICACAO_META.vencido.color, background: STATUS_CERTIFICACAO_META.vencido.bg }}>
                      {STATUS_CERTIFICACAO_META.vencido.icon} {emp.totalCertificacoesVencidas} vencida{emp.totalCertificacoesVencidas !== 1 ? 's' : ''}
                    </span>
                  )}
                  {emp.totalCertificacoesAVencer > 0 && (
                    <span className={s.certAlertBadge} style={{ color: STATUS_CERTIFICACAO_META.a_vencer.color, background: STATUS_CERTIFICACAO_META.a_vencer.bg }}>
                      {STATUS_CERTIFICACAO_META.a_vencer.icon} {emp.totalCertificacoesAVencer} a vencer
                    </span>
                  )}
                </div>
              )}
            </div>
            <button className={s.btnDocUpload} onClick={() => setShowDocModal(true)}>
              + Adicionar Documento
            </button>
          </div>

          {docs.length === 0 ? (
            <div className={s.empty}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📁</div>
              <p>Nenhum documento cadastrado ainda.</p>
              <button className={s.btnDocUpload} onClick={() => setShowDocModal(true)}>
                + Adicionar primeiro documento
              </button>
            </div>
          ) : (
            <div className={s.docList}>
              {docs.map(d => {
                const meta = EMPLOYEE_DOC_META[d.type]
                const isImg = d.fileType.startsWith('image/')
                const certStatus = computeCertStatus(d.dataValidade)
                const certMeta = certStatus ? STATUS_CERTIFICACAO_META[certStatus] : null
                return (
                  <div key={d.id} className={s.docCard}>
                    <div className={s.docCardIcon} style={{ background: meta.color + '14', color: meta.color }}>
                      {meta.icon}
                    </div>
                    <div className={s.docCardBody}>
                      <div className={s.docCardName}>{d.name}</div>
                      <div className={s.docCardMeta}>
                        <span className={s.docTypeBadge} style={{ color: meta.color, background: meta.color + '14' }}>
                          {meta.label}
                        </span>
                        <span className={s.docFilename}>{d.fileName}</span>
                        <span className={s.docSize}>{fmtFileSize(d.fileSize)}</span>
                        {d.uploadedAt && (
                          <span className={s.docDate}>{d.uploadedAt.toLocaleDateString('pt-BR')}</span>
                        )}
                      </div>
                      {(d.dataRealizacao || d.dataValidade) && (
                        <div className={s.docCardMeta}>
                          {d.dataRealizacao && (
                            <span className={s.docValidadeInfo}>Realizado: {d.dataRealizacao.toLocaleDateString('pt-BR')}</span>
                          )}
                          {d.dataValidade && certMeta && (
                            <span className={s.certBadge} style={{ color: certMeta.color, background: certMeta.bg }}>
                              {certMeta.icon} {certStatus === 'vencido' ? 'Vencido em' : 'Válido até'} {d.dataValidade.toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={s.docCardActions}>
                      {isImg && (
                        <button className={s.docActionBtn} onClick={() => setLightboxUrl(d.fileUrl)} title="Visualizar">
                          🔍
                        </button>
                      )}
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={s.docActionBtn}
                        title="Abrir / Baixar"
                      >
                        ⬇️
                      </a>
                      <button
                        className={`${s.docActionBtn} ${s.docActionDelete}`}
                        onClick={() => handleDocDelete(d)}
                        title="Remover"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de upload ── */}
      {showDocModal && (
        <div className={s.docOverlay} onClick={e => e.target === e.currentTarget && resetDocModal()}>
          <div className={s.docModal}>
            <div className={s.docModalHeader}>
              <h3 className={s.docModalTitle}>📁 Adicionar Documento</h3>
              <button className={s.docModalClose} onClick={resetDocModal}>×</button>
            </div>
            <div className={s.docModalBody}>
              <div className={s.docFormGroup}>
                <label className={s.docLabel}>Tipo de Documento *</label>
                <select className={s.docInput} value={docType}
                  onChange={e => setDocType(e.target.value as EmployeeDocumentType)}>
                  {(Object.keys(EMPLOYEE_DOC_META) as EmployeeDocumentType[]).map(k => (
                    <option key={k} value={k}>
                      {EMPLOYEE_DOC_META[k].icon} {EMPLOYEE_DOC_META[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={s.docFormGroup}>
                <label className={s.docLabel}>Nome / Descrição *</label>
                <input className={s.docInput} placeholder="Ex: NR-35 Trabalho em Altura, Contrato de admissão 2024…"
                  value={docName} onChange={e => setDocName(e.target.value)} />
              </div>
              <div className={s.docFormRow}>
                <div className={s.docFormGroup}>
                  <label className={s.docLabel}>Data de realização</label>
                  <input type="date" className={s.docInput}
                    value={docDataRealizacao} onChange={e => setDocDataRealizacao(e.target.value)} />
                </div>
                <div className={s.docFormGroup}>
                  <label className={s.docLabel}>Data de validade</label>
                  <input type="date" className={s.docInput}
                    value={docDataValidade} onChange={e => setDocDataValidade(e.target.value)} />
                </div>
              </div>
              <div className={s.docFormGroup}>
                <label className={s.docLabel}>Arquivo *</label>
                <label className={s.docUploadZone}>
                  <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                    onChange={handleDocFileChange} />
                  {docFile ? (
                    <div className={s.docFileSelected}>
                      <span>📎 {docFile.name}</span>
                      <span style={{ color: '#8898AA', fontSize: '0.75rem' }}>
                        {fmtFileSize(docFile.size)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.5rem' }}>📂</span>
                      <span style={{ fontWeight: 600 }}>Clique para selecionar</span>
                      <span style={{ fontSize: '0.72rem', color: '#8898AA' }}>
                        Imagens ou PDF · máx. 20 MB
                      </span>
                    </>
                  )}
                </label>
                {docPreview && (
                  <img src={docPreview} alt="Preview" className={s.docPreviewImg} />
                )}
              </div>
            </div>
            <div className={s.docModalFooter}>
              <button className={s.docBtnCancel} onClick={resetDocModal}>Cancelar</button>
              <button
                className={s.docBtnSave}
                disabled={docUploading || !docFile}
                onClick={handleDocUpload}
              >
                {docUploading ? 'Enviando…' : 'Salvar Documento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div className={s.docLightbox} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} className={s.docLightboxImg} alt="Documento ampliado" />
          <button className={s.docLightboxClose} onClick={() => setLightboxUrl(null)}>×</button>
        </div>
      )}

    </div>
  )
}
