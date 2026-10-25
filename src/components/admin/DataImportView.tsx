import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  Trash2,
  Database,
  ShieldAlert,
  HelpCircle,
  Users,
  BookOpen,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface DataImportViewProps {
  onDataImported?: () => void;
}

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

  // TanStack Query Mutation for Excel Bulk Import
  const uploadExcelMutation = useMutation({
    mutationFn: async (variables: { file: File; wipe: boolean }) => {
      setErrorMessage(null);
      return await api.importStudentsExcel(variables.file, variables.wipe);
    },
    onSuccess: (data) => {
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
      const msg = err.response?.data?.messageAr || err.response?.data?.error || err.message || 'حدث خطأ أثناء رفع ومعالجة الملف';
      setErrorMessage(msg);
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
          ? 'صيغة الملف غير مدعومة. يرجى اختيار ملف إكسل بصيغة .xlsx'
          : 'Invalid file format. Please upload an Excel file (.xlsx).'
      );
      return;
    }
    setSelectedFile(file);
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
  const [csvText, setCsvText] = useState(
    '2021001, عمر خالد عبد الله, 3.42\n2021002, مريم محمد أحمد, 1.85\n2021003, زياد مصطفى علي, 2.10'
  );
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvReport, setCsvReport] = useState<any>(null);

  const handleRunCsvImport = async () => {
    try {
      setCsvImporting(true);
      setCsvReport(null);
      const res = await api.importCsvData(csvType, csvText);
      setCsvReport(res);
      if (onDataImported) onDataImported();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل استيراد CSV');
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Mode Selector */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {t('استيراد البيانات الأكاديمية (Excel / CSV)', 'Academic Data Bulk Importer')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              {t(
                'استيراد شامل لبيانات الطلاب ومقرراتهم الأكاديمية من ملفات الإكسل (.xlsx) الرسمية مع تخطي ترويسة البيانات التمهيدية (Row 5)، تجميع المقررات لكل طالب، وتحديث السجلات وحساب المحاولات تلقائياً.',
                'Bulk import students and their course registrations from official Excel sheets (.xlsx). Skips top metadata rows, groups multiple courses per student, creates accounts, and synchronizes academic records.'
              )}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-center border border-slate-200">
            <button
              onClick={() => setImportMode('EXCEL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                importMode === 'EXCEL' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{t('استيراد ملف إكسل (.xlsx)', 'Excel File (.xlsx)')}</span>
            </button>
            <button
              onClick={() => setImportMode('CSV')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                importMode === 'CSV' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{t('استيراد نص CSV سريع', 'Quick CSV')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode 1: Real Excel Bulk Importer */}
      {importMode === 'EXCEL' && (
        <div className="space-y-5">
          {/* Main Excel Upload Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
            {/* Metadata Detection Info Badge */}
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3 text-xs text-indigo-900">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">
                  {t('نظام المعالجة الذكي لملف إكسل الكلية:', 'Smart File Parsing Logic:')}
                </span>
                <span className="text-indigo-800 leading-relaxed">
                  {t(
                    'تمت برمجة النظام لتخطي أول 4 صفوف (بيانات وصفية) وقراءة الترويسة من السطر 5 مباشرة ("كود الطالب"، "الاسم"، "المعدل التراكمى"، "الساعات المكتسبه"، "المستوي"، "كود المقرر"، "اسم المقرر"، "نوع المقرر"، "مستوى المقرر"، "الساعات المعتمدة"، "عدد مرات النجاح"، "عدد مرات الرسوب"، "عدد مرات الانسحاب"). يتم تجميع صفوف المقررات لكل طالب وتحديث حسابه وسجلاته تلقائياً مع كلمة مرور افتراضية (std123456).',
                    'Automatically skips the top 4 metadata rows, mapping headers on row 5. Groups duplicated student rows, upserts User (hashed std123456) & Student profile, creates Courses and links registrations with attempt counts.'
                  )}
                </span>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/50 scale-[1.01]'
                  : selectedFile
                  ? 'border-emerald-500 bg-emerald-50/30'
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                    <FileCheck className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {t('جاهز للمزامنة والاستيراد', 'Ready to upload & sync')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="mt-2 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('إلغاء واختيار ملف آخر', 'Remove and pick another')}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">
                      {t('اسحب وأفلت ملف الإكسل (.xlsx) هنا، أو اضغط للاختيار', 'Drag and drop your Excel file (.xlsx) here, or click to browse')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('يدعم ملفات .xlsx و .xls (حتى 50 ميجابايت)', 'Supports .xlsx and .xls files (up to 50MB)')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Wipe / Replace Option (Critical Requirement) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <input
                    id="wipe-checkbox"
                    type="checkbox"
                    checked={wipeData}
                    onChange={(e) => handleToggleWipe(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div>
                    <label
                      htmlFor="wipe-checkbox"
                      className="text-xs font-bold text-slate-900 cursor-pointer block"
                    >
                      {t('مسح البيانات القديمة قبل الاستيراد (إحلال كامل)', 'Wipe existing data before import (Full Replace)')}
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t(
                        'عند تفعيل هذا الخيار، سيتم تفريغ تسجيلات الطلاب وسجلاتهم الحالية وإعادة بنائها بالكامل من ملف الإكسل دون المساس بحسابات المشرفين والمديرين.',
                        'Clears existing student profiles and course registrations before importing. Preserves Admin and Advisor accounts.'
                      )}
                    </p>
                  </div>
                </div>

                {wipeData && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 shrink-0">
                    <AlertTriangle className="w-3 h-3" />
                    {t('وضع الإحلال مفعل', 'Wipe active')}
                  </span>
                )}
              </div>
            </div>

            {/* Action Button: Upload and Sync */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={!selectedFile || uploadExcelMutation.isPending}
                onClick={handleUploadAndSync}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs ${
                  !selectedFile || uploadExcelMutation.isPending
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {uploadExcelMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('جارٍ التحليل والرفع والمزامنة في قاعدة البيانات...', 'Uploading, Parsing & Syncing with Database...')}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>{t('رفع ومزامنة البيانات (Upload and Sync)', 'Upload and Sync')}</span>
                  </>
                )}
              </button>

              {selectedFile && !uploadExcelMutation.isPending && (
                <span className="text-xs text-slate-500">
                  {t('سيتم تطبيق العملية داخل معاملة Prisma موثوقة', 'Execution wrapped in an atomic Prisma transaction')}
                </span>
              )}
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">{t('فشل الاستيراد:', 'Import Failed:')}</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Success Toast / Banner */}
            {successResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{isAr ? successResult.messageAr : successResult.messageEn}</span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg">
                    {t('تمت المزامنة بنجاح', 'Synced Successfully')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-center">
                    <span className="text-slate-500 text-[11px] block">{t('الطلاب المستوردين', 'Imported Students')}</span>
                    <span className="text-lg font-bold text-emerald-700">{successResult.importedStudentsCount}</span>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-center">
                    <span className="text-slate-500 text-[11px] block">{t('السجلات والمقررات المرتبطة', 'Linked Registrations')}</span>
                    <span className="text-lg font-bold text-emerald-700">{successResult.totalRegistrationsCount}</span>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-emerald-100 text-center">
                    <span className="text-slate-500 text-[11px] block">{t('حالة الإحلال', 'Wipe Mode')}</span>
                    <span className="text-sm font-bold text-slate-800">
                      {successResult.wipedData ? t('تم مسح البيانات القديمة أولاً', 'Previous data wiped') : t('تحديث وإضافة تراكمية', 'Upsert / Incremental')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Quick CSV Text Importer */}
      {importMode === 'CSV' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {t('استيراد يدوي سريع عبر CSV', 'Quick Manual CSV Data Importer')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('التحقق المسبق من صحة السجلات قبل إدخالها لمنع أي أخطاء في قاعدة البيانات الأكاديمية.', 'Validates records before writing to PostgreSQL.')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCsvType('STUDENTS');
                setCsvText('2021001, عمر خالد عبد الله, 3.42\n2021002, مريم محمد أحمد, 1.85\n2021003, زياد مصطفى علي, 2.10');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                csvType === 'STUDENTS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {t('بيانات الطلاب (Students)', 'Students')}
            </button>
            <button
              onClick={() => {
                setCsvType('COURSES');
                setCsvText('CS 101, مقدمة في البرمجة, 3\nCS 201, تراكيب البيانات, 3\nBS 101, رياضيات 1, 3');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                csvType === 'COURSES' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {t('دليل المقررات (Courses)', 'Courses')}
            </button>
            <button
              onClick={() => {
                setCsvType('GRADES');
                setCsvText('2021001, CS 101, A, 2026-09-01\n2021001, BS 101, B+, 2026-09-01\n2021002, CS 101, F, 2026-09-01');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                csvType === 'GRADES' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {t('رصد الدرجات (Grades)', 'Grades')}
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              {t('محتوى نص CSV:', 'CSV Data Content:')}
            </label>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            disabled={csvImporting}
            onClick={handleRunCsvImport}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{csvImporting ? t('جارٍ الاستيراد والتدقيق...', 'Importing & Validating...') : t('بدء فحص واستيراد البيانات', 'Run Validation & Import')}</span>
          </button>

          {csvReport && (
            <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{t('تقرير نتيجة الاستيراد:', 'Validation Report:')}</span>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                    {t('نجح: ', 'Success: ')} {csvReport.successfulRows}
                  </span>
                  <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded">
                    {t('فشل: ', 'Failed: ')} {csvReport.failedRows}
                  </span>
                </div>
              </div>

              {csvReport.validationErrors?.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-rose-700 font-bold block">{t('أخطاء التدقيق:', 'Validation Errors:')}</span>
                  <ul className="list-disc list-inside space-y-0.5 text-rose-800 text-[11px]">
                    {csvReport.validationErrors.map((err: any, i: number) => (
                      <li key={i}>
                        {t('سطر', 'Row')} {err.row}: {err.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-emerald-700 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('تم استيراد كافة الصفوف بنجاح ودون أية أخطاء بنية وحفظها في قاعدة البيانات.', 'All rows successfully imported without errors.')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Warning Dialog for Wipe Data */}
      {showWipeWarningDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-rose-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                {t('تحذير: تأكيد مسح البيانات القديمة', 'Warning: Confirm Data Wipe')}
              </h3>
              <p className="text-xs text-rose-700 font-medium leading-relaxed">
                {t(
                  'تحذير: سيتم مسح كافة المقررات وتسجيلات الطلاب الحالية. هل أنت متأكد؟',
                  'Warning: All existing courses and student registrations will be wiped. Are you sure?'
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {t(
                  'ملاحظة أمان: حسابات المديرين والمشرفين الأكاديميين ستبقى محفوظة ولن يتم حذفها.',
                  'Safety Note: Admin and Advisor accounts are preserved and will not be affected.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={confirmWipe}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {t('نعم، متأكد وموافق على المسح الكامل', 'Yes, confirm full replace')}
              </button>
              <button
                type="button"
                onClick={cancelWipe}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                {t('إلغاء الخيار', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
