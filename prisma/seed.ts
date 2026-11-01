import { prisma } from '../server/db/prisma.js';
import {
  INITIAL_COURSES,
  INITIAL_OFFERINGS,
  INITIAL_STUDENTS,
  INITIAL_ACADEMIC_RULES,
  INITIAL_NOTIFICATIONS,
} from '../server/data/store.js';
import { NotificationRepository } from '../server/repositories/notificationRepository.js';
import bcrypt from 'bcryptjs';

type Role = 'ADMIN' | 'INSTRUCTOR' | 'ACADEMIC_ADVISOR' | 'STUDENT' | 'PROCESS_OFFICER' | 'DEPARTMENT_HEAD';

// Demo accounts shown on the login page (password: password123).
const DEMO_USERS: { id: string; email: string; nameAr: string; nameEn: string; role: Role; advisorId?: string; instructorId?: string }[] = [
  {
    id: 'user_admin',
    email: 'admin@example.com',
    nameAr: 'أ. د. عميد الكلية والمسؤول الأكاديمي',
    nameEn: 'Dean & Academic Administrator',
    role: 'ADMIN',
  },
  {
    id: 'user_advisor',
    email: 'advisor@example.com',
    nameAr: 'د. محمود صقر (المرشد الأكاديمي)',
    nameEn: 'Dr. Mahmoud Saqr (Academic Advisor)',
    role: 'ACADEMIC_ADVISOR',
    advisorId: 'adv_dr_mahmoud',
  },
  {
    id: 'user_instructor',
    email: 'instructor@example.com',
    nameAr: 'أ.د. عادل منصور (أستاذ المادة)',
    nameEn: 'Prof. Adel Mansour (Course Instructor)',
    role: 'INSTRUCTOR',
    instructorId: 'inst_dr_adel',
  },
  {
    id: 'user_student',
    email: 'student@example.com',
    nameAr: 'عمر فاروق عبد الرحمن (طالب - تحت الإنذار)',
    nameEn: 'Omar Farouk (Student - At Risk)',
    role: 'STUDENT',
  },
  {
    id: 'user_student2',
    email: 'student2@example.com',
    nameAr: 'سارة أحمد الكردي (طالبة - متفوقة)',
    nameEn: 'Sara Ahmed (Honors Student)',
    role: 'STUDENT',
  },
  {
    id: 'user_process',
    email: 'process@example.com',
    nameAr: 'أستاذ سامي الديب (مسؤول شؤون الطلاب - اطلاع فقط)',
    nameEn: 'Sami El-Deeb (Process Officer - Read Only)',
    role: 'PROCESS_OFFICER',
  },
  {
    id: 'user_head',
    email: 'head@example.com',
    nameAr: 'أ.د. طارق السعدني (رئيس قسم علوم الحاسب)',
    nameEn: 'Prof. Tariq El-Saadani (Department Head)',
    role: 'DEPARTMENT_HEAD',
  },
];

const ADVISOR_OFFICE = 'مبنى الحاسبات - غرفة 204';
const DEPARTMENT = 'Computer Science';

/**
 * Load the demo data (users, courses, sections, 100 students with their
 * records, bylaw rules and each account's notifications).
 *
 * Every table is written with one batched insert, so a remote database (Render)
 * is filled in a few round trips instead of about a thousand. Rows that already
 * exist are left exactly as they are, so running it again only adds what is
 * missing.
 */
