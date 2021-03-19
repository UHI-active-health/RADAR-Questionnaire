import { Injectable } from '@angular/core'
import * as ver from 'semver'

import {
  DefaultAppVersion,
  DefaultNotificationRefreshTime,
  DefaultNotificationType
} from '../../../../assets/data/defaultConfig'
import { ConfigKeys } from '../../../shared/enums/config'
import {
  ConfigEventType,
  NotificationEventType
} from '../../../shared/enums/events'
import { AssessmentType } from '../../../shared/models/assessment'
import { NotificationActionType } from '../../../shared/models/notification-handler'
import { User } from '../../../shared/models/user'
import { AppServerService } from '../app-server/app-server.service'
import { KafkaService } from '../kafka/kafka.service'
import { LocalizationService } from '../misc/localization.service'
import { LogService } from '../misc/log.service'
import { NotificationService } from '../notifications/notification.service'
import { ScheduleService } from '../schedule/schedule.service'
import { AnalyticsService } from '../usage/analytics.service'
import { AppConfigService } from './app-config.service'
import { ProtocolService } from './protocol.service'
import { QuestionnaireService } from './questionnaire.service'
import { RemoteConfigService } from './remote-config.service'
import { SubjectConfigService } from './subject-config.service'

@Injectable()
export class ConfigService {
  constructor(
    private schedule: ScheduleService,
    private notifications: NotificationService,
    private protocol: ProtocolService,
    private questionnaire: QuestionnaireService,
    private appConfig: AppConfigService,
    private subjectConfig: SubjectConfigService,
    private kafka: KafkaService,
    private localization: LocalizationService,
    private analytics: AnalyticsService,
    private logger: LogService,
    private remoteConfig: RemoteConfigService,
    private appServerService: AppServerService
  ) {}

  fetchConfigState(force?: boolean) {
    return Promise.all([
      this.hasProtocolChanged(force),
      this.hasAppVersionChanged(),
      this.hasTimezoneChanged(),
      this.hasNotificationsExpired(),
      this.hasNotificationMessagingTypeChanged()
    ])
      .then(
        ([
          newProtocol,
          newAppVersion,
          newTimezone,
          newNotifications,
          newMessagingType
        ]) => {
          if (newProtocol && newAppVersion && newTimezone)
            this.subjectConfig
              .getEnrolmentDate()
              .then(d => this.appConfig.init(d))
          if (newMessagingType)
            this.notifications
              .setNotificationMessagingType(newMessagingType)
              .then(() => this.rescheduleNotifications(true))
          if (newProtocol && newTimezone && !newAppVersion)
            return this.updateConfigStateOnTimezoneChange(
              newTimezone
            ).then(() => this.updateConfigStateOnProtocolChange(newProtocol))
          if (newProtocol)
            return this.updateConfigStateOnProtocolChange(newProtocol)
          if (newAppVersion)
            return this.updateConfigStateOnAppVersionChange(newAppVersion)
          if (newTimezone)
            return this.updateConfigStateOnTimezoneChange(newTimezone)
          if (newNotifications) return this.rescheduleNotifications(false)
        }
      )
      .catch(e => {
        this.sendConfigChangeEvent(ConfigEventType.ERROR, '', '', e.message)
        throw e
      })
  }

  hasProtocolChanged(force?) {
    return Promise.all([
      this.appConfig.getScheduleHashUrl(),
      this.protocol.getRootTreeHashUrl()
    ])
      .then(([prevHash, currentHash]) => {
        if (prevHash != currentHash || force) {
          return Promise.all([
            this.appConfig.getScheduleVersion(),
            this.protocol.pull()
          ]).then(([scheduleVersion, protocolData]) => {
            this.appConfig.setScheduleHashUrl(currentHash)
            const parsedProtocol = JSON.parse(protocolData.protocol)
            if (scheduleVersion !== parsedProtocol.version || force) {
              this.sendConfigChangeEvent(
                ConfigEventType.PROTOCOL_CHANGE,
                scheduleVersion,
                parsedProtocol.version,
                '',
                protocolData.url
              )
              return parsedProtocol
            }
          })
        } else return false
      })
      .catch(() => {
        throw new Error('Error pulling protocols.')
      })
  }

