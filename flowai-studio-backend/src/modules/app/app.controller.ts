import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('apps')
@UseGuards(JwtAuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() createAppDto: CreateAppDto,
  ) {
    return this.appService.create(userId, createAppDto);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.appService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.appService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() updateAppDto: UpdateAppDto,
  ) {
    return this.appService.update(userId, id, updateAppDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.appService.remove(userId, id);
  }

  @Patch(':id/publish')
  publish(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.appService.publish(userId, id);
  }

  @Patch(':id/unpublish')
  unpublish(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.appService.unpublish(userId, id);
  }
}
