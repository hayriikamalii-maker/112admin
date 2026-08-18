export type StationType = "A1" | "A2";
export type StaffTitle =
  | "Doktor"
  | "Paramedik"
  | "ATT"
  | "Sürücü"
  | "Sürücü ATT"
  | "Sürücü Paramedik";
export type Cadre = "Memur" | "4D İşçi";
export type LeaveType = | "Yıllık izin"
  | "Rapor"
  | "Resmi görev"
  | "Mazeret"
  | "Eğitim"
  | "Diğer";
export type DutyRequestType = "want" | "avoid";
export type DutyRole = "doctor" | "chief" | "ysp" | "driver";
export type StaffDuty = "chief" | "ysp" | "driver";
export type DriverShift = "day" | "night" | "full";
export type UserRole = "admin" | "user";
export type AiProvider = "gemini" | "groq" | "local";

export interface Station {
  id: string;
  name: string;
  radioCode?: string;
  city: string;
  district: string;
  type: StationType;
}

export interface Staff {
  id: string;
  stationId: string;
  fullName: string;
  title: StaffTitle;
  duties?: StaffDuty[];
  cadre: Cadre;
  active: boolean;
  manualTarget?: number;
  overtimeAllowed?: boolean;
  notes?: string;
}

export interface AppUser {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  stationIds: string[];
  dutyPermissions?: StaffDuty[];
  aiProviders: AiProvider[];
  canImport?: boolean;
  mustChangePassword?: boolean;
}

export interface StaffMonthlyAssignment {
  id: string;
  staffId: string;
  year: number;
  month: number;
  type: "Dış Görevlendirme";
  description: string;
  originalStationId?: string;
  startDate?: string;
  endDate?: string;
  indefinite?: boolean;
  createdBy?: string;
  createdAt?: string;
  returnedAt?: string;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  lastDutyDate?: string;
  allowOvertime?: boolean;
  description: string;
}

export interface DutyRequest {
  id: string;
  staffId: string;
  stationId: string;
  date: string;
  type: DutyRequestType;
  shiftPreference?: DriverShift;
  description: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  manual: boolean;
}

export interface ScheduleDay {
  date: string;
  doctorId?: string;
  chiefId?: string;
  chiefSecondId?: string;
  chiefStartTime?: string;
  chiefEndTime?: string;
  chiefSecondStartTime?: string;
  chiefSecondEndTime?: string;
  yspId?: string;
  yspSecondId?: string;
  yspStartTime?: string;
  yspEndTime?: string;
  yspSecondStartTime?: string;
  yspSecondEndTime?: string;
  dayDriverId?: string;
  nightDriverId?: string;
  fullDriverId?: string;
}

export interface Schedule {
  id: string;
  stationId: string;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
  days: ScheduleDay[];
  autoSnapshot?: ScheduleDay[];
}

export interface ChangeLog {
  id: string;
  scheduleId: string;
  date: string;
  field: keyof ScheduleDay;
  previousStaffId?: string;
  nextStaffId?: string;
  changedBy: string;
  changedAt: string;
}

export interface RuleViolation {
  id: string;
  severity: "warning" | "critical";
  date?: string;
  staffId?: string;
  message: string;
}

export interface AppSettings {
  appName: string;
  currentUser: string;
  aiProvider: AiProvider;
  aiApiKeys: Partial<Record<Exclude<AiProvider, "local">, string>>;
  scheduleRulesText?: string;
}

export interface AppState {
  users: AppUser[];
  stations: Station[];
  staff: Staff[];
  staffMonthlyAssignments: StaffMonthlyAssignment[];
  leaves: LeaveRequest[];
  dutyRequests: DutyRequest[];
  holidays: PublicHoliday[];
  schedules: Schedule[];
  changeLogs: ChangeLog[];
  settings: AppSettings;
}
