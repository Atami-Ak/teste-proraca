import { scoreToColor } from '@/lib/cleaning-scoring'
import s from './ScoreRing.module.css'

interface Props {
  score:    number
  size?:    number
  stroke?:  number
  label?:   string
}

export default function ScoreRing({ score, size = 80, stroke = 7, label }: Props) {
  const r          = (size - stroke) / 2
  const circ       = 2 * Math.PI * r
  const pct        = Math.min(100, Math.max(0, score))
  const dashOffset = circ * (1 - pct / 100)
  const color      = scoreToColor(score)

  return (
    <div className={s.wrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={s.svg}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#e2e8f0" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={s.progress}
        />
      </svg>
      <div className={s.inner}>
        <span className={s.value} style={{ color, fontSize: size * 0.22 }}>
          {score}%
        </span>
        {label && <span className={s.label}>{label}</span>}
      </div>
    </div>
  )
}
