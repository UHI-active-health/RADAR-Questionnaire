import { Injectable } from '@angular/core'
import { LocalNotifications } from '@ionic-native/local-notifications/ngx'

import { DefaultNumberOfNotificationsToSchedule } from '../../../../assets/data/defaultConfig'
import { StorageKeys } from '../../../shared/enums/storage'
import { SingleNotification } from '../../../shared/models/notification-handler'
import { TaskType } from '../../../shared/utilities/task-type'
import { LogService } from '../misc/log.service'
import { ScheduleService } from '../schedule/schedule.service'
import { StorageService } from '../storage/storage.service'
import { NotificationGeneratorService } from './notification-generator.service'
import { NotificationService } from './notification.service'

@Injectable()
export class LocalNotificationService extends NotificationService {
  constructor(
    private notifications: NotificationGeneratorService,
    private schedule: ScheduleService,
    private localNotifications: LocalNotifications,
    private store: StorageService,
    private logger: LogService
  ) {
    super(store)
  }

  init() {
    this.permissionCheck()
  }

  publish(
    limit: number = DefaultNumberOfNotificationsToSchedule
  ): Promise<void[]> {
    return this.schedule.getTasks(TaskType.ALL).then(tasks => {
      const localNotifications = this.notifications
        .futureNotifications(tasks, limit)
        .map(t => this.format(t))
      this.logger.log(
        'NOTIFICATIONS Scheduling LOCAL notifications',
        localNotifications
      )
      return Promise.all(
        localNotifications
          .map(n => {
            return this.sendNotification(n)
          })
          .concat([this.setLastNotificationUpdate(Date.now())])
      )
    })
  }

  private sendNotification(notification): Promise<void> {
    return Promise.resolve(this.localNotifications.schedule(notification))
  }

  private format(notification: SingleNotification) {
    return {
      title: notification.title,
      text: notification.text,
      trigger: { at: new Date(notification.timestamp) },
      foreground: true,
      vibrate: true,
      sound: 'file://assets/sounds/serious-strike.mp3',
      smallIcon: 'res://mipmap-ldpi/ic_launcher.png'
    }
  }

  cancel(): Promise<void> {
    this.localNotifications.cancelAll()
    return Promise.resolve()
  }

  permissionCheck(): Promise<void> {
    return Promise.resolve(
      this.localNotifications.hasPermission().then(p => {
        if (!p) {
          this.localNotifications.requestPermission()
        }
      })
    )
  }

  sendTestNotification(): Promise<void> {
    return this.sendNotification(
      this.format(this.notifications.createTestNotification())
    )
  }
}