  hasNotificationMessagingTypeChanged() {
    return Promise.all([
      this.remoteConfig
        .read()
        .then(config =>
          config.getOrDefault(
            ConfigKeys.NOTIFICATION_MESSAGING_TYPE,
            DefaultNotificationType
          )
        ),
      this.notifications.getNotificationMessagingType()
    ]).then(([type, previousType]) => (type !== previousType ? type : false))
  }

  hasTimezoneChanged() {
    return this.appConfig.getUTCOffset().then(prevUtcOffset => {
      const utcOffset = new Date().getTimezoneOffset()
      // NOTE: Cancels all notifications and reschedule tasks if timezone has changed
      if (prevUtcOffset !== utcOffset) {
        this.sendConfigChangeEvent(
          ConfigEventType.TIMEZONE_CHANGE,
          prevUtcOffset,
          utcOffset
        )
        console.log(
          `[SPLASH] Timezone has changed to  ${utcOffset} Refreshing config..`
        )
        return { prevUtcOffset, utcOffset }
      } else {
        console.log(`[SPLASH] Current Timezone is ${utcOffset}`)
        return false
      }
    })
  }

  hasAppVersionChanged() {
    return Promise.all([
      this.appConfig.getStoredAppVersion(),
      this.appConfig.getAppVersion()
    ]).then(([storedAppVersion, appVersion]) => {
      if (storedAppVersion !== appVersion) {
        this.sendConfigChangeEvent(
          ConfigEventType.APP_VERSION_CHANGE,
          storedAppVersion,
          appVersion
        )
        return appVersion
      } else return false
    })
  }

  hasNotificationsExpired() {
    // NOTE: Only run this if not run in last DefaultNotificationRefreshTime
    return this.notifications.getLastNotificationUpdate().then(lastUpdate => {
      const timeElapsed = Date.now() - lastUpdate
      return (
        timeElapsed > DefaultNotificationRefreshTime ||
        !lastUpdate ||
        timeElapsed < 0
      )
    })
  }

  checkForAppUpdates() {
    return Promise.all([
      this.remoteConfig
        .read()
        .then(config =>
          config.getOrDefault(ConfigKeys.APP_VERSION_LATEST, DefaultAppVersion)
        ),
      this.appConfig.getAppVersion()
    ])
      .then(([playstoreVersion, currentVersion]) =>
        ver.gt(ver.clean(playstoreVersion), ver.clean(currentVersion))
      )
      .catch(() => false)
  }

  checkParticipantEnrolled() {
    return this.subjectConfig
      .getParticipantLogin()
      .then(participant => (participant ? participant : Promise.reject([])))
  }

  updateConfigStateOnProtocolChange(protocol) {
    const assessments = this.protocol.format(protocol.protocols)
    this.logger.log(assessments)
    return this.questionnaire
      .updateAssessments(AssessmentType.ALL, assessments)
      .then(() => this.regenerateSchedule())
      .then(() => this.appConfig.setScheduleVersion(protocol.version))
  }

  updateConfigStateOnLanguageChange() {
    return Promise.all([
      this.questionnaire.pullQuestionnaires(AssessmentType.ON_DEMAND),
      this.questionnaire.pullQuestionnaires(AssessmentType.CLINICAL),
      this.questionnaire.pullQuestionnaires(AssessmentType.SCHEDULED)
    ]).then(() => this.rescheduleNotifications(true))
  }

  updateConfigStateOnAppVersionChange(version) {
    return this.appConfig
      .setAppVersion(version)
      .then(() => this.fetchConfigState(true))
  }

