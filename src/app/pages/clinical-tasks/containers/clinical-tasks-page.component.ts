import { Assessment } from '../../../shared/models/assessment'
import { ClinicalTasksService } from '../services/clinical-tasks.service'
import { Component } from '@angular/core'
import { NavController } from 'ionic-angular'
import { QuestionsPageComponent } from '../../questions/containers/questions-page.component'

@Component({
  selector: 'page-clinical-tasks',
  templateUrl: 'clinical-tasks-page.component.html'
})
export class ClinicalTasksPageComponent {
  scrollHeight: number = 500
  assessments: Assessment[]

  constructor(
    private navCtrl: NavController,
    private clinicalTasksService: ClinicalTasksService
  ) {}

  ionViewDidLoad() {
    this.clinicalTasksService.getClinicalAssessments().then(assessments => {
      this.assessments = assessments
    })
  }

  clicked(task) {
    this.clinicalTasksService
      .getClinicalTaskPayload(task)
      .then(payload => this.navCtrl.push(QuestionsPageComponent, payload))
  }
}
