import { Module } from '@nestjs/common';
import { CaregiversService } from './caregivers.service';
import { CaregiversController } from './caregivers.controller';
import { CaregiverPhotoService } from './caregiver-photo.service';
import { CaregiverPhotoController } from './caregiver-photo.controller';
import { AuditModule } from '../audit/audit.module';
import { AccountDeletionModule } from '../account-deletion/account-deletion.module';

@Module({
  imports: [AuditModule, AccountDeletionModule],
  providers: [CaregiversService, CaregiverPhotoService],
  controllers: [CaregiversController, CaregiverPhotoController],
  exports: [CaregiversService, CaregiverPhotoService],
})
export class CaregiversModule {}
