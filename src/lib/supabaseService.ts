// ============================================================================
// SI-7KAIH AI - Supabase Database Service & Permanent Storage Layer
// ============================================================================

import { supabase, checkSupabaseHealth } from './supabase';
import {
  DailyJournal,
  Badge,
  SchoolProgram,
  FollowUpPlan,
  StudentMonthlyReflection,
  ParentMonthlyReflection,
  AuditLog,
} from '../../packages/types/src/index';
import { UserPersona } from './constants';

export interface SupabaseSyncStatus {
  isConfigured: boolean;
  isConnected: boolean;
  tablesReady: boolean;
  isRealtimeActive: boolean;
  isAutoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  statusMessage: string;
  syncCount: number;
  lastSyncEvent: string | null;
}

// Global sync state listener
type SyncListener = (status: SupabaseSyncStatus) => void;
const listeners: Set<SyncListener> = new Set();

let currentStatus: SupabaseSyncStatus = {
  isConfigured: true,
  isConnected: false,
  tablesReady: false,
  isRealtimeActive: false,
  isAutoSyncEnabled: true,
  lastSyncedAt: null,
  statusMessage: 'Memeriksa koneksi Supabase...',
  syncCount: 0,
  lastSyncEvent: null,
};

function notifyListeners() {
  listeners.forEach((listener) => listener({ ...currentStatus }));
}

// BroadcastChannel for instant zero-latency cross-tab and cross-window sync
const BROADCAST_CHANNEL_NAME = 'si7kaih_auto_sync_channel';
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof (window as any).BroadcastChannel !== 'undefined') {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch (_e) {
    // Fallback if BroadcastChannel is restricted
  }
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener({ ...currentStatus });
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshSupabaseStatus(): Promise<SupabaseSyncStatus> {
  const health = await checkSupabaseHealth();
  currentStatus = {
    ...currentStatus,
    isConnected: health.connected,
    tablesReady: health.tablesReady,
    statusMessage: health.message,
  };
  notifyListeners();
  return currentStatus;
}

// ----------------------------------------------------------------------------
// 1. DAILY JOURNALS REPOSITORY
// ----------------------------------------------------------------------------

export async function fetchJournalsFromSupabase(): Promise<DailyJournal[] | null> {
  try {
    const { data, error } = await supabase
      .from('si7kaih_journals')
      .select('data')
      .order('date', { ascending: false });

    if (error) {
      console.warn('Supabase fetchJournals notice:', error.message);
      return null;
    }

    if (Array.isArray(data)) {
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.isConnected = true;
      currentStatus.tablesReady = true;
      notifyListeners();
      return data.map((item: any) => item.data as DailyJournal);
    }
    return null;
  } catch (err) {
    console.warn('Error fetching journals from Supabase:', err);
    return null;
  }
}

export async function saveJournalToSupabase(journal: DailyJournal): Promise<boolean> {
  try {
    const journalDate = journal.journalDate || (journal as any).date || new Date().toISOString().split('T')[0];
    const isParentVal =
      (journal as any).parentSignature ??
      Object.values(journal.entries || {}).some((e: any) => e.parentValidated);
    const isTeacherVal =
      (journal as any).teacherValidated ??
      Object.values(journal.entries || {}).some((e: any) => e.teacherValidated);

    const { error } = await supabase.from('si7kaih_journals').upsert(
      {
        id: journal.id,
        student_id: journal.studentId,
        date: journalDate,
        status: journal.status || 'SUBMITTED',
        parent_validated: Boolean(isParentVal),
        teacher_validated: Boolean(isTeacherVal),
        data: journal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,date' }
    );

    if (error) {
      console.warn('Supabase saveJournal warning:', error.message);
      return false;
    }

    currentStatus.lastSyncedAt = new Date().toISOString();
    currentStatus.syncCount++;
    currentStatus.lastSyncEvent = `Penyimpanan jurnal ${journal.studentName || journal.studentId}`;
    notifyListeners();

    // Broadcast immediately to all open tabs and windows
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: 'JOURNAL_SAVED',
          journal,
          timestamp: Date.now(),
        });
      } catch (_e) {}
    }

    return true;
  } catch (err) {
    console.warn('Error saving journal to Supabase:', err);
    return false;
  }
}

