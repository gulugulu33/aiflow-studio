import { Module } from '@nestjs/common';
import { RAGController } from './rag.controller';
import { RAGService } from './services/rag.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [RAGController],
  providers: [RAGService],
  exports: [RAGService],
})
export class RAGModule {}
