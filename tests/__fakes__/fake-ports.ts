import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import { MockVaultPort } from '@/infrastructure/mock/MockVaultPort'
import { MockMetadataCachePort } from '@/infrastructure/mock/MockMetadataCachePort'
import { MockCanvasPort } from '@/infrastructure/mock/MockCanvasPort'
import { MockNotificationPort } from '@/infrastructure/mock/MockNotificationPort'
import { MockLoggerPort } from '@/infrastructure/mock/MockLoggerPort'
import { MockSettingsPort } from '@/infrastructure/mock/MockSettingsPort'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'

export interface FakePorts {
  vault: MockVaultPort
  metadataCache: MockMetadataCachePort
  canvas: MockCanvasPort
  notification: MockNotificationPort
  logger: MockLoggerPort
  settings: MockSettingsPort
  confirmModal: MockConfirmModalPort
  cli: MockObsidianCliPort
  bridge: MockBridge // keep for back-compat — still exposes all the mocks
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    vault: bridge.vaultPort,
    metadataCache: bridge.metadataCachePort,
    canvas: bridge.canvasPort,
    notification: bridge.notificationPort,
    logger: bridge.loggerPort,
    settings: bridge.settingsPort,
    confirmModal: new MockConfirmModalPort(),
    cli: new MockObsidianCliPort(),
    bridge,
  }
}
