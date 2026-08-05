import { Module } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveyResponsesController } from './survey-responses.controller';
import { SurveysService } from './surveys.service';

/**
 * SurveysService is exported (not just provided) so another domain module
 * can import SurveysModule and inject SurveysService to call
 * createSurveyResponse() directly — see that method's header comment in
 * surveys.service.ts for the intended call shape. No caller is wired in
 * yet: Case resolution, the obvious first trigger, lives in a module
 * another agent is building in this same Batch, not built yet.
 */
@Module({
  controllers: [SurveysController, SurveyResponsesController],
  providers: [SurveysService],
  exports: [SurveysService],
})
export class SurveysModule {}
