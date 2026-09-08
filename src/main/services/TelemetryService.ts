/**
 * Sends one privacy-bounded startup event to Microsoft Application Insights.
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { resolveApplicationInsightsConnectionString } from '@shared/appInfo'
import type { AppLocale } from '@shared/types'
import { z } from 'zod'
import { readJsonFile, writeJsonFile } from '../storage/atomicJson'

const telemetryIdentitySchema = z.object({
  revision: z.literal(1),
  installationId: z.uuid(),
})

/** Bounded startup facts reported when telemetry is enabled. */
export interface StartupTelemetry {
  appName: string
  enabled: boolean
  version: string
  platform: NodeJS.Platform
  locale: AppLocale
}

/** Ingestion identity and endpoint extracted from a connection string. */
interface ApplicationInsightsConnection {
  instrumentationKey: string
  ingestionUrl: string
}

type TelemetryFetcher = typeof fetch

/** Extracts the ingestion identity and endpoint from an Application Insights connection string. */
const parseConnectionString = (connectionString: string): ApplicationInsightsConnection => {
  const fields = new Map(
    connectionString
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=')
        if (separator === -1) return [entry, ''] as const
        return [entry.slice(0, separator), entry.slice(separator + 1)] as const
      }),
  )
  const instrumentationKey = fields.get('InstrumentationKey')
  const ingestionEndpoint = fields.get('IngestionEndpoint')
  if (!instrumentationKey || !ingestionEndpoint) {
    throw new Error('Application Insights connection string is invalid.')
  }
  return {
    instrumentationKey,
    ingestionUrl: new URL('v2/track', ingestionEndpoint).toString(),
  }
}

/** Builds the ingestion envelope without location, network, or session content. */
const buildStartupEnvelope = (
  connection: ApplicationInsightsConnection,
  startup: StartupTelemetry,
  installationId: string,
): string =>
  JSON.stringify({
    name: `Microsoft.ApplicationInsights.${connection.instrumentationKey.replaceAll('-', '')}.Event`,
    time: new Date().toISOString(),
    iKey: connection.instrumentationKey,
    tags: {
      'ai.application.ver': startup.version,
      'ai.user.id': installationId,
    },
    data: {
      baseType: 'EventData',
      baseData: {
        ver: 2,
        name: 'app.startup',
        properties: {
          appName: startup.appName,
          version: startup.version,
          platform: startup.platform,
          locale: startup.locale,
        },
      },
    },
  })

/** Sends the enabled startup event and persists its anonymous installation identity. */
export default class TelemetryService {
  private readonly identityPath: string
  private startupTracked = false

  /** Creates the telemetry sender without enabling any automatic data collection. */
  public constructor(
    dataRoot: string,
    private readonly fetcher: TelemetryFetcher = fetch,
  ) {
    this.identityPath = join(dataRoot, 'telemetry.json')
  }

  /** Sends at most one startup event per process when telemetry is enabled. */
  public async trackStartup(startup: StartupTelemetry): Promise<void> {
    if (!startup.enabled || this.startupTracked) return
    this.startupTracked = true

    const connection = parseConnectionString(
      resolveApplicationInsightsConnectionString(process.env),
    )
    const installationId = await this.loadInstallationId()
    const response = await this.fetcher(connection.ingestionUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: buildStartupEnvelope(connection, startup, installationId),
    })
    if (!response.ok) {
      throw new Error(`Application Insights ingestion failed with HTTP ${response.status}.`)
    }
  }

  /** Loads the durable anonymous identifier or creates it after missing/malformed data. */
  private async loadInstallationId(): Promise<string> {
    try {
      const persisted = telemetryIdentitySchema.parse(await readJsonFile(this.identityPath))
      return persisted.installationId
    } catch {
      const identity = telemetryIdentitySchema.parse({ revision: 1, installationId: randomUUID() })
      await writeJsonFile(this.identityPath, identity)
      return identity.installationId
    }
  }
}
