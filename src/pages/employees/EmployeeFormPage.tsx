import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createEmployee, getEmployee, updateEmployee } from '@/lib/db-employees'
import type { Employee, TipoVinculo, Turno, NivelAcesso, StatusEmployee } from '@/types/employee'
import { SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './EmployeeFormPage.module.css'

type FormState = {
  nome:           string
  matricula:      string
  codigoInterno:  string
  cpf:            string
  rg:             string
  email:          string
  telefone:       string
  departamento:   string
  setor:          string
  cargo:          string
  supervisor:     string
  tipoVinculo:    TipoVinculo
  turno:          Turno
  nivelAcesso:    NivelAcesso
  status:         StatusEmployee
  dataAdmissao:   string
  observacoes:    string
}

const EMPTY: FormState = {
  nome: '', matricula: '', codigoInterno: '', cpf: '', rg: '',
  email: '', telefone: '', departamento: '', setor: '', cargo: '',
  supervisor: '', tipoVinculo: 'clt', turno: 'A', nivelAcesso: 'operador',
  status: 'ativo', dataAdmissao: new Date().toISOString().split('T')[0],
  observacoes: '',
}

export default function EmployeeFormPage() {
  const { id }        = useParams<{ id?: string }>()
  const navigate      = useNavigate()
  const isEdit        = Boolean(id)
  const [form, setForm]   = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!id) return
    getEmployee(id).then(emp => {
      if (!emp) { toast.error('Colaborador não encontrado.'); navigate('/colaboradores'); return }
      setForm({
        nome:          emp.nome,
        matricula:     emp.matricula,
        codigoInterno: emp.codigoInterno ?? '',
        cpf:           emp.cpf ?? '',
        rg:            emp.rg ?? '',
        email:         emp.email ?? '',
        telefone:      emp.telefone ?? '',
        departamento:  emp.departamento,
        setor:         emp.setor,
        cargo:         emp.cargo,
        supervisor:    emp.supervisor,
        tipoVinculo:   emp.tipoVinculo,
        turno:         emp.turno,
        nivelAcesso:   emp.nivelAcesso,
        status:        emp.status,
        dataAdmissao:  emp.dataAdmissao.toISOString().split('T')[0],
        observacoes:   emp.observacoes ?? '',
      })
    }).finally(() => setLoading(false))
  }, [id, navigate])

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!form.nome.trim())      { toast.error('Nome é obrigatório.'); return }
    if (!form.matricula.trim()) { toast.error('Matrícula é obrigatória.'); return }
    if (!form.setor)            { toast.error('Setor é obrigatório.'); return }
    if (!form.cargo.trim())     { toast.error('Cargo é obrigatório.'); return }
    if (!form.departamento.trim()) { toast.error('Departamento é obrigatório.'); return }

    setSaving(true)
    try {
      const payload = {
        nome:           form.nome.trim(),
        matricula:      form.matricula.trim(),
        codigoInterno:  form.codigoInterno || undefined,
        cpf:            form.cpf || undefined,
        rg:             form.rg || undefined,
        email:          form.email || undefined,
        telefone:       form.telefone || undefined,
        departamento:   form.departamento.trim(),
        setor:          form.setor as Employee['setor'],
        cargo:          form.cargo.trim(),
        supervisor:     form.supervisor.trim(),
        tipoVinculo:    form.tipoVinculo,
        turno:          form.turno,
        nivelAcesso:    form.nivelAcesso,
        status:         form.status,
        dataAdmissao:   new Date(form.dataAdmissao + 'T12:00:00'),
        observacoes:    form.observacoes || undefined,
      }

      if (isEdit && id) {
        await updateEmployee(id, payload)
        toast.success('Colaborador atualizado.')
        navigate(`/colaboradores/${id}`)
      } else {
        const newId = await createEmployee(payload)
        toast.success('Colaborador cadastrado.')
        navigate(`/colaboradores/${newId}`)
      }
    } catch { toast.error('Erro ao salvar. Tente novamente.') }
    finally  { setSaving(false) }
  }

  if (loading) return <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>{isEdit ? '✏️ Editar Colaborador' : '➕ Novo Colaborador'}</h1>
          <p className={s.pageSub}>{isEdit ? 'Atualize os dados do cadastro' : 'Preencha os dados para cadastrar'}</p>
        </div>
        <button className={s.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
      </div>

      <div className={s.formCard}>

        <div className={s.sectionTitle}>Identificação Pessoal</div>
        <div className={s.formGrid}>
          <div className={`${s.field} ${s.fieldFull}`}>
            <label className={s.label}>Nome Completo *</label>
            <input className={s.input} value={form.nome} onChange={e => setF('nome', e.target.value)} placeholder="Nome completo do colaborador" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Matrícula *</label>
            <input className={s.input} value={form.matricula} onChange={e => setF('matricula', e.target.value)} placeholder="EX-0001" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Código Interno</label>
            <input className={s.input} value={form.codigoInterno} onChange={e => setF('codigoInterno', e.target.value)} placeholder="Cód. sistema legado" />
          </div>
          <div className={s.field}>
            <label className={s.label}>CPF</label>
            <input className={s.input} value={form.cpf} onChange={e => setF('cpf', e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className={s.field}>
            <label className={s.label}>RG</label>
            <input className={s.input} value={form.rg} onChange={e => setF('rg', e.target.value)} placeholder="0000000-0" />
          </div>
          <div className={s.field}>
            <label className={s.label}>E-mail</label>
            <input type="email" className={s.input} value={form.email} onChange={e => setF('email', e.target.value)} placeholder="email@proraca.com.br" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Telefone</label>
            <input className={s.input} value={form.telefone} onChange={e => setF('telefone', e.target.value)} placeholder="(00) 9 0000-0000" />
          </div>
        </div>

        <div className={s.divider} />
        <div className={s.sectionTitle}>Dados Profissionais</div>
        <div className={s.formGrid}>
          <div className={s.field}>
            <label className={s.label}>Departamento *</label>
            <input className={s.input} value={form.departamento} onChange={e => setF('departamento', e.target.value)} placeholder="Ex: Produção Industrial" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Setor / Área *</label>
            <select className={s.input} value={form.setor} onChange={e => setF('setor', e.target.value)}>
              <option value="">Selecione…</option>
              {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Cargo *</label>
            <input className={s.input} value={form.cargo} onChange={e => setF('cargo', e.target.value)} placeholder="Ex: Operador de Produção I" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Supervisor direto</label>
            <input className={s.input} value={form.supervisor} onChange={e => setF('supervisor', e.target.value)} placeholder="Nome do supervisor" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Tipo de Vínculo</label>
            <select className={s.input} value={form.tipoVinculo} onChange={e => setF('tipoVinculo', e.target.value as TipoVinculo)}>
              <option value="clt">CLT</option>
              <option value="pj">PJ</option>
              <option value="temporario">Temporário</option>
              <option value="terceirizado">Terceirizado</option>
              <option value="estagiario">Estagiário</option>
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Turno</label>
            <select className={s.input} value={form.turno} onChange={e => setF('turno', e.target.value as Turno)}>
              <option value="A">Turno A</option>
              <option value="B">Turno B</option>
              <option value="C">Turno C</option>
              <option value="administrativo">Administrativo</option>
              <option value="externo">Externo</option>
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Nível de Acesso</label>
            <select className={s.input} value={form.nivelAcesso} onChange={e => setF('nivelAcesso', e.target.value as NivelAcesso)}>
              <option value="operador">Operador</option>
              <option value="lider">Líder</option>
              <option value="supervisor">Supervisor</option>
              <option value="gerente">Gerente</option>
              <option value="diretor">Diretor</option>
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Data de Admissão *</label>
            <input type="date" className={s.input} value={form.dataAdmissao} onChange={e => setF('dataAdmissao', e.target.value)} />
          </div>
          {isEdit && (
            <div className={s.field}>
              <label className={s.label}>Status</label>
              <select className={s.input} value={form.status} onChange={e => setF('status', e.target.value as StatusEmployee)}>
                <option value="ativo">Ativo</option>
                <option value="ferias">Férias</option>
                <option value="afastado">Afastado</option>
                <option value="inativo">Inativo</option>
                <option value="desligado">Desligado</option>
              </select>
            </div>
          )}
          <div className={`${s.field} ${s.fieldFull}`}>
            <label className={s.label}>Observações</label>
            <textarea className={s.textarea} rows={3} value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} placeholder="Informações adicionais sobre o colaborador…" />
          </div>
        </div>

        <div className={s.formActions}>
          <button className={s.btnCancel} onClick={() => navigate(-1)}>Cancelar</button>
          <button className={s.btnSave} disabled={saving} onClick={handleSave}>
            {saving ? <span className={s.spinner} /> : null}
            {isEdit ? 'Salvar alterações' : 'Cadastrar colaborador'}
          </button>
        </div>

      </div>
    </div>
  )
}
