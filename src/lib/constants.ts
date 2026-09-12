// ============================================================================
// SI-7KAIH AI - Constants & Habit Definitions
// 7 Standard Habits and Role Personas
// ============================================================================

import { HabitCode, HabitMaster, UserRole } from '../../packages/types/src/index';

export type AuthChannel = 'MANDIRI_INTERNAL';

export interface UserPersona {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  avatar: string;
  schoolId?: string;
  schoolName?: string;
  className?: string;
  identifierLabel: string;
  identifierValue: string;
  username: string;
  passwordHash?: string;
  email: string;
  nip?: string;
  phone?: string;
  agencyUnit?: string;
  officeAddress?: string;
  bio?: string;
  twoFactorEnabled?: boolean;
  lastUpdated?: string;
  accountStatus: 'MANDIRI_TERVERIFIKASI' | 'MANDIRI_AKTIF' | 'MANDIRI_NONAKTIF';
  dataMode?: 'PRODUKSI_AKTIF';
  authChannel: AuthChannel;
  authProviderLabel: string;
  securityLevel: string;
  managedBy: string;
  childName?: string;
  childId?: string;
  childNisn?: string;
  createdDate?: string;
}

export const USER_PERSONAS: UserPersona[] = [
  {
    id: 'usr-superadmin-01',
    name: 'Dr. Ir. H. Agus Suryanto, M.T.',
    role: 'SUPER_ADMIN',
    title: 'Super Administrator SI-7KAIH Pusat',
    avatar: '🛡️',
    schoolName: 'Kementerian Dikdasmen / Seluruh Satuan Pendidikan',
    identifierLabel: 'ID Pegawai Pusat',
    identifierValue: 'PUSDATIN-ADM-8801',
    nip: '197408121999031002',
    phone: '+62 812-8899-7701',
    agencyUnit: 'Pusat Data dan Teknologi Informasi (Pusdatin) Kemendikdasmen',
    officeAddress: 'Gedung C Lantai 18, Kompleks Kemendikdasmen, Jl. Jenderal Sudirman, Senayan, Jakarta Pusat',
    bio: 'Super Administrator Pengendali Utama SI-7KAIH Nasional. Mengemban amanah pembinaan master data pembiasaan 7 Karakter Anak Indonesia Hebat, pengawasan tata kelola akun SIM satuan pendidikan, serta pengawalan integritas etika AI tanpa pelabelan negatif maupun perankingan siswa.',
    username: 'superadmin',
    email: 'superadmin@kemdikbud.go.id',
    twoFactorEnabled: true,
    lastUpdated: '2026-09-09',
    accountStatus: 'MANDIRI_TERVERIFIKASI',
    authChannel: 'MANDIRI_INTERNAL',
    authProviderLabel: 'Autentikasi Mandiri IAM Pusat',
    securityLevel: 'Super Administrator (Akses Penuh Semua Fitur & Master Data)',
    managedBy: 'Root Security Authority Kemdikbudristek',
    createdDate: '2026-05-01',
  },
];