export async function saveAllJournalsToSupabase(journals: DailyJournal[]): Promise<number> {
  if (!journals || journals.length === 0) return 0;
  let successCount = 0;

  try {
    const rows = journals.map((j) => {
      const journalDate = j.journalDate || (j as any).date || new Date().toISOString().split('T')[0];
      const isParentVal =
        (j as any).parentSignature ??
        Object.values(j.entries || {}).some((e: any) => e.parentValidated);
      const isTeacherVal =
        (j as any).teacherValidated ??
        Object.values(j.entries || {}).some((e: any) => e.teacherValidated);

      return {
        id: j.id,
        student_id: j.studentId,
        date: journalDate,
        status: j.status || 'SUBMITTED',
        parent_validated: Boolean(isParentVal),
        teacher_validated: Boolean(isTeacherVal),
        data: j,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from('si7kaih_journals')
      .upsert(rows, { onConflict: 'student_id,date' });

    if (!error) {
      successCount = journals.length;
      currentStatus.lastSyncedAt = new Date().toISOString();
      notifyListeners();
    } else {
      console.warn('Batch journals upsert notice:', error.message);
    }
  } catch (err) {
    console.warn('Batch journals upsert error:', err);
  }

  return successCount;
}

// ----------------------------------------------------------------------------
// 2. REFLECTIONS REPOSITORY (STUDENT & PARENT)
// ----------------------------------------------------------------------------

export async function fetchReflectionsFromSupabase(): Promise<{
  studentReflection?: StudentMonthlyReflection;
  parentReflection?: ParentMonthlyReflection;
} | null> {
  try {
    const { data, error } = await supabase.from('si7kaih_reflections').select('*');
    if (error || !Array.isArray(data)) return null;

    let studentRef: StudentMonthlyReflection | undefined;
    let parentRef: ParentMonthlyReflection | undefined;

    for (const item of data) {
      if (item.type === 'STUDENT' && !studentRef) {
        studentRef = item.data;
      } else if (item.type === 'PARENT' && !parentRef) {
        parentRef = item.data;
      }
    }

    return { studentReflection: studentRef, parentReflection: parentRef };
  } catch (err) {
    console.warn('Error fetching reflections from Supabase:', err);
    return null;
  }
}

export async function saveStudentReflectionToSupabase(
  ref: StudentMonthlyReflection,
  studentId: string = 'usr-student-01'
): Promise<boolean> {
  try {
    const id = `refl-stu-${ref.year}-${ref.month}-${studentId}`;
    const { error } = await supabase.from('si7kaih_reflections').upsert(
      {
        id,
        type: 'STUDENT',
        target_id: studentId,
        month: ref.month,
        year: ref.year,
        data: ref,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (!error) {
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.syncCount++;
      currentStatus.lastSyncEvent = 'Penyimpanan refleksi bulanan siswa';
      notifyListeners();

      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'REFLECTION_SAVED',
            reflectionType: 'STUDENT',
            reflection: ref,
            timestamp: Date.now(),
          });
        } catch (_e) {}
      }
    }

    return !error;
  } catch (err) {
    console.warn('Error saving student reflection to Supabase:', err);
    return false;
  }
}

export async function saveParentReflectionToSupabase(
  ref: ParentMonthlyReflection,
  parentId: string = 'usr-parent-01'
): Promise<boolean> {
  try {
    const id = `refl-par-${ref.year}-${ref.month}-${parentId}`;
    const { error } = await supabase.from('si7kaih_reflections').upsert(
      {
        id,
        type: 'PARENT',
        target_id: parentId,
        month: ref.month,
        year: ref.year,
        data: ref,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (!error) {
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.syncCount++;
      currentStatus.lastSyncEvent = 'Penyimpanan refleksi bulanan orang tua';
      notifyListeners();

      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'REFLECTION_SAVED',
            reflectionType: 'PARENT',
            reflection: ref,
            timestamp: Date.now(),
          });
        } catch (_e) {}
      }
    }

    return !error;
  } catch (err) {
    console.warn('Error saving parent reflection to Supabase:', err);
    return false;
  }
}

// ----------------------------------------------------------------------------
// 3. USERS POOL REPOSITORY (RBAC & SIM SEKOLAH)
// ----------------------------------------------------------------------------

export async function fetchUsersFromSupabase(): Promise<UserPersona[] | null> {
  try {
    const { data, error } = await supabase.from('si7kaih_users').select('data');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data.map((d: any) => d.data as UserPersona);
  } catch (err) {
    console.warn('Error fetching users from Supabase:', err);
    return null;
  }
}

