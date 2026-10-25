import * as XLSX from 'xlsx';
import assert from 'assert';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';

async function runExcelImportTest() {
  console.log('--- Starting Excel Bulk Import Test ---');

  // 1. Build an Excel workbook matching the exact real-world college structure:
  // 4 metadata rows at top, Row 5 headers:
  // "كود الطالب", "الاسم", "المعدل التراكمى", "الساعات المكتسبه", "المستوي", "كود المقرر", "اسم المقرر", "نوع المقرر", "مستوى المقرر", "الساعات المعتمدة", "عدد مرات النجاح", "عدد مرات الرسوب", "عدد مرات الانسحاب"
  const aoaData: any[][] = [
    ['جامعة حلوان - كلية الحاسبات والذكاء الاصطناعي'],
    ['تقرير تسجيل الطلاب الفصلي للعام الجامعي 2026/2027'],
    ['نظام الساعات المعتمدة - لائحة البكالوريوس'],
    ['تاريخ الاستخراج: 2026-10-15'],
    [
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
    ],
    // Student 1 (20251010): Has 3 courses (1 passed with 1 fail retake, 1 failed, 1 enrolled)
    ['20251010', 'يوسف أحمد عبد المنعم', 2.85, 45, 'المستوى الثاني', 'CS 101', 'مقدمة في البرمجة', 'إجباري', 1, 3, 1, 1, 0],
    ['20251010', 'يوسف أحمد عبد المنعم', 2.85, 45, 'المستوى الثاني', 'CS 201', 'هياكل البيانات والخوارزميات', 'إجباري', 2, 3, 0, 1, 0],
    ['20251010', 'يوسف أحمد عبد المنعم', 2.85, 45, 'المستوى الثاني', 'BS 101', 'رياضيات 1 (تفاضل وتكامل)', 'إجباري', 1, 3, 0, 0, 0],
    
    // Student 2 (20252020): Has 2 courses (both passed)
    ['20252020', 'سارة محمود حسن', 3.75, 72, 'المستوى الثالث', 'CS 101', 'مقدمة في البرمجة', 'إجباري', 1, 3, 1, 0, 0],
    ['20252020', 'سارة محمود حسن', 3.75, 72, 'المستوى الثالث', 'CS 301', 'قواعد البيانات المتقدمة', 'إجباري', 3, 3, 1, 0, 0],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoaData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Verify SheetJS parsing with range: 4
  const parsedWb = XLSX.read(excelBuffer, { type: 'buffer' });
  const parsedSheet = parsedWb.Sheets[parsedWb.SheetNames[0]];
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, any>>(parsedSheet, { range: 4 });

  console.log(`Parsed ${parsedRows.length} rows with range: 4`);
  assert.strictEqual(parsedRows.length, 5, 'Should have exactly 5 course rows');
  assert.strictEqual(parsedRows[0]['كود الطالب'], '20251010', 'First row student code should match');
  assert.strictEqual(parsedRows[0]['كود المقرر'], 'CS 101', 'First row course code should match');

  // Test Direct HTTP call to API endpoint using FormData and fetch
  const formData = new FormData();
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  formData.append('file', blob, 'test_students.xlsx');
  formData.append('wipeData', 'false');

  console.log('Sending POST to http://localhost:3000/api/v1/admin/import/students-excel...');
  const res = await fetch('http://localhost:3000/api/v1/admin/import/students-excel', {
    method: 'POST',
    body: formData,
  });

  const json = await res.json();
  console.log('API Response:', json);
  assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
  assert.strictEqual(json.success, true, 'Import should succeed');
  assert.strictEqual(json.importedStudentsCount, 2, 'Should import 2 unique students');

  // Verify in PostgreSQL database
  const student1 = await prisma.student.findUnique({
    where: { studentCode: '20251010' },
    include: {
      user: true,
      records: { include: { course: true } },
    },
  });

  assert(student1, 'Student 20251010 must exist in DB');
  assert.strictEqual(student1.user.nameAr, 'يوسف أحمد عبد المنعم');
  assert.strictEqual(student1.level, 2, 'Level should parse to 2');
  assert.strictEqual(student1.cumulativeGpa, 2.85, 'GPA should match');
  assert.strictEqual(student1.completedCredits, 45, 'Completed credits should match');

  // Verify password hash for std123456
  const isPasswordValid = await bcrypt.compare('std123456', student1.user.passwordHash);
  assert.strictEqual(isPasswordValid, true, 'Default password std123456 must be validly hashed');

  // Verify course records for Student 1
  // CS 101: 1 pass + 1 fail => 2 records (1 FAILED, 1 PASSED)
  const cs101Records = student1.records.filter(r => r.course.code === 'CS 101');
  assert.strictEqual(cs101Records.length, 2, 'CS 101 should have 2 attempt records (fail and pass)');
  assert(cs101Records.some(r => r.status === 'FAILED'), 'CS 101 should have a failed attempt');
  assert(cs101Records.some(r => r.status === 'PASSED'), 'CS 101 should have a passed attempt');

  // CS 201: 1 fail => 1 record FAILED
  const cs201Records = student1.records.filter(r => r.course.code === 'CS 201');
  assert.strictEqual(cs201Records.length, 1, 'CS 201 should have 1 failed record');
  assert.strictEqual(cs201Records[0].status, 'FAILED');

  // BS 101: 0 pass, 0 fail => ENROLLED
  const bs101Records = student1.records.filter(r => r.course.code === 'BS 101');
  assert.strictEqual(bs101Records.length, 1, 'BS 101 should have 1 enrolled record');
  assert.strictEqual(bs101Records[0].status, 'ENROLLED');

  // Test Student 2
  const student2 = await prisma.student.findUnique({
    where: { studentCode: '20252020' },
    include: {
      user: true,
      records: { include: { course: true } },
    },
  });

  assert(student2, 'Student 20252020 must exist in DB');
  assert.strictEqual(student2.cumulativeGpa, 3.75);
  assert.strictEqual(student2.level, 3);
  assert.strictEqual(student2.records.length, 2, 'Student 2 should have 2 passed course records');

  console.log('--- Testing Wipe Data (wipeData: true) ---');
  // Build a new Excel sheet with only 1 new student
  const aoaWipe: any[][] = [
    ['تقرير جديد'],
    ['سطر 2'],
    ['سطر 3'],
    ['سطر 4'],
    [
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
    ],
    ['20259999', 'طالب الإحلال الوحيد', 3.9, 90, 4, 'CS 401', 'مشروع التخرج', 'إجباري', 4, 3, 1, 0, 0],
  ];

  const wsWipe = XLSX.utils.aoa_to_sheet(aoaWipe);
  const wbWipe = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbWipe, wsWipe, 'Sheet1');
  const wipeBuffer = XLSX.write(wbWipe, { type: 'buffer', bookType: 'xlsx' });

  const wipeFormData = new FormData();
  const wipeBlob = new Blob([wipeBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  wipeFormData.append('file', wipeBlob, 'wipe_students.xlsx');
  wipeFormData.append('wipeData', 'true');

  const wipeRes = await fetch('http://localhost:3000/api/v1/admin/import/students-excel', {
    method: 'POST',
    body: wipeFormData,
  });

  const wipeJson = await wipeRes.json();
  console.log('Wipe Import Response:', wipeJson);
  assert.strictEqual(wipeJson.success, true);
  assert.strictEqual(wipeJson.importedStudentsCount, 1);
  assert.strictEqual(wipeJson.wipedData, true);

  // Check that old student 20251010 was wiped
  const oldStudent = await prisma.student.findUnique({ where: { studentCode: '20251010' } });
  assert.strictEqual(oldStudent, null, 'Previous students must be wiped when wipeData is true');

  // Check that new student exists
  const newStudent = await prisma.student.findUnique({ where: { studentCode: '20259999' } });
  assert(newStudent, 'New student must exist');

  // Verify Admin and Advisor accounts are still in DB
  const adminUsers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'ACADEMIC_ADVISOR'] } } });
  assert(adminUsers.length > 0, 'Admin and Advisor accounts must NOT be wiped');

  console.log('✅ ALL EXCEL IMPORT & WIPE DATA ASSERTIONS PASSED SUCCESSFULLY!');
}

runExcelImportTest()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  });

