import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { api, AuthUser } from '../../services/api.js';
import { Student, UserRole } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Chip,
  Loader,
  EmptyState,
  Segmented,
  Toast,
  Field,
  Modal,
  cn,
  chipClass,
  roleLabel,
  roleTone,
  toneSolidBg,
  trackLabel,
  pick,
} from '../ui/index.js';
import {
  UserPlus,
  UserCog,
  Search,
  Key,
  AlertCircle,
  RefreshCw,
  GraduationCap,
  UserCheck,
  CheckSquare,
  Square,
  Pencil,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck,
  Users,
} from 'lucide-react';

/** Role order used in filters and selects. */
const ROLE_ORDER: UserRole[] = ['STUDENT', 'ACADEMIC_ADVISOR', 'INSTRUCTOR', 'DEPARTMENT_HEAD', 'PROCESS_OFFICER', 'ADMIN'];

/** Plural labels for the role filter. */
const ROLE_FILTER_LABEL: Record<UserRole, { ar: string; en: string }> = {
  STUDENT: { ar: 'الطلاب', en: 'Students' },
  ACADEMIC_ADVISOR: { ar: 'المرشدون', en: 'Advisors' },
  INSTRUCTOR: { ar: 'هيئة التدريس', en: 'Instructors' },
  DEPARTMENT_HEAD: { ar: 'رؤساء الأقسام', en: 'Department heads' },
  PROCESS_OFFICER: { ar: 'شؤون الطلاب', en: 'Student affairs' },
  ADMIN: { ar: 'مديرو النظام', en: 'Administrators' },
};

const initialsOf = (name?: string): string => {
  if (!name) return '؟';
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter(w => w && !w.endsWith('.') && !/^(د|أ|م)\.?$/.test(w));
  return (words[0]?.[0] || '') + (words[1]?.[0] || '') || name[0];
};

