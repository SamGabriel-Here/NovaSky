/**
 * Beginner learning mode: guided activities, quizzes and locally stored achievements.
 *
 * Activities complete when the learner actually selects the target object in the sky
 * map, so progress reflects real use of the app rather than a "mark as done" button.
 */
import { useEffect, useMemo, useState, type JSX } from 'react'
import { ACHIEVEMENTS, ACTIVITIES, QUIZZES, QUIZ_PASS_RATIO, type Activity, type Quiz } from '@shared/learn'
import { getRiseSetTimes } from '@shared/astro/ephemeris'
import { Icon } from '../components/Icon'
import { SectionHeading, Toggle, Tooltip } from '../components/ui'
import { useAppStore } from '../state/useAppStore'

function ActivityCard({ activity }: { activity: Activity }): JSX.Element {
  const catalog = useAppStore((s) => s.catalog)
  const location = useAppStore((s) => s.settings.location)
  const time = useAppStore((s) => s.time)
  const selectedId = useAppStore((s) => s.selectedId)
  const select = useAppStore((s) => s.select)
  const setScreen = useAppStore((s) => s.setScreen)
  const achievements = useAppStore((s) => s.achievements)
  const unlockAchievement = useAppStore((s) => s.unlockAchievement)

  const southern = location.latitude < 0 && Boolean(activity.southernTargetObjectId)
  const targetId = southern ? activity.southernTargetObjectId! : activity.targetObjectId
  const target = catalog?.objects.get(targetId) ?? null
  const done = achievements.some((a) => a.id === activity.achievement)

  // Completing the activity is driven by the app's own selection state.
  useEffect(() => {
    if (selectedId === targetId && !done) void unlockAchievement(activity.achievement)
  }, [selectedId, targetId, done, activity.achievement, unlockAchievement])

  const availability = useMemo(() => {
    if (!target) return null
    try {
      const riseSet = getRiseSetTimes(target, time, location)
      if (riseSet.neverRises) return 'This object never rises from your location.'
      if (riseSet.circumpolar) return 'Circumpolar from your location — it is up every night of the year.'
      return null
    } catch {
      return null
    }
  }, [target, time, location])

  return (
    <article className={`panel p-4 ${done ? 'border-emerald-500/40' : ''}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-50">
            {activity.title}
            {done && (
              <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                <Icon name="check" size={11} />
                Done
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">{activity.summary}</p>
        </div>
      </div>

      {southern && activity.southernNote && (
        <p className="mb-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          {activity.southernNote}
        </p>
      )}

      <ol className="mb-3 space-y-1.5">
        {activity.steps.map((step, index) => (
          <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-300">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-space-700 text-[11px] text-slate-300">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mb-3 text-xs text-slate-500">{activity.hint}</p>
      {availability && <p className="mb-3 text-xs text-amber-300">{availability}</p>}

      <button
        type="button"
        disabled={!target}
        onClick={() => {
          select(targetId, { focus: true })
          setScreen('sky')
        }}
        className="btn-primary !py-1.5 !text-xs"
      >
        <Icon name="sky" size={14} />
        {done ? 'Show me again' : `Take me to ${target?.name ?? 'the target'}`}
      </button>
    </article>
  )
}

function QuizCard({ quiz }: { quiz: Quiz }): JSX.Element {
  const lessons = useAppStore((s) => s.lessons)
  const saveLesson = useAppStore((s) => s.saveLesson)
  const unlockAchievement = useAppStore((s) => s.unlockAchievement)

  const stored = lessons.find((l) => l.id === quiz.id)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)

  const correct = quiz.questions.filter((q) => answers[q.id] === q.answerIndex).length
  const ratio = correct / quiz.questions.length
  const passed = ratio >= QUIZ_PASS_RATIO

  const submit = (): void => {
    setSubmitted(true)
    void saveLesson({
      id: quiz.id,
      completed: passed,
      score: Math.round(ratio * 100),
      updatedAt: new Date().toISOString()
    })
    if (passed) void unlockAchievement(quiz.id)
  }

  return (
    <article className="panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-50">{quiz.title}</h3>
          <p className="mt-0.5 text-sm text-slate-400">{quiz.description}</p>
        </div>
        {stored?.score !== null && stored?.score !== undefined && (
          <span className="chip">Best {stored.score}%</span>
        )}
      </div>

      <ol className="space-y-4">
        {quiz.questions.map((question) => {
          const chosen = answers[question.id]
          return (
            <li key={question.id}>
              <fieldset>
                <legend className="mb-2 text-sm text-slate-200">{question.question}</legend>
                <div className="space-y-1">
                  {question.options.map((option, index) => {
                    const isChosen = chosen === index
                    const isAnswer = index === question.answerIndex
                    const tone = !submitted
                      ? isChosen
                        ? 'border-nova-500/60 bg-nova-500/10 text-nova-100'
                        : 'border-space-700 text-slate-300 hover:border-space-600'
                      : isAnswer
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                        : isChosen
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                          : 'border-space-700 text-slate-400'
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${tone}`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          checked={isChosen}
                          disabled={submitted}
                          onChange={() => setAnswers((a) => ({ ...a, [question.id]: index }))}
                          className="accent-nova-500"
                        />
                        {option}
                      </label>
                    )
                  })}
                </div>
                {submitted && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{question.explanation}</p>
                )}
              </fieldset>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={Object.keys(answers).length < quiz.questions.length}
            className="btn-primary !py-1.5 !text-xs"
          >
            Check answers
          </button>
        ) : (
          <>
            <p className={`text-sm ${passed ? 'text-emerald-300' : 'text-amber-300'}`}>
              {correct} of {quiz.questions.length} correct
              {passed ? ' — passed.' : ' — have another go.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setAnswers({})
                setSubmitted(false)
              }}
              className="btn-ghost !py-1.5 !text-xs"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export function LearnScreen(): JSX.Element {
  const beginnerMode = useAppStore((s) => s.settings.beginnerMode)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const achievements = useAppStore((s) => s.achievements)
  const reopenOnboarding = useAppStore((s) => s.reopenOnboarding)

  const unlocked = new Set(achievements.map((a) => a.id))

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <SectionHeading
        title="Learn"
        subtitle="Guided activities that use the real sky above your location, plus quizzes and progress that stays on this computer."
        action={
          <button type="button" onClick={reopenOnboarding} className="btn-ghost !py-1.5 !text-xs">
            Replay the introduction
          </button>
        }
      />

      <div className="panel mb-5 px-4 py-1">
        <Toggle
          checked={beginnerMode}
          onChange={(value) => void updateSettings({ beginnerMode: value })}
          label="Beginner mode"
          description="Shows only the major constellations and the brightest stars, with simpler labels. Shortcut: B."
        />
      </div>

      <h2 className="panel-heading mb-2">Guided activities</h2>
      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        {ACTIVITIES.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>

      <h2 className="panel-heading mb-2">Quizzes</h2>
      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        {QUIZZES.map((quiz) => (
          <QuizCard key={quiz.id} quiz={quiz} />
        ))}
      </div>

      <h2 className="panel-heading mb-2">Achievements</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((achievement) => {
          const has = unlocked.has(achievement.id)
          return (
            <li
              key={achievement.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                has ? 'border-amber-500/40 bg-amber-500/5' : 'border-space-700 opacity-60'
              }`}
            >
              <Icon
                name="trophy"
                size={18}
                className={has ? 'mt-0.5 text-amber-300' : 'mt-0.5 text-slate-600'}
              />
              <span>
                <span className="block text-sm text-slate-100">{achievement.title}</span>
                <span className="block text-xs text-slate-400">{achievement.description}</span>
              </span>
            </li>
          )
        })}
      </ul>

      <Tooltip label="Progress is stored in the local database on this machine and is never uploaded.">
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Icon name="info" size={13} />
          {unlocked.size} of {ACHIEVEMENTS.length} achievements unlocked.
        </p>
      </Tooltip>
    </div>
  )
}
