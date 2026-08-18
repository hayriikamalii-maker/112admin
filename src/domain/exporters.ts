import { formatDateAndDay, isHoliday, monthName, parseLocalDate, targetHoursForStaff, workedDaysForStaff, rawTargetDuties } from "./date";
import type { OvertimeRow } from "./overtime";
import { dutySummary } from "./rules";
import type { DriverShift, DutyRequest, LeaveRequest, PublicHoliday, Schedule, ScheduleDay, Staff, Station } from "./types";

function staffName(staff: Staff[], id?: string) {
  return staff.find((person) => person.id === id)?.fullName ?? "";
}

function title(station: Station, schedule: Schedule) {
  return `${station.name} ${schedule.year} ${monthName(schedule.month)} Nöbet Çizelgesi`;
}

function headers(_station: Station) {
  return ["Tarih ve Gün", "Ekip Şefi", "YSP", "Gündüz Sürücü", "Gece Sürücü"];
}

function fileBase(station: Station, schedule: Schedule) {
  return `${station.name}-${schedule.year}-${monthName(schedule.month)}-nobet-cizelgesi`
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function driverShiftLabel(shift?: DriverShift) {
  if (shift === "day") return "Gündüz";
  if (shift === "night") return "Gece";
  return "Tam gün";
}

function requestAssignedOnShift(day: ScheduleDay | undefined, staffId: string, shift?: DriverShift) {
  if (!day) return false;
  if (shift === "day") return day.dayDriverId === staffId || day.fullDriverId === staffId;
  if (shift === "night") return day.nightDriverId === staffId || day.fullDriverId === staffId;
  return [day.chiefId, day.chiefSecondId, day.yspId, day.yspSecondId, day.dayDriverId, day.nightDriverId, day.fullDriverId].includes(staffId);
}

function unmetRequestRows(schedule: Schedule, staff: Staff[], station: Station, dutyRequests: DutyRequest[]) {
  const stationStaffIds = new Set(staff.filter((person) => person.stationId === station.id).map((person) => person.id));
  const rows = dutyRequests
    .filter((request) => request.stationId === station.id && request.date.startsWith(`${schedule.year}-${String(schedule.month).padStart(2, "0")}`))
    .filter((request) => stationStaffIds.has(request.staffId))
    .flatMap((request) => {
      const day = schedule.days.find((item) => item.date === request.date);
      const assigned = requestAssignedOnShift(day, request.staffId, request.shiftPreference);
      if (request.type === "want" && assigned) return [];
      if (request.type === "avoid" && !assigned) return [];
      const person = staff.find((item) => item.id === request.staffId);
      const reason =
        request.type === "avoid"
          ? "4D personelin hedef nöbeti, dinlenme kuralları veya kadro dengesi için bu istek aşıldı."
          : "İzin, rapor, dinlenme, hedef nöbet veya kadro dengesi nedeniyle bu istek yazılamadı.";
      return [
        `<tr>
<td>${escapeHtml(person?.fullName ?? "")}</td>
<td>${escapeHtml(formatDateAndDay(request.date))}</td>
<td>${escapeHtml(request.type === "avoid" ? "Nöbet istemiyor" : "Nöbet istiyor")}</td>
<td>${escapeHtml(driverShiftLabel(request.shiftPreference))}</td>
<td>${escapeHtml(reason)}</td>
</tr>`,
      ];
    });
  if (rows.length === 0) return `<tr><td colspan="5">Karşılanmayan istek yok.</td></tr>`;
  return rows.join("");
}

function tableRows(_station: Station, schedule: Schedule, staff: Staff[], holidays: PublicHoliday[]) {
  return schedule.days
    .map((day) => {
      const holidayClass = isHoliday(day.date, holidays) ? "holiday" : parseLocalDate(day.date).getDay() % 6 === 0 ? "weekend" : "";
      const holidayText = isHoliday(day.date, holidays) ? " - Resmi Tatil" : "";
      const cells = [`<td>${escapeHtml(formatDateAndDay(day.date))}${holidayText}</td>`];
      const chiefText = day.chiefSecondId
        ? `${staffName(staff, day.chiefId)} (${day.chiefStartTime}–${day.chiefEndTime}) / ${staffName(staff, day.chiefSecondId)} (${day.chiefSecondStartTime}–${day.chiefSecondEndTime})`
        : staffName(staff, day.chiefId);
      const yspText = day.yspSecondId
        ? `${staffName(staff, day.yspId)} (${day.yspStartTime}–${day.yspEndTime}) / ${staffName(staff, day.yspSecondId)} (${day.yspSecondStartTime}–${day.yspSecondEndTime})`
        : staffName(staff, day.yspId);
      cells.push(`<td>${escapeHtml(chiefText)}</td>`);
      cells.push(`<td>${escapeHtml(yspText)}</td>`);
      if (day.fullDriverId || (day.dayDriverId && day.dayDriverId === day.nightDriverId)) {
        cells.push(`<td colspan="2">${escapeHtml(staffName(staff, day.fullDriverId ?? day.dayDriverId))}</td>`);
      } else {
        cells.push(`<td>${escapeHtml(staffName(staff, day.dayDriverId))}</td>`);
        cells.push(`<td>${escapeHtml(staffName(staff, day.nightDriverId))}</td>`);
      }
      return `<tr class="${holidayClass}">${cells.join("")}</tr>`;
    })
    .join("");
}

function scheduleMetrics(schedule: Schedule, staff: Staff) {
  return schedule.days.reduce(
    (total, day) => {
      if ([day.chiefId, day.chiefSecondId, day.yspId, day.yspSecondId].includes(staff.id)) {
        if (staff.cadre === "Memur") {
          const split = day.chiefSecondId === staff.id || day.yspSecondId === staff.id || (day.chiefSecondId && day.chiefId === staff.id) || (day.yspSecondId && day.yspId === staff.id);
          if (split) { total.day += 1; total.hours += 12; } else { total.full += 1; total.hours += 24; }
        } else {
          total.day += 1;
          total.hours += 11;
        }
      }
      if (day.fullDriverId === staff.id) {
        total.full += 1;
        total.hours += staff.cadre === "Memur" ? 24 : 11;
      }
      if (day.dayDriverId === staff.id) {
        total.day += 1;
        total.hours += staff.cadre === "Memur" ? 12 : 11;
      }
      if (day.nightDriverId === staff.id) {
        total.night += 1;
        total.hours += staff.cadre === "Memur" ? 12 : 11;
      }
      total.total = total.day + total.night + total.full;
      return total;
    },
    { total: 0, day: 0, night: 0, full: 0, hours: 0 },
  );
}

function summaryRows(schedule: Schedule, staff: Staff[], station: Station, holidays: PublicHoliday[], leaves: LeaveRequest[]) {
  return dutySummary(schedule, staff.filter((person) => person.stationId === station.id))
    .map((item) => {
      const metrics = scheduleMetrics(schedule, item.staff);
      const targetHours = targetHoursForStaff(item.staff, schedule.year, schedule.month, holidays, leaves);
      const overtimeHours = item.staff.cadre === "4D İşçi" ? 0 : Math.max(0, metrics.hours - targetHours);
      return `<tr>
<td>${escapeHtml(item.staff.fullName)}</td>
<td>${escapeHtml(item.staff.title)}</td>
<td>${escapeHtml(item.staff.cadre)}</td>
<td>${workedDaysForStaff(item.staff, schedule.year, schedule.month, holidays, leaves)}</td>
<td>${rawTargetDuties(item.staff, schedule.year, schedule.month, holidays, leaves).toFixed(2)}</td>
<td>${metrics.total}</td>
<td>${metrics.day}</td>
<td>${metrics.night}</td>
<td>${metrics.full}</td>
<td>${targetHours.toFixed(2)}</td>
<td>${metrics.hours.toFixed(2)}</td>
<td>${overtimeHours.toFixed(2)}</td>
</tr>`;
    })
    .join("");
}

function htmlDocument(
  station: Station,
  schedule: Schedule,
  staff: Staff[],
  holidays: PublicHoliday[],
  leaves: LeaveRequest[] = [],
  dutyRequests: DutyRequest[] = [],
) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title(station, schedule))}</title>
<style>
  @page { size: A4 portrait; margin: 6mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { font-family: Arial, sans-serif; color: #102027; margin: 0; }
  h1 { text-align: center; font-size: 15px; margin: 0 0 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #4b5563; padding: 3px 4px; font-size: 8.6px; line-height: 1.08; }
  th { background: #bfdbfe !important; box-shadow: inset 0 0 0 9999px #bfdbfe; }
  tr.weekend td { background: #dbeafe !important; box-shadow: inset 0 0 0 9999px #dbeafe; }
  tr.holiday td { background: #fed7aa !important; box-shadow: inset 0 0 0 9999px #fed7aa; }
  tr.weekend td:first-child { border-left: 5px solid #2563eb; font-weight: 700; }
  tr.holiday td:first-child { border-left: 5px solid #ea580c; font-weight: 700; }
  .page { page-break-after: always; min-height: 270mm; }
  .page:last-child { page-break-after: auto; }
  .duty-table th, .duty-table td { font-size: 8.5px; padding: 2.5px 4px; }
  .summary th { background: #bbf7d0 !important; box-shadow: inset 0 0 0 9999px #bbf7d0; }
  .summary th, .summary td { font-size: 9.2px; padding: 4px 5px; }
  .summary-title { margin-top: 0; }
  p { margin: 4px 0 0; font-size: 10px; }
</style>
</head>
<body>
<section class="page duty-page">
<h1>${escapeHtml(title(station, schedule))}</h1>
<table class="duty-table">
<thead><tr>${headers(station).map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
<tbody>${tableRows(station, schedule, staff, holidays)}</tbody>
</table>
<p>Hafta sonları açık mavi, resmi tatiller açık turuncu renkle gösterilmiştir.</p>
</section>
<section class="page summary-page">
<h1 class="summary-title">${escapeHtml(title(station, schedule))} - Personel İstatistikleri</h1>
<table class="summary">
<thead><tr><th>Personel</th><th>Ünvan</th><th>Kadro</th><th>Çalışılan Gün</th><th>Hedef Nöbet</th><th>Yazılan</th><th>Gündüz/12</th><th>Gece/12</th><th>24 Saat</th><th>Hedef Saat</th><th>Tuttuğu Saat</th><th>Fazla Mesai</th></tr></thead>
<tbody>${summaryRows(schedule, staff, station, holidays, leaves)}</tbody>
</table>
<h1 class="summary-title">Karşılanmayan İstekler</h1>
<table class="summary">
<thead><tr><th>Personel</th><th>Tarih</th><th>İstek</th><th>Vardiya</th><th>Neden</th></tr></thead>
<tbody>${unmetRequestRows(schedule, staff, station, dutyRequests)}</tbody>
</table>
<p>Özet ve açıklama alanı:</p>
</section>
</body>
</html>`;
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([`\uFEFF${content}`], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function simpleFileBase(titleText: string) {
  return titleText
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function overtimeHtml(titleText: string, rows: OvertimeRow[]) {
  const body = rows
    .map(
      (row) => `<tr>
<td>${escapeHtml(row.stationName)}</td>
<td>${escapeHtml(row.staff.fullName)}</td>
<td>${escapeHtml(row.staff.title)}</td>
<td>${escapeHtml(row.staff.cadre)}</td>
<td>${escapeHtml(monthName(row.month))}</td>
<td>${row.workedDays}</td>
<td>${row.targetDuties.toFixed(2)}</td>
<td>${row.targetHours.toFixed(2)}</td>
<td>${row.scheduledDuties}</td>
<td>${row.scheduledHours.toFixed(2)}</td>
<td>${row.differenceHours.toFixed(2)}</td>
<td>${row.overtimeHours.toFixed(2)}</td>
<td>${row.annualLeaveBlocked ? "Yıllık izin nedeniyle kapalı" : ""}</td>
</tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titleText)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, sans-serif; color: #102027; }
  h1 { text-align: center; font-size: 18px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #6b7280; padding: 6px; font-size: 10px; }
  th { background: #dbeafe; }
</style>
</head>
<body>
<h1>${escapeHtml(titleText)}</h1>
<table>
<thead><tr><th>İstasyon</th><th>Personel</th><th>Ünvan</th><th>Kadro</th><th>Ay</th><th>Çalışılan Gün</th><th>Hedef Nöbet</th><th>Hedef Saat</th><th>Yazılan Nöbet</th><th>Yazılan Saat</th><th>Fark Saat</th><th>Fazla Mesai</th><th>Not</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}

export function exportExcel(
  station: Station,
  schedule: Schedule,
  staff: Staff[],
  holidays: PublicHoliday[],
  leaves: LeaveRequest[] = [],
  dutyRequests: DutyRequest[] = [],
) {
  download(
    htmlDocument(station, schedule, staff, holidays, leaves, dutyRequests),
    `${fileBase(station, schedule)}.xls`,
    "application/vnd.ms-excel;charset=utf-8",
  );
}

export async function exportWord(
  station: Station,
  schedule: Schedule,
  staff: Staff[],
  holidays: PublicHoliday[] = [],
  leaves: LeaveRequest[] = [],
  dutyRequests: DutyRequest[] = [],
) {
  download(htmlDocument(station, schedule, staff, holidays, leaves, dutyRequests), `${fileBase(station, schedule)}.doc`, "application/msword;charset=utf-8");
}

export function exportPdf(
  station: Station,
  schedule: Schedule,
  staff: Staff[],
  holidays: PublicHoliday[] = [],
  leaves: LeaveRequest[] = [],
  dutyRequests: DutyRequest[] = [],
) {
  const popup = window.open("", "_blank", "width=1200,height=800");
  if (!popup) return;
  popup.document.write(htmlDocument(station, schedule, staff, holidays, leaves, dutyRequests));
  popup.document.close();
  popup.focus();
  popup.print();
}

export function exportOvertimeExcel(titleText: string, rows: OvertimeRow[]) {
  download(overtimeHtml(titleText, rows), `${simpleFileBase(titleText)}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

export function exportOvertimeWord(titleText: string, rows: OvertimeRow[]) {
  download(overtimeHtml(titleText, rows), `${simpleFileBase(titleText)}.doc`, "application/msword;charset=utf-8");
}

export function exportOvertimePdf(titleText: string, rows: OvertimeRow[]) {
  const popup = window.open("", "_blank", "width=1200,height=800");
  if (!popup) return;
  popup.document.write(overtimeHtml(titleText, rows));
  popup.document.close();
  popup.focus();
  popup.print();
}
