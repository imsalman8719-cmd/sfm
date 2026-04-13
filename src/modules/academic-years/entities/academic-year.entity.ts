import { Entity, Column, OneToMany } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';

@Entity('academic_years')
export class AcademicYear extends CoreEntity {
  @Column({ unique: true, length: 20 })
  name: string; // e.g. "2024-2025"

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'fee_target', type: 'decimal', precision: 15, scale: 2, default: 0 })
  feeTarget: number; // Annual fee revenue target

  // Monthly targets stored as JSON: { "1": 50000, "2": 50000, ... }
  @Column({ name: 'monthly_targets', type: 'jsonb', nullable: true })
  monthlyTargets: Record<string, number>;

  @Column({ name: 'quarterly_targets', type: 'jsonb', nullable: true })
  quarterlyTargets: Record<string, number>; // { "Q1": 150000, ... }
}
