import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { RecordStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { pickDefined } from '../../common/utils/object.util';
import { CreateLanguageDto } from './dto/create-language.dto';
import { ListLanguagesQueryDto } from './dto/list-languages-query.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { Language } from './entities/language.entity';

@Injectable()
export class LanguagesService {
  constructor(
    @InjectRepository(Language)
    private readonly languagesRepository: Repository<Language>,
  ) {}

  async paginate(
    query: ListLanguagesQueryDto,
  ): Promise<PaginatedResult<Language>> {
    const builder = this.languagesRepository.createQueryBuilder('language');

    if (query.search) {
      builder.andWhere(
        '(language.id LIKE :search OR language.name LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      builder.andWhere('language.status = :status', { status: query.status });
    }

    builder
      .orderBy('language.name', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();

    return PaginatedResult.from(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<Language> {
    const language = await this.languagesRepository.findOne({ where: { id } });

    if (!language) {
      throw AppException.notFound(`Language "${id}" was not found`);
    }

    return language;
  }

  async create(dto: CreateLanguageDto): Promise<Language> {
    const existing = await this.languagesRepository.findOne({
      where: { id: dto.id },
    });

    if (existing) {
      throw AppException.conflict(`Language "${dto.id}" already exists`);
    }

    await this.languagesRepository.insert({
      id: dto.id,
      name: dto.name.trim(),
      status: dto.status ?? RecordStatus.ACTIVE,
    });

    return this.findById(dto.id);
  }

  async update(id: string, dto: UpdateLanguageDto): Promise<Language> {
    await this.findById(id);

    const payload = pickDefined({ name: dto.name?.trim(), status: dto.status });

    if (Object.keys(payload).length === 0) {
      throw AppException.badRequest('Nothing to update');
    }

    await this.languagesRepository.update({ id }, payload);

    return this.findById(id);
  }

  /** Every language that can be selected in a translation request. */
  findActive(): Promise<Language[]> {
    return this.languagesRepository.find({
      where: { status: RecordStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  /**
   * Ensures both languages of a translation request exist and are active.
   * Returns them keyed by their code.
   */
  async assertUsable(codes: string[]): Promise<Map<string, Language>> {
    const unique = [...new Set(codes.map((code) => code.toLowerCase()))];
    const languages = await this.languagesRepository.find({
      where: { id: In(unique) },
    });
    const map = new Map(languages.map((language) => [language.id, language]));

    for (const code of unique) {
      const language = map.get(code);

      if (!language) {
        throw AppException.badRequest(`Language "${code}" is not registered`);
      }

      if (language.status !== RecordStatus.ACTIVE) {
        throw AppException.badRequest(`Language "${code}" is inactive`);
      }
    }

    return map;
  }
}
