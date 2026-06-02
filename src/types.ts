export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export type AttendanceStatus =
  | 'EXPECTED'
  | 'PRESENT'
  | 'LATE'
  | 'OUT'
  | 'EXCUSED'
  | 'ABSENT';

export type EventType =
  | 'CHECKIN'
  | 'OUT'
  | 'RETURN'
  | 'MANUAL_OVERRIDE'
  | 'SESSION_OPEN'
  | 'SESSION_CLOSE';

export interface Student {
  id: string;
  card_id: string;
  name: string;
  class: string;
  class_no: number;
  enrolled_days: string;
}

export interface Teacher {
  card_id: string;
  name: string;
}

export interface Session {
  date: string;
  weekday: string;
  teacher_id: string;
  opened_at: string;
  closed_at: string | null;
  checkin_deadline: string;
}

export interface Attendance {
  date: string;
  student_id: string;
  seat: string;
  status: AttendanceStatus;
  checkin_at: string | null;
  synced: number;
}

export interface SeatRow {
  seat: string;
  student_id: string | null;
  name: string | null;
  class: string | null;
  status: string | null;
  checkin_at: string | null;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_SERVICE_ACCOUNT: string;
  GOOGLE_SPREADSHEET_ID: string;
  CHECKIN_DEADLINE: string;
}
