import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { INSTITUTION } from '../config/institution.js';

/**
 * Shared look of every Excel sheet the system produces (registration lists,
 * section rosters, …): right-to-left, the faculty's header block, a green header
 * row that stays in view, filters on every column.
 */

export const sendXlsx = (res: Response, buffer: Buffer, filename: string) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

export const newWorkbook = () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Smart Academic Advisor';
  wb.created = new Date();
  return wb;
};

export const toBuffer = async (wb: ExcelJS.Workbook): Promise<Buffer> => Buffer.from(await wb.xlsx.writeBuffer());

/** "26/11/2026 14:05" in Cairo time. */
export const cairoDateTime = (d?: Date | string | null) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
};

export const fileStamp = () => {
  const parts = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  return parts.replace(/-/g, '');
};

/**
 * A sheet with the faculty header (lines 1–5), a table header on row 7 and the
 * rows below it. Returns the sheet so callers can colour cells.
 */
export function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  titleLines: string[],
  columns: { header: string; width: number; align?: 'right' | 'center' }[],
  rows: (string | number | null | undefined)[][]
): ExcelJS.Worksheet {
  const headerRowIndex = 7;
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: headerRowIndex }] });
  const width = Math.max(2, Math.min(columns.length, 12));
  const lines = [`${INSTITUTION.universityAr} — ${INSTITUTION.facultyAr}`, INSTITUTION.officeAr, ...titleLines].slice(0, 5);
  lines.forEach((text, i) => {
    const row = ws.getRow(i + 1);
    row.getCell(1).value = text;
    ws.mergeCells(i + 1, 1, i + 1, width);
    row.getCell(1).font = { bold: i < 3, size: i === 0 ? 15 : i === 2 ? 13 : 11, color: { argb: i < 2 ? 'FF064226' : 'FF191E1B' } };
    row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    row.height = i === 0 ? 24 : 19;
  });

  const header = ws.getRow(headerRowIndex);
  header.values = columns.map(c => c.header);
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6439' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF064226' } } };
  });
  header.height = 30;

  rows.forEach((values, i) => {
    const row = ws.getRow(headerRowIndex + 1 + i);
    row.values = values.map(v => (v === undefined || v === null ? '' : v));
    columns.forEach((c, j) => {
      row.getCell(j + 1).alignment = { horizontal: c.align || 'center', vertical: 'middle', wrapText: c.align === 'right' };
    });
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, cell => {
        if (!cell.fill || (cell.fill as any).pattern !== 'solid') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8F6' } };
      });
    }
  });

  ws.columns.forEach((col, i) => {
    col.width = columns[i]?.width ?? 14;
  });
  ws.autoFilter = { from: { row: headerRowIndex, column: 1 }, to: { row: headerRowIndex, column: columns.length } };
  return ws;
}

/** Fill one cell of a data row (row index counted from the first data row). */
export function tintCell(ws: ExcelJS.Worksheet, dataRowIndex: number, column: number, argb: string, fontArgb?: string) {
  const cell = ws.getRow(8 + dataRowIndex).getCell(column);
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  if (fontArgb) cell.font = { bold: true, color: { argb: fontArgb } };
}