export const UserManagementView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);

  // Form state for creating user
  const [formData, setFormData] = useState<{
    nameAr: string;
    nameEn: string;
    email: string;
    role: UserRole;
    password: string;
    studentCode: string;
    department: string;
  }>({
    nameAr: '',
    nameEn: '',
    email: '',
    role: 'STUDENT',
    password: '',
    studentCode: '',
    department: '',
  });

  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit User State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editFormData, setEditFormData] = useState<{
    nameAr: string;
    nameEn: string;
    email: string;
    role: UserRole;
    password: string;
  }>({
    nameAr: '',
    nameEn: '',
    email: '',
    role: 'STUDENT',
    password: '',
  });
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete User State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Password Reset State
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [resettingUser, setResettingUser] = useState<AuthUser | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState<string>('password123');
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Assign Students State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedAdvisor, setSelectedAdvisor] = useState<AuthUser | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState<string>('');
  const [assignLevelFilter, setAssignLevelFilter] = useState<string>('ALL');
  const [assignLoading, setAssignLoading] = useState<boolean>(false);
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const nameOf = (u: { nameAr: string; nameEn: string }) => (language === 'ar' ? u.nameAr : u.nameEn || u.nameAr);

  /** Server messages come in both languages; show the one matching the interface. */
  const apiMessage = (err: any, fallback: string): string => {
    const data = err?.response?.data;
    if (language === 'ar') return data?.messageAr || data?.message || fallback;
    return data?.messageEn || data?.message || fallback;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Confirmations disappear on their own after a few seconds.
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleOpenAddModal = () => {
    setFormData({
      nameAr: '',
      nameEn: '',
      email: '',
      role: 'STUDENT',
      password: '',
      studentCode: '',
      department: '',
    });
    setFormError(null);
    setShowNewPassword(false);
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.nameAr.trim()) {
      setFormError(t('اكتب الاسم الكامل بالعربية.', 'Enter the full name in Arabic.'));
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError(t('اكتب بريداً جامعياً صحيحاً.', 'Enter a valid university email.'));
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setFormError(t('كلمة المرور 6 أحرف على الأقل.', 'The password needs at least 6 characters.'));
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await api.createUser({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        nameAr: formData.nameAr.trim(),
        nameEn: formData.nameEn.trim() || formData.nameAr.trim(),
        role: formData.role,
        studentCode: formData.studentCode.trim() || undefined,
        department: formData.department.trim() || undefined,
      });

      if (res.success) {
        setSuccessMessage(
          t(`أُضيف حساب ${res.user.nameAr}.`, `${res.user.nameEn || res.user.nameAr} was added.`)
        );
        setIsAddModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setFormError(apiMessage(err, t('تعذّر حفظ المستخدم. حاول مرة أخرى.', 'The user could not be saved. Try again.')));
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Edit User Handlers ---
  const handleOpenEditModal = (user: AuthUser) => {
    setEditingUser(user);
    setEditFormData({
      nameAr: user.nameAr || '',
      nameEn: user.nameEn || '',
      email: user.email || '',
      role: user.role || 'STUDENT',
      password: '',
    });
    setEditError(null);
    setShowEditPassword(false);
    setIsEditModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editFormData.nameAr.trim()) {
      setEditError(t('اكتب الاسم بالعربية.', 'Enter the name in Arabic.'));
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await api.updateUser(editingUser.id, {
        nameAr: editFormData.nameAr.trim(),
        nameEn: editFormData.nameEn.trim() || editFormData.nameAr.trim(),
        email: editFormData.email.trim().toLowerCase(),
        role: editFormData.role,
        password: editFormData.password.trim() ? editFormData.password.trim() : undefined,
      });

      if (res.success) {
        setSuccessMessage(
          t(`حُفظت بيانات ${res.user.nameAr}.`, `${res.user.nameEn || res.user.nameAr} was updated.`)
        );
        setIsEditModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setEditError(apiMessage(err, t('تعذّر حفظ التعديلات.', 'The changes could not be saved.')));
    } finally {
      setEditSubmitting(false);
    }
  };

  // --- Delete User Handlers ---
  const handleOpenDeleteModal = (user: AuthUser) => {
    setDeletingUser(user);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const res = await api.deleteUser(deletingUser.id);
      if (res.success) {
        setSuccessMessage(
          t(`حُذف حساب ${deletingUser.nameAr}.`, `${deletingUser.nameEn || deletingUser.nameAr}’s account was deleted.`)
        );
        setIsDeleteModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setDeleteError(apiMessage(err, t('تعذّر حذف المستخدم.', 'The user could not be deleted.')));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // --- Reset Password Handlers ---
  const handleOpenResetModal = (user: AuthUser) => {
    setResettingUser(user);
    setNewPasswordValue('password123');
    setResetError(null);
    setIsResetModalOpen(true);
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    setResetSubmitting(true);
    setResetError(null);

    try {
      const res = await api.resetUserPassword(resettingUser.id, newPasswordValue);
      if (res.success) {
        setSuccessMessage(
          t(
            `كلمة مرور ${resettingUser.nameAr} أصبحت: ${newPasswordValue}`,
            `${resettingUser.nameEn || resettingUser.nameAr}’s password is now: ${newPasswordValue}`
          )
        );
        setIsResetModalOpen(false);
      }
    } catch (err: any) {
      setResetError(apiMessage(err, t('تعذّر تغيير كلمة المرور.', 'The password could not be reset.')));
    } finally {
      setResetSubmitting(false);
    }
  };

  // --- Assign Students Modal Handlers ---
  const handleOpenAssignModal = async (advisor: AuthUser) => {
    setSelectedAdvisor(advisor);
    setIsAssignModalOpen(true);
    setAssignLoading(true);
    setAssignError(null);
    setAssignSearch('');
    setAssignLevelFilter('ALL');

    try {
      const [studentsList, assignedList] = await Promise.all([
        api.getStudents().catch(() => []),
        api.getAdvisorAssignedStudents(advisor.advisorId || advisor.id).catch(() => []),
      ]);

      setAllStudents(studentsList);

      const assignedIds = new Set<string>();
      assignedList.forEach((s: any) => {
        if (s.id) assignedIds.add(s.id);
        if (s.studentCode) assignedIds.add(s.studentCode);
      });

      studentsList.forEach(s => {
        if (
          s.advisorId === advisor.id ||
          s.advisorId === advisor.advisorId ||
          (advisor.id === 'user_advisor' && s.advisorId?.includes('mahmoud'))
        ) {
          assignedIds.add(s.id);
        }
      });

      setSelectedStudentIds(assignedIds);
    } catch (err: any) {
      console.error('Error preparing assign modal:', err);
      setAssignError(t('تعذّر تحميل قائمة الطلاب.', 'The student list could not be loaded.'));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleToggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedStudentIds);
    filteredStudentsForAssign.forEach(s => next.add(s.id));
    setSelectedStudentIds(next);
  };

  const handleDeselectAllFiltered = () => {
    const next = new Set(selectedStudentIds);
    filteredStudentsForAssign.forEach(s => next.delete(s.id));
    setSelectedStudentIds(next);
  };

  const handleSaveAssignments = async () => {
    if (!selectedAdvisor) return;

    setAssignSubmitting(true);
    setAssignError(null);

    const advisorKey = selectedAdvisor.advisorId || selectedAdvisor.id;
    const targetStudentIds = Array.from(selectedStudentIds);

    try {
      const res = await api.assignStudentsToAdvisor(advisorKey, targetStudentIds);
      if (res.success) {
        setSuccessMessage(
          t(
            `أُسند ${res.assignedCount} طالب إلى ${selectedAdvisor.nameAr}.`,
            `${res.assignedCount} student${res.assignedCount === 1 ? '' : 's'} assigned to ${selectedAdvisor.nameEn || selectedAdvisor.nameAr}.`
          )
        );
        setIsAssignModalOpen(false);
        fetchUsers();
      } else {
        setAssignError(
          (language === 'ar' ? res.messageAr : res.messageEn || res.messageAr) ||
            t('تعذّر حفظ الإسناد.', 'The assignment could not be saved.')
        );
      }
    } catch (err: any) {
      setAssignError(apiMessage(err, t('تعذّر الاتصال بالخادم لحفظ الإسناد.', 'The server could not be reached to save the assignment.')));
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Filter students in assign modal
  const filteredStudentsForAssign = allStudents.filter(s => {
    const matchesSearch =
      assignSearch === '' ||
      s.nameAr.toLowerCase().includes(assignSearch.toLowerCase()) ||
      s.nameEn.toLowerCase().includes(assignSearch.toLowerCase()) ||
      s.studentCode.includes(assignSearch) ||
      s.email.toLowerCase().includes(assignSearch.toLowerCase());

    const matchesLevel = assignLevelFilter === 'ALL' || s.level.toString() === assignLevelFilter;

    return matchesSearch && matchesLevel;
  });

  // Users matching the search (role filter applied separately so counts stay meaningful)
  const searchMatched = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      searchQuery === '' ||
      u.nameAr.toLowerCase().includes(q) ||
      u.nameEn.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.studentId && u.studentId.toLowerCase().includes(q)) ||
      (u.advisorId && u.advisorId.toLowerCase().includes(q))
    );
  });

  const filteredUsers = searchMatched.filter(u => roleFilter === 'ALL' || u.role === roleFilter);

  const roleCounts = ROLE_ORDER.reduce<Record<string, number>>((acc, r) => {
    acc[r] = searchMatched.filter(u => u.role === r).length;
    return acc;
  }, {});

  const linkedId = (u: AuthUser): { label: string; value: string } => {
    if (u.studentId) return { label: t('رقم الطالب', 'Student ID'), value: u.studentId };
    if (u.advisorId) return { label: t('رقم المرشد', 'Advisor ID'), value: u.advisorId };
    if (u.instructorId) return { label: t('رقم عضو التدريس', 'Instructor ID'), value: u.instructorId };
    return { label: t('معرّف الحساب', 'Account ID'), value: u.id };
  };

  const roleOptions = ROLE_ORDER.map(r => (
    <option key={r} value={r}>
      {pick(language, roleLabel[r], r)}
    </option>
  ));

  const submitLabel = (busy: boolean, idle: string, working: string) =>
    busy ? (
      <>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
        {working}
      </>
    ) : (
      idle
    );

  const isSelf = (u: AuthUser) => !!currentUser && (u.id === currentUser.id || u.email === currentUser.email);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserCog}
        title={t('المستخدمون والصلاحيات', 'Users and roles')}
        description={t(
          'أنشئ الحسابات، عدّل الأدوار، غيّر كلمات المرور، وأسند الطلاب إلى مرشديهم.',
          'Create accounts, change roles, reset passwords and assign students to their advisors.'
        )}
        meta={
          <Chip tone="ink" icon={Users}>
            {t(`${users.length} حساب`, `${users.length} accounts`)}
          </Chip>
        }
        actions={
          <>
            <button
              type="button"
              onClick={fetchUsers}
              className="btn btn-secondary btn-icon"
              aria-label={t('تحديث القائمة', 'Refresh list')}
              title={t('تحديث القائمة', 'Refresh list')}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
            <button type="button" onClick={handleOpenAddModal} className="btn btn-primary">
              <UserPlus aria-hidden="true" />
              {t('إضافة مستخدم', 'Add user')}
            </button>
          </>
        }
      />

      {errorMessage && (
        <div className="callout callout-signal" role="alert">
          <AlertCircle aria-hidden="true" />
          <div className="flex flex-1 items-start justify-between gap-3">
            <span className="font-semibold">{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="btn btn-ghost btn-sm">
              {t('إخفاء', 'Dismiss')}
            </button>
          </div>
        </div>
      )}

      <Panel padded={false}>
        {/* Filters */}
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('ابحث بالاسم أو البريد أو الرقم', 'Search by name, email or ID')}
              aria-label={t('ابحث في المستخدمين', 'Search users')}
              className="field ps-9"
            />
          </div>
          <Segmented
            ariaLabel={t('تصفية حسب الدور', 'Filter by role')}
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: 'ALL', label: t('الكل', 'All'), count: searchMatched.length },
              ...ROLE_ORDER.map(r => ({
                value: r as string,
                label: pick(language, ROLE_FILTER_LABEL[r], r),
                count: roleCounts[r],
              })),
            ]}
          />
        </div>

        {/* Table */}
        {loading ? (
          <Loader compact label={t('جارٍ تحميل المستخدمين…', 'Loading users…')} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t('لا يوجد مستخدم بهذه المواصفات', 'No users match')}
            description={t('غيّر كلمة البحث أو اختر «الكل» من الأدوار.', 'Change the search words or choose “All” roles.')}
          />
        ) : (
          <div className="scroll-x">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>{t('المستخدم', 'User')}</th>
                  <th>{t('البريد الجامعي', 'University email')}</th>
                  <th>{t('الدور', 'Role')}</th>
                  <th>{t('المعرّف المرتبط', 'Linked ID')}</th>
                  <th className="!text-end">{t('الإجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const tone = roleTone[user.role] || 'ink';
                  const link = linkedId(user);
                  const self = isSelf(user);
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12.5px] font-extrabold', toneSolidBg[tone])}
                            aria-hidden="true"
                          >
                            {initialsOf(nameOf(user))}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-bold text-ink-900">{nameOf(user)}</span>
                              {self && <Chip tone="route">{t('أنت', 'You')}</Chip>}
                            </div>
                            <span className="block truncate text-[12px] text-ink-500">
                              {language === 'ar' ? user.nameEn : user.nameAr}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-ink-700" dir="ltr">
                          {user.email}
                        </span>
                      </td>
                      <td>
                        <span className={chipClass[tone]}>
                          <ShieldCheck aria-hidden="true" />
                          {pick(language, roleLabel[user.role], user.role)}
                        </span>
                      </td>
                      <td>
                        <span className="block text-[11.5px] text-ink-500">{link.label}</span>
                        <span className="text-[12.5px] font-semibold text-ink-800" dir="ltr">
                          {link.value}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          {user.role === 'ACADEMIC_ADVISOR' && (
                            <button type="button" onClick={() => handleOpenAssignModal(user)} className="btn btn-soft btn-sm">
                              <GraduationCap aria-hidden="true" />
                              {t('إسناد طلاب', 'Assign students')}
                            </button>
                          )}
                          <button type="button" onClick={() => handleOpenEditModal(user)} className="btn btn-ghost btn-sm">
                            <Pencil aria-hidden="true" />
                            {t('تعديل', 'Edit')}
                          </button>
                          <button type="button" onClick={() => handleOpenResetModal(user)} className="btn btn-ghost btn-sm">
                            <Key aria-hidden="true" />
                            {t('كلمة المرور', 'Password')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(user)}
                            disabled={self}
                            className="btn btn-danger-soft btn-sm"
                            title={self ? t('لا يمكنك حذف حسابك الحالي', 'You cannot delete the account you are signed in with') : undefined}
                          >
                            <Trash2 aria-hidden="true" />
                            {t('حذف', 'Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-ink-100 bg-ink-50 px-4 py-3 text-[12px] text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>
            {t(`يظهر ${filteredUsers.length} من ${users.length} حساب`, `Showing ${filteredUsers.length} of ${users.length} accounts`)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" aria-hidden="true" />
            {t('كلمات المرور تُحفظ مشفّرة (bcrypt) ولا تظهر لأحد.', 'Passwords are stored hashed (bcrypt) and never shown.')}
          </span>
        </div>
      </Panel>

      {/* ── Edit user ─────────────────────────────────────────────── */}
      {isEditModalOpen && editingUser && (
        <Modal
          onClose={() => setIsEditModalOpen(false)}
          dismissible={!editSubmitting}
          icon={Pencil}
          title={t('تعديل بيانات المستخدم', 'Edit user')}
          subtitle={
            <span>
              {nameOf(editingUser)}{' '}
              <span className="text-ink-400" dir="ltr">
                ({editingUser.id})
              </span>
            </span>
          }
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="submit" form="edit-user-form" disabled={editSubmitting} className="btn btn-primary">
                {submitLabel(editSubmitting, t('حفظ التعديلات', 'Save changes'), t('جارٍ الحفظ…', 'Saving…'))}
              </button>
            </>
          }
        >
          <form id="edit-user-form" onSubmit={handleSaveEditUser} className="space-y-4">
            {editError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{editError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('الاسم بالعربية', 'Name in Arabic')} htmlFor="edit-name-ar">
                <input
                  id="edit-name-ar"
                  type="text"
                  required
                  dir="rtl"
                  value={editFormData.nameAr}
                  onChange={e => setEditFormData({ ...editFormData, nameAr: e.target.value })}
                  className="field"
                />
              </Field>
              <Field label={t('الاسم بالإنجليزية', 'Name in English')} htmlFor="edit-name-en">
                <input
                  id="edit-name-en"
                  type="text"
                  dir="ltr"
                  value={editFormData.nameEn}
                  onChange={e => setEditFormData({ ...editFormData, nameEn: e.target.value })}
                  className="field"
                />
              </Field>
            </div>
            <Field label={t('البريد الجامعي', 'University email')} htmlFor="edit-email">
              <input
                id="edit-email"
                type="email"
                required
                dir="ltr"
                value={editFormData.email}
                onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                className="field rtl:text-end"
              />
            </Field>
            <Field label={t('الدور', 'Role')} htmlFor="edit-role">
              <select
                id="edit-role"
                value={editFormData.role}
                onChange={e => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                className="field"
              >
                {roleOptions}
              </select>
            </Field>
            <Field
              label={t('كلمة مرور جديدة', 'New password')}
              htmlFor="edit-password"
              hint={t('اتركها فارغة للإبقاء على كلمة المرور الحالية.', 'Leave empty to keep the current password.')}
            >
              <div className="relative">
                <input
                  id="edit-password"
                  type={showEditPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={editFormData.password}
                  onChange={e => setEditFormData({ ...editFormData, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="field pe-11 rtl:text-end"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(v => !v)}
                  className="absolute end-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
                  aria-label={showEditPassword ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </form>
        </Modal>
      )}

      {/* ── Delete user ───────────────────────────────────────────── */}
      {isDeleteModalOpen && deletingUser && (
        <Modal
          onClose={() => setIsDeleteModalOpen(false)}
          dismissible={!deleteSubmitting}
          size="sm"
          icon={AlertTriangle}
          tone="signal"
          title={t('حذف المستخدم نهائياً؟', 'Delete this user permanently?')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="button" onClick={handleConfirmDelete} disabled={deleteSubmitting} className="btn btn-danger">
                {submitLabel(
                  deleteSubmitting,
                  t('حذف الحساب', 'Delete account'),
                  t('جارٍ الحذف…', 'Deleting…')
                )}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {deleteError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{deleteError}</span>
              </div>
            )}
            <p className="text-[13.5px] leading-7 text-ink-700">
              {t(
                'سيُحذف الحساب من قاعدة البيانات ولن يستطيع صاحبه الدخول. لا يمكن التراجع عن هذا الإجراء.',
                'The account is removed from the database and its owner can no longer sign in. This cannot be undone.'
              )}
            </p>
            <dl className="grid grid-cols-1 gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4">
              <div className="kv">
                <dt>{t('الاسم', 'Name')}</dt>
                <dd>{nameOf(deletingUser)}</dd>
              </div>
              <div className="kv">
                <dt>{t('البريد', 'Email')}</dt>
                <dd>
                  <span dir="ltr">{deletingUser.email}</span>
                </dd>
              </div>
              <div className="kv">
                <dt>{t('الدور', 'Role')}</dt>
                <dd>{pick(language, roleLabel[deletingUser.role], deletingUser.role)}</dd>
              </div>
            </dl>
          </div>
        </Modal>
      )}

      {/* ── Reset password ────────────────────────────────────────── */}
      {isResetModalOpen && resettingUser && (
        <Modal
          onClose={() => setIsResetModalOpen(false)}
          dismissible={!resetSubmitting}
          size="sm"
          icon={Key}
          tone="caution"
          title={t('تغيير كلمة المرور', 'Reset password')}
          subtitle={nameOf(resettingUser)}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setIsResetModalOpen(false)} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="submit" form="reset-password-form" disabled={resetSubmitting} className="btn btn-primary">
                {submitLabel(resetSubmitting, t('تغيير كلمة المرور', 'Reset password'), t('جارٍ التغيير…', 'Resetting…'))}
              </button>
            </>
          }
        >
          <form id="reset-password-form" onSubmit={handleConfirmResetPassword} className="space-y-4">
            {resetError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{resetError}</span>
              </div>
            )}
            <p className="text-[13.5px] leading-7 text-ink-700">
              {t(
                'تتغير كلمة المرور فوراً، وتُحفظ مشفّرة. أبلغ صاحب الحساب بالكلمة الجديدة.',
                'The password changes immediately and is stored hashed. Tell the account owner the new password.'
              )}
            </p>
            <Field label={t('كلمة المرور الجديدة', 'New password')} htmlFor="reset-password-value">
              <input
                id="reset-password-value"
                type="text"
                required
                dir="ltr"
                value={newPasswordValue}
                onChange={e => setNewPasswordValue(e.target.value)}
                autoComplete="off"
                className="field font-bold rtl:text-end"
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* ── Assign students to an advisor ─────────────────────────── */}
      {isAssignModalOpen && selectedAdvisor && (
        <Modal
          onClose={() => setIsAssignModalOpen(false)}
          dismissible={!assignSubmitting}
          size="lg"
          icon={GraduationCap}
          tone="lane"
          title={t('إسناد الطلاب إلى المرشد', 'Assign students to advisor')}
          subtitle={
            <span>
              {nameOf(selectedAdvisor)}{' '}
              <span className="text-ink-400" dir="ltr">
                ({selectedAdvisor.email})
              </span>
            </span>
          }
          closeLabel={t('إغلاق', 'Close')}
          bodyClassName="!p-0"
          footer={
            <>
              <button type="button" onClick={() => setIsAssignModalOpen(false)} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="button" onClick={handleSaveAssignments} disabled={assignSubmitting} className="btn btn-primary">
                {assignSubmitting ? (
                  submitLabel(true, '', t('جارٍ الحفظ…', 'Saving…'))
                ) : (
                  <>
                    <UserCheck aria-hidden="true" />
                    {t(`إسناد ${selectedStudentIds.size} طالب`, `Assign ${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? '' : 's'}`)}
                  </>
                )}
              </button>
            </>
          }
        >
          <div className="sticky top-0 z-[1] space-y-3 border-b border-ink-100 bg-paper px-5 py-4 sm:px-6">
            {assignError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{assignError}</span>
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                type="text"
                value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)}
                placeholder={t('ابحث بالاسم أو الرقم الجامعي أو البريد', 'Search by name, student code or email')}
                aria-label={t('ابحث في الطلاب', 'Search students')}
                className="field ps-9"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Segmented
                ariaLabel={t('تصفية حسب المستوى', 'Filter by level')}
                value={assignLevelFilter}
                onChange={setAssignLevelFilter}
                options={[
                  { value: 'ALL', label: t('كل المستويات', 'All levels') },
                  { value: '1', label: t('المستوى 1', 'Level 1') },
                  { value: '2', label: t('المستوى 2', 'Level 2') },
                  { value: '3', label: t('المستوى 3', 'Level 3') },
                  { value: '4', label: t('المستوى 4', 'Level 4') },
                ]}
              />
              <div className="flex items-center gap-1">
                <span className="me-1 text-[12.5px] text-ink-600">
                  {t('المحدد:', 'Selected:')}{' '}
                  <span className="t-num font-extrabold text-ink-950">{selectedStudentIds.size}</span>
                </span>
                <button type="button" onClick={handleSelectAllFiltered} className="btn btn-ghost btn-sm">
                  {t('تحديد المعروض', 'Select shown')}
                </button>
                <button type="button" onClick={handleDeselectAllFiltered} className="btn btn-ghost btn-sm">
                  {t('إلغاء تحديد المعروض', 'Clear shown')}
                </button>
              </div>
            </div>
          </div>

          <div className="px-3 py-3 sm:px-4">
            {assignLoading ? (
              <Loader compact label={t('جارٍ تحميل الطلاب…', 'Loading students…')} />
            ) : filteredStudentsForAssign.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('لا يوجد طالب مطابق', 'No matching students')}
                description={t('غيّر كلمة البحث أو المستوى.', 'Change the search words or the level.')}
              />
            ) : (
              <ul className="space-y-1">
                {filteredStudentsForAssign.map(st => {
                  const isChecked = selectedStudentIds.has(st.id);
                  const isAtRisk = st.cumulativeGpa < 2.0;
                  return (
                    <li key={st.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => handleToggleStudentSelection(st.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition',
                          isChecked ? 'border-sign-200 bg-sign-50' : 'border-transparent hover:bg-ink-50'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          {isChecked ? (
                            <CheckSquare className="h-5 w-5 shrink-0 text-sign-600" aria-hidden="true" />
                          ) : (
                            <Square className="h-5 w-5 shrink-0 text-ink-300" aria-hidden="true" />
                          )}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[13.5px] font-bold text-ink-900">{nameOf(st)}</span>
                              <span className="chip chip-ink" dir="ltr">
                                #{st.studentCode}
                              </span>
                              <span className="chip chip-ink">{t(`المستوى ${st.level}`, `Level ${st.level}`)}</span>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-500">
                              <span>{pick(language, trackLabel[st.track], st.track)}</span>
                              <span className="text-ink-300" aria-hidden="true">
                                |
                              </span>
                              <span dir="ltr">{st.email}</span>
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className={cn('t-num text-[13px] font-bold', isAtRisk ? 'text-signal-600' : 'text-ink-800')}>
                            {st.cumulativeGpa.toFixed(2)}
                          </span>
                          {isAtRisk && <span className="chip chip-signal">{t('تحت الإنذار', 'On warning')}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {/* ── Add user ──────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <Modal
          onClose={handleCloseAddModal}
          dismissible={!formSubmitting}
          icon={UserPlus}
          title={t('إضافة مستخدم', 'Add user')}
          subtitle={t('يدخل صاحب الحساب بالبريد وكلمة المرور المبدئية.', 'The owner signs in with this email and the initial password.')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={handleCloseAddModal} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="submit" form="add-user-form" disabled={formSubmitting} className="btn btn-primary">
                {submitLabel(formSubmitting, t('إضافة المستخدم', 'Add user'), t('جارٍ الحفظ…', 'Saving…'))}
              </button>
            </>
          }
        >
          <form id="add-user-form" onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('الاسم بالعربية', 'Name in Arabic')} htmlFor="add-name-ar">
                <input
                  id="add-name-ar"
                  type="text"
                  required
                  dir="rtl"
                  value={formData.nameAr}
                  onChange={e => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder="أحمد علي حسن"
                  className="field"
                />
              </Field>
              <Field label={t('الاسم بالإنجليزية', 'Name in English')} htmlFor="add-name-en" hint={t('اختياري', 'Optional')}>
                <input
                  id="add-name-en"
                  type="text"
                  dir="ltr"
                  value={formData.nameEn}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="Ahmed Ali Hassan"
                  className="field"
                />
              </Field>
            </div>
            <Field label={t('البريد الجامعي', 'University email')} htmlFor="add-email">
              <input
                id="add-email"
                type="email"
                required
                dir="ltr"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@university.edu.eg"
                className="field rtl:text-end"
              />
            </Field>
            <Field label={t('الدور', 'Role')} htmlFor="add-role">
              <select
                id="add-role"
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="field"
              >
                {roleOptions}
              </select>
            </Field>

            {formData.role === 'STUDENT' && (
              <Field label={t('الرقم الجامعي', 'Student code')} htmlFor="add-student-code" hint={t('اختياري', 'Optional')}>
                <input
                  id="add-student-code"
                  type="text"
                  dir="ltr"
                  value={formData.studentCode}
                  onChange={e => setFormData({ ...formData, studentCode: e.target.value })}
                  placeholder="20261054"
                  className="field rtl:text-end"
                />
              </Field>
            )}

            {formData.role === 'INSTRUCTOR' && (
              <Field label={t('القسم الأكاديمي', 'Department')} htmlFor="add-department" hint={t('اختياري', 'Optional')}>
                <input
                  id="add-department"
                  type="text"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  placeholder={t('علوم الحاسب', 'Computer Science')}
                  className="field"
                />
              </Field>
            )}

            <Field
              label={t('كلمة المرور المبدئية', 'Initial password')}
              htmlFor="add-password"
              hint={t('6 أحرف على الأقل، وتُحفظ مشفّرة.', 'At least 6 characters; stored hashed.')}
            >
              <div className="relative">
                <input
                  id="add-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="field pe-11 rtl:text-end"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute end-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
                  aria-label={showNewPassword ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </form>
        </Modal>
      )}

      {successMessage && (
        <Toast tone="sign" onClose={() => setSuccessMessage(null)} closeLabel={t('إغلاق', 'Close')}>
          {successMessage}
        </Toast>
      )}
    </div>
  );
};
