import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RAGService } from './services/rag.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RAGController {
  constructor(private readonly ragService: RAGService) {}

  // 知识库管理
  @Post('knowledge-bases')
  createKnowledgeBase(
    @CurrentUser('userId') userId: string,
    @Body() createKnowledgeBaseDto: CreateKnowledgeBaseDto,
  ) {
    return this.ragService.createKnowledgeBase(userId, createKnowledgeBaseDto);
  }

  @Get('knowledge-bases')
  findKnowledgeBases(@CurrentUser('userId') userId: string) {
    return this.ragService.findKnowledgeBases(userId);
  }

  @Get('knowledge-bases/:id')
  findKnowledgeBaseById(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.ragService.findKnowledgeBaseById(userId, id);
  }

  @Patch('knowledge-bases/:id')
  updateKnowledgeBase(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() updateKnowledgeBaseDto: UpdateKnowledgeBaseDto,
  ) {
    return this.ragService.updateKnowledgeBase(userId, id, updateKnowledgeBaseDto);
  }

  @Delete('knowledge-bases/:id')
  deleteKnowledgeBase(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.ragService.deleteKnowledgeBase(userId, id);
  }

  // 文档管理
  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser('userId') userId: string,
    @Body('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ragService.uploadDocument(userId, knowledgeBaseId, file);
  }

  @Get('documents/:documentId/chunks')
  getDocumentChunks(
    @CurrentUser('userId') userId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.ragService.getDocumentChunks(userId, documentId);
  }

  @Delete('documents/:documentId')
  deleteDocument(
    @CurrentUser('userId') userId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.ragService.deleteDocument(userId, documentId);
  }

  // 检索
  @Post('retrieve')
  retrieve(
    @Body('query') query: string,
    @Body('knowledgeBaseId') knowledgeBaseId: string,
    @Body('topK') topK: number = 5,
  ) {
    return this.ragService.retrieve(query, knowledgeBaseId, topK);
  }
}
