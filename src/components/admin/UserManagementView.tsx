import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { api, AuthUser } from '../../services/api.js';
import { Student, UserRole } from '../../types/index.js';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  ShieldCheck,
  Mail,
  Key,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Building,
  GraduationCap,
  Sparkles,
  UserCheck,
  CheckSquare,
  Square,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
  MoreVertical,
} from 'lucide-react';

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
      setFormError(t('يرجى إدخال الاسم الكامل بالعربية.', 'Please enter full name in Arabic.'));
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError(t('يرجى إدخال بريد إلكتروني جامعي صحيح.', 'Please enter a valid university email.'));
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setFormError(t('كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.', 'Password must be at least 6 characters.'));
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
          t(
            `تم إضافة المستخدم (${res.user.nameAr}) بنجاح وتشفير كلمة المرور بـ Bcrypt وحفظه في قاعدة البيانات.`,
            `User (${res.user.nameEn}) successfully created with encrypted credentials.`
          )
        );
        setIsAddModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        err.message ||
        t('حدث خطأ أثناء حفظ المستخدم في قاعدة البيانات.', 'Error creating user in database.');
      setFormError(msg);
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
    setIsEditModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editFormData.nameAr.trim()) {
      setEditError(t('يرجى إدخال الاسم باللغة العربية.', 'Please enter name in Arabic.'));
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
          t(
            `تم تعديل بيانات المستخدم (${res.user.nameAr}) بنجاح وتحديث السجلات في PostgreSQL.`,
            `User (${res.user.nameEn}) details updated successfully.`
          )
        );
        setIsEditModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setEditError(
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        t('تعذر حفظ تعديلات المستخدم.', 'Failed to update user.')
      );
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
          t(
            `تم حذف المستخدم (${language === 'ar' ? deletingUser.nameAr : deletingUser.nameEn}) نهائياً من قاعدة البيانات.`,
            `User (${deletingUser.nameEn}) deleted successfully.`
          )
        );
        setIsDeleteModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      setDeleteError(
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        t('حدث خطأ أثناء حذف المستخدم.', 'Failed to delete user.')
      );
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
            `تم إعادة تعيين وتشفير كلمة المرور للمستخدم (${language === 'ar' ? resettingUser.nameAr : resettingUser.nameEn}) بنجاح إلى: (${newPasswordValue})`,
            `Password reset successfully to: (${newPasswordValue})`
          )
        );
        setIsResetModalOpen(false);
      }
    } catch (err: any) {
      setResetError(
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        t('تعذر إعادة تعيين كلمة المرور.', 'Failed to reset password.')
      );
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
      setAssignError(t('تعذر استرجاع قائمة الطلاب.', 'Could not load students list.'));
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
            `تم إسناد ${res.assignedCount} طالب بنجاح إلى المرشد الأكاديمي (${language === 'ar' ? selectedAdvisor.nameAr : selectedAdvisor.nameEn}) وحفظ البيانات في PostgreSQL.`,
            `Successfully assigned ${res.assignedCount} students to Academic Advisor (${selectedAdvisor.nameEn}).`
          )
        );
        setIsAssignModalOpen(false);
        fetchUsers();
      } else {
        setAssignError(res.messageAr || t('فشل حفظ إسناد الطلاب.', 'Failed to save student assignments.'));
      }
    } catch (err: any) {
      setAssignError(
        err.response?.data?.messageAr ||
        err.response?.data?.message ||
        t('حدث خطأ أثناء الاتصال بالخادم وحفظ الإسناد.', 'Server error while assigning students.')
      );
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

    const matchesLevel =
      assignLevelFilter === 'ALL' ||
      s.level.toString() === assignLevelFilter;

    return matchesSearch && matchesLevel;
  });

  const roleBadgeColor: Record<UserRole, string> = {
    ADMIN: 'bg-rose-100 text-rose-800 border-rose-200',
    ACADEMIC_ADVISOR: 'bg-amber-100 text-amber-800 border-amber-200',
    INSTRUCTOR: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    STUDENT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    PROCESS_OFFICER: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    DEPARTMENT_HEAD: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const roleNameMap: Record<UserRole, { ar: string; en: string }> = {
    ADMIN: { ar: 'مدير النظام (Admin)', en: 'System Administrator' },
    ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic Advisor' },
    INSTRUCTOR: { ar: 'أستاذ المقرر', en: 'Course Instructor' },
    STUDENT: { ar: 'طالب جامعي', en: 'University Student' },
    PROCESS_OFFICER: { ar: 'شؤون الطلاب', en: 'Process Officer' },
    DEPARTMENT_HEAD: { ar: 'رئيس القسم', en: 'Department Head' },
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      searchQuery === '' ||
      u.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.studentId && u.studentId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.advisorId && u.advisorId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 w-full">
      {/* Toast / Banner Messages */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-bold">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-bold">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 text-rose-700 hover:bg-rose-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Action Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <Users className="w-5 h-5" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('إدارة المستخدمين وحسابات النظام (RBAC)', 'Enterprise User Management & Identity')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {t(
              'إدارة وتعديل وحذف مستخدمي النظام الأكاديمي، إعادة تعيين كلمات المرور، وإسناد الطلاب إلى المرشدين الأكاديميين مع تشفير Bcrypt وسجل تدقيق شامل.',
              'Manage, edit, delete users, reset credentials, and assign students to academic advisors with full audit trails.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            title={t('تحديث البيانات', 'Refresh Data')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('إضافة مستخدم جديد', 'Add New User')}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('البحث بالاسم أو البريد أو الكود...', 'Search by name, email or code...')}
            className="w-full pr-9 pl-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">{t('جميع الأدوار الأكاديمية', 'All Academic Roles')}</option>
            <option value="STUDENT">{t('الطلاب (Students)', 'Students')}</option>
            <option value="ACADEMIC_ADVISOR">{t('المرشدين الأكاديميين (Advisors)', 'Advisors')}</option>
            <option value="INSTRUCTOR">{t('أساتذة المقررات (Instructors)', 'Instructors')}</option>
            <option value="DEPARTMENT_HEAD">{t('رؤساء الأقسام (Dept Heads)', 'Dept Heads')}</option>
            <option value="PROCESS_OFFICER">{t('شؤون الطلاب (Process Officers)', 'Process Officers')}</option>
            <option value="ADMIN">{t('مسؤولو النظام (Admins)', 'Admins')}</option>
          </select>
        </div>
      </div>

      {/* Users Data Table with Comprehensive Actions Column */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-right min-w-[220px]">{t('المستخدم والاسم', 'User & Name')}</th>
                <th className="px-4 py-3.5 text-right min-w-[200px]">{t('البريد الإلكتروني الجامعي', 'Institutional Email')}</th>
                <th className="px-4 py-3.5 text-right min-w-[150px]">{t('الدور والصلاحية', 'Role & Authorization')}</th>
                <th className="px-4 py-3.5 text-right min-w-[130px]">{t('المعرف المرتبط', 'Linked Identifier')}</th>
                <th className="px-4 py-3.5 text-center min-w-[120px]">{t('حالة الأمان', 'Security Status')}</th>
                <th className="px-4 py-3.5 text-center min-w-[240px]">{t('الإجراءات والعمليات', 'Actions & Operations')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('جارٍ استرجاع دليل المستخدمين من PostgreSQL...', 'Loading users directory...')}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {t('لم يتم العثور على أي مستخدمين يطابقون معايير البحث.', 'No users found matching query.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0">
                          {user.role.substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm leading-tight">
                            {language === 'ar' ? user.nameAr : user.nameEn}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {language === 'ar' ? user.nameEn : user.nameAr}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 font-mono text-slate-700">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          roleBadgeColor[user.role] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>
                          {language === 'ar'
                            ? roleNameMap[user.role]?.ar || user.role
                            : roleNameMap[user.role]?.en || user.role}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600">
                      {user.studentId ? (
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                          {user.studentId}
                        </span>
                      ) : user.advisorId ? (
                        <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-bold">
                          {user.advisorId}
                        </span>
                      ) : user.instructorId ? (
                        <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                          {user.instructorId}
                        </span>
                      ) : (
                        <span className="text-slate-400">{user.id}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Bcrypt Hash ✓</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* 1. Assign Students (For Advisors) */}
                        {user.role === 'ACADEMIC_ADVISOR' && (
                          <button
                            onClick={() => handleOpenAssignModal(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                            title={t('إسناد وتوزيع الطلاب على هذا المرشد الأكاديمي', 'Assign students')}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>{t('إسناد طلاب', 'Assign')}</span>
                          </button>
                        )}

                        {/* 2. Edit User Button */}
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] transition cursor-pointer"
                          title={t('تعديل بيانات المستخدم', 'Edit user profile')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{t('تعديل', 'Edit')}</span>
                        </button>

                        {/* 3. Reset Password Button */}
                        <button
                          onClick={() => handleOpenResetModal(user)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[11px] transition cursor-pointer"
                          title={t('إعادة تعيين كلمة المرور', 'Reset password')}
                        >
                          <Key className="w-3.5 h-3.5 text-slate-500" />
                          <span>{t('كلمة المرور', 'Password')}</span>
                        </button>

                        {/* 4. Delete User Button */}
                        <button
                          onClick={() => handleOpenDeleteModal(user)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition cursor-pointer"
                          title={t('حذف المستخدم من النظام', 'Delete user')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('حذف', 'Delete')}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 p-3.5 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>
            {t(`إجمالي المستخدمين: ${filteredUsers.length} مستخدم`, `Total users: ${filteredUsers.length}`)}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {t('قاعدة بيانات PostgreSQL | تشفير Bcrypt (10 Rounds)', 'PostgreSQL Database | Bcrypt Encryption')}
          </span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* Modal 1: Edit User Modal (تعديل بيانات المستخدم) */}
      {/* ========================================================= */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    {t('تعديل بيانات المستخدم', 'Edit User Profile')}
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono">
                    ID: {editingUser.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Full Name Arabic */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الاسم الكامل (باللغة العربية) *', 'Full Name (Arabic) *')}
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.nameAr}
                  onChange={e => setEditFormData({ ...editFormData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Full Name English */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الاسم باللغة الإنجليزية', 'Full Name (English)')}
                </label>
                <input
                  type="text"
                  value={editFormData.nameEn}
                  onChange={e => setEditFormData({ ...editFormData, nameEn: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* University Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('البريد الإلكتروني الجامعي *', 'Official University Email *')}
                </label>
                <input
                  type="email"
                  required
                  value={editFormData.email}
                  onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الدور والصلاحية الأكاديمية *', 'Role & Authorization *')}
                </label>
                <select
                  value={editFormData.role}
                  onChange={e => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="STUDENT">{t('طالب (STUDENT)', 'Student (STUDENT)')}</option>
                  <option value="ACADEMIC_ADVISOR">{t('مرشد أكاديمي (ACADEMIC_ADVISOR)', 'Advisor (ACADEMIC_ADVISOR)')}</option>
                  <option value="INSTRUCTOR">{t('أستاذ المقرر (INSTRUCTOR)', 'Instructor (INSTRUCTOR)')}</option>
                  <option value="DEPARTMENT_HEAD">{t('رئيس قسم (DEPARTMENT_HEAD)', 'Dept Head (DEPARTMENT_HEAD)')}</option>
                  <option value="PROCESS_OFFICER">{t('شؤون الطلاب (PROCESS_OFFICER)', 'Process Officer (PROCESS_OFFICER)')}</option>
                  <option value="ADMIN">{t('مدير النظام (ADMIN)', 'Administrator (ADMIN)')}</option>
                </select>
              </div>

              {/* Optional New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('كلمة مرور جديدة (اتركها فارغة إذا كنت لا تريد تغييرها)', 'New Password (leave empty to keep current)')}
                </label>
                <input
                  type="password"
                  value={editFormData.password}
                  onChange={e => setEditFormData({ ...editFormData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {editSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t('جارٍ الحفظ...', 'Saving...')}</span>
                    </>
                  ) : (
                    <span>{t('حفظ التعديلات', 'Save Changes')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal 2: Delete User Confirmation Modal (حذف المستخدم) */}
      {/* ========================================================= */}
      {isDeleteModalOpen && deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm">
                  {t('تأكيد حذف المستخدم نهائياً', 'Confirm Delete User')}
                </h3>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="leading-relaxed">
                {t(
                  'هل أنت متأكد من رغبتك في حذف هذا الحساب نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.',
                  'Are you sure you want to permanently delete this user account from the database?'
                )}
              </p>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                <div><strong>{t('الاسم:', 'Name:')}</strong> {deletingUser.nameAr}</div>
                <div><strong>{t('البريد:', 'Email:')}</strong> <span className="font-mono">{deletingUser.email}</span></div>
                <div><strong>{t('الدور:', 'Role:')}</strong> {deletingUser.role}</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {deleteSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t('جارٍ الحذف...', 'Deleting...')}</span>
                    </>
                  ) : (
                    <span>{t('تأكيد الحذف النهائي', 'Confirm Delete')}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal 3: Reset Password Modal (إعادة تعيين كلمة المرور) */}
      {/* ========================================================= */}
      {isResetModalOpen && resettingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {t('إعادة تعيين كلمة المرور', 'Reset User Password')}
                </h3>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="p-6 space-y-4 text-xs text-slate-700">
              {resetError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{resetError}</span>
                </div>
              )}

              <p className="leading-relaxed">
                {t(
                  `سيتم تغيير كلمة المرور وتشفيرها فوراً بـ Bcrypt للمستخدم (${language === 'ar' ? resettingUser.nameAr : resettingUser.nameEn}).`,
                  `Reset password for user (${resettingUser.nameEn}).`
                )}
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('كلمة المرور الجديدة *', 'New Password *')}
                </label>
                <input
                  type="text"
                  required
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {resetSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t('جارٍ التشفير...', 'Resetting...')}</span>
                    </>
                  ) : (
                    <span>{t('تأكيد وتشفير كلمة المرور', 'Confirm Reset')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal 4: Assign Students to Academic Advisor */}
      {/* ========================================================= */}
      {isAssignModalOpen && selectedAdvisor && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {t('إسناد وتوزيع الطلاب للمرشد الأكاديمي', 'Assign Students to Academic Advisor')}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {language === 'ar' ? selectedAdvisor.nameAr : selectedAdvisor.nameEn} ({selectedAdvisor.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header Controls */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
                  <input
                    type="text"
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    placeholder={t('البحث في الطلاب بالاسم، الرقم، أو البريد...', 'Search students by name, ID...')}
                    className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
                <select
                  value={assignLevelFilter}
                  onChange={e => setAssignLevelFilter(e.target.value)}
                  className="w-full sm:w-auto px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">{t('جميع المستويات', 'All Levels')}</option>
                  <option value="1">{t('المستوى الأول', 'Level 1')}</option>
                  <option value="2">{t('المستوى الثاني', 'Level 2')}</option>
                  <option value="3">{t('المستوى الثالث', 'Level 3')}</option>
                  <option value="4">{t('المستوى الرابع', 'Level 4')}</option>
                </select>
              </div>

              {/* Selection Summary and Batch Select Buttons */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">
                    {t('الطلاب المحددون:', 'Selected:')}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-xs">
                    {selectedStudentIds.size} {t('طالب', 'students')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                  >
                    {t('تحديد المعروض بالكامل', 'Select All Shown')}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 transition cursor-pointer"
                  >
                    {t('إلغاء التحديد', 'Deselect All')}
                  </button>
                </div>
              </div>
            </div>

            {/* Students List with Checkboxes */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
              {assignLoading ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <span className="text-xs text-slate-500 font-medium">
                    {t('جارٍ تحميل الطلاب من قاعدة البيانات...', 'Loading students...')}
                  </span>
                </div>
              ) : filteredStudentsForAssign.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  {t('لم يتم العثور على طلاب يطابقون البحث.', 'No matching students.')}
                </div>
              ) : (
                filteredStudentsForAssign.map(st => {
                  const isChecked = selectedStudentIds.has(st.id);
                  const isAtRisk = st.cumulativeGpa < 2.0;

                  return (
                    <div
                      key={st.id}
                      onClick={() => handleToggleStudentSelection(st.id)}
                      className={`py-3 px-3 rounded-xl flex items-center justify-between gap-3 transition cursor-pointer ${
                        isChecked ? 'bg-amber-50/60 border border-amber-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-amber-600">
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-amber-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">
                              {language === 'ar' ? st.nameAr : st.nameEn}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              #{st.studentCode}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {t(`مستوى ${st.level}`, `Level ${st.level}`)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                            <span>{st.track}</span>
                            <span>•</span>
                            <span className="font-mono">{st.email}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right side stats badge */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className={`text-xs font-bold ${isAtRisk ? 'text-rose-600' : 'text-slate-700'}`}>
                            GPA {st.cumulativeGpa.toFixed(2)}
                          </span>
                        </div>
                        {isAtRisk && (
                          <span className="inline-block text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 mt-0.5">
                            {t('تحت الإنذار', 'Warning')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-xs font-bold transition cursor-pointer"
              >
                {t('إلغاء', 'Cancel')}
              </button>

              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={assignSubmitting}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {assignSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>{t('جارٍ الحفظ وتحديث قاعدة البيانات...', 'Saving Assignment...')}</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {t(
                        `تأكيد إسناد (${selectedStudentIds.size}) طالب للمرشد`,
                        `Confirm Assigning (${selectedStudentIds.size}) Students`
                      )}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal 5: Add New User Modal (إضافة مستخدم جديد) */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  {t('إضافة مستخدم جديد للنظام الأكاديمي', 'Add New Academic User')}
                </h3>
              </div>
              <button
                onClick={handleCloseAddModal}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Full Name Arabic */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الاسم الكامل (باللغة العربية) *', 'Full Name (Arabic) *')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.nameAr}
                  onChange={e => setFormData({ ...formData, nameAr: e.target.value })}
                  placeholder="مثال: د. حسام الدين عبد الرحمن أو أحمد علي"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Full Name English */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الاسم باللغة الإنجليزية', 'Full Name (English)')}
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                  placeholder="e.g. Dr. Hossam El-Din or Ahmed Ali"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* University Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('البريد الإلكتروني الجامعي الرسمي *', 'Official University Email *')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@university.edu.eg"
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('الدور والصلاحية الأكاديمية *', 'Role & Authorization *')}
                </label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="STUDENT">{t('طالب (STUDENT)', 'Student (STUDENT)')}</option>
                  <option value="ACADEMIC_ADVISOR">{t('مرشد أكاديمي (ACADEMIC_ADVISOR)', 'Advisor (ACADEMIC_ADVISOR)')}</option>
                  <option value="INSTRUCTOR">{t('أستاذ المقرر (INSTRUCTOR)', 'Instructor (INSTRUCTOR)')}</option>
                  <option value="DEPARTMENT_HEAD">{t('رئيس قسم (DEPARTMENT_HEAD)', 'Dept Head (DEPARTMENT_HEAD)')}</option>
                  <option value="PROCESS_OFFICER">{t('شؤون الطلاب (PROCESS_OFFICER)', 'Process Officer (PROCESS_OFFICER)')}</option>
                  <option value="ADMIN">{t('مدير النظام (ADMIN)', 'Administrator (ADMIN)')}</option>
                </select>
              </div>

              {/* Conditional Field: Student Code */}
              {formData.role === 'STUDENT' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('الرقم / الكود الجامعي للطالب (اختياري)', 'Student University Code (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={formData.studentCode}
                    onChange={e => setFormData({ ...formData, studentCode: e.target.value })}
                    placeholder="مثال: 20261054"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              )}

              {/* Conditional Field: Department for Instructor */}
              {formData.role === 'INSTRUCTOR' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('القسم الأكاديمي', 'Academic Department')}
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                    placeholder="مثال: Computer Science أو Information Systems"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              )}

              {/* Initial Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('كلمة المرور المبدئية (سيتم تشفيرها بـ Bcrypt) *', 'Initial Password (Bcrypt Hashed) *')}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {t('6 أحرف على الأقل. سيتم تشفيرها بقيمة ملح Bcrypt قبل حفظها في PostgreSQL.', 'Minimum 6 chars. Hashed with Bcrypt before DB write.')}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {formSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t('جارٍ التشفير والحفظ...', 'Encrypting & Saving...')}</span>
                    </>
                  ) : (
                    <span>{t('حفظ وتشفير الحساب', 'Save User')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