export async function seedDatabase() {
  console.log('--- SEEDING POSTGRESQL DATABASE ---');
  const started = Date.now();
  const passwordHash = bcrypt.hashSync('password123', 10);

  // What is already there (so ids line up and nothing is inserted twice).
  const [existingUsers, existingCourses, existingAdvisors, existingInstructors] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.course.findMany({ select: { id: true, code: true } }),
    prisma.advisor.findMany({ select: { id: true } }),
    prisma.instructor.findMany({ select: { id: true } }),
  ]);
  const userIdByEmail = new Map(existingUsers.map(u => [u.email.toLowerCase(), u.id]));
  const courseIdByCode = new Map(existingCourses.map(c => [c.code, c.id]));
  const advisorIds = new Set(existingAdvisors.map(a => a.id));
  const instructorIds = new Set(existingInstructors.map(i => i.id));

  const users: { id: string; email: string; nameAr: string; nameEn: string; role: Role; passwordHash: string }[] = [];
  const advisors: { id: string; userId: string; office: string }[] = [];
  const instructors: { id: string; userId: string; department: string }[] = [];

  /** The id of the user with this email, adding the user when there is none yet. */
  const userFor = (u: { id: string; email: string; nameAr: string; nameEn: string; role: Role }) => {
    const key = u.email.toLowerCase();
    const known = userIdByEmail.get(key);
    if (known) return known;
    users.push({ id: u.id, email: u.email, nameAr: u.nameAr, nameEn: u.nameEn, role: u.role, passwordHash });
    userIdByEmail.set(key, u.id);
    return u.id;
  };
  const addAdvisor = (id: string, userId: string) => {
    if (advisorIds.has(id)) return;
    advisorIds.add(id);
    advisors.push({ id, userId, office: ADVISOR_OFFICE });
  };
  const addInstructor = (id: string, userId: string) => {
    if (instructorIds.has(id)) return;
    instructorIds.add(id);
    instructors.push({ id, userId, department: DEPARTMENT });
  };

  // 1. Users, advisors, instructors
  for (const u of DEMO_USERS) {
    const userId = userFor(u);
    if (u.advisorId) addAdvisor(u.advisorId, userId);
    if (u.instructorId) addInstructor(u.instructorId, userId);
  }
  for (const off of INITIAL_OFFERINGS) {
    if (instructorIds.has(off.instructorId)) continue;
    const userId = userFor({
      id: `user_${off.instructorId}`,
      email: `${off.instructorId}@university.edu`,
      nameAr: off.instructorName,
      nameEn: off.instructorName,
      role: 'INSTRUCTOR',
    });
    addInstructor(off.instructorId, userId);
  }
  for (const s of INITIAL_STUDENTS) {
    if (!s.advisorId || advisorIds.has(s.advisorId)) continue;
    const userId = userFor({
      id: `user_${s.advisorId}`,
      email: `${s.advisorId}@university.edu`,
      nameAr: s.advisorName,
      nameEn: s.advisorName,
      role: 'ACADEMIC_ADVISOR',
    });
    addAdvisor(s.advisorId, userId);
  }
  const studentUserIds = new Map(
    INITIAL_STUDENTS.map(s => [
      s.id,
      userFor({ id: `user_${s.id}`, email: s.email, nameAr: s.nameAr, nameEn: s.nameEn, role: 'STUDENT' }),
    ])
  );

  // 2. Courses and prerequisites
  const courses = INITIAL_COURSES.filter(c => !courseIdByCode.has(c.code)).map(c => {
    courseIdByCode.set(c.code, c.id);
    return {
      id: c.id,
      code: c.code,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      credits: c.credits,
      level: c.level,
      semester: c.semester,
      isMandatory: c.isMandatory,
      track: c.track || null,
      department: c.department,
      descriptionAr: c.descriptionAr || null,
      descriptionEn: c.descriptionEn || null,
    };
  });
  const prerequisites = INITIAL_COURSES.flatMap(c =>
    (c.prerequisites || []).map(prereqCode => ({
      id: `prereq_${c.id}_${prereqCode.replace(/\s+/g, '_')}`,
      courseId: courseIdByCode.get(c.code)!,
      prereqCode,
    }))
  );

  // 3. Students and their course records
  const students = INITIAL_STUDENTS.map(s => ({
    id: s.id,
    userId: studentUserIds.get(s.id)!,
    studentCode: s.studentCode,
    level: s.level,
    track: s.track,
    cumulativeGpa: s.cumulativeGpa,
    previousGpa: s.previousGpa,
    completedCredits: s.completedCredits,
    enrolledCredits: s.enrolledCredits,
    warningCount: s.warningCount,
    consecutiveWarnings: s.consecutiveWarnings,
    riskLevel: s.riskLevel,
    advisorId: s.advisorId || 'adv_dr_mahmoud',
  }));
  const records = INITIAL_STUDENTS.flatMap(s =>
    s.records
      .filter(r => courseIdByCode.has(r.courseCode))
      .map(r => ({
        id: `rec_${s.id}_${r.courseCode.replace(/\s+/g, '_')}_${r.attempt || 1}`,
        studentId: s.id,
        courseId: courseIdByCode.get(r.courseCode)!,
        attempt: r.attempt || 1,
        status: r.status as any,
        grade: r.grade || null,
        gradePoints: r.gradePoints ?? null,
        courseworkMark: r.courseworkMark ?? null,
        finalMark: r.finalMark ?? null,
        totalMark: r.courseworkMark && r.finalMark ? r.courseworkMark + r.finalMark : null,
        attendancePercentage: r.attendancePercentage ?? 100,
      }))
  );

  // Write in dependency order, one batched insert per table.
  await prisma.user.createMany({ data: users, skipDuplicates: true });
  await prisma.advisor.createMany({ data: advisors, skipDuplicates: true });
  await prisma.instructor.createMany({ data: instructors, skipDuplicates: true });
  await prisma.course.createMany({ data: courses, skipDuplicates: true });
  await prisma.prerequisite.createMany({ data: prerequisites, skipDuplicates: true });

  // 4. Current semester and its sections
  const currentSemester = await prisma.semester.upsert({
    where: { code: 'FALL_2026' },
    update: { isCurrent: true },
    create: {
      id: 'sem_fall_2026',
      code: 'FALL_2026',
      nameAr: 'خريف 2026 / 2027',
      nameEn: 'Fall 2026 / 2027',
      isCurrent: true,
      isSummer: false,
      startDate: new Date('2026-09-20'),
      endDate: new Date('2027-01-20'),
    },
  });
  await prisma.courseOffering.createMany({
    data: INITIAL_OFFERINGS.filter(off => courseIdByCode.has(off.courseCode)).map(off => ({
      id: off.id,
      courseId: courseIdByCode.get(off.courseCode)!,
      semesterId: currentSemester.id,
      instructorId: off.instructorId,
      capacity: off.capacity,
      enrolledCount: off.enrolledCount,
      scheduleAr: off.lectureDayTimeAr,
      scheduleEn: off.lectureDayTimeEn,
      hall: off.hall,
    })),
    skipDuplicates: true,
  });

  await prisma.student.createMany({ data: students, skipDuplicates: true });
  await prisma.courseRecord.createMany({ data: records, skipDuplicates: true });

  // 5. Academic bylaw rules
  await prisma.academicRule.createMany({
    data: INITIAL_ACADEMIC_RULES.map(rule => ({
      id: rule.id,
      key: rule.key,
      titleAr: rule.titleAr,
      titleEn: rule.titleEn,
      valueString: String(rule.value),
      defaultValue: String(rule.defaultValue),
      needsVerification: rule.needsVerification,
      notesAr: rule.notesAr,
      notesEn: rule.notesEn,
    })),
    skipDuplicates: true,
  });

  // 6. Each account's starting notifications (built from the data above)
  const notificationCount = await NotificationRepository.seedDefaults(prisma, INITIAL_NOTIFICATIONS);
  console.log(`Seeded ${notificationCount} notifications.`);

  console.log(`✅ PostgreSQL seed successfully completed! (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

// `npx tsx prisma/seed.ts` runs it directly.
if (/[\\/]prisma[\\/]seed\.ts$/.test(process.argv[1] || '')) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async e => {
      console.error('Seed error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
