import { PartialType } from '@nestjs/mapped-types';
import { CreateKnowledgeBaseDto } from './create-kb.dto';

export class UpdateKnowledgeBaseDto extends PartialType(CreateKnowledgeBaseDto) {}
