import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEPIFicha, addEPIEntrega, createEPIFicha } from '@/lib/db-safety'
import { getEmployees } from '@/lib/db-employees'
import { useStore } from '@/store/useStore'
import type { EPIFicha, EPIEntrega, NivelRisco } from '@/types/safety'
import type { Employee } from '@/types/employee'
import { STATUS_FICHA_META, SETORES_FABRICA } from '@/types/safety'
import { EPI_CATALOG } from '@/data/epi-catalog'
import { toast } from '@/components/ui/Toast'
import s from './EPIFichaPage.module.css'

// ── helpers ───────────────────────────────────────────
function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}
function isExpired(d: Date | undefined): boolean {
  return !!d && d < new Date()
}
function isExpiringSoon(d: Date | undefined): boolean {
  if (!d) return false
  const now = new Date()
  return d > now && d < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
}

// ── SVG icons ─────────────────────────────────────────
const Ic = {
  Back:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Search:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  User:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Check:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  Plus:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  X:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Shield:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  HardHat: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>,
  Alert:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Info:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
}

const RISCO_META: Record<NivelRisco, { label: string; color: string; bg: string }> = {
  baixo:   { label: 'Risco Baixo',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  medio:   { label: 'Risco Médio',   color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  alto:    { label: 'Risco Alto',    color: '#ea580c', bg: 'rgba(234,88,12,0.1)' },
  critico: { label: 'Risco Crítico', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

const EMPTY_ENTREGA = {
  epiId: '', epiNome: '', numeroCa: '', quantidade: 1,
  condicao: 'novo' as EPIEntrega['condicao'],
  areaObrigatoria: '', assinaturaColaborador: false,
  assinaturaResponsavel: false, responsavelNome: '',
  observacoes: '', dataVencimentoStr: '',
}

const EMPTY_NEW_FORM = {
  colaboradorNome: '', matricula: '', departamento: '',
  setor: '' as EPIFicha['setor'], funcao: '', supervisor: '',
  dataAdmissao: '', classificacaoRisco: 'medio' as NivelRisco, observacoes: '',
}

// ══════════════════════════════════════════════════════
export default function EPIFichaPage() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id: string }>()
  const user     = useStore(st => st.user)
  const isNew    = !id

  // Ficha view state
  const [ficha,      setFicha]      = useState<EPIFicha | null>(null)
  const [loading,    setLoading]    = useState(!isNew)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [activeTab,  setActiveTab]  = useState<'entregas' | 'info'>('entregas')
  const [entrega,    setEntrega]    = useState(EMPTY_ENTREGA)

  // New ficha state
  const [employees,   setEmployees]   = useState<Employee[]>([])
  const [empSearch,   setEmpSearch]   = useState('')
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [newForm,     setNewForm]     = useState(EMPTY_NEW_FORM)
  const [newSaving,   setNewSaving]   = useState(false)
  const [empLoading,  setEmpLoading]  = useState(false)

  // Load employees for new form
  useEffect(() => {
    if (!isNew) return
    setEmpLoading(true)
    getEmployees().then(setEmployees).catch(() => {}).finally(() => setEmpLoading(false))
  }, [isNew])

  // Load existing ficha
  useEffect(() => {
    if (!id) return
    getEPIFicha(id).then(f => {
      if (!f) { toast.error('Ficha não encontrada.'); navigate('/seguranca/epi'); return }
      setFicha(f)
    }).catch(() => toast.error('Erro ao carregar ficha.'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  // Filter employees by search
  const filteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase()
    if (!q) return employees.slice(0, 30)
    return employees.filter(e =>
      e.nome.toLowerCase().includes(q) || e.matricula.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [employees, empSearch])

  function selectEmployee(emp: Employee) {
    setSelectedEmp(emp)
    setEmpSearch(emp.nome)
    setNewForm(prev => ({
      ...prev,
      colaboradorNome: emp.nome,
      matricula:       emp.matricula,
      departamento:    emp.departamento ?? '',
      setor:           emp.setor,
      funcao:          emp.cargo,
      supervisor:      emp.supervisor ?? '',
      dataAdmissao:    emp.dataAdmissao
        ? emp.dataAdmissao.toISOString().split('T')[0]
        : prev.dataAdmissao,
    }))
  }

  function setNF<K extends keyof typeof EMPTY_NEW_FORM>(k: K, v: typeof EMPTY_NEW_FORM[K]) {
    setNewForm(prev => ({ ...prev, [k]: v }))
  }

  function setE(k: keyof typeof EMPTY_ENTREGA, v: unknown) {
    setEntrega(prev => ({ ...prev, [k]: v }))
  }

  function handleEPISelect(epiId: string) {
    const item = EPI_CATALOG.flatMap(c => c.itens).find(e => e.id === epiId)
    if (!item) return
    const venc = item.vidaUtilMeses > 0
      ? new Date(Date.now() + item.vidaUtilMeses * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : ''
    setEntrega(prev => ({
      ...prev, epiId: item.id, epiNome: item.nome, numeroCa: item.numeroCaRef,
      areaObrigatoria: item.areas[0] ?? '', dataVencimentoStr: venc,
    }))
  }

  async function handleCreateFicha() {
    if (!newForm.colaboradorNome.trim()) { toast.error('Selecione ou informe o colaborador.'); return }
    if (!newForm.matricula.trim())       { toast.error('Matrícula é obrigatória.'); return }
    if (!newForm.setor)                  { toast.error('Setor é obrigatório.'); return }
    if (!newForm.funcao.trim())          { toast.error('Função/Cargo é obrigatório.'); return }

    setNewSaving(true)
    try {
      const newId = await createEPIFicha({
        colaboradorNome:    newForm.colaboradorNome.trim(),
        matricula:          newForm.matricula.trim(),
        departamento:       newForm.departamento.trim(),
        setor:              newForm.setor,
        funcao:             newForm.funcao.trim(),
        supervisor:         newForm.supervisor.trim(),
        dataAdmissao:       newForm.dataAdmissao
          ? new Date(newForm.dataAdmissao + 'T12:00:00')
          : undefined,
        classificacaoRisco: newForm.classificacaoRisco,
        entregas:           [],
        ativo:              true,
        observacoes:        newForm.observacoes.trim() || undefined,
      })
      toast.success('Ficha EPI criada!')
      navigate(`/seguranca/epi/${newId}`)
    } catch { toast.error('Erro ao criar ficha.') }
    finally { setNewSaving(false) }
  }

  async function handleAddEntrega() {
    if (!entrega.epiId && !entrega.epiNome.trim()) { toast.error('Selecione ou informe o EPI.'); return }
    setSaving(true)
    try {
      const newEntrega: EPIEntrega = {
        id:                    crypto.randomUUID(),
        epiId:                 entrega.epiId,
        epiNome:               entrega.epiNome,
        numeroCa:              entrega.numeroCa,
        dataEntrega:           new Date(),
        dataVencimento:        entrega.dataVencimentoStr
          ? new Date(entrega.dataVencimentoStr + 'T12:00:00')
          : undefined,
        quantidade:            entrega.quantidade,
        condicao:              entrega.condicao,
        areaObrigatoria:       entrega.areaObrigatoria,
        assinaturaColaborador: entrega.assinaturaColaborador,
        assinaturaResponsavel: entrega.assinaturaResponsavel,
        responsavelNome:       entrega.responsavelNome || undefined,
        observacoes:           entrega.observacoes || undefined,
      }
      await addEPIEntrega(id!, newEntrega)
      const updated = await getEPIFicha(id!)
      setFicha(updated)
      setShowForm(false)
      setEntrega(EMPTY_ENTREGA)
      toast.success('EPI registrado.')
    } catch { toast.error('Erro ao registrar entrega.') }
    finally { setSaving(false) }
  }

  // ── MODO NOVO ─────────────────────────────────────────
  if (isNew) {
    const riskMeta = RISCO_META[newForm.classificacaoRisco]

    return (
      <div className={s.page}>

        {/* Breadcrumb */}
        <div className={s.breadcrumb}>
          <button className={s.backBtn} onClick={() => navigate('/seguranca/epi')}>
            <Ic.Back /> Controle de EPI
          </button>
          <span className={s.breadSep}>/</span>
          <span className={s.breadCurrent}>Nova Ficha</span>
        </div>

        <div className={s.newPageWrap}>

          {/* Left: employee search */}
          <div className={s.newCard}>
            <div className={s.newCardHeader}>
              <div className={s.newCardIconWrap} style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
                <Ic.User />
              </div>
              <div>
                <div className={s.newCardTitle}>Selecionar Colaborador</div>
                <div className={s.newCardSub}>Busque pelo nome ou matrícula</div>
              </div>
            </div>

            <div className={s.empSearchWrap}>
              <span className={s.empSearchIcon}><Ic.Search /></span>
              <input
                className={s.empSearchInput}
                placeholder="Buscar colaborador…"
                value={empSearch}
                onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(null) }}
                autoFocus
              />
              {empSearch && (
                <button className={s.empSearchClear} onClick={() => { setEmpSearch(''); setSelectedEmp(null) }}>
                  <Ic.X />
                </button>
              )}
            </div>

            {empLoading ? (
              <div className={s.empLoadingMsg}>Carregando colaboradores…</div>
            ) : (
              <div className={s.empList}>
                {filteredEmps.length === 0 && empSearch && (
                  <div className={s.empEmpty}>Nenhum colaborador encontrado.</div>
                )}
                {filteredEmps.length === 0 && !empSearch && (
                  <div className={s.empEmpty}>
                    {employees.length === 0
                      ? 'Nenhum colaborador cadastrado no sistema.'
                      : 'Digite para buscar colaboradores.'}
                  </div>
                )}
                {filteredEmps.map(emp => {
                  const isSelected = selectedEmp?.id === emp.id
                  return (
                    <button
                      key={emp.id}
                      className={`${s.empItem} ${isSelected ? s.empItemSelected : ''}`}
                      onClick={() => selectEmployee(emp)}
                    >
                      <div className={s.empItemAvatar} style={{
                        background: isSelected ? 'rgba(217,119,6,0.15)' : 'rgba(100,116,139,0.1)',
                        color: isSelected ? '#d97706' : '#64748b',
                      }}>
                        {emp.nome[0]?.toUpperCase()}
                      </div>
                      <div className={s.empItemInfo}>
                        <div className={s.empItemName}>{emp.nome}</div>
                        <div className={s.empItemMeta}>
                          <span className={s.empItemMat}>{emp.matricula}</span>
                          <span className={s.empItemDot}>·</span>
                          <span>{emp.cargo}</span>
                          <span className={s.empItemDot}>·</span>
                          <span>{emp.setor}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className={s.empItemCheck}><Ic.Check /></span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: form */}
          <div className={s.newFormSide}>

            {/* Selected employee preview */}
            {selectedEmp && (
              <div className={s.selectedEmpCard}>
                <div className={s.selectedEmpAvatar}>
                  {selectedEmp.nome[0]?.toUpperCase()}
                </div>
                <div className={s.selectedEmpInfo}>
                  <div className={s.selectedEmpName}>{selectedEmp.nome}</div>
                  <div className={s.selectedEmpMeta}>
                    {selectedEmp.cargo} · {selectedEmp.setor} · Mat. {selectedEmp.matricula}
                  </div>
                </div>
                <button className={s.selectedEmpClear} onClick={() => { setSelectedEmp(null); setEmpSearch('') }}>
                  <Ic.X />
                </button>
              </div>
            )}

            {/* Form fields */}
            <div className={s.newFormCard}>
              <div className={s.newFormTitle}>
                <Ic.Shield />
                Dados da Ficha EPI
              </div>

              {!selectedEmp && (
                <div className={s.noEmpNotice}>
                  Selecione um colaborador ao lado ou preencha manualmente.
                </div>
              )}

              <div className={s.newFormGrid}>
                <div className={s.newField}>
                  <label className={s.newLabel}>Nome Completo *</label>
                  <input className={s.newInput}
                    placeholder="Nome do colaborador"
                    value={newForm.colaboradorNome}
                    onChange={e => setNF('colaboradorNome', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Matrícula *</label>
                  <input className={s.newInput}
                    placeholder="EX-0001"
                    value={newForm.matricula}
                    onChange={e => setNF('matricula', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Função / Cargo *</label>
                  <input className={s.newInput}
                    placeholder="Ex: Operador de Produção"
                    value={newForm.funcao}
                    onChange={e => setNF('funcao', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Setor *</label>
                  <select className={s.newInput} value={newForm.setor}
                    onChange={e => setNF('setor', e.target.value as EPIFicha['setor'])}>
                    <option value="">Selecione…</option>
                    {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                  </select>
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Departamento</label>
                  <input className={s.newInput}
                    placeholder="Ex: Produção Industrial"
                    value={newForm.departamento}
                    onChange={e => setNF('departamento', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Supervisor</label>
                  <input className={s.newInput}
                    placeholder="Nome do supervisor"
                    value={newForm.supervisor}
                    onChange={e => setNF('supervisor', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Data de Admissão</label>
                  <input type="date" className={s.newInput}
                    value={newForm.dataAdmissao}
                    onChange={e => setNF('dataAdmissao', e.target.value)} />
                </div>
                <div className={s.newField}>
                  <label className={s.newLabel}>Nível de Risco</label>
                  <select className={s.newInput} value={newForm.classificacaoRisco}
                    onChange={e => setNF('classificacaoRisco', e.target.value as NivelRisco)}>
                    <option value="baixo">Baixo</option>
                    <option value="medio">Médio</option>
                    <option value="alto">Alto</option>
                    <option value="critico">Crítico</option>
                  </select>
                </div>
                <div className={s.newField} style={{ gridColumn: '1 / -1' }}>
                  <label className={s.newLabel}>Observações</label>
                  <input className={s.newInput}
                    placeholder="Área de trabalho, restrições ou observações relevantes…"
                    value={newForm.observacoes}
                    onChange={e => setNF('observacoes', e.target.value)} />
                </div>
              </div>

              {/* Risk preview chip */}
              <div className={s.riskPreview} style={{ background: riskMeta.bg, color: riskMeta.color }}>
                <Ic.Shield /> {riskMeta.label}
              </div>

              <div className={s.newFormActions}>
                <button className={s.btnCancel} onClick={() => navigate('/seguranca/epi')}>
                  Cancelar
                </button>
                <button className={s.btnCreate} disabled={newSaving} onClick={handleCreateFicha}>
                  {newSaving
                    ? <><span className={s.spinnerSm} /> Criando…</>
                    : <><Ic.HardHat /> Criar Ficha EPI</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── MODO VIEW ─────────────────────────────────────────
  if (loading) return (
    <div className={s.page}>
      <div className={s.loadingWrap}>
        <div className={s.spinner} />
        <span>Carregando ficha…</span>
      </div>
    </div>
  )
  if (!ficha) return null

  const meta     = STATUS_FICHA_META[ficha.statusFicha]     ?? { label: ficha.statusFicha,           color: '#64748b', bg: 'rgba(100,116,139,0.1)' }
  const riskMeta = RISCO_META[ficha.classificacaoRisco] ?? { label: ficha.classificacaoRisco, color: '#64748b', bg: 'rgba(100,116,139,0.1)' }

  const totalOk      = ficha.entregas.filter(e => !isExpired(e.dataVencimento)).length
  const totalVenc    = ficha.totalEpisVencidos
  const totalAVencer = ficha.totalEpisAVencer

  return (
    <div className={s.page}>

      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <button className={s.backBtn} onClick={() => navigate('/seguranca/epi')}>
          <Ic.Back /> Controle de EPI
        </button>
        <span className={s.breadSep}>/</span>
        <span className={s.breadCurrent}>{ficha.colaboradorNome}</span>
      </div>

      {/* ── Hero ── */}
      <div className={s.heroCard}>
        <div className={s.heroLeft}>
          <div className={s.heroAvatar}>{ficha.colaboradorNome[0]?.toUpperCase()}</div>
          <div className={s.heroInfo}>
            <div className={s.heroName}>{ficha.colaboradorNome}</div>
            <div className={s.heroMeta}>
              <span>{ficha.funcao}</span>
              <span className={s.heroDot}>·</span>
              <span>{ficha.setor}</span>
              <span className={s.heroDot}>·</span>
              <span className={s.matTag}>Mat. {ficha.matricula}</span>
            </div>
            <div className={s.heroBadges}>
              <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>
                {meta.label}
              </span>
              <span className={s.badge} style={{ color: riskMeta.color, background: riskMeta.bg }}>
                {riskMeta.label}
              </span>
            </div>
          </div>
        </div>

        {/* EPI stats */}
        <div className={s.heroStats}>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: '#166534' }}>{totalOk}</div>
            <div className={s.heroStatLbl}>Ativos</div>
          </div>
          <div className={s.heroStatDivider} />
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: totalAVencer > 0 ? '#d97706' : '#94a3b8' }}>{totalAVencer}</div>
            <div className={s.heroStatLbl}>A Vencer</div>
          </div>
          <div className={s.heroStatDivider} />
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: totalVenc > 0 ? '#dc2626' : '#94a3b8' }}>{totalVenc}</div>
            <div className={s.heroStatLbl}>Vencidos</div>
          </div>
          <div className={s.heroStatDivider} />
          <div className={s.heroStat}>
            <div className={s.heroStatVal}>{ficha.entregas.length}</div>
            <div className={s.heroStatLbl}>Total EPIs</div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {totalVenc > 0 && (
        <div className={s.alertBanner} data-level="danger">
          <Ic.Alert /> <strong>{totalVenc} EPI(s) vencido(s)</strong> — regularizar imediatamente.
        </div>
      )}
      {totalAVencer > 0 && totalVenc === 0 && (
        <div className={s.alertBanner} data-level="warning">
          <Ic.Info /> <strong>{totalAVencer} EPI(s)</strong> vencem nos próximos 30 dias.
        </div>
      )}

      {/* ── Tabs + action ── */}
      <div className={s.tabsRow}>
        <div className={s.tabs}>
          <button
            className={`${s.tab} ${activeTab === 'entregas' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('entregas')}
          >
            <Ic.HardHat /> Entregas ({ficha.entregas.length})
          </button>
          <button
            className={`${s.tab} ${activeTab === 'info' ? s.tabActive : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <Ic.User /> Dados do Colaborador
          </button>
        </div>
        <button className={s.btnRegister} onClick={() => setShowForm(v => !v)}>
          {showForm ? <><Ic.X /> Cancelar</> : <><Ic.Plus /> Registrar EPI</>}
        </button>
      </div>

      {/* ── Add EPI form ── */}
      {showForm && (
        <div className={s.addEpiCard}>
          <div className={s.addEpiTitle}>Registrar Nova Entrega de EPI</div>
          <div className={s.addEpiGrid}>
            <div className={s.field}>
              <label className={s.label}>EPI do Catálogo</label>
              <select className={s.input} value={entrega.epiId} onChange={e => handleEPISelect(e.target.value)}>
                <option value="">Selecione do catálogo…</option>
                {EPI_CATALOG.map(cat => (
                  <optgroup key={cat.id} label={`${cat.icon} ${cat.label}`}>
                    {cat.itens.map(item => (
                      <option key={item.id} value={item.id}>{item.nome}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Nome do EPI *</label>
              <input className={s.input} value={entrega.epiNome}
                onChange={e => setE('epiNome', e.target.value)} placeholder="Nome do equipamento" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Número CA</label>
              <input className={s.input} value={entrega.numeroCa}
                onChange={e => setE('numeroCa', e.target.value)} placeholder="CA do fabricante" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Validade</label>
              <input type="date" className={s.input} value={entrega.dataVencimentoStr}
                onChange={e => setE('dataVencimentoStr', e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Quantidade</label>
              <input type="number" min={1} className={s.input} value={entrega.quantidade}
                onChange={e => setE('quantidade', Number(e.target.value))} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Condição</label>
              <select className={s.input} value={entrega.condicao}
                onChange={e => setE('condicao', e.target.value)}>
                <option value="novo">Novo</option>
                <option value="bom">Bom</option>
                <option value="regular">Regular</option>
                <option value="danificado">Danificado</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Responsável pela entrega</label>
              <input className={s.input} value={entrega.responsavelNome}
                onChange={e => setE('responsavelNome', e.target.value)}
                placeholder={user?.nome ?? 'Nome do responsável'} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Observações</label>
              <input className={s.input} value={entrega.observacoes}
                onChange={e => setE('observacoes', e.target.value)} placeholder="Observações opcionais" />
            </div>
          </div>

          <div className={s.addEpiChecks}>
            <label className={s.checkLabel}>
              <input type="checkbox" checked={entrega.assinaturaColaborador}
                onChange={e => setE('assinaturaColaborador', e.target.checked)} />
              Colaborador assinou o recibo
            </label>
            <label className={s.checkLabel}>
              <input type="checkbox" checked={entrega.assinaturaResponsavel}
                onChange={e => setE('assinaturaResponsavel', e.target.checked)} />
              Responsável assinou o recibo
            </label>
          </div>

          <div className={s.addEpiActions}>
            <button className={s.btnCancel} onClick={() => { setShowForm(false); setEntrega(EMPTY_ENTREGA) }}>
              Cancelar
            </button>
            <button className={s.btnCreate} disabled={saving} onClick={handleAddEntrega}>
              {saving
                ? <><span className={s.spinnerSm} /> Salvando…</>
                : <><Ic.Check /> Confirmar Entrega</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Entregas ── */}
      {activeTab === 'entregas' && (
        <div className={s.tabContent}>
          {ficha.entregas.length === 0 ? (
            <div className={s.empty}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🦺</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhum EPI registrado</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Clique em "+ Registrar EPI" para adicionar o primeiro equipamento desta ficha.
              </div>
            </div>
          ) : (
            <div className={s.entregaList}>
              {ficha.entregas.map((e, i) => {
                const expired      = isExpired(e.dataVencimento)
                const expiringSoon = isExpiringSoon(e.dataVencimento)
                return (
                  <div key={i} className={`${s.entregaRow} ${expired ? s.entregaExpired : expiringSoon ? s.entregaWarning : ''}`}>
                    <div className={s.entregaIconWrap}>
                      <Ic.HardHat />
                    </div>
                    <div className={s.entregaBody}>
                      <div className={s.entregaTop}>
                        <span className={s.entregaNome}>{e.epiNome}</span>
                        {e.numeroCa && <span className={s.caTag}>CA {e.numeroCa}</span>}
                        <span className={s.condicaoTag} data-cond={e.condicao}>{e.condicao}</span>
                        {expired        && <span className={s.expiredTag}>VENCIDO</span>}
                        {expiringSoon && !expired && <span className={s.warningTag}>A VENCER</span>}
                      </div>
                      <div className={s.entregaMeta}>
                        <span>Entregue: <strong>{fmt(e.dataEntrega)}</strong></span>
                        <span className={s.heroDot}>·</span>
                        <span style={{ color: expired ? '#dc2626' : expiringSoon ? '#d97706' : 'inherit' }}>
                          Vence: <strong>{fmt(e.dataVencimento)}</strong>
                        </span>
                        <span className={s.heroDot}>·</span>
                        <span>Qtd: <strong>{e.quantidade}</strong></span>
                        {e.responsavelNome && <><span className={s.heroDot}>·</span><span>{e.responsavelNome}</span></>}
                      </div>
                    </div>
                    <div className={s.entregaSigns}>
                      <span className={e.assinaturaColaborador ? s.signOk : s.signNo}>
                        {e.assinaturaColaborador ? '✅' : '⬜'} Colaborador
                      </span>
                      <span className={e.assinaturaResponsavel ? s.signOk : s.signNo}>
                        {e.assinaturaResponsavel ? '✅' : '⬜'} Responsável
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Info ── */}
      {activeTab === 'info' && (
        <div className={s.tabContent}>
          <div className={s.infoGrid}>
            {[
              ['Supervisor',    ficha.supervisor],
              ['Departamento',  ficha.departamento],
              ['Admissão',      fmt(ficha.dataAdmissao)],
              ['Status',        ficha.ativo ? '✅ Ativo' : '❌ Inativo'],
              ['Classificação', riskMeta.label],
              ...(ficha.observacoes ? [['Observações', ficha.observacoes]] : []),
            ].map(([k, v]) => (
              <div key={k} className={s.infoRow}>
                <span className={s.infoKey}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
