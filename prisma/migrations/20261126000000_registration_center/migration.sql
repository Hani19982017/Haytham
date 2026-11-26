-- AlterTable: transfer (equivalency) students and once-per-term academic warnings
ALTER TABLE "Student" ADD COLUMN "admissionType" TEXT NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "Student" ADD COLUMN "previousInstitution" TEXT;
ALTER TABLE "Student" ADD COLUMN "standingTermId" TEXT;
ALTER TABLE "Student" ADD COLUMN "termStartWarnings" INTEGER;
ALTER TABLE "Student" ADD COLUMN "termStartConsecutive" INTEGER;

-- AlterTable: where a course record came from and who registered it
ALTER TABLE "CourseRecord" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "CourseRecord" ADD COLUMN "registeredByName" TEXT;
ALTER TABLE "CourseRecord" ADD COLUMN "note" TEXT;

-- AlterTable: summer training proof (certificate) and its review
ALTER TABLE "SummerTraining" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "SummerTraining" ADD COLUMN "endDate" TIMESTAMP(3);
ALTER TABLE "SummerTraining" ADD COLUMN "studentNotes" TEXT;
ALTER TABLE "SummerTraining" ADD COLUMN "proofFileName" TEXT;
ALTER TABLE "SummerTraining" ADD COLUMN "proofMimeType" TEXT;
ALTER TABLE "SummerTraining" ADD COLUMN "proofSize" INTEGER;
ALTER TABLE "SummerTraining" ADD COLUMN "proofData" BYTEA;
ALTER TABLE "SummerTraining" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "SummerTraining" ADD COLUMN "reviewedByName" TEXT;
ALTER TABLE "SummerTraining" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EquivalencyCase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "previousInstitution" TEXT NOT NULL,
    "previousProgram" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdByName" TEXT NOT NULL,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquivalencyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquivalencyItem" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "externalCode" TEXT,
    "externalName" TEXT NOT NULL,
    "externalCredits" INTEGER NOT NULL,
    "externalMark" DOUBLE PRECISION,
    "externalGrade" TEXT,
    "courseCode" TEXT,
    "grade" TEXT,
    "gradePoints" DOUBLE PRECISION,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "reasonAr" TEXT,
    "reasonEn" TEXT,

    CONSTRAINT "EquivalencyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquivalencyCase_studentId_idx" ON "EquivalencyCase"("studentId");

-- CreateIndex
CREATE INDEX "EquivalencyItem_caseId_idx" ON "EquivalencyItem"("caseId");

-- AddForeignKey
ALTER TABLE "EquivalencyCase" ADD CONSTRAINT "EquivalencyCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquivalencyItem" ADD CONSTRAINT "EquivalencyItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EquivalencyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
