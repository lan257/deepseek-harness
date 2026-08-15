import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CATEGORY_ORDER, PLUGIN_CATALOG, categoryOf, type PluginCategory } from './catalog.ts'
import type { PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginInventorySettingsTab.module.css'

/** Registration-side Remote face used by the section. */
export interface PluginInventorySettingsTabInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /** Enable or disable one Loader entry at runtime. */
  setEnabled: (entryId: PluginInventoryEntry['entryId'], enabled: boolean) => Promise<void>
}

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Full component props assembled by the Settings slot renderer. */
export type PluginInventorySettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginInventorySettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(
  phase: PluginFiberPhase,
  t: PluginInventorySettingsTabProps['t'],
): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^skill:/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** Catalog key for one entry: its row id without the `include:` tree prefix, falling back to the module name. */
function catalogKey(entry: PluginInventoryEntry): string {
  return entry.entryId.replace(/^include:/, '')
}

/** Display description for one entry: row-level catalog entry, then module-level catalog entry, then Host description. */
function entryDescription(entry: PluginInventoryEntry): string | undefined {
  return PLUGIN_CATALOG[catalogKey(entry)]?.description
    ?? PLUGIN_CATALOG[entry.moduleName]?.description
    ?? entry.description
}

/** Display title for one entry: row-level catalog title when present, otherwise the short module name. */
function entryTitle(entry: PluginInventoryEntry): string {
  return PLUGIN_CATALOG[catalogKey(entry)]?.title ?? moduleShortName(entry.moduleName)
}

/** Functional category of one entry: user skill rows land in the skill-rows category; catalog lookup with keyword fallback otherwise. */
function entryCategory(entry: PluginInventoryEntry): PluginCategory {
  return entry.kind === 'skill' ? 'skill-rows' : categoryOf(entry.moduleName)
}

/** Whether an inventory row matches the local catalog query. */
function matches(entry: PluginInventoryEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId, entryDescription(entry)]
    .some(value => value !== undefined && value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Render the current Loader inventory with per-entry enablement control. */
export function PluginInventorySettingsTab({ list, setEnabled, t }: PluginInventorySettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<readonly PluginCategory[]>([])
  const [expanded, setExpanded] = useState<PluginInventoryEntry['entryId'] | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [toggling, setToggling] = useState<PluginInventoryEntry['entryId'] | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  // Categories present in the current snapshot, in catalog order. Chips only
  // render for categories that actually exist, so a category with no plugin
  // (e.g. MCP before a bridge is mounted) shows nothing.
  const presentCategories = useMemo(
    () => state.status === 'ready'
      ? CATEGORY_ORDER.filter(category => state.snapshot.entries.some(entry => entryCategory(entry) === category))
      : [],
    [state],
  )
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry =>
        matches(entry, normalizedQuery)
        && (selectedCategories.length === 0 || selectedCategories.includes(entryCategory(entry))))
      : [],
    [normalizedQuery, selectedCategories, state],
  )

  useEffect(() => {
    if (expanded !== null && !filteredEntries.some(entry => entry.entryId === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredEntries])

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  /** Flip one entry's enablement, then reload the snapshot on success. */
  const toggle = (entry: PluginInventoryEntry): void => {
    setToggling(entry.entryId)
    setToggleError(null)
    void setEnabled(entry.entryId, !entry.enabled).then(
      () => {
        setToggling(null)
        setRequest(value => value + 1)
      },
      (error: unknown) => {
        setToggling(null)
        setToggleError(error instanceof Error ? error.message : String(error))
      },
    )
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
          {presentCategories.length > 0 ? (
            <div className={css.categories} role="group" aria-label={t('categories')}>
              {presentCategories.map((category) => {
                const count = state.snapshot.entries.filter(entry => entryCategory(entry) === category).length
                const active = selectedCategories.includes(category)
                return (
                  <button
                    key={category}
                    className={css.categoryChip}
                    type="button"
                    aria-pressed={active}
                    data-active={active ? 'true' : undefined}
                    onClick={() => {
                      setSelectedCategories(current => active
                        ? current.filter(value => value !== category)
                        : [...current, category])
                    }}
                  >
                    {t(`category.${category}`)}
                    <span data-category-count={category}>{count}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span data-plugin-count={filteredEntries.length}>{filteredEntries.length}</span>
          </div>
          {state.snapshot.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.snapshot.entries.length > 0 && filteredEntries.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map((entry) => {
                const status = phaseLabel(entry.fiberPhase, t)
                const title = entryTitle(entry)
                const description = entryDescription(entry)
                const configuration = t(entry.enabled ? 'enabledTag' : 'disabledTag')
                const open = expanded === entry.entryId
                const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`
                return (
                  <li
                    className={css.card}
                    key={entry.entryId}
                    data-plugin-entry={entry.entryId}
                    data-open={open ? 'true' : undefined}
                  >
                    <button
                      className={css.cardContent}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={entry.enabled && entry.kind === 'plugin' ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`}
                      onClick={() => {
                        setExpanded(current => current === entry.entryId ? null : entry.entryId)
                      }}
                    >
                      <span className={css.cardMain}>
                        <strong className={css.cardTitle} title={entry.moduleName}>{title}</strong>
                        {description !== undefined && description.length > 0 ? (
                          <span className={css.cardDescription} title={description}>{description}</span>
                        ) : null}
                      </span>
                      <span className={css.cardTrailing}>
                        {entry.enabled && entry.kind === 'plugin' ? (
                          <span
                            className={css.statusDot}
                            data-phase={entry.fiberPhase ?? 'unobserved'}
                            role="img"
                            aria-label={status}
                            title={status}
                          />
                        ) : null}
                        <span className={css.configTag} data-enabled={entry.enabled ? 'true' : 'false'}>
                          {configuration}
                        </span>
                        <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                      </span>
                    </button>
                    {open ? (
                      <div className={css.cardDetails} id={detailId}>
                        <code className={css.entryValue} data-loader-entry>{entry.entryId}</code>
                        {entry.kind === 'skill' ? (
                          <dl className={css.details}>
                            {entry.path !== undefined ? (
                              <div>
                                <dt>{t('source')}</dt>
                                <dd>{entry.path}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : (
                          <dl className={css.details}>
                            <div>
                              <dt>{t('configuration')}</dt>
                              <dd>{configuration}</dd>
                            </div>
                            {entry.enabled ? (
                              <div>
                                <dt>{t('cordis')}</dt>
                                <dd>{status}</dd>
                              </div>
                            ) : null}
                          </dl>
                        )}
                        <div className={css.actionRow}>
                          <button
                            className={css.actionButton}
                            type="button"
                            aria-label={`${title} ${entry.enabled ? t('disable') : t('enable')}`}
                            disabled={toggling === entry.entryId}
                            onClick={() => { toggle(entry) }}
                          >
                            {entry.enabled ? t('disable') : t('enable')}
                          </button>
                          {toggling === entry.entryId
                            ? <span className={css.actionNote}>{t('applying')}</span>
                            : null}
                          {toggleError !== null ? <p className={css.actionError} role="alert">{toggleError}</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
