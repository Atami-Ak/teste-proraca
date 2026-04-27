import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createDDS, updateDDS, getDDS } from '@/lib/db-safety'
import { useStore } from '@/store/useStore'
import type { DDS, ColaboradorPresente } from '@/types/safety'
import { SETORES_FABRICA } from '@/types/safety'
import { DDS_CATALOG, DDS_TEMAS_FLAT } from '@/data/dds-catalog'
import { toast } from '@/components/ui/Toast'
import s from './DDSFormPage.module.css'

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

const EMPTY_FORM: Form = {
  data: new Date().toISOString().split('T')[0],
  hora: '08:00',
  setor: '',
  departamento: '',
  supervisor: '',
  categoriaId: '',
  categoriaLabel: '',
  temaId: '',
  temaLabel: '',
  duracaoMinutos: 10,
  observacoes: '',
  riscosIdentificados: '',
  acoesImediatas: '',
  status: 'rascunho',
}

export default function DDSFormPage() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id: string }>()
  const isEdit   = !!id
  const user     = useStore(s => s.user)

  const [form, setForm]                     = useState<Form>(EMPTY_FORM)
  const [colaboradores, setColaboradores]   = useState<ColaboradorPresente[]>([])
  const [newColabNome, setNewColabNome]     = useState('')
  const [newColabFuncao, setNewColabFuncao] = useState('')
  const [loading, setLoading]               = useState(false)
  const [initLoading, setInitLoading]       = useState(isEdit)

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
      setColaboradores(d.colaboradores)
      setInitLoading(false)
    })
  }, [id, isEdit, navigate])

  function set(key: keyof Form, value: string | number) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleCatChange(catId: string) {
    const cat = DDS_CATALOG.find(c => c.id === catId)
    setForm(prev => ({ ...prev, categoriaId: catId, categoriaLabel: cat?.label ?? '', temaId: '', temaLabel: '' }))
  }

  function handleTemaChange(temaId: string) {
    const tema = DDS_TEMAS_FLAT.find(t => t.id === temaId)
    setForm(prev => ({
      ...prev,
      temaId,
      temaLabel:      tema?.tema ?? '',
      duracaoMinutos: tema?.duracao ?? prev.duracaoMinutos,
    }))
  }

  function addColaborador() {
    if (!newColabNome.trim()) return
    setColaboradores(prev => [...prev, {
      nome:    newColabNome.trim(),
      funcao:  newColabFuncao.trim() || undefined,
      assinou: false,
    }])
    setNewColabNome('')
    setNewColabFuncao('')
  }

  function removeColab(idx: number) {
    setColaboradores(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleAssinou(idx: number) {
    setColaboradores(prev => prev.map((c, i) => i === idx ? { ...c, assinou: !c.assinou } : c))
  }

  function toggleAllAssinou(checked: boolean) {
    setColaboradores(prev => prev.map(c => ({ ...c, assinou: checked })))
  }

  async function handleSubmit(status: DDS['status']) {
    if (!form.setor)       { toast.error('Informe o setor.'); return }
    if (!form.supervisor)  { toast.error('Informe o supervisor.'); return }
    if (!form.temaId)      { toast.error('Selecione o tema.'); return }

    setLoading(true)
    try {
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
        colaboradores,
        totalPresentes:      colaboradores.length,
        duracaoMinutos:      form.duracaoMinutos,
        observacoes:         form.observacoes || undefined,
        riscosIdentificados: form.riscosIdentificados || undefined,
        acoesImediatas:      form.acoesImediatas || undefined,
        status,
        createdBy:           user?.uid,
      }

      if (isEdit) {
        await updateDDS(id!, { ...payload })
        toast.success('DDS atualizado.')
      } else {
        await createDDS(payload)
        toast.success('DDS registrado.')
      }
      navigate('/seguranca/dds')
    } catch { toast.error('Erro ao salvar DDS.') }
    finally { setLoading(false) }
  }

  if (initLoading) return <div className={s.loadingWrap}><div className={s.spinner} /></div>

  const temasCat = form.categoriaId
    ? (DDS_CATALOG.find(c => c.id === form.categoriaId)?.temas ?? [])
    : []

  const allSigned = colaboradores.length > 0 && colaboradores.every(c => c.assinou)

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <button className={s.btnBack} onClick={() => navigate('/seguranca/dds')}>← Voltar</button>
        <h1 className={s.pageTitle}>{isEdit ? 'Editar DDS' : 'Novo DDS'}</h1>
      </div>

      <div className={s.formGrid}>

        {/* ── Col 1 — Main form ── */}
        <div className={s.formCol}>

          <div className={s.card}>
            <div className={s.cardTitle}>📋 Informações Gerais</div>

            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.label}>Data *</label>
                <input type="date" className={s.input} value={form.data} onChange={e => set('data', e.target.value)} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Hora</label>
                <input type="time" className={s.input} value={form.hora} onChange={e => set('hora', e.target.value)} />
              </div>
            </div>

            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.label}>Setor *</label>
                <select className={s.input} value={form.setor} onChange={e => set('setor', e.target.value)}>
                  <option value="">Selecione…</option>
                  {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Departamento</label>
                <input className={s.input} value={form.departamento} onChange={e => set('departamento', e.target.value)} placeholder="Ex.: Turno A" />
              </div>
            </div>

            <div className={s.field}>
              <label className={s.label}>Supervisor Responsável *</label>
              <input className={s.input} value={form.supervisor} onChange={e => set('supervisor', e.target.value)} placeholder="Nome do supervisor" />
            </div>
          </div>

          <div className={s.card}>
            <div className={s.cardTitle}>📚 Tema do DDS</div>

            <div className={s.field}>
              <label className={s.label}>Categoria</label>
              <select className={s.input} value={form.categoriaId} onChange={e => handleCatChange(e.target.value)}>
                <option value="">Selecione uma categoria…</option>
                {DDS_CATALOG.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            <div className={s.field}>
              <label className={s.label}>Tema *</label>
              {form.categoriaId ? (
                <select className={s.input} value={form.temaId} onChange={e => handleTemaChange(e.target.value)}>
                  <option value="">Selecione um tema…</option>
                  {temasCat.map(t => (
                    <option key={t.id} value={t.id}>{t.obrigatorio ? '⭐ ' : ''}{t.tema}</option>
                  ))}
                </select>
              ) : (
                <input className={s.input} value={form.temaLabel} onChange={e => set('temaLabel', e.target.value)} placeholder="Ou digite um tema livre…" />
              )}
            </div>

            <div className={s.field}>
              <label className={s.label}>Duração (minutos)</label>
              <input type="number" min={1} max={120} className={s.input} value={form.duracaoMinutos}
                onChange={e => set('duracaoMinutos', Number(e.target.value))} />
            </div>
          </div>

          <div className={s.card}>
            <div className={s.cardTitle}>📝 Observações</div>

            <div className={s.field}>
              <label className={s.label}>Riscos identificados</label>
              <textarea className={s.textarea} rows={3} value={form.riscosIdentificados}
                onChange={e => set('riscosIdentificados', e.target.value)}
                placeholder="Descreva riscos identificados durante o DDS…" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Ações imediatas</label>
              <textarea className={s.textarea} rows={3} value={form.acoesImediatas}
                onChange={e => set('acoesImediatas', e.target.value)}
                placeholder="Ações corretivas ou preventivas definidas…" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Observações gerais</label>
              <textarea className={s.textarea} rows={2} value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Observações adicionais…" />
            </div>
          </div>

        </div>

        {/* ── Col 2 — Attendance ── */}
        <div className={s.formCol}>

          <div className={s.card}>
            <div className={s.cardTitle}>
              👥 Lista de Presença
              <span className={s.presCount}>{colaboradores.length} participantes</span>
            </div>

            {/* Add collaborator */}
            <div className={s.addColabRow}>
              <input
                className={s.input}
                placeholder="Nome do colaborador *"
                value={newColabNome}
                onChange={e => setNewColabNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColaborador()}
              />
              <input
                className={s.input}
                placeholder="Função (opcional)"
                value={newColabFuncao}
                onChange={e => setNewColabFuncao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColaborador()}
              />
              <button className={s.btnAdd} onClick={addColaborador}>+</button>
            </div>

            {/* Bulk sign */}
            {colaboradores.length > 0 && (
              <label className={s.bulkSign}>
                <input type="checkbox" checked={allSigned} onChange={e => toggleAllAssinou(e.target.checked)} />
                Marcar todos como assinados
              </label>
            )}

            {/* Collaborator list */}
            {colaboradores.length === 0 ? (
              <div className={s.emptyColab}>Nenhum participante adicionado ainda.</div>
            ) : (
              <div className={s.colabList}>
                {colaboradores.map((c, i) => (
                  <div key={i} className={s.colabRow}>
                    <label className={s.colabCheck}>
                      <input type="checkbox" checked={c.assinou} onChange={() => toggleAssinou(i)} />
                      <div className={s.colabInfo}>
                        <span className={s.colabNome}>{c.nome}</span>
                        {c.funcao && <span className={s.colabFuncao}>{c.funcao}</span>}
                      </div>
                    </label>
                    <button className={s.btnRemove} onClick={() => removeColab(i)}>×</button>
                  </div>
                ))}
              </div>
            )}

            {colaboradores.length > 0 && (
              <div className={s.assinSummary}>
                ✅ {colaboradores.filter(c => c.assinou).length} de {colaboradores.length} assinaram
              </div>
            )}
          </div>

          {/* Submit buttons */}
          <div className={s.submitRow}>
            <button className={s.btnDraft} disabled={loading} onClick={() => handleSubmit('rascunho')}>
              Salvar rascunho
            </button>
            <button className={s.btnSubmit} disabled={loading} onClick={() => handleSubmit('concluido')}>
              {loading ? <span className={s.spinner} /> : null}
              ✅ Concluir DDS
            </button>
          </div>

        </div>

      </div>
    </div>
  )
}
