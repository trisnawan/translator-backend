import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../common/enums';
import { CreateLanguageDto } from './dto/create-language.dto';
import { LanguageIdParamDto } from './dto/language-id-param.dto';
import { ListLanguagesQueryDto } from './dto/list-languages-query.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { Language } from './entities/language.entity';
import { LanguagesService } from './languages.service';

@Controller('languages')
export class LanguagesController {
  constructor(private readonly languagesService: LanguagesService) {}

  @Get()
  @Roles(AccountRole.ADMIN, AccountRole.CLIENT)
  @ResponseMessage('Languages retrieved successfully')
  findAll(
    @Query() query: ListLanguagesQueryDto,
  ): Promise<PaginatedResult<Language>> {
    return this.languagesService.paginate(query);
  }

  @Post('insert')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Language created successfully')
  create(@Body() dto: CreateLanguageDto): Promise<Language> {
    return this.languagesService.create(dto);
  }

  @Put('update/:id')
  @Roles(AccountRole.ADMIN)
  @ResponseMessage('Language updated successfully')
  update(
    @Param() params: LanguageIdParamDto,
    @Body() dto: UpdateLanguageDto,
  ): Promise<Language> {
    return this.languagesService.update(params.id, dto);
  }
}
