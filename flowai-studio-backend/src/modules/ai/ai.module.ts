import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { RAGModule } from '../rag/rag.module';
import { PrismaModule } from '../../common/modules/prisma.module';

@Module({
  imports: [PrismaModule, RAGModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
