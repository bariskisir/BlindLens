/** Reuses AIHelper's account, usage, model, reasoning, verbosity, and service-tier settings layout. */

import { Alert, Button, Progress, Select, Space } from 'antd'
import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_LOCALES } from '@shared/settings'
import {
  THINKING_LEVELS,
  VERBOSITY_LEVELS,
  SERVICE_TIERS,
  type ThinkingLevel,
  type VerbosityLevel,
  type ServiceTier,
} from '@shared/lens'
import { useLensActions } from '@renderer/hooks/useLensActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useAppSelector } from '@renderer/store'
import SettingRow from '../components/SettingRow'
import HotkeyInput from '../components/HotkeyInput'
import { cx } from '@renderer/utils/classNames'
import styles from '../SettingsPage.module.scss'

/** Chooses the same usage thresholds used by AIHelper. */
const usageColor = (percent: number): string =>
  percent >= 95 ? '#F44336' : percent >= 80 ? '#FF9800' : percent >= 50 ? '#FFC107' : '#4CAF50'

/** Displays the subscription account above its model and response preferences. */
const CaptureSettingsSection = (): React.JSX.Element => {
  const { t } = useTranslation()
  const settings = useAppSelector((state) => state.app.settings)
  const lens = useAppSelector((state) => state.app.lens)
  const actions = useLensActions()
  const { saveSettings } = useSettingsActions()
  const accent = useAccentButtonProps()
  const [refreshing, setRefreshing] = useState(false)
  const connected = lens.chatGpt.status === 'signed-in'
  const signingIn = lens.chatGpt.status === 'signing-in'
  const selectedModel =
    lens.chatGpt.models.find((model) => model.id === settings.chatGptModel) ??
    lens.chatGpt.models.find((model) => model.isDefault) ??
    lens.chatGpt.models[0]
  const thinking =
    selectedModel?.thinkingVariants
      .map((variant) => variant.value)
      .filter((value): value is ThinkingLevel =>
        THINKING_LEVELS.some((level) => level === value),
      ) ?? []

  useEffect(() => {
    if (connected && selectedModel && selectedModel.id !== settings.chatGptModel)
      void saveSettings({ chatGptModel: selectedModel.id })
  }, [connected, selectedModel, settings.chatGptModel, saveSettings])

  /** Refreshes only ChatGPT account metadata and its available models. */
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await actions.refresh('chatgpt')
    } finally {
      setRefreshing(false)
    }
  }
  /** Keeps the reasoning selection compatible with the newly selected model. */
  const changeModel = (chatGptModel: string): void => {
    const model = lens.chatGpt.models.find((item) => item.id === chatGptModel)
    const variants = model?.thinkingVariants.map((variant) => variant.value) ?? []
    const preferred = THINKING_LEVELS.find((level) => variants.includes(level)) ?? 'off'
    void saveSettings({
      chatGptModel,
      chatGptThinkingLevel: variants.includes(settings.chatGptThinkingLevel)
        ? settings.chatGptThinkingLevel
        : preferred,
    })
  }
  return (
    <div className={cx(styles.settingContainer)}>
      <h2 className={cx(styles.groupTitle)}>ChatGPT</h2>
      <section className={cx(styles.settingGroup)}>
        <SettingRow
          title={connected ? lens.chatGpt.accountEmail || 'ChatGPT' : t('lens.disconnected')}
          description={
            connected
              ? lens.chatGpt.limitLabel.split(' · ')[0] || t('lens.connected')
              : t('lens.loginDescription')
          }
        >
          <Space wrap>
            {connected ? (
              <>
                <Button
                  {...accent}
                  loading={refreshing}
                  icon={<RefreshCw size={14} />}
                  onClick={() => void refresh()}
                >
                  {t('lens.refreshModels')}
                </Button>
                <Button danger icon={<LogOut size={14} />} onClick={() => void actions.signOut()}>
                  {t('lens.signOut')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  {...accent}
                  loading={signingIn}
                  icon={<LogIn size={14} />}
                  onClick={() => void actions.signIn()}
                >
                  {signingIn ? t('lens.signingIn') : t('lens.signIn')}
                </Button>
                {signingIn && (
                  <Button onClick={() => void actions.signOut()}>{t('common.cancel')}</Button>
                )}
              </>
            )}
          </Space>
        </SettingRow>
        {lens.chatGpt.error && <Alert type="error" showIcon title={lens.chatGpt.error} />}
        {connected && (
          <>
            {lens.chatGpt.usageWindows.map((usage) => (
              <SettingRow
                key={usage.label}
                title={
                  usage.label === 'Session'
                    ? t('lens.sessionUsage')
                    : usage.label === 'Weekly'
                      ? t('lens.weeklyUsage')
                      : usage.label
                }
                description=""
              >
                <div className={cx(styles.usageMeter)}>
                  <Progress
                    percent={Math.min(100, Math.max(0, usage.percent))}
                    strokeColor={usageColor(usage.percent)}
                    showInfo={false}
                    size="small"
                  />
                  <span>{t('lens.usageUsed', { percent: usage.percent })}</span>
                  {usage.resetAt > 0 && (
                    <span>
                      {t('lens.usageReset', {
                        date: new Intl.DateTimeFormat(settings.uiLanguage, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          hour12: settings.timeFormat === '12-hour',
                        }).format(usage.resetAt),
                      })}
                    </span>
                  )}
                </div>
              </SettingRow>
            ))}
            <SettingRow title={t('lens.chatGptModel')} description={t('lens.modelDescription')}>
              <Select
                showSearch
                optionFilterProp="label"
                aria-label={t('lens.chatGptModel')}
                className={cx(styles.wideControl)}
                value={selectedModel?.id ?? null}
                loading={refreshing}
                options={lens.chatGpt.models.map((model) => ({
                  value: model.id,
                  label: model.displayName || model.id,
                }))}
                onChange={changeModel}
              />
            </SettingRow>
            <SettingRow title={t('lens.reasoning')} description={t('lens.reasoningDescription')}>
              <Select
                aria-label={t('lens.reasoning')}
                className={cx(styles.compactControl)}
                value={
                  thinking.includes(settings.chatGptThinkingLevel)
                    ? settings.chatGptThinkingLevel
                    : (thinking[0] ?? 'off')
                }
                options={(thinking.length ? thinking : ['off']).map((level) => ({
                  value: level,
                  label: level,
                }))}
                onChange={(chatGptThinkingLevel: ThinkingLevel) =>
                  void saveSettings({ chatGptThinkingLevel })
                }
              />
            </SettingRow>
            <SettingRow title={t('lens.verbosity')} description={t('lens.verbosityDescription')}>
              <Select
                aria-label={t('lens.verbosity')}
                className={cx(styles.compactControl)}
                value={settings.chatGptVerbosity}
                options={VERBOSITY_LEVELS.map((value) => ({
                  value,
                  label: t(
                    value === 'low'
                      ? 'lens.detailLow'
                      : value === 'medium'
                        ? 'lens.detailMedium'
                        : 'lens.detailHigh',
                  ),
                }))}
                onChange={(chatGptVerbosity: VerbosityLevel) =>
                  void saveSettings({ chatGptVerbosity })
                }
              />
            </SettingRow>
            <SettingRow
              title={t('lens.serviceTier')}
              description={t('lens.serviceTierDescription')}
            >
              <Select
                aria-label={t('lens.serviceTier')}
                className={cx(styles.compactControl)}
                value={settings.chatGptServiceTier}
                options={SERVICE_TIERS.map((value) => ({
                  value,
                  label: t(value === 'fast' ? 'lens.tierFast' : 'lens.tierNormal'),
                }))}
                onChange={(chatGptServiceTier: ServiceTier) =>
                  void saveSettings({ chatGptServiceTier })
                }
              />
            </SettingRow>
          </>
        )}
      </section>
      <h2 className={cx(styles.groupTitle)}>{t('lens.captureSettings')}</h2>
      <section className={cx(styles.settingGroup)}>
        <SettingRow title={t('lens.hotkey')} description={t('lens.hotkeyDescription')}>
          <HotkeyInput />
        </SettingRow>
        <p className={cx(styles.note)} role="status">
          {lens.hotkey.registered
            ? t('lens.hotkeyReady', { hotkey: lens.hotkey.accelerator })
            : lens.hotkey.error || t('lens.hotkeyUnavailable')}
        </p>
        <SettingRow title={t('lens.language')} description={t('lens.languageDescription')}>
          <Select
            aria-label={t('lens.language')}
            className={cx(styles.compactControl)}
            value={settings.descriptionLanguage}
            options={APP_LOCALES.map((locale) => ({
              value: locale,
              label: t(`locales.${locale}`),
            }))}
            onChange={(descriptionLanguage: string) => void saveSettings({ descriptionLanguage })}
          />
        </SettingRow>
      </section>
      <Alert type="info" showIcon title={t('lens.capturePrivacy')} />
    </div>
  )
}

export default CaptureSettingsSection
