import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { io } from 'socket.io-client'
import { Baby, BookOpen, ClipboardList, Frown, Laugh, Meh, Moon, Palette, Pencil, Plus, Save, Send, Smile, Trash2, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, json, type Child, type References, type Report, type ReportNotification, type Meal, type Nap, type Change } from '../api.ts'
import { formatDay } from '../dates.ts'
import { useAuth } from '../useAuth.ts'
import { canEditReports, canPublishReports, isParent } from '../permissions.ts'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button, IconButton } from '../components/ui/Button.tsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { FormField, SelectField, TextArea, TextInput } from '../components/ui/FormField.tsx'
import { InlineError, LoadingText } from '../components/ui/InlineStatus.tsx'
import { SectionCard } from '../components/ui/SectionCard.tsx'
import { StatusBadge } from '../components/ui/StatusBadge.tsx'
import { PublishedReport } from '../components/shared/PublishedReport.tsx'

const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
const time = () => new Date().toTimeString().slice(0, 5)
const mealNames: Record<Meal['kind'], string> = { MAIN: 'Plat', DESSERT: 'Dessert', SNACK: 'Goûter' }
const intakeNames: Record<Meal['intake'], string> = { ALL: 'Tout mangé', MOST: 'Bien mangé', LITTLE: 'Peu mangé', NONE: 'Refusé' }
const moodIcons: Record<string, LucideIcon> = { SAD: Frown, CALM: Meh, HAPPY: Smile, TIRED: Moon }
const moodNames: Record<string, string> = { SAD: 'Triste', CALM: 'Calme', HAPPY: 'Joyeux', TIRED: 'Fatigué' }
const qualityNames: Record<string, string> = { GOOD: 'Paisible', AVERAGE: 'Moyenne', RESTLESS: 'Agitée' }
const changeNames: Record<string, string> = { WET: 'Pipi', SOILED: 'Selles', WET_AND_SOILED: 'Pipi et selles', CLEAN: 'Propre' }
const activityOptions = ['Peinture', 'Musique', 'Lecture', 'Motricité', 'Jardin', 'Comptines', 'Pâte à modeler', 'Jeux d’eau']
const emptyMeal = (kind: Meal['kind']): Meal => ({ kind, intake: 'ALL', label: null })
const minutes = (value: string) => { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins }
const duration = (mins: number) => `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`

export function DailyReportPage() {
  const [params] = useSearchParams()
  return <DailyReportEditor key={params.toString()} />
}

