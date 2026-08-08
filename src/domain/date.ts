import type { Cadre, LeaveRequest, PublicHoliday, Staff } from "./types";

const monthNames = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const religiousHolidays: Record<number, Array<[string, string]>> = {
  2026: [
    ["2026-03-19", "Ramazan Bayramı Arefesi"],
    ["2026-03-20", "Ramazan Bayramı 1. Gün"],
    ["2026-03-21", "Ramazan Bayramı 2. Gün"],
    ["2026-03-22", "Ramazan Bayramı 3. Gün"],
    ["2026-05-26", "Kurban Bayramı Arefesi"],
    ["2026-05-27", "Kurban Bayramı 1. Gün"],
    ["2026-05-28", "Kurban Bayramı 2. Gün"],
    ["2026-05-29", "Kurban Bayramı 3. Gün"],
    ["2026-05-30", "Kurban Bayramı 4. Gün"],
  ],
  2027: [
    ["2027-03-09", "Ramazan Bayramı Arefesi"],
    ["2027-03-10", "Ramazan Bayramı 1. Gün"],
    ["2027-03-11", "Ramazan Bayramı 2. Gün"],
    ["2027-03-12", "Ramazan Bayramı 3. Gün"],
    ["2027-05-16", "Kurban Bayramı Arefesi"],
    ["2027-05-17", "Kurban Bayramı 1. Gün"],
    ["2027-05-18", "Kurban Bayramı 2. Gün"],
    ["2027-05-19", "Kurban Bayramı 3. Gün"],
    ["2027-05-20", "Kurban Bayramı 4. Gün"],
  ],
};

function toDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function parseLocalDate(date: string) {
  return toDate(date);
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthName(month: number) {
  return monthNames[month - 1] ?? "";
}

export function addDays(date: string, amount: number) {
  const next = toDate(date);
  next.setDate(next.getDate() + amount);
  return toIso(next);
}

export function dayDiff(left: string, right: string) {
  return Math.round((toDate(left).getTime() - toDate(right).getTime()) / 86_400_000);
}

export function isBetween(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export function dateRange(year: number, month: number) {
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${String(month).padStart(2, "0")}-${day}`;
  });
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function formatDateAndDay(date: string) {
  const parsed = toDate(date);
  return `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${parsed.getFullYear()} ${dayNames[parsed.getDay()]}`;
}

export function getTurkeyHolidays(year: number, manual: PublicHoliday[] = []) {
  const fixed: PublicHoliday[] = [
    { id: `fixed-${year}-01-01`, date: `${year}-01-01`, name: "Yılbaşı", manual: false },
    { id: `fixed-${year}-04-23`, date: `${year}-04-23`, name: "Ulusal Egemenlik ve Çocuk Bayramı", manual: false },
    { id: `fixed-${year}-05-01`, date: `${year}-05-01`, name: "Emek ve Dayanışma Günü", manual: false },
    { id: `fixed-${year}-05-19`, date: `${year}-05-19`, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", manual: false },
    { id: `fixed-${year}-07-15`, date: `${year}-07-15`, name: "Demokrasi ve Milli Birlik Günü", manual: false },
    { id: `fixed-${year}-08-30`, date: `${year}-08-30`, name: "Zafer Bayramı", manual: false },
    { id: `fixed-${year}-10-29`, date: `${year}-10-29`, name: "Cumhuriyet Bayramı", manual: false },
  ];
  const religious = (religiousHolidays[year] ?? []).map(([date, name]) => ({ id: `religious-${date}`, date, name, manual: false }));
  const merged = new Map<string, PublicHoliday>();
  [...fixed, ...religious, ...manual].forEach((holiday) => merged.set(holiday.date, holiday));
  return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function isHoliday(date: string, holidays: PublicHoliday[]) {
  return holidays.some((holiday) => holiday.date === date);
}

export const isPublicHoliday = isHoliday;

export function isWeekendForCadre(date: string, cadre: Cadre) {
  const day = toDate(date).getDay();
  return cadre === "Memur" ? day === 0 || day === 6 : day === 0;
}

export function isOnLeave(staffId: string, date: string, leaves: LeaveRequest[]) {
  return leaves.some((leave) => leave.staffId === staffId && leave.startDate <= date && leave.endDate >= date);
}

function leaveCountsForWorkday(staff: Staff, date: string, leave: LeaveRequest, holidays: PublicHoliday[]) {
  if (staff.cadre === "4D İşçi" && leave.type === "Yıllık izin") {
    return !isWeekendForCadre(date, staff.cadre) && !isHoliday(date, holidays);
  }
  return true;
}

export function leaveDaysForStaff(staff: Staff, year: number, month: number, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  return dateRange(year, month).filter((date) =>
    leaves.some((leave) => leave.staffId === staff.id && leave.startDate <= date && leave.endDate >= date && leaveCountsForWorkday(staff, date, leave, holidays)),
  ).length;
}

export function workedDaysForStaff(staff: Staff, year: number, month: number, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  return dateRange(year, month).filter((date) => {
    if (isWeekendForCadre(date, staff.cadre) || isHoliday(date, holidays)) return false;
    return !leaves.some((leave) => leave.staffId === staff.id && leave.startDate <= date && leave.endDate >= date && leaveCountsForWorkday(staff, date, leave, holidays));
  }).length;
}

export function rawTargetDuties(staff: Staff, year: number, month: number, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  const workedDays = workedDaysForStaff(staff, year, month, holidays, leaves);
  return staff.cadre === "Memur" ? (workedDays * 8) / 24 : (workedDays * 7.5) / 11;
}

export function targetDuties(staff: Staff, year: number, month: number, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  if (typeof staff.manualTarget === "number") return staff.manualTarget;
  return Math.round(rawTargetDuties(staff, year, month, holidays, leaves));
}

export function targetHoursForStaff(staff: Staff, year: number, month: number, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  const target = targetDuties(staff, year, month, holidays, leaves);
  return staff.cadre === "Memur" ? target * 24 : target * 11;
}

function staffIdOf(staffOrId: Staff | string) {
  return typeof staffOrId === "string" ? staffOrId : staffOrId.id;
}

export function isAnnualLeavePrepBlocked(staffOrId: Staff | string, date: string, leaves: LeaveRequest[]) {
  const staffId = staffIdOf(staffOrId);
  return leaves.some((leave) => {
    if (leave.staffId !== staffId || leave.type !== "Yıllık izin") return false;
    return date >= addDays(leave.startDate, -3) && date < leave.startDate;
  });
}

export function preferredAnnualLeaveDutyDate(staffOrId: Staff | string, leaves: LeaveRequest[]): string | undefined;
export function preferredAnnualLeaveDutyDate(staffOrId: Staff | string, date: string, leaves: LeaveRequest[]): boolean;
export function preferredAnnualLeaveDutyDate(staffOrId: Staff | string, dateOrLeaves: string | LeaveRequest[], maybeLeaves?: LeaveRequest[]) {
  const staffId = staffIdOf(staffOrId);
  const leaves = Array.isArray(dateOrLeaves) ? dateOrLeaves : (maybeLeaves ?? []);
  const leave = leaves.find((item) => item.staffId === staffId && item.type === "Yıllık izin");
  if (!leave) return undefined;
  const preferredDate = leave.lastDutyDate || addDays(leave.startDate, -4);
  if (typeof dateOrLeaves === "string") return preferredDate === dateOrLeaves;
  return preferredDate;
}
