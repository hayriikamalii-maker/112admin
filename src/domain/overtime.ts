import { isBetween, monthName, rawTargetDuties, targetHoursForStaff, workedDaysForStaff } from "./date";
import { countAssignments, isExternallyAssigned } from "./rules";
import type { LeaveRequest, PublicHoliday, Schedule, Staff, StaffMonthlyAssignment, Station } from "./types";

export interface OvertimeRow {
  staff: Staff;
  stationName: string;
  year: number;
  month: number;
  workedDays: number;
  targetDuties: number;
  targetHours: number;
  scheduledDuties: number;
  scheduledHours: number;
  differenceHours: number;
  overtimeHours: number;
  annualLeaveBlocked: boolean;
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function hasAnnualLeaveWithoutOvertime(staffId: string, year: number, month: number, leaves: LeaveRequest[]) {
  const { start, end } = monthRange(year, month);
  return leaves.some((leave) => {
    if (leave.staffId !== staffId || leave.type !== "Yıllık izin" || leave.allowOvertime) return false;
    return isBetween(leave.startDate, start, end) || isBetween(leave.endDate, start, end) || isBetween(start, leave.startDate, leave.endDate);
  });
}

export function scheduledHoursForStaff(schedule: Schedule, staff: Staff) {
  return schedule.days.reduce((total, day) => {
    let nextTotal = total;
    if (day.chiefId === staff.id || day.yspId === staff.id) nextTotal += staff.cadre === "Memur" ? 24 : 11;
    if (day.fullDriverId === staff.id) nextTotal += staff.cadre === "Memur" ? 24 : 11;
    if (day.dayDriverId === staff.id) nextTotal += staff.cadre === "Memur" ? 12 : 11;
    if (day.nightDriverId === staff.id) nextTotal += staff.cadre === "Memur" ? 12 : 11;
    return nextTotal;
  }, 0);
}

export function buildOvertimeRows(params: {
  schedules: Schedule[];
  stations: Station[];
  staff: Staff[];
  leaves: LeaveRequest[];
  holidays: PublicHoliday[];
  monthlyAssignments?: StaffMonthlyAssignment[];
  year: number;
  month?: number;
  stationIds?: string[];
}) {
  const { schedules, stations, staff, leaves, holidays, monthlyAssignments = [], year, month, stationIds } = params;
  return schedules
    .filter((schedule) => schedule.year === year)
    .filter((schedule) => (month ? schedule.month === month : true))
    .filter((schedule) => (stationIds ? stationIds.includes(schedule.stationId) : true))
    .flatMap((schedule) => {
      const station = stations.find((item) => item.id === schedule.stationId);
      const stationStaff = staff
        .filter((person) => person.stationId === schedule.stationId)
        .filter((person) => !isExternallyAssigned(person.id, schedule.year, schedule.month, monthlyAssignments));
      return stationStaff.map((person): OvertimeRow => {
        const workedDays = workedDaysForStaff(person, schedule.year, schedule.month, holidays, leaves);
        const rawTarget = rawTargetDuties(person, schedule.year, schedule.month, holidays, leaves);
        const targetHours = targetHoursForStaff(person, schedule.year, schedule.month, holidays, leaves);
        const scheduledHours = scheduledHoursForStaff(schedule, person);
        const annualLeaveBlocked = hasAnnualLeaveWithoutOvertime(person.id, schedule.year, schedule.month, leaves);
        const differenceHours = scheduledHours - targetHours;
        const overtimeHours = person.cadre === "4D İşçi" || annualLeaveBlocked ? 0 : Math.max(0, differenceHours);
        return {
          staff: person,
          stationName: station?.name ?? "İstasyon",
          year: schedule.year,
          month: schedule.month,
          workedDays,
          targetDuties: rawTarget,
          targetHours,
          scheduledDuties: countAssignments(schedule.days, person.id),
          scheduledHours,
          differenceHours,
          overtimeHours,
          annualLeaveBlocked,
        };
      });
    })
    .sort(
      (left, right) =>
        left.stationName.localeCompare(right.stationName, "tr") ||
        left.month - right.month ||
        left.staff.fullName.localeCompare(right.staff.fullName, "tr"),
    );
}

export function overtimeReportTitle(year: number, month?: number) {
  return month ? `${year} ${monthName(month)} Fazla Mesai Raporu` : `${year} Yıllık Fazla Mesai Raporu`;
}