function DailyReportEditor() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const childId = Number(params.get('childId')) || 0
  const date = params.get('date') ?? today()
  const [children, setChildren] = useState<Child[]>([])
  const [references, setReferences] = useState<References | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [draft, setDraft] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>([])
  const [historyYear, setHistoryYear] = useState(Number(date.slice(0, 4)))
  const [preview, setPreview] = useState('')
  const [readyToPublish, setReadyToPublish] = useState<{ revision: number; summary: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const [busy, setBusy] = useState(false)
  const [remoteChange, setRemoteChange] = useState(false)
  const [loading, setLoading] = useState(Boolean(childId))
  const [attempt, setAttempt] = useState(0)
  const [mealEditor, setMealEditor] = useState<Meal['kind'] | null>(null)
  const [customActivity, setCustomActivity] = useState('')
  const editable = canEditReports(user.role) && report?.status === 'DRAFT'
  const canPublish = canPublishReports(user.role)

  useEffect(() => {
    const failed = (fallback: string) => (reason: unknown) => setError(reason instanceof Error ? reason.message : fallback)
    api<Child[]>('/children').then(setChildren).catch(failed('Enfants indisponibles.'))
    api<References>('/references').then(setReferences).catch(failed('Référentiels indisponibles.'))
  }, [attempt])
  // Reprise après une erreur de chargement : relance les lectures de la page.
  const retryLoad = () => { setError(''); setLoading(Boolean(childId)); setAttempt((value) => value + 1) }
  const loadFailed = !references || (childId > 0 && !report && !loading)

  async function reload(id: number) {
    const loaded = await api<Report>(`/reports/${id}`)
    setReport(loaded); setDraft(loaded); setRemoteChange(false); setReadyToPublish(null)
    setPreview(loaded.summary ?? '')
  }

  useEffect(() => {
    if (!childId) return
    let cancelled = false
    api<Report[]>(`/reports?childId=${childId}&date=${date}`).then(async (items) => {
      if (!items[0] || cancelled) return
      const loaded = await api<Report>(`/reports/${items[0].reportId}`)
      if (!cancelled) { setReport(loaded); setDraft(loaded); setPreview(loaded.summary ?? '') }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [childId, date, attempt])

  useEffect(() => {
    if (!childId) return
    let cancelled = false
    api<Report[]>(`/reports?childId=${childId}&limit=100`).then((items) => { if (!cancelled) setHistory(items) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [childId, report?.revision, report?.status])

  useEffect(() => {
    if (!report) return
    let cancelled = false
    const socket = io({ withCredentials: true })
    const syncError = 'Synchronisation du bulletin indisponible.'
    const subscribe = () => {
      socket.emit('report:join', report.reportId, (result: { ok: boolean }) => {
        if (cancelled) return
        if (!result.ok) setSyncWarning(syncError)
        else setSyncWarning('')
      })
      void api<Report>(`/reports/${report.reportId}`)
        .then((latest) => {
          if (cancelled) return
          if (latest.revision !== report.revision || latest.status !== report.status) setRemoteChange(true)
        })
        .catch(() => { if (!cancelled) setSyncWarning(syncError) })
    }
    socket.on('connect', subscribe)
    socket.on('connect_error', () => { if (!cancelled) setSyncWarning(syncError) })
    socket.on('report:changed', (change: { revision: number; status: string }) => {
      if (change.revision > report.revision || change.status !== report.status) setRemoteChange(true)
    })
    if (socket.connected) subscribe()
    return () => { cancelled = true; socket.disconnect() }
  }, [report])

  useEffect(() => {
    if (!isParent(user.role) || !report || report.status !== 'PUBLISHED') return
    let cancelled = false
    api<ReportNotification[]>('/notifications').then(async (items) => {
      const unread = items.find((item) => item.reportId === report.reportId && !item.readAt)
      if (!unread || cancelled) return
      await api(`/notifications/${unread.notificationId}/read`, { method: 'PATCH' })
      if (!cancelled) window.dispatchEvent(new Event('carelia:notification-read'))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [report, user.role])

  function patch(values: Partial<Report>) { setDraft((current) => current ? { ...current, ...values } : current) }
  function updateMeal(kind: Meal['kind'], values: Partial<Meal>) {
    if (!draft) return
    const meals = draft.meals.filter((meal) => meal.kind !== kind)
    patch({ meals: [...meals, { ...(draft.meals.find((meal) => meal.kind === kind) ?? emptyMeal(kind)), ...values }] })
  }
  function setDate(value: string) { setParams({ childId: String(childId), date: value }) }

  async function createReport() {
    setBusy(true); setError('')
    try {
      const created = await api<Report>('/reports', json('POST', { childId, reportDate: date }))
      setReport(created); setDraft(created); setNotice('Brouillon créé.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création impossible.') }
    finally { setBusy(false) }
  }

  async function writeDraft(): Promise<Report> {
    if (!report || !draft) throw new Error('Brouillon introuvable.')
    const saved = await api<Report>(`/reports/${report.reportId}`, json('PATCH', {
      revision: report.revision, parentNote: draft.parentNote, summaryOverride: draft.summaryOverride,
      meals: draft.meals, activities: draft.activities,
      naps: draft.naps.map(({ napQualityId, startTime, endTime, comment }) => ({ napQualityId, startTime, endTime, comment })),
      moods: draft.moods.map(({ moodId, observedTime, comment }) => ({ moodId, observedTime, comment })),
      diaperChanges: draft.diaperChanges.map(({ diaperChangeTypeId, changeTime, comment }) => ({ diaperChangeTypeId, changeTime, comment })),
    }))
    setReport(saved); setDraft(saved); setRemoteChange(false); setReadyToPublish(null)
    return saved
  }

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await writeDraft()
      setNotice('Brouillon enregistré.')
      try {
        const result = await api<{ summary: string }>(`/reports/${saved.reportId}/preview`)
        setPreview(result.summary)
      } catch {
        setError('Brouillon enregistré, mais aperçu indisponible. Réessayez avant publication.')
      }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }

  async function preparePublish() {
    if (!report) return
    setBusy(true); setError(''); setNotice('')
    try {
      const current = draft !== report ? await writeDraft() : report
      if (current !== report) setNotice('Brouillon enregistré.')
      try {
        const result = await api<{ summary: string }>(`/reports/${current.reportId}/preview`)
        setPreview(result.summary)
        setReadyToPublish({ revision: current.revision, summary: result.summary })
      } catch {
        setError('Aperçu indisponible. Le bulletin n’a pas été publié.')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }

  async function publish() {
    if (!report || !readyToPublish) return
    setBusy(true); setError(''); setNotice('')
    try {
      const published = await api<Report>(`/reports/${report.reportId}/publish`, json('POST', { revision: readyToPublish.revision }))
      setReadyToPublish(null)
      setReport(published); setDraft(published); setPreview(published.summary ?? ''); setNotice('Bulletin publié.')
    } catch (reason) { setReadyToPublish(null); setError(reason instanceof Error ? reason.message : 'Publication impossible.') }
    finally { setBusy(false) }
  }

  const selectedChild = children.find((child) => child.childId === childId)
  const napDurations = draft?.naps.map((nap) => Math.max(0, minutes(nap.endTime) - minutes(nap.startTime))) ?? []
  const years = Array.from(new Set([Number(date.slice(0, 4)), ...history.map((item) => Number(item.reportDate.slice(0, 4)))]))
    .sort((a, b) => b - a)

  if (draft?.status === 'PUBLISHED') return <>
    <PageHeader title={`Bulletin de ${draft.firstName}`} showBack showNotifications={false} />
    <PublishedReport report={draft} />
  </>

  return <>
    <PageHeader title="Bulletin du jour" showBack />
    <div className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Choisir un enfant">
      {children.map((child) => <button key={child.childId} type="button" aria-pressed={child.childId === childId}
        onClick={() => setParams({ childId: String(child.childId), date })}
        className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${child.childId === childId ? 'border-primary bg-accent text-primary' : 'border-border bg-card'}`}>
        {child.firstName}
      </button>)}
    </div>
    {!children.length && <p className="mb-4 text-sm text-muted-foreground">Aucun enfant disponible.</p>}
    <FormField label="Date du bulletin" htmlFor="report-date" className="mb-5">
      <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    </FormField>
    {error && <InlineError className="my-4" message={error} onRetry={loadFailed ? retryLoad : undefined} />}
    {syncWarning && <p role="status" className="my-4 text-sm text-muted-foreground">{syncWarning}</p>}
    {notice && <p role="status" className="my-4 text-sm text-secondary-foreground">{notice}</p>}
    {remoteChange && <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
      <span>Ce bulletin a changé sur un autre appareil.</span>
      <Button variant="outline" size="sm" onClick={() => report && void reload(report.reportId)}>Recharger</Button>
    </div>}
    {loading && <LoadingText />}
    {childId > 0 && !report && !error && !loading && (isParent(user.role) ?
      <p className="rounded-[22px] border border-border bg-card p-5 text-sm text-muted-foreground">Aucun bulletin publié à cette date.</p> :
      <div className="rounded-[22px] border border-border bg-card p-5">
        <p className="mb-4 text-sm">Aucun bulletin pour {selectedChild?.firstName ?? 'cet enfant'} à cette date.</p>
        <Button onClick={() => void createReport()} loading={busy} icon={<Plus size={18} />} className="w-full">Créer le brouillon</Button>
      </div>)}
    {draft && <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3 rounded-[22px] bg-secondary px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold"><Baby size={20} className="shrink-0 text-secondary-foreground" />{draft.firstName} {draft.lastName}</span>
        <StatusBadge tone="neutral" className="shrink-0">{draft.status === 'ARCHIVED' ? 'Archivé' : 'Brouillon'}</StatusBadge>
      </div>
      <SectionCard title="Humeur" icon={Smile}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {references?.moods.map((item) => {
            const Icon = moodIcons[item.label] ?? Laugh
            const selected = draft.moods[0]?.moodId === item.moodId
            return <button type="button" key={item.moodId} disabled={!editable} title={moodNames[item.label] ?? item.label}
              aria-label={`Humeur ${moodNames[item.label] ?? item.label}`} aria-pressed={selected}
              onClick={() => patch({ moods: draft.moods.length ? draft.moods.map((mood, index) => index === 0 ? { ...mood, moodId: item.moodId! } : mood) : [{ moodId: item.moodId!, observedTime: time(), comment: null }] })}
              className={`flex size-14 shrink-0 items-center justify-center rounded-xl border ${selected ? 'border-primary bg-accent text-primary' : 'border-border bg-background text-muted-foreground'} disabled:cursor-default`}>
              <Icon size={23} aria-hidden="true" />
            </button>
          })}
        </div>
        {draft.moods.map((mood, index) => <div key={index} className="mt-3 grid gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <TextInput aria-label={`Heure de l'humeur ${index + 1}`} type="time" disabled={!editable} value={mood.observedTime.slice(0, 5)}
              onChange={(event) => patch({ moods: draft.moods.map((item, i) => i === index ? { ...item, observedTime: event.target.value } : item) })} />
            {index > 0 && <SelectField aria-label={`Humeur ${index + 1}`} disabled={!editable} value={mood.moodId}
              onChange={(event) => patch({ moods: draft.moods.map((item, i) => i === index ? { ...item, moodId: Number(event.target.value) } : item) })}>
              {references?.moods.map((item) => <option key={item.moodId} value={item.moodId}>{moodNames[item.label] ?? item.label}</option>)}
            </SelectField>}
            {editable && <IconButton label="Supprimer l'humeur" variant="outline" onClick={() => patch({ moods: draft.moods.filter((_, i) => i !== index) })}><Trash2 size={17} /></IconButton>}
          </div>
          <TextInput aria-label={`Commentaire sur l'humeur ${index + 1}`} placeholder="Commentaire" disabled={!editable} value={mood.comment ?? ''}
            onChange={(event) => patch({ moods: draft.moods.map((item, i) => i === index ? { ...item, comment: event.target.value || null } : item) })} />
        </div>)}
        {editable && draft.moods.length > 0 && <Button variant="outline" size="sm" className="mt-3 w-full" icon={<Plus size={16} />}
          onClick={() => patch({ moods: [...draft.moods, { moodId: references?.moods[0]?.moodId ?? 1, observedTime: time(), comment: null }] })}>Ajouter une observation</Button>}
      </SectionCard>
      <SectionCard title="Repas" icon={Utensils}>
        {(['MAIN', 'DESSERT', 'SNACK'] as const).map((kind) => {
          const meal = draft.meals.find((item) => item.kind === kind)
          return <div key={kind} className="border-b border-border py-2 last:border-0">
            <div className="flex min-h-9 items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">{mealNames[kind]} · {meal?.label || 'À renseigner'}</span>
              {meal && <StatusBadge tone="success" className="shrink-0">{intakeNames[meal.intake]}</StatusBadge>}
              {editable && <IconButton label={`Modifier ${mealNames[kind].toLowerCase()}`} size="sm" onClick={() => setMealEditor(mealEditor === kind ? null : kind)}><Pencil size={16} /></IconButton>}
            </div>
            {editable && mealEditor === kind && <div className="mt-2 grid gap-2 rounded-xl bg-background p-3">
              <TextInput aria-label={`${mealNames[kind]} servi`} placeholder="Aliment servi" value={meal?.label ?? ''} onChange={(event) => updateMeal(kind, { label: event.target.value || null })} />
              <SelectField aria-label={`${mealNames[kind]} consommé`} value={meal?.intake ?? 'ALL'} onChange={(event) => updateMeal(kind, { intake: event.target.value as Meal['intake'] })}>
                {Object.entries(intakeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              {meal && <Button variant="ghost" size="sm" onClick={() => { patch({ meals: draft.meals.filter((item) => item.kind !== kind) }); setMealEditor(null) }} icon={<Trash2 size={15} />}>Retirer ce repas</Button>}
            </div>}
          </div>
        })}
      </SectionCard>
      <SectionCard title="Sommeil" icon={Moon}>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          <span className="self-center text-muted-foreground">Siestes</span>
          <span><strong className="block font-serif text-xl">{duration(napDurations.reduce((sum, value) => sum + value, 0))}</strong><small className="text-muted-foreground">Total</small></span>
          <span><strong className="block font-serif text-xl">{duration(Math.max(0, ...napDurations))}</strong><small className="text-muted-foreground">Plus longue</small></span>
        </div>
        <div className="grid gap-2">
          {draft.naps.map((nap, index) => <div key={index} className="grid gap-3 rounded-xl bg-secondary p-3">
            <strong className="text-sm">Sieste {index + 1} · {duration(napDurations[index])}</strong>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Début" htmlFor={`nap-start-${index}`}><TextInput type="time" disabled={!editable} value={nap.startTime.slice(0, 5)} className="bg-background" onChange={(event) => patch({ naps: draft.naps.map((item, i) => i === index ? { ...item, startTime: event.target.value } : item) })} /></FormField>
              <FormField label="Fin" htmlFor={`nap-end-${index}`}><TextInput type="time" disabled={!editable} value={nap.endTime.slice(0, 5)} className="bg-background" onChange={(event) => patch({ naps: draft.naps.map((item, i) => i === index ? { ...item, endTime: event.target.value } : item) })} /></FormField>
            </div>
            <FormField label="Qualité" htmlFor={`nap-quality-${index}`}><SelectField disabled={!editable} value={nap.napQualityId} className="bg-background" onChange={(event) => patch({ naps: draft.naps.map((item, i) => i === index ? { ...item, napQualityId: Number(event.target.value) } : item) })}>
              {references?.napQualities.map((item) => <option key={item.napQualityId} value={item.napQualityId}>{qualityNames[item.label] ?? item.label}</option>)}
            </SelectField></FormField>
            <TextInput aria-label={`Commentaire sur la sieste ${index + 1}`} placeholder="Commentaire" disabled={!editable} value={nap.comment ?? ''} className="bg-background" onChange={(event) => patch({ naps: draft.naps.map((item, i) => i === index ? { ...item, comment: event.target.value || null } : item) })} />
            {editable && <Button variant="outline" size="sm" icon={<Trash2 size={16} />} onClick={() => patch({ naps: draft.naps.filter((_, i) => i !== index) })}>Supprimer la sieste</Button>}
          </div>)}
          {editable && <Button variant="outline" icon={<Plus size={17} />} onClick={() => patch({ naps: [...draft.naps, { napQualityId: references?.napQualities[0]?.napQualityId ?? 1, startTime: '13:00', endTime: '14:00', comment: null } as Nap] })}>Ajouter une sieste</Button>}
        </div>
      </SectionCard>
      <SectionCard title="Couche / Change" icon={Baby}>
        <div className="grid gap-2">
          {draft.diaperChanges.map((change, index) => <div key={index} className="grid gap-2 rounded-xl border border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <FormField label="Heure" htmlFor={`change-time-${index}`}><TextInput type="time" disabled={!editable} value={change.changeTime.slice(0, 5)} onChange={(event) => patch({ diaperChanges: draft.diaperChanges.map((item, i) => i === index ? { ...item, changeTime: event.target.value } : item) })} /></FormField>
              <FormField label="Change" htmlFor={`change-type-${index}`}><SelectField disabled={!editable} value={change.diaperChangeTypeId} onChange={(event) => patch({ diaperChanges: draft.diaperChanges.map((item, i) => i === index ? { ...item, diaperChangeTypeId: Number(event.target.value) } : item) })}>
                {references?.diaperChangeTypes.map((item) => <option key={item.diaperChangeTypeId} value={item.diaperChangeTypeId}>{changeNames[item.label] ?? item.label}</option>)}
              </SelectField></FormField>
              {editable && <IconButton label="Supprimer le change" variant="outline" onClick={() => patch({ diaperChanges: draft.diaperChanges.filter((_, i) => i !== index) })}><Trash2 size={17} /></IconButton>}
            </div>
            <TextInput aria-label={`Commentaire sur le change ${index + 1}`} placeholder="Commentaire" disabled={!editable} value={change.comment ?? ''} onChange={(event) => patch({ diaperChanges: draft.diaperChanges.map((item, i) => i === index ? { ...item, comment: event.target.value || null } : item) })} />
          </div>)}
          {editable && <Button variant="outline" icon={<Plus size={17} />} onClick={() => patch({ diaperChanges: [...draft.diaperChanges, { diaperChangeTypeId: references?.diaperChangeTypes[0]?.diaperChangeTypeId ?? 1, changeTime: time(), comment: null } as Change] })}>Ajouter un change</Button>}
        </div>
      </SectionCard>
      <SectionCard title="Activités" icon={Palette}>
        <div className="flex flex-wrap gap-2">
          {activityOptions.map((label) => <button key={label} type="button" disabled={!editable} aria-pressed={draft.activities.includes(label)}
            onClick={() => patch({ activities: draft.activities.includes(label) ? draft.activities.filter((item) => item !== label) : [...draft.activities, label] })}
            className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${draft.activities.includes(label) ? 'border-primary bg-accent text-primary' : 'border-border bg-background'} disabled:cursor-default`}>{label}</button>)}
          {draft.activities.filter((label) => !activityOptions.includes(label)).map((label) => <button key={label} type="button" disabled={!editable}
            onClick={() => patch({ activities: draft.activities.filter((item) => item !== label) })}
            className="min-h-9 rounded-full border border-primary bg-accent px-3 text-xs font-semibold text-primary" title={editable ? 'Retirer cette activité' : undefined}>{label}</button>)}
        </div>
        {editable && <div className="mt-4 flex gap-2"><TextInput aria-label="Autre activité" placeholder="Autre activité" maxLength={100} value={customActivity} onChange={(event) => setCustomActivity(event.target.value)} />
          <IconButton label="Ajouter cette activité" variant="outline" disabled={!customActivity.trim() || draft.activities.includes(customActivity.trim())} onClick={() => { patch({ activities: [...draft.activities, customActivity.trim()] }); setCustomActivity('') }}><Plus size={18} /></IconButton></div>}
      </SectionCard>
      <SectionCard title="Note aux parents" icon={Pencil}>
        <TextArea aria-label="Note aux parents" disabled={!editable} value={draft.parentNote ?? ''} onChange={(event) => patch({ parentNote: event.target.value || null })} />
      </SectionCard>
      {(preview || draft.summaryOverride) && <SectionCard title="Résumé du bulletin" icon={BookOpen}>
        <p className="text-sm leading-6">{preview || draft.summaryOverride}</p>
        {editable && <details className="mt-3 border-t border-border pt-3 text-sm"><summary className="cursor-pointer text-primary">Personnaliser le résumé</summary>
          <TextArea aria-label="Résumé personnalisé" className="mt-3" value={draft.summaryOverride ?? ''} onChange={(event) => patch({ summaryOverride: event.target.value || null })} /></details>}
      </SectionCard>}
      {editable && <div className="grid gap-3">
        <Button variant="outline" onClick={() => void save()} loading={busy} icon={<Save size={18} />}>Enregistrer le brouillon</Button>
        {canPublish && <Button onClick={() => void preparePublish()} disabled={busy} icon={<Send size={18} />}>Envoyer aux parents</Button>}
      </div>}
    </div>}
    {childId > 0 && <SectionCard title="Historique des bulletins" icon={ClipboardList} className="mt-5">
      <FormField label="Année" htmlFor="report-year"><SelectField value={historyYear} onChange={(event) => setHistoryYear(Number(event.target.value))}>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </SelectField></FormField>
      <div className="mt-3 divide-y divide-border">
        {Array.from({ length: 12 }, (_, month) => {
          const items = history.filter((item) => Number(item.reportDate.slice(0, 4)) === historyYear && Number(item.reportDate.slice(5, 7)) === month + 1)
          const label = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(historyYear, month, 1))
          return <details key={month} className="group py-1"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-sm text-primary">
            <span className="font-semibold capitalize">▸ {label} {historyYear}</span><small className="text-muted-foreground">{items.length} bulletin{items.length > 1 ? 's' : ''}</small>
          </summary><div className="grid gap-1 pb-2">{items.length ? items.map((item) => <Link key={item.reportId} to={`/bulletin?childId=${item.childId}&date=${item.reportDate}`}
            className="flex min-h-10 items-center justify-between rounded-lg px-2 text-xs hover:bg-accent"><span>{formatDay(item.reportDate)}</span><span>{item.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}</span></Link>) : <p className="px-2 py-2 text-xs text-muted-foreground">Aucun bulletin.</p>}</div></details>
        })}
      </div>
      <Link to="/bulletins" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary">Voir tout l’historique</Link>
    </SectionCard>}
    <ConfirmDialog open={readyToPublish !== null} title="Relire avant publication" description={readyToPublish?.summary ?? ''}
      confirmLabel="Publier le bulletin" confirmVariant="primary" busy={busy}
      onConfirm={() => void publish()} onCancel={() => setReadyToPublish(null)} />
  </>
}
