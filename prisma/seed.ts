import { prisma } from '../server/db/prisma.js';
import {
  INITIAL_COURSES,
  INITIAL_OFFERINGS,
  INITIAL_STUDENTS,
  INITIAL_ACADEMIC_RULES,
  INITIAL_NOTIFICATIONS,
} from '../server/data/store.js';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
  console.log('--- SEEDING POSTGRESQL DATABASE ---');
  const defaultPasswordHash = bcrypt.hashSync('password123', 10);

  // 1. Seed Users, Advisors, Instructors
  const usersToSeed = [
    {
      id: 'user_admin',
      email: 'admin@example.com',
      nameAr: 'أ. د. عميد الكلية والمسؤول الأكاديمي',
      nameEn: 'Dean & Academic Administrator',
      role: 'ADMIN' as const,
    },
    {
      id: 'user_advisor',
      email: 'advisor@example.com',
      nameAr: 'د. محمود صقر (المرشد الأكاديمي)',
      nameEn: 'Dr. Mahmoud Saqr (Academic Advisor)',
      role: 'ACADEMIC_ADVISOR' as const,
      advisorId: 'adv_dr_mahmoud',
    },
    {
      id: 'user_instructor',
      email: 'instructor@example.com',
      nameAr: 'أ.د. عادل منصور (أستاذ المادة)',
      nameEn: 'Prof. Adel Mansour (Course Instructor)',
      role: 'INSTRUCTOR' as const,
      instructorId: 'inst_dr_adel',
    },
    {
      id: 'user_student',
      email: 'student@example.com',
      nameAr: 'عمر فاروق عبد الرحمن (طالب - تحت الإنذار)',
      nameEn: 'Omar Farouk (Student - At Risk)',
      role: 'STUDENT' as const,
      studentId: 'stu_omar',
    },
    {
      id: 'user_student2',
      email: 'student2@example.com',
      nameAr: 'سارة أحمد الكردي (طالبة - متفوقة)',
      nameEn: 'Sara Ahmed (Honors Student)',
      role: 'STUDENT' as const,
      studentId: 'stu_sara',
    },
    {
      id: 'user_process',
      email: 'process@example.com',
      nameAr: 'أستاذ سامي الديب (مسؤول شؤون الطلاب - اطلاع فقط)',
      nameEn: 'Sami El-Deeb (Process Officer - Read Only)',
      role: 'PROCESS_OFFICER' as const,
    },
    {
      id: 'user_head',
      email: 'head@example.com',
      nameAr: 'أ.د. طارق السعدني (رئيس قسم علوم الحاسب)',
      nameEn: 'Prof. Tariq El-Saadani (Department Head)',
      role: 'DEPARTMENT_HEAD' as const,
    },
  ];

  for (const u of usersToSeed) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        nameAr: u.nameAr,
        nameEn: u.nameEn,
        role: u.role,
      },
      create: {
        id: u.id,
        email: u.email,
        nameAr: u.nameAr,
        nameEn: u.nameEn,
        role: u.role,
        passwordHash: defaultPasswordHash,
      },
    });

    if (u.role === 'ACADEMIC_ADVISOR' && u.advisorId) {
      await prisma.advisor.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          id: u.advisorId,
          userId: user.id,
          office: 'مبنى الحاسبات - غرفة 204',
        },
      });
    }

    if (u.role === 'INSTRUCTOR' && u.instructorId) {
      await prisma.instructor.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          id: u.instructorId,
          userId: user.id,
          department: 'Computer Science',
        },
      });
    }
  }

  // 2. Seed Courses
  for (const c of INITIAL_COURSES) {
    await prisma.course.upsert({
      where: { code: c.code },
      update: {
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
      },
      create: {
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
      },
    });
  }

  // 3. Seed Course Prerequisites
  for (const c of INITIAL_COURSES) {
    if (c.prerequisites && c.prerequisites.length > 0) {
      for (const prereqCode of c.prerequisites) {
        await prisma.prerequisite.upsert({
          where: {
            courseId_prereqCode: {
              courseId: c.id,
              prereqCode: prereqCode,
            },
          },
          update: {},
          create: {
            id: `prereq_${c.id}_${prereqCode.replace(/\s+/g, '_')}`,
            courseId: c.id,
            prereqCode: prereqCode,
          },
        });
      }
    }
  }

  // 4. Seed Semester
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

  // 5. Seed Offerings
  for (const off of INITIAL_OFFERINGS) {
    const course = await prisma.course.findUnique({ where: { code: off.courseCode } });
    if (!course) continue;

    // Ensure instructor exists
    const existingInst = await prisma.instructor.findUnique({ where: { id: off.instructorId } });
    if (!existingInst) {
      const instUser = await prisma.user.upsert({
        where: { email: `${off.instructorId}@university.edu` },
        update: {},
        create: {
          id: `user_${off.instructorId}`,
          email: `${off.instructorId}@university.edu`,
          nameAr: off.instructorName,
          nameEn: off.instructorName,
          role: 'INSTRUCTOR',
          passwordHash: defaultPasswordHash,
        },
      });
      await prisma.instructor.upsert({
        where: { id: off.instructorId },
        update: {},
        create: {
          id: off.instructorId,
          userId: instUser.id,
          department: 'Computer Science',
        },
      });
    }

    await prisma.courseOffering.upsert({
      where: { id: off.id },
      update: {
        capacity: off.capacity,
        enrolledCount: off.enrolledCount,
        scheduleAr: off.lectureDayTimeAr,
        scheduleEn: off.lectureDayTimeEn,
        hall: off.hall,
      },
      create: {
        id: off.id,
        courseId: course.id,
        semesterId: currentSemester.id,
        instructorId: off.instructorId,
        capacity: off.capacity,
        enrolledCount: off.enrolledCount,
        scheduleAr: off.lectureDayTimeAr,
        scheduleEn: off.lectureDayTimeEn,
        hall: off.hall,
      },
    });
  }

  // 6. Seed Students & Records
  for (const s of INITIAL_STUDENTS) {
    // Ensure advisor exists
    if (s.advisorId) {
      const existingAdv = await prisma.advisor.findUnique({ where: { id: s.advisorId } });
      if (!existingAdv) {
        const advUser = await prisma.user.upsert({
          where: { email: `${s.advisorId}@university.edu` },
          update: {},
          create: {
            id: `user_${s.advisorId}`,
            email: `${s.advisorId}@university.edu`,
            nameAr: s.advisorName,
            nameEn: s.advisorName,
            role: 'ACADEMIC_ADVISOR',
            passwordHash: defaultPasswordHash,
          },
        });
        await prisma.advisor.upsert({
          where: { id: s.advisorId },
          update: {},
          create: {
            id: s.advisorId,
            userId: advUser.id,
            office: 'مبنى الحاسبات - غرفة 204',
          },
        });
      }
    }

    let studentUser = await prisma.user.findUnique({ where: { email: s.email } });
    if (!studentUser) {
      studentUser = await prisma.user.create({
        data: {
          id: `user_${s.id}`,
          email: s.email,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          role: 'STUDENT',
          passwordHash: defaultPasswordHash,
        },
      });
    }

    const studentRecord = await prisma.student.upsert({
      where: { id: s.id },
      update: {
        cumulativeGpa: s.cumulativeGpa,
        previousGpa: s.previousGpa,
        completedCredits: s.completedCredits,
        enrolledCredits: s.enrolledCredits,
        warningCount: s.warningCount,
        consecutiveWarnings: s.consecutiveWarnings,
        riskLevel: s.riskLevel,
        track: s.track,
        level: s.level,
      },
      create: {
        id: s.id,
        userId: studentUser.id,
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
      },
    });

    // Seed student course records
    for (const r of s.records) {
      const course = await prisma.course.findUnique({ where: { code: r.courseCode } });
      if (!course) continue;

      const recordId = `rec_${s.id}_${r.courseCode.replace(/\s+/g, '_')}_${r.attempt || 1}`;
      await prisma.courseRecord.upsert({
        where: { id: recordId },
        update: {
          status: r.status as any,
          grade: r.grade || null,
          gradePoints: r.gradePoints ?? null,
          courseworkMark: r.courseworkMark ?? null,
          finalMark: r.finalMark ?? null,
          totalMark: (r.courseworkMark && r.finalMark) ? r.courseworkMark + r.finalMark : null,
          attendancePercentage: r.attendancePercentage ?? 100,
        },
        create: {
          id: recordId,
          studentId: studentRecord.id,
          courseId: course.id,
          attempt: r.attempt || 1,
          status: r.status as any,
          grade: r.grade || null,
          gradePoints: r.gradePoints ?? null,
          courseworkMark: r.courseworkMark ?? null,
          finalMark: r.finalMark ?? null,
          totalMark: (r.courseworkMark && r.finalMark) ? r.courseworkMark + r.finalMark : null,
          attendancePercentage: r.attendancePercentage ?? 100,
        },
      });
    }
  }

  // 7. Seed Academic Rules
  for (const rule of INITIAL_ACADEMIC_RULES) {
    await prisma.academicRule.upsert({
      where: { key: rule.key },
      update: {
        valueString: String(rule.value),
        notesAr: rule.notesAr,
        notesEn: rule.notesEn,
      },
      create: {
        id: rule.id,
        key: rule.key,
        titleAr: rule.titleAr,
        titleEn: rule.titleEn,
        valueString: String(rule.value),
        defaultValue: String(rule.defaultValue),
        needsVerification: rule.needsVerification,
        notesAr: rule.notesAr,
        notesEn: rule.notesEn,
      },
    });
  }

  console.log('✅ PostgreSQL seed successfully completed!');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Seed error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