export async function saveUsersToSupabase(users: UserPersona[]): Promise<boolean> {
  if (!users || users.length === 0) return false;
  try {
    const rows = users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      school_id: u.schoolId || null,
      data: u,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('si7kaih_users').upsert(rows, { onConflict: 'id' });
    if (!error) {
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.syncCount++;
      currentStatus.lastSyncEvent = `Penyimpanan ${users.length} akun pengguna ke Supabase`;
      notifyListeners();

      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'USERS_SAVED',
            users,
            timestamp: Date.now(),
          });
        } catch (_e) {}
      }
    }
    return !error;
  } catch (err) {
    console.warn('Error saving users to Supabase:', err);
    return false;
  }
}

export async function saveSingleUserToSupabase(user: UserPersona): Promise<boolean> {
  try {
    const row = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      school_id: user.schoolId || null,
      data: user,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('si7kaih_users').upsert(row, { onConflict: 'id' });
    if (!error) {
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.syncCount++;
      currentStatus.lastSyncEvent = `Penyimpanan akun pengguna ${user.name} (${user.role})`;
      notifyListeners();

      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'SINGLE_USER_SAVED',
            user,
            timestamp: Date.now(),
          });
        } catch (_e) {}
      }
    }
    return !error;
  } catch (err) {
    console.warn('Error saving single user to Supabase:', err);
    return false;
  }
}

// Global auto-sync listener for user pool modifications across the app
if (typeof window !== 'undefined') {
  let saveUsersDebounceTimer: any = null;
  window.addEventListener('si7kaih_users_updated', (e: any) => {
    const users = e.detail;
    if (Array.isArray(users) && users.length > 0) {
      if (saveUsersDebounceTimer) clearTimeout(saveUsersDebounceTimer);
      saveUsersDebounceTimer = setTimeout(() => {
        saveUsersToSupabase(users).catch((err) => {
          console.warn('Background auto-sync users to Supabase notice:', err);
        });
      }, 500);
    }
  });
}

// ----------------------------------------------------------------------------
// 4. AUDIT LOGS REPOSITORY
// ----------------------------------------------------------------------------

