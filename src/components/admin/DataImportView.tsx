import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { PageHeader, Panel, PanelHeader, Segmented, Modal, Chip, cn } from '../ui/index.js';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  FileCheck,
  Trash2,
  Database,
  ShieldAlert,
  ListChecks,
} from 'lucide-react';

interface DataImportViewProps {
  onDataImported?: () => void;
}

// Column headers the importer expects on row 5 of the faculty sheet (exact spelling).
const EXCEL_COLUMNS = [
  'كود الطالب',
  'الاسم',
  'المعدل التراكمى',
  'الساعات المكتسبه',
  'المستوي',
  'كود المقرر',
  'اسم المقرر',
  'نوع المقرر',
  'مستوى المقرر',
  'الساعات المعتمدة',
  'عدد مرات النجاح',
  'عدد مرات الرسوب',
  'عدد مرات الانسحاب',
];

const CSV_SAMPLES: Record<'STUDENTS' | 'COURSES' | 'GRADES', string> = {
  STUDENTS: '2021001, عمر خالد عبد الله, 3.42\n2021002, مريم محمد أحمد, 1.85\n2021003, زياد مصطفى علي, 2.10',
  COURSES: 'CS 101, مقدمة في البرمجة, 3\nCS 201, تراكيب البيانات, 3\nBS 101, رياضيات 1, 3',
  GRADES: '2021001, CS 101, A, 2026-09-01\n2021001, BS 101, B+, 2026-09-01\n2021002, CS 101, F, 2026-09-01',
};

