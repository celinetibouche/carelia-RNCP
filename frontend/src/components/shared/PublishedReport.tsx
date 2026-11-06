import type { ReactNode } from 'react'
import { Baby, BookOpen, Moon, Palette, Smile, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Report } from '../../api.ts'
import { MetricTile } from './MetricTile.tsx'
import { StatusBadge } from '../ui/StatusBadge.tsx'

const intakeNames: Record<string, string> = { ALL: 'Tout mangé', MOST: 'Bien mangé', LITTLE: 'Peu mangé', NONE: 'Refusé' }
const moodNames: Record<string, string> = { SAD: 'Triste', CALM: 'Calme', HAPPY: 'Joyeux', TIRED: 'Fatigué' }
const qualityNames: Record<string, string> = { GOOD: 'Paisible', AVERAGE: 'Moyenne', RESTLESS: 'Agitée' }
const changeNames: Record<string, string> = { WET: 'Pipi', SOILED: 'Selles', WET_AND_SOILED: 'Pipi et selles', CLEAN: 'Propre' }
const mealNames: Record<string, string> = { MAIN: 'Plat', DESSERT: 'Dessert', SNACK: 'Goûter' }
const minutes = (time: string) => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }
const duration = (mins: number) => `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`
const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function DetailSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return <section className="border-b border-border py-5 last:border-0">
    <h2 className="mb-3 flex items-center gap-2 text-xl"><Icon size={21} className="shrink-0 text-primary" aria-hidden="true" />{title}</h2>
    {children}
  </section>
}

export function PublishedReport({ report }: { report: Report }) {
  const naps = report.naps.map((nap) => Math.max(0, minutes(nap.endTime) - minutes(nap.startTime)))
  const mood = report.moods[0]
  const meal = report.meals.find((item) => item.kind === 'MAIN')

  return <article aria-label={`Bulletin de ${report.firstName} ${report.lastName}`}>
    <header className="flex min-h-[118px] min-w-0 items-center gap-3 rounded-card bg-secondary p-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-primary"><Baby size={25} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><small className="block text-[10px] uppercase text-muted-foreground">Le bulletin de</small>
        <h2 className="break-words text-2xl leading-tight">{report.firstName} {report.lastName}</h2>
        <p className="mt-1 text-xs">{dateLabel.format(new Date(`${report.reportDate}T12:00:00`))}</p></div>
      <StatusBadge tone="success" className="self-start">Publié</StatusBadge>
    </header>

    <div className="my-5 grid grid-cols-3 gap-2">
      <MetricTile compact className="min-h-[108px]" icon={<Smile size={21} className="text-amber-600" />} label="Humeur"
        value={mood ? moodNames[mood.moodLabel ?? ''] ?? 'Observée' : '—'} />
      <MetricTile compact className="min-h-[108px]" icon={<Utensils size={21} className="text-emerald-700" />} label="Repas"
        value={meal ? intakeNames[meal.intake] : '—'} />
      <MetricTile compact className="min-h-[108px]" icon={<Moon size={21} className="text-violet-600" />} label="Sommeil"
        value={duration(naps.reduce((sum, value) => sum + value, 0))} />
    </div>

    <DetailSection title="À table" icon={Utensils}>
      {report.meals.length ? report.meals.map((item) => <div key={item.kind} className="flex justify-between gap-3 py-2 text-sm">
        <span className="text-muted-foreground">{mealNames[item.kind]}{item.label ? ` · ${item.label}` : ''}</span>
        <strong className="text-right">{intakeNames[item.intake]}</strong>
      </div>) : <p className="text-sm text-muted-foreground">Aucun repas renseigné.</p>}
    </DetailSection>

    <DetailSection title="Les temps de repos" icon={Moon}>
      <p className="mb-2 text-xs text-muted-foreground">{report.naps.length} sieste{report.naps.length > 1 ? 's' : ''} · Plus longue : {duration(Math.max(0, ...naps))}</p>
      {report.naps.length ? report.naps.map((nap, index) => <div key={index} className="flex gap-4 border-b border-border/60 py-3 text-sm last:border-0">
        <time className="shrink-0 border-r-2 border-secondary pr-4 font-semibold">{nap.startTime.slice(0, 5)}<small className="block font-normal text-muted-foreground">{nap.endTime.slice(0, 5)}</small></time>
        <div><strong>Sieste {index + 1}</strong><p className="text-xs text-muted-foreground">{qualityNames[nap.qualityLabel ?? ''] ?? nap.qualityLabel ?? 'Qualité non renseignée'} · {duration(naps[index])}</p>
          {nap.comment && <p className="mt-1 text-xs">{nap.comment}</p>}</div>
      </div>) : <p className="text-sm text-muted-foreground">Aucune sieste renseignée.</p>}
    </DetailSection>

    <DetailSection title="Couche et change" icon={Baby}>
      {report.diaperChanges.length ? report.diaperChanges.map((change, index) => <div key={index} className="flex justify-between gap-3 py-2 text-sm">
        <time className="text-muted-foreground">{change.changeTime.slice(0, 5)}</time>
        <strong>{changeNames[change.typeLabel ?? ''] ?? change.typeLabel ?? 'Change'}</strong>
      </div>) : <p className="text-sm text-muted-foreground">Aucun change renseigné.</p>}
    </DetailSection>

    <DetailSection title="Les découvertes du jour" icon={Palette}>
      {report.activities.length ? <div className="flex flex-wrap gap-2">{report.activities.map((activity) => <span key={activity} className="rounded-lg bg-secondary px-3 py-2 text-xs">{activity}</span>)}</div> :
        <p className="text-sm text-muted-foreground">Aucune activité renseignée.</p>}
    </DetailSection>

    {report.summary && <DetailSection title="Résumé du bulletin" icon={BookOpen}>
      <p className="whitespace-pre-wrap text-sm leading-7">{report.summary}</p>
    </DetailSection>}

    <DetailSection title="Le mot de l'équipe" icon={BookOpen}>
      <p className="whitespace-pre-wrap border-l-[3px] border-primary pl-4 text-sm leading-7">{report.parentNote || 'Aucune note pour cette journée.'}</p>
    </DetailSection>
  </article>
}
