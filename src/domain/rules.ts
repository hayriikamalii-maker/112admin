import { addDays, dayDiff, isAnnualLeavePrepBlocked, isOnLeave, preferredAnnualLeaveDutyDate, targetDuties } from "./date";
import type {
  AppUser,
  DutyRequest,
  DutyRole,
  DriverShift,
  LeaveRequest,
  PublicHoliday,
  RuleViolation,
  Schedule,
  ScheduleDay,
  Staff,
  StaffMonthlyAssignment,
  Station,
} from "./types";

function monthBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  return { start, end };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function roleLabel(role: DutyRole) {
  return {
    doctor: "Doktor",
    chief: "Ekip Şefi",
    ysp: "YSP",
    driver: "Sürücü",
  }[role];
}

export function canServeRole(staff: Staff, role: DutyRole, station?: Station) {
  if (!staff.active) return false;
  if (role !== "doctor" && staff.duties?.length) return staff.duties.includes(role);
  if (staff.title === "Doktor") return role === "chief" && station?.type === "A1";
  if (staff.title === "Sürücü" && staff.cadre === "4D İşçi") return role === "driver";
  if (staff.title === "ATT") return role === "ysp";
  if (staff.title === "Paramedik") return role === "chief" || role === "ysp";
  if (staff.title === "Sürücü ATT") return role === "ysp" || role === "driver";
  if (staff.title === "Sürücü Paramedik") return role === "chief" || role === "ysp" || role === "driver";
  if (staff.title === "Sürücü") return role === "driver";
  return false;
}

export function canServeDriverShift(staff: Staff, shift: DriverShift, station?: Station) {
  if (!canServeRole(staff, "driver", station)) return false;
  if (shift === "full") return staff.cadre === "Memur";
  return staff.cadre === "4D İşçi";
}

export function isAssigned(day: ScheduleDay, staffId: string) {
  return [day.chiefId, day.chiefSecondId, day.yspId, day.yspSecondId, day.dayDriverId, day.nightDriverId, day.fullDriverId].includes(staffId);
}

export function isExternallyAssigned(staffId: string, year: number, month: number, assignments: StaffMonthlyAssignment[]) {
  const { start, end } = monthBounds(year, month);
  return assignments.some((assignment) => {
    if (assignment.staffId !== staffId || assignment.returnedAt) return false;
    if (assignment.startDate || assignment.endDate || assignment.indefinite) {
      const assignmentStart = assignment.startDate ?? `${assignment.year}-${String(assignment.month).padStart(2, "0")}-01`;
      const assignmentEnd = assignment.indefinite ? "9999-12-31" : (assignment.endDate ?? "9999-12-31");
      return assignmentStart <= end && assignmentEnd >= start;
    }
    return assignment.year === year && assignment.month === month;
  });
}

export function activeAssignmentForStaff(staffId: string, assignments: StaffMonthlyAssignment[], date = today()) {
  return assignments.find((assignment) => {
    if (assignment.staffId !== staffId || assignment.returnedAt) return false;
    if (assignment.startDate || assignment.endDate || assignment.indefinite) {
      const assignmentStart = assignment.startDate ?? "0000-01-01";
      const assignmentEnd = assignment.indefinite ? "9999-12-31" : (assignment.endDate ?? "9999-12-31");
      return assignmentStart <= date && assignmentEnd >= date;
    }
    const { start, end } = monthBounds(assignment.year, assignment.month);
    return start <= date && end >= date;
  });
}

export function canAccessStaff(user: AppUser | undefined, staff: Staff) {
  if (user?.role === "admin") return true;
  return Boolean(user?.stationIds.includes(staff.stationId));
}

export function countAssignments(days: ScheduleDay[], staffId: string) {
  return days.reduce((total, day) => total + (isAssigned(day, staffId) ? 1 : 0), 0);
}

export function countShift(days: ScheduleDay[], staffId: string, shift: DriverShift) {
  return days.reduce((total, day) => {
    if (shift === "day") return total + (day.dayDriverId === staffId ? 1 : 0);
    if (shift === "night") return total + (day.nightDriverId === staffId ? 1 : 0);
    return total + (day.fullDriverId === staffId ? 1 : 0);
  }, 0);
}

function lastAssignedDate(days: ScheduleDay[], staffId: string) {
  return [...days].reverse().find((day) => isAssigned(day, staffId))?.date;
}

function isAssignedToRole(day: ScheduleDay, staffId: string, role: DutyRole) {
  if (role === "chief") return day.chiefId === staffId || day.chiefSecondId === staffId;
  if (role === "ysp") return day.yspId === staffId || day.yspSecondId === staffId;
  if (role === "driver") return day.dayDriverId === staffId || day.nightDriverId === staffId || day.fullDriverId === staffId;
  return false;
}

function countRoleAssignments(days: ScheduleDay[], staffId: string, role: DutyRole) {
  return days.reduce((total, day) => total + (isAssignedToRole(day, staffId, role) ? 1 : 0), 0);
}

function lastRoleAssignedDate(days: ScheduleDay[], staffId: string, role: DutyRole) {
  return [...days].reverse().find((day) => isAssignedToRole(day, staffId, role))?.date;
}

