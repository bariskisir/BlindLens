/** Presents saved screenshots, ChatGPT descriptions, and accessible speech playback controls. */

import { Alert, Button, Image, Progress, Space } from 'antd'
import {
  Camera,
  Copy,
  Download,
  Eye,
  FileText,
  Headphones,
  Pause,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CapturePhase } from '@shared/lens'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useCaptureMedia } from '@renderer/hooks/useCaptureMedia'
import { useSpeechVoices } from '@renderer/hooks/useSpeechVoices'
import { getReadinessIssue } from '@shared/readiness'
import { readinessMessage } from '@renderer/utils/readinessMessage'
import { useLensActions } from '@renderer/hooks/useLensActions'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setPage, setSettingsSection } from '@renderer/store/appSlice'
import { formatDate } from '@renderer/utils/formatters'
import logoUrl from '../../../../../build/icon.svg'
import styles from './WorkspaceView.module.scss'

/** Renders capture progress and the selected session's durable artifacts. */
const WorkspaceView = (): React.JSX.Element => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { currentSession: session, settings, lens, playback } = useAppSelector((state) => state.app)
  const actions = useLensActions()
  const accent = useAccentButtonProps()
  const capture = session?.data.capture
  const image = useCaptureMedia(session?.id, capture?.image?.assetId)
  const voices = useSpeechVoices()
  const setupIssue = getReadinessIssue(settings, lens, {
    available: 'speechSynthesis' in window,
    voiceUris: voices.map((voice) => voice.voiceURI),
  })
  const playingThis = playback.sessionId === session?.id
  const statusLabels: Record<CapturePhase, string> = {
    capturing: t('lens.capturing'),
    analyzing: t('lens.analyzing'),
    synthesizing: t('lens.synthesizing'),
    ready: t('lens.ready'),
    error: t('lens.failed'),
    cancelled: t('lens.cancelled'),
  }
  /** Opens account setup from the workspace. */
  const openSettings = (): void => {
    dispatch(setSettingsSection('capture'))
    dispatch(setPage('settings'))
  }
  const captureButton = lens.busy ? (
    <Button danger size="large" icon={<Square size={15} />} onClick={() => void actions.cancel()}>
      {t('common.cancel')}
    </Button>
  ) : (
    <Button
      {...accent}
      size="large"
      icon={<Camera size={18} />}
      disabled={lens.busy}
      onClick={() => void actions.capture()}
    >
      {t('lens.capture')}
    </Button>
  )
  return (
    <section className={styles.container}>
      <div className={styles.content}>
        {setupIssue && <Alert showIcon type="warning" title={readinessMessage(setupIssue, t)} />}
        {!capture || !session ? (
          <div className={styles.hero}>
            <img className={styles.logo} src={logoUrl} alt="" />
            <span className={styles.eyebrow}>{t('app.tagline')}</span>
            <h1>{t('workspace.title')}</h1>
            <p>{t('workspace.description')}</p>
            <div className={styles.heroActions}>
              {lens.chatGpt.status === 'signed-in' ? (
                captureButton
              ) : (
                <Button {...accent} size="large" onClick={openSettings}>
                  {t('lens.connectChatGpt')}
                </Button>
              )}
              <span>{t('lens.shortcutHint', { hotkey: settings.captureHotkey })}</span>
            </div>
            <div className={styles.features}>
              <article>
                <Eye size={20} />
                <div>
                  <strong>{t('workspace.shellTitle')}</strong>
                  <span>{t('workspace.shellDescription')}</span>
                </div>
              </article>
              <article>
                <FileText size={20} />
                <div>
                  <strong>{t('workspace.sessionsTitle')}</strong>
                  <span>{t('workspace.sessionsDescription')}</span>
                </div>
              </article>
              <article>
                <Headphones size={20} />
                <div>
                  <strong>{t('workspace.securityTitle')}</strong>
                  <span>{t('workspace.securityDescription')}</span>
                </div>
              </article>
            </div>
          </div>
        ) : (
          <div className={styles.savedCapture}>
            <div className={styles.captureHeading}>
              <div>
                <h1>{session.title}</h1>
                <span>
                  {formatDate(session.createdAt, settings.timeFormat)} ·{' '}
                  {capture.model || 'ChatGPT'}
                </span>
              </div>
              {captureButton}
            </div>
            <div className={styles.status} role="status" aria-live="polite">
              <span className={styles.statusDot} />
              {statusLabels[capture.phase]}
            </div>
            {capture.error && <Alert showIcon type="error" title={capture.error} />}
            <div className={styles.artifacts}>
              <article className={styles.card}>
                <div className={styles.cardHeading}>
                  <h2>
                    <Camera size={17} />
                    {t('lens.image')}
                  </h2>
                  <Button
                    type="text"
                    disabled={!capture.image}
                    aria-label={t('lens.exportImage')}
                    icon={<Download size={16} />}
                    onClick={() => void actions.export(session.id, 'image')}
                  />
                </div>
                <div className={styles.imageFrame}>
                  {image ? (
                    <Image src={image} alt={t('lens.imageAlt')} className={styles.screenshot} />
                  ) : (
                    <span>
                      {capture.phase === 'capturing' ? t('lens.capturing') : t('lens.noImage')}
                    </span>
                  )}
                </div>
                {capture.image && (
                  <div className={styles.imageMeta}>
                    {capture.image.width} × {capture.image.height} · PNG
                  </div>
                )}
              </article>
              <article className={styles.card}>
                <div className={styles.cardHeading}>
                  <h2>
                    <FileText size={17} />
                    {t('lens.answer')}
                  </h2>
                  <Space>
                    <Button
                      type="text"
                      disabled={!capture.answer}
                      aria-label={t('lens.copyText')}
                      icon={<Copy size={16} />}
                      onClick={() => void actions.copy(session.id)}
                    />
                    <Button
                      type="text"
                      disabled={!capture.answer}
                      aria-label={t('lens.exportText')}
                      icon={<Download size={16} />}
                      onClick={() => void actions.export(session.id, 'text')}
                    />
                  </Space>
                </div>
                <div className={styles.answer} lang={capture.language}>
                  {capture.answer || t('lens.waitingForAnswer')}
                </div>
              </article>
            </div>
            <article className={styles.audioCard}>
              <div>
                <h2>
                  <Headphones size={19} />
                  {t('lens.audio')}
                </h2>
                <p>
                  {capture.speech
                    ? `${capture.speech.provider === 'web-speech' ? 'Web Speech' : capture.speech.provider === 'deepgram' ? 'Deepgram' : 'OpenRouter'} · ${capture.speech.voice || t('lens.automaticVoice')} · ${capture.speech.rate.toFixed(2)}×`
                    : t('lens.noAudio')}
                </p>
              </div>
              <Space wrap>
                <Button
                  {...accent}
                  disabled={!capture.speech || (playingThis && playback.status === 'loading')}
                  icon={
                    playingThis && playback.status === 'playing' ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )
                  }
                  onClick={() => {
                    if (playingThis && playback.status === 'playing') actions.pause()
                    else if (playingThis && playback.status === 'paused') void actions.resume()
                    else void actions.play(session)
                  }}
                >
                  {playingThis && playback.status === 'playing'
                    ? t('lens.pause')
                    : t('lens.listen')}
                </Button>
                <Button
                  disabled={!playingThis}
                  icon={<Square size={15} />}
                  onClick={() => actions.stop()}
                >
                  {t('lens.stop')}
                </Button>
                <Button
                  disabled={!capture.speech?.assetIds.length}
                  icon={<Download size={16} />}
                  onClick={() => void actions.export(session.id, 'audio')}
                >
                  {t('lens.exportAudio')}
                </Button>
              </Space>
              {playingThis && (
                <Progress
                  percent={Math.round(playback.progress * 100)}
                  showInfo={false}
                  size="small"
                />
              )}
              {capture.speech?.provider === 'web-speech' && (
                <p className={styles.audioNote}>{t('lens.webSpeechNote')}</p>
              )}
            </article>
            <Space wrap>
              <Button
                disabled={lens.busy || !capture.image || lens.chatGpt.status !== 'signed-in'}
                icon={<RefreshCw size={15} />}
                onClick={() => void actions.retry(session.id, false)}
              >
                {t('lens.describeAgain')}
              </Button>
              <Button
                disabled={lens.busy || !capture.answer}
                icon={<Headphones size={15} />}
                onClick={() => void actions.retry(session.id, true)}
              >
                {t('lens.regenerateSpeech')}
              </Button>
            </Space>
            <details className={styles.promptDetails}>
              <summary>{t('lens.usedPrompt')}</summary>
              <pre>{capture.prompt}</pre>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}

export default WorkspaceView
