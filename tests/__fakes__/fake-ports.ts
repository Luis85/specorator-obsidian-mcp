import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import type {
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  NotificationPort,
  LoggerPort,
  SettingsPort,
  ConfirmModalPort,
} from '@/domain/ports'

export interface FakePorts {
  vault: VaultPort
  metadataCache: MetadataCachePort
  canvas: CanvasPort
  notification: NotificationPort
  logger: LoggerPort
  settings: SettingsPort
  confirmModal: ConfirmModalPort
  bridge: MockBridge
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    vault: bridge,
    metadataCache: bridge,
    canvas: bridge,
    notification: bridge,
    logger: bridge,
    settings: bridge,
    confirmModal: new MockConfirmModalPort(),
    bridge,
  }
}