function consecutiveNightsBefore(days: ScheduleDay[], staffId: string, date: string) {
  let cursor = addDays(date, -1);
  let count = 0;
  while (days.some((day) => day.date === cursor && day.nightDriverId === staffId)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function previousScheduleDay(days: ScheduleDay[], date: string) {
  return days.find((day) => day.date === addDays(date, -1));
}

function previousDriverDates(days: ScheduleDay[], staffId: string, date: string) {
  return days
    .filter((day) => day.date < date && isAssignedToRole(day, staffId, "driver"))
    .map((day) => day.date)
    .sort((left, right) => right.localeCompare(left));
}

function violatesMemurDriverCycle(days: ScheduleDay[], staffId: string, date: string) {
  const [lastDriverDate, previousDriverDate] = previousDriverDates(days, staffId, date);
  if (!lastDriverDate || !previousDriverDate) return false;
  const lastGap = dayDiff(lastDriverDate, previousDriverDate);
  const currentGap = dayDiff(date, lastDriverDate);
  return lastGap === 2 && currentGap <= 2;
}

function hasRequiredRestBefore(days: ScheduleDay[], person: Staff, date: string, shift?: DriverShift) {
  const previousDay = previousScheduleDay(days, date);
  if (person.cadre === "Memur" && shift && violatesMemurDriverCycle(days, person.id, date)) return false;
  if (!previousDay) return true;
  if (person.cadre === "Memur") return !isAssigned(previousDay, person.id);
  if (person.cadre === "4D İşçi") {
    const twoDaysBefore = days.find((day) => day.date === addDays(date, -2));
    if (previousDay.nightDriverId === person.id && twoDaysBefore?.nightDriverId === person.id) return false;
    if (shift === "day" && previousDay.nightDriverId === person.id) return false;
  }
  return true;
}

function spacingTarget(month: number, person: Staff) {
  if (person.cadre === "Memur") return [6, 7, 8].includes(month) ? 5 : 4;
  return [6, 7, 8, 9].includes(month) ? 5 : 4;
}

function requestMatchesShift(request: DutyRequest, shift?: DriverShift) {
  if (!request.shiftPreference || request.shiftPreference === "full") return true;
  return Boolean(shift && request.shiftPreference === shift);
}

function requestForStaff(staffId: string, date: string, requests: DutyRequest[], type?: DutyRequest["type"], shift?: DriverShift) {
  return requests.find((request) => request.staffId === staffId && request.date === date && (!type || request.type === type) && requestMatchesShift(request, shift));
}

function ignoredAvoidRequestCount(days: ScheduleDay[], staffId: string, requests: DutyRequest[]) {
  return days.filter((day) => isAssigned(day, staffId) && requestForStaff(staffId, day.date, requests, "avoid", "full")).length;
}

function rolePriorityBonus(person: Staff, role: DutyRole, shift: DriverShift | undefined, count: number, target: number) {
  const needsDuty = count < target;
  if (role === "driver" && shift && person.cadre === "4D İşçi") {
    if (person.title === "Sürücü") return needsDuty ? -460 : -40;
    if (person.title === "Sürücü ATT") return needsDuty ? -420 : -32;
    if (person.title === "Sürücü Paramedik") return needsDuty ? -360 : -24;
  }
  if (role === "driver" && person.cadre === "Memur") {
    if (shift === "day" || shift === "night") return needsDuty ? 900 : 1_400;
    if (person.title === "Sürücü ATT") return needsDuty ? -380 : -34;
    if (person.title === "Sürücü") return needsDuty ? -340 : -28;
    if (person.title === "Sürücü Paramedik") return needsDuty ? -240 : -18;
  }
  if (role === "ysp") {
    if (person.title === "ATT") return needsDuty ? -620 : -160;
    if (person.title === "Paramedik") return needsDuty ? -260 : 260;
    if (person.title === "Sürücü Paramedik") return needsDuty ? -180 : 340;
    if (person.title === "Sürücü ATT") return needsDuty ? -120 : 420;
  }
  if (role === "chief") {
    if (person.title === "Doktor") return needsDuty ? -360 : -80;
    if (person.title === "Paramedik") return needsDuty ? -340 : -70;
    if (person.title === "Sürücü Paramedik") return needsDuty ? -300 : 650;
  }
  return 0;
}

function chooseStaff(params: {
  role: DutyRole;
  date: string;
  station: Station;
  staff: Staff[];
  leaves: LeaveRequest[];
  holidays: PublicHoliday[];
  monthlyAssignments: StaffMonthlyAssignment[];
  dutyRequests: DutyRequest[];
  days: ScheduleDay[];
  year: number;
  month: number;
  shift?: DriverShift;
}) {
  const { role, date, station, staff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month, shift } = params;
  const currentDay = days.find((day) => day.date === date);
  const buildCandidates = (allowExternalAssignment: boolean, allowAvoidRequest: boolean) =>
    staff
      .filter((person) => person.stationId === station.id)
      .filter((person) => canServeRole(person, role, station))
      .filter((person) => role !== "driver" || !shift || canServeDriverShift(person, shift, station))
      .filter((person) => allowExternalAssignment || !isExternallyAssigned(person.id, year, month, monthlyAssignments))
      .filter((person) => allowAvoidRequest || !requestForStaff(person.id, date, dutyRequests, "avoid", shift))
      .filter((person) => !isOnLeave(person.id, date, leaves))
      .filter((person) => !isAnnualLeavePrepBlocked(person, date, leaves))
      .filter((person) => !currentDay || !isAssigned(currentDay, person.id))
      .filter((person) => hasRequiredRestBefore(days, person, date, shift))
      .filter((person) => person.cadre !== "4D İşçi" || countAssignments(days, person.id) < targetDuties(person, year, month, holidays, leaves))
      .filter((person) => {
        if (shift !== "night") return true;
        return consecutiveNightsBefore(days, person.id, date) < 2;
      })
      .map((person) => {
        const target = targetDuties(person, year, month, holidays, leaves);
        const count = countAssignments(days, person.id);
        const roleCount = countRoleAssignments(days, person.id, role);
        const lastDate = lastAssignedDate(days, person.id);
        const lastRoleDate = lastRoleAssignedDate(days, person.id, role);
        const gap = lastDate ? dayDiff(date, lastDate) : 99;
        const roleGap = lastRoleDate ? dayDiff(date, lastRoleDate) : 99;
        const expectedGap = spacingTarget(month, person);
        const dayNumber = Number(date.slice(-2));
        const daysLeftIncludingToday = new Date(year, month, 0).getDate() - dayNumber + 1;
        const remainingDuties = Math.max(0, target - count);
        const daysInMonth = new Date(year, month, 0).getDate();
        const expectedProgress = target * ((dayNumber - 1) / daysInMonth);
        const dayNightBalance =
          shift === "night" ? countShift(days, person.id, "night") - countShift(days, person.id, "day") : 0;
        const dutyRequestPreference = requestForStaff(person.id, date, dutyRequests, "want", shift) ? -45 : 0;
        const ignoredAvoidPenalty = allowAvoidRequest && requestForStaff(person.id, date, dutyRequests, "avoid", shift)
          ? 450 + ignoredAvoidRequestCount(days, person.id, dutyRequests) * 300
          : 0;
        const remainingTargetBonus = Math.max(0, target - count) * (role === "driver" && person.cadre === "4D İşçi" ? -210 : -95);
        const overtimePenalty =
          count >= target
            ? person.overtimeAllowed
              ? Math.max(0, count - target) * 90
              : 3_000 + Math.max(0, count - target) * 600
            : 0;
        const gapPenalty = gap < expectedGap ? (expectedGap - gap) * 55 : 0;
        const roleGapPenalty = roleGap < expectedGap + 1 ? (expectedGap + 1 - roleGap) * 85 : 0;
        const compressedRolePenalty = roleGap <= 2 ? 240 : roleGap === 3 ? 90 : 0;
        const compressedDriverPenalty =
          role === "driver" && person.cadre === "4D İşçi"
            ? roleGap <= 1
              ? 2_400
              : roleGap === 2
                ? 1_400
                : roleGap === 3
                  ? 420
                  : 0
            : role === "driver" && person.cadre === "Memur"
              ? roleGap <= 2
                ? 950
                : roleGap === 3
                  ? 260
                  : 0
              : 0;
        const workerSpreadPressure =
          role === "driver" && person.cadre === "4D İşçi"
            ? (count - expectedProgress) * 520
            : 0;
        const memurDriverSpreadPressure =
          role === "driver" && person.cadre === "Memur"
            ? (count - expectedProgress) * 260
            : 0;
        const lateWorkerTargetUrgency =
          role === "driver" && person.cadre === "4D İşçi" && remainingDuties > 0
            ? Math.max(0, remainingDuties + 4 - daysLeftIncludingToday) * -850
            : 0;
        const monthSpreadPressure =
          role === "driver"
            ? person.cadre === "4D İşçi"
              ? 0
              : (count - expectedProgress) * 180
            : 0;
        const annualLeavePreference = preferredAnnualLeaveDutyDate(person, date, leaves) ? -30 : 0;
        const roleBonus = rolePriorityBonus(person, role, shift, count, target);
        return {
          person,
          roleGap,
          count,
          target,
          score:
            count * 10 +
            roleCount * 34 +
            remainingTargetBonus +
            overtimePenalty +
            gapPenalty +
            roleGapPenalty +
            compressedRolePenalty +
            compressedDriverPenalty +
            workerSpreadPressure +
            memurDriverSpreadPressure +
            lateWorkerTargetUrgency +
            monthSpreadPressure +
            dayNightBalance * 5 +
            dutyRequestPreference +
            ignoredAvoidPenalty +
            annualLeavePreference +
            roleBonus +
            person.fullName.localeCompare("ZZZ", "tr"),
        };
      })
      .sort((left, right) => left.score - right.score || left.person.fullName.localeCompare(right.person.fullName, "tr"));

  const pick = (candidates: ReturnType<typeof buildCandidates>) => {
    if (!(role === "driver" && shift && candidates.some((candidate) => candidate.person.cadre === "4D İşçi"))) return candidates[0]?.person;
    const workerCandidates = candidates.filter((candidate) => candidate.person.cadre === "4D İşçi");
    const wellSpaced = workerCandidates.filter((candidate) => candidate.roleGap >= 4);
    if (wellSpaced.length > 0) return wellSpaced[0].person;
    const acceptable = workerCandidates.filter((candidate) => candidate.roleGap >= 3);
    if (acceptable.length > 0) return acceptable[0].person;
    return candidates[0]?.person;
  };

  return pick(buildCandidates(false, false)) ?? pick(buildCandidates(false, true));
}

function chooseFullDriverByPriority(params: Omit<Parameters<typeof chooseStaff>[0], "staff" | "role" | "shift"> & { staff: Staff[] }) {
  const groups = [
    params.staff.filter((person) => person.cadre === "Memur" && person.title === "Sürücü ATT"),
    params.staff.filter((person) => person.cadre === "Memur" && person.title === "Sürücü"),
    params.staff.filter((person) => person.cadre === "Memur" && person.title === "Sürücü Paramedik"),
  ];
  for (const group of groups) {
    const selected = chooseStaff({ ...params, role: "driver", staff: group, shift: "full" });
    if (selected) return selected;
  }
  return undefined;
}

function shouldReserveSplitDriverForMemur(params: {
  date: string;
  station: Station;
  staff: Staff[];
  days: ScheduleDay[];
  holidays: PublicHoliday[];
  leaves: LeaveRequest[];
  monthlyAssignments: StaffMonthlyAssignment[];
  year: number;
  month: number;
}) {
  const { date, station, staff, days, holidays, leaves, monthlyAssignments, year, month } = params;
  const workers = staff
    .filter((person) => person.stationId === station.id && person.active && person.cadre === "4D İşçi" && canServeRole(person, "driver", station))
    .filter((person) => !isExternallyAssigned(person.id, year, month, monthlyAssignments));
  const memurDrivers = staff
    .filter((person) => person.stationId === station.id && person.active && person.cadre === "Memur" && canServeRole(person, "driver", station))
    .filter((person) => !isExternallyAssigned(person.id, year, month, monthlyAssignments));
  if (workers.length === 0 || memurDrivers.length === 0) return false;

  const dayNumber = Number(date.slice(-2));
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthProgress = (dayNumber - 1) / daysInMonth;
  const workerTarget = workers.reduce((total, person) => total + targetDuties(person, year, month, holidays, leaves), 0);
  const workerWritten = workers.reduce((total, person) => total + countAssignments(days, person.id), 0);
  const expectedWorkerWritten = workerTarget * monthProgress;
  return workerWritten >= expectedWorkerWritten + 1.5;
}

function canAssignDriverOnRepair(params: {
  day: ScheduleDay;
  person: Staff;
  shift: "day" | "night";
  station: Station;
  days: ScheduleDay[];
  leaves: LeaveRequest[];
  monthlyAssignments: StaffMonthlyAssignment[];
  year: number;
  month: number;
}) {
  const { day, person, shift, station, days, leaves, monthlyAssignments, year, month } = params;
  if (!canServeRole(person, "driver", station)) return false;
  if (isAssigned(day, person.id)) return false;
  if (isOnLeave(person.id, day.date, leaves)) return false;
  if (isAnnualLeavePrepBlocked(person, day.date, leaves)) return false;
  if (isExternallyAssigned(person.id, year, month, monthlyAssignments)) return false;
  if (!hasRequiredRestBefore(days, person, day.date, shift)) return false;
  if (shift === "night" && consecutiveNightsBefore(days, person.id, day.date) >= 2) return false;
  return true;
}

function driverRepairSpreadPenalty(worker: Staff, date: string, days: ScheduleDay[], year: number, month: number, target: number) {
  const dayNumber = Number(date.slice(-2));
  const daysInMonth = new Date(year, month, 0).getDate();
  const writtenBeforeDate = days.filter((day) => day.date < date && isAssignedToRole(day, worker.id, "driver")).length;
  const expectedBeforeDate = target * ((dayNumber - 1) / daysInMonth);
  const driverDates = days.filter((day) => isAssignedToRole(day, worker.id, "driver")).map((day) => day.date);
  const nearestGap = driverDates.length > 0 ? Math.min(...driverDates.map((assignedDate) => Math.abs(dayDiff(date, assignedDate)))) : 99;
  const gapPenalty = nearestGap <= 1 ? 2_400 : nearestGap === 2 ? 1_200 : nearestGap === 3 ? 360 : 0;
  const latePenalty = writtenBeforeDate < expectedBeforeDate - 0.75 ? -650 : 0;
  const earlyPenalty = writtenBeforeDate > expectedBeforeDate + 0.75 ? 650 : 0;
  return gapPenalty + latePenalty + earlyPenalty;
}

function repairUnderTargetWorkerDrivers(params: {
  station: Station;
  staff: Staff[];
  leaves: LeaveRequest[];
  holidays: PublicHoliday[];
  monthlyAssignments: StaffMonthlyAssignment[];
  dutyRequests: DutyRequest[];
  days: ScheduleDay[];
  year: number;
  month: number;
}) {
  const { station, staff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month } = params;
  const workers = staff
    .filter((person) => person.stationId === station.id && person.active && person.cadre === "4D İşçi" && canServeRole(person, "driver", station))
    .filter((person) => !isExternallyAssigned(person.id, year, month, monthlyAssignments))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "tr"));

  for (const worker of workers) {
    let missing = targetDuties(worker, year, month, holidays, leaves) - countAssignments(days, worker.id);
    while (missing > 0) {
      const workerTarget = targetDuties(worker, year, month, holidays, leaves);
      const candidate = days
        .map((day) => {
          const dayMemur = day.dayDriverId ? staff.find((person) => person.id === day.dayDriverId && person.cadre === "Memur") : undefined;
          const nightMemur = day.nightDriverId ? staff.find((person) => person.id === day.nightDriverId && person.cadre === "Memur") : undefined;
          const dayWorker = day.dayDriverId ? workers.find((person) => person.id === day.dayDriverId && person.id !== worker.id) : undefined;
          const nightWorker = day.nightDriverId ? workers.find((person) => person.id === day.nightDriverId && person.id !== worker.id) : undefined;
          const fullMemur = day.fullDriverId ? staff.find((person) => person.id === day.fullDriverId && person.cadre === "Memur") : undefined;
          const options: Array<{ shift: "day" | "night"; replacedMemurId?: string; pairWorkerId?: string; fromFull?: boolean; score: number }> = [];
          const spreadPenalty = driverRepairSpreadPenalty(worker, day.date, days, year, month, workerTarget);
          if (!day.dayDriverId && canAssignDriverOnRepair({ day, person: worker, shift: "day", station, days, leaves, monthlyAssignments, year, month })) {
            const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "day") ? 1 : 0;
            options.push({ shift: "day", score: strictAvoid * 10_000 + spreadPenalty - 1_200 });
          }
          if (!day.nightDriverId && canAssignDriverOnRepair({ day, person: worker, shift: "night", station, days, leaves, monthlyAssignments, year, month })) {
            const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "night") ? 1 : 0;
            options.push({ shift: "night", score: strictAvoid * 10_000 + spreadPenalty - 1_100 });
          }
          if ((dayMemur || (dayWorker && countAssignments(days, dayWorker.id) > targetDuties(dayWorker, year, month, holidays, leaves))) && canAssignDriverOnRepair({ day, person: worker, shift: "day", station, days, leaves, monthlyAssignments, year, month })) {
            const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "day") ? 1 : 0;
            const replaced = dayMemur ?? dayWorker;
            const replacedOverTarget = replaced ? countAssignments(days, replaced.id) - targetDuties(replaced, year, month, holidays, leaves) : 0;
            options.push({ shift: "day", replacedMemurId: replaced?.id, score: strictAvoid * 10_000 + spreadPenalty - Math.max(0, replacedOverTarget) * 1_200 + (replaced?.cadre === "Memur" ? -500 : 0) });
          }
          if ((nightMemur || (nightWorker && countAssignments(days, nightWorker.id) > targetDuties(nightWorker, year, month, holidays, leaves))) && canAssignDriverOnRepair({ day, person: worker, shift: "night", station, days, leaves, monthlyAssignments, year, month })) {
            const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "night") ? 1 : 0;
            const replaced = nightMemur ?? nightWorker;
            const replacedOverTarget = replaced ? countAssignments(days, replaced.id) - targetDuties(replaced, year, month, holidays, leaves) : 0;
            options.push({ shift: "night", replacedMemurId: replaced?.id, score: strictAvoid * 10_000 + spreadPenalty - Math.max(0, replacedOverTarget) * 1_200 + (replaced?.cadre === "Memur" ? -500 : 0) });
          }
          if (fullMemur) {
            if (canAssignDriverOnRepair({ day, person: worker, shift: "day", station, days, leaves, monthlyAssignments, year, month })) {
              const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "day") ? 1 : 0;
              const pairWorker = workers
                .filter((person) => person.id !== worker.id && countAssignments(days, person.id) < targetDuties(person, year, month, holidays, leaves))
                .find((person) => canAssignDriverOnRepair({ day, person, shift: "night", station, days, leaves, monthlyAssignments, year, month }));
              if (pairWorker) {
                options.push({
                  shift: "day",
                  replacedMemurId: fullMemur.id,
                  pairWorkerId: pairWorker.id,
                  fromFull: true,
                  score: strictAvoid * 10_000 + spreadPenalty - 450 + countAssignments(days, fullMemur.id) * -30,
                });
              }
            }
            if (canAssignDriverOnRepair({ day, person: worker, shift: "night", station, days, leaves, monthlyAssignments, year, month })) {
              const strictAvoid = requestForStaff(worker.id, day.date, dutyRequests, "avoid", "night") ? 1 : 0;
              const pairWorker = workers
                .filter((person) => person.id !== worker.id && countAssignments(days, person.id) < targetDuties(person, year, month, holidays, leaves))
                .find((person) => canAssignDriverOnRepair({ day, person, shift: "day", station, days, leaves, monthlyAssignments, year, month }));
              if (pairWorker) {
                options.push({
                  shift: "night",
                  replacedMemurId: fullMemur.id,
                  pairWorkerId: pairWorker.id,
                  fromFull: true,
                  score: strictAvoid * 10_000 + spreadPenalty - 450 + countAssignments(days, fullMemur.id) * -30,
                });
              }
            }
          }
          return options.map((option) => ({ day, ...option }));
        })
        .flat()
        .sort((left, right) => left.score - right.score)[0];

      if (!candidate) break;
      if (candidate.fromFull && candidate.replacedMemurId && candidate.pairWorkerId) {
        candidate.day.fullDriverId = undefined;
        if (candidate.shift === "day") {
          candidate.day.dayDriverId = worker.id;
          candidate.day.nightDriverId = candidate.pairWorkerId;
        } else {
          candidate.day.dayDriverId = candidate.pairWorkerId;
          candidate.day.nightDriverId = worker.id;
        }
      } else if (candidate.shift === "day") {
        candidate.day.dayDriverId = worker.id;
      } else {
        candidate.day.nightDriverId = worker.id;
      }
      missing -= 1;
    }
  }
}

