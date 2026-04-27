import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore }    from '@/store/useStore'
import { loginWithAccessCode, LOGIN_ERROR_MESSAGES } from '@/lib/auth'
import { toast } from '@/components/ui/Toast'
import s from './LoginPage.module.css'

// Detect common Firestore-blocking extensions via a heuristic:
// uBlock / Brave Shields intercept fetch to *.firebaseio.com
function detectPossibleBlocker(): boolean {
  try {
    const ua = navigator.userAgent.toLowerCase()
    // Brave exposes navigator.brave
    if ('brave' in navigator) return true
    void ua // silence lint
  } catch { /* ignore */ }
  return false
}

// ── Module list shown on left panel ─────────────────────
const MODULES = [
  { icon: '🏭', label: 'Ativos Patrimoniais', color: '#16A34A', bg: 'rgba(22,163,74,0.15)'  },
  { icon: '🔧', label: 'Manutenção CMMS',     color: '#166534', bg: 'rgba(22,101,52,0.15)'  },
  { icon: '📋', label: 'Ordens de Serviço',   color: '#EA580C', bg: 'rgba(234,88,12,0.15)'  },
  { icon: '🛒', label: 'Pedidos de Compra',   color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
  { icon: '🚛', label: 'Gestão de Frota',     color: '#166534', bg: 'rgba(22,101,52,0.15)'  },
  { icon: '✅', label: 'Limpeza 5S',          color: '#16A34A', bg: 'rgba(22,163,74,0.15)'  },
  { icon: '📦', label: 'Inventário',          color: '#EA580C', bg: 'rgba(234,88,12,0.15)'  },
  { icon: '🏷️',  label: 'Fornecedores',       color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
]

// ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate  = useNavigate()
  const user      = useStore(s => s.user)
  const authReady = useStore(s => s.authReady)

  // If already authenticated, redirect to home
  useEffect(() => {
    if (authReady && user) {
      navigate('/', { replace: true })
    }
  }, [authReady, user, navigate])

  // ── Form state ────────────────────────────────────────
  const [accessCode,    setAccessCode]    = useState('')
  const [password,      setPassword]      = useState('')
  const [rememberMe,    setRememberMe]    = useState(false)
  const [showPassword,  setShowPassword]  = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [codeError,     setCodeError]     = useState('')
  const [passError,     setPassError]     = useState('')

  const [blockerWarning, setBlockerWarning] = useState(false)
  const submitting = useRef(false)
  const codeRef    = useRef<HTMLInputElement>(null)

  // Show a one-time warning if Brave Shields is detected
  useEffect(() => {
    if (detectPossibleBlocker()) setBlockerWarning(true)
  }, [])

  // ── Submit handler ────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Prevent double-submit
    if (submitting.current || loading) return
    submitting.current = true

    // Client-side validation
    let hasError = false
    setCodeError('')
    setPassError('')

    const trimmedCode = accessCode.trim()
    const trimmedPass = password.trim()

    if (!trimmedCode) {
      setCodeError('Informe o código de acesso.')
      hasError = true
    }
    if (!trimmedPass) {
      setPassError('Informe a senha.')
      hasError = true
    }

    if (hasError) {
      submitting.current = false
      return
    }

    setLoading(true)

    try {
      const result = await loginWithAccessCode(trimmedCode, trimmedPass, rememberMe)

      if (result.success) {
        // onAuthStateChanged (subscribed at App root) will fire, update store,
        // and the useEffect above will redirect. Navigate directly as a safety net
        // for the case where the store update arrives before this line resolves.
        navigate('/', { replace: true })
        return
      }

      if (result.error) {
        const msg = LOGIN_ERROR_MESSAGES[result.error]
        if (result.error === 'access_code_not_found') {
          setCodeError(msg)
          codeRef.current?.focus()
        } else if (result.error === 'wrong_password') {
          setPassError(msg)
        } else if (result.error === 'network_error') {
          toast.error('Falha de conexão. Verifique sua internet ou desative extensões de bloqueio (AdBlock, Brave Shields).')
        } else {
          toast.error(msg)
        }
      }
    } catch {
      toast.error(LOGIN_ERROR_MESSAGES['unknown'])
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div className={s.root}>

      {/* ══ LEFT PANEL ══════════════════════════════════ */}
      <div className={s.left}>
        <div className={s.leftGrid} />

        {/* Brand */}
        <div className={s.brand}>
          <div className={s.brandLogo}>🏆</div>
          <div className={s.brandText}>
            <div className={s.brandName}>SIGA</div>
            <div className={s.brandTagline}>Pro Raça Rações</div>
          </div>
        </div>

        {/* Hero */}
        <div className={s.hero}>
          <h1 className={s.heroTitle}>
            Gestão industrial <br />
            <span className={s.heroAccent}>integrada e inteligente</span>
          </h1>
          <p className={s.heroDesc}>
            Plataforma centralizada para controle de ativos, manutenções,
            frotas, limpeza e operações — tudo em tempo real.
          </p>

          {/* Module grid */}
          <div className={s.moduleList}>
            {MODULES.map(m => (
              <div className={s.moduleItem} key={m.label}>
                <div
                  className={s.moduleIcon}
                  style={{ background: m.bg, color: m.color }}
                >
                  {m.icon}
                </div>
                <span className={s.moduleLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust strip */}
        <div className={s.trustStrip}>
          <div className={s.trustItem}><span className={s.trustDot} />Firebase Auth</div>
          <div className={s.trustItem}><span className={s.trustDot} />Dados em nuvem</div>
          <div className={s.trustItem}><span className={s.trustDot} />Acesso por código</div>
          <div className={s.trustItem}><span className={s.trustDot} />Controle de perfil</div>
        </div>
      </div>

      {/* ══ RIGHT PANEL ═════════════════════════════════ */}
      <div className={s.right}>
        <div className={s.formCard}>

          {/* Header */}
          <div className={s.formHeader}>
            <h2 className={s.formTitle}>Acesso ao sistema</h2>
            <p className={s.formSub}>
              Entre com seu <strong>código de acesso</strong> e senha fornecidos pelo administrador.
            </p>
          </div>

          {/* Blocker warning */}
          {blockerWarning && (
            <div className={s.blockerBanner}>
              ⚠️ <strong>Brave Shields detectado.</strong> Desative as proteções para este domínio ou o login pode ser bloqueado.
            </div>
          )}

          {/* Form */}
          <form className={s.form} onSubmit={handleSubmit} noValidate>

            {/* Access code */}
            <div className={s.fieldGroup}>
              <label className={s.fieldLabel} htmlFor="accessCode">
                Código de acesso
              </label>
              <div className={s.inputWrap}>
                <span className={s.inputIcon}>🔑</span>
                <input
                  ref={codeRef}
                  id="accessCode"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Ex.: JOAO01"
                  disabled={loading}
                  value={accessCode}
                  onChange={e => {
                    setAccessCode(e.target.value.toUpperCase())
                    if (codeError) setCodeError('')
                  }}
                  className={`${s.input} ${s.inputCode} ${codeError ? s.inputError : ''}`}
                />
              </div>
              {codeError && (
                <span className={s.fieldError}>⚠ {codeError}</span>
              )}
            </div>

            {/* Password */}
            <div className={s.fieldGroup}>
              <label className={s.fieldLabel} htmlFor="password">
                Senha
              </label>
              <div className={s.inputWrap}>
                <span className={s.inputIcon}>🔒</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  disabled={loading}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (passError) setPassError('')
                  }}
                  className={`${s.input} ${passError ? s.inputError : ''}`}
                />
                <button
                  type="button"
                  className={s.passwordToggle}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {passError && (
                <span className={s.fieldError}>⚠ {passError}</span>
              )}
            </div>

            {/* Options row */}
            <div className={s.optionsRow}>
              <label className={s.rememberLabel}>
                <input
                  type="checkbox"
                  className={s.rememberCheckbox}
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                Manter conectado
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className={s.submitBtn}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className={s.spinner} />
                  Verificando…
                </>
              ) : (
                <>
                  Entrar no sistema →
                </>
              )}
            </button>

            {/* Divider */}
            <div className={s.divider}>acesso restrito</div>

            {/* Security notice */}
            <div className={s.securityNotice}>
              <span className={s.securityIcon}>🛡️</span>
              <span>
                Conexão segura. Suas credenciais são criptografadas e nunca compartilhadas.
              </span>
            </div>

          </form>

          {/* Footer */}
          <div className={s.formFooter}>
            <p className={s.supportLine}>
              Acesso criado pelo administrador do sistema. Problemas? Contate o TI interno.
            </p>
            <p className={s.versionLine}>SIGA v2.0 · Pro Raça Rações</p>
          </div>

        </div>
      </div>

    </div>
  )
}
