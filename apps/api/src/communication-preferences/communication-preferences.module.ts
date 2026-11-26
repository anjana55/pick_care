import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommunicationPreferencesService } from './communication-preferences.service';
import { MyCommunicationPreferencesController, StaffCommunicationPreferencesController } from './communication-preferences.controller';

/** How each client and caregiver wants to hear from us; see the service. */
@Module({
  imports: [AuditModule],
  controllers: [MyCommunicationPreferencesController, StaffCommunicationPreferencesController],
  providers: [CommunicationPreferencesService],
  exports: [CommunicationPreferencesService],
})
export class CommunicationPreferencesModule {}
