import { AttendanceStatus, Attendance } from '../types';

export function getStatusAfterSwipe(
  attendance: Attendance,
  deadline: string,
  currentTime: string,
): AttendanceStatus {
  switch (attendance.status) {
    case 'EXPECTED':
      return currentTime <= deadline ? 'PRESENT' : 'LATE';
    case 'PRESENT':
      return 'OUT';
    case 'LATE':
      return 'OUT';
    case 'OUT':
      if (attendance.checkin_at && attendance.checkin_at > deadline) return 'LATE';
      return 'PRESENT';
    case 'EXCUSED':
    case 'ABSENT':
      return attendance.status;
  }
}

export function getEventType(
  oldStatus: AttendanceStatus,
  newStatus: AttendanceStatus,
): string {
  if (newStatus === 'OUT') return 'OUT';
  if (oldStatus === 'OUT') return 'RETURN';
  if (newStatus === 'PRESENT' || newStatus === 'LATE') return 'CHECKIN';
  return 'MANUAL_OVERRIDE';
}
