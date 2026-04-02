import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/modules/prisma.module';
import { SkillController } from './skill.controller';
import { SkillService } from './services/skill.service';

@Module({
  imports: [PrismaModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
