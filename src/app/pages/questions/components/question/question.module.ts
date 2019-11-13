import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { IonicModule } from 'ionic-angular'
import { Ng2FittextModule } from 'ng2-fittext'

import { PipesModule } from '../../../../shared/pipes/pipes.module'
import { WheelSelectorComponent } from '../wheel-selector/wheel-selector.component'
import { AudioInputComponent } from './audio-input/audio-input.component'
import { CheckboxInputComponent } from './checkbox-input/checkbox-input.component'
import { InfoScreenComponent } from './info-screen/info-screen.component'
import { QuestionComponent } from './question.component'
import { RadioInputComponent } from './radio-input/radio-input.component'
import { RangeInfoInputComponent } from './range-info-input/range-info-input.component'
import { RangeInputComponent } from './range-input/range-input.component'
import { SliderInputComponent } from './slider-input/slider-input.component'
import { TextInputComponent } from './text-input/text-input.component'
import { TimedTestComponent } from './timed-test/timed-test.component'

import { LocalizationService } from '../../../../core/services/misc/localization.service'

const COMPONENTS = [
  QuestionComponent,
  AudioInputComponent,
  CheckboxInputComponent,
  RadioInputComponent,
  RangeInputComponent,
  SliderInputComponent,
  TimedTestComponent,
  InfoScreenComponent,
  RangeInfoInputComponent,
  TextInputComponent,
  WheelSelectorComponent
]

@NgModule({
  imports: [
    Ng2FittextModule,
    CommonModule,
    PipesModule,
    FormsModule,
    IonicModule.forRoot(SliderInputComponent)
  ],
  declarations: COMPONENTS,
  providers: [LocalizationService],
  exports: COMPONENTS
})
export class QuestionModule {}