// Helper to retrieve and persist dynamically managed users in LocalStorage
export const getStoredUsers = (): UserPersona[] => {
  try {
    const saved = localStorage.getItem('si7kaih_users_pool_prod');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Hilangkan data akun default lama: siswa, wali, admin sekolah, kepala sekolah, dan pengawas sekolah
        const legacyDummyIds = new Set([
          'usr-student-01',
          'usr-student-02',
          'usr-parent-01',
          'usr-parent-02',
          'usr-teacher-01',
          'usr-teacher-02',
          'usr-admin-01',
          'usr-admin-02',
          'usr-admin-03',
          'usr-principal-01',
          'usr-principal-02',
          'usr-supervisor-01',
        ]);
        const legacyDummyUsernames = new Set([
          '0123456781',
          '0123456799',
          'wali.0123456781',
          'wali.0123456799',
          'admin.sim',
          'admin.harapan',
          'operator.smpn01',
          '197206151997021002',
          '197804152002121003',
          '196811051992031004',
          '198203152006041008',
          '198506202010011009',
        ]);

        const cleaned = parsed
          .filter(
            (u: UserPersona) =>
              u.role === 'SUPER_ADMIN' ||
              (!legacyDummyIds.has(u.id) && !legacyDummyUsernames.has(u.username))
          )
          .map((u: UserPersona) => ({
            ...u,
            dataMode: 'PRODUKSI_AKTIF' as const,
          }));

        // Pastikan akun Super Admin selalu ada di pool pengguna
        const hasSuperAdmin = cleaned.some((u) => u.role === 'SUPER_ADMIN');
        const finalPool = hasSuperAdmin ? cleaned : [USER_PERSONAS[0], ...cleaned];

        if (finalPool.length !== parsed.length) {
          saveStoredUsers(finalPool);
        }
        return finalPool;
      }
    }
  } catch (_e) {}
  return USER_PERSONAS;
};

export const saveStoredUsers = (users: UserPersona[]): void => {
  try {
    localStorage.setItem('si7kaih_users_pool_prod', JSON.stringify(users));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('si7kaih_users_updated', { detail: users }));
    }
  } catch (_e) {}
};

export const HABIT_MASTERS: Record<HabitCode, HabitMaster> = {
  WAKE_EARLY: {
    id: 'b1000000-0000-0000-0000-000000000001',
    code: 'WAKE_EARLY',
    name: 'Bangun Pagi',
    description: 'Membiasakan bangun lebih awal dengan suasana hati segar untuk menyambut hari.',
    targetDescription: 'Bangun pagi pukul 04:30 - 06:00 dengan ceria dan bersemangat.',
    iconName: 'Sun',
    displayOrder: 1,
    isSystemMaster: true,
  },
  WORSHIP: {
    id: 'b1000000-0000-0000-0000-000000000002',
    code: 'WORSHIP',
    name: 'Beribadah',
    description: 'Melaksanakan ibadah sesuai agama dan keyakinan masing-masing secara tulus.',
    targetDescription: 'Melaksanakan ibadah harian sesuai bimbingan keluarga tanpa paksaan.',
    iconName: 'HeartHandshake',
    displayOrder: 2,
    isSystemMaster: true,
  },
  EXERCISE: {
    id: 'b1000000-0000-0000-0000-000000000003',
    code: 'EXERCISE',
    name: 'Berolahraga',
    description: 'Melakukan aktivitas fisik minimal 15-30 menit untuk menjaga kebugaran tubuh.',
    targetDescription: 'Senam, jalan santai, bersepeda, atau olahraga permainan aktif.',
    iconName: 'Activity',
    displayOrder: 3,
    isSystemMaster: true,
  },
  HEALTHY_EATING: {
    id: 'b1000000-0000-0000-0000-000000000004',
    code: 'HEALTHY_EATING',
    name: 'Makan Sehat dan Bergizi',
    description: 'Membiasakan sarapan bergizi seimbang, mengonsumsi sayur/buah, dan cukup minum air putih.',
    targetDescription: 'Sarapan bernutrisi, makan buah/sayur, dan minum air putih cukup.',
    iconName: 'Apple',
    displayOrder: 4,
    isSystemMaster: true,
  },
  LEARNING: {
    id: 'b1000000-0000-0000-0000-000000000005',
    code: 'LEARNING',
    name: 'Gemar Belajar',
    description: 'Menumbuhkan kecintaan membaca buku atau eksplorasi hal baru secara mandiri.',
    targetDescription: 'Membaca buku cerita / ensiklopedia atau belajar mandiri minimal 15 menit.',
    iconName: 'BookOpen',
    displayOrder: 5,
    isSystemMaster: true,
  },
  SOCIAL: {
    id: 'b1000000-0000-0000-0000-000000000006',
    code: 'SOCIAL',
    name: 'Bermasyarakat',
    description: 'Berinteraksi positif, membantu orang tua, menyapa tetangga, atau gotong royong.',
    targetDescription: 'Melakukan kebaikan, membantu orang tua, atau peduli sesama.',
    iconName: 'Users',
    displayOrder: 6,
    isSystemMaster: true,
  },
  SLEEP_EARLY: {
    id: 'b1000000-0000-0000-0000-000000000007',
    code: 'SLEEP_EARLY',
    name: 'Tidur Cepat',
    description: 'Membiasakan tidur tepat waktu sebelum pukul 21:30 dan membatasi layar gawai.',
    targetDescription: 'Tidur cukup 8-9 jam tanpa layar gawai menjelang tidur.',
    iconName: 'Moon',
    displayOrder: 7,
    isSystemMaster: true,
  },
};

