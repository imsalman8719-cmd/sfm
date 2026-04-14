import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalSettings } from './entities/global-settings.entity';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(GlobalSettings) private readonly repo: Repository<GlobalSettings>,
  ) {}

  /** Create singleton row on first boot if it doesn't exist */
  async onModuleInit() {
    const exists = await this.repo.findOne({ where: { id: 'global' } });
    if (!exists) await this.repo.save(this.repo.create({ id: 'global' }));
  }

  async get(): Promise<GlobalSettings> {
    return this.repo.findOne({ where: { id: 'global' } });
  }

  async update(dto: UpdateSettingsDto, updatedBy?: string): Promise<GlobalSettings> {
    await this.repo.update('global', { ...dto, updatedAt: new Date(), updatedBy });
    return this.get();
  }
}
