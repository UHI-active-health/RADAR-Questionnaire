import { Injectable } from '@angular/core'
import { Firebase } from '@ionic-native/firebase/ngx'
import { Platform } from 'ionic-angular'

import {
  DefaultNotificationTtlMinutes,
  DefaultNumberOfNotificationsToSchedule,
  FCMPluginProjectSenderId
} from '../../../../assets/data/defaultConfig'
import { ConfigKeys } from '../../../shared/enums/config'
import { StorageKeys } from '../../../shared/enums/storage'
import { NotificationActionType } from '../../../shared/models/notification-handler'
import { getSeconds } from '../../../shared/utilities/time'
import { RemoteConfigService } from '../config/remote-config.service'
import { SubjectConfigService } from '../config/subject-config.service'
import { LocalizationService } from '../misc/localization.service'
import { LogService } from '../misc/log.service'
import { ScheduleService } from '../schedule/schedule.service'
import { StorageService } from '../storage/storage.service'
import { NotificationGeneratorService } from './notification-generator.service'
import { NotificationService } from './notification.service'

declare var FirebasePlugin

@Injectable()
export class FcmNotificationService extends NotificationService {
  private readonly NOTIFICATION_STORAGE = {
    LAST_NOTIFICATION_UPDATE: StorageKeys.LAST_NOTIFICATION_UPDATE
  }
  FCM_TOKEN: string
  upstreamResends: number
  ttlMinutes = 10

  constructor(
    public storage: StorageService,
    public config: SubjectConfigService,
    public firebase: Firebase,
    public platform: Platform,
    public logger: LogService,
    public remoteConfig: RemoteConfigService
  ) {
    super()
    this.remoteConfig.subject().subscribe(cfg => {
      cfg
        .getOrDefault(
          ConfigKeys.NOTIFICATION_TTL_MINUTES,
          String(this.ttlMinutes)
        )
        .then(
          ttl =>
            (this.ttlMinutes = Number(ttl) || DefaultNotificationTtlMinutes)
        )
    })
  }

  init() {
    FirebasePlugin.setSenderId(
      FCMPluginProjectSenderId,
      () => this.logger.log('[NOTIFICATION SERVICE] Set sender id success'),
      error => {
        this.logger.error('Failed to set sender ID', error)
        alert(error)
      }
    )
    FirebasePlugin.getToken(token => {
      this.FCM_TOKEN = token
      this.logger.log('[NOTIFICATION SERVICE] Refresh token success')
    })
  }

  publish(
    type,
    limit: number = DefaultNumberOfNotificationsToSchedule,
    notificationId?: string
  ): Promise<any> {
    this.resetResends()
    return Promise.all([
      this.getSubjectDetails(),
      this.config.getSourceID()
    ]).then(([user, sourceId]) => {
      switch (type) {
        case NotificationActionType.TEST:
          return this.publishTestNotification(user, sourceId)
        case NotificationActionType.CANCEL_ALL:
          return this.cancelAllNotifications(user)
        case NotificationActionType.CANCEL_SINGLE:
          return this.cancelSingleNotification(user, notificationId)
        case NotificationActionType.SCHEDULE_ALL:
        default:
          return this.publishAllNotifications(user, sourceId, limit)
      }
    })
  }

  permissionCheck(): Promise<void> {
    if (!this.platform.is('ios')) return Promise.resolve()
    return this.firebase
      .hasPermission()
      .then(res => (res.isEnabled ? true : this.firebase.grantPermission()))
  }

  setLastNotificationUpdate(): Promise<void> {
    return this.storage.set(
      this.NOTIFICATION_STORAGE.LAST_NOTIFICATION_UPDATE,
      Date.now()
    )
  }

  getLastNotificationUpdate() {
    return this.storage.get(this.NOTIFICATION_STORAGE.LAST_NOTIFICATION_UPDATE)
  }

  resetResends() {
    this.upstreamResends = 0
  }

  calculateTtlSeconds(taskTimestamp, notificationTimestamp, completionWindow) {
    const endTime = taskTimestamp + completionWindow
    const timeUntilEnd = endTime - notificationTimestamp
    return timeUntilEnd > 0
      ? getSeconds({ milliseconds: timeUntilEnd })
      : getSeconds({ minutes: this.ttlMinutes })
  }

  getSubjectDetails() {
    return
  }

  publishAllNotifications(user, sourceId, limit): Promise<any> {
    return
  }

  publishTestNotification(user, sourceId): Promise<void> {
    return
  }

  cancelAllNotifications(user): Promise<any> {
    return
  }

  cancelSingleNotification(user, notificationId) {
    return
  }
}