export const getStoredHabitMasters = (): Record<HabitCode, HabitMaster> => {
  try {
    const saved = localStorage.getItem('si7kaih_habit_masters_prod');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return { ...HABIT_MASTERS, ...parsed };
      }
    }
  } catch (_e) {}
  return HABIT_MASTERS;
};

export const saveStoredHabitMasters = (masters: Record<HabitCode, HabitMaster>): void => {
  try {
    localStorage.setItem('si7kaih_habit_masters_prod', JSON.stringify(masters));
  } catch (_e) {}
};

export const resetStoredHabitMasters = (): Record<HabitCode, HabitMaster> => {
  try {
    localStorage.setItem('si7kaih_habit_masters_prod', JSON.stringify(HABIT_MASTERS));
  } catch (_e) {}
  return HABIT_MASTERS;
};

export const resetStoredUsers = (): UserPersona[] => {
  try {
    localStorage.setItem('si7kaih_users_pool_prod', JSON.stringify(USER_PERSONAS));
  } catch (_e) {}
  return USER_PERSONAS;
};

export const HABIT_LIST = Object.values(HABIT_MASTERS);

// ============================================================================
// Pengaturan Tombol Logout & Selesai Sesi Pengguna
// ============================================================================

export interface LogoutSettings {
  confirmBeforeLogout: boolean; // Menampilkan modal konfirmasi sebelum sesi diakhiri
  redirectDestination: 'LOGIN_DASHBOARD' | 'SSO_MODAL'; // Pengalihan pasca logout (Default ke Login Dashboard)
  clearDraftOnLogout: boolean; // Bersihkan draf isian yang belum tersimpan
  autoLogoutInactivity: 'DISABLED' | '15_MIN' | '30_MIN' | '60_MIN'; // Timer otomatis keluar saat inaktif
  showLogoutButtonInHeader: boolean; // Tampilkan tombol logout langsung di bilah atas (Header)
  recordAuditOnLogout: boolean; // Catat aktivitas logout ke audit log keamanan
  showSessionTimerBadge: boolean; // Tampilkan indikator durasi aktif sesi
}

export const DEFAULT_LOGOUT_SETTINGS: LogoutSettings = {
  confirmBeforeLogout: true,
  redirectDestination: 'LOGIN_DASHBOARD',
  clearDraftOnLogout: false,
  autoLogoutInactivity: 'DISABLED',
  showLogoutButtonInHeader: true,
  recordAuditOnLogout: true,
  showSessionTimerBadge: true,
};

export const getStoredLogoutSettings = (): LogoutSettings => {
  try {
    const saved = localStorage.getItem('si7kaih_logout_settings_prod');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_LOGOUT_SETTINGS, ...parsed };
    }
  } catch (_e) {}
  return DEFAULT_LOGOUT_SETTINGS;
};

export const saveStoredLogoutSettings = (settings: LogoutSettings): void => {
  try {
    localStorage.setItem('si7kaih_logout_settings_prod', JSON.stringify(settings));
  } catch (_e) {}
};