  updateConfigStateOnTimezoneChange({ prevUtcOffset, utcOffset }) {
    // NOTE: Update midnight to time zone of reference date.
    return this.subjectConfig
      .getEnrolmentDate()
      .then(enrolment => this.appConfig.setReferenceDate(enrolment))
      .then(() => this.appConfig.setUTCOffset(utcOffset))
      .then(() => this.regenerateSchedule(prevUtcOffset))
  }

  rescheduleNotifications(cancel?: boolean) {
    return (cancel ? this.cancelNotifications() : Promise.resolve([]))
      .then(() =>
        this.notifications.publish(NotificationActionType.SCHEDULE_ALL)
      )
      .then(() => console.log('NOTIFICATIONS scheduled after config change'))
      .then(() =>
        cancel
          ? this.sendConfigChangeEvent(NotificationEventType.RESCHEDULED)
          : this.sendConfigChangeEvent(NotificationEventType.REFRESHED)
      )
      .catch(e => {
        throw this.logger.error('Failed to reschedule notifications', e)
      })
  }

  cancelNotifications() {
    this.sendConfigChangeEvent(NotificationEventType.CANCELLED)
    return this.notifications.publish(NotificationActionType.CANCEL_ALL)
  }

  cancelSingleNotification(notificationId: number) {
    if (notificationId) {
      return this.notifications.publish(
        NotificationActionType.CANCEL_SINGLE,
        0,
        notificationId
      )
    }
    return
  }

  regenerateSchedule(prevUTCOffset?: number) {
    return this.appConfig
      .getReferenceDate()
      .then(refDate => this.schedule.generateSchedule(refDate, prevUTCOffset))
      .catch(e => {
        throw this.logger.error('Failed to generate schedule', e)
      })
      .then(() => this.rescheduleNotifications(true))
  }

  resetAll() {
    this.sendConfigChangeEvent(ConfigEventType.APP_RESET)
    this.cancelNotifications()
    return Promise.all([this.resetConfig(), this.resetCache()]).then(() =>
      this.subjectConfig.reset()
    )
  }

  resetConfig() {
    return Promise.all([
      this.appConfig.reset(),
      this.questionnaire.reset(),
      this.schedule.reset(),
      this.notifications.reset(),
      this.localization.init()
    ])
  }

  resetCache() {
    return this.kafka.reset()
  }

  setAll(user: User) {
    return Promise.all([
      this.subjectConfig
        .init(user)
        .then(() => this.analytics.setUserProperties(user))
        .then(() => this.appConfig.init(user.enrolmentDate)),
      this.localization.init(),
      this.kafka.init()
    ]).then(() => this.notifications.init())
  }

  getAll() {
    return {
      participantID: this.subjectConfig.getParticipantID(),
      projectName: this.subjectConfig.getProjectName(),
      enrolmentDate: this.subjectConfig.getEnrolmentDate(),
      scheduleVersion: this.appConfig.getScheduleVersion(),
      notificationSettings: this.appConfig.getNotificationSettings(),
      weeklyReport: this.appConfig.getReportSettings(),
      appVersion: this.appConfig.getAppVersion(),
      languagesSelectable: this.localization.getLanguageSettings(),
      language: Promise.resolve(this.localization.getLanguage()),
      cacheSize: this.kafka.getCacheSize(),
      lastUploadDate: this.kafka.getLastUploadDate(),
      lastNotificationUpdate: this.notifications.getLastNotificationUpdate()
    }
  }

  sendConfigChangeEvent(type, previous?, current?, error?, data?) {
    this.analytics.logEvent(type, {
      previous: String(previous),
      current: String(current),
      error: String(error),
      data: String(data)
    })
  }

  sendTestNotification() {
    this.sendConfigChangeEvent(NotificationEventType.TEST)
    return this.notifications.publish(NotificationActionType.TEST)
  }

  sendCachedData() {
    return this.kafka.sendAllFromCache()
  }

  updateSettings(settings) {
    // TODO: Fix settings
  }
}
