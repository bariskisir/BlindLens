/**
 * Applies Ant Design component tokens and locale data.
 */

import type { PropsWithChildren } from 'react'
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import deDE from 'antd/locale/de_DE'
import enUS from 'antd/locale/en_US'
import esES from 'antd/locale/es_ES'
import frFR from 'antd/locale/fr_FR'
import jaJP from 'antd/locale/ja_JP'
import koKR from 'antd/locale/ko_KR'
import ptPT from 'antd/locale/pt_PT'
import ruRU from 'antd/locale/ru_RU'
import trTR from 'antd/locale/tr_TR'
import zhCN from 'antd/locale/zh_CN'
import type { AppLocale, ResolvedThemeMode } from '@shared/types'
import { useAppSelector } from '@renderer/store'
import { useTheme } from './ThemeProvider'

const ANTD_LOCALES = {
  en: enUS,
  tr: trTR,
  de: deDE,
  fr: frFR,
  pt: ptPT,
  zh: zhCN,
  es: esES,
  ru: ruRU,
  ja: jaJP,
  ko: koKR,
} satisfies Record<AppLocale, typeof enUS>

const COMPONENT_TOKENS: ThemeConfig['components'] = {
  Button: {
    controlHeight: 30,
    paddingInline: 11,
    boxShadow: 'none',
    primaryShadow: 'none',
  },
  Input: { controlHeight: 30, colorBorder: 'var(--color-border)' },
  Select: { controlHeight: 30, colorBorder: 'var(--color-border)' },
  Switch: { trackMinWidth: 40, handleSize: 19, trackPadding: 1.5 },
  Modal: { colorBgElevated: 'var(--modal-background)' },
  Drawer: { colorBgElevated: 'var(--modal-background)' },
  Divider: { colorSplit: 'rgba(128,128,128,.15)' },
  Tooltip: { fontSize: 12 },
}

/** Builds the desktop component theme for one resolved appearance. */
const createThemeConfig = (theme: ResolvedThemeMode): ThemeConfig => ({
  cssVar: {},
  hashed: false,
  algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#00b96b',
    fontFamily: 'var(--font-family)',
    borderRadius: 8,
    colorBgMask: theme === 'dark' ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.75)',
    motionDurationMid: '120ms',
  },
  components: COMPONENT_TOKENS,
})

/** Supplies consistent desktop component sizing, colors, and localization. */
const AntdProvider = ({ children }: PropsWithChildren): React.JSX.Element => {
  const locale = useAppSelector((state) => state.app.settings.uiLanguage)
  const { theme } = useTheme()

  return (
    <ConfigProvider locale={ANTD_LOCALES[locale]} theme={createThemeConfig(theme)}>
      {children}
    </ConfigProvider>
  )
}

export default AntdProvider
