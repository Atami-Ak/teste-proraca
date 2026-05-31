import {
  useState, useEffect, useRef, useCallback,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { createDDS, updateDDS, getDDS }        from '@/lib/db-safety'
import { searchEmployees }                      from '@/lib/db-employees'
import { useStore }                             from '@/store/useStore'
import type { DDS, ColaboradorPresente }        from '@/types/safety'
import type { Employee }                        from '@/types/employee'
import { SETORES_FABRICA }                      from '@/types/safety'
import { DDS_CATALOG, DDS_TEMAS_FLAT }          from '@/data/dds-catalog'
import { toast }                                from '@/components/ui/Toast'
import s from './DDSFormPage.module.css'

// ── Types ──────────────────────────────────────────────

type Form = {
  data:                string
  hora:                string
  setor:               string
  departamento:        string
  supervisor:          string
  categoriaId:         string
  categoriaLabel:      string
  temaId:              string
  temaLabel:           string
  duracaoMinutos:      number
  observacoes:         string
  riscosIdentificados: string
  acoesImediatas:      string
  status:              DDS['status']
}

const EMPTY: Form = {
  data: new Date().toISOString().split('T')[0],
  hora: new Date().toTimeString().slice(0, 5),
  setor: '', departamento: '', supervisor: '',
  categoriaId: '', categoriaLabel: '', temaId: '', temaLabel: '',
  duracaoMinutos: 10, observacoes: '', riscosIdentificados: '', acoesImediatas: '',
  status: 'rascunho',
}

// ── Icons ──────────────────────────────────────────────

const Ic = {
  Back:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Shield:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Users:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Search:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  UserPlus:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
  Check:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  X:          () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Clock:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  Pen:        () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  Keyboard:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/></svg>,
  Info:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Book:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Notes:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>,
  Save:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>,
  CheckCirc:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
}

// ── Avatar helper ──────────────────────────────────────

function initials(name: string) {
  return name.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function timeStamp() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Attendance entry type (local, with timestamp) ──────

type AttendanceEntry = ColaboradorPresente & {
  addedAt: string
  employeeId?: string
}

// ════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════

export default function DDSFormPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { id }    = useParams<{ id: string }>()
  const isEdit    = !!id
  const isViewOnly = location.pathname.endsWith(`/${id}`) && !location.pathname.endsWith('/editar')
  const user      = useStore(st => st.user)

  // ── Form state ──────────────────────────────────────
  const [form, setForm]           = useState<Form>(EMPTY)
  const [attendance, setAttend]   = useState<AttendanceEntry[]>([])
  const [loading, setLoading]     = useState(false)
  const [initLoad, setInitLoad]   = useState(isEdit)

  // ── Search state ────────────────────────────────────
  const [addMode, setAddMode]     = useState<'search' | 'manual'>('search')
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<Employee[]>([])
  const [searching, setSearching] = useState(false)
  const [showDrop, setShowDrop]   = useState(false)
  const [focusIdx, setFocusIdx]   = useState(-1)
  const [recentlyAdded, setRecentAdded] = useState<string | null>(null)

  // ── Manual mode ─────────────────────────────────────
  const [manualNome, setManualNome]   = useState('')
  const [manualFuncao, setManualFuncao] = useState('')

  const searchRef  = useRef<HTMLInputElement>(null)
  const dropRef    = useRef<HTMLDivElement>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Close dropdown outside click ─────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false)
        setFocusIdx(-1)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // ── Load existing DDS ────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    getDDS(id!).then(d => {
      if (!d) { toast.error('DDS não encontrado.'); navigate('/seguranca/dds'); return }
      setForm({
        data:                d.data.toISOString().split('T')[0],
        hora:                d.hora,
        setor:               d.setor,
        departamento:        d.departamento,
        supervisor:          d.supervisor,
        categoriaId:         d.categoriaId,
        categoriaLabel:      d.categoria,
        temaId:              d.temaId,
        temaLabel:           d.tema,
        duracaoMinutos:      d.duracaoMinutos ?? 10,
        observacoes:         d.observacoes ?? '',
        riscosIdentificados: d.riscosIdentificados ?? '',
        acoesImediatas:      d.acoesImediatas ?? '',
        status:              d.status,
      })
      setAttend(d.colaboradores.map(c => ({ ...c, addedAt: '--:--' })))
      setInitLoad(false)
    })
  }, [id, isEdit, navigate])

  // ── Debounced search ──────────────────────────────────
  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setShowDrop(false); return }
    setSearching(true)
    searchEmployees(q)
      .then(r => {
        setResults(r)
        setShowDrop(r.length > 0)
        setFocusIdx(-1)
      })
      .catch(() => {})
      .finally(() => setSearching(false))
  }, [])

  function handleQueryChange(v: string) {
    setQuery(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(v), 260)
  }

  // ── Add employee from search ──────────────────────────
  function selectEmployee(emp: Employee) {
    const alreadyIn = attendance.some(
      c => (c.employeeId && c.employeeId === emp.id) || c.matricula === emp.matricula
    )
    if (alreadyIn) {
      toast.error(`${emp.nome} já está na lista.`)
      return
    }
    const entry: AttendanceEntry = {
      nome:       emp.nome,
      matricula:  emp.matricula,
      funcao:     emp.cargo,
      assinou:    false,
      addedAt:    timeStamp(),
      employeeId: emp.id,
    }
    setAttend(prev => [entry, ...prev])
    setRecentAdded(emp.id)
    setTimeout(() => setRecentAdded(null), 2000)
    setQuery('')
    setResults([])
    setShowDrop(false)
    setFocusIdx(-1)
    searchRef.current?.focus()
  }

  // ── Add manual entry ──────────────────────────────────
  function addManual() {
    if (!manualNome.trim()) { toast.error('Informe o nome.'); return }
    const already = attendance.some(c => c.nome.toLowerCase() === manualNome.trim().toLowerCase())
    if (already) { toast.error('Nome já está na lista.'); return }
    setAttend(prev => [{
      nome: manualNome.trim(), funcao: manualFuncao.trim() || undefined,
      assinou: false, addedAt: timeStamp(),
    }, ...prev])
    setManualNome(''); setManualFuncao('')
  }

  // ── Keyboard navigation in dropdown ──────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showDrop) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = focusIdx >= 0 ? focusIdx : 0
      if (results[idx]) selectEmployee(results[idx])
    } else if (e.key === 'Escape') {
      setShowDrop(false); setFocusIdx(-1)
    }
  }

  // ── Attendance actions ────────────────────────────────
  function remove(idx: number) {
    setAttend(prev => prev.filter((_, i) => i !== idx))
  }
  function toggleSign(idx: number) {
    setAttend(prev => prev.map((c, i) => i === idx ? { ...c, assinou: !c.assinou } : c))
  }
  function signAll(checked: boolean) {
    setAttend(prev => prev.map(c => ({ ...c, assinou: checked })))
  }

  // ── Form helpers ──────────────────────────────────────
  function set(key: keyof Form, v: string | number) {
    setForm(prev => ({ ...prev, [key]: v }))
  }
  function onCatChange(catId: string) {
    const cat = DDS_CATALOG.find(c => c.id === catId)
    setForm(prev => ({ ...prev, categoriaId: catId, categoriaLabel: cat?.label ?? '', temaId: '', temaLabel: '' }))
  }
  function onTemaChange(temaId: string) {
    const t = DDS_TEMAS_FLAT.find(t => t.id === temaId)
    setForm(prev => ({ ...prev, temaId, temaLabel: t?.tema ?? '', duracaoMinutos: t?.duracao ?? prev.duracaoMinutos }))
  }

  // ── Submit ────────────────────────────────────────────
  async function handleSubmit(status: DDS['status']) {
    if (!form.setor)      { toast.error('Informe o setor.'); return }
    if (!form.supervisor) { toast.error('Informe o supervisor.'); return }
    if (!form.temaLabel)  { toast.error('Informe o tema do DDS.'); return }

    setLoading(true)
    try {
      const colabs: ColaboradorPresente[] = attendance.map(({ addedAt: _a, employeeId: _e, ...c }) => c)
      const payload = {
        data:                new Date(form.data + 'T12:00:00'),
        hora:                form.hora,
        setor:               form.setor as DDS['setor'],
        departamento:        form.departamento,
        supervisor:          form.supervisor,
        tecnicoNome:         user?.nome ?? 'Desconhecido',
        tecnicoId:           user?.uid,
        temaId:              form.temaId,
        tema:                form.temaLabel,
        categoriaId:         form.categoriaId,
        categoria:           form.categoriaLabel,
        colaboradores:       colabs,
        totalPresentes:      colabs.length,
        duracaoMinutos:      form.duracaoMinutos,
        observacoes:         form.observacoes   || undefined,
        riscosIdentificados: form.riscosIdentificados || undefined,
        acoesImediatas:      form.acoesImediatas || undefined,
        status,
        createdBy:           user?.uid,
      }

      if (isEdit) {
        await updateDDS(id!, payload)
        toast.success('DDS atualizado com sucesso.')
      } else {
        await createDDS(payload)
        toast.success('DDS registrado com sucesso.')
      }
      navigate('/seguranca/dds')
    } catch { toast.error('Erro ao salvar DDS. Tente novamente.') }
    finally { setLoading(false) }
  }

  if (initLoad) {
    return (
      <div className={s.loadingPage}>
        <div className={s.spinner} />
        <span>Carregando DDS…</span>
      </div>
    )
  }

  const temasCat    = form.categoriaId ? (DDS_CATALOG.find(c => c.id === form.categoriaId)?.temas ?? []) : []
  const signedCount = attendance.filter(c => c.assinou).length
  const allSigned   = attendance.length > 0 && signedCount === attendance.length
  const signPct     = attendance.length > 0 ? Math.round((signedCount / attendance.length) * 100) : 0

  return (
    <div className={s.page}>

      {/* ── Page Header ── */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => navigate('/seguranca/dds')}>
            <Ic.Back /> DDS
          </button>
          <div className={s.headerDivider} />
          <div className={s.headerMeta}>
            <div className={s.headerIconWrap}><Ic.Shield /></div>
            <div>
              <h1 className={s.pageTitle}>
                {isViewOnly ? 'Visualizar DDS' : isEdit ? 'Editar DDS' : 'Novo DDS'}
              </h1>
              <p className={s.pageSub}>
                {isViewOnly ? 'Modo leitura — use editar para alterar' : 'Preencha os dados e registre a presença dos colaboradores'}
              </p>
            </div>
          </div>
        </div>
        {!isViewOnly && (
          <div className={s.headerActions}>
            <button className={s.btnDraft} disabled={loading}
              onClick={() => handleSubmit('rascunho')}>
              <Ic.Save /> Salvar rascunho
            </button>
            <button className={s.btnConclude} disabled={loading}
              onClick={() => handleSubmit('concluido')}>
              {loading ? <span className={s.spinnerSm} /> : <Ic.CheckCirc />}
              Concluir DDS
            </button>
          </div>
        )}
        {isViewOnly && (
          <button className={s.btnEditMode}
            onClick={() => navigate(`/seguranca/dds/${id}/editar`)}>
            <Ic.Pen /> Editar
          </button>
        )}
      </div>

      {/* ── Two-column layout ── */}
      <div className={s.layout}>

        {/* ════ LEFT — Form fields ════ */}
        <div className={s.formCol}>

          {/* General Info */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderIcon} style={{ background: 'rgba(22,101,52,0.1)', color: '#166534' }}>
                <Ic.Book />
              </div>
              <div className={s.cardHeaderText}>
                <div className={s.cardTitle}>Informações Gerais</div>
                <div className={s.cardSub}>Data, setor e responsável</div>
              </div>
            </div>
            <div className={s.fields}>
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Data <span className={s.req}>*</span></label>
                  <input type="date" className={s.input} value={form.data}
                    onChange={e => set('data', e.target.value)} disabled={isViewOnly} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Hora de início</label>
                  <input type="time" className={s.input} value={form.hora}
                    onChange={e => set('hora', e.target.value)} disabled={isViewOnly} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Duração (min)</label>
                  <input type="number" min={1} max={120} className={s.input}
                    value={form.duracaoMinutos}
                    onChange={e => set('duracaoMinutos', Number(e.target.value))} disabled={isViewOnly} />
                </div>
              </div>
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <label className={s.label}>Setor <span className={s.req}>*</span></label>
                  <select className={s.input} value={form.setor}
                    onChange={e => set('setor', e.target.value)} disabled={isViewOnly}>
                    <option value="">Selecione o setor…</option>
                    {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Departamento / Turno</label>
                  <input className={s.input} value={form.departamento}
                    onChange={e => set('departamento', e.target.value)}
                    placeholder="Ex.: Turno A" disabled={isViewOnly} />
                </div>
              </div>
              <div className={s.field}>
                <label className={s.label}>Supervisor Responsável <span className={s.req}>*</span></label>
                <input className={s.input} value={form.supervisor}
                  onChange={e => set('supervisor', e.target.value)}
                  placeholder="Nome completo do supervisor" disabled={isViewOnly} />
              </div>
            </div>
          </section>

          {/* Topic */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderIcon} style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
                <Ic.Book />
              </div>
              <div className={s.cardHeaderText}>
                <div className={s.cardTitle}>Tema do DDS</div>
                <div className={s.cardSub}>Categoria e assunto abordado</div>
              </div>
            </div>
            <div className={s.fields}>
              <div className={s.field}>
                <label className={s.label}>Categoria</label>
                <select className={s.input} value={form.categoriaId}
                  onChange={e => onCatChange(e.target.value)} disabled={isViewOnly}>
                  <option value="">Selecione uma categoria…</option>
                  {DDS_CATALOG.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Tema <span className={s.req}>*</span></label>
                {form.categoriaId ? (
                  <select className={s.input} value={form.temaId}
                    onChange={e => onTemaChange(e.target.value)} disabled={isViewOnly}>
                    <option value="">Selecione um tema…</option>
                    {temasCat.map(t => (
                      <option key={t.id} value={t.id}>{t.obrigatorio ? '⭐ ' : ''}{t.tema}</option>
                    ))}
                  </select>
                ) : (
                  <input className={s.input} value={form.temaLabel}
                    onChange={e => set('temaLabel', e.target.value)}
                    placeholder="Digite o tema abordado…" disabled={isViewOnly} />
                )}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderIcon} style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
                <Ic.Notes />
              </div>
              <div className={s.cardHeaderText}>
                <div className={s.cardTitle}>Observações</div>
                <div className={s.cardSub}>Riscos, ações e notas adicionais</div>
              </div>
            </div>
            <div className={s.fields}>
              <div className={s.field}>
                <label className={s.label}>Riscos identificados</label>
                <textarea className={s.textarea} rows={3} value={form.riscosIdentificados}
                  onChange={e => set('riscosIdentificados', e.target.value)}
                  placeholder="Descreva os riscos identificados durante o DDS…" disabled={isViewOnly} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Ações imediatas</label>
                <textarea className={s.textarea} rows={3} value={form.acoesImediatas}
                  onChange={e => set('acoesImediatas', e.target.value)}
                  placeholder="Ações corretivas ou preventivas definidas…" disabled={isViewOnly} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Observações gerais</label>
                <textarea className={s.textarea} rows={2} value={form.observacoes}
                  onChange={e => set('observacoes', e.target.value)}
                  placeholder="Observações adicionais…" disabled={isViewOnly} />
              </div>
            </div>
          </section>

          {/* Mobile: save buttons at bottom of form col */}
          {!isViewOnly && (
            <div className={s.saveRowMobile}>
              <button className={s.btnDraft} disabled={loading}
                onClick={() => handleSubmit('rascunho')}>
                <Ic.Save /> Salvar rascunho
              </button>
              <button className={s.btnConclude} disabled={loading}
                onClick={() => handleSubmit('concluido')}>
                {loading ? <span className={s.spinnerSm} /> : <Ic.CheckCirc />}
                Concluir DDS
              </button>
            </div>
          )}
        </div>

        {/* ════ RIGHT — Attendance panel ════ */}
        <div className={s.attendanceCol}>
          <div className={s.attendancePanel}>

            {/* ── Panel header ── */}
            <div className={s.panelHeader}>
              <div className={s.panelHeaderLeft}>
                <div className={s.panelIcon}><Ic.Users /></div>
                <div>
                  <div className={s.panelTitle}>Lista de Presença</div>
                  <div className={s.panelSub}>
                    {attendance.length === 0 ? 'Nenhum participante ainda' : `${attendance.length} participante${attendance.length !== 1 ? 's' : ''} registrado${attendance.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
              {attendance.length > 0 && (
                <div className={s.panelCounter}>
                  <span className={s.counterNum}>{attendance.length}</span>
                  <span className={s.counterLabel}>presentes</span>
                </div>
              )}
            </div>

            {/* ── Signature progress ── */}
            {attendance.length > 0 && (
              <div className={s.signProgress}>
                <div className={s.signProgressTop}>
                  <label className={s.signAllLabel}>
                    <input type="checkbox" checked={allSigned}
                      onChange={e => signAll(e.target.checked)}
                      disabled={isViewOnly} />
                    <span>Marcar todos como assinados</span>
                  </label>
                  <span className={s.signCount} style={{ color: signPct === 100 ? '#16a34a' : '#d97706' }}>
                    {signedCount}/{attendance.length} assinaram
                  </span>
                </div>
                <div className={s.signBar}>
                  <div className={s.signBarFill} style={{
                    width: `${signPct}%`,
                    background: signPct === 100 ? '#16a34a' : '#d97706',
                  }} />
                </div>
              </div>
            )}

            {/* ── Add section (hidden in view-only) ── */}
            {!isViewOnly && (
              <div className={s.addSection}>

                {/* Mode tabs */}
                <div className={s.modeTabs}>
                  <button className={`${s.modeTab} ${addMode === 'search' ? s.modeTabActive : ''}`}
                    onClick={() => { setAddMode('search'); setTimeout(() => searchRef.current?.focus(), 80) }}
                    type="button">
                    <Ic.Search /> Buscar cadastrado
                  </button>
                  <button className={`${s.modeTab} ${addMode === 'manual' ? s.modeTabActive : ''}`}
                    onClick={() => setAddMode('manual')} type="button">
                    <Ic.Pen /> Digitar manualmente
                  </button>
                </div>

                {/* ── Search mode ── */}
                {addMode === 'search' && (
                  <div className={s.searchSection} ref={dropRef}>
                    <div className={s.empSearchWrap}>
                      <span className={s.empSearchIcon}>
                        {searching ? <span className={s.spinnerSm} /> : <Ic.Search />}
                      </span>
                      <input
                        ref={searchRef}
                        className={s.empSearchInput}
                        placeholder="Nome, matrícula ou cargo…"
                        value={query}
                        onChange={e => handleQueryChange(e.target.value)}
                        onFocus={() => results.length > 0 && setShowDrop(true)}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                      />
                      {query && (
                        <button className={s.searchClearBtn}
                          onClick={() => { setQuery(''); setResults([]); setShowDrop(false); searchRef.current?.focus() }}>
                          <Ic.X />
                        </button>
                      )}
                    </div>

                    {/* Dropdown results */}
                    {showDrop && (
                      <div className={s.empDrop}>
                        <div className={s.dropHint}>
                          <Ic.Keyboard /> ↑↓ navegar · Enter adicionar · Esc fechar
                        </div>
                        {results.map((emp, i) => {
                          const alreadyIn = attendance.some(
                            c => (c.employeeId && c.employeeId === emp.id) || c.matricula === emp.matricula
                          )
                          return (
                            <button
                              key={emp.id}
                              className={`${s.empOption} ${i === focusIdx ? s.empOptionFocus : ''} ${alreadyIn ? s.empOptionDone : ''}`}
                              type="button"
                              onClick={() => !alreadyIn && selectEmployee(emp)}
                              onMouseEnter={() => setFocusIdx(i)}
                              disabled={alreadyIn}
                            >
                              <div className={s.empAvatar}>
                                {initials(emp.nome)}
                              </div>
                              <div className={s.empInfo}>
                                <div className={s.empName}>{emp.nome}</div>
                                <div className={s.empMeta}>{emp.cargo} · {emp.setor}</div>
                              </div>
                              <div className={s.empRight}>
                                <span className={s.empMatricula}>{emp.matricula}</span>
                                {alreadyIn ? (
                                  <span className={s.empDoneTag}><Ic.Check /> Adicionado</span>
                                ) : (
                                  <span className={s.empAddTag}><Ic.UserPlus /> Adicionar</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {query && !searching && results.length === 0 && !showDrop && (
                      <div className={s.noResults}>
                        <Ic.Info /> Nenhum colaborador encontrado para "{query}"
                      </div>
                    )}
                  </div>
                )}

                {/* ── Manual mode ── */}
                {addMode === 'manual' && (
                  <div className={s.manualSection}>
                    <div className={s.manualRow}>
                      <input className={s.input} placeholder="Nome completo *"
                        value={manualNome} onChange={e => setManualNome(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addManual()} />
                      <input className={s.input} placeholder="Função / cargo (opcional)"
                        value={manualFuncao} onChange={e => setManualFuncao(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addManual()} />
                    </div>
                    <button className={s.btnAddManual} onClick={addManual}>
                      <Ic.UserPlus /> Adicionar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Attendance list ── */}
            <div className={s.attendList}>
              {attendance.length === 0 ? (
                <div className={s.attendEmpty}>
                  <div className={s.attendEmptyIcon}><Ic.Users /></div>
                  <p>Nenhum participante ainda</p>
                  {!isViewOnly && (
                    <span className={s.attendEmptyHint}>Use a busca acima para adicionar colaboradores</span>
                  )}
                </div>
              ) : (
                attendance.map((c, i) => {
                  const isNew = recentlyAdded && c.employeeId === recentlyAdded
                  return (
                    <div key={i}
                      className={`${s.attendEntry} ${isNew ? s.attendEntryNew : ''}`}>
                      <label className={s.entryCheck}>
                        <input type="checkbox" checked={c.assinou}
                          onChange={() => toggleSign(i)} disabled={isViewOnly} />
                        <div className={s.entryAvatar}>
                          {initials(c.nome)}
                        </div>
                      </label>
                      <div className={s.entryInfo}>
                        <div className={s.entryName}>
                          {c.nome}
                          {c.assinou && <span className={s.signedBadge}><Ic.Check /> Assinou</span>}
                        </div>
                        <div className={s.entryMeta}>
                          {c.matricula && <span>{c.matricula}</span>}
                          {c.funcao && <><span className={s.metaDot}>·</span><span>{c.funcao}</span></>}
                          {c.addedAt !== '--:--' && (
                            <><span className={s.metaDot}>·</span><span className={s.entryTime}><Ic.Clock /> {c.addedAt}</span></>
                          )}
                        </div>
                      </div>
                      {!isViewOnly && (
                        <button className={s.entryRemove} onClick={() => remove(i)} title="Remover">
                          <Ic.X />
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* ── Summary footer ── */}
            {attendance.length > 0 && (
              <div className={s.panelFooter}>
                <div className={s.footerStat}>
                  <span className={s.footerStatVal}>{attendance.length}</span>
                  <span className={s.footerStatLbl}>presentes</span>
                </div>
                <div className={s.footerDot} />
                <div className={s.footerStat}>
                  <span className={s.footerStatVal} style={{ color: signPct === 100 ? '#16a34a' : '#d97706' }}>{signedCount}</span>
                  <span className={s.footerStatLbl}>assinaram</span>
                </div>
                <div className={s.footerDot} />
                <div className={s.footerStat}>
                  <span className={s.footerStatVal} style={{ color: attendance.length - signedCount > 0 ? '#dc2626' : '#16a34a' }}>{attendance.length - signedCount}</span>
                  <span className={s.footerStatLbl}>pendentes</span>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
