// Names printed on official documents (transcripts, plans, registration slips)
// and on the public transcript verification page.
// Change them here once and every printed document follows.
// Kept under server/ because the server (and its Docker image) needs it too;
// the app imports it through src/config/institution.ts.
export const INSTITUTION = {
  universityAr: 'جامعة القاهرة',
  universityEn: 'Cairo University',
  facultyAr: 'كلية الحاسبات والذكاء الاصطناعي',
  facultyEn: 'Faculty of Computers & Artificial Intelligence',
  officeAr: 'وكالة الكلية لشؤون التعليم والطلاب',
  officeEn: 'Office of Education & Student Affairs',
  programAr: 'برنامج علوم الحاسب بنظام الساعات المعتمدة',
  programEn: 'Computer Science, credit-hour programme',
  totalCredits: 134,
};