export const DataImportView: React.FC<DataImportViewProps> = ({ onDataImported }) => {
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  // Mode: EXCEL (default) or CSV
  const [importMode, setImportMode] = useState<'EXCEL' | 'CSV'>('EXCEL');

  // Excel state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wipeData, setWipeData] = useState(false);
  const [showWipeWarningDialog, setShowWipeWarningDialog] = useState(false);
  const [pendingWipeState, setPendingWipeState] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    importedStudentsCount: number;
    totalRegistrationsCount: number;
    wipedData: boolean;
    messageAr: string;
    messageEn: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const serverError = (err: any, fallbackAr: string, fallbackEn: string) => {
    const data = err?.response?.data;
    if (isAr) return data?.messageAr || data?.error || fallbackAr;
    return data?.messageEn || data?.error || err?.message || fallbackEn;
  };

  // TanStack Query Mutation for Excel Bulk Import
  const uploadExcelMutation = useMutation({
    mutationFn: async (variables: { file: File; wipe: boolean }) => {
      setErrorMessage(null);
      return await api.importStudentsExcel(variables.file, variables.wipe);
    },
    onSuccess: data => {
      setSuccessResult({
        importedStudentsCount: data.importedStudentsCount,
        totalRegistrationsCount: data.totalRegistrationsCount,
        wipedData: data.wipedData,
        messageAr: data.messageAr,
        messageEn: data.messageEn,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onDataImported) onDataImported();
    },
    onError: (err: any) => {
      setErrorMessage(
        serverError(err, 'تعذر رفع الملف أو قراءته. تأكد أنه ملف الكلية الرسمي ثم حاول مرة أخرى.', 'The file could not be uploaded or read. Check it is the official faculty sheet and try again.')
      );
    },
  });

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setErrorMessage(null);
    setSuccessResult(null);
    const validExts = ['.xlsx', '.xls'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExts.some(ext => lowerName.endsWith(ext));
    if (!isValid) {
      setErrorMessage(
        isAr
          ? 'هذا ليس ملف Excel. اختر ملفاً بامتداد ‎.xlsx أو ‎.xls.'
          : 'That is not an Excel file. Choose a .xlsx or .xls file.'
      );
      return;
    }
    setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleWipe = (nextValue: boolean) => {
    if (nextValue) {
      setPendingWipeState(true);
      setShowWipeWarningDialog(true);
    } else {
      setWipeData(false);
    }
  };

  const confirmWipe = () => {
    setWipeData(true);
    setShowWipeWarningDialog(false);
  };

  const cancelWipe = () => {
    setWipeData(false);
    setShowWipeWarningDialog(false);
  };

  const handleUploadAndSync = () => {
    if (!selectedFile) return;
    uploadExcelMutation.mutate({ file: selectedFile, wipe: wipeData });
  };

  // CSV Fallback Section State
  const [csvType, setCsvType] = useState<'STUDENTS' | 'COURSES' | 'GRADES'>('STUDENTS');
  const [csvText, setCsvText] = useState(CSV_SAMPLES.STUDENTS);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvReport, setCsvReport] = useState<any>(null);

  const handleRunCsvImport = async () => {
    try {
      setCsvImporting(true);
      setCsvReport(null);
      setErrorMessage(null);
      const res = await api.importCsvData(csvType, csvText);
      setCsvReport(res);
      if (onDataImported) onDataImported();
    } catch (err: any) {
      setErrorMessage(serverError(err, 'فشل استيراد نص CSV. راجع الصيغة وحاول مرة أخرى.', 'The CSV import failed. Check the format and try again.'));
    } finally {
      setCsvImporting(false);
    }
  };

  const selectCsvType = (type: 'STUDENTS' | 'COURSES' | 'GRADES') => {
    setCsvType(type);
    setCsvText(CSV_SAMPLES[type]);
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? t(`${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`, `${Math.max(1, Math.round(bytes / 1024))} KB`)
      : t(`${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`, `${(bytes / (1024 * 1024)).toFixed(2)} MB`);

  const csvColumns: Record<typeof csvType, string> = {
    STUDENTS: t('الرقم الجامعي، الاسم، المعدل التراكمي', 'student code, name, GPA'),
    COURSES: t('كود المقرر، اسم المقرر، عدد الساعات', 'course code, course name, credit hours'),
    GRADES: t('الرقم الجامعي، كود المقرر، التقدير، تاريخ الفصل', 'student code, course code, grade, term date'),
  };

  const isUploading = uploadExcelMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UploadCloud}
        title={t('استيراد البيانات', 'Data import')}
        description={t(
          'ارفع كشف الطلاب ومقرراتهم من ملف Excel الرسمي للكلية، أو الصق بيانات قصيرة بصيغة CSV.',
          'Upload students and their courses from the faculty’s official Excel sheet, or paste short CSV data.'
        )}
        actions={
          <Segmented
            ariaLabel={t('طريقة الاستيراد', 'Import method')}
            value={importMode}
            onChange={setImportMode}
            options={[
              { value: 'EXCEL', label: t('ملف Excel', 'Excel file'), icon: FileSpreadsheet },
              { value: 'CSV', label: t('نص CSV', 'CSV text'), icon: Database },
            ]}
          />
        }
      />

      {/* ===================================================================
          Excel bulk import
          =================================================================== */}
      {importMode === 'EXCEL' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader
              icon={FileSpreadsheet}
              title={t('رفع ملف Excel', 'Upload an Excel file')}
              description={t('ملف واحد بامتداد ‎.xlsx أو ‎.xls حتى 50 ميجابايت.', 'One .xlsx or .xls file, up to 50 MB.')}
            />

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label={t('اختر ملف Excel أو أفلته هنا', 'Choose an Excel file or drop it here')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                isDragging
                  ? 'border-sign-500 bg-sign-50'
                  : selectedFile
                  ? 'border-sign-300 bg-sign-50/50'
                  : 'border-ink-300 bg-ink-50/60 hover:border-sign-400 hover:bg-sign-50/40'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <>
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sign-600 text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]">
                    <FileCheck className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="break-all text-[15px] font-bold text-ink-950" dir="ltr">
                      {selectedFile.name}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-500">
                      {formatSize(selectedFile.size)}
                      <span className="mx-2 text-ink-300" aria-hidden="true">
                        |
                      </span>
                      {t('جاهز للرفع', 'Ready to upload')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      clearSelectedFile();
                    }}
                    className="btn btn-ghost btn-sm text-signal-600"
                  >
                    <Trash2 aria-hidden="true" />
                    {t('إزالة الملف واختيار غيره', 'Remove and choose another')}
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      'grid h-14 w-14 place-items-center rounded-2xl transition',
                      isDragging ? 'bg-sign-600 text-white' : 'bg-paper text-sign-600 ring-1 ring-ink-200'
                    )}
                  >
                    <UploadCloud className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[15px] font-bold text-ink-950">
                      {isDragging ? t('أفلت الملف هنا', 'Drop the file here') : t('اسحب ملف Excel إلى هنا', 'Drag an Excel file here')}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      {t('أو اضغط لاختياره من جهازك', 'or click to choose it from your computer')}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Replace option */}
            <div
              className={cn(
                'mt-5 rounded-xl border p-4 transition',
                wipeData ? 'border-signal-200 bg-signal-50' : 'border-ink-200 bg-ink-50'
              )}
            >
              <label htmlFor="wipe-checkbox" className="flex cursor-pointer items-start gap-3">
                <input
                  id="wipe-checkbox"
                  type="checkbox"
                  checked={wipeData}
                  onChange={e => handleToggleWipe(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-signal-500)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-ink-900">
                    {t('مسح بيانات الطلاب الحالية قبل الاستيراد', 'Clear current student data before importing')}
                    {wipeData && (
                      <Chip tone="signal" icon={AlertTriangle}>
                        {t('المسح الكامل مفعّل', 'Full replace is on')}
                      </Chip>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-6 text-ink-600">
                    {t(
                      'يحذف ملفات الطلاب وتسجيلاتهم الحالية ثم يبنيها من الملف من جديد. حسابات المديرين والمرشدين لا تتأثر.',
                      'Deletes current student profiles and registrations, then rebuilds them from the file. Admin and advisor accounts are not affected.'
                    )}
                  </span>
                </span>
              </label>
            </div>

            {/* Action */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!selectedFile || isUploading}
                onClick={handleUploadAndSync}
                className={cn('btn btn-lg', wipeData ? 'btn-danger' : 'btn-primary')}
              >
                {isUploading ? (
                  <>
                    <RefreshCw aria-hidden="true" className="animate-spin" />
                    {t('جارٍ الرفع والمعالجة…', 'Uploading and processing…')}
                  </>
                ) : (
                  <>
                    <UploadCloud aria-hidden="true" />
                    {wipeData ? t('مسح ثم استيراد الملف', 'Clear, then import the file') : t('رفع واستيراد الملف', 'Upload and import the file')}
                  </>
                )}
              </button>
              {!selectedFile && !isUploading && (
                <span className="text-[12.5px] text-ink-500">{t('اختر ملفاً أولاً لتفعيل الزر.', 'Choose a file first to enable the button.')}</span>
              )}
              {selectedFile && !isUploading && (
                <span className="text-[12.5px] text-ink-500">
                  {t('يُنفذ الاستيراد كاملاً أو لا يُنفذ إطلاقاً، فلا تبقى بيانات ناقصة.', 'The import runs all-or-nothing, so no half-imported data is left behind.')}
                </span>
              )}
            </div>

            {errorMessage && (
              <div className="callout callout-signal mt-5" role="alert">
                <AlertCircle aria-hidden="true" />
                <div>
                  <p className="font-bold">{t('لم يكتمل الاستيراد', 'The import did not finish')}</p>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}

            {successResult && (
              <div className="mt-5 overflow-hidden rounded-xl border border-sign-200 bg-sign-50" role="status">
                <div className="flex items-start gap-3 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sign-600" aria-hidden="true" />
                  <p className="text-[13.5px] font-bold leading-6 text-sign-800">{isAr ? successResult.messageAr : successResult.messageEn}</p>
                </div>
                <dl className="grid grid-cols-1 border-t border-sign-200 bg-paper sm:grid-cols-3">
                  <div className="kv px-4 py-3">
                    <dt>{t('طلاب مستوردون', 'Students imported')}</dt>
                    <dd className="t-num !text-[22px] !font-extrabold text-sign-700">{successResult.importedStudentsCount}</dd>
                  </div>
                  <div className="kv border-t border-sign-100 px-4 py-3 sm:border-s sm:border-t-0">
                    <dt>{t('تسجيلات مقررات مرتبطة', 'Course registrations linked')}</dt>
                    <dd className="t-num !text-[22px] !font-extrabold text-sign-700">{successResult.totalRegistrationsCount}</dd>
                  </div>
                  <div className="kv border-t border-sign-100 px-4 py-3 sm:border-s sm:border-t-0">
                    <dt>{t('طريقة الاستيراد', 'Import method')}</dt>
                    <dd>{successResult.wipedData ? t('مسح كامل ثم بناء من جديد', 'Full replace') : t('إضافة وتحديث فقط', 'Add and update only')}</dd>
                  </div>
                </dl>
              </div>
            )}
          </Panel>

          {/* Expected layout */}
          <Panel as="aside">
            <PanelHeader
              icon={ListChecks}
              tone="lane"
              title={t('شكل الملف المطلوب', 'Expected file layout')}
              description={t('هكذا يقرأ النظام ملف الكلية خطوة بخطوة.', 'How the system reads the faculty sheet, step by step.')}
            />
            <ol className="space-y-3">
              {[
                t('يتجاهل أول 4 صفوف لأنها بيانات وصفية عن الكشف.', 'Skips the first 4 rows; they describe the sheet.'),
                t('يقرأ أسماء الأعمدة من الصف الخامس.', 'Reads the column names from row 5.'),
                t('يجمع صفوف كل طالب معاً، ويحدّث ملفه ومقرراته وعدد محاولاته.', 'Groups each student’s rows, then updates their profile, courses and attempts.'),
                t('ينشئ حساباً لكل طالب جديد بكلمة المرور std123456.', 'Creates an account for each new student with the password std123456.'),
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lane-500 text-[12px] font-bold text-white">{i + 1}</span>
                  <span className="text-[13px] leading-6 text-ink-700">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 border-t border-ink-100 pt-4">
              <p className="mb-2 text-[12.5px] font-semibold text-ink-700">
                {t('أسماء الأعمدة في الصف الخامس:', 'Column names expected in row 5:')}
              </p>
              <ul className="flex flex-wrap gap-1.5" dir="rtl" lang="ar">
                {EXCEL_COLUMNS.map(col => (
                  <li key={col} className="chip chip-ink">
                    {col}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-5 text-ink-500">
                {t(
                  'يجب أن تطابق أسماء الأعمدة هذا الإملاء حرفياً، بما فيها الحروف الأخيرة مثل «ى» و«ه».',
                  'The headers are in Arabic in the faculty sheet and must match this spelling exactly.'
                )}
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* ===================================================================
          Quick CSV text import
          =================================================================== */}
      {importMode === 'CSV' && (
        <Panel>
          <PanelHeader
            icon={Database}
            title={t('استيراد نص CSV', 'Import CSV text')}
            description={t(
              'لإضافة سجلات قليلة بسرعة. يُفحص كل سطر قبل حفظه، والأسطر الخاطئة تُرفض مع سبب الرفض.',
              'For adding a few records quickly. Every row is checked before it is saved; invalid rows are rejected with a reason.'
            )}
            actions={
              <Segmented
                ariaLabel={t('نوع البيانات', 'Data type')}
                value={csvType}
                onChange={selectCsvType}
                options={[
                  { value: 'STUDENTS', label: t('الطلاب', 'Students') },
                  { value: 'COURSES', label: t('المقررات', 'Courses') },
                  { value: 'GRADES', label: t('الدرجات', 'Grades') },
                ]}
              />
            }
          />

          <label htmlFor="csv-text" className="field-label">
            {t('البيانات، سطر لكل سجل', 'Data, one record per line')}
          </label>
          <textarea
            id="csv-text"
            rows={8}
            dir="ltr"
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            className="field t-num leading-7"
            spellCheck={false}
          />
          <p className="field-hint">
            {t('ترتيب الأعمدة:', 'Column order:')} <span className="font-semibold text-ink-700">{csvColumns[csvType]}</span>
            {'. '}
            {t('تغيير النوع يملأ الحقل بمثال جاهز.', 'Switching the type fills the box with an example.')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={csvImporting || !csvText.trim()} onClick={handleRunCsvImport} className="btn btn-primary btn-lg">
              {csvImporting ? (
                <>
                  <RefreshCw aria-hidden="true" className="animate-spin" />
                  {t('جارٍ الفحص والاستيراد…', 'Checking and importing…')}
                </>
              ) : (
                <>
                  <UploadCloud aria-hidden="true" />
                  {t('فحص الأسطر واستيرادها', 'Check and import rows')}
                </>
              )}
            </button>
          </div>

          {errorMessage && (
            <div className="callout callout-signal mt-5" role="alert">
              <AlertCircle aria-hidden="true" />
              <div>
                <p className="font-bold">{t('لم يكتمل الاستيراد', 'The import did not finish')}</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {csvReport && (
            <div className="mt-5 rounded-xl border border-ink-200" role="status">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
                <span className="text-[14px] font-bold text-ink-900">{t('نتيجة الاستيراد', 'Import result')}</span>
                <div className="flex flex-wrap gap-2">
                  <Chip tone="sign" icon={CheckCircle2}>
                    {t(`${csvReport.successfulRows ?? 0} سطر حُفظ`, `${csvReport.successfulRows ?? 0} rows saved`)}
                  </Chip>
                  <Chip tone={(csvReport.failedRows ?? 0) > 0 ? 'signal' : 'ink'} icon={AlertTriangle}>
                    {t(`${csvReport.failedRows ?? 0} سطر رُفض`, `${csvReport.failedRows ?? 0} rows rejected`)}
                  </Chip>
                </div>
              </div>
              <div className="px-4 py-3">
                {csvReport.validationErrors?.length > 0 ? (
                  <ul className="space-y-1.5">
                    {csvReport.validationErrors.map((err: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-signal-700">
                        <span className="t-num shrink-0 rounded-md bg-signal-50 px-1.5 text-[12px] font-bold ring-1 ring-signal-200">
                          {t(`سطر ${err.row}`, `Row ${err.row}`)}
                        </span>
                        <span>{err.reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-sign-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {t('حُفظت كل الأسطر بلا أخطاء.', 'Every row was saved without errors.')}
                  </p>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Confirm full replace */}
      {showWipeWarningDialog && (
        <Modal
          onClose={cancelWipe}
          size="sm"
          icon={ShieldAlert}
          tone="signal"
          title={t('مسح بيانات الطلاب قبل الاستيراد؟', 'Clear student data before importing?')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={cancelWipe} className="btn btn-secondary">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="button" onClick={confirmWipe} className="btn btn-danger">
                {t('نعم، فعّل المسح الكامل', 'Yes, turn on full replace')}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-[13.5px] leading-7">
            <p className="font-semibold text-signal-700">
              {t(
                'عند الاستيراد ستُحذف كل المقررات وتسجيلات الطلاب الحالية ثم تُبنى من الملف.',
                'When you import, all current courses and student registrations will be deleted and rebuilt from the file.'
              )}
            </p>
            <p className="text-ink-600">
              {t('حسابات المديرين والمرشدين الأكاديميين تبقى كما هي.', 'Admin and academic advisor accounts stay as they are.')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
