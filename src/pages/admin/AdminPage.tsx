import { Link } from 'react-router-dom'
import s        from './AdminPage.module.css'

interface AdminCard {
  icon:    string
  title:   string
  desc:    string
  to?:     string
  soon?:   boolean
}

const CARDS: AdminCard[] = [
  {
    icon:  '🏷️',
    title: 'Categorias de Ativos',
    desc:  'Gerencie as categorias do módulo de Patrimônio: ícones, cores, campos customizados e configurações de manutenção.',
    to:    '/ativos/categorias',
  },
  {
    icon:  '👥',
    title: 'Gestão de Usuários',
    desc:  'Cadastro, roles e permissões de acesso dos usuários do sistema.',
    soon:  true,
  },
  {
    icon:  '🔐',
    title: 'Permissões de Acesso',
    desc:  'Configure níveis de acesso por módulo e por perfil de usuário.',
    soon:  true,
  },
  {
    icon:  '📋',
    title: 'Logs de Auditoria',
    desc:  'Histórico de ações críticas realizadas no sistema por todos os usuários.',
    soon:  true,
  },
  {
    icon:  '⚙️',
    title: 'Configurações do Sistema',
    desc:  'Parâmetros globais, integrações e configurações gerais da plataforma.',
    soon:  true,
  },
  {
    icon:  '📊',
    title: 'Dashboard Executivo',
    desc:  'Acesse o painel de KPIs e analytics da gestão industrial.',
    to:    '/dashboard',
  },
]

export default function AdminPage() {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Administração</h1>
        <p className={s.sub}>Configurações do sistema e controles administrativos — visível apenas para administradores.</p>
      </div>

      <div className={s.grid}>
        {CARDS.map(card => {
          const inner = (
            <>
              <div className={s.cardIcon}>{card.icon}</div>
              <div className={s.cardTitle}>{card.title}</div>
              <div className={s.cardDesc}>{card.desc}</div>
              {card.soon && <span className={s.comingSoon}>Em breve — integração com Dashboard</span>}
            </>
          )

          if (card.to) {
            return (
              <Link key={card.title} to={card.to} className={s.card}>
                {inner}
              </Link>
            )
          }

          return (
            <div key={card.title} className={`${s.card} ${s.cardPlaceholder}`}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
