/**
 * Centralizes application identity and stable shared configuration.
 */

export const APP_NAME = 'BlindLens'
export const APP_SLUG = APP_NAME.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
export const APP_OWNER = 'bariskisir'
export const APP_ID = `com.${APP_OWNER}.${APP_SLUG}`
export const APP_USER_AGENT = `${APP_NAME}-Desktop`
export const APP_AUTHOR = 'Barış Kısır'
export const APP_AUTHOR_URL = 'https://www.bariskisir.com'
export const APP_REPO = `${APP_OWNER}/${APP_NAME}`
export const APP_REPO_URL = `https://github.com/${APP_REPO}`

export const APPLICATION_INSIGHTS_CONNECTION_STRING =
  'InstrumentationKey=57d6037c-32f2-4e33-8afc-9bca358e1edc;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/;LiveEndpoint=https://northeurope.livediagnostics.monitor.azure.com/;ApplicationId=ff3ae8d8-26c5-4100-ab92-7eb53497d2bf'

/** Uses a non-empty environment override before the checked-in telemetry fallback. */
export const resolveApplicationInsightsConnectionString = (
  environment: Readonly<Record<string, string | undefined>>,
): string =>
  environment.APPLICATION_INSIGHTS_CONNECTION_STRING?.trim() ||
  APPLICATION_INSIGHTS_CONNECTION_STRING
