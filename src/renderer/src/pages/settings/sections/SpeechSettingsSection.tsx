/** Matches epubreader's language and voice choices with AIMediaStudio's provider connection layout. */

import { useEffect, useState } from 'react'
import { Alert, Button, Input, InputNumber, Select, Space, Switch, Tag } from 'antd'
import { CircleCheck, ExternalLink, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SPEECH_PROVIDERS, type SpeechProvider } from '@shared/lens'
import { APP_LOCALES } from '@shared/settings'
import { DEEPGRAM_VOICES } from '@shared/speech'
import { useSpeechVoices } from '@renderer/hooks/useSpeechVoices'
import { useLensActions } from '@renderer/hooks/useLensActions'
import { useDesktopActions } from '@renderer/hooks/useDesktopActions'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import SettingRow from '../components/SettingRow'
import SavedTextInput from '../components/SavedTextInput'
import { cx } from '@renderer/utils/classNames'
import styles from '../SettingsPage.module.scss'

/** Displays provider-specific connection, language, model, and voice defaults. */
const SpeechSettingsSection = (): React.JSX.Element => {
  const { t } = useTranslation()
  const settings = useAppSelector((state) => state.app.settings)
  const lens = useAppSelector((state) => state.app.lens)
  const voices = useSpeechVoices()
  const actions = useLensActions()
  const { refresh: refreshProvider } = actions
  const desktop = useDesktopActions()
  const accent = useAccentButtonProps()
  const { saveSettings } = useSettingsActions()
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const provider = settings.speechProvider
  const hasKey = provider !== 'web-speech' && lens.credentials[provider]
  const model =
    lens.speechModels.find((item) => item.id === settings.openRouterModel) ?? lens.speechModels[0]
  const names = { 'web-speech': 'Web Speech', deepgram: 'Deepgram', openrouter: 'OpenRouter' }
  const deepgramVoices = DEEPGRAM_VOICES[settings.descriptionLanguage] ?? []

  useEffect(() => {
    if (provider === 'openrouter') void refreshProvider('openrouter')
  }, [provider, refreshProvider])

  useEffect(() => {
    if (provider === 'openrouter' && model && model.id !== settings.openRouterModel)
      void saveSettings({ openRouterModel: model.id, openRouterVoice: model.voices[0] ?? '' })
  }, [provider, model, settings.openRouterModel, saveSettings])

  /** Validates and saves one credential, clearing its transient input after success. */
  const saveKey = async (value: string): Promise<void> => {
    if (provider === 'web-speech') return
    setSaving(true)
    try {
      if (await actions.saveKey(provider, value)) setKey('')
    } finally {
      setSaving(false)
    }
  }
  /** Refreshes the OpenRouter catalog and credit independently of ChatGPT login. */
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await refreshProvider('openrouter')
    } finally {
      setRefreshing(false)
    }
  }
  /** Changes the description language and selects a compatible provider voice. */
  const changeLanguage = (descriptionLanguage: string): void => {
    const firstVoice = DEEPGRAM_VOICES[descriptionLanguage]?.[0]
    void saveSettings({
      descriptionLanguage,
      webSpeechVoice: '',
      ...(provider === 'deepgram' && firstVoice
        ? { deepgramModel: `aura-2-${firstVoice}-${descriptionLanguage}` }
        : {}),
    })
  }
  /** Changes the speech model and resets its voice to an advertised compatible choice. */
  const changeModel = (openRouterModel: string): void => {
    void saveSettings({
      openRouterModel,
      openRouterVoice:
        lens.speechModels.find((item) => item.id === openRouterModel)?.voices[0] ?? '',
    })
  }
  return (
    <div className={cx(styles.settingContainer)}>
      <h2 className={cx(styles.groupTitle)}>{t('lens.speechSettings')}</h2>
      <section className={cx(styles.settingGroup)}>
        <SettingRow title={t('lens.provider')} description={t('lens.providerDescription')}>
          <Select
            aria-label={t('lens.provider')}
            className={cx(styles.compactControl)}
            value={provider}
            options={SPEECH_PROVIDERS.map((value) => ({ value, label: names[value] }))}
            onChange={(speechProvider: SpeechProvider) => {
              setKey('')
              void saveSettings({ speechProvider })
            }}
          />
        </SettingRow>
      </section>
      {provider !== 'web-speech' && (
        <>
          <h2 className={cx(styles.groupTitle)}>{t('lens.connection')}</h2>
          <section className={cx(styles.settingGroup)}>
            <div className={cx(styles.apiNotice)}>
              <KeyRound size={15} />
              <span>{t('lens.keyDescription')}</span>
              <Button
                type="link"
                size="small"
                icon={<ExternalLink size={13} />}
                onClick={() =>
                  void desktop.openExternal(
                    provider === 'openrouter'
                      ? 'https://openrouter.ai/settings/keys'
                      : 'https://console.deepgram.com/',
                  )
                }
              >
                {t('lens.getApiKey')}
              </Button>
            </div>
            <SettingRow title={t('lens.apiKey')} description={names[provider]}>
              <div className={cx(styles.credentialControls)}>
                <Tag
                  color={hasKey ? 'green' : 'warning'}
                  icon={hasKey ? <CircleCheck size={12} /> : <KeyRound size={12} />}
                >
                  {hasKey ? t('lens.keySaved') : t('lens.keyMissing')}
                </Tag>
                <Input.Password
                  aria-label={t('lens.apiKey')}
                  autoComplete="off"
                  placeholder={t('lens.pasteKey')}
                  value={key}
                  maxLength={2000}
                  onChange={(event) => setKey(event.target.value)}
                  onPressEnter={() => {
                    if (key.trim() && !saving) void saveKey(key)
                  }}
                />
                <Space>
                  {hasKey && (
                    <Button
                      danger
                      disabled={saving}
                      icon={<Trash2 size={14} />}
                      onClick={() => void saveKey('')}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                  <Button
                    {...accent}
                    icon={<Save size={14} />}
                    loading={saving}
                    disabled={!key.trim()}
                    onClick={() => void saveKey(key)}
                  >
                    {t('lens.save')}
                  </Button>
                </Space>
              </div>
            </SettingRow>
            {provider === 'openrouter' && hasKey && lens.openRouterBalance !== null && (
              <SettingRow title={t('lens.balance')} description="OpenRouter">
                <Space>
                  <strong>
                    {new Intl.NumberFormat(settings.uiLanguage, {
                      style: 'currency',
                      currency: 'USD',
                    }).format(lens.openRouterBalance)}
                  </strong>
                  <Button
                    type="text"
                    aria-label={t('lens.refreshModels')}
                    loading={refreshing}
                    icon={<RefreshCw size={14} />}
                    onClick={() => void refresh()}
                  />
                </Space>
              </SettingRow>
            )}
          </section>
        </>
      )}
      <h2 className={cx(styles.groupTitle)}>{t('lens.modelDefaults')}</h2>
      <section className={cx(styles.settingGroup)}>
        <SettingRow title={t('lens.language')} description={t('lens.languageDescription')}>
          <Select
            aria-label={t('lens.language')}
            showSearch
            optionFilterProp="label"
            className={cx(styles.compactControl)}
            value={settings.descriptionLanguage}
            options={APP_LOCALES.map((locale) => ({
              value: locale,
              label: t(`locales.${locale}`),
            }))}
            onChange={changeLanguage}
          />
        </SettingRow>
        {provider === 'web-speech' && (
          <SettingRow title={t('lens.voice')} description={t('lens.webSpeechNote')}>
            <Select
              aria-label={t('lens.voice')}
              showSearch
              optionFilterProp="label"
              className={cx(styles.wideControl)}
              value={settings.webSpeechVoice}
              options={[
                { value: '', label: t('lens.automaticVoice') },
                ...voices
                  .filter((voice) => voice.lang.split('-')[0] === settings.descriptionLanguage)
                  .map((voice) => ({
                    value: voice.voiceURI,
                    label: `${voice.name} · ${voice.lang}`,
                  })),
              ]}
              onChange={(webSpeechVoice: string) => void saveSettings({ webSpeechVoice })}
            />
          </SettingRow>
        )}
        {provider === 'deepgram' && (
          <SettingRow title={t('lens.voice')} description={t('lens.deepgramDescription')}>
            <Select
              aria-label={t('lens.voice')}
              showSearch
              optionFilterProp="label"
              className={cx(styles.wideControl)}
              value={
                settings.deepgramModel.endsWith(`-${settings.descriptionLanguage}`)
                  ? settings.deepgramModel
                  : null
              }
              options={deepgramVoices.map((name) => ({
                value: `aura-2-${name}-${settings.descriptionLanguage}`,
                label: `${name[0]?.toUpperCase()}${name.slice(1)} · Aura 2`,
              }))}
              onChange={(deepgramModel: string) => void saveSettings({ deepgramModel })}
            />
          </SettingRow>
        )}
        {provider === 'openrouter' && (
          <>
            <SettingRow title={t('lens.speechModel')} description={t('lens.modelDescription')}>
              <Space.Compact className={cx(styles.catalogControl)}>
                <Select
                  aria-label={t('lens.speechModel')}
                  showSearch
                  optionFilterProp="label"
                  className={cx(styles.flexControl)}
                  value={model?.id ?? null}
                  loading={refreshing}
                  options={lens.speechModels.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={changeModel}
                />
                <Button
                  aria-label={t('lens.refreshModels')}
                  loading={refreshing}
                  icon={<RefreshCw size={15} />}
                  onClick={() => void refresh()}
                />
              </Space.Compact>
            </SettingRow>
            <SettingRow title={t('lens.voice')} description={t('lens.openRouterVoiceDescription')}>
              {model?.voices.length ? (
                <Select
                  aria-label={t('lens.voice')}
                  showSearch
                  optionFilterProp="label"
                  className={cx(styles.wideControl)}
                  value={settings.openRouterVoice || null}
                  options={model.voices.map((voice) => ({ value: voice, label: voice }))}
                  onChange={(openRouterVoice: string) => void saveSettings({ openRouterVoice })}
                />
              ) : (
                <SavedTextInput
                  value={settings.openRouterVoice}
                  label={t('lens.voice')}
                  maxLength={300}
                  onSave={(openRouterVoice) => saveSettings({ openRouterVoice })}
                />
              )}
            </SettingRow>
          </>
        )}
        <SettingRow title={t('lens.speechRate')} description={t('lens.speechRateDescription')}>
          <InputNumber
            aria-label={t('lens.speechRate')}
            min={0.5}
            max={2}
            step={0.05}
            value={settings.speechRate}
            onChange={(speechRate) => {
              if (speechRate !== null) void saveSettings({ speechRate })
            }}
          />
        </SettingRow>
        <SettingRow title={t('lens.autoSpeak')} description={t('lens.autoSpeakDescription')}>
          <Switch
            aria-label={t('lens.autoSpeak')}
            checked={settings.autoSpeak}
            onChange={(autoSpeak) => void saveSettings({ autoSpeak })}
          />
        </SettingRow>
      </section>
      {provider === 'web-speech' && !voices.length && (
        <Alert showIcon type="warning" title={t('lens.voiceMissing')} />
      )}
      {provider === 'deepgram' &&
        !settings.deepgramModel.endsWith(`-${settings.descriptionLanguage}`) && (
          <Alert showIcon type="warning" title={t('lens.languageMismatch')} />
        )}
    </div>
  )
}

export default SpeechSettingsSection
