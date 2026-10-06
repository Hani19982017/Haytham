import { prisma } from '../db/prisma.js';
import { AcademicRuleConfig } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';

export class AcademicRuleRepository {
  public static mapToDomain(row: any): AcademicRuleConfig {
    let parsedVal: any = row.valueString;
    let parsedDef: any = row.defaultValue;

    if (!isNaN(Number(row.valueString))) parsedVal = Number(row.valueString);
    else if (row.valueString === 'true' || row.valueString === 'false') parsedVal = row.valueString === 'true';

    if (!isNaN(Number(row.defaultValue))) parsedDef = Number(row.defaultValue);
    else if (row.defaultValue === 'true' || row.defaultValue === 'false') parsedDef = row.defaultValue === 'true';

    return {
      id: row.id,
      key: row.key,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      value: parsedVal,
      defaultValue: parsedDef,
      needsVerification: row.needsVerification,
      notesAr: row.notesAr || '',
      notesEn: row.notesEn || '',
    };
  }

  public static async listAll(): Promise<AcademicRuleConfig[]> {
    const rows = await prisma.academicRule.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map(r => this.mapToDomain(r));
  }

  public static async findByKey(key: string): Promise<AcademicRuleConfig | null> {
    const row = await prisma.academicRule.findUnique({
      where: { key },
    });
    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async findById(id: string): Promise<AcademicRuleConfig | null> {
    const row = await prisma.academicRule.findUnique({
      where: { id },
    });
    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async updateRule(
    id: string,
    data: {
      value: any;
      needsVerification?: boolean;
      notesAr?: string;
      notesEn?: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<AcademicRuleConfig> {
    const client = tx || prisma;
    const updated = await client.academicRule.update({
      where: { id },
      data: {
        valueString: String(data.value),
        ...(data.needsVerification !== undefined && { needsVerification: data.needsVerification }),
        ...(data.notesAr !== undefined && { notesAr: data.notesAr }),
        ...(data.notesEn !== undefined && { notesEn: data.notesEn }),
      },
    });

    return this.mapToDomain(updated);
  }
}