export async function fetchAuditLogsFromSupabase(): Promise<AuditLog[] | null> {
  try {
    const { data, error } = await supabase
      .from('si7kaih_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !Array.isArray(data)) return null;

    return data.map((d: any) => ({
      id: d.id,
      actorId: d.actor_id,
      actorName: d.actor_name,
      actorRole: d.actor_role,
      action: d.action,
      entityType: 'general',
      entityId: d.id,
      schoolId: d.school_id,
      details: d.details,
      createdAt: d.created_at,
    }));
  } catch (err) {
    console.warn('Error fetching audit logs from Supabase:', err);
    return null;
  }
}

export async function logAuditToSupabase(log: AuditLog): Promise<boolean> {
  try {
    const { error } = await supabase.from('si7kaih_audit_logs').insert({
      id: log.id,
      actor_id: log.actorId,
      actor_name: log.actorName,
      actor_role: log.actorRole,
      action: log.action,
      details: log.details || '',
      school_id: log.schoolId || null,
      created_at: log.createdAt || new Date().toISOString(),
    });
    return !error;
  } catch (err) {
    console.warn('Error logging audit to Supabase:', err);
    return false;
  }
}

// ----------------------------------------------------------------------------
// 5. MASTER SYNC FUNCTION
// ----------------------------------------------------------------------------

export async function syncAllToSupabase(payload: {
  journals: DailyJournal[];
  studentReflection: StudentMonthlyReflection;
  parentReflection: ParentMonthlyReflection;
  users: UserPersona[];
}): Promise<{ success: boolean; message: string }> {
  try {
    await refreshSupabaseStatus();

    let journalsSynced = 0;
    if (payload.journals.length > 0) {
      journalsSynced = await saveAllJournalsToSupabase(payload.journals);
    }

    await saveStudentReflectionToSupabase(payload.studentReflection);
    await saveParentReflectionToSupabase(payload.parentReflection);

    if (payload.users.length > 0) {
      await saveUsersToSupabase(payload.users);
    }

    currentStatus.lastSyncedAt = new Date().toISOString();
    notifyListeners();

    return {
      success: true,
      message: `Berhasil sinkronisasi permanen ke Supabase (${journalsSynced} jurnal tersinkron).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Sinkronisasi gagal: ${err?.message || 'Gagal menghubungi server'}`,
    };
  }
}

// ----------------------------------------------------------------------------
// 6. REAL-TIME MULTI-USER AUTO-SYNCHRONIZATION
// ----------------------------------------------------------------------------

export interface AutoSyncCallbacks {
  onJournalUpdate: (journal: DailyJournal, source: 'realtime' | 'poll' | 'broadcast') => void;
  onAllJournalsSync?: (journals: DailyJournal[]) => void;
  onReflectionUpdate?: (
    type: 'STUDENT' | 'PARENT',
    reflection: StudentMonthlyReflection | ParentMonthlyReflection,
    source: 'realtime' | 'poll' | 'broadcast'
  ) => void;
  onUserUpdate?: (user: UserPersona, source: 'realtime' | 'poll' | 'broadcast') => void;
  onAllUsersSync?: (users: UserPersona[], source: 'realtime' | 'poll' | 'broadcast') => void;
  onNotification?: (message: string, detail?: string) => void;
}

export function startAutomaticSynchronization(callbacks: AutoSyncCallbacks): () => void {
  let isCleanedUp = false;
  let realtimeChannel: any = null;

  // A. Realtime Channel using Supabase WebSocket (postgres_changes)
  try {
    realtimeChannel = supabase
      .channel('si7kaih_realtime_stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'si7kaih_journals' },
        (payload: any) => {
          if (isCleanedUp) return;
          if (payload.new && payload.new.data) {
            const updatedJournal = payload.new.data as DailyJournal;
            callbacks.onJournalUpdate(updatedJournal, 'realtime');
            currentStatus.syncCount++;
            currentStatus.lastSyncedAt = new Date().toISOString();
            currentStatus.lastSyncEvent = `Pembaruan realtime jurnal (${updatedJournal.studentName || updatedJournal.studentId})`;
            notifyListeners();
            callbacks.onNotification?.(
              'Jurnal diperbarui otomatis',
              `Data jurnal ${updatedJournal.studentName || 'siswa'} disinkronkan langsung dari Supabase.`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'si7kaih_reflections' },
        (payload: any) => {
          if (isCleanedUp) return;
          if (payload.new && payload.new.data) {
            const type = payload.new.type as 'STUDENT' | 'PARENT';
            const reflection = payload.new.data;
            callbacks.onReflectionUpdate?.(type, reflection, 'realtime');
            currentStatus.syncCount++;
            currentStatus.lastSyncedAt = new Date().toISOString();
            currentStatus.lastSyncEvent = `Pembaruan realtime refleksi ${type === 'PARENT' ? 'orang tua' : 'siswa'}`;
            notifyListeners();
            callbacks.onNotification?.(
              'Refleksi diperbarui otomatis',
              `Refleksi bulanan ${type === 'PARENT' ? 'orang tua' : 'siswa'} disinkronkan secara realtime.`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'si7kaih_users' },
        (payload: any) => {
          if (isCleanedUp) return;
          if (payload.new && payload.new.data) {
            const updatedUser = payload.new.data as UserPersona;
            try {
              const raw = localStorage.getItem('si7kaih_users_pool_prod');
              const pool: UserPersona[] = raw ? JSON.parse(raw) : [];
              const idx = pool.findIndex((u) => u.id === updatedUser.id);
              if (idx >= 0) {
                pool[idx] = updatedUser;
              } else {
                pool.push(updatedUser);
              }
              localStorage.setItem('si7kaih_users_pool_prod', JSON.stringify(pool));
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('si7kaih_users_updated', { detail: pool }));
              }
            } catch (_e) {}

            callbacks.onUserUpdate?.(updatedUser, 'realtime');
            currentStatus.syncCount++;
            currentStatus.lastSyncedAt = new Date().toISOString();
            currentStatus.lastSyncEvent = `Pembaruan realtime profil ${updatedUser.name} (${updatedUser.role})`;
            notifyListeners();
            callbacks.onNotification?.(
              'Profil/Akun Terperbarui',
              `Data akun ${updatedUser.name} (${updatedUser.role}) telah terupdate di semua perangkat.`
            );
          }
        }
      )
      .subscribe((status: string) => {
        if (!isCleanedUp) {
          currentStatus.isRealtimeActive = status === 'SUBSCRIBED';
          notifyListeners();
        }
      });
  } catch (err) {
    console.warn('Realtime channel subscription notice:', err);
  }

  // B. Cross-Tab / Cross-Window Broadcast Listener
  const handleBroadcastMessage = (event: MessageEvent) => {
    if (isCleanedUp || !event.data) return;
    if (event.data.type === 'JOURNAL_SAVED' && event.data.journal) {
      callbacks.onJournalUpdate(event.data.journal, 'broadcast');
      currentStatus.syncCount++;
      currentStatus.lastSyncedAt = new Date().toISOString();
      currentStatus.lastSyncEvent = 'Sinkronisasi instan antar jendela browser';
      notifyListeners();
    }
    if (event.data.type === 'REFLECTION_SAVED' && event.data.reflection) {
      callbacks.onReflectionUpdate?.(
        event.data.reflectionType,
        event.data.reflection,
        'broadcast'
      );
      currentStatus.syncCount++;
      currentStatus.lastSyncedAt = new Date().toISOString();
      notifyListeners();
    }
    if (event.data.type === 'SINGLE_USER_SAVED' && event.data.user) {
      const updatedUser = event.data.user as UserPersona;
      try {
        const raw = localStorage.getItem('si7kaih_users_pool_prod');
        const pool: UserPersona[] = raw ? JSON.parse(raw) : [];
        const idx = pool.findIndex((u) => u.id === updatedUser.id);
        if (idx >= 0) {
          pool[idx] = updatedUser;
        } else {
          pool.push(updatedUser);
        }
        localStorage.setItem('si7kaih_users_pool_prod', JSON.stringify(pool));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('si7kaih_users_updated', { detail: pool }));
        }
      } catch (_e) {}
      callbacks.onUserUpdate?.(updatedUser, 'broadcast');
      currentStatus.syncCount++;
      currentStatus.lastSyncedAt = new Date().toISOString();
      notifyListeners();
    }
    if (event.data.type === 'USERS_SAVED' && Array.isArray(event.data.users)) {
      callbacks.onAllUsersSync?.(event.data.users, 'broadcast');
      currentStatus.syncCount++;
      currentStatus.lastSyncedAt = new Date().toISOString();
      notifyListeners();
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcastMessage);
  }

  // C. Unified remote sync runner for background polling and user access events
  const syncAllRemoteData = async () => {
    if (isCleanedUp) return;
    try {
      // 1. Fetch latest journals
      const remoteJournals = await fetchJournalsFromSupabase();
      if (remoteJournals && remoteJournals.length > 0 && !isCleanedUp) {
        callbacks.onAllJournalsSync?.(remoteJournals);
      }

      // 2. Fetch latest users
      const remoteUsers = await fetchUsersFromSupabase();
      if (remoteUsers && remoteUsers.length > 0 && !isCleanedUp) {
        try {
          const raw = localStorage.getItem('si7kaih_users_pool_prod');
          const localPool: UserPersona[] = raw ? JSON.parse(raw) : [];
          const userMap = new Map<string, UserPersona>();
          localPool.forEach((u) => userMap.set(u.id, u));
          let hasDiff = false;
          remoteUsers.forEach((ru) => {
            const ex = userMap.get(ru.id);
            if (!ex || JSON.stringify(ex) !== JSON.stringify(ru)) {
              userMap.set(ru.id, ru);
              hasDiff = true;
            }
          });
          if (hasDiff) {
            const merged = Array.from(userMap.values());
            localStorage.setItem('si7kaih_users_pool_prod', JSON.stringify(merged));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('si7kaih_users_updated', { detail: merged }));
            }
            callbacks.onAllUsersSync?.(merged, 'poll');
          }
        } catch (_e) {
          callbacks.onAllUsersSync?.(remoteUsers, 'poll');
        }
      }

      // 3. Fetch latest reflections
      const remoteReflections = await fetchReflectionsFromSupabase();
      if (remoteReflections && !isCleanedUp) {
        if (remoteReflections.studentReflection) {
          callbacks.onReflectionUpdate?.('STUDENT', remoteReflections.studentReflection, 'poll');
        }
        if (remoteReflections.parentReflection) {
          callbacks.onReflectionUpdate?.('PARENT', remoteReflections.parentReflection, 'poll');
        }
      }
    } catch (_e) {
      // Quiet background check
    }
  };

  // Run periodic polling every 10 seconds when tab is visible
  const pollInterval = setInterval(() => {
    if (isCleanedUp || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    syncAllRemoteData();
  }, 10000);

  // Immediate sync whenever user accesses tab, switches back to app, or regains network
  const handleVisibilityOrFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isCleanedUp) {
      syncAllRemoteData();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }
  }

  // Cleanup handler
  return () => {
    isCleanedUp = true;
    clearInterval(pollInterval);
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcastMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
    }
    if (realtimeChannel) {
      try {
        supabase.removeChannel(realtimeChannel);
      } catch (_e) {}
    }
  };
}

