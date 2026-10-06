export const GRADE_POINTS_MAP: Record<string, number> = {
  'A+': 4.0,
  'A': 3.7,
  'A-': 3.4,
  'B+': 3.2,
  'B': 3.0,
  'B-': 2.8,
  'C+': 2.6,
  'C': 2.4,
  'C-': 2.2,
  'D+': 2.0,
  'D': 1.5,
  'D-': 1.0,
  'F': 0.0,
};

export const NON_CREDIT_GRADES = new Set(['W', 'I', 'P', 'NP']);

export const RETAKE_CAPS: Record<number, string> = {
  2: 'B+', // First retake (attempt 2): max B+ (3.2)
  3: 'C+', // Second retake (attempt 3): max C+ (2.6)
  4: 'D+', // Subsequent retakes (attempt 4+): max D+ (2.0)
};

export function getGradePoints(grade: string): number {
  if (NON_CREDIT_GRADES.has(grade.toUpperCase())) {
    return 0.0;
  }
  return GRADE_POINTS_MAP[grade.toUpperCase()] ?? 0.0;
}

export function isNonCreditGrade(grade: string): boolean {
  return NON_CREDIT_GRADES.has(grade.toUpperCase());
}

export function calculatePercentageToGrade(markOutOf100: number): { grade: string; points: number } {
  if (markOutOf100 >= 95) return { grade: 'A+', points: 4.0 };
  if (markOutOf100 >= 90) return { grade: 'A', points: 3.7 };
  if (markOutOf100 >= 85) return { grade: 'A-', points: 3.4 };
  if (markOutOf100 >= 80) return { grade: 'B+', points: 3.2 };
  if (markOutOf100 >= 75) return { grade: 'B', points: 3.0 };
  if (markOutOf100 >= 70) return { grade: 'B-', points: 2.8 };
  if (markOutOf100 >= 65) return { grade: 'C+', points: 2.6 };
  if (markOutOf100 >= 60) return { grade: 'C', points: 2.4 };
  if (markOutOf100 >= 56) return { grade: 'C-', points: 2.2 };
  if (markOutOf100 >= 53) return { grade: 'D+', points: 2.0 };
  if (markOutOf100 >= 50) return { grade: 'D', points: 1.5 };
  if (markOutOf100 >= 45) return { grade: 'D-', points: 1.0 };
  return { grade: 'F', points: 0.0 };
}

export function capRetakeGrade(rawGrade: string, attemptNumber: number): { grade: string; points: number; capped: boolean } {
  if (attemptNumber <= 1) {
    return { grade: rawGrade, points: getGradePoints(rawGrade), capped: false };
  }
  const maxCap = attemptNumber === 2 ? 'B+' : attemptNumber === 3 ? 'C+' : 'D+';
  const rawPoints = getGradePoints(rawGrade);
  const capPoints = getGradePoints(maxCap);

  if (rawPoints > capPoints) {
    return { grade: maxCap, points: capPoints, capped: true };
  }
  return { grade: rawGrade, points: rawPoints, capped: false };
}

export function calculateGpa(courses: { credits: number; gradePoints?: number; grade?: string }[]): {
  gpa: number;
  totalPoints: number;
  totalCredits: number;
} {
  let totalPoints = 0;
  let totalCredits = 0;

  for (const c of courses) {
    if (c.grade && isNonCreditGrade(c.grade)) {
      continue; // Withdrawal or Incomplete does not count towards GPA
    }
    const points = c.gradePoints !== undefined ? c.gradePoints : (c.grade ? getGradePoints(c.grade) : undefined);
    if (c.credits > 0 && points !== undefined) {
      totalPoints += c.credits * points;
      totalCredits += c.credits;
    }
  }

  const gpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0.0;
  return {
    gpa,
    totalPoints: Math.round(totalPoints * 100) / 100,
    totalCredits,
  };
}

export function calculateDeficitPoints(currentGpa: number, currentCredits: number, targetGpa: number = 2.0): {
  deficit: number;
  requiredTotalPoints: number;
  currentPoints: number;
} {
  const currentPoints = currentGpa * currentCredits;
  const requiredTotalPoints = targetGpa * currentCredits;
  const deficit = Math.max(0, requiredTotalPoints - currentPoints);
  return {
    deficit: Math.round(deficit * 100) / 100,
    requiredTotalPoints: Math.round(requiredTotalPoints * 100) / 100,
    currentPoints: Math.round(currentPoints * 100) / 100,
  };
}
