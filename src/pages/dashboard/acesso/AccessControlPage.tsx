// src/pages/dashboard/acesso/AccessControlPage.tsx
// Access Control (IAM) — Security & governance control panel.
// Admin-only module. Manages users, roles, status and audit trail.

import {
  useState, useEffect, useCallback, useMemo, useRef,
  type FormEvent, type ChangeEvent,
} from 'react'
import { useStore } from '@/store/useStore'
import {
  fetchAllUsers,
  createSystemUser,
  updateUserRole,
  setUserStatus,
  setUserBlocked,
  deleteSystemUser,
  fetchAccessLogs,
  generateEmail,
  generatePassword,
  suggestAccessCode,
} from '@/lib/db-access-control'
import type {
  SystemUser, AnyRole, SystemRole, AccessLog,
  ModulePermission,
} from '@/types/access-control'
import {
  SYSTEM_ROLES, ROLE_META, PERMISSION_MATRIX,
  PERM_META, LOG_ACTION_META, isUserActive, isUserBlocked,
} from '@/types/access-control'
import s from './AccessControlPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const ROLE_COLS: SystemRole[] = ['admin', 'supervisor', 'operador', 'visualizador']

// ── Formatters ────────────────────────────────────────────────

function fmtRelative(date: Date | null | undefined): string {
  if (!date) return '—'
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'agora'
  if (mins < 60)  return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30)  return `${days}d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateTime(date: Date | null | undefined): string {
  if (!date) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Role Badge ────────────────────────────────────────────────

function RoleBadge({ role }: { role: AnyRole }) {
  const meta = ROLE_META[role] ?? ROLE_META.visualizador
  return (
    <span
      className={s.roleBadge}
      style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '33' }}
    >
      {meta.label}
    </span>
  )
}

// ── Status Badge ──────────────────────────────────────────────

function StatusBadge({ user }: { user: SystemUser }) {
  if (isUserBlocked(user)) {
    return <span className={`${s.statusBadge} ${s.statusBlocked}`}>Bloqueado</span>
  }
  if (!isUserActive(user)) {
    return <span className={`${s.statusBadge} ${s.statusInactive}`}>Inativo</span>
  }
  return <span className={`${s.statusBadge} ${s.statusActive}`}>Ativo</span>
}

// ── Perm Cell ─────────────────────────────────────────────────

function PermCell({ level }: { level: import('@/types/access-control').PermLevel }) {
  const m = PERM_META[level]
  return (
    <td>
      <span
        className={s.permCell}
        style={{ color: m.color, background: m.bg }}
        title={m.label}
      >
        {m.short}
      </span>
    </td>
  )
}

// ── User Avatar ───────────────────────────────────────────────

function Avatar({ nome, role, size = 36 }: { nome: string; role: AnyRole; size?: number }) {
  const initials = nome.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const color    = ROLE_META[role]?.color ?? '#475569'
  return (
    <div
      className={s.avatar}
      style={{ width: size, height: size, background: color + '22', color, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

// ── Confirm Modal ─────────────────────────────────────────────

interface ConfirmState {
  title:       string
  body:        string
  confirmText: string
  danger:      boolean
  onConfirm:   () => Promise<void>
}

function ConfirmModal({
  state, onClose,
}: {
  state:   ConfirmState
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try { await state.onConfirm() } finally { setLoading(false) }
    onClose()
  }

  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${s.modal} ${s.modalSm}`}>
        <div className={s.modalHeader}>
          <h2 className={s.modalTitle}>{state.title}</h2>
          <button className={s.modalClose} onClick={onClose} disabled={loading}>✕</button>
        </div>
        <div className={s.modalBody}>
          <p className={s.confirmBody}>{state.body}</p>
          <div className={s.auditNote}>
            <span>📋</span> Esta ação será registrada permanentemente no log de auditoria.
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className={state.danger ? s.btnDanger : s.btnPrimary}
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {loading ? '…' : state.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create User Modal ─────────────────────────────────────────

function CreateUserModal({
  usedCodes,
  adminUid,
  adminName,
  onCreated,
  onClose,
}: {
  usedCodes: Set<string>
  adminUid:  string
  adminName: string
  onCreated: (u: SystemUser) => void
  onClose:   () => void
}) {
  const [nome,            setNome]            = useState('')
  const [accessCode,      setAccessCode]      = useState('')
  const [role,            setRole]            = useState<SystemRole>('operador')
  const [cargo,           setCargo]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwd,         setShowPwd]         = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  const upperCode  = accessCode.toUpperCase()
  const email      = upperCode ? generateEmail(upperCode) : ''
  const codeTaken  = usedCodes.has(upperCode) && upperCode.length > 0
  const pwdMismatch = confirmPassword.length > 0 && password !== confirmPassword
  const pwdWeak     = password.length > 0 && password.length < 6
  const codeInvalid = upperCode.length > 0 && !/^[A-Z0-9_-]{2,12}$/.test(upperCode)

  function handleNomeChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setNome(v)
    if (!accessCode) setAccessCode(suggestAccessCode(v))
  }

  function genNewPassword() {
    const p = generatePassword()
    setPassword(p)
    setConfirmPassword(p)
  }

  const canSubmit = nome.trim().length >= 2
    && upperCode.length >= 2
    && !codeTaken
    && !codeInvalid
    && password.length >= 6
    && !pwdMismatch
    && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const result = await createSystemUser(
      { nome: nome.trim(), accessCode: upperCode, email, role, cargo, initialPassword: password },
      adminUid, adminName,
    )
    setLoading(false)
    if (!result.success) { setError(result.error ?? 'Erro desconhecido.'); return }
    onCreated({
      uid: result.uid!, nome: nome.trim(), email, accessCode: upperCode,
      role, cargo, active: true, blocked: false,
      lastLogin: null, lastSeen: null, createdAt: new Date(),
    })
    onClose()
  }

  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <h2 className={s.modalTitle}>➕ Novo Usuário</h2>
          <button className={s.modalClose} onClick={onClose} disabled={loading}>✕</button>
        </div>

        <form onSubmit={e => void handleSubmit(e)}>
          <div className={s.modalBody}>

            {error && <div className={s.formError}><span>⚠️</span> {error}</div>}

            <div className={s.formGrid}>

              <div className={s.formGroup}>
                <label className={s.label}>Nome completo *</label>
                <input
                  className={s.input}
                  value={nome}
                  onChange={handleNomeChange}
                  placeholder="Ex: João da Silva"
                  maxLength={60}
                  required
                  disabled={loading}
                />
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Código de acesso *</label>
                <input
                  className={`${s.input} ${s.inputMono} ${codeTaken || codeInvalid ? s.inputError : ''}`}
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value.toUpperCase())}
                  placeholder="Ex: JSILVA"
                  maxLength={12}
                  required
                  disabled={loading}
                />
                {codeTaken  && <div className={s.fieldError}>Código já em uso.</div>}
                {codeInvalid && !codeTaken && <div className={s.fieldError}>2–12 chars, apenas A-Z 0-9 - _</div>}
                {email && !codeTaken && !codeInvalid && (
                  <div className={s.fieldHint}>E-mail gerado: <code>{email}</code></div>
                )}
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Papel / Role *</label>
                <select
                  className={s.select}
                  value={role}
                  onChange={e => setRole(e.target.value as SystemRole)}
                  disabled={loading}
                >
                  {SYSTEM_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_META[r].label}</option>
                  ))}
                </select>
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Cargo / Função</label>
                <input
                  className={s.input}
                  value={cargo}
                  onChange={e => setCargo(e.target.value)}
                  placeholder="Ex: Auxiliar de Produção"
                  maxLength={60}
                  disabled={loading}
                />
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>
                  Senha inicial *
                  <button type="button" className={s.genBtn} onClick={genNewPassword} disabled={loading}>
                    Gerar
                  </button>
                </label>
                <div className={s.inputRow}>
                  <input
                    className={`${s.input} ${s.inputMono} ${pwdWeak ? s.inputError : ''}`}
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                    disabled={loading}
                  />
                  <button type="button" className={s.eyeBtn} onClick={() => setShowPwd(p => !p)}>
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
                {pwdWeak && <div className={s.fieldError}>Mínimo 6 caracteres.</div>}
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Confirmar senha *</label>
                <input
                  className={`${s.input} ${s.inputMono} ${pwdMismatch ? s.inputError : ''}`}
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  required
                  disabled={loading}
                />
                {pwdMismatch && <div className={s.fieldError}>Senhas não coincidem.</div>}
              </div>

            </div>

            <div className={s.securityNote}>
              <span>🔒</span>
              <div>
                <strong>Nota de segurança:</strong> O usuário fará login com o código de acesso e a
                senha definida acima. O e-mail gerado é interno e nunca é exposto ao usuário.
                Compartilhe as credenciais por canal seguro.
              </div>
            </div>

          </div>

          <div className={s.modalFooter}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={s.btnPrimary} disabled={!canSubmit}>
              {loading ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── User Detail Panel ─────────────────────────────────────────

function UserDetailPanel({
  user,
  currentAdminUid,
  onClose,
  onRoleChange,
  onStatusChange,
  onBlockChange,
  onDelete,
}: {
  user:             SystemUser
  currentAdminUid:  string
  onClose:          () => void
  onRoleChange:     (uid: string, newRole: SystemRole) => void
  onStatusChange:   (uid: string, active: boolean) => void
  onBlockChange:    (uid: string, blocked: boolean) => void
  onDelete:         (uid: string) => void
}) {
  const [changingRole, setChangingRole] = useState(false)
  const [newRole,      setNewRole]      = useState<SystemRole>('operador')
  const isSelf    = user.uid === currentAdminUid
  const active    = isUserActive(user)
  const blocked   = isUserBlocked(user)

  function startRoleChange() {
    const current = SYSTEM_ROLES.includes(user.role as SystemRole) ? user.role as SystemRole : 'operador'
    setNewRole(current)
    setChangingRole(true)
  }


  return (
    <div className={s.detailPanel}>
      <div className={s.detailHeader}>
        <div className={s.detailHeaderLeft}>
          <Avatar nome={user.nome} role={user.role} size={44} />
          <div>
            <div className={s.detailName}>{user.nome}</div>
            <div className={s.detailMeta}>
              <RoleBadge role={user.role} />
              <StatusBadge user={user} />
            </div>
          </div>
        </div>
        <button className={s.detailClose} onClick={onClose}>✕</button>
      </div>

      <div className={s.detailBody}>

        {/* Info grid */}
        <div className={s.detailInfo}>
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Código de acesso</span>
            <code className={s.infoCode}>{user.accessCode || '—'}</code>
          </div>
          {user.cargo && (
            <div className={s.infoRow}>
              <span className={s.infoLabel}>Cargo</span>
              <span className={s.infoValue}>{user.cargo}</span>
            </div>
          )}
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Último login</span>
            <span className={s.infoValue}>{fmtDateTime(user.lastLogin)}</span>
          </div>
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Última atividade</span>
            <span className={s.infoValue}>{fmtDateTime(user.lastSeen)}</span>
          </div>
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Criado em</span>
            <span className={s.infoValue}>{fmtDateTime(user.createdAt)}</span>
          </div>
          <div className={s.infoRow}>
            <span className={s.infoLabel}>UID Firebase</span>
            <code className={s.infoUid} title={user.uid}>{user.uid.slice(0, 20)}…</code>
          </div>
        </div>

        {/* Module access */}
        <div className={s.detailSection}>
          <div className={s.detailSectionTitle}>Acesso a módulos</div>
          <div className={s.permList}>
            {PERMISSION_MATRIX.map(p => {
              const level = (p[user.role as keyof ModulePermission] ?? 'none') as import('@/types/access-control').PermLevel
              const meta  = PERM_META[level]
              return (
                <div key={p.module} className={s.permItem}>
                  <span className={s.permIcon}>{p.icon}</span>
                  <span className={s.permLabel}>{p.label}</span>
                  <span
                    className={s.permLevel}
                    style={{ color: meta.color, background: meta.bg }}
                  >
                    {meta.short}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        {!isSelf && (
          <div className={s.detailSection}>
            <div className={s.detailSectionTitle}>Ações de controle</div>
            <div className={s.actionGrid}>

              {/* Change role */}
              {!changingRole ? (
                <button className={s.actionBtn} onClick={startRoleChange}>
                  🔄 Alterar papel
                </button>
              ) : (
                <div className={s.roleChangeRow}>
                  <select
                    className={s.select}
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as SystemRole)}
                  >
                    {SYSTEM_ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_META[r].label}</option>
                    ))}
                  </select>
                  <button
                    className={s.btnPrimary}
                    onClick={() => { setChangingRole(false); onRoleChange(user.uid, newRole) }}
                    disabled={newRole === user.role}
                  >
                    Aplicar
                  </button>
                  <button className={s.btnSecondary} onClick={() => setChangingRole(false)}>
                    ✕
                  </button>
                </div>
              )}

              {/* Activate / Deactivate */}
              <button
                className={active && !blocked ? s.actionBtnWarn : s.actionBtnGood}
                onClick={() => onStatusChange(user.uid, !active)}
              >
                {active && !blocked ? '🚫 Desativar acesso' : '✅ Ativar acesso'}
              </button>

              {/* Block / Unblock */}
              <button
                className={blocked ? s.actionBtnGood : s.actionBtnDanger}
                onClick={() => onBlockChange(user.uid, !blocked)}
              >
                {blocked ? '🔓 Remover bloqueio' : '🔒 Bloquear usuário'}
              </button>

              {/* Delete */}
              <button
                className={s.actionBtnDanger}
                onClick={() => onDelete(user.uid)}
              >
                🗑️ Remover do sistema
              </button>

            </div>

            {isSelf && (
              <p className={s.selfNote}>Você não pode modificar sua própria conta.</p>
            )}
          </div>
        )}

        {isSelf && (
          <div className={s.selfNote} style={{ padding: '12px 0' }}>
            🛡️ Você não pode modificar sua própria conta de administrador.
          </div>
        )}

      </div>
    </div>
  )
}