type AssignmentField = Exclude<keyof ScheduleDay, "date">;

function preferredRolesForTargetRepair(person: Staff): Array<{ role: DutyRole; field: AssignmentField; shift?: DriverShift }> {
  if (person.title === "Doktor") return [{ role: "chief", field: "chiefId" }];
  if (person.title === "Paramedik") return [{ role: "chief", field: "chiefId" }, { role: "ysp", field: "yspId" }];
  if (person.title === "ATT") return [{ role: "ysp", field: "yspId" }];
  if (person.title === "Sürücü ATT") {
    return person.cadre === "Memur"
      ? [{ role: "ysp", field: "yspId" }, { role: "driver", field: "fullDriverId", shift: "full" }]
      : [{ role: "ysp", field: "yspId" }];
  }
  if (person.title === "Sürücü Paramedik") {
    return person.cadre === "Memur"
      ? [{ role: "chief", field: "chiefId" }, { role: "driver", field: "fullDriverId", shift: "full" }, { role: "ysp", field: "yspId" }]
      : [{ role: "chief", field: "chiefId" }, { role: "ysp", field: "yspId" }];
  }
  if (person.title === "Sürücü" && person.cadre === "Memur") return [{ role: "driver", field: "fullDriverId", shift: "full" }];
  return [];
}

