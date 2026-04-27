import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEPIFicha, addEPIEntrega } from '@/lib/db-safety'
import { useStore } from '@/store/useStore'
import type { EPIFicha, EPIEntrega } from '@/types/safety'
import { STATUS_FICHA_META, NIVEL_RISCO_META } from '@/types/safety'
import { EPI_ITENS_FLAT, EPI_CATALOG } from '@/data/epi-catalog'
import { toast } from '@/components/ui/Toast'
import s from './EPIFichaPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function isExpired(d: Date | undefined): boolean {
  if (!d) return false
  return d < new Date()
}

function isExpiringSoon(d: Date | undefined): boolean {
  if (!d) return false
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  return d > now && d < in30
}

const EMPTY_ENTREGA = {
  epiId: '',
  epiNome: '',
  numeroCa: '',
  quantidade: 1,
  condicao: 'novo' as EPIEntrega['condicao'],
  areaObrigatoria: '',
  assinaturaColaborador: false,
  assinaturaResponsavel: false,
  responsavelNome: '',
  observacoes: '',
  dataVencimentoStr: '',
}

export default function EPIFichaPage() {
  const navigate   = useNavigate()
  const { id }     = useParams<{ id: string }>()
  const user       = useStore(st => st.user)

  const [ficha, setFicha]           = useState<EPIFicha | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [activeTab, setActiveTab]   = useState<'entregas' | 'info'>('entregas')
  const [entrega, setEntrega]       = useState(EMPTY_ENTREGA)

  useEffect(() => {
    if (!id) return
    getEPIFicha(id).then(f => {
      if (!f) { toast.error('Ficha não encontrada.'); navigate('/seguranca/epi'); return }
      setFicha(f)
      setLoading(false)
    })
  }, [id, navigate])

  function setE(k: keyof typeof EMPTY_ENTREGA, v: unknown) {
    setEntrega(prev => ({ ...prev, [k]: v }))
  }

  function handleEPISelect(epiId: string) {
    const item = EPI_ITENS_FLAT.find(e => e.id === epiId)
    if (!item) return
    const venc = item.vidaUtilMeses > 0
      ? new Date(Date.now() + item.vidaUtilMeses * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : ''
    setEntrega(prev => ({
      ...prev,
      epiId: item.id,
      epiNome: item.nome,
      numeroCa: item.numeroCaRef,
      areaObrigatoria: item.areas[0] ?? '',
      dataVencimentoStr: venc,
    }))
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
        dataVencimento:        entrega.dataVencimentoStr ? new Date(entrega.dataVencimentoStr + 'T12:00:00') : undefined,
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

  if (loading) return <div className={s.loadingWrap}><div className={s.spinner} /></div>
  if (!ficha) return null

  const meta = STATUS_FICHA_META[ficha.statusFicha]
  const riskMeta = NIVEL_RISCO_META[ficha.classificacaoRisco]

  return (
    <div className={s.page}>

      {/* ── Hero ── */}
      <div className={s.hero}>
        <button className={s.btnBack} onClick={() => navigate('/seguranca/epi')}>← Voltar</button>

        <div className={s.heroCard}>
          <div className={s.heroAvatar}>{ficha.colaboradorNome[0]?.toUpperCase()}</div>
          <div className={s.heroInfo}>
            <h1 className={s.heroName}>{ficha.colaboradorNome}</h1>
            <div className={s.heroMeta}>
              <span>{ficha.funcao}</span>
              <span className={s.heroDot}>·</span>
              <span>{ficha.setor}</span>
              <span className={s.heroDot}>·</span>
              <span className={s.matTag}>Mat. {ficha.matricula}</span>
            </div>
          </div>
          <div className={s.heroRight}>
            <span className={s.statusBadge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
            <span className={s.riskBadge} style={{ color: riskMeta.color, background: riskMeta.bg }}>Risco {riskMeta.label}</span>
          </div>
        </div>

        {/* Alert banners */}
        {ficha.totalEpisVencidos > 0 && (
          <div className={s.alertBanner} data-level="danger">
            ❌ <strong>{ficha.totalEpisVencidos} EPI(s) vencido(s)</strong> — regularizar imediatamente.
          </div>
        )}
        {ficha.totalEpisAVencer > 0 && (
          <div className={s.alertBanner} data-level="warning">
            ⚠️ <strong>{ficha.totalEpisAVencer} EPI(s)</strong> vencem nos próximos 30 dias.
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        <button className={`${s.tab} ${activeTab === 'entregas' ? s.tabActive : ''}`} onClick={() => setActiveTab('entregas')}>
          🦺 Entregas de EPI ({ficha.entregas.length})
        </button>
        <button className={`${s.tab} ${activeTab === 'info' ? s.tabActive : ''}`} onClick={() => setActiveTab('info')}>
          👤 Dados do Colaborador
        </button>
      </div>

      {/* ── Tab: Entregas ── */}
      {activeTab === 'entregas' && (
        <div className={s.tabContent}>
          <div className={s.listHeader}>
            <span className={s.listTitle}>Histórico de entregas</span>
            <button className={s.btnAdd} onClick={() => setShowForm(v => !v)}>
              {showForm ? '× Cancelar' : '+ Registrar entrega'}
            </button>
          </div>

          {/* New entrega form */}
          {showForm && (
            <div className={s.entregaForm}>
              <div className={s.formTitle}>Nova entrega de EPI</div>

              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>EPI (catálogo)</label>
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
                  <input className={s.input} value={entrega.epiNome} onChange={e => setE('epiNome', e.target.value)} placeholder="Nome do equipamento" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Número CA</label>
                  <input className={s.input} value={entrega.numeroCa} onChange={e => setE('numeroCa', e.target.value)} placeholder="CA do fabricante" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Validade</label>
                  <input type="date" className={s.input} value={entrega.dataVencimentoStr} onChange={e => setE('dataVencimentoStr', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Qtd</label>
                  <input type="number" min={1} className={s.input} value={entrega.quantidade} onChange={e => setE('quantidade', Number(e.target.value))} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Condição</label>
                  <select className={s.input} value={entrega.condicao} onChange={e => setE('condicao', e.target.value)}>
                    <option value="novo">Novo</option>
                    <option value="bom">Bom</option>
                    <option value="regular">Regular</option>
                    <option value="danificado">Danificado</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Responsável</label>
                  <input className={s.input} value={entrega.responsavelNome} onChange={e => setE('responsavelNome', e.target.value)} placeholder={user?.nome ?? ''} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Observações</label>
                  <input className={s.input} value={entrega.observacoes} onChange={e => setE('observacoes', e.target.value)} placeholder="Observações opcionais" />
                </div>
              </div>

              <div className={s.checkRow}>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={entrega.assinaturaColaborador} onChange={e => setE('assinaturaColaborador', e.target.checked)} />
                  Colaborador assinou o recibo
                </label>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={entrega.assinaturaResponsavel} onChange={e => setE('assinaturaResponsavel', e.target.checked)} />
                  Responsável assinou o recibo
                </label>
              </div>

              <button className={s.btnSave} disabled={saving} onClick={handleAddEntrega}>
                {saving ? <span className={s.spinnerSm} /> : null} Registrar entrega
              </button>
            </div>
          )}

          {/* Entregas list */}
          {ficha.entregas.length === 0 ? (
            <div className={s.empty}>Nenhum EPI registrado nesta ficha.</div>
          ) : (
            <div className={s.entregaList}>
              {ficha.entregas.map((e, i) => {
                const expired     = isExpired(e.dataVencimento)
                const expiringSoon = isExpiringSoon(e.dataVencimento)
                return (
                  <div key={i} className={`${s.entregaRow} ${expired ? s.entregaExpired : expiringSoon ? s.entregaWarning : ''}`}>
                    <div className={s.entregaMain}>
                      <span className={s.entregaNome}>{e.epiNome}</span>
                      {e.numeroCa && <span className={s.caTag}>CA {e.numeroCa}</span>}
                    </div>
                    <div className={s.entregaMeta}>
                      <span>Entregue: {fmt(e.dataEntrega)}</span>
                      <span>Vence: {fmt(e.dataVencimento)}</span>
                      <span>Qtd: {e.quantidade}</span>
                      <span className={s.condicaoTag} data-cond={e.condicao}>{e.condicao}</span>
                    </div>
                    <div className={s.entregaSigns}>
                      <span className={e.assinaturaColaborador ? s.signOk : s.signNo}>
                        {e.assinaturaColaborador ? '✅' : '⬜'} Colaborador
                      </span>
                      <span className={e.assinaturaResponsavel ? s.signOk : s.signNo}>
                        {e.assinaturaResponsavel ? '✅' : '⬜'} Responsável
                      </span>
                    </div>
                    {expired && <span className={s.expiredTag}>VENCIDO</span>}
                    {expiringSoon && !expired && <span className={s.warningTag}>A VENCER</span>}
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
            <div className={s.infoRow}><span className={s.infoKey}>Supervisor</span><span>{ficha.supervisor}</span></div>
            <div className={s.infoRow}><span className={s.infoKey}>Departamento</span><span>{ficha.departamento}</span></div>
            <div className={s.infoRow}><span className={s.infoKey}>Admissão</span><span>{fmt(ficha.dataAdmissao)}</span></div>
            <div className={s.infoRow}><span className={s.infoKey}>Ativo</span><span>{ficha.ativo ? '✅ Sim' : '❌ Não'}</span></div>
            {ficha.observacoes && (
              <div className={s.infoRow}><span className={s.infoKey}>Observações</span><span>{ficha.observacoes}</span></div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
