-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEACHING_ASSISTANT';

-- AlterTable
ALTER TABLE "CourseOffering" ADD COLUMN "assistantId" TEXT;

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "offeringIdsJson" TEXT NOT NULL DEFAULT '[]',
    "recoveryStrategy" TEXT,
    "recoveryTitleAr" TEXT,
    "recoveryTitleEn" TEXT,
    "studentNotes" TEXT,
    "advisorNotes" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LECTURE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "secret" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startedById" TEXT NOT NULL,
    "startedByName" TEXT NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceMark" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markedById" TEXT,

    CONSTRAINT "AttendanceMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationRequest_studentId_idx" ON "RegistrationRequest"("studentId");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_idx" ON "RegistrationRequest"("status");

-- CreateIndex
CREATE INDEX "AttendanceSession_offeringId_idx" ON "AttendanceSession"("offeringId");

-- CreateIndex
CREATE INDEX "AttendanceMark_studentId_idx" ON "AttendanceMark"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMark_sessionId_studentId_key" ON "AttendanceMark"("sessionId", "studentId");

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