// ── Access Logs Section ───────────────────────────────────────

function AccessLogsSection({
  logs,
  loading,
  filterUid,
}: {
  logs:      AccessLog[]
  loading:   boolean
  filterUid?: string
}) {
  const visible = filterUid ? logs.filter(l => l.userId === filterUid) : logs

  if (loading) {
    return (
      <div className={s.logsEmpty}>
        <div className={s.skeletonCell} style={{ height: 14, width: '60%', marginBottom: 8 }} />
        <div className={s.skeletonCell} style={{ height: 14, width: '45%' }} />
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className={s.logsEmpty}>
        <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>📋</span>
        <span>Nenhum evento registrado{filterUid ? ' para este usuário' : ''}.</span>
      </div>
    )
  }

  return (
    <div className={s.logList}>
      {visible.map(log => {
        const meta = LOG_ACTION_META[log.action]
        return (
          <div key={log.id} className={s.logItem}>
            <div className={s.logIcon} style={{ background: meta.color + '18', color: meta.color }}>
              {meta.icon}
            </div>
            <div className={s.logBody}>
              <div className={s.logAction} style={{ color: meta.color }}>{meta.label}</div>
              <div className={s.logWho}>
                <strong>{log.userName}</strong>
                {log.userAccessCode && <code className={s.logCode}>{log.userAccessCode}</code>}
                {log.details?.from && log.details?.to && (
                  <span className={s.logDetail}> · {log.details.from} → {log.details.to}</span>
                )}
              </div>
              <div className={s.logMeta}>
                Por <strong>{log.performedByName}</strong> · {fmtDateTime(log.timestamp)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Permission Matrix Section ─────────────────────────────────

function PermissionMatrixSection() {
  return (
    <div className={s.matrixWrap}>
      <table className={s.matrixTable}>
        <thead>
          <tr>
            <th>Módulo</th>
            {ROLE_COLS.map(r => (
              <th key={r} style={{ color: ROLE_META[r].color }}>{ROLE_META[r].label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MATRIX.map(p => (
            <tr key={p.module}>
              <td>
                <span className={s.matrixModule}>
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </span>
                {p.note && <div className={s.matrixNote}>{p.note}</div>}
              </td>
              {ROLE_COLS.map(r => (
                <PermCell key={r} level={p[r]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={s.matrixLegend}>
        {Object.entries(PERM_META).map(([key, meta]) => (
          <div key={key} className={s.legendItem}>
            <span
              className={s.permCell}
              style={{ color: meta.color, background: meta.bg }}
            >
              {meta.short}
            </span>
            <span className={s.legendLabel}>{meta.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function AccessControlPage() {
  const adminUser = useStore(st => st.user)
  const adminUid  = adminUser?.uid  ?? ''
  const adminName = adminUser?.nome ?? 'Admin'

  const [users,        setUsers]        = useState<SystemUser[]>([])
  const [logs,         setLogs]         = useState<AccessLog[]>([])
  const [loading,      setLoading]      = useState(true)
  const [logsLoading,  setLogsLoading]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState<AnyRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'blocked'>('all')
  const [selectedUid,  setSelectedUid]  = useState<string | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)
  const [confirm,      setConfirm]      = useState<ConfirmState | null>(null)
  const [showLogs,     setShowLogs]     = useState(false)
  const [showMatrix,   setShowMatrix]   = useState(false)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load data ──────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllUsers()
      setUsers(data)
    } catch {
      setError('Erro ao carregar usuários. Verifique permissões e conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const data = await fetchAccessLogs(undefined, 60)
      setLogs(data)
    } catch {
      // Non-fatal
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  useEffect(() => {
    if (showLogs && logs.length === 0) void loadLogs()
  }, [showLogs, logs.length, loadLogs])

  function flash(msg: string) {
    setSuccessMsg(msg)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3500)
  }

  // ── Derived data ───────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter === 'active'   && !isUserActive(u))  return false
      if (statusFilter === 'inactive' && isUserActive(u))   return false
      if (statusFilter === 'blocked'  && !isUserBlocked(u)) return false
      if (!q) return true
      return (
        u.nome.toLowerCase().includes(q) ||
        u.accessCode.toLowerCase().includes(q) ||
        (u.cargo ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter, statusFilter])

  const selectedUser = useMemo(
    () => users.find(u => u.uid === selectedUid) ?? null,
    [users, selectedUid],
  )

  const usedCodes = useMemo(() => new Set(users.map(u => u.accessCode)), [users])

  const kpis = useMemo(() => {
    const total    = users.length
    const active   = users.filter(isUserActive).length
    const inactive = users.filter(u => !isUserActive(u)).length
    const admins   = users.filter(u => u.role === 'admin').length
    const blocked  = users.filter(isUserBlocked).length
    return { total, active, inactive, admins, blocked }
  }, [users])

  const securityAlerts = useMemo(() => {
    const alerts: string[] = []
    if (kpis.blocked > 0)
      alerts.push(`${kpis.blocked} usuário${kpis.blocked > 1 ? 's' : ''} bloqueado${kpis.blocked > 1 ? 's' : ''}`)
    if (kpis.inactive > 0)
      alerts.push(`${kpis.inactive} conta${kpis.inactive > 1 ? 's' : ''} inativa${kpis.inactive > 1 ? 's' : ''}`)
    const legacyRoles = users.filter(u => ['maintenance','operations','purchasing'].includes(u.role))
    if (legacyRoles.length > 0)
      alerts.push(`${legacyRoles.length} usuário${legacyRoles.length > 1 ? 's' : ''} com papel legado`)
    return alerts
  }, [kpis, users])

  // ── Action handlers ────────────────────────────────────────

  function handleRoleChange(uid: string, newRole: SystemRole) {
    const target = users.find(u => u.uid === uid)
    if (!target || newRole === target.role) return
    setConfirm({
      title:       'Alterar Papel de Usuário',
      body:        `Alterar o papel de "${target.nome}" de "${ROLE_META[target.role]?.label}" para "${ROLE_META[newRole].label}"?\n\nIsso muda imediatamente os módulos que esse usuário pode acessar.`,
      confirmText: 'Alterar papel',
      danger:      false,
      onConfirm:   async () => {
        await updateUserRole(uid, target.nome, target.accessCode, newRole, target.role, adminUid, adminName)
        setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: newRole } : u))
        if (selectedUid === uid) setSelectedUid(uid) // re-render detail
        flash(`Papel de ${target.nome} alterado para ${ROLE_META[newRole].label}.`)
      },
    })
  }

  function handleStatusChange(uid: string, active: boolean) {
    const target = users.find(u => u.uid === uid)
    if (!target) return
    setConfirm({
      title:       active ? 'Ativar Acesso' : 'Desativar Acesso',
      body:        active
        ? `Reativar o acesso de "${target.nome}"? O usuário poderá fazer login imediatamente.`
        : `Desativar o acesso de "${target.nome}"? O usuário não conseguirá mais fazer login.`,
      confirmText: active ? 'Ativar acesso' : 'Desativar acesso',
      danger:      !active,
      onConfirm:   async () => {
        await setUserStatus(uid, target.nome, target.accessCode, active, adminUid, adminName)
        setUsers(prev => prev.map(u => u.uid === uid ? { ...u, active } : u))
        flash(`Acesso de ${target.nome} ${active ? 'ativado' : 'desativado'}.`)
      },
    })
  }

  function handleBlockChange(uid: string, blocked: boolean) {
    const target = users.find(u => u.uid === uid)
    if (!target) return
    setConfirm({
      title:       blocked ? 'Bloquear Usuário' : 'Remover Bloqueio',
      body:        blocked
        ? `Bloquear "${target.nome}"? O acesso será negado imediatamente mesmo que as credenciais estejam corretas.`
        : `Remover o bloqueio de "${target.nome}"? O usuário poderá fazer login novamente.`,
      confirmText: blocked ? 'Bloquear' : 'Remover bloqueio',
      danger:      blocked,
      onConfirm:   async () => {
        await setUserBlocked(uid, target.nome, target.accessCode, blocked, adminUid, adminName)
        setUsers(prev => prev.map(u => u.uid === uid ? { ...u, blocked } : u))
        flash(`Usuário ${target.nome} ${blocked ? 'bloqueado' : 'desbloqueado'}.`)
      },
    })
  }

  function handleDelete(uid: string) {
    const target = users.find(u => u.uid === uid)
    if (!target) return
    setConfirm({
      title:       '🚨 Remover Usuário do Sistema',
      body:        `O perfil de "${target.nome}" (${target.accessCode}) será permanentemente removido do Firestore. O acesso por código de acesso será revogado imediatamente.\n\n⚠️ A conta Firebase Auth deve ser excluída manualmente via Firebase Console.`,
      confirmText: 'Remover usuário',
      danger:      true,
      onConfirm:   async () => {
        await deleteSystemUser(uid, target.nome, target.accessCode, adminUid, adminName)
        setUsers(prev => prev.filter(u => u.uid !== uid))
        if (selectedUid === uid) setSelectedUid(null)
        flash(`Usuário ${target.nome} removido.`)
      },
    })
  }

  function handleUserCreated(u: SystemUser) {
    setUsers(prev => [...prev, u].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    flash(`Usuário ${u.nome} criado com sucesso.`)
    if (showLogs) void loadLogs()
  }

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>
              <span className={s.headerIcon}>🔐</span>
              Controle de Acesso
            </h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerRight}>
            <div className={s.securityBadge}>
              <span>🛡️</span> Área Restrita — Admin
            </div>
            <button
              className={s.createBtn}
              onClick={() => setShowCreate(true)}
              disabled={loading}
            >
              + Novo usuário
            </button>
          </div>
        </div>
      </div>

      {/* ── Security alerts ── */}
      {!loading && securityAlerts.length > 0 && (
        <div className={s.secAlertBar}>
          <span className={s.secAlertIcon}>⚠️</span>
          <span className={s.secAlertText}>
            {securityAlerts.join(' · ')}
          </span>
        </div>
      )}

      {/* ── Success toast ── */}
      {successMsg && (
        <div className={s.successToast}>
          <span>✅</span> {successMsg}
        </div>
      )}

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void loadUsers()}>Recarregar</button>
          </div>
        )}

        {/* ── KPI strip ── */}
        <div className={s.kpiStrip}>
          <div className={s.kpiCard}>
            <div className={s.kpiAccent} style={{ background: '#2563eb' }} />
            <div className={s.kpiValue}>{loading ? '—' : kpis.total}</div>
            <div className={s.kpiLabel}>Total de usuários</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiAccent} style={{ background: '#16a34a' }} />
            <div className={s.kpiValue} style={{ color: '#16a34a' }}>{loading ? '—' : kpis.active}</div>
            <div className={s.kpiLabel}>Contas ativas</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiAccent} style={{ background: '#ea580c' }} />
            <div className={s.kpiValue} style={{ color: kpis.inactive > 0 ? '#ea580c' : undefined }}>
              {loading ? '—' : kpis.inactive}
            </div>
            <div className={s.kpiLabel}>Contas inativas</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiAccent} style={{ background: '#dc2626' }} />
            <div className={s.kpiValue} style={{ color: kpis.blocked > 0 ? '#dc2626' : undefined }}>
              {loading ? '—' : kpis.blocked}
            </div>
            <div className={s.kpiLabel}>Bloqueados</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiAccent} style={{ background: '#2563eb' }} />
            <div className={s.kpiValue} style={{ color: '#2563eb' }}>{loading ? '—' : kpis.admins}</div>
            <div className={s.kpiLabel}>Administradores</div>
          </div>
        </div>

        {/* ── Main split panel ── */}
        <div className={`${s.mainPanel} ${selectedUser ? s.mainPanelSplit : ''}`}>

          {/* Users list */}
          <div className={s.usersSection}>

            {/* Toolbar */}
            <div className={s.toolbar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar por nome, código ou cargo…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select
                className={s.filterSelect}
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as AnyRole | 'all')}
              >
                <option value="all">Todos os papéis</option>
                {SYSTEM_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_META[r].label}</option>
                ))}
              </select>
              <select
                className={s.filterSelect}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="blocked">Bloqueados</option>
              </select>
              {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
                <button
                  className={s.clearBtn}
                  onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all') }}
                >
                  Limpar filtros
                </button>
              )}
              <span className={s.countBadge}>
                {loading ? '…' : `${filteredUsers.length}/${users.length}`}
              </span>
            </div>

            {/* Table */}
            {loading ? (
              <div className={s.tableWrap}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className={s.skeletonRow}>
                    <div className={s.skeletonCell} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                    <div className={s.skeletonCell} style={{ flex: 2 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className={s.emptyState}>
                <span className={s.emptyIcon}>👤</span>
                <span className={s.emptyText}>
                  {users.length === 0 ? 'Nenhum usuário encontrado.' : 'Nenhum usuário corresponde aos filtros.'}
                </span>
              </div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.userTable}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Nome / Cargo</th>
                      <th>Código</th>
                      <th>Papel</th>
                      <th>Status</th>
                      <th>Último login</th>
                      <th>Atividade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr
                        key={u.uid}
                        className={`${s.userRow} ${selectedUid === u.uid ? s.userRowActive : ''} ${!isUserActive(u) ? s.userRowInactive : ''}`}
                        onClick={() => setSelectedUid(selectedUid === u.uid ? null : u.uid)}
                      >
                        <td style={{ width: 48 }}>
                          <Avatar nome={u.nome} role={u.role} size={32} />
                        </td>
                        <td>
                          <div className={s.userName}>{u.nome}</div>
                          {u.cargo && <div className={s.userCargo}>{u.cargo}</div>}
                        </td>
                        <td>
                          <code className={s.codeCell}>{u.accessCode || '—'}</code>
                        </td>
                        <td><RoleBadge role={u.role} /></td>
                        <td><StatusBadge user={u} /></td>
                        <td>
                          <span className={s.timeCell}>{fmtRelative(u.lastLogin)}</span>
                        </td>
                        <td>
                          <span className={s.timeCell}>{fmtRelative(u.lastSeen)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedUser && (
            <UserDetailPanel
              user={selectedUser}
              currentAdminUid={adminUid}
              onClose={() => setSelectedUid(null)}
              onRoleChange={handleRoleChange}
              onStatusChange={handleStatusChange}
              onBlockChange={handleBlockChange}
              onDelete={handleDelete}
            />
          )}

        </div>

        {/* ── Access Logs Section ── */}
        <div className={s.collapsibleSection}>
          <button
            className={s.collapsibleToggle}
            onClick={() => setShowLogs(p => !p)}
          >
            <span>📋 Log de Auditoria</span>
            <span className={s.toggleIcon}>{showLogs ? '▲' : '▼'}</span>
            {logs.length > 0 && <span className={s.sectionBadge}>{logs.length}</span>}
          </button>
          {showLogs && (
            <div className={s.collapsibleBody}>
              <div className={s.logsToolbar}>
                <span className={s.logsHint}>
                  Últimos {logs.length} eventos administrativos
                </span>
                <button
                  className={s.btnSmall}
                  onClick={() => void loadLogs()}
                  disabled={logsLoading}
                >
                  {logsLoading ? '…' : '↺ Atualizar'}
                </button>
              </div>
              <AccessLogsSection logs={logs} loading={logsLoading} />
            </div>
          )}
        </div>

        {/* ── Permission Matrix Section ── */}
        <div className={s.collapsibleSection}>
          <button
            className={s.collapsibleToggle}
            onClick={() => setShowMatrix(p => !p)}
          >
            <span>🗺️ Matriz de Permissões</span>
            <span className={s.toggleIcon}>{showMatrix ? '▲' : '▼'}</span>
          </button>
          {showMatrix && (
            <div className={s.collapsibleBody}>
              <PermissionMatrixSection />
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateUserModal
          usedCodes={usedCodes}
          adminUid={adminUid}
          adminName={adminName}
          onCreated={handleUserCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {confirm && (
        <ConfirmModal
          state={confirm}
          onClose={() => setConfirm(null)}
        />
      )}

    </div>
  )
}
