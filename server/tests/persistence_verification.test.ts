import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { AcademicTransactionService } from '../services/academicTransactionService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PERSISTENCE TEST PASS] ${title}`);
    passed++;
  } else {
    console.error(`❌ [PERSISTENCE TEST FAIL] ${title}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runPersistenceVerification() {
  console.log('================================================================');
  console.log('🐘 POSTGRESQL REAL PERSISTENCE & RESTART RESILIENCE TEST');
  console.log('================================================================\n');

  const testStudentCode = `AUDIT_${Date.now()}`;
  const testEmail = `audit_student_${Date.now()}@university.edu`;

  // STEP 1: Verify PostgreSQL Connection
  console.log('--- STEP 1: Verify Direct PostgreSQL Connection & Raw SQL ---');
  const pgVersion = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version();`;
  assert(pgVersion.length > 0 && typeof pgVersion[0].version === 'string', 'PostgreSQL responded to raw SQL query SELECT version()');
  console.log(`   Connected Database: ${pgVersion[0].version.split('\n')[0]}`);

  // STEP 2: Create a real student in PostgreSQL
  console.log('\n--- STEP 2: Create Real Student via StudentRepository in PostgreSQL ---');
  const student = await StudentRepository.createStudent({
    studentCode: testStudentCode,
    nameAr: 'طالب التحقق من التخزين الدائم',
    nameEn: 'Persistence Verification Student',
    email: testEmail,
    level: 1,
    cumulativeGpa: 0.0,
    passwordHash: '$2a$10$wK1WfQ/J3W.bI.j4yG1aZe3zVlY7FqHkUf4tM9oQeZ1wE2rT3yU4i',
  });

  assert(!!student.id, `Student created with PostgreSQL ID: ${student.id}`);
  assert(student.studentCode === testStudentCode, `Student code matches: ${student.studentCode}`);

  // Verify directly via raw SQL
  const rawStudent = await prisma.$queryRaw<Array<{ id: string; studentCode: string }>>`
    SELECT id, "studentCode" FROM "Student" WHERE id = ${student.id};
  `;
  assert(rawStudent.length === 1 && rawStudent[0].id === student.id, 'Verified student exists in PostgreSQL table "Student" via direct SQL');

  // STEP 3: Transactional Course Registration in PostgreSQL
  console.log('\n--- STEP 3: Register Course via AcademicTransactionService (Prisma Tx) ---');
  const regResult = await AcademicTransactionService.registerCourses(
    student.id,
    ['CS 101'],
    false,
    { id: student.id, nameAr: student.nameAr, nameEn: student.nameEn, role: 'STUDENT' }
  );

  assert(regResult.success, 'Course registration succeeded through atomic Prisma transaction');
  assert(regResult.updatedStudent?.enrolledCredits === 3, 'Student enrolledCredits incremented to 3 in PostgreSQL');

  // Verify CourseRecord in PostgreSQL
  const dbRecords = await prisma.courseRecord.findMany({
    where: { studentId: student.id },
    include: { course: true },
  });
  assert(dbRecords.length === 1, 'CourseRecord created in PostgreSQL table "CourseRecord"');
  assert(dbRecords[0].course.code === 'CS 101', 'CourseRecord correctly linked to CS 101 in PostgreSQL');

  // Verify AuditLog in PostgreSQL
  const dbAuditLogs = await prisma.auditLog.findMany({
    where: { entityId: student.id, action: 'REGISTER_COURSES' },
  });
  assert(dbAuditLogs.length === 1, 'AuditLog created in PostgreSQL table "AuditLog"');

  // STEP 4: Simulate Full Backend Process Restart
  console.log('\n--- STEP 4: Simulate Backend Process Shutdown & Restart ---');
  console.log('   Disconnecting active database connection pools...');
  await prisma.$disconnect();
  console.log('   Connection pool closed. Memory state destroyed.');

  // Create a completely brand new PrismaClient instance
  let freshDatabaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable';
  if (!freshDatabaseUrl.includes('pgbouncer=true')) {
    freshDatabaseUrl += (freshDatabaseUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
  }

  const restartedPrisma = new PrismaClient({
    datasources: { db: { url: freshDatabaseUrl } },
  });
  await restartedPrisma.$connect();
  console.log('   New backend instance connected to PostgreSQL.');

  // STEP 5: Query and verify persistence after restart
  console.log('\n--- STEP 5: Query Student Data on Fresh Backend Connection ---');
  const persistedStudent = await restartedPrisma.student.findUnique({
    where: { id: student.id },
    include: {
      user: true,
      records: { include: { course: true } },
    },
  });

  assert(persistedStudent !== null, 'Student record survived backend restart and was fetched from PostgreSQL');
  assert(persistedStudent?.studentCode === testStudentCode, 'Student code matches original value after restart');
  assert(persistedStudent?.enrolledCredits === 3, 'Enrolled credits (3) persisted across backend restart');
  assert(persistedStudent?.records.length === 1, 'Course records (1) survived backend restart');
  assert(persistedStudent?.records[0].course.code === 'CS 101', 'Course record code (CS 101) verified on disk');

  // STEP 6: Perform Grade Mutation in PostgreSQL
  console.log('\n--- STEP 6: Submit Grade via AcademicTransactionService ---');
  await restartedPrisma.$disconnect();
  await prisma.$connect();
  const gradeResult = await AcademicTransactionService.updateCourseGrade(
    'CS 101',
    student.id,
    45,
    45,
    { id: 'user_instructor', nameAr: 'أ.د. عادل منصور', nameEn: 'Prof. Adel Mansour', role: 'INSTRUCTOR' }
  );

  assert(gradeResult.success, 'Grade update succeeded through transaction');
  assert(gradeResult.updatedStudent?.cumulativeGpa === 3.70, `Cumulative GPA computed and persisted: ${gradeResult.updatedStudent?.cumulativeGpa}`);

  // Disconnect again and verify GPA after second restart
  await prisma.$disconnect();
  console.log('   Simulating second shutdown and restart...');
  await prisma.$connect();

  const finalCheckStudent = await StudentRepository.findById(student.id);

  assert(finalCheckStudent?.cumulativeGpa === 3.70, 'GPA 3.70 permanently preserved after second backend restart');
  assert(finalCheckStudent?.completedCredits === 3, 'Completed credits (3) permanently preserved');

  // Cleanup test student
  await prisma.courseRecord.deleteMany({ where: { studentId: student.id } });
  await prisma.auditLog.deleteMany({ where: { entityId: student.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.user.delete({ where: { email: testEmail } });
  await prisma.$disconnect();

  console.log('\n================================================================');
  console.log(`PERSISTENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPersistenceVerification().catch((err) => {
  console.error('Persistence verification failed with exception:', err);
  process.exit(1);
});
