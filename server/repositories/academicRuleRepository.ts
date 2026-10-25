import { prisma } from '../db/prisma.js';
import { AcademicRuleConfig } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_ACADEMIC_RULES } from '../data/store.js';

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
    try {
      const rows = await prisma.academicRule.findMany({
        orderBy: { key: 'asc' },
      });
      if (rows && rows.length > 0) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[AcademicRuleRepository] DB listAll fallback:', err);
    }
    return INITIAL_ACADEMIC_RULES;
  }

  public static async findByKey(key: string): Promise<AcademicRuleConfig | null> {
    try {
      const row = await prisma.academicRule.findUnique({
        where: { key },
      });
      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[AcademicRuleRepository] DB findByKey fallback for ${key}:`, err);
    }
    return INITIAL_ACADEMIC_RULES.find(r => r.key === key) || null;
  }

  public static async findById(id: string): Promise<AcademicRuleConfig | null> {
    try {
      const row = await prisma.academicRule.findUnique({
        where: { id },
      });
      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[AcademicRuleRepository] DB findById fallback for ${id}:`, err);
    }
    return INITIAL_ACADEMIC_RULES.find(r => r.id === id) || null;
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
    try {
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
    } catch (err) {
      console.warn(`[AcademicRuleRepository] DB updateRule fallback for ${id}:`, err);
      const match = INITIAL_ACADEMIC_RULES.find(r => r.id === id);
      if (match) {
        match.value = data.value;
        if (data.needsVerification !== undefined) match.needsVerification = data.needsVerification;
        return match;
      }
      return INITIAL_ACADEMIC_RULES[0];
    }
  }
}
