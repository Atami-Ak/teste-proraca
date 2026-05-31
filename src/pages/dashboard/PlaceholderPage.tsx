// src/pages/dashboard/PlaceholderPage.tsx

import s from './PlaceholderPage.module.css'

interface Props {
  label: string
  icon?: string
}

export default function PlaceholderPage({ label, icon = '🚧' }: Props) {
  return (
    <div className={s.page}>
      <div className={s.icon}>{icon}</div>
      <h2 className={s.title}>{label}</h2>
      <p className={s.sub}>Este módulo de analytics está em construção e será disponibilizado em breve.</p>
    </div>
  )
}