function canAssignRoleOnRepair(params: {
  day: ScheduleDay;
  person: Staff;
  role: DutyRole;
  shift?: DriverShift;
  station: Station;
  days: ScheduleDay[];
  leaves: LeaveRequest[];
  monthlyAssignments: StaffMonthlyAssignment[];
  year: number;
  month: number;
}) {
  const { day, person, role, shift, station, days, leaves, monthlyAssignments, year, month } = params;
  if (!canServeRole(person, role, station)) return false;
  if (role === "driver" && shift && !canServeDriverShift(person, shift, station)) return false;
  if (role === "driver" && shift === "full" && (day.dayDriverId || day.nightDriverId)) return false;
  if (role === "driver" && shift !== "full" && day.fullDriverId) return false;
  if (isAssigned(day, person.id)) return false;
  if (isOnLeave(person.id, day.date, leaves)) return false;
  if (isAnnualLeavePrepBlocked(person, day.date, leaves)) return false;
  if (isExternallyAssigned(person.id, year, month, monthlyAssignments)) return false;
  if (!hasRequiredRestBefore(days, person, day.date, shift)) return false;
  return true;
}

function repairUnderTargetRoleAssignments(params: {
  station: Station;
  staff: Staff[];
  leaves: LeaveRequest[];
  holidays: PublicHoliday[];
  monthlyAssignments: StaffMonthlyAssignment[];
  dutyRequests: DutyRequest[];
  days: ScheduleDay[];
  year: number;
  month: number;
}) {
  const { station, staff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month } = params;
  const activeStaff = staff
    .filter((person) => person.stationId === station.id && person.active)
    .filter((person) => station.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, year, month, monthlyAssignments));

  const targetOf = (person: Staff) => targetDuties(person, year, month, holidays, leaves);
  const missingStaff = () =>
    activeStaff
      .map((person) => ({ person, missing: targetOf(person) - countAssignments(days, person.id) }))
      .filter((item) => item.missing > 0)
      .sort((left, right) => right.missing - left.missing || left.person.fullName.localeCompare(right.person.fullName, "tr"));

  let changed = true;
  let guard = 0;
  while (changed && guard < 250) {
    changed = false;
    guard += 1;
    for (const { person } of missingStaff()) {
      const repairRoles = preferredRolesForTargetRepair(person);
      let replacement:
        | {
            day: ScheduleDay;
            field: AssignmentField;
            replacedStaffId?: string;
            score: number;
          }
        | undefined;

      for (const { role, field, shift } of repairRoles) {
        const candidate = days
          .map((day) => {
            if (!canAssignRoleOnRepair({ day, person, role, shift, station, days, leaves, monthlyAssignments, year, month })) return undefined;
            const replacedStaffId = day[field];
            const replacedStaff = typeof replacedStaffId === "string" ? activeStaff.find((item) => item.id === replacedStaffId) : undefined;
            const replacedOverTarget = replacedStaff ? countAssignments(days, replacedStaff.id) - targetOf(replacedStaff) : 0;
            if (replacedStaff && replacedOverTarget <= 0) return undefined;
            const avoidPenalty = requestForStaff(person.id, day.date, dutyRequests, "avoid", shift) ? 10_000 : 0;
            const wantBonus = requestForStaff(person.id, day.date, dutyRequests, "want", shift) ? -350 : 0;
            return {
              day,
              field,
              replacedStaffId: typeof replacedStaffId === "string" ? replacedStaffId : undefined,
              score: avoidPenalty + wantBonus - Math.max(0, replacedOverTarget) * 900 + countAssignments(days, person.id) * 30,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .sort((left, right) => left.score - right.score)[0];
        if (!replacement || (candidate && candidate.score < replacement.score)) replacement = candidate;
      }

      if (replacement) {
        replacement.day[replacement.field] = person.id;
        if (replacement.field === "fullDriverId") {
          replacement.day.dayDriverId = undefined;
          replacement.day.nightDriverId = undefined;
        }
        changed = true;
      }
    }
  }
}

function isRequestSatisfied(day: ScheduleDay | undefined, request: DutyRequest) {
  if (!day) return false;
  if (!request.shiftPreference || request.shiftPreference === "full") return isAssigned(day, request.staffId);
  if (request.shiftPreference === "day") return day.dayDriverId === request.staffId || day.fullDriverId === request.staffId;
  if (request.shiftPreference === "night") return day.nightDriverId === request.staffId || day.fullDriverId === request.staffId;
  return isAssigned(day, request.staffId);
}

export function generateSchedule(params: {
  station: Station;
  staff: Staff[];
  leaves: LeaveRequest[];
  holidays: PublicHoliday[];
  monthlyAssignments: StaffMonthlyAssignment[];
  dutyRequests?: DutyRequest[];
  year: number;
  month: number;
}) {
  const { station, staff, leaves, holidays, monthlyAssignments, dutyRequests = [], year, month } = params;
  const eligibleStaff = staff
    .filter((person) => person.stationId === station.id && person.active)
    .filter((person) => station.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, year, month, monthlyAssignments));
  const dates = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });

  const days: ScheduleDay[] = dates.map((date) => ({ date }));

  for (const day of days) {
    const reserveSplitForMemur = shouldReserveSplitDriverForMemur({
      date: day.date,
      station,
      staff: eligibleStaff,
      days,
      holidays,
      leaves,
      monthlyAssignments,
      year,
      month,
    });
    let finalDayDriver: Staff | undefined;
    let nightDriver: Staff | undefined;

    if (!reserveSplitForMemur) {
      finalDayDriver = chooseStaff({
        role: "driver",
        date: day.date,
        station,
        staff: eligibleStaff.filter((person) => person.cadre === "4D İşçi"),
        leaves,
        holidays,
        monthlyAssignments,
        dutyRequests,
        days,
        year,
        month,
        shift: "day",
      });
      day.dayDriverId = finalDayDriver?.id;
      nightDriver = chooseStaff({
        role: "driver",
        date: day.date,
        station,
        staff: eligibleStaff.filter((person) => person.cadre === "4D İşçi"),
        leaves,
        holidays,
        monthlyAssignments,
        dutyRequests,
        days,
        year,
        month,
        shift: "night",
      });
      day.nightDriverId = nightDriver?.id;
    }

    let fullDriver =
      finalDayDriver && nightDriver
        ? undefined
        : chooseFullDriverByPriority({
            date: day.date,
            station,
            staff: eligibleStaff,
            leaves,
            holidays,
            monthlyAssignments,
            dutyRequests,
            days,
            year,
            month,
          });
    if (!fullDriver && (!finalDayDriver || !nightDriver)) {
      fullDriver = chooseFullDriverByPriority({
        date: day.date,
        station,
        staff: eligibleStaff,
        leaves,
        holidays,
        monthlyAssignments,
        dutyRequests,
        days,
        year,
        month,
      });
    }

    if (fullDriver && (!finalDayDriver || !nightDriver)) {
      day.fullDriverId = fullDriver.id;
      day.dayDriverId = undefined;
      day.nightDriverId = undefined;
    } else {
      day.dayDriverId = finalDayDriver?.id;
      day.nightDriverId = nightDriver?.id;
    }

    const chiefStaff = eligibleStaff.filter((person) => canServeRole(person, "chief", station));
    const yspStaff = eligibleStaff.filter((person) => canServeRole(person, "ysp", station));
    day.chiefId = chooseStaff({ role: "chief", date: day.date, station, staff: chiefStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
    day.yspId = chooseStaff({ role: "ysp", date: day.date, station, staff: yspStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
  }

  repairUnderTargetWorkerDrivers({ station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month });
  repairUnderTargetRoleAssignments({ station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month });

  // Son güvenlik geçişi: boş kalan zorunlu rolleri, dış görevlendirme/izin/
  // dinlenme ve kadro kurallarını bozmadan yeniden dener. Personel isteği bu
  // aşamada yumuşak kuraldır; eşit feragat puanı chooseStaff içinde uygulanır.
  for (const day of days) {
    if (!day.chiefId) {
      day.chiefId = chooseStaff({ role: "chief", date: day.date, station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
    }
    if (!day.yspId) {
      day.yspId = chooseStaff({ role: "ysp", date: day.date, station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
    }
    if (!day.fullDriverId && (!day.dayDriverId || !day.nightDriverId)) {
      const fullDriver = chooseFullDriverByPriority({ date: day.date, station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month });
      if (fullDriver) {
        day.fullDriverId = fullDriver.id;
        day.dayDriverId = undefined;
        day.nightDriverId = undefined;
      } else {
        if (!day.dayDriverId) day.dayDriverId = chooseStaff({ role: "driver", shift: "day", date: day.date, station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
        if (!day.nightDriverId) day.nightDriverId = chooseStaff({ role: "driver", shift: "night", date: day.date, station, staff: eligibleStaff, leaves, holidays, monthlyAssignments, dutyRequests, days, year, month })?.id;
      }
    }
  }

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    stationId: station.id,
    year,
    month,
    createdAt: now,
    updatedAt: now,
    days,
    autoSnapshot: structuredClone(days),
  } satisfies Schedule;
}

export function validateSchedule(
  schedule: Schedule,
  station: Station,
  staff: Staff[],
  leaves: LeaveRequest[],
  monthlyAssignments: StaffMonthlyAssignment[] = [],
  dutyRequests: DutyRequest[] = [],
  holidays: PublicHoliday[] = [],
) {
  const violations: RuleViolation[] = [];
  const byId = new Map(staff.map((person) => [person.id, person]));

  for (const day of schedule.days) {
    const sameSplitDriverId = day.dayDriverId && day.dayDriverId === day.nightDriverId ? day.dayDriverId : undefined;
    const sameSplitDriver = sameSplitDriverId ? byId.get(sameSplitDriverId) : undefined;
    const checks: Array<[keyof ScheduleDay, DutyRole, DriverShift | undefined]> = [
      ["chiefId", "chief", undefined],
      ["chiefSecondId", "chief", undefined],
      ["yspId", "ysp", undefined],
      ["yspSecondId", "ysp", undefined],
    ];
    if (day.fullDriverId) {
      checks.push(["fullDriverId", "driver", "full"]);
    } else if (sameSplitDriverId && sameSplitDriver?.cadre === "Memur") {
      checks.push(["dayDriverId", "driver", "full"]);
    } else {
      checks.push(["dayDriverId", "driver", "day"], ["nightDriverId", "driver", "night"]);
    }
    const assigned = new Map<string, number>();

    if (day.fullDriverId && (day.dayDriverId || day.nightDriverId)) {
      violations.push({
        id: crypto.randomUUID(),
        severity: "critical",
        date: day.date,
        message: "24 saat sürücü seçiliyken aynı gün ayrıca gündüz/gece sürücüsü yazılamaz.",
      });
    }
    if (sameSplitDriverId && sameSplitDriver?.cadre === "4D İşçi") {
      violations.push({
        id: crypto.randomUUID(),
        severity: "critical",
        date: day.date,
        staffId: sameSplitDriverId,
        message: `${sameSplitDriver.fullName} 4D işçi olduğu için aynı gün gündüz ve gece yazılamaz.`,
      });
    }

    for (const [field, role, shift] of checks) {
      const staffId = day[field];
      if (!staffId || typeof staffId !== "string") continue;
      const person = byId.get(staffId);
      if (!person) continue;
      if (sameSplitDriverId && staffId === sameSplitDriverId && role === "driver") {
        assigned.set(staffId, Math.max(assigned.get(staffId) ?? 0, 1));
      } else {
        assigned.set(staffId, (assigned.get(staffId) ?? 0) + 1);
      }
      if (!canServeRole(person, role, station)) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message: `${person.fullName}, ${roleLabel(role)} görevi için uygun değil.`,
        });
      }
      if (role === "driver" && shift && !canServeDriverShift(person, shift, station)) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message:
            shift === "full"
              ? `${person.fullName} 4D işçi olduğu için 24 saat sürücü yazılamaz.`
              : `${person.fullName} memur olduğu için gündüz/gece 12 saat sürücü yazılamaz; 24 saat sürücü seçilmelidir.`,
        });
      }
      if (!hasRequiredRestBefore(schedule.days, person, day.date, shift)) {
        const memurDriverCycleViolation = person.cadre === "Memur" && Boolean(shift) && violatesMemurDriverCycle(schedule.days, person.id, day.date);
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message:
            memurDriverCycleViolation
              ? `${person.fullName} sürücü nöbetinde 1 nöbet + 1 boş + 1 nöbet sonrası en az 2 gün boş bırakılmadan yazılmış.`
              : person.cadre === "Memur"
              ? `${person.fullName} 24 saat nöbetten sonra en az 1 gün boş bırakılmadan yazılmış.`
              : `${person.fullName} gece nöbetinden sonraki gün gündüz nöbetine yazılmış.`,
        });
      }
      if (isOnLeave(staffId, day.date, leaves)) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message: `${person.fullName} izinli olduğu gün nöbete yazılmış.`,
        });
      }
      if (isExternallyAssigned(staffId, schedule.year, schedule.month, monthlyAssignments)) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message: `${person.fullName} görevlendirmede olduğu için kendi istasyonunun nöbet listesine yazılamaz.`,
        });
      }
      if (requestForStaff(staffId, day.date, dutyRequests, "avoid", shift)) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "warning",
          date: day.date,
          staffId,
          message: `${person.fullName} bu güne ${shift === "day" ? "gündüz" : shift === "night" ? "gece" : "tam gün"} nöbet istemiyor olarak işaretlenmiş; 4D hedefi/kadro dengesi nedeniyle yazıldı.`,
        });
      }
    }

    for (const [staffId, count] of assigned) {
      if (count > 1) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId,
          message: `${byId.get(staffId)?.fullName} aynı gün birden fazla göreve yazılmış.`,
        });
      }
    }

    if (!day.chiefId) violations.push({ id: crypto.randomUUID(), severity: "warning", date: day.date, message: "Ekip şefi boş." });
    if (!day.yspId) violations.push({ id: crypto.randomUUID(), severity: "warning", date: day.date, message: "YSP boş." });
    if (day.chiefSecondId && (!day.chiefStartTime || !day.chiefEndTime || !day.chiefSecondStartTime || !day.chiefSecondEndTime)) {
      violations.push({ id: crypto.randomUUID(), severity: "critical", date: day.date, message: "Bölünmüş ekip şefi vardiyasının başlangıç ve bitiş saatleri eksik." });
    }
    if (day.yspSecondId && (!day.yspStartTime || !day.yspEndTime || !day.yspSecondStartTime || !day.yspSecondEndTime)) {
      violations.push({ id: crypto.randomUUID(), severity: "critical", date: day.date, message: "Bölünmüş YSP vardiyasının başlangıç ve bitiş saatleri eksik." });
    }
    if (!day.fullDriverId && (!day.dayDriverId || !day.nightDriverId)) {
      violations.push({ id: crypto.randomUUID(), severity: "warning", date: day.date, message: "Sürücü görevi eksik." });
    }
  }

  for (const person of staff.filter((item) => item.stationId === station.id)) {
    for (const day of schedule.days) {
      if (consecutiveNightsBefore(schedule.days, person.id, addDays(day.date, 1)) > 2) {
        violations.push({
          id: crypto.randomUUID(),
          severity: "critical",
          date: day.date,
          staffId: person.id,
          message: `${person.fullName} arka arkaya 2 geceden fazla yazılmış.`,
        });
      }
      if (day.nightDriverId === person.id && addDays(day.date, 1)) {
        const nextDay = schedule.days.find((item) => item.date === addDays(day.date, 1));
        const prevDay = schedule.days.find((item) => item.date === addDays(day.date, -1));
        if (prevDay?.nightDriverId === person.id && nextDay && isAssigned(nextDay, person.id)) {
          violations.push({
            id: crypto.randomUUID(),
            severity: "warning",
            date: nextDay.date,
            staffId: person.id,
            message: `${person.fullName} iki gece sonrası boş bırakılmamış.`,
          });
        }
      }
    }
  }

  for (const person of staff.filter((item) => item.stationId === station.id && item.active && !isExternallyAssigned(item.id, schedule.year, schedule.month, monthlyAssignments))) {
    const target = targetDuties(person, schedule.year, schedule.month, holidays, leaves);
    const written = countAssignments(schedule.days, person.id);
    if (written < target) {
      violations.push({
        id: crypto.randomUUID(),
        severity: "warning",
        staffId: person.id,
        message: `${person.fullName} hedef nöbet sayısına ulaşmadı. Hedef: ${target}, yazılan: ${written}.`,
      });
    }
    if (person.cadre === "4D İşçi" && written > target) {
      violations.push({
        id: crypto.randomUUID(),
        severity: "critical",
        staffId: person.id,
        message: `${person.fullName} 4D işçi olduğu için hedef üstü nöbet yazılamaz. Hedef: ${target}, yazılan: ${written}.`,
      });
    } else if (!person.overtimeAllowed && written > target) {
      violations.push({
        id: crypto.randomUUID(),
        severity: "warning",
        staffId: person.id,
        message: `${person.fullName} fazla mesai istemiyor; hedef ${target}, yazılan ${written}.`,
      });
    }
  }

  for (const request of dutyRequests.filter((item) => item.stationId === station.id && item.type === "want")) {
    const day = schedule.days.find((item) => item.date === request.date);
    if (day && !isRequestSatisfied(day, request)) {
      violations.push({
        id: crypto.randomUUID(),
        severity: "warning",
        date: request.date,
        staffId: request.staffId,
        message: `${byId.get(request.staffId)?.fullName ?? "Personel"} bu güne nöbet istiyor; izin/dinlenme/hedef dengesi nedeniyle karşılanmadı.`,
      });
    }
  }

  return violations;
}

export function dutySummary(schedule: Schedule, staff: Staff[]) {
  return staff.map((person) => ({
    staff: person,
    total: countAssignments(schedule.days, person.id),
    day: countShift(schedule.days, person.id, "day"),
    night: countShift(schedule.days, person.id, "night"),
    full: countShift(schedule.days, person.id, "full"),
  }));
}
