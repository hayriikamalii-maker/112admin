import {
  Activity,
  AlertTriangle,
  Ambulance,
  BriefcaseMedical,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Home,
  HeartPulse,
  History,
  KeyRound,
  LogOut,
  Pencil,
  RotateCcw,
  Save,
  Settings,
  Siren,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { addDays, dateRange, formatDateAndDay, getTurkeyHolidays, isHoliday, isWeekendForCadre, leaveDaysForStaff, monthName, rawTargetDuties, workedDaysForStaff, targetHoursForStaff, targetDuties } from "./domain/date";
import { exportExcel, exportOvertimeExcel, exportOvertimePdf, exportOvertimeWord, exportPdf, exportWord } from "./domain/exporters";
import { buildOvertimeRows, overtimeReportTitle } from "./domain/overtime";
import {
  activeAssignmentForStaff,
  canAccessStaff,
  canServeDriverShift,
  canServeRole,
  dutySummary,
  generateSchedule,
  isExternallyAssigned,
  validateSchedule,
} from "./domain/rules";
import { clearLegacyState, loadLegacyState, loadState, parseStateBackup } from "./domain/storage";
import {
  changePassword,
  createAuthUser,
  getAuthenticatedUsername,
  loadRemoteState,
  loadUserActivityLogs,
  logUserActivity,
  resetAuthUserPassword,
  saveRemoteState,
  signIn,
  signOut,
  supabaseEnabled,
  updateAuthUserRole,
} from "./domain/supabaseState";
import type {
  AiProvider,
  AppUser,
  AppState,
  Cadre,
  ChangeLog,
  DriverShift,
  DutyRequest,
  DutyRequestType,
  DutyRole,
  LeaveRequest,
  LeaveType,
  PublicHoliday,
  Schedule,
  ScheduleDay,
  Staff,
  StaffDuty,
  StaffTitle,
  Station,
  StationType,
  UserActivityLog,
  UserRole,
} from "./domain/types";

const titles: StaffTitle[] = ["Doktor", "Paramedik", "ATT", "Sürücü", "Sürücü ATT", "Sürücü Paramedik"];
const cadres: Cadre[] = ["Memur", "4D İşçi"];
const stationTypes: StationType[] = ["A1", "A2"];
const leaveTypes: LeaveType[] = ["Yıllık izin", "Rapor", "Resmi görev", "Mazeret", "Eğitim", "Diğer"];
const officialDutyTypes = ["İlk yardım sınavı", "İlk yardım eğitimi", "Diğer eğitim", "Görevlendirme", "UMKE görevlendirmesi"];
const months = Array.from({ length: 12 }, (_, index) => index + 1);
const aiProviders: AiProvider[] = ["local", "gemini", "groq"];
const staffDuties: StaffDuty[] = ["chief", "ysp", "driver"];
const assignmentStationId = "__assignment_station__";
const assignmentStation: Station = {
  id: assignmentStationId,
  name: "Görevlendirme İstasyonu",
  radioCode: "GÖREV",
  city: "Sanal",
  district: "Görevlendirme",
  type: "A2",
};

function isAssignmentStation(station?: Station) {
  return station?.id === assignmentStationId;
}

function stationLabel(station?: Station) {
  if (!station) return "-";
  return station.radioCode?.trim() ? `${station.name} - ${station.radioCode.trim()}` : station.name;
}

const navItems = [
  ["/dashboard", "Ana Sayfa", Home],
  ["/nobet-cizelgesi", "Nöbet Listesi", FileSpreadsheet],
  ["/istasyonlar", "İstasyonlar", Building2],
  ["/personeller", "Personeller", Users],
  ["/izinler", "İzin / Rapor / İstek", CalendarDays],
  ["/veri-import", "Planlama", FileUp],
  ["/fazla-mesai", "Fazla Mesai", Clock3],
  ["/cizelgeler", "Çizelgeler", FileText],
  ["/kullanici-loglari", "Log Kayıtları", History],
  ["/ayarlar", "Ayarlar", Settings],
] as const;

interface NetworkContext {
  ipAddress?: string;
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  datacenter?: string;
  platformHint?: string;
  mobileHint?: boolean;
}

function activityDeviceInfo(network: NetworkContext = {}) {
  const ua = navigator.userAgent;
  const operatingSystem = /iPhone|iPad|iPod/i.test(ua) ? "iOS / iPadOS" : /Android/i.test(ua) ? "Android" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Bilinmiyor";
  const browser = /Edg\//i.test(ua) ? "Microsoft Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : /Firefox\//i.test(ua) ? "Firefox" : "Bilinmiyor";
  const deviceType = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobile|iPhone|Android/i.test(ua) || network.mobileHint ? "Telefon" : "Masaüstü web";
  const deviceModel = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android cihaz" : /Macintosh|Mac OS X/i.test(ua) ? "Mac bilgisayar (MacBook/iMac ayrımı tarayıcı tarafından paylaşılmıyor)" : operatingSystem === "Windows" ? "Windows bilgisayar" : deviceType;
  return {
    deviceType,
    deviceName: deviceModel,
    operatingSystem,
    browser,
    userAgent: ua,
    screenSize: `${window.screen.width} × ${window.screen.height}`,
    ipAddress: network.ipAddress,
    country: network.country,
    city: [network.city, network.region].filter(Boolean).join(" / "),
    datacenter: network.datacenter,
  };
}

const routeLabels: Record<string, string> = {
  "/dashboard": "Ana Sayfa",
  "/nobet-cizelgesi": "Nöbet Listesi",
  "/istasyonlar": "İstasyonlar",
  "/personeller": "Personeller",
  "/izinler": "İzin / Rapor / İstek",
  "/veri-import": "Planlama",
  "/fazla-mesai": "Fazla Mesai",
  "/cizelgeler": "Çizelgeler",
  "/ayarlar": "Ayarlar",
  "/kullanici-loglari": "Log Kayıtları",
};

function controlContext(element: HTMLElement) {
  const row = element.closest("tr");
  const cells = row ? [...row.querySelectorAll("td")] : [];
  const cell = element.closest("td");
  const index = cell ? cells.indexOf(cell as HTMLTableCellElement) : -1;
  const heading = index >= 0 ? row?.closest("table")?.querySelectorAll("th")[index]?.textContent?.trim() : "";
  const subject = cells[0]?.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || "";
  const label = element.closest("label")?.firstChild?.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || heading || element.getAttribute("name") || "alan";
  return { row, subject, heading: heading || label, label };
}

function describeActivity(element: HTMLElement, event: Event) {
  const route = window.location.hash.replace(/^#/, "") || window.location.pathname;
  const page = routeLabels[route] ?? route;
  const context = controlContext(element);
  const buttonText = (element.textContent || "").trim().replace(/\s+/g, " ");
  const selectedText = element instanceof HTMLSelectElement ? [...element.selectedOptions].map((option) => option.textContent?.trim()).filter(Boolean).join(", ") : "";
  const details: Record<string, unknown> = { olay: event.type === "change" ? "değişiklik" : "tıklama", öğe: element.tagName.toLocaleLowerCase("tr-TR"), sayfa: page };
  if (selectedText) details.seçim = selectedText;
  if (context.subject) details.kayıt = context.subject;
  if (context.heading) details.alan = context.heading;

  if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
    details.durum = element.checked ? "işaretlendi" : "işaret kaldırıldı";
    const subject = context.subject ? `${context.subject} için ` : "";
    return { label: `${subject}${context.label} ${element.checked ? "işaretlendi" : "işareti kaldırıldı"}.`, details };
  }
  if (element instanceof HTMLSelectElement) {
    const subject = context.subject ? `${context.subject} kaydında ` : "";
    return { label: `${subject}${context.heading} alanı “${selectedText || "Boş"}” olarak değiştirildi.`, details };
  }
  if (event.type === "change" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    const subject = context.subject ? `${context.subject} kaydında ` : "";
    return { label: `${subject}${context.label} alanı güncellendi.`, details };
  }

  const normalized = buttonText.toLocaleLowerCase("tr-TR");
  const subject = context.subject ? `${context.subject}: ` : "";
  if (normalized.includes("personel ekle")) return { label: "Yeni personel eklendi.", details };
  if (normalized.includes("görevlendir")) return { label: `${subject}Personel görevlendirme işlemi açıldı veya güncellendi.`, details };
  if (normalized.includes("fazla mesai")) return { label: `${subject}Fazla mesai işlemi yapıldı.`, details };
  if (normalized.includes("istek") && (normalized.includes("ekle") || normalized.includes("kaydet"))) return { label: `${subject}Nöbet isteği girildi.`, details };
  if (normalized.includes("izin") && (normalized.includes("ekle") || normalized.includes("kaydet"))) return { label: `${subject}İzin / rapor kaydı girildi.`, details };
  if (normalized.includes("otomatik oluştur")) return { label: "Nöbet listesi otomatik oluşturuldu.", details };
  if (normalized.includes("ai ile")) return { label: "Nöbet listesi AI ile hazırlandı.", details };
  if (normalized.includes("listeyi temizle")) return { label: "Nöbet listesi temizlendi.", details };
  if (normalized.includes("kaydet")) return { label: `${page} sayfasındaki değişiklikler kaydedildi.`, details };
  if (normalized.includes("sil")) return { label: `${subject}Kayıt silme işlemi yapıldı.`, details };
  if (normalized.includes("güncelle") || normalized.includes("düzenle")) return { label: `${subject}Kayıt güncellendi.`, details };
  if (normalized.includes("ekle") || normalized.includes("oluştur")) return { label: `${subject}Yeni kayıt oluşturuldu.`, details };
  if (normalized.includes("indir") || normalized.includes("excel") || normalized.includes("pdf") || normalized.includes("word")) return { label: `${page} verileri dışa aktarıldı.`, details };
  return { label: buttonText ? `${page}: “${buttonText}” işlemi yapıldı.` : `${page} sayfasında işlem yapıldı.`, details };
}

function classifyActivity(label: string, element: HTMLElement): import("./domain/types").ActivityActionType {
  const normalized = label.toLocaleLowerCase("tr-TR");
  if (normalized.includes("çıkış")) return "logout";
  if (normalized.includes("sil") || normalized.includes("temizle") || normalized.includes("sıfırla")) return "delete";
  if (normalized.includes("oluştur") || normalized.includes("ekle")) return "create";
  if (normalized.includes("güncelle") || normalized.includes("düzenle") || normalized.includes("değiştir")) return "update";
  if (normalized.includes("işaretlendi") || normalized.includes("işareti kaldırıldı") || normalized.includes("alanı güncellendi")) return "change";
  if (normalized.includes("kaydet")) return "save";
  if (normalized.includes("indir") || normalized.includes("excel") || normalized.includes("pdf") || normalized.includes("word")) return "export";
  if (normalized.includes("yükle") || normalized.includes("aktar") || normalized.includes("import")) return "import";
  if (normalized.includes("ai") || normalized.includes("gemini") || normalized.includes("groq")) return "ai";
  if (element.tagName === "SELECT" || element.tagName === "INPUT" || element.tagName === "TEXTAREA") return "change";
  return "click";
}

function navigate(path: string) {
  window.location.hash = path;
}

function usePath() {
  const readPath = () => {
    const hashPath = window.location.hash.replace(/^#/, "");
    if (hashPath.startsWith("/")) return hashPath;
    if (window.location.pathname !== "/") return window.location.pathname;
    return "/dashboard";
  };
  const [path, setPath] = useState(readPath);
  useEffect(() => {
    if (window.location.pathname !== "/" && !window.location.hash) {
      window.history.replaceState(null, "", `/#${window.location.pathname}`);
    }
    const listener = () => setPath(readPath());
    window.addEventListener("hashchange", listener);
    window.addEventListener("popstate", listener);
    listener();
    return () => {
      window.removeEventListener("hashchange", listener);
      window.removeEventListener("popstate", listener);
    };
  }, []);
  return path;
}

function emptyStaff(stationId: string): Staff {
  return { id: crypto.randomUUID(), stationId, fullName: "", title: "Paramedik", duties: [], cadre: "Memur", active: true, overtimeAllowed: false };
}

function staffDutyLabel(duty: StaffDuty) {
  return { chief: "Ekip Şefi", ysp: "YSP", driver: "Sürücü" }[duty];
}

function emptyStation(): Station {
  return { id: crypto.randomUUID(), name: "", radioCode: "", city: "", district: "", type: "A2" };
}

function fieldRole(field: keyof ScheduleDay): DutyRole {
  if (field === "doctorId") return "doctor";
  if (field === "chiefId" || field === "chiefSecondId") return "chief";
  if (field === "yspId" || field === "yspSecondId") return "ysp";
  return "driver";
}

function staffName(staff: Staff[], id?: string) {
  return staff.find((person) => person.id === id)?.fullName ?? "";
}

function providerLabel(provider: AiProvider) {
  return {
    local: "Yerel Analiz",
    gemini: "Gemini",
    groq: "Groq",
  }[provider];
}

function calculatedLeaveDays(staff: Staff | undefined, type: LeaveType, startDate: string, endDate: string, holidays: PublicHoliday[]) {
  if (!staff || !startDate || !endDate || endDate < startDate) return 0;
  let count = 0;
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (type === "Yıllık izin" && staff.cadre === "4D İşçi" && (isWeekendForCadre(date, staff.cadre) || isHoliday(date, holidays))) continue;
    count += 1;
  }
  return count;
}

function firstDateOfMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function selectedOptions(select: HTMLSelectElement) {
  return Array.from(select.selectedOptions).map((option) => option.value);
}

function dayIso(year: number, month: number, day: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function parseDayList(value: string, year: number, month: number) {
  const range = value.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => dayIso(year, month, start + index));
  }
  return [...new Set((value.match(/\d{1,2}/g) ?? []).map((item) => dayIso(year, month, Number(item))))];
}

function inferRequestShift(text: string, staff?: Staff): DriverShift | undefined {
  if (!staff || staff.cadre !== "4D İşçi" || !staff.title.includes("Sürücü")) return undefined;
  const normalized = text.toLocaleLowerCase("tr-TR");
  if (normalized.includes("gündüz")) return "day";
  if (normalized.includes("gece")) return "night";
  if (normalized.includes("tam gün") || normalized.includes("tamgun")) return "full";
  return undefined;
}

function parseNaturalDutyText(params: {
  text: string;
  staff: Staff;
  stationId: string;
  year: number;
  month: number;
  createdBy: string;
}) {
  const normalized = params.text.toLocaleLowerCase("tr-TR");
  const now = new Date().toISOString();
  const dutyRequests: DutyRequest[] = [];
  const leaves: Omit<LeaveRequest, "id">[] = [];
  const addRequest = (dates: string[], type: DutyRequestType, source: string) => {
    const shiftPreference = inferRequestShift(source, params.staff);
    dates.forEach((requestDate) => {
      dutyRequests.push({
        id: crypto.randomUUID(),
        staffId: params.staff.id,
        stationId: params.stationId,
        date: requestDate,
        type,
        shiftPreference,
        description: `Metinden oluşturuldu: ${params.text}`,
        createdBy: params.createdBy,
        createdAt: now,
      });
    });
  };

  const avoidRegex = /((?:\d{1,2}\s*(?:,|ve)\s*)+\d{1,2}|\d{1,2}\s*[-–]\s*\d{1,2}|\d{1,2})\s*(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)?[^.]{0,80}?n[öo]bet\s+istemiyor/g;
  for (const match of normalized.matchAll(avoidRegex)) addRequest(parseDayList(match[1], params.year, params.month), "avoid", match[0]);

  const wantRegex = /((?:\d{1,2}\s*(?:,|ve)\s*)+\d{1,2}|\d{1,2}\s*[-–]\s*\d{1,2}|\d{1,2})\s*(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)?[^.]{0,80}?n[öo]bet\s+istiyor/g;
  for (const match of normalized.matchAll(wantRegex)) {
    if (!match[0].includes("istemiyor")) addRequest(parseDayList(match[1], params.year, params.month), "want", match[0]);
  }

  const leaveRegex = /(\d{1,2}\s*[-–]\s*\d{1,2})\s*(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)?[^.]{0,100}?(yıllık izin|yillik izin|rapor|izin kullanacak)/g;
  for (const match of normalized.matchAll(leaveRegex)) {
    const dates = parseDayList(match[1], params.year, params.month);
    if (dates.length > 0) {
      leaves.push({
        staffId: params.staff.id,
        type: match[2].includes("rapor") ? "Rapor" : "Yıllık izin",
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        allowOvertime: false,
        description: `Metinden oluşturuldu: ${params.text}`,
      });
    }
  }

  const targetMatch = normalized.match(/(?:herhangi bir yerde\s*)?(\d{1,2})\s*n[öo]bet\s+istiyor/);
  const manualTarget = targetMatch ? Number(targetMatch[1]) : undefined;
  return { dutyRequests, leaves, manualTarget };
}

function downloadStateBackup(state: AppState) {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `112-nobet-yedek-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ImportedStaffRow = {
  fullName: string;
  title: StaffTitle;
  cadre: Cadre;
  notes: string;
  assignmentDescription?: string;
};

type OcrWord = {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

function normalizeImportText(value: string) {
  return value
    .toLocaleUpperCase("tr-TR")
    .replaceAll("İ", "I")
    .replaceAll("Ğ", "G")
    .replaceAll("Ü", "U")
    .replaceAll("Ş", "S")
    .replaceAll("Ö", "O")
    .replaceAll("Ç", "C");
}

function importRowKey(row: ImportedStaffRow) {
  return `${normalizeImportText(row.fullName)}-${row.title}-${row.cadre}`;
}

function isTemporaryAssignmentImportRow(row: ImportedStaffRow) {
  return normalizeImportText(`${row.notes} ${row.assignmentDescription ?? ""}`).includes("GECICI GOREV");
}

function titleFromImport(rawTitle: string): StaffTitle {
  const value = normalizeImportText(rawTitle);
  if (value.includes("SRC") && value.includes("AABT")) return "Sürücü Paramedik";
  if (value.includes("SRC") && value.includes("PARAMEDIK")) return "Sürücü Paramedik";
  if (value.includes("SRC") && value.includes("ATT")) return "Sürücü ATT";
  if (value.includes("SURUCU") || value.includes("SUREKLI ISCI")) return "Sürücü";
  if (value.includes("DOKTOR")) return "Doktor";
  if (value.includes("AABT")) return "Paramedik";
  if (value.includes("PARAMEDIK")) return "Paramedik";
  if (value.includes("ATT")) return "ATT";
  return "ATT";
}

function cadreFromImport(rawTitle: string): Cadre {
  const value = normalizeImportText(rawTitle);
  return value.includes("SUREKLI ISCI") || value.includes("4D") || value.includes("4 D") ? "4D İşçi" : "Memur";
}

function cleanImportedName(value: string) {
  const stopWords = new Set([
    "GECICI",
    "GOREV",
    "GOREVDE",
    "GOREVLI",
    "YILLIK",
    "IZIN",
    "IZINLI",
    "YOLLUKLU",
    "YOLLUKSUZ",
    "SAGLIK",
    "MAZERETI",
    "MAZERET",
    "DOGUM",
    "SONRASI",
    "KKM",
    "BASHEKIMLIK",
    "BASKANLIK",
    "DEPO",
    "BIRIMI",
    "ASOS",
    "EGITIM",
    "NOLU",
    "ASHI",
    "AGUSTOS",
    "EYLUL",
    "EKIM",
    "KASIM",
    "ARALIK",
  ]);
  const tokens = value
    .replace(/^\d+\s*/, "")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(normalizeImportText(token)));
  return tokens.slice(-4).join(" ").trim();
}

function normalizeOcrTitle(value: string) {
  return normalizeImportText(value)
    .replaceAll("İ", "I")
    .replace(/\bSRC\s+ATF\b/g, "SRC ATT")
    .replace(/\bSRC\s+AAB[TF]\b/g, "SRC AABT")
    .replace(/\bAAB[TF]\b/g, "AABT")
    .replace(/\bAIT\b/g, "ATT")
    .replace(/\bA T T\b/g, "ATT")
    .replace(/\bDOKT0R\b/g, "DOKTOR")
    .replace(/\bPARAMED1K\b/g, "PARAMEDIK")
    .replace(/\bSUREKLI\s+ISCI\b/g, "SUREKLI ISCI");
}

function detectedTitleInLine(line: string) {
  const patterns: Array<{ pattern: string; title: StaffTitle; cadre?: Cadre }> = [
    { pattern: "SRC AABT", title: "Sürücü Paramedik" },
    { pattern: "SRC PARAMEDIK", title: "Sürücü Paramedik" },
    { pattern: "SURUCU PARAMEDIK", title: "Sürücü Paramedik" },
    { pattern: "SRC ATT", title: "Sürücü ATT" },
    { pattern: "SURUCU ATT", title: "Sürücü ATT" },
    { pattern: "SUREKLI ISCI", title: "Sürücü", cadre: "4D İşçi" },
    { pattern: "DHY DOKTOR", title: "Doktor" },
    { pattern: "4/B ATT", title: "ATT" },
    { pattern: "DOKTOR", title: "Doktor" },
    { pattern: "AABT", title: "Paramedik" },
    { pattern: "PARAMEDIK", title: "Paramedik" },
    { pattern: "ATT", title: "ATT" },
    { pattern: "SURUCU", title: "Sürücü" },
  ];
  return patterns
    .map((item) => ({ ...item, index: line.indexOf(item.pattern) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.pattern.length - a.pattern.length)[0];
}

function notesFromImportedText(normalized: string, sourceText: string) {
  const annualLeaveMatch = normalized.match(/(\d{1,2})\s*(?:GUN)?\s*YILLIK\s*IZIN/);
  return [
    annualLeaveMatch ? `İzin notu: ${annualLeaveMatch[1]} gün yıllık izin` : "",
    normalized.includes("YILLIK IZIN") && !annualLeaveMatch ? "İzin notu: Yıllık izin" : "",
    normalized.includes("RAPOR") ? `Rapor notu: ${sourceText}` : "",
    normalized.includes("GECICI GOREV") || normalized.includes("GECICI GOREVDE") || normalized.includes("GECICI GOREVLI")
      ? `Görev durumu: ${sourceText}`
      : "",
    normalized.includes("YOLLUKSUZ") ? "Yolluk: Yolluksuz" : "",
  ].filter(Boolean).join(" | ");
}

function rowFromOcrLine(rawLine: string): ImportedStaffRow | null {
  const line = rawLine.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  const normalized = normalizeOcrTitle(line);
  if (
    line.length < 6 ||
    normalized.includes("AD SOYAD") ||
    normalized.includes("PERSONEL BILGILERI") ||
    normalized.includes("YOLLUK DURUMU") ||
    normalized.startsWith("SN ")
  ) {
    return null;
  }
  const detectedTitle = detectedTitleInLine(normalized);
  if (!detectedTitle) return null;
  const fullName = cleanImportedName(line.slice(0, detectedTitle.index));
  if (fullName.split(/\s+/).length < 2) return null;
  const rest = line.slice(detectedTitle.index).trim();
  const notes = notesFromImportedText(normalized, rest);
  return {
    fullName,
    title: detectedTitle.title,
    cadre: detectedTitle.cadre ?? cadreFromImport(rest),
    notes,
    assignmentDescription: normalized.includes("GECICI GOREV") || normalized.includes("GECICI GOREVDE") ? rest : undefined,
  };
}

function parseCompactOcrImport(text: string): ImportedStaffRow[] {
  const titlePattern = [
    "SRC\\s+AABT",
    "AABT",
    "SRC\\s+PARAMED[Iİ]K",
    "S[ÜU]R[ÜU]C[ÜU]\\s+PARAMED[Iİ]K",
    "SRC\\s+ATT",
    "S[ÜU]R[ÜU]C[ÜU]\\s+ATT",
    "S[ÜU]REKL[Iİ]\\s+[Iİ]ŞÇ[Iİ]",
    "DHY\\s+DOKTOR",
    "4\\/B\\s+ATT",
    "DOKTOR",
    "PARAMED[Iİ]K",
    "ATT",
    "S[ÜU]R[ÜU]C[ÜU]",
  ].join("|");
  const regex = new RegExp(`([\\p{L}\\s.'-]{4,90}?)\\s+(${titlePattern})(?=\\s|$)`, "giu");
  const compactText = text.replace(/\s+/g, " ");
  const matches = Array.from(compactText.matchAll(regex));
  const rows: ImportedStaffRow[] = [];
  matches.forEach((match, index) => {
    const fullName = cleanImportedName(match[1]);
    if (fullName.split(/\s+/).length < 2) return;
    const segment = compactText.slice(match.index, matches[index + 1]?.index ?? compactText.length);
    const normalizedSegment = normalizeOcrTitle(segment);
    const notes = notesFromImportedText(normalizedSegment, segment.trim());
    rows.push({
      fullName,
      title: titleFromImport(match[2]),
      cadre: cadreFromImport(match[2]),
      notes,
    });
  });
  return rows;
}

function uniqueImportRows(rows: ImportedStaffRow[]) {
  const seenNames: string[] = [];
  return rows.filter((row) => {
    const normalizedName = normalizeImportText(row.fullName);
    const isNearDuplicate = seenNames.some((knownName) => {
      if (knownName === normalizedName) return true;
      if (Math.abs(knownName.length - normalizedName.length) > 1) return false;
      const longer = knownName.length >= normalizedName.length ? knownName : normalizedName;
      const shorter = longer === knownName ? normalizedName : knownName;
      if (longer.length === shorter.length + 1) {
        for (let index = 0; index < longer.length; index += 1) {
          if (longer.slice(0, index) + longer.slice(index + 1) === shorter) return true;
        }
      }
      return false;
    });
    if (isNearDuplicate) return false;
    seenNames.push(normalizedName);
    return true;
  });
}

function mergeImportedStaffRows(primary: ImportedStaffRow[], fallback: ImportedStaffRow[]) {
  return uniqueImportRows([...primary, ...fallback]);
}

function parseOcrStaffImport(text: string): ImportedStaffRow[] {
  const lineRows = text.split(/\r?\n/).reduce<ImportedStaffRow[]>((rows, line) => {
    const row = rowFromOcrLine(line);
    if (row) rows.push(row);
    return rows;
  }, []);
  if (lineRows.length > 1) return uniqueImportRows(lineRows);
  return uniqueImportRows([...lineRows, ...parseCompactOcrImport(text)]);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] ?? "" : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function jsonFromAiText(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  return JSON.parse(cleaned.slice(start, end + 1)) as Array<Record<string, unknown>>;
}

function rowFromAiImport(item: Record<string, unknown>): ImportedStaffRow | null {
  const fullName = String(item.fullName ?? item.adSoyad ?? "").trim();
  const rawTitle = String(item.title ?? item.unvan ?? "").trim();
  if (!fullName || !rawTitle) return null;
  const annualLeaveDays = String(item.annualLeaveDays ?? item.yillikIzinGunu ?? "").trim();
  const leaveNote = String(item.leaveNote ?? item.izinNotu ?? "").trim();
  const assignmentStatus = String(item.assignmentStatus ?? item.gorevDurumu ?? "").trim();
  const assignmentDescription = String(item.assignmentDescription ?? item.geciciGorev ?? "").trim();
  const temporaryAssignmentDates = String(item.temporaryAssignmentDates ?? item.geciciGorevTarihleri ?? "").trim();
  const allowance = String(item.allowance ?? item.yolluk ?? "").trim();
  const normalizedAssignment = normalizeImportText(`${assignmentStatus} ${assignmentDescription} ${temporaryAssignmentDates}`);
  const notes = [
    annualLeaveDays ? `İzin notu: ${annualLeaveDays} gün yıllık izin` : "",
    leaveNote ? `İzin notu: ${leaveNote}` : "",
    assignmentStatus ? `Görev durumu: ${assignmentStatus}` : "",
    temporaryAssignmentDates ? `Geçici görev: ${temporaryAssignmentDates}` : "",
    allowance ? `Yolluk: ${allowance}` : "",
  ].filter(Boolean).join(" | ");
  return {
    fullName,
    title: titleFromImport(rawTitle),
    cadre: cadreFromImport(rawTitle),
    notes,
    assignmentDescription: normalizedAssignment.includes("GECICI GOREV") ? [assignmentStatus, assignmentDescription, temporaryAssignmentDates, allowance].filter(Boolean).join(" - ") : undefined,
  };
}

async function extractImportRowsWithGemini(file: File, apiKey: string, onStatus: (message: string) => void) {
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!apiKey.trim() && isLocalHost) return [];
  onStatus("AI görsel okuma başlatıldı. Tablo doğrudan analiz ediliyor...");
  const imageData = await fileToBase64(file);
  const prompt = `Bu görsel bir 112 ASHİ aylık personel/görevlendirme tablosudur.
Tablodaki HER PERSONEL SATIRINI oku. Başlıkları veya boş satırları alma.
Türkçe karakterleri koru. Excel'e çevirme, sadece JSON döndür.
Kolon mantığı: AD SOYAD, UNVAN, G.GÖREV DURUMU, İZİNLER, GEÇİCİ GÖREV TARİHLERİ, YOLLUK DURUMU.
UNVAN değerlerini en yakın şu değerlerden biri olarak yaz: Doktor, Paramedik, ATT, Sürücü, Sürücü ATT, Sürücü Paramedik.
AABT unvanını Paramedik, SRC AABT unvanını Sürücü Paramedik olarak dönüştür. Görseldeki renk veya bölüm ayırıcılarından bağımsız olarak HER personel satırını al.
Kırmızı renkte olan ve GEÇİCİ GÖREVDE yazan satırları kesinlikle atlama; bunlar da personeldir. Başka istasyona geçici görevlendirilen personeli sonuçta tut ve görev bilgisini assignmentStatus/temporaryAssignmentDates alanlarına yaz.
SRC ATT varsa Sürücü ATT yaz. SRC PARAMEDİK varsa Sürücü Paramedik yaz. SÜREKLİ İŞÇİ/SÜRÜCÜ varsa Sürücü yaz.
Kadro: SÜREKLİ İŞÇİ/4D ise 4D İşçi, diğerleri Memur.
Yıllık izin hücresinde 10 YILLIK İZİN gibi değer varsa annualLeaveDays alanına sadece sayıyı yaz.
Geçici görev ve yolluk bilgilerini ilgili alanlara yaz.
Sadece şu JSON array formatını döndür:
[
  {
    "fullName": "AD SOYAD",
    "title": "Doktor|Paramedik|ATT|Sürücü|Sürücü ATT|Sürücü Paramedik",
    "cadre": "Memur|4D İşçi",
    "annualLeaveDays": "10",
    "leaveNote": "YILLIK İZİN",
    "assignmentStatus": "GEÇİCİ GÖREVDE",
    "temporaryAssignmentDates": "ŞEHZADELER 8 NOLU ASHİ AĞUSTOS",
    "allowance": "YOLLUKSUZ"
  }
]`;
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: file.type || "image/png",
              data: imageData,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  };
  if (!isLocalHost) {
    try {
      const proxyResponse = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, imageData, mimeType: file.type || "image/png" }),
      });
      const proxyData = (await proxyResponse.json().catch(() => null)) as { ok?: boolean; text?: string; message?: string } | null;
      if (proxyResponse.ok && proxyData?.ok) {
        const rows = uniqueImportRows(jsonFromAiText(proxyData.text ?? "").map(rowFromAiImport).filter((row): row is ImportedStaffRow => Boolean(row)));
        if (rows.length) return rows;
      }
      onStatus(`Sunucu AI bağlantısı kullanılamadı${proxyData?.message ? `: ${proxyData.message}` : ""}; doğrudan bağlantı deneniyor...`);
    } catch (error) {
      onStatus(`Sunucu AI bağlantısı kurulamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}. Doğrudan bağlantı deneniyor...`);
    }
  }
  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError = "";
  for (const model of models) {
    try {
      for (const apiVersion of ["v1beta", "v1"]) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) {
          lastError = `${apiVersion} / ${model} HTTP ${response.status}`;
          continue;
        }
        const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
        const rows = uniqueImportRows(jsonFromAiText(text).map(rowFromAiImport).filter((row): row is ImportedStaffRow => Boolean(row)));
        if (rows.length) return rows;
        lastError = "AI JSON içinde personel bulamadı";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "AI bağlantı hatası";
    }
  }
  throw new Error(lastError || "AI görsel okuma başarısız");
}

function median(values: number[]) {
  if (!values.length) return 12;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}

function groupOcrWordsIntoRows(words: OcrWord[]) {
  const rowTolerance = Math.max(10, median(words.map((word) => word.bbox.y1 - word.bbox.y0)) * 0.85);
  const rows: Array<{ center: number; words: OcrWord[] }> = [];
  for (const word of words.sort((left, right) => (left.bbox.y0 + left.bbox.y1) / 2 - (right.bbox.y0 + right.bbox.y1) / 2)) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2;
    const row = rows.find((item) => Math.abs(item.center - center) <= rowTolerance);
    if (row) {
      row.words.push(word);
      row.center = (row.center * (row.words.length - 1) + center) / row.words.length;
    } else {
      rows.push({ center, words: [word] });
    }
  }
  return rows
    .sort((left, right) => left.center - right.center)
    .map((row) => row.words.sort((left, right) => left.bbox.x0 - right.bbox.x0));
}

function rowTextFromWords(words: OcrWord[]) {
  return words
    .map((word) => word.text.replace(/[^\p{L}\p{N}/.'-]/gu, ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsFromOcrWords(words: OcrWord[]) {
  const groupedRows = groupOcrWordsIntoRows(words.filter((word) => word.text.trim() && word.confidence > 15));
  const parsedRows = groupedRows.reduce<ImportedStaffRow[]>((rows, wordsInRow) => {
    const rowText = rowTextFromWords(wordsInRow);
    const parsed = rowFromOcrLine(rowText);
    if (parsed) rows.push(parsed);
    return rows;
  }, []);
  return uniqueImportRows(parsedRows.length > 1 ? parsedRows : parseOcrStaffImport(groupedRows.map(rowTextFromWords).join("\n")));
}

function splitImportedLine(line: string) {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  if (line.includes(";")) return line.split(";").map((cell) => cell.trim());
  return line.split(",").map((cell) => cell.trim());
}

function findColumn(headers: string[], patterns: string[]) {
  return headers.findIndex((header) => patterns.some((pattern) => normalizeImportText(header).includes(pattern)));
}

function parseStaffImport(text: string): ImportedStaffRow[] {
  const rows = text
    .split(/\r?\n/)
    .map(splitImportedLine)
    .filter((row) => row.some(Boolean));
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportText(cell).includes("AD SOYAD")));
  const headers = rows[headerIndex] ?? [];
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const nameIndex = Math.max(0, findColumn(headers, ["AD SOYAD", "ADI SOYADI", "PERSONEL"]));
  const titleIndex = Math.max(1, findColumn(headers, ["UNVAN", "UNVANI"]));
  const assignmentIndex = findColumn(headers, ["G.GOREV", "GECICI GOREV", "GOREV DURUMU"]);
  const leaveIndex = findColumn(headers, ["IZIN"]);
  const temporaryDateIndex = findColumn(headers, ["GECICI GOREV TARIHLERI", "GOREV TARIHLERI"]);
  const allowanceIndex = findColumn(headers, ["YOLLUK"]);

  const parsedRows = dataRows.reduce<ImportedStaffRow[]>((parsedRows, row) => {
      const fullName = (row[nameIndex] ?? "").trim();
      const rawTitle = (row[titleIndex] ?? "").trim();
      if (!fullName || !rawTitle || normalizeImportText(fullName).includes("SN")) return parsedRows;
      const leaveCells = row.filter((_, index) => index >= Math.max(0, leaveIndex) && index <= Math.max(leaveIndex + 1, leaveIndex)).filter(Boolean);
      const assignmentText = assignmentIndex >= 0 ? row[assignmentIndex] : "";
      const temporaryDateText = temporaryDateIndex >= 0 ? row[temporaryDateIndex] : "";
      const allowanceText = allowanceIndex >= 0 ? row[allowanceIndex] : "";
      const notes = [
        leaveCells.length ? `İzin notu: ${leaveCells.join(" ")}` : "",
        assignmentText ? `Görev durumu: ${assignmentText}` : "",
        temporaryDateText ? `Geçici görev: ${temporaryDateText}` : "",
        allowanceText ? `Yolluk: ${allowanceText}` : "",
      ].filter(Boolean).join(" | ");
      parsedRows.push({
        fullName,
        title: titleFromImport(rawTitle),
        cadre: cadreFromImport(rawTitle),
        notes,
        assignmentDescription: [assignmentText, temporaryDateText, allowanceText].filter(Boolean).join(" - ") || undefined,
      });
      return parsedRows;
    }, []);
  return parsedRows.length ? parsedRows : parseOcrStaffImport(text);
}

async function imageToOcrCanvas(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = imageUrl;
    });
    const scale = image.naturalWidth < 1600 ? Math.min(3, 1800 / image.naturalWidth) : 1.25;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index] ?? 0;
      const green = imageData.data[index + 1] ?? 0;
      const blue = imageData.data[index + 2] ?? 0;
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.85 + 128));
      imageData.data[index] = contrasted;
      imageData.data[index + 1] = contrasted;
      imageData.data[index + 2] = contrasted;
      imageData.data[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function extractImportRowsFromImage(file: File, onStatus: (message: string) => void) {
  const { createWorker, PSM } = await import("tesseract.js");
  const image = await imageToOcrCanvas(file);
  const worker = await createWorker("tur+eng", undefined, {
    logger: (message) => {
      if (message.status) onStatus(`Görüntü okunuyor: ${message.status} ${Math.round((message.progress ?? 0) * 100)}%`);
    },
  });
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(image);
    const words = (result.data.blocks ?? [])
      .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)))
      .map((word): OcrWord => ({ text: word.text, confidence: word.confidence, bbox: word.bbox }));
    return rowsFromOcrWords(words);
  } finally {
    await worker.terminate();
  }
}

async function testAiProvider(provider: Exclude<AiProvider, "local">, apiKey: string) {
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!apiKey.trim() && isLocalHost) return `${providerLabel(provider)} API anahtarı boş.`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const proxyResponse = await fetch("/api-test.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
      signal: controller.signal,
    });
    if (proxyResponse.ok) {
      const data = (await proxyResponse.json()) as { ok?: boolean; message?: string };
      window.clearTimeout(timeout);
      return data.message ?? (data.ok ? `${providerLabel(provider)} API testi başarılı.` : `${providerLabel(provider)} API testi başarısız.`);
    }
    if (isLocalHost) {
      return `${providerLabel(provider)} testi canlı sunucuda yapılmalı. Yerelde PHP proxy çalışmadığı için Hostinger'e yükleyip Ayarlar sayfasından tekrar test edin.`;
    }
  } catch {
    if (isLocalHost) {
      return `${providerLabel(provider)} testi yerelde tamamlanamaz. API anahtarı tarayıcıdan değil, Hostinger'deki /api-test.php proxy dosyasından test edilir.`;
    }
  }

  try {
    if (provider === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Merhaba. Sadece OK yaz." }] }] }),
          signal: controller.signal,
        },
      );
      return response.ok ? "Gemini API testi başarılı." : `Gemini API testi başarısız: ${response.status}`;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "Merhaba. Sadece OK yaz." }],
        max_tokens: 8,
      }),
      signal: controller.signal,
    });
    return response.ok ? "Groq API testi başarılı." : `Groq API testi başarısız: ${response.status}`;
  } catch {
    return `${providerLabel(provider)} API testi tamamlanamadı. Anahtar doğruysa Hostinger'de public_html/api-test.php dosyasının yüklü olduğunu ve PHP cURL/allow_url_fopen desteğini kontrol edin.`;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refineScheduleWithGemini(params: {
  schedule: Schedule;
  station: Station;
  staff: Staff[];
  leaves: LeaveRequest[];
  dutyRequests: DutyRequest[];
  rules: string;
  apiKey: string;
}) {
  if (!params.apiKey.trim()) throw new Error("Gemini API anahtarı eksik");
  const allowedStaffIds = new Set(params.staff.map((person) => person.id));
  const prompt = [
    "Sen 112 acil sağlık hizmetleri nöbet planlama uzmanısın.",
    "Verilen taslak çizelgeyi izin, istek, dinlenme, kadro ve personelin görev alanlarına göre iyileştir.",
    "Hiçbir tarihi veya zorunlu görevi boş bırakma. Yalnızca verilen personel id'lerini kullan. Taslaktaki dolu görevi silme; yalnızca daha iyi ve kurallı bir atamayla değiştir.",
    "Sadece geçerli JSON döndür: {\"days\":[{\"date\":\"YYYY-MM-DD\",\"chiefId\":\"\",\"yspId\":\"\",\"dayDriverId\":\"\",\"nightDriverId\":\"\",\"fullDriverId\":\"\"}]}",
    `İstasyon: ${JSON.stringify(params.station)}`,
    `Personel: ${JSON.stringify(params.staff.map(({ id, fullName, title, duties, cadre, manualTarget }) => ({ id, fullName, title, duties, cadre, manualTarget })))}`,
    `İzinler: ${JSON.stringify(params.leaves)}`,
    `Nöbet istekleri: ${JSON.stringify(params.dutyRequests)}`,
    `Kurallar: ${params.rules}`,
    `Taslak: ${JSON.stringify({ days: params.schedule.days })}`,
  ].join("\n");
  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
  let raw = "";
  let lastError = "Gemini yanıt vermedi";
  for (const model of models) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.15,
              maxOutputTokens: 16384,
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        lastError = `${model}: ${errorPayload?.error?.message ?? `HTTP ${response.status}`}`;
        continue;
      }
      const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      if (raw.trim()) break;
      lastError = `${model}: boş yanıt`;
    } catch (error) {
      lastError = error instanceof DOMException && error.name === "AbortError"
        ? `${model}: zaman aşımı`
        : `${model}: ${error instanceof Error ? error.message : "bağlantı hatası"}`;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  if (!raw.trim()) throw new Error(lastError);
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { days?: ScheduleDay[] };
    if (!Array.isArray(parsed.days) || parsed.days.length !== params.schedule.days.length) throw new Error("Gemini eksik gün döndürdü");
    const expectedDates = new Set(params.schedule.days.map((day) => day.date));
    const fields: Array<keyof ScheduleDay> = ["chiefId", "chiefSecondId", "yspId", "yspSecondId", "dayDriverId", "nightDriverId", "fullDriverId"];
    const days = parsed.days.map((day) => {
      if (!expectedDates.has(day.date)) throw new Error("Gemini geçersiz tarih döndürdü");
      const clean: ScheduleDay = { date: day.date };
      for (const field of fields) {
        const value = day[field];
        if (typeof value === "string" && value && allowedStaffIds.has(value)) clean[field] = value;
      }
      if (clean.fullDriverId) {
        clean.dayDriverId = undefined;
        clean.nightDriverId = undefined;
      }
      const fallback = params.schedule.days.find((item) => item.date === day.date)!;
      clean.chiefId ||= fallback.chiefId;
      clean.yspId ||= fallback.yspId;
      if (!clean.fullDriverId && (!clean.dayDriverId || !clean.nightDriverId)) {
        clean.fullDriverId = fallback.fullDriverId;
        clean.dayDriverId = fallback.dayDriverId;
        clean.nightDriverId = fallback.nightDriverId;
      }
      return clean;
    });
    return { ...params.schedule, days, autoSnapshot: structuredClone(days), updatedAt: new Date().toISOString() };
  } catch (error) {
    throw new Error(`Gemini yanıtı işlenemedi: ${error instanceof Error ? error.message : "geçersiz JSON"}`);
  }
}

function isAdmin(user?: AppUser) {
  return user?.role === "admin";
}

const allDutyPermissions: StaffDuty[] = ["chief", "ysp", "driver"];

function userDutyPermissions(user?: AppUser) {
  return isAdmin(user) ? allDutyPermissions : (user?.dutyPermissions ?? allDutyPermissions);
}

function App() {
  const path = usePath();
  const [state, setState] = useState<AppState>(() => loadState());
  const [sessionUsername, setSessionUsername] = useState("");
  const [selectedStationId, setSelectedStationId] = useState(state.stations[0]?.id ?? "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [aiNote, setAiNote] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [syncNotice, setSyncNotice] = useState(supabaseEnabled ? "Güvenli bulut bağlantısı hazırlanıyor..." : "Supabase yapılandırması eksik");
  const [remoteReady, setRemoteReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [networkContext, setNetworkContext] = useState<NetworkContext>({});
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const loginLoggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!supabaseEnabled) {
      setAuthReady(true);
      return;
    }
    getAuthenticatedUsername()
      .then(async (username) => {
        if (cancelled || !username) return;
        const remoteState = await loadRemoteState();
        if (cancelled) return;
        if (remoteState) {
          setState(remoteState);
          setSyncNotice("Bulut verisi yüklendi");
        } else {
          const legacyState = loadLegacyState();
          const firstCloudState = legacyState ?? loadState();
          firstCloudState.users = firstCloudState.users.map((user) =>
            user.username === "admin" ? { ...user, password: "", mustChangePassword: true } : { ...user, password: "" },
          );
          await saveRemoteState(firstCloudState);
          clearLegacyState();
          setState(firstCloudState);
          setSyncNotice(legacyState ? "Yerel veri güvenli buluta taşındı" : "İlk bulut kaydı oluşturuldu");
        }
        setSessionUsername(username);
        setRemoteReady(true);
      })
      .catch(() => setSyncNotice("Güvenli bulut verisi okunamadı"))
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetch("/api/client-context", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<NetworkContext> : Promise.reject(new Error("Bağlantı bilgisi alınamadı")))
      .then(setNetworkContext)
      .catch(() => setNetworkContext({}));
  }, []);

  useEffect(() => {
    if (!remoteReady || !supabaseEnabled || !sessionUsername) return;
    const timer = window.setTimeout(() => {
      void saveRemoteState(state)
        .then(() => setSyncNotice("Buluta kaydedildi"))
        .catch(() => setSyncNotice("Bulut kaydı başarısız; değişiklik kaydedilmedi"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [remoteReady, sessionUsername, state]);

  const currentUser = state.users.find((user) => user.username === sessionUsername && user.active);
  const accessibleRealStations = isAdmin(currentUser)
    ? state.stations
    : state.stations.filter((station) => currentUser?.stationIds.includes(station.id));
  const accessibleStations = [...accessibleRealStations, assignmentStation];
  const selectedStation = accessibleStations.find((station) => station.id === selectedStationId) ?? accessibleStations[0];
  const holidays = useMemo(() => getTurkeyHolidays(year, state.holidays), [year, state.holidays]);
  const activeSchedule = state.schedules.find(
    (schedule) => schedule.stationId === selectedStation?.id && schedule.year === year && schedule.month === month,
  );
  const violations =
    selectedStation && activeSchedule
      ? validateSchedule(activeSchedule, selectedStation, state.staff, state.leaves, state.staffMonthlyAssignments, state.dutyRequests, holidays)
      : [];

  useEffect(() => {
    if (!currentUser || !remoteReady || loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    void logUserActivity({
      username: currentUser.username,
      actionType: "login",
      actionLabel: "Sisteme giriş yaptı",
      route: path,
      sessionId,
      ...activityDeviceInfo(networkContext),
    }).catch(() => undefined);
  }, [currentUser, networkContext, path, remoteReady, sessionId]);

  useEffect(() => {
    if (!currentUser || !remoteReady) return;
    const recordElement = (event: Event) => {
      const rawTarget = event.target;
      if (!(rawTarget instanceof HTMLElement)) return;
      const element = rawTarget.closest<HTMLElement>("button, select, input, textarea, a");
      if (!element || element.closest("[data-audit-ignore='true']")) return;
      if (element instanceof HTMLInputElement && ["password", "hidden"].includes(element.type)) return;
      const description = describeActivity(element, event);
      void logUserActivity({
        username: currentUser.username,
        actionType: classifyActivity(description.label, element),
        actionLabel: description.label,
        route: window.location.hash.replace(/^#/, "") || window.location.pathname,
        target: element.id || element.getAttribute("name") || element.className || undefined,
        details: description.details,
        sessionId,
        ...activityDeviceInfo(networkContext),
      }).catch(() => undefined);
    };
    document.addEventListener("click", recordElement, true);
    document.addEventListener("change", recordElement, true);
    return () => {
      document.removeEventListener("click", recordElement, true);
      document.removeEventListener("change", recordElement, true);
    };
  }, [currentUser, networkContext, remoteReady, sessionId]);

  useEffect(() => {
    if (!currentUser || !remoteReady) return;
    void logUserActivity({
      username: currentUser.username,
      actionType: "navigation",
      actionLabel: `${routeLabels[path] ?? path} sayfası açıldı.`,
      route: path,
      sessionId,
      ...activityDeviceInfo(networkContext),
    }).catch(() => undefined);
  }, [currentUser, networkContext, path, remoteReady, sessionId]);

  useEffect(() => {
    if (selectedStation && selectedStation.id !== selectedStationId) setSelectedStationId(selectedStation.id);
  }, [selectedStation, selectedStationId]);

  function updateState(updater: (draft: AppState) => AppState) {
    setState((current) => updater(structuredClone(current)));
  }

  function upsertSchedule(schedule: Schedule) {
    updateState((draft) => ({
      ...draft,
      schedules: [
        ...draft.schedules.filter(
          (item) => !(item.stationId === schedule.stationId && item.year === schedule.year && item.month === schedule.month),
        ),
        schedule,
      ],
    }));
  }

  async function generate(mode: "auto" | "ai" = "auto", scope: "all" | StaffDuty = "all") {
    if (!selectedStation || isAssignmentStation(selectedStation)) return;
    const permittedDuties = userDutyPermissions(currentUser);
    if ((scope === "all" && permittedDuties.length < allDutyPermissions.length) || (scope !== "all" && !permittedDuties.includes(scope))) {
      setGenerationNotice("Bu görev listesini oluşturma yetkiniz yok.");
      return;
    }
    setAiNote("");
    setGenerationNotice(mode === "ai" ? "AI listeyi hazırlıyor..." : "Çizelge hazırlanıyor...");
    const baseSchedule = generateSchedule({
      station: selectedStation,
      staff: state.staff,
      leaves: state.leaves,
      holidays,
      monthlyAssignments: state.staffMonthlyAssignments,
      dutyRequests: state.dutyRequests,
      year,
      month,
    });
    let generatedSchedule: Schedule = baseSchedule;
    let geminiUsed = false;
    let geminiError = "";
    if (mode === "ai") {
      try {
        generatedSchedule = await refineScheduleWithGemini({
          schedule: baseSchedule,
          station: selectedStation,
          staff: state.staff.filter((person) =>
            person.stationId === selectedStation.id &&
            person.active &&
            !isExternallyAssigned(person.id, year, month, state.staffMonthlyAssignments),
          ),
          leaves: state.leaves,
          dutyRequests: state.dutyRequests,
          rules: state.settings.scheduleRulesText ?? "",
          apiKey: state.settings.aiApiKeys.gemini ?? "",
        });
        geminiUsed = true;
      } catch (error) {
        generatedSchedule = baseSchedule;
        geminiError = error instanceof Error ? error.message : "bilinmeyen hata";
      }
    }
    const scopeFields: Record<StaffDuty, Array<keyof ScheduleDay>> = {
      chief: ["chiefId", "chiefSecondId", "chiefStartTime", "chiefEndTime", "chiefSecondStartTime", "chiefSecondEndTime"],
      ysp: ["yspId", "yspSecondId", "yspStartTime", "yspEndTime", "yspSecondStartTime", "yspSecondEndTime"],
      driver: ["dayDriverId", "nightDriverId", "fullDriverId"],
    };
    const scopedBase: Schedule = activeSchedule ?? {
      ...baseSchedule,
      days: baseSchedule.days.map((day): ScheduleDay => ({ date: day.date })),
      autoSnapshot: baseSchedule.days.map((day): ScheduleDay => ({ date: day.date })),
    };
    const nextSchedule = scope === "all"
      ? generatedSchedule
      : {
          ...scopedBase,
          updatedAt: new Date().toISOString(),
          days: scopedBase.days.map((currentDay) => {
            const generatedDay = generatedSchedule.days.find((day) => day.date === currentDay.date);
            if (!generatedDay) return currentDay;
            const nextDay = { ...currentDay };
            for (const field of scopeFields[scope]) nextDay[field] = generatedDay[field] as never;
            return nextDay;
          }),
        };
    const nextViolations = validateSchedule(
      nextSchedule,
      selectedStation,
      state.staff,
      state.leaves,
      state.staffMonthlyAssignments,
      state.dutyRequests,
      holidays,
    );
    const requestWarnings = nextViolations.filter((violation) => violation.message.includes("nöbet istemiyor") || violation.message.includes("nöbet istiyor"));
    const requestText = requestWarnings.length
      ? ` ${requestWarnings.length} personel isteği kadro/izin/dinlenme dengesi nedeniyle karşılanamadı; feragat edilen istekler kontrol panelinde gerekçeleriyle listelendi.`
      : "";
    const warningText = nextViolations.length ? ` ${nextViolations.length} uyarı var; kontrol panelinden inceleyin.${requestText}` : "";
    setGenerationNotice(
      mode === "ai"
        ? `${geminiUsed ? "Gemini" : "Yerel güvenli yedek motor"} ${scope === "all" ? "tüm listeyi" : `${staffDutyLabel(scope)} listesini`} oluşturdu.${warningText}`
        : `Liste oluşturuldu.${warningText}`,
    );
    upsertSchedule(nextSchedule);
    if (mode === "ai") {
      const summary = dutySummary(
        nextSchedule,
        state.staff.filter(
          (person) =>
            person.stationId === selectedStation.id &&
            person.active &&
            !isExternallyAssigned(person.id, year, month, state.staffMonthlyAssignments),
        ),
      );
      const most = [...summary].sort((left, right) => right.total - left.total)[0];
      const least = [...summary].sort((left, right) => left.total - right.total)[0];
      setAiNote(
        [
          geminiUsed
            ? "Gemini destekli yeniden oluşturma tamamlandı."
            : `Gemini kullanılamadı: ${geminiError || "bilinmeyen hata"}. Yerel güvenli motor listeyi yine oluşturdu.`,
          "Liste izin, istek, kadro ve vardiya kurallarıyla yeniden hesaplandı.",
          most ? `En fazla nöbet: ${most.staff.fullName} (${most.total}).` : "",
          least ? `En az nöbet: ${least.staff.fullName} (${least.total}).` : "",
          nextViolations.length
            ? `Öneriler: ${nextViolations.slice(0, 8).map((violation) => violation.message).join(" | ")}`
            : "Tüm zorunlu görevler için uygun personel bulundu.",
        ].filter(Boolean).join(" "),
      );
    }
  }

  function clearActiveSchedule() {
    if (!selectedStation || isAssignmentStation(selectedStation)) return;
    const schedulesToDelete = state.schedules.filter(
      (schedule) => schedule.stationId === selectedStation.id && schedule.year === year && schedule.month === month,
    );
    if (schedulesToDelete.length === 0) {
      setGenerationNotice("Temizlenecek çizelge yok.");
      return;
    }
    if (!window.confirm(`${stationLabel(selectedStation)} ${year} ${monthName(month)} nöbet listesi temizlensin mi?`)) return;
    const scheduleIds = new Set(schedulesToDelete.map((schedule) => schedule.id));
    updateState((draft) => ({
      ...draft,
      schedules: draft.schedules.filter(
        (schedule) => !(schedule.stationId === selectedStation.id && schedule.year === year && schedule.month === month),
      ),
      changeLogs: draft.changeLogs.filter((log) => !scheduleIds.has(log.scheduleId)),
    }));
    setAiNote("");
    setGenerationNotice("Nöbet listesi temizlendi.");
  }

  function updateAssignment(dayDate: string, field: keyof ScheduleDay, nextStaffId: string) {
    if (!activeSchedule) return;
    const previousDay = activeSchedule.days.find((day) => day.date === dayDate);
    const previousStaffId = previousDay?.[field];
    const nextSchedule: Schedule = {
      ...activeSchedule,
      updatedAt: new Date().toISOString(),
      days: activeSchedule.days.map((day) => {
        if (day.date !== dayDate) return day;
        if (field === "fullDriverId") {
          return { ...day, fullDriverId: nextStaffId || undefined, dayDriverId: undefined, nightDriverId: undefined };
        }
        if (field === "dayDriverId" || field === "nightDriverId") {
          const otherField = field === "dayDriverId" ? "nightDriverId" : "dayDriverId";
          const selectedStaff = state.staff.find((person) => person.id === nextStaffId);
          if (nextStaffId && day[otherField] === nextStaffId && selectedStaff?.cadre === "Memur") {
            return { ...day, fullDriverId: nextStaffId, dayDriverId: undefined, nightDriverId: undefined };
          }
          return { ...day, [field]: nextStaffId || undefined, fullDriverId: undefined };
        }
        return { ...day, [field]: nextStaffId || undefined };
      }),
    };
    const log: ChangeLog = {
      id: crypto.randomUUID(),
      scheduleId: activeSchedule.id,
      date: dayDate,
      field,
      previousStaffId: typeof previousStaffId === "string" ? previousStaffId : undefined,
      nextStaffId: nextStaffId || undefined,
      changedBy: currentUser?.username ?? "bilinmiyor",
      changedAt: new Date().toISOString(),
    };
    updateState((draft) => ({
      ...draft,
      schedules: [...draft.schedules.filter((item) => item.id !== activeSchedule.id), nextSchedule],
      changeLogs: [log, ...draft.changeLogs],
    }));
  }

  function toggleSplitShift(dayDate: string, role: "chief" | "ysp", enabled: boolean) {
    if (!activeSchedule) return;
    const nextSchedule: Schedule = {
      ...activeSchedule,
      updatedAt: new Date().toISOString(),
      days: activeSchedule.days.map((day) => {
        if (day.date !== dayDate) return day;
        if (role === "chief") return enabled
          ? { ...day, chiefStartTime: "08:00", chiefEndTime: "20:00", chiefSecondStartTime: "20:00", chiefSecondEndTime: "08:00" }
          : { ...day, chiefSecondId: undefined, chiefStartTime: undefined, chiefEndTime: undefined, chiefSecondStartTime: undefined, chiefSecondEndTime: undefined };
        return enabled
          ? { ...day, yspStartTime: "08:00", yspEndTime: "20:00", yspSecondStartTime: "20:00", yspSecondEndTime: "08:00" }
          : { ...day, yspSecondId: undefined, yspStartTime: undefined, yspEndTime: undefined, yspSecondStartTime: undefined, yspSecondEndTime: undefined };
      }),
    };
    upsertSchedule(nextSchedule);
  }

  function updateDriverBlock(dayDate: string, nextStaffId: string) {
    if (!activeSchedule) return;
    const previousDay = activeSchedule.days.find((day) => day.date === dayDate);
    const previousStaffId = previousDay?.fullDriverId ?? previousDay?.dayDriverId ?? previousDay?.nightDriverId;
    const selectedStaff = state.staff.find((person) => person.id === nextStaffId);
    const nextSchedule: Schedule = {
      ...activeSchedule,
      updatedAt: new Date().toISOString(),
      days: activeSchedule.days.map((day) => {
        if (day.date !== dayDate) return day;
        if (!nextStaffId) return { ...day, fullDriverId: undefined, dayDriverId: undefined, nightDriverId: undefined };
        if (selectedStaff?.cadre === "Memur") return { ...day, fullDriverId: nextStaffId, dayDriverId: undefined, nightDriverId: undefined };
        return { ...day, fullDriverId: undefined, dayDriverId: nextStaffId, nightDriverId: undefined };
      }),
    };
    const log: ChangeLog = {
      id: crypto.randomUUID(),
      scheduleId: activeSchedule.id,
      date: dayDate,
      field: "fullDriverId",
      previousStaffId: typeof previousStaffId === "string" ? previousStaffId : undefined,
      nextStaffId: nextStaffId || undefined,
      changedBy: currentUser?.username ?? "bilinmiyor",
      changedAt: new Date().toISOString(),
    };
    updateState((draft) => ({
      ...draft,
      schedules: [...draft.schedules.filter((item) => item.id !== activeSchedule.id), nextSchedule],
      changeLogs: [log, ...draft.changeLogs],
    }));
  }

  function restoreAuto() {
    if (!activeSchedule?.autoSnapshot) return;
    upsertSchedule({ ...activeSchedule, days: structuredClone(activeSchedule.autoSnapshot), updatedAt: new Date().toISOString() });
  }

  function produceAiNote() {
    if (!activeSchedule || !selectedStation) return;
    const summary = dutySummary(
      activeSchedule,
        state.staff.filter(
          (person) =>
            person.stationId === selectedStation.id &&
            person.active &&
            !isExternallyAssigned(person.id, year, month, state.staffMonthlyAssignments),
        ),
    );
    const most = [...summary].sort((left, right) => right.total - left.total)[0];
    const least = [...summary].sort((left, right) => left.total - right.total)[0];
    const critical = violations.filter((item) => item.severity === "critical").length;
    setAiNote(
      [
        "AI destekli kontrol tamamlandı.",
        critical ? `${critical} kritik ihlal önce düzeltilmeli.` : "Kritik ihlal görünmüyor.",
        most ? `En fazla nöbet: ${most.staff.fullName} (${most.total}).` : "",
        least ? `En az nöbet: ${least.staff.fullName} (${least.total}).` : "",
        "Gündüz/gece dengesi sadece 4D sürücüler için değerlendirilir; memur sürücüler 24 saat yazılır.",
      ].join(" "),
    );
  }

  if (!authReady) {
    return <main className="login-page"><div className="login-panel"><h1>Güvenli bulut bağlantısı hazırlanıyor...</h1></div></main>;
  }

  if (!currentUser || path === "/login") {
    return (
      <LoginPage
        onLogin={async (username, password) => {
          const authenticatedUsername = await signIn(username, password);
          const remoteState = await loadRemoteState();
          const firstCloudState = remoteState ?? loadLegacyState() ?? loadState();
          firstCloudState.users = firstCloudState.users.map((user) =>
            user.username === authenticatedUsername && user.username === "admin"
              ? { ...user, password: "", mustChangePassword: remoteState ? user.mustChangePassword : true }
              : { ...user, password: "" },
          );
          if (!remoteState) {
            await saveRemoteState(firstCloudState);
            clearLegacyState();
          }
          setState(firstCloudState);
          setRemoteReady(true);
          setSessionUsername(authenticatedUsername);
          const user = firstCloudState.users.find((item) => item.username === authenticatedUsername && item.active);
          if (!user) {
            await signOut();
            setSessionUsername("");
            throw new Error("Bu kullanıcı için uygulama yetkisi bulunamadı.");
          }
          const firstAllowedStationId = isAdmin(user)
            ? firstCloudState.stations[0]?.id
            : firstCloudState.stations.find((station) => user.stationIds.includes(station.id))?.id;
          setSelectedStationId(firstAllowedStationId ?? "");
          navigate("/dashboard");
        }}
      />
    );
  }

  if (currentUser.mustChangePassword) {
    return (
      <PasswordChangePage
        user={currentUser}
        onChangePassword={async (password) => {
          await changePassword(password);
          setState((current) => ({
            ...current,
            users: current.users.map((user) => (user.id === currentUser.id ? { ...user, password: "", mustChangePassword: false } : user)),
          }));
          navigate("/dashboard");
        }}
      />
    );
  }

  return (
    <div className="app-shell" data-ui-release="ultra-premium-2026-08-18">
      <aside className="sidebar">
        <div className="logo">
          <span>112</span>
          <strong>Acil Sağlık Hizmetleri Nöbet Paneli</strong>
        </div>
        <nav>
          {navItems
            .filter(([href]) => {
              if (!isAdmin(currentUser) && ["/istasyonlar", "/ayarlar", "/kullanici-loglari"].includes(href)) return false;
              if (href === "/veri-import" && !isAdmin(currentUser) && currentUser.canImport === false) return false;
              return true;
            })
            .map(([href, label, Icon]) => (
              <button key={href} className={path === href ? "active" : ""} onClick={() => navigate(href)}>
                <Icon size={18} />
                {label}
              </button>
            ))}
        </nav>
        <div className="sidebar-user">
          <span>Giriş yapan kullanıcı</span>
          <strong>{currentUser.fullName || currentUser.username}</strong>
          <small>{currentUser.role === "admin" ? "Admin" : "Kullanıcı"} · @{currentUser.username}</small>
        </div>
        <button
          className="logout"
          onClick={() => {
            void signOut();
            setSessionUsername("");
            setRemoteReady(false);
            navigate("/login");
          }}
        >
          <LogOut size={18} />
          Çıkış
        </button>
      </aside>
      <main className="content">
        <div className="medical-theme-layer" aria-hidden="true">
          <Activity className="medical-ekg ekg-one" size={260} strokeWidth={1.4} />
          <Activity className="medical-ekg ekg-two" size={190} strokeWidth={1.2} />
          <Ambulance className="medical-ambulance" size={120} strokeWidth={1.35} />
          <Siren className="medical-siren" size={82} strokeWidth={1.35} />
          <HeartPulse className="medical-heart" size={96} strokeWidth={1.3} />
          <div className="medical-defib">
            <BriefcaseMedical size={78} strokeWidth={1.25} />
            <Zap size={34} strokeWidth={1.8} />
          </div>
          <div className="medical-cross">✚</div>
          <div className="medical-pulse-dot one" />
          <div className="medical-pulse-dot two" />
        </div>
        <Topbar
          stations={accessibleStations}
          selectedStationId={selectedStation?.id ?? ""}
          setSelectedStationId={setSelectedStationId}
          year={year}
          setYear={setYear}
          month={month}
          setMonth={setMonth}
          saveNotice={saveNotice}
          onSave={() => {
            void saveRemoteState(state)
              .then(() => setSyncNotice("Buluta kaydedildi"))
              .catch(() => setSyncNotice("Bulut kaydı başarısız; değişiklik kaydedilmedi"));
            setSaveNotice("Kaydedildi");
            window.setTimeout(() => setSaveNotice(""), 1800);
          }}
        />
        <div className="sync-notice">{syncNotice}</div>
        {path === "/dashboard" && (
          <Dashboard state={state} station={selectedStation} schedule={activeSchedule} violations={violations} holidays={holidays} year={year} month={month} />
        )}
        {path === "/istasyonlar" && <StationsPage state={state} setState={setState} />}
        {path === "/personeller" && (
          <StaffPage
            state={state}
            setState={setState}
            stationId={selectedStation?.id ?? ""}
            station={selectedStation}
            year={year}
            month={month}
            holidays={holidays}
            currentUser={currentUser}
          />
        )}
        {(path === "/izinler" || path === "/istekler") && !isAssignmentStation(selectedStation) && (
          <LeaveRequestHubPage
            state={state}
            setState={setState}
            stationId={selectedStation?.id ?? ""}
            stations={accessibleRealStations}
            holidays={holidays}
            year={year}
            month={month}
            currentUser={currentUser}
          />
        )}
        {(path === "/izinler" || path === "/istekler") && isAssignmentStation(selectedStation) && (
          <div className="empty-state">Görevlendirme İstasyonu için izin, rapor veya nöbet isteği girilmez. Personeli kendi istasyonuna geri çekip işlem yapın.</div>
        )}
        {path === "/veri-import" && (isAdmin(currentUser) || currentUser.canImport !== false) && (
          <ImportPage state={state} setState={setState} currentUser={currentUser} year={year} month={month} />
        )}
        {path === "/nobet-cizelgesi" && selectedStation && !isAssignmentStation(selectedStation) && (
          <SchedulePage
            station={selectedStation}
            state={state}
            year={year}
            month={month}
            holidays={holidays}
            schedule={activeSchedule}
            violations={violations}
            generate={generate}
            clearSchedule={clearActiveSchedule}
            updateAssignment={updateAssignment}
            updateDriverBlock={updateDriverBlock}
            toggleSplitShift={toggleSplitShift}
            restoreAuto={restoreAuto}
            produceAiNote={produceAiNote}
            aiNote={aiNote}
            generationNotice={generationNotice}
            currentUser={currentUser}
          />
        )}
        {path === "/nobet-cizelgesi" && isAssignmentStation(selectedStation) && (
          <div className="empty-state">Görevlendirme İstasyonu nöbet çizelgesine dahil edilmez.</div>
        )}
        {path === "/fazla-mesai" && (
          <OvertimePage
            state={state}
            year={year}
            month={month}
            holidays={holidays}
            stationIds={accessibleRealStations.map((station) => station.id)}
          />
        )}
        {path === "/cizelgeler" && (
          <ArchivePage state={state} setState={setState} stationIds={accessibleRealStations.map((station) => station.id)} setYear={setYear} setMonth={setMonth} />
        )}
        {path === "/kullanici-loglari" && isAdmin(currentUser) && <ActivityLogsPage state={state} />}
        {path === "/ayarlar" && isAdmin(currentUser) && <SettingsPage state={state} setState={setState} year={year} holidays={holidays} />}
        <div className="app-credit">Bu uygulama Paramedic HK tarafından tasarlanmıştır.</div>
      </main>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <main className="login-page">
      <div className="login-background" aria-hidden="true">
        <div className="premium-orb teal" />
        <div className="premium-orb red" />
        <div className="emergency-grid" />
        <div className="siren-light red" />
        <div className="siren-light blue" />
        <div className="siren-light amber" />
        <div className="ekg-track primary">
          <Activity size={420} strokeWidth={2.4} />
        </div>
        <div className="ekg-track secondary">
          <Activity size={360} strokeWidth={2} />
        </div>
        <div className="ekg-track tertiary">
          <Activity size={300} strokeWidth={1.8} />
        </div>
        <Ambulance className="ambulance-visual main" size={260} strokeWidth={1.35} />
        <Ambulance className="ambulance-visual ghost one" size={150} strokeWidth={1.25} />
        <Ambulance className="ambulance-visual ghost two" size={120} strokeWidth={1.2} />
        <Zap className="shock-visual main" size={150} strokeWidth={1.8} />
        <Zap className="shock-visual mini one" size={72} strokeWidth={1.7} />
        <Zap className="shock-visual mini two" size={86} strokeWidth={1.7} />
        <div className="pulse-ring one" />
        <div className="pulse-ring two" />
      </div>
      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          try {
            await onLogin(username, password);
          } catch {
            setError("Kullanıcı adı veya şifre hatalı.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="brand-mark">112</div>
        <span className="login-badge">Acil Sağlık Hizmetleri</span>
        <h1>Acil Sağlık Hizmetleri Nöbet Paneli</h1>
        <p>Yetkili kullanıcı girişi yapın.</p>
        <label>
          Kullanıcı adı
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          Şifre
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={loading}>
          <KeyRound size={16} />
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
        <p className="login-credit">Bu uygulama Paramedic HK tarafından tasarlanmıştır.</p>
      </form>
    </main>
  );
}

function PasswordChangePage({ user, onChangePassword }: { user: AppUser; onChangePassword: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <div className="login-background" aria-hidden="true">
        <div className="premium-orb teal" />
        <div className="premium-orb red" />
        <div className="emergency-grid" />
        <div className="ekg-track primary">
          <Activity size={420} strokeWidth={2.4} />
        </div>
        <Ambulance className="ambulance-visual ghost one" size={150} strokeWidth={1.25} />
        <Zap className="shock-visual mini one" size={72} strokeWidth={1.7} />
      </div>
      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password.length < 6) {
            setError("Şifre en az 6 karakter olmalı.");
            return;
          }
          if (password !== again) {
            setError("Şifreler aynı değil.");
            return;
          }
          try {
            await onChangePassword(password);
          } catch {
            setError("Şifre değiştirilemedi. Lütfen tekrar deneyin.");
          }
        }}
      >
        <div className="brand-mark">112</div>
        <span className="login-badge">İlk Giriş Güvenliği</span>
        <h1>Şifrenizi Değiştirin</h1>
        <p>{user.fullName || user.username} için ilk girişte yeni şifre zorunludur.</p>
        <label>
          Yeni şifre
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required />
        </label>
        <label>
          Yeni şifre tekrar
          <input value={again} onChange={(event) => setAgain(event.target.value)} type="password" autoComplete="new-password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button">
          <KeyRound size={16} />
          Şifreyi Değiştir
        </button>
        <p className="login-credit">Bu uygulama Paramedic HK tarafından tasarlanmıştır.</p>
      </form>
    </main>
  );
}

function Topbar(props: {
  stations: Station[];
  selectedStationId: string;
  setSelectedStationId: (value: string) => void;
  year: number;
  setYear: (value: number) => void;
  month: number;
  setMonth: (value: number) => void;
  saveNotice: string;
  onSave: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <h2>Acil Sağlık Hizmetleri Nöbet Paneli</h2>
        <span>Personel, izin, tatil ve vardiya kurallarına göre çizelge hazırlar.</span>
      </div>
      <div className="filters">
        <select value={props.selectedStationId} onChange={(event) => props.setSelectedStationId(event.target.value)}>
          {props.stations.map((station) => (
            <option key={station.id} value={station.id}>
              {stationLabel(station)}
            </option>
          ))}
        </select>
        <select value={props.month} onChange={(event) => props.setMonth(Number(event.target.value))}>
          {months.map((item) => (
            <option key={item} value={item}>
              {monthName(item)}
            </option>
          ))}
        </select>
        <input value={props.year} onChange={(event) => props.setYear(Number(event.target.value))} type="number" />
        <button className="primary-button" onClick={props.onSave}>
          <Save size={16} />
          Kaydet
        </button>
        {props.saveNotice && <span className="save-notice">{props.saveNotice}</span>}
      </div>
    </header>
  );
}

function Dashboard(props: {
  state: AppState;
  station?: Station;
  schedule?: Schedule;
  violations: ReturnType<typeof validateSchedule>;
  holidays: PublicHoliday[];
  year: number;
  month: number;
}) {
  const stationStaff = props.state.staff
    .filter((person) => person.stationId === props.station?.id)
    .filter((person) => person.active)
    .filter((person) => props.station?.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments));
  const summary = props.schedule ? dutySummary(props.schedule, stationStaff) : [];
  const most = [...summary].sort((left, right) => right.total - left.total)[0];
  const least = [...summary].sort((left, right) => left.total - right.total)[0];
  return (
    <section className="page">
      <div className="stats-grid">
        <Stat label="Personel" value={stationStaff.length} />
        <Stat label="Toplam Nöbet" value={summary.reduce((total, item) => total + item.total, 0)} />
        <Stat label="Kural İhlali" value={props.violations.length} tone={props.violations.length ? "danger" : "ok"} />
        <Stat label="Resmi Tatil" value={props.holidays.length} />
        <Stat label="En Fazla" value={most ? `${most.staff.fullName} (${most.total})` : "-"} />
        <Stat label="En Az" value={least ? `${least.staff.fullName} (${least.total})` : "-"} />
      </div>
      {props.violations.length > 0 && (
        <div className="panel dashboard-violations">
          <h3>Kural İhlali Detayları</h3>
          {props.violations.slice(0, 12).map((violation) => (
            <div key={violation.id} className={`warning ${violation.severity}`}>
              <AlertTriangle size={16} />
              <span>{violation.date ? `${violation.date}: ` : ""}{violation.message}</span>
            </div>
          ))}
          {props.violations.length > 12 && <p className="muted-text">+{props.violations.length - 12} ihlal daha var. Tam liste için Nöbet Çizelgesi kontrol paneline bakın.</p>}
        </div>
      )}
    </section>
  );
}

function Stat(props: { label: string; value: string | number; tone?: "danger" | "ok" }) {
  return (
    <div className={`stat ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function StationsPage({ state, setState }: { state: AppState; setState: Dispatch<SetStateAction<AppState>> }) {
  const [draft, setDraft] = useState<Station>(emptyStation());
  const [editingId, setEditingId] = useState<string | null>(null);
  const resetStationForm = () => {
    setDraft(emptyStation());
    setEditingId(null);
  };
  return (
    <section className="page two-column">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          setState((current) => ({
            ...current,
            stations: editingId ? current.stations.map((station) => (station.id === editingId ? draft : station)) : [...current.stations, draft],
          }));
          resetStationForm();
        }}
      >
        <h3>{editingId ? "İstasyon Düzenle" : "İstasyon Oluştur"}</h3>
        <input placeholder="İstasyon adı" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        <input placeholder="İstasyon telsiz kodu (ör. 4060)" value={draft.radioCode ?? ""} onChange={(event) => setDraft({ ...draft, radioCode: event.target.value })} required />
        <input placeholder="İl" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required />
        <input placeholder="İlçe" value={draft.district} onChange={(event) => setDraft({ ...draft, district: event.target.value })} required />
        <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as StationType })}>
          {stationTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <button className="primary-button">
          <Save size={16} />
          {editingId ? "Güncelle" : "Kaydet"}
        </button>
        {editingId && <button type="button" onClick={resetStationForm}>Vazgeç</button>}
      </form>
      <div className="panel table-panel">
        <h3>İstasyonlar</h3>
        <table>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Telsiz Kodu</th>
              <th>İl/İlçe</th>
              <th>Tip</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {state.stations.map((station) => (
              <tr key={station.id}>
                <td>{station.name}</td>
                <td>{station.radioCode || "-"}</td>
                <td>{station.city} / {station.district}</td>
                <td>{station.type}</td>
                <td>
                  <div className="row-actions">
                    <button
                      onClick={() => {
                        setDraft(station);
                        setEditingId(station.id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <Pencil size={15} />
                      Düzenle
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (!window.confirm(`${station.name} ve bağlı personel/izin/çizelge kayıtları silinsin mi?`)) return;
                        const staffIds = state.staff.filter((person) => person.stationId === station.id).map((person) => person.id);
                        setState((current) => ({
                          ...current,
                          stations: current.stations.filter((item) => item.id !== station.id),
                          staff: current.staff.filter((person) => person.stationId !== station.id),
                          leaves: current.leaves.filter((leave) => !staffIds.includes(leave.staffId)),
                          staffMonthlyAssignments: current.staffMonthlyAssignments.filter((assignment) => !staffIds.includes(assignment.staffId)),
                          schedules: current.schedules.filter((schedule) => schedule.stationId !== station.id),
                          users: current.users.map((user) => ({
                            ...user,
                            stationIds: user.stationIds.filter((id) => id !== station.id),
                          })),
                        }));
                      }}
                    >
                      <Trash2 size={15} />
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffPage(props: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  stationId: string;
  station?: Station;
  year: number;
  month: number;
  holidays: PublicHoliday[];
  currentUser?: AppUser;
}) {
  const [draft, setDraft] = useState<Staff>(emptyStaff(props.stationId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignmentStaff, setAssignmentStaff] = useState<Staff | null>(null);
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [assignmentStartDate, setAssignmentStartDate] = useState("");
  const [assignmentEndDate, setAssignmentEndDate] = useState("");
  const [assignmentIndefinite, setAssignmentIndefinite] = useState(true);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, Staff>>({});
  const assignmentView = props.stationId === assignmentStationId;
  useEffect(() => {
    if (!assignmentView) setDraft((current) => ({ ...current, stationId: props.stationId }));
  }, [assignmentView, props.stationId]);
  const visibleTitles = props.station?.type === "A2" ? titles.filter((title) => title !== "Doktor") : titles;
  const resetForm = () => {
    setDraft(emptyStaff(props.stationId));
    setEditingId(null);
  };
  const closeAssignmentModal = () => {
    setAssignmentStaff(null);
    setAssignmentDescription("");
    setAssignmentStartDate("");
    setAssignmentEndDate("");
    setAssignmentIndefinite(true);
  };
  const startBulkEditing = () => {
    setBulkDrafts(Object.fromEntries(
      props.state.staff
        .filter((person) => person.stationId === props.stationId)
        .map((person) => [person.id, { ...person, duties: [...(person.duties ?? [])] }]),
    ));
    setBulkEditing(true);
  };
  const saveBulkEditing = () => {
    props.setState((current) => ({
      ...current,
      staff: current.staff.map((person) => bulkDrafts[person.id] ?? person),
    }));
    setBulkEditing(false);
    setBulkDrafts({});
  };
  const updateBulkDraft = (person: Staff, changes: Partial<Staff>) => {
    setBulkDrafts((current) => ({ ...current, [person.id]: { ...(current[person.id] ?? person), ...changes } }));
  };
  const createAssignment = () => {
    if (!assignmentStaff) return;
    const now = new Date();
    const effectiveStartDate = assignmentStartDate || undefined;
    const effectiveIndefinite = assignmentIndefinite || !assignmentEndDate;
    props.setState((current) => ({
      ...current,
      staffMonthlyAssignments: [
        ...current.staffMonthlyAssignments.filter((assignment) => assignment.returnedAt || assignment.staffId !== assignmentStaff.id),
        {
          id: crypto.randomUUID(),
          staffId: assignmentStaff.id,
          year: effectiveStartDate ? Number(effectiveStartDate.slice(0, 4)) : props.year,
          month: effectiveStartDate ? Number(effectiveStartDate.slice(5, 7)) : props.month,
          type: "Dış Görevlendirme",
          description: assignmentDescription || "Görevlendirme istasyonuna aktarıldı",
          originalStationId: assignmentStaff.stationId,
          startDate: effectiveStartDate,
          endDate: effectiveIndefinite ? undefined : assignmentEndDate,
          indefinite: effectiveIndefinite,
          createdBy: props.currentUser?.username,
          createdAt: now.toISOString(),
        },
      ],
    }));
    closeAssignmentModal();
  };
  const returnAssignment = (staffId: string) => {
    props.setState((current) => ({
      ...current,
      staffMonthlyAssignments: current.staffMonthlyAssignments.map((assignment) =>
        assignment.staffId === staffId && !assignment.returnedAt ? { ...assignment, returnedAt: new Date().toISOString() } : assignment,
      ),
    }));
  };
  const assignedStaffRows = props.state.staff
    .filter((person) => canAccessStaff(props.currentUser, person))
    .map((person) => ({ person, assignment: activeAssignmentForStaff(person.id, props.state.staffMonthlyAssignments) }))
    .filter((row): row is { person: Staff; assignment: NonNullable<ReturnType<typeof activeAssignmentForStaff>> } => Boolean(row.assignment));

  if (assignmentView) {
    return (
      <section className="page">
        <div className="panel">
          <h3>Görevlendirme İstasyonu</h3>
          <p className="helper-text">
            Bu ekranda sadece yetkili olduğunuz istasyonlardan görevlendirmeye gönderdiğiniz aktif personel görünür.
          </p>
        </div>
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Personel</th>
                <th>Asıl İstasyon</th>
                <th>Ünvan</th>
                <th>Görev</th>
                <th>Kadro</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Açıklama</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {assignedStaffRows.map(({ person, assignment }) => (
                <tr key={assignment.id}>
                  <td>{person.fullName}</td>
                  <td>{stationLabel(props.state.stations.find((station) => station.id === person.stationId))}</td>
                  <td>{person.title}</td>
                  <td>{person.duties?.length ? person.duties.map(staffDutyLabel).join(", ") : "Ünvana göre"}</td>
                  <td>{person.cadre}</td>
                  <td>{assignment.startDate || "-"}</td>
                  <td>{assignment.indefinite || !assignment.endDate ? "Süresiz" : assignment.endDate}</td>
                  <td>{assignment.description}</td>
                  <td>
                    <button className="primary-button" onClick={() => returnAssignment(person.id)}>
                      Kendi İstasyonuna Geri Gönder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignedStaffRows.length === 0 && <p className="helper-text">Aktif görevlendirilmiş personel yok.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <form
        className="panel staff-editor"
        onSubmit={(event) => {
          event.preventDefault();
          const nextDraft = props.station?.type === "A2" && draft.title === "Doktor" ? { ...draft, title: "Paramedik" as StaffTitle } : draft;
          props.setState((current) => ({
            ...current,
            staff: editingId ? current.staff.map((person) => (person.id === editingId ? nextDraft : person)) : [...current.staff, nextDraft],
          }));
          resetForm();
        }}
      >
        <div className="staff-editor-header">
          <div className="staff-editor-icon"><UserPlus size={22} /></div>
          <div>
            <span className="eyebrow">PERSONEL YÖNETİMİ</span>
            <h3>{editingId ? "Personel Bilgilerini Düzenle" : "Yeni Personel Ekle"}</h3>
            <p>{stationLabel(props.station)} kadrosuna ait temel bilgileri ve görev yetkilerini belirleyin.</p>
          </div>
        </div>

        <div className="staff-editor-grid">
          <label className="staff-field staff-field-wide">
            <span>Ad Soyad <b>*</b></span>
            <input placeholder="Personelin adını ve soyadını yazın" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required />
          </label>
          <label className="staff-field">
            <span>Ünvan</span>
            <select value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value as StaffTitle })}>
              {visibleTitles.map((titleOption) => <option key={titleOption}>{titleOption}</option>)}
            </select>
          </label>
          <label className="staff-field">
            <span>Kadro Türü</span>
            <select value={draft.cadre} onChange={(event) => setDraft({ ...draft, cadre: event.target.value as Cadre })}>
              {cadres.map((cadre) => <option key={cadre}>{cadre}</option>)}
            </select>
          </label>
          <label className="staff-field">
            <span>Manuel Hedef Nöbet</span>
            <input
              placeholder="Otomatik hesaplansın"
              type="number"
              min="0"
              step="0.5"
              value={draft.manualTarget ?? ""}
              onChange={(event) => setDraft({ ...draft, manualTarget: event.target.value ? Number(event.target.value) : undefined })}
            />
            <small>Boş bırakırsanız sistem otomatik hesaplar.</small>
          </label>
        </div>

        <fieldset className="staff-duty-section">
          <legend><BriefcaseMedical size={16} /> Görev Yetkileri</legend>
          <div className="staff-duty-options">
            {staffDuties.map((duty) => {
              const checked = (draft.duties ?? []).includes(duty);
              return (
                <label key={duty} className={`staff-duty-card ${checked ? "selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setDraft({
                      ...draft,
                      duties: event.target.checked
                        ? [...(draft.duties ?? []), duty]
                        : (draft.duties ?? []).filter((item) => item !== duty),
                    })}
                  />
                  <span>{staffDutyLabel(duty)}</span>
                  <small>{duty === "chief" ? "Ekip yönetimi" : duty === "ysp" ? "Sağlık personeli" : "Ambulans sürücüsü"}</small>
                </label>
              );
            })}
          </div>
          <p>Görev seçilmezse uygunluk personelin ünvanına göre otomatik belirlenir.</p>
        </fieldset>

        <div className="staff-editor-bottom">
          <label className="staff-field staff-notes">
            <span>Açıklama / Import Notu</span>
            <textarea
              placeholder="Personel hakkında gerekli notları yazın..."
              value={draft.notes ?? ""}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </label>
          <label className={`staff-overtime-card ${draft.overtimeAllowed ? "selected" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(draft.overtimeAllowed)}
              onChange={(event) => setDraft({ ...draft, overtimeAllowed: event.target.checked })}
            />
            <span>
              <strong>Fazla mesai talebi</strong>
              <small>Personel fazla mesai listesine dahil edilsin.</small>
            </span>
          </label>
        </div>

        <div className="staff-editor-actions">
          {editingId && <button type="button" onClick={resetForm}>Vazgeç</button>}
          <button className="primary-button staff-submit">
            {editingId ? <Save size={17} /> : <UserPlus size={17} />}
            {editingId ? "Değişiklikleri Kaydet" : "Personeli Kaydet"}
          </button>
        </div>
      </form>
      <div className="panel table-panel">
        <div className="row-actions bulk-edit-actions">
          {!bulkEditing ? (
            <button type="button" className="primary-button" onClick={startBulkEditing}><Pencil size={16} /> Toplu Düzenle</button>
          ) : (
            <>
              <button type="button" className="primary-button" onClick={saveBulkEditing}><Save size={16} /> Toplu Güncelle</button>
              <button type="button" onClick={() => { setBulkEditing(false); setBulkDrafts({}); }}>Vazgeç</button>
            </>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Personel</th>
              <th>İstasyon</th>
              <th>Ünvan</th>
              <th>Görev</th>
              <th>Kadro</th>
              <th>İzin/Rapor Günü</th>
              <th>Çalışılan Gün</th>
              <th>Hedef Saat</th>
              <th>Hedef Nöbet</th>
              <th>Fazla Mesai</th>
              <th>Açıklama</th>
              <th>Bu Ay</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {props.state.staff
              .filter((person) => person.stationId === props.stationId)
              .filter((person) => props.station?.type !== "A2" || person.title !== "Doktor")
              .filter((person) => !activeAssignmentForStaff(person.id, props.state.staffMonthlyAssignments))
              .map((person) => {
                const externalThisMonth = isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments);
                const calculatedTarget = rawTargetDuties(person, props.year, props.month, props.holidays, props.state.leaves);
                const effectiveTarget = person.manualTarget ?? calculatedTarget;
                return (
                <tr key={person.id}>
                  <td>{bulkEditing ? <input value={(bulkDrafts[person.id] ?? person).fullName} onChange={(event) => updateBulkDraft(person, { fullName: event.target.value })} /> : person.fullName}</td>
                  <td>{bulkEditing ? (
                    <select value={(bulkDrafts[person.id] ?? person).stationId} onChange={(event) => updateBulkDraft(person, { stationId: event.target.value })}>
                      {props.state.stations.map((station) => <option key={station.id} value={station.id}>{stationLabel(station)}</option>)}
                    </select>
                  ) : stationLabel(props.state.stations.find((station) => station.id === person.stationId))}</td>
                  <td>{bulkEditing ? (
                    <select value={(bulkDrafts[person.id] ?? person).title} onChange={(event) => updateBulkDraft(person, { title: event.target.value as StaffTitle })}>
                      {titles.map((titleOption) => <option key={titleOption}>{titleOption}</option>)}
                    </select>
                  ) : person.title}</td>
                  <td>{bulkEditing ? (
                    <select multiple value={(bulkDrafts[person.id] ?? person).duties ?? []} onChange={(event) => updateBulkDraft(person, { duties: selectedOptions(event.currentTarget) as StaffDuty[] })}>
                      {staffDuties.map((duty) => <option key={duty} value={duty}>{staffDutyLabel(duty)}</option>)}
                    </select>
                  ) : person.duties?.length ? person.duties.map(staffDutyLabel).join(", ") : "Ünvana göre"}</td>
                  <td>{bulkEditing ? (
                    <select value={(bulkDrafts[person.id] ?? person).cadre} onChange={(event) => updateBulkDraft(person, { cadre: event.target.value as Cadre })}>
                      {cadres.map((cadre) => <option key={cadre}>{cadre}</option>)}
                    </select>
                  ) : person.cadre}</td>
                  <td>{leaveDaysForStaff(person, props.year, props.month, props.holidays, props.state.leaves)}</td>
                  <td>{workedDaysForStaff(person, props.year, props.month, props.holidays, props.state.leaves)}</td>
                  <td>{externalThisMonth ? "Liste dışı" : targetHoursForStaff(person, props.year, props.month, props.holidays, props.state.leaves).toFixed(2)}</td>
                  <td>
                    {externalThisMonth ? (
                      "Liste dışı"
                    ) : (
                      <div className="target-cell">
                        <span>
                          {effectiveTarget.toFixed(2)}
                          {typeof person.manualTarget === "number" ? " (manuel)" : " (otomatik)"}
                        </span>
                        <input
                          aria-label={`${person.fullName} manuel hedef nöbet`}
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder={calculatedTarget.toFixed(2)}
                          value={person.manualTarget ?? ""}
                          onChange={(event) => {
                            const nextValue = event.target.value === "" ? undefined : Number(event.target.value);
                            props.setState((current) => ({
                              ...current,
                              staff: current.staff.map((item) =>
                                item.id === person.id ? { ...item, manualTarget: Number.isFinite(nextValue) ? nextValue : undefined } : item,
                              ),
                            }));
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td>{person.overtimeAllowed ? "İstiyor" : "İstemiyor"}</td>
                  <td>{bulkEditing ? <input value={(bulkDrafts[person.id] ?? person).notes ?? ""} onChange={(event) => updateBulkDraft(person, { notes: event.target.value })} /> : person.notes || "-"}</td>
                  <td>
                    <button type="button" onClick={() => setAssignmentStaff(person)}>Görevlendir</button>
                  </td>
                  <td>
                    <button
                      className={person.active ? "pill ok" : "pill muted"}
                      onClick={() =>
                        bulkEditing
                          ? updateBulkDraft(person, { active: !(bulkDrafts[person.id] ?? person).active })
                          : props.setState((current) => ({
                              ...current,
                              staff: current.staff.map((item) => (item.id === person.id ? { ...item, active: !item.active } : item)),
                            }))
                      }
                    >
                      {(bulkDrafts[person.id] ?? person).active ? "Aktif" : "Pasif"}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={() => {
                          setDraft(person);
                          setEditingId(person.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil size={15} />
                        Düzenle
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => {
                          if (!window.confirm(`${person.fullName} silinsin mi?`)) return;
                          props.setState((current) => ({
                            ...current,
                            staff: current.staff.filter((item) => item.id !== person.id),
                            staffMonthlyAssignments: current.staffMonthlyAssignments.filter((item) => item.staffId !== person.id),
                            leaves: current.leaves.filter((item) => item.staffId !== person.id),
                          }));
                        }}
                      >
                        <Trash2 size={15} />
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
          </tbody>
        </table>
      </div>
      {assignmentStaff && (
        <div className="modal-backdrop">
          <form
            className="panel assignment-modal"
            onSubmit={(event) => {
              event.preventDefault();
              createAssignment();
            }}
          >
            <h3>{assignmentStaff.fullName} - Görevlendirme</h3>
            <label>
              Başlangıç tarihi
              <input type="date" value={assignmentStartDate} onChange={(event) => setAssignmentStartDate(event.target.value)} />
            </label>
            <label>
              Bitiş tarihi
              <input
                type="date"
                value={assignmentEndDate}
                disabled={assignmentIndefinite}
                onChange={(event) => setAssignmentEndDate(event.target.value)}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={assignmentIndefinite}
                onChange={(event) => {
                  setAssignmentIndefinite(event.target.checked);
                  if (event.target.checked) setAssignmentEndDate("");
                }}
              />
              Süresiz görevlendirme
            </label>
            <textarea
              placeholder="Görevlendirme açıklaması"
              value={assignmentDescription}
              onChange={(event) => setAssignmentDescription(event.target.value)}
            />
            <div className="row-actions">
              <button className="primary-button">
                Görevlendir
              </button>
              <button type="button" onClick={closeAssignmentModal}>Vazgeç</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function dutyRequestTypeLabel(type: DutyRequestType) {
  return type === "want" ? "Nöbet istiyor" : "Nöbet istemiyor";
}

function driverShiftLabel(shift?: DriverShift) {
  if (shift === "day") return "Gündüz";
  if (shift === "night") return "Gece";
  return "Tam gün";
}

type LeaveRequestHubMode = "leave" | "report" | "official" | "request";

function LeaveRequestHubPage(props: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  stationId: string;
  stations: Station[];
  holidays: PublicHoliday[];
  year: number;
  month: number;
  currentUser: AppUser;
}) {
  const [mode, setMode] = useState<LeaveRequestHubMode>("leave");
  const [selectedStationId, setSelectedStationId] = useState(props.stationId);
  const [staffId, setStaffId] = useState("");
  const [naturalText, setNaturalText] = useState("");
  const [naturalNotice, setNaturalNotice] = useState("");
  const monthPrefix = `${props.year}-${String(props.month).padStart(2, "0")}`;
  const selectedStation = props.state.stations.find((station) => station.id === selectedStationId);
  const visibleStaff = props.state.staff
    .filter((person) => person.stationId === selectedStationId && person.active)
    .filter((person) => selectedStation?.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "tr"));
  const selectedStaff = visibleStaff.find((person) => person.id === staffId);
  const visibleLeaves = props.state.leaves
    .filter((leave) => visibleStaff.some((person) => person.id === leave.staffId))
    .filter((leave) => leave.startDate.startsWith(monthPrefix) || leave.endDate.startsWith(monthPrefix))
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || staffName(props.state.staff, left.staffId).localeCompare(staffName(props.state.staff, right.staffId), "tr"));
  const visibleRequests = props.state.dutyRequests
    .filter((request) => request.stationId === selectedStationId && request.date.startsWith(monthPrefix))
    .filter((request) => visibleStaff.some((person) => person.id === request.staffId))
    .sort((left, right) => left.date.localeCompare(right.date) || staffName(props.state.staff, left.staffId).localeCompare(staffName(props.state.staff, right.staffId), "tr"));

  useEffect(() => {
    if (props.stationId && props.stationId !== selectedStationId) setSelectedStationId(props.stationId);
  }, [props.stationId]);

  useEffect(() => {
    if (!visibleStaff.some((person) => person.id === staffId)) setStaffId(visibleStaff[0]?.id ?? "");
  }, [visibleStaff, staffId]);

  const applyNaturalText = () => {
    if (!selectedStationId || !selectedStaff || !naturalText.trim()) return;
    const parsed = parseNaturalDutyText({
      text: naturalText,
      staff: selectedStaff,
      stationId: selectedStationId,
      year: props.year,
      month: props.month,
      createdBy: props.currentUser.username,
    });
    props.setState((current) => {
      const requestKeys = new Set(
        parsed.dutyRequests.map((request) => `${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`),
      );
      const leaveKeys = new Set(parsed.leaves.map((leave) => `${leave.staffId}-${leave.type}-${leave.startDate}-${leave.endDate}`));
      const parsedLeaves: LeaveRequest[] = parsed.leaves.map((leave) => ({ ...leave, id: crypto.randomUUID() }));
      return {
        ...current,
        staff: current.staff.map((person) =>
          person.id === selectedStaff.id && typeof parsed.manualTarget === "number"
            ? {
                ...person,
                manualTarget: parsed.manualTarget,
                notes: [person.notes, `Metin isteği: herhangi bir yerde ${parsed.manualTarget} nöbet istiyor.`].filter(Boolean).join(" | "),
              }
            : person,
        ),
        dutyRequests: [
          ...current.dutyRequests.filter((request) => !requestKeys.has(`${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`)),
          ...parsed.dutyRequests,
        ],
        leaves: [
          ...current.leaves.filter((leave) => !leaveKeys.has(`${leave.staffId}-${leave.type}-${leave.startDate}-${leave.endDate}`)),
          ...parsedLeaves,
        ],
      };
    });
    setNaturalNotice(
      `${parsed.dutyRequests.length} istek, ${parsed.leaves.length} izin/rapor kaydı ilgili bölümlere aktarıldı${
        typeof parsed.manualTarget === "number" ? `; hedef nöbet ${parsed.manualTarget} yapıldı` : ""
      }.`,
    );
    setNaturalText("");
  };

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>İzin, Rapor ve Nöbet İstekleri</h1>
          <p>İzin, rapor ve nöbet isteklerini tek ekrandan girer; kayıtları personel bazlı toplu gösterir.</p>
        </div>
      </div>
      <div className="hub-actions">
        <button type="button" className={mode === "leave" ? "primary-button" : ""} onClick={() => setMode("leave")}>
          <CalendarDays size={16} />
          İzin Gir
        </button>
        <button type="button" className={mode === "report" ? "primary-button" : ""} onClick={() => setMode("report")}>
          <FileText size={16} />
          Rapor Gir
        </button>
        <button type="button" className={mode === "official" ? "primary-button" : ""} onClick={() => setMode("official")}>
          <BriefcaseMedical size={16} />
          Resmi Görev Gir
        </button>
        <button type="button" className={mode === "request" ? "primary-button" : ""} onClick={() => setMode("request")}>
          <CalendarCheck size={16} />
          İstek Gir
        </button>
      </div>
      {mode === "leave" && (
        <LeavesPage
          key="leave-form"
          state={props.state}
          setState={props.setState}
          stationId={props.stationId}
          stations={props.stations}
          holidays={props.holidays}
          defaultType="Yıllık izin"
        />
      )}
      {mode === "report" && (
        <LeavesPage
          key="report-form"
          state={props.state}
          setState={props.setState}
          stationId={props.stationId}
          stations={props.stations}
          holidays={props.holidays}
          defaultType="Rapor"
        />
      )}
      {mode === "official" && (
        <LeavesPage
          key="official-form"
          state={props.state}
          setState={props.setState}
          stationId={props.stationId}
          stations={props.stations}
          holidays={props.holidays}
          defaultType="Resmi görev"
        />
      )}
      {mode === "request" && (
        <DutyRequestsPage
          state={props.state}
          setState={props.setState}
          stationId={props.stationId}
          stations={props.stations}
          year={props.year}
          month={props.month}
          currentUser={props.currentUser}
          showNaturalPanel={false}
        />
      )}
      <div className="panel table-panel combined-summary">
        <h3>{monthName(props.month)} {props.year} Toplu İzin / Rapor / İstek Özeti</h3>
        <div className="combined-summary-grid">
          <div>
            <h4>İzin ve Raporlar</h4>
            <table>
              <tbody>
                {visibleLeaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>{staffName(props.state.staff, leave.staffId)}</td>
                    <td>{leave.type}</td>
                    <td>{leave.startDate} - {leave.endDate}</td>
                    <td>{leave.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleLeaves.length === 0 && <p className="helper-text">Bu ay için izin/rapor kaydı yok.</p>}
          </div>
          <div>
            <h4>Nöbet İstekleri</h4>
            <table>
              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.id} className={request.type === "avoid" ? "request-avoid" : "request-want"}>
                    <td>{staffName(props.state.staff, request.staffId)}</td>
                    <td>{formatDateAndDay(request.date)}</td>
                    <td>{dutyRequestTypeLabel(request.type)}</td>
                    <td>{driverShiftLabel(request.shiftPreference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRequests.length === 0 && <p className="helper-text">Bu ay için nöbet isteği yok.</p>}
          </div>
        </div>
      </div>
      <div className="panel ai-text-panel">
        <h3>AI Destekli Metin Girişi</h3>
        <p className="helper-text">Personel seçip serbest metin girin; istekler istek bölümüne, rapor rapora, yıllık izin izne otomatik aktarılır.</p>
        <div className="form-grid">
          <label>
            İstasyon
            <select value={selectedStationId} onChange={(event) => setSelectedStationId(event.target.value)}>
              {props.stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {stationLabel(station)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Personel
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              {visibleStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {person.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={naturalText}
          onChange={(event) => setNaturalText(event.target.value)}
          placeholder="Örn: 1,2,3 Ağustos nöbet istemiyor. 10-15 Ağustos arası yıllık izin kullanacak. 20 Ağustos raporlu."
        />
        <button type="button" className="primary-button" disabled={!staffId || !naturalText.trim()} onClick={applyNaturalText}>
          <Sparkles size={16} />
          Metni Otomatik Tasnif Et
        </button>
        {naturalNotice && <p className="save-notice">{naturalNotice}</p>}
      </div>
    </section>
  );
}

function DutyRequestsPage(props: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  stationId: string;
  stations: Station[];
  year: number;
  month: number;
  currentUser: AppUser;
  showNaturalPanel?: boolean;
}) {
  const showNaturalPanel = props.showNaturalPanel ?? true;
  const [selectedStationId, setSelectedStationId] = useState(props.stationId);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(firstDateOfMonth(props.year, props.month));
  const [selectedDates, setSelectedDates] = useState<string[]>([firstDateOfMonth(props.year, props.month)]);
  const [type, setType] = useState<DutyRequestType>("avoid");
  const [requestShift, setRequestShift] = useState<DriverShift>("full");
  const [description, setDescription] = useState("");
  const [editingRequestId, setEditingRequestId] = useState("");
  const [naturalText, setNaturalText] = useState("");
  const [naturalNotice, setNaturalNotice] = useState("");
  const monthPrefix = `${props.year}-${String(props.month).padStart(2, "0")}`;
  const monthDates = dateRange(props.year, props.month);
  const selectedStation = props.state.stations.find((station) => station.id === selectedStationId);
  const visibleStaff = props.state.staff
    .filter((person) => person.stationId === selectedStationId && person.active)
    .filter((person) => selectedStation?.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "tr"));
  const selectedStaffForRequest = visibleStaff.find((person) => person.id === staffId);
  const canSelectRequestShift = Boolean(selectedStaffForRequest?.cadre === "4D İşçi" && canServeRole(selectedStaffForRequest, "driver", selectedStation));
  const visibleRequests = props.state.dutyRequests
    .filter((request) => request.stationId === selectedStationId && request.date.startsWith(monthPrefix))
    .filter((request) => visibleStaff.some((person) => person.id === request.staffId))
    .sort((left, right) => left.date.localeCompare(right.date) || staffName(props.state.staff, left.staffId).localeCompare(staffName(props.state.staff, right.staffId), "tr"));
  const requestSummaryRows = visibleStaff
    .map((person) => {
      const personRequests = visibleRequests.filter((request) => request.staffId === person.id);
      return {
        person,
        wants: personRequests.filter((request) => request.type === "want"),
        avoids: personRequests.filter((request) => request.type === "avoid"),
        notes: personRequests.map((request) => request.description).filter(Boolean),
      };
    })
    .filter((row) => row.wants.length > 0 || row.avoids.length > 0);

  useEffect(() => {
    if (props.stationId && props.stationId !== selectedStationId) setSelectedStationId(props.stationId);
  }, [props.stationId]);

  useEffect(() => {
    if (!visibleStaff.some((person) => person.id === staffId)) setStaffId(visibleStaff[0]?.id ?? "");
  }, [selectedStationId, visibleStaff, staffId]);

  useEffect(() => {
    const nextDate = firstDateOfMonth(props.year, props.month);
    if (!date.startsWith(monthPrefix)) {
      setDate(nextDate);
      setSelectedDates([nextDate]);
    }
  }, [props.year, props.month, monthPrefix, date]);

  const resetForm = () => {
    setStaffId(visibleStaff[0]?.id ?? "");
    setDate(firstDateOfMonth(props.year, props.month));
    setSelectedDates([firstDateOfMonth(props.year, props.month)]);
    setType("avoid");
    setRequestShift("full");
    setDescription("");
    setEditingRequestId("");
  };
  const editDutyRequest = (request: DutyRequest) => {
    setEditingRequestId(request.id);
    setSelectedStationId(request.stationId);
    setStaffId(request.staffId);
    setDate(request.date);
    setSelectedDates([request.date]);
    setType(request.type);
    setRequestShift(request.shiftPreference ?? "full");
    setDescription(request.description);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const deleteDutyRequest = (requestId: string) => {
    props.setState((current) => ({ ...current, dutyRequests: current.dutyRequests.filter((item) => item.id !== requestId) }));
  };
  const toggleCalendarDate = (requestDate: string, event: MouseEvent<HTMLButtonElement>) => {
    setDate(requestDate);
    if (event.metaKey || event.ctrlKey) {
      setSelectedDates((current) =>
        current.includes(requestDate) ? current.filter((item) => item !== requestDate) : [...current, requestDate].sort(),
      );
      return;
    }
    setSelectedDates([requestDate]);
  };
  const applyNaturalText = () => {
    if (!selectedStationId || !selectedStaffForRequest || !naturalText.trim()) return;
    const parsed = parseNaturalDutyText({
      text: naturalText,
      staff: selectedStaffForRequest,
      stationId: selectedStationId,
      year: props.year,
      month: props.month,
      createdBy: props.currentUser.username,
    });
    props.setState((current) => {
      const requestKeys = new Set(
        parsed.dutyRequests.map((request) => `${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`),
      );
      const leaveKeys = new Set(parsed.leaves.map((leave) => `${leave.staffId}-${leave.type}-${leave.startDate}-${leave.endDate}`));
      const parsedLeaves: LeaveRequest[] = parsed.leaves.map((leave) => ({ ...leave, id: crypto.randomUUID() }));
      return {
        ...current,
        staff: current.staff.map((person) =>
          person.id === selectedStaffForRequest.id && typeof parsed.manualTarget === "number"
            ? {
                ...person,
                manualTarget: parsed.manualTarget,
                notes: [person.notes, `Metin isteği: herhangi bir yerde ${parsed.manualTarget} nöbet istiyor.`].filter(Boolean).join(" | "),
              }
            : person,
        ),
        dutyRequests: [
          ...current.dutyRequests.filter((request) => !requestKeys.has(`${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`)),
          ...parsed.dutyRequests,
        ],
        leaves: [
          ...current.leaves.filter((leave) => !leaveKeys.has(`${leave.staffId}-${leave.type}-${leave.startDate}-${leave.endDate}`)),
          ...parsedLeaves,
        ],
      };
    });
    setNaturalNotice(
      `${parsed.dutyRequests.length} istek, ${parsed.leaves.length} izin/rapor kaydı oluşturuldu${
        typeof parsed.manualTarget === "number" ? `; hedef nöbet ${parsed.manualTarget} yapıldı` : ""
      }.`,
    );
    setNaturalText("");
  };

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Nöbet İstekleri</h1>
          <p>Personelin nöbet istediği veya istemediği günleri girer; otomatik çizelge bu kayıtları dikkate alır.</p>
        </div>
      </div>
      <div className="request-layout">
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedStationId || !staffId || !date) return;
            const now = new Date().toISOString();
            const datesToSave = editingRequestId ? [date] : (selectedDates.length ? selectedDates : [date]);
            const nextRequests: DutyRequest[] = datesToSave.map((requestDate) => ({
              id: editingRequestId && requestDate === date ? editingRequestId : crypto.randomUUID(),
              staffId,
              stationId: selectedStationId,
              date: requestDate,
              type,
              shiftPreference: canSelectRequestShift ? requestShift : undefined,
              description,
              createdBy: props.currentUser.username,
              createdAt: props.state.dutyRequests.find((request) => request.id === editingRequestId)?.createdAt ?? now,
              updatedAt: editingRequestId ? now : undefined,
            }));
            const nextKeys = new Set(nextRequests.map((request) => `${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`));
            props.setState((current) => ({
              ...current,
              dutyRequests: [
                ...current.dutyRequests.filter(
                  (request) =>
                    request.id !== editingRequestId &&
                    !nextKeys.has(`${request.staffId}-${request.date}-${request.type}-${request.shiftPreference ?? "full"}`),
                ),
                ...nextRequests,
              ],
            }));
            resetForm();
          }}
        >
          <h3>İstek Ekle / Düzenle</h3>
          <label>
            İstasyon
            <select value={selectedStationId} onChange={(event) => setSelectedStationId(event.target.value)}>
              {props.stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {stationLabel(station)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Personel
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)} required>
              {visibleStaff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} · {person.title}
                </option>
              ))}
            </select>
            <span className="helper-text">Görevlendirmede olan personel bu listede gösterilmez.</span>
          </label>
          <label>
            Tarih
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSelectedDates([event.target.value]);
              }}
              required
            />
          </label>
          <div className="mini-calendar">
            <span className="helper-text">Çoklu seçim için Mac’te Cmd, Windows’ta Ctrl basılı tutup günlere tıklayın.</span>
            <div className="calendar-day-grid">
              {monthDates.map((requestDate) => (
                <button
                  key={requestDate}
                  type="button"
                  className={selectedDates.includes(requestDate) ? "selected" : ""}
                  onClick={(event) => toggleCalendarDate(requestDate, event)}
                >
                  {Number(requestDate.slice(-2))}
                </button>
              ))}
            </div>
            <span className="helper-text">Seçili gün: {selectedDates.map((item) => item.slice(-2)).join(", ") || "-"}</span>
          </div>
          <label>
            İstek türü
            <select value={type} onChange={(event) => setType(event.target.value as DutyRequestType)}>
              <option value="avoid">Bu güne nöbet istemiyor</option>
              <option value="want">Bu güne nöbet istiyor</option>
            </select>
          </label>
          {canSelectRequestShift && (
            <label>
              Vardiya
              <select value={requestShift} onChange={(event) => setRequestShift(event.target.value as DriverShift)}>
                <option value="full">Tam gün</option>
                <option value="day">Gündüz</option>
                <option value="night">Gece</option>
              </select>
              <span className="helper-text">4D sürücüler için istek gündüz/gece ayrılabilir.</span>
            </label>
          )}
          <label>
            Açıklama
            <textarea placeholder="Örn: ailevi durum, özel talep, mümkünse bu güne yazılsın..." value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="row-actions">
            <button className="primary-button">
              <Save size={16} />
              {editingRequestId ? "Güncelle" : "Kaydet"}
            </button>
            {editingRequestId && <button type="button" onClick={resetForm}>Vazgeç</button>}
          </div>
          <p className="helper-text">
            “Nöbet istemiyor” otomatik oluştururken önce dışlanır; personel yetersizse liste boş kalmasın diye son çare yazılabilir ve uyarı verir.
          </p>
        </form>
        <div className="panel table-panel">
          <h3>{monthName(props.month)} {props.year} İstek Listesi</h3>
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Personel</th>
                <th>İstek</th>
                <th>Vardiya</th>
                <th>Açıklama</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr key={request.id} className={request.type === "avoid" ? "request-avoid" : "request-want"}>
                  <td>{formatDateAndDay(request.date)}</td>
                  <td>{staffName(props.state.staff, request.staffId)}</td>
                  <td>{dutyRequestTypeLabel(request.type)}</td>
                  <td>{driverShiftLabel(request.shiftPreference)}</td>
                  <td>{request.description || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => editDutyRequest(request)}
                      >
                        <Pencil size={16} />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => deleteDutyRequest(request.id)}
                      >
                        <Trash2 size={16} />
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRequests.length === 0 && <p className="helper-text">Bu ay için kayıtlı nöbet isteği yok.</p>}
        </div>
        <div className="panel table-panel">
          <h3>Personel Bazlı Toplu İstek Özeti</h3>
          <table>
            <thead>
              <tr>
                <th>Personel</th>
                <th>Ünvan</th>
                <th>Nöbet İstediği Günler</th>
                <th>Nöbet İstemediği Günler</th>
                <th>Açıklamalar</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {requestSummaryRows.map((row) => (
                <tr key={row.person.id}>
                  <td>{row.person.fullName}</td>
                  <td>{row.person.title}</td>
                  <td>{row.wants.map((request) => `${formatDateAndDay(request.date)} (${driverShiftLabel(request.shiftPreference)})`).join(", ") || "-"}</td>
                  <td>{row.avoids.map((request) => `${formatDateAndDay(request.date)} (${driverShiftLabel(request.shiftPreference)})`).join(", ") || "-"}</td>
                  <td>{row.notes.join(" | ") || "-"}</td>
                  <td>
                    <div className="request-chip-list">
                      {[...row.wants, ...row.avoids].map((request) => (
                        <span key={request.id} className={`request-chip ${request.type === "avoid" ? "request-avoid" : "request-want"}`}>
                          {formatDateAndDay(request.date)} · {driverShiftLabel(request.shiftPreference)}
                          <button type="button" onClick={() => editDutyRequest(request)}>Düzenle</button>
                          <button type="button" className="danger-button" onClick={() => deleteDutyRequest(request.id)}>Sil</button>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requestSummaryRows.length === 0 && <p className="helper-text">Toplu özet için kayıtlı istek yok.</p>}
        </div>
        {showNaturalPanel && (
          <div className="panel ai-text-panel">
            <h3>AI Destekli Metin Girişi</h3>
            <p className="helper-text">İstasyon ve personel seçiliyken serbest metin girin; sistem istek, yıllık izin/rapor ve hedef nöbet bilgisini otomatik işler.</p>
            <textarea
              value={naturalText}
              onChange={(event) => setNaturalText(event.target.value)}
              placeholder="Örn: 1,2,3,4,5 Ağustos nöbet istemiyor. Herhangi bir yerde 5 nöbet istiyor. 10-15 Ağustos arası yıllık izin kullanacak."
            />
            <button type="button" className="primary-button" onClick={applyNaturalText}>
              <Sparkles size={16} />
              Metni İstek ve İzne Çevir
            </button>
            {naturalNotice && <p className="save-notice">{naturalNotice}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function LeavesPage({
  state,
  setState,
  stationId,
  stations,
  holidays,
  defaultType = "Yıllık izin",
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  stationId: string;
  stations: Station[];
  holidays: PublicHoliday[];
  defaultType?: LeaveType;
}) {
  const [selectedStationId, setSelectedStationId] = useState(stationId);
  const selectedStation = state.stations.find((station) => station.id === selectedStationId);
  const visibleStaff = state.staff
    .filter((person) => person.stationId === selectedStationId)
    .filter((person) => selectedStation?.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !activeAssignmentForStaff(person.id, state.staffMonthlyAssignments));
  const [staffId, setStaffId] = useState(visibleStaff[0]?.id ?? "");
  const [type, setType] = useState<LeaveType>(defaultType);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastDutyDate, setLastDutyDate] = useState("");
  const [allowOvertime, setAllowOvertime] = useState(false);
  const [officialDutyType, setOfficialDutyType] = useState(officialDutyTypes[0]);
  const [description, setDescription] = useState("");
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const selectedStaff = visibleStaff.find((person) => person.id === staffId);
  const leaveDayCount = calculatedLeaveDays(selectedStaff, type, startDate, endDate, holidays);
  const resetLeaveForm = () => {
    setType(defaultType);
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setLastDutyDate("");
    setAllowOvertime(false);
    setOfficialDutyType(officialDutyTypes[0]);
    setDescription("");
    setEditingLeaveId(null);
  };
  useEffect(() => {
    if (stationId && stationId !== selectedStationId) setSelectedStationId(stationId);
  }, [stationId]);
  useEffect(() => {
    if (!visibleStaff.some((person) => person.id === staffId)) setStaffId(visibleStaff[0]?.id ?? "");
  }, [staffId, visibleStaff]);
  return (
    <section className="page two-column">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          const nextLeave = {
            id: editingLeaveId ?? crypto.randomUUID(),
            staffId,
            type,
            startDate,
            endDate,
            lastDutyDate: type === "Yıllık izin" && lastDutyDate ? lastDutyDate : undefined,
            allowOvertime: type === "Yıllık izin" ? allowOvertime : true,
            description: type === "Resmi görev" ? [officialDutyType, description].filter(Boolean).join(" - ") : description,
          };
          setState((current) => ({
            ...current,
            leaves: editingLeaveId
              ? current.leaves.map((leave) => (leave.id === editingLeaveId ? nextLeave : leave))
              : [...current.leaves, nextLeave],
          }));
          resetLeaveForm();
        }}
        >
        <h3>{editingLeaveId ? "Kayıt Düzenle" : defaultType === "Rapor" ? "Rapor Girişi" : defaultType === "Resmi görev" ? "Resmi Görev Girişi" : "İzin Girişi"}</h3>
        <label>
          İstasyon seç
          <select value={selectedStationId} onChange={(event) => setSelectedStationId(event.target.value)}>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {stationLabel(station)}
              </option>
            ))}
          </select>
          <span className="helper-text">Görevlendirmedeki personel burada gösterilmez.</span>
        </label>
        {visibleStaff.length === 0 && <p className="form-error">Seçili istasyonda personel yok.</p>}
        <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
          {visibleStaff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value as LeaveType)}>
          {leaveTypes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {type === "Resmi görev" && (
          <label>
            Resmi görev türü
            <select value={officialDutyType} onChange={(event) => setOfficialDutyType(event.target.value)}>
              {officialDutyTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <span className="helper-text">Bu tarih aralığında personele kesinlikle nöbet yazılmaz.</span>
          </label>
        )}
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <div className="info-box">
          <strong>{leaveDayCount}</strong>
          <span>{type === "Yıllık izin" ? "hesaplanan izin günü" : type === "Resmi görev" ? "resmi görev günü" : "rapor/izin günü"}</span>
        </div>
        {type === "Yıllık izin" && (
          <label>
            Son nöbet tarihi
            <input type="date" value={lastDutyDate} onChange={(event) => setLastDutyDate(event.target.value)} />
            <span className="helper-text">Boş bırakılırsa memur için izin başlangıcından önce 3 gün boşluk bırakılır.</span>
          </label>
        )}
        {type === "Yıllık izin" && (
          <label className="inline-check">
            <input type="checkbox" checked={allowOvertime} onChange={(event) => setAllowOvertime(event.target.checked)} />
            Fazla mesaiye izin ver
          </label>
        )}
        <textarea placeholder="Açıklama" value={description} onChange={(event) => setDescription(event.target.value)} />
        <button className="primary-button" disabled={!staffId}>
          <Save size={16} />
          {editingLeaveId ? "Kaydı Güncelle" : type === "Rapor" ? "Raporu Kaydet" : type === "Resmi görev" ? "Resmi Görevi Kaydet" : "İzni Kaydet"}
        </button>
        {editingLeaveId && <button type="button" onClick={resetLeaveForm}>Vazgeç</button>}
      </form>
      <div className="panel table-panel">
        <h3>İzinler</h3>
        <table>
          <tbody>
            {state.leaves
              .filter((leave) => visibleStaff.some((person) => person.id === leave.staffId))
              .map((leave) => (
              <tr key={leave.id}>
                <td>{staffName(state.staff, leave.staffId)}</td>
                <td>{leave.type}</td>
                <td>{leave.startDate} - {leave.endDate}</td>
                <td>{leave.lastDutyDate ? `Son nöbet: ${leave.lastDutyDate}` : ""}</td>
                <td>{leave.type === "Yıllık izin" ? (leave.allowOvertime ? "Fazla mesaiye açık" : "Fazla mesai kapalı") : ""}</td>
                <td>{leave.description}</td>
                <td>
                  <div className="row-actions">
                    <button
                      onClick={() => {
                        const leaveStaff = state.staff.find((person) => person.id === leave.staffId);
                        if (leaveStaff) setSelectedStationId(leaveStaff.stationId);
                        setStaffId(leave.staffId);
                        setType(leave.type);
                        setStartDate(leave.startDate);
                        setEndDate(leave.endDate);
                        setLastDutyDate(leave.lastDutyDate ?? "");
                        setAllowOvertime(Boolean(leave.allowOvertime));
                        if (leave.type === "Resmi görev") {
                          const matchedType = officialDutyTypes.find((item) => leave.description.startsWith(item));
                          setOfficialDutyType(matchedType ?? officialDutyTypes[0]);
                          setDescription(matchedType ? leave.description.replace(`${matchedType} - `, "").replace(matchedType, "") : leave.description);
                        } else {
                          setDescription(leave.description);
                        }
                        setEditingLeaveId(leave.id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <Pencil size={15} />
                      Düzenle
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (!window.confirm("İzin kaydı silinsin mi?")) return;
                        setState((current) => ({ ...current, leaves: current.leaves.filter((item) => item.id !== leave.id) }));
                      }}
                    >
                      <Trash2 size={15} />
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SchedulePage(props: {
  station: Station;
  state: AppState;
  year: number;
  month: number;
  holidays: PublicHoliday[];
  schedule?: Schedule;
  violations: ReturnType<typeof validateSchedule>;
  generate: (mode?: "auto" | "ai", scope?: "all" | StaffDuty) => Promise<void>;
  clearSchedule: () => void;
  updateAssignment: (date: string, field: keyof ScheduleDay, value: string) => void;
  updateDriverBlock: (date: string, value: string) => void;
  toggleSplitShift: (date: string, role: "chief" | "ysp", enabled: boolean) => void;
  restoreAuto: () => void;
  produceAiNote: () => void;
  aiNote: string;
  generationNotice: string;
  currentUser: AppUser;
}) {
  const permittedDuties = userDutyPermissions(props.currentUser);
  const canUseCombinedTab = permittedDuties.length === allDutyPermissions.length;
  const [activeTab, setActiveTab] = useState<"all" | StaffDuty>(canUseCombinedTab ? "all" : (permittedDuties[0] ?? "chief"));
  useEffect(() => {
    if (activeTab === "all" && !canUseCombinedTab) setActiveTab(permittedDuties[0] ?? "chief");
    if (activeTab !== "all" && !permittedDuties.includes(activeTab)) setActiveTab(canUseCombinedTab ? "all" : (permittedDuties[0] ?? "chief"));
  }, [activeTab, canUseCombinedTab, permittedDuties]);
  const stationStaff = props.state.staff
    .filter((person) => person.stationId === props.station.id && person.active)
    .filter((person) => props.station.type !== "A2" || person.title !== "Doktor")
    .filter((person) => !isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments));
  const scheduleSummaryRows = props.schedule
    ? dutySummary(props.schedule, stationStaff).map((item) => {
      const target = targetDuties(item.staff, props.year, props.month, props.holidays, props.state.leaves);
      const targetHours = targetHoursForStaff(item.staff, props.year, props.month, props.holidays, props.state.leaves);
      const dutyHours = item.staff.cadre === "Memur" ? item.total * 24 : (item.day + item.night + item.full) * 11;
      const overtimeHours = item.staff.cadre === "4D İşçi" ? 0 : item.total > target ? Math.max(0, dutyHours - targetHours) : 0;
      const status = item.total < target ? "missing" : item.staff.cadre !== "4D İşçi" && item.total > target ? "overtime" : "ok";
      return { ...item, target, targetHours, dutyHours, overtimeHours, status };
    })
    : [];
  const allTabItems: Array<{ id: "all" | StaffDuty; label: string }> = [
    { id: "all", label: "İstasyon Nöbet Listesi" },
    { id: "chief", label: "Ekip Şefi Nöbet Listesi" },
    { id: "ysp", label: "YSP Nöbet Listesi" },
    { id: "driver", label: "Sürücü Nöbet Listesi" },
  ];
  const tabItems = allTabItems.filter((tab) => tab.id === "all" ? canUseCombinedTab : permittedDuties.includes(tab.id));
  const headers = activeTab === "all"
    ? ["Tarih ve Gün", "Ekip Şefi", "YSP", "Gündüz Sürücü", "Gece Sürücü"]
    : activeTab === "chief"
      ? ["Tarih ve Gün", "Ekip Şefi"]
      : activeTab === "ysp"
        ? ["Tarih ve Gün", "YSP"]
        : ["Tarih ve Gün", "Gündüz Sürücü", "Gece Sürücü"];
  const isExternal = (person: Staff) => isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments);
  const assignmentOptions = (role: DutyRole, currentValue?: string, shift?: DriverShift) =>
    stationStaff.filter((person) => {
      if (person.id === currentValue) return true;
      if (isExternal(person)) return false;
      if (!canServeRole(person, role, props.station)) return false;
      if (role !== "driver" || !shift) return true;
      if (shift === "full") return canServeDriverShift(person, "full", props.station);
      // Manuel düzenlemede memur önce gündüz/gece kutusundan seçilebilir.
      // Aynı memur diğer yarıya da seçildiğinde satır otomatik 24 saate dönüşür.
      return person.cadre === "Memur" || canServeDriverShift(person, shift, props.station);
    });
  const invalidAssignment = (person: Staff | undefined, role: DutyRole, shift?: DriverShift) => {
    if (!person) return false;
    if (!canServeRole(person, role, props.station) || isExternal(person)) return true;
    if (role !== "driver" || !shift) return false;
    if ((shift === "day" || shift === "night") && person.cadre === "Memur") return false;
    return !canServeDriverShift(person, shift, props.station);
  };
  const renderAssignmentCell = (day: ScheduleDay, field: keyof ScheduleDay, shift?: DriverShift) => {
    const role = fieldRole(field);
    const currentValue = day[field];
    const currentStaff = stationStaff.find((person) => person.id === currentValue);
    const invalid = invalidAssignment(currentStaff, role, shift);
    return (
      <td key={field} className={invalid ? "invalid-cell" : ""}>
        <select
          value={typeof currentValue === "string" ? currentValue : ""}
          onChange={(event) => props.updateAssignment(day.date, field, event.target.value)}
        >
          <option value="">Boş</option>
          {assignmentOptions(role, typeof currentValue === "string" ? currentValue : undefined, shift).map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}{role !== "driver" && !canServeRole(person, role, props.station) ? " (uygunsuz)" : ""}
              {isExternal(person) ? " (dış görevlendirme)" : ""}
            </option>
          ))}
        </select>
      </td>
    );
  };
  const renderRoleCell = (day: ScheduleDay, role: "chief" | "ysp") => {
    const primaryField = role === "chief" ? "chiefId" : "yspId";
    const secondField = role === "chief" ? "chiefSecondId" : "yspSecondId";
    // Bölme modu ikinci personel seçilmeden önce açılabilmelidir. Saat alanı,
    // kullanıcının "İkiye böl" eylemini kalıcı olarak temsil eder.
    const split = Boolean(day[secondField] || day[`${role}StartTime` as keyof ScheduleDay]);
    const prefix = role === "chief" ? "chief" : "ysp";
    return (
      <td className="split-shift-cell">
        <div className="split-person-row">
          <select value={(day[primaryField] as string | undefined) ?? ""} onChange={(event) => props.updateAssignment(day.date, primaryField, event.target.value)}>
            <option value="">Boş</option>
            {assignmentOptions(role, day[primaryField] as string | undefined).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
          {split && <span className="shift-time shift-time-edit">
            <input aria-label="Başlangıç saati" type="time" value={(day[`${prefix}StartTime` as keyof ScheduleDay] as string) ?? "08:00"} onChange={(event) => props.updateAssignment(day.date, `${prefix}StartTime` as keyof ScheduleDay, event.target.value)} />
            <span>–</span>
            <input aria-label="Bitiş saati" type="time" value={(day[`${prefix}EndTime` as keyof ScheduleDay] as string) ?? "20:00"} onChange={(event) => props.updateAssignment(day.date, `${prefix}EndTime` as keyof ScheduleDay, event.target.value)} />
          </span>}
        </div>
        {split ? (
          <>
            <div className="split-person-row">
              <select value={(day[secondField] as string | undefined) ?? ""} onChange={(event) => props.updateAssignment(day.date, secondField, event.target.value)}>
                <option value="">İkinci personel</option>
                {assignmentOptions(role, day[secondField] as string | undefined).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
              <span className="shift-time shift-time-edit">
                <input aria-label="İkinci başlangıç saati" type="time" value={(day[`${prefix}SecondStartTime` as keyof ScheduleDay] as string) ?? "20:00"} onChange={(event) => props.updateAssignment(day.date, `${prefix}SecondStartTime` as keyof ScheduleDay, event.target.value)} />
                <span>–</span>
                <input aria-label="İkinci bitiş saati" type="time" value={(day[`${prefix}SecondEndTime` as keyof ScheduleDay] as string) ?? "08:00"} onChange={(event) => props.updateAssignment(day.date, `${prefix}SecondEndTime` as keyof ScheduleDay, event.target.value)} />
              </span>
            </div>
            <button type="button" className="split-link" onClick={() => props.toggleSplitShift(day.date, role, false)}>Tek vardiyaya dön</button>
          </>
        ) : <button type="button" className="split-link" onClick={() => props.toggleSplitShift(day.date, role, true)}>+ İkiye böl (08–20 / 20–08)</button>}
      </td>
    );
  };
  const renderDriverCells = (day: ScheduleDay) =>
    day.fullDriverId ||
    (day.dayDriverId && day.dayDriverId === day.nightDriverId && stationStaff.find((person) => person.id === day.dayDriverId)?.cadre === "Memur") ? (
      <td
        colSpan={2}
        className={invalidAssignment(stationStaff.find((person) => person.id === (day.fullDriverId ?? day.dayDriverId)), "driver", "full") ? "invalid-cell" : ""}
      >
        <select value={day.fullDriverId ?? day.dayDriverId ?? ""} onChange={(event) => props.updateDriverBlock(day.date, event.target.value)}>
          <option value="">Boş</option>
          {assignmentOptions("driver", day.fullDriverId ?? day.dayDriverId, "full").map((person) => (
            <option key={person.id} value={person.id}>{person.fullName}{isExternal(person) ? " (dış görevlendirme)" : ""}</option>
          ))}
        </select>
      </td>
    ) : (
      <>{renderAssignmentCell(day, "dayDriverId", "day")}{renderAssignmentCell(day, "nightDriverId", "night")}</>
    );

  return (
    <section className="page">
      <div className="schedule-tabs" role="tablist" aria-label="Nöbet listeleri">
        {tabItems.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <button className="primary-button" onClick={() => void props.generate("ai", activeTab)}>
          <Sparkles size={16} />
          {activeTab === "all" ? "AI ile Listeyi Hazırla" : `AI ile ${staffDutyLabel(activeTab)} Listesini Hazırla`}
        </button>
        <button type="button" onClick={() => void props.generate("auto", activeTab)}>Hızlı Yedek Oluştur</button>
        <button onClick={props.restoreAuto}>
          <RotateCcw size={16} />
          Son Otomatiğe Dön
        </button>
        <button type="button" className="danger-button" onClick={props.clearSchedule}>
          <Trash2 size={16} />
          Listeyi Temizle
        </button>
        <button onClick={props.produceAiNote}>
          <Sparkles size={16} />
          AI Önerisi
        </button>
        {props.schedule && (
          <>
            <button onClick={() => exportExcel(props.station, props.schedule!, props.state.staff, props.holidays, props.state.leaves, props.state.dutyRequests)}>
              <Download size={16} />
              Excel
            </button>
            <button onClick={() => exportWord(props.station, props.schedule!, props.state.staff, props.holidays, props.state.leaves, props.state.dutyRequests)}>
              <Download size={16} />
              Word
            </button>
            <button onClick={() => exportPdf(props.station, props.schedule!, props.state.staff, props.holidays, props.state.leaves, props.state.dutyRequests)}>
              <Download size={16} />
              PDF
            </button>
          </>
        )}
      </div>
      {props.generationNotice && <p className={props.generationNotice.includes("imkansız") ? "form-error" : "save-notice"}>{props.generationNotice}</p>}
      {props.schedule ? (
        <>
        <div className="schedule-layout">
          <div className="panel table-panel schedule-table">
            <h3>{stationLabel(props.station)} {props.year} {monthName(props.month)} Nöbet Çizelgesi</h3>
            <table>
              <thead>
                <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {props.schedule.days.map((day) => (
                  <tr key={day.date}>
                    <td>{formatDateAndDay(day.date)}</td>
                    {(activeTab === "all" || activeTab === "chief") && renderRoleCell(day, "chief")}
                    {(activeTab === "all" || activeTab === "ysp") && renderRoleCell(day, "ysp")}
                    {(activeTab === "all" || activeTab === "driver") && renderDriverCells(day)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="panel warnings">
            <h3>Kontrol Paneli</h3>
            {props.aiNote && <p className="ai-note">{props.aiNote}</p>}
            {props.violations.length === 0 ? <p className="success">Kritik kural ihlali görünmüyor.</p> : null}
            {props.violations.map((violation) => (
              <div key={violation.id} className={`warning ${violation.severity}`}>
                <AlertTriangle size={16} />
                <span>{violation.date ? `${violation.date}: ` : ""}{violation.message}</span>
              </div>
            ))}
          </aside>
        </div>
        <div className="panel table-panel schedule-summary">
          <h3>Nöbet Sayısı Çizelgesi</h3>
          <table>
            <thead>
              <tr>
                <th>Personel</th>
                <th>Ünvan</th>
                <th>Kadro</th>
                <th>Hedef</th>
                <th>Yazılan</th>
                <th>Gündüz/12</th>
                <th>Gece/12</th>
                <th>24 Saat</th>
                <th>Hedef Saat</th>
                <th>Tuttuğu Saat</th>
                <th>Fazla Mesai</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {scheduleSummaryRows.map((row) => (
                <tr key={row.staff.id} className={`summary-${row.status}`}>
                  <td>{row.staff.fullName}</td>
                  <td>{row.staff.title}</td>
                  <td>{row.staff.cadre}</td>
                  <td>{row.target}</td>
                  <td>{row.total}</td>
                  <td>{row.day}</td>
                  <td>{row.night}</td>
                  <td>{row.full}</td>
                  <td>{row.targetHours.toFixed(2)}</td>
                  <td>{row.dutyHours.toFixed(2)}</td>
                  <td>{row.overtimeHours.toFixed(2)}</td>
                  <td>{row.status === "missing" ? "Eksik" : row.status === "overtime" ? "Fazla mesai" : "Uygun"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="empty-state">Seçili ay için çizelge yok. Otomatik oluştur ile başlayın.</div>
      )}
    </section>
  );
}

function ArchivePage(props: {
  state: AppState;
  stationIds: string[];
  setYear: (value: number) => void;
  setMonth: (value: number) => void;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  return (
    <section className="page panel table-panel">
      <h3>Kayıtlı Çizelgeler</h3>
      <table>
        <tbody>
          {props.state.schedules.filter((schedule) => props.stationIds.includes(schedule.stationId)).map((schedule) => (
            <tr key={schedule.id}>
              <td>{stationLabel(props.state.stations.find((station) => station.id === schedule.stationId))}</td>
              <td>{schedule.year} {monthName(schedule.month)}</td>
              <td>{schedule.days.length} gün</td>
              <td>
                <button
                  onClick={() => {
                    props.setYear(schedule.year);
                    props.setMonth(schedule.month);
                    navigate("/nobet-cizelgesi");
                  }}
                >
                  Aç
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    if (!window.confirm(`${schedule.year} ${monthName(schedule.month)} çizelgesini silmek istediğinizden emin misiniz?`)) return;
                    props.setState((current) => ({
                      ...current,
                      schedules: current.schedules.filter((item) => item.id !== schedule.id),
                      changeLogs: current.changeLogs.filter((log) => log.scheduleId !== schedule.id),
                    }));
                  }}
                >
                  <Trash2 size={15} />
                  Sil
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Değişiklik Geçmişi</h3>
      {props.state.changeLogs.slice(0, 20).map((log) => (
        <p key={log.id} className="log-line">
          {new Date(log.changedAt).toLocaleString("tr-TR")} - {log.changedBy} - {log.date} - {String(log.field)}
        </p>
      ))}
    </section>
  );
}

function OvertimePage(props: {
  state: AppState;
  year: number;
  month: number;
  holidays: PublicHoliday[];
  stationIds: string[];
}) {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [stationId, setStationId] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [titleFilter, setTitleFilter] = useState<StaffTitle | "all">("all");
  const [cadreFilter, setCadreFilter] = useState<Cadre | "all">("all");
  const visibleStationIds = stationId === "all" ? props.stationIds : [stationId];
  const rows = buildOvertimeRows({
    schedules: props.state.schedules,
    stations: props.state.stations,
    staff: props.state.staff,
    leaves: props.state.leaves,
    holidays: props.holidays,
    monthlyAssignments: props.state.staffMonthlyAssignments,
    year: props.year,
    month: period === "monthly" ? props.month : undefined,
    stationIds: visibleStationIds,
  })
    .filter((row) => (staffId === "all" ? true : row.staff.id === staffId))
    .filter((row) => (titleFilter === "all" ? true : row.staff.title === titleFilter))
    .filter((row) => (cadreFilter === "all" ? true : row.staff.cadre === cadreFilter));
  const visibleStaff = props.state.staff
    .filter((person) => visibleStationIds.includes(person.stationId))
    .filter((person) => period !== "monthly" || !isExternallyAssigned(person.id, props.year, props.month, props.state.staffMonthlyAssignments))
    .filter((person) => titleFilter === "all" || person.title === titleFilter)
    .filter((person) => cadreFilter === "all" || person.cadre === cadreFilter);
  const title = overtimeReportTitle(props.year, period === "monthly" ? props.month : undefined);
  const totalOvertime = rows.reduce((total, row) => total + row.overtimeHours, 0);
  const memurOvertime = rows.filter((row) => row.staff.cadre === "Memur").reduce((total, row) => total + row.overtimeHours, 0);
  const workerOvertime = rows.filter((row) => row.staff.cadre === "4D İşçi").reduce((total, row) => total + row.overtimeHours, 0);

  return (
    <section className="page">
      <div className="toolbar">
        <select value={period} onChange={(event) => setPeriod(event.target.value as "monthly" | "yearly")}>
          <option value="monthly">Aylık</option>
          <option value="yearly">Yıllık</option>
        </select>
        <select value={stationId} onChange={(event) => setStationId(event.target.value)}>
          <option value="all">Tüm yetkili istasyonlar</option>
          {props.state.stations
            .filter((station) => props.stationIds.includes(station.id))
            .map((station) => (
              <option key={station.id} value={station.id}>
                {stationLabel(station)}
              </option>
            ))}
        </select>
        <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
          <option value="all">Tüm personel</option>
          {visibleStaff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </select>
        <select value={titleFilter} onChange={(event) => setTitleFilter(event.target.value as StaffTitle | "all")}>
          <option value="all">Tüm ünvanlar</option>
          {titles.map((titleOption) => (
            <option key={titleOption} value={titleOption}>
              {titleOption}
            </option>
          ))}
        </select>
        <select value={cadreFilter} onChange={(event) => setCadreFilter(event.target.value as Cadre | "all")}>
          <option value="all">Tüm kadrolar</option>
          {cadres.map((cadre) => (
            <option key={cadre} value={cadre}>
              {cadre}
            </option>
          ))}
        </select>
        <button onClick={() => exportOvertimeExcel(title, rows)}>
          <Download size={16} />
          Excel
        </button>
        <button onClick={() => exportOvertimeWord(title, rows)}>
          <Download size={16} />
          Word
        </button>
        <button onClick={() => exportOvertimePdf(title, rows)}>
          <Download size={16} />
          PDF
        </button>
      </div>
      <div className="stats-grid">
        <Stat label="Rapor" value={title} />
        <Stat label="Personel Satırı" value={rows.length} />
        <Stat label="Toplam Fazla Mesai" value={`${totalOvertime.toFixed(2)} saat`} tone={totalOvertime > 0 ? "danger" : "ok"} />
        <Stat label="Memur Fazla Mesai" value={`${memurOvertime.toFixed(2)} saat`} />
        <Stat label="4D İşçi Fazla Mesai" value={`${workerOvertime.toFixed(2)} saat`} />
      </div>
      <div className="panel">
        <p className="helper-text">
          Memur nöbeti 24 saat, 4D işçi nöbeti 11 saat hesaplanır. Hedef saat memurda çalışılan gün x 8, 4D işçide çalışılan gün x 7.5 olarak ayrı hesaplanır.
        </p>
      </div>
      <div className="panel table-panel">
        <h3>Fazla Mesai Tablosu</h3>
        <table>
          <thead>
            <tr>
              <th>İstasyon</th>
              <th>Personel</th>
              <th>Ünvan</th>
              <th>Kadro</th>
              <th>Ay</th>
              <th>Çalışılan Gün</th>
              <th>Hedef Nöbet</th>
              <th>Hedef Saat</th>
              <th>Yazılan Nöbet</th>
              <th>Yazılan Saat</th>
              <th>Fark Saat</th>
              <th>Fazla Mesai</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.staff.id}-${row.year}-${row.month}`}>
                <td>{row.stationName}</td>
                <td>{row.staff.fullName}</td>
                <td>{row.staff.title}</td>
                <td>{row.staff.cadre}</td>
                <td>{monthName(row.month)}</td>
                <td>{row.workedDays}</td>
                <td>{row.targetDuties.toFixed(2)}</td>
                <td>{row.targetHours.toFixed(2)}</td>
                <td>{row.scheduledDuties}</td>
                <td>{row.scheduledHours.toFixed(2)}</td>
                <td>{row.differenceHours.toFixed(2)}</td>
                <td>{row.overtimeHours.toFixed(2)}</td>
                <td>{row.annualLeaveBlocked ? "Yıllık izin nedeniyle fazla mesai kapalı" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="helper-text">Bu filtre için çizelge bulunamadı. Önce nöbet listesi oluşturun.</p>}
      </div>
    </section>
  );
}

function ImportPage(props: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  currentUser: AppUser;
  year: number;
  month: number;
}) {
  const importStations = isAdmin(props.currentUser)
    ? props.state.stations
    : props.state.stations.filter((station) => props.currentUser.stationIds.includes(station.id));
  const [importStationId, setImportStationId] = useState(importStations[0]?.id ?? "");
  const [importRows, setImportRows] = useState<ImportedStaffRow[]>([]);
  const [selectedImportKeys, setSelectedImportKeys] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const selectedRows = importRows.filter((row) => selectedImportKeys.includes(importRowKey(row)));

  useEffect(() => {
    if (!importStations.some((station) => station.id === importStationId)) setImportStationId(importStations[0]?.id ?? "");
  }, [importStationId, importStations]);

  const previewImportRows = (parsedRows: ImportedStaffRow[], emptyMessage?: string) => {
    const uniqueRows = uniqueImportRows(parsedRows);
    setImportRows(uniqueRows);
    setSelectedImportKeys(uniqueRows.map(importRowKey));
    setImportNotice(
      uniqueRows.length
        ? `${uniqueRows.length} personel okundu. Aynı isimler tekilleştirildi; istemediğiniz satırların onayını kaldırabilirsiniz.`
        : (emptyMessage ?? "Personel okunamadı. Daha net ve yatay kırpılmış tablo görüntüsü deneyin."),
    );
  };

  const readImportFile = async (file: File) => {
    setImportBusy(true);
    setImportNotice(file.type.startsWith("image/") ? "WhatsApp görüntüsü tablo olarak okunuyor. Bu işlem 10-30 saniye sürebilir." : "");
    try {
      let parsedRows: ImportedStaffRow[] = [];
      let emptyMessage = "";
      if (file.type.startsWith("image/")) {
        const geminiKey = props.state.settings.aiApiKeys.gemini ?? "";
        const canUseAiImport = Boolean(geminiKey.trim()) || !["localhost", "127.0.0.1"].includes(window.location.hostname);
        if (canUseAiImport) {
          try {
            parsedRows = await extractImportRowsWithGemini(file, geminiKey, setImportNotice);
            setImportNotice(`${parsedRows.length} personel AI ile okundu. Önizlemeyi kontrol edin.`);
          } catch (error) {
            emptyMessage = `AI görsel okuma başarısız: ${error instanceof Error ? error.message : String(error || "bilinmeyen hata")}. Ayarlar > Gemini API anahtarını kontrol edin.`;
            setImportNotice(`${emptyMessage} Yerel OCR deneniyor...`);
          }
        } else {
          emptyMessage = "Gemini API anahtarı yok. Ayarlar > Gemini API anahtarı girin veya public_html/api-config.php içine ekleyin.";
          setImportNotice(`${emptyMessage} Yerel OCR deneniyor...`);
        }
        if (parsedRows.length > 0) {
          setImportNotice(`${parsedRows.length} personel AI ile okundu; renkli ve geçici görev satırları için yerel OCR ile ikinci kontrol yapılıyor...`);
          const ocrRows = await extractImportRowsFromImage(file, setImportNotice).catch(() => []);
          parsedRows = mergeImportedStaffRows(parsedRows, ocrRows);
        }
        if (!parsedRows.length) {
          parsedRows = await extractImportRowsFromImage(file, setImportNotice);
        }
        if (!parsedRows.length && !emptyMessage) {
          emptyMessage = "AI bağlantısı çalıştı ama personel satırı döndürmedi. Görselde tablo başlıkları ve satırlar tam görünmeli.";
        }
      } else {
        parsedRows = parseStaffImport(await file.text());
      }
      previewImportRows(parsedRows, emptyMessage);
    } catch (error) {
      setImportNotice(`Personel okunamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}. Ayarlar > Gemini API anahtarı girili olmalı.`);
    } finally {
      setImportBusy(false);
    }
  };

  const applyImport = () => {
    if (!importStationId || selectedRows.length === 0) return;
    const approvedRows = uniqueImportRows(selectedRows);
    props.setState((current) => {
      const importedNames = new Set(approvedRows.map((row) => normalizeImportText(row.fullName)));
      const updatedExisting = current.staff.map((person) => {
        if (person.stationId !== importStationId || !importedNames.has(normalizeImportText(person.fullName))) return person;
        const row = approvedRows.find((item) => normalizeImportText(item.fullName) === normalizeImportText(person.fullName));
        return row ? { ...person, title: row.title, cadre: row.cadre, notes: row.notes || person.notes } : person;
      });
      const existingNames = new Set(updatedExisting.filter((person) => person.stationId === importStationId).map((person) => normalizeImportText(person.fullName)));
      const newStaff = approvedRows
        .filter((row) => !existingNames.has(normalizeImportText(row.fullName)))
        .map((row): Staff => ({
          id: crypto.randomUUID(),
          stationId: importStationId,
          fullName: row.fullName,
          title: row.title,
          cadre: row.cadre,
          active: true,
          overtimeAllowed: false,
          notes: row.notes,
        }));
      const nextStaff = [...updatedExisting, ...newStaff];
      const assignmentRows = approvedRows.filter(isTemporaryAssignmentImportRow);
      const newAssignments = assignmentRows
        .map((row) => {
          const person = nextStaff.find((staffItem) => staffItem.stationId === importStationId && normalizeImportText(staffItem.fullName) === normalizeImportText(row.fullName));
          if (!person) return null;
          const alreadyAssigned = current.staffMonthlyAssignments.some((assignment) => assignment.staffId === person.id && !assignment.returnedAt);
          if (alreadyAssigned) return null;
          return {
            id: crypto.randomUUID(),
            staffId: person.id,
            year: props.year,
            month: props.month,
            type: "Dış Görevlendirme" as const,
            description: row.assignmentDescription || row.notes || "Import ile geçici görevlendirme okundu",
            originalStationId: person.stationId,
            indefinite: true,
            createdBy: props.currentUser.username,
            createdAt: new Date().toISOString(),
          };
        })
        .filter((assignment): assignment is NonNullable<typeof assignment> => Boolean(assignment));
      return { ...current, staff: nextStaff, staffMonthlyAssignments: [...current.staffMonthlyAssignments, ...newAssignments] };
    });
    const assignmentCount = approvedRows.filter(isTemporaryAssignmentImportRow).length;
    setImportNotice(`${approvedRows.length} onaylı personel oluşturuldu/güncellendi. ${assignmentCount ? `${assignmentCount} kişi Görevlendirme İstasyonu'na atandı. ` : ""}Aynı personeller tekrar eklenmedi.`);
  };

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Planlama</h1>
          <p>WhatsApp görüntüsündeki planlama/personel tablosunu doğrudan okuyup aktarır.</p>
        </div>
      </div>
      <div className="panel import-panel">
        <h3>Aylık Görevlendirme Personel Aktarımı</h3>
        <p className="helper-text">
          Görüntüyü Excel'e çevirmeden doğrudan okur. Gemini API anahtarı varsa AI görsel okuma kullanır; yoksa yerel OCR dener.
        </p>
        <label>
          Personelin ekleneceği istasyon
          <select value={importStationId} onChange={(event) => setImportStationId(event.target.value)}>
            {importStations.map((station) => (
              <option key={station.id} value={station.id}>
                {stationLabel(station)}
              </option>
            ))}
          </select>
        </label>
        <label>
          WhatsApp tablo görüntüsü yükle
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*,.csv,.tsv,.txt,text/csv,text/plain"
            disabled={importBusy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) await readImportFile(file);
            }}
          />
        </label>
        <div className="row-actions">
          <button type="button" className="primary-button" disabled={!selectedRows.length || !importStationId || importBusy} onClick={applyImport}>
            {importBusy ? "Okunuyor" : "Onaylı Personelleri Oluştur / Güncelle"}
          </button>
          <button type="button" disabled={!importRows.length || importBusy} onClick={() => setSelectedImportKeys(importRows.map(importRowKey))}>Tümünü Seç</button>
          <button type="button" disabled={!importRows.length || importBusy} onClick={() => setSelectedImportKeys([])}>Tümünü Kaldır</button>
          <button
            type="button"
            disabled={importBusy}
            onClick={() => {
              setImportRows([]);
              setSelectedImportKeys([]);
              setImportNotice("");
            }}
          >
            Temizle
          </button>
        </div>
        {importNotice && <p className="save-notice">{importNotice}</p>}
        <div className="stats-grid">
          <Stat label="Okunan Personel" value={importRows.length} />
          <Stat label="Onaylı Personel" value={selectedRows.length} />
          <Stat label="Hedef İstasyon" value={stationLabel(importStations.find((station) => station.id === importStationId))} />
        </div>
        {importRows.length > 0 && (
          <div className="table-panel import-preview">
            <table>
              <thead>
                <tr>
                  <th>Onay</th>
                  <th>Ad Soyad</th>
                  <th>Ünvan</th>
                  <th>Kadro</th>
                  <th>Aktarım Durumu</th>
                  <th>Açıklama / İzin Notu</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row) => {
                  const key = importRowKey(row);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedImportKeys.includes(key)}
                          onChange={(event) =>
                            setSelectedImportKeys((current) =>
                              event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                            )
                          }
                        />
                      </td>
                      <td>{row.fullName}</td>
                      <td>{row.title}</td>
                      <td>{row.cadre}</td>
                      <td>{isTemporaryAssignmentImportRow(row) ? <span className="pill warning">Görevlendirilecek</span> : "Asıl istasyona eklenecek"}</td>
                      <td>{row.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const activityTypeLabels: Record<UserActivityLog["action_type"], string> = {
  login: "Giriş",
  logout: "Çıkış",
  navigation: "Sayfa",
  click: "Tıklama",
  change: "Değişiklik",
  save: "Kaydetme",
  create: "Oluşturma",
  update: "Güncelleme",
  delete: "Silme",
  export: "Dışa aktarma",
  import: "İçe aktarma",
  ai: "AI işlemi",
  other: "Diğer",
};

function humanReadableActivity(log: UserActivityLog) {
  const exactLabels: Record<string, string> = {
    Yönet: "Kullanıcı yönetim penceresi açıldı.",
    İncele: "Log kaydının ayrıntıları incelendi.",
    Kapat: "Açık ayrıntı penceresi kapatıldı.",
    Yenile: "Log kayıtları yenilendi.",
    "CSV İndir": "Log kayıtları CSV dosyası olarak indirildi.",
    "Filtreleri Temizle": "Log filtreleri temizlendi.",
    "Sisteme giriş yaptı": "Sisteme giriş yaptı.",
  };
  let label = exactLabels[log.action_label] ?? log.action_label;
  const oldPageMatch = label.match(/^Sayfa açıldı:\s*(\/[^\s]+)$/i);
  if (oldPageMatch) label = `${routeLabels[oldPageMatch[1]] ?? oldPageMatch[1]} sayfası açıldı.`;
  const technicalFields: Record<string, string> = {
    fullDriverId: "24 Saat Sürücü",
    dayDriverId: "Gündüz Sürücüsü",
    nightDriverId: "Gece Sürücüsü",
    chiefId: "Ekip Şefi",
    chiefSecondId: "İkinci Ekip Şefi",
    yspId: "YSP",
    yspSecondId: "İkinci YSP",
    doctorId: "Doktor",
  };
  for (const [technical, turkish] of Object.entries(technicalFields)) label = label.replaceAll(technical, turkish);
  return label || "Sistemde işlem yapıldı.";
}

const scheduleFieldLabels: Partial<Record<keyof ScheduleDay, string>> = {
  doctorId: "Doktor",
  chiefId: "Ekip Şefi",
  chiefSecondId: "İkinci Ekip Şefi",
  yspId: "YSP",
  yspSecondId: "İkinci YSP",
  dayDriverId: "Gündüz Sürücüsü",
  nightDriverId: "Gece Sürücüsü",
  fullDriverId: "24 Saat Sürücü",
};

function ActivityLogsPage({ state }: { state: AppState }) {
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [browserFilter, setBrowserFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [ipFilter, setIpFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const refresh = async () => {
    setLoading(true);
    setNotice("");
    try {
      setLogs(await loadUserActivityLogs(3000));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Log kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const legacyLogs = useMemo<UserActivityLog[]>(() => state.changeLogs.map((log) => {
    const schedule = state.schedules.find((item) => item.id === log.scheduleId);
    const station = state.stations.find((item) => item.id === schedule?.stationId);
    const previousName = staffName(state.staff, log.previousStaffId) || "Boş";
    const nextName = staffName(state.staff, log.nextStaffId) || "Boş";
    const fieldName = scheduleFieldLabels[log.field] ?? "Nöbet görevi";
    return {
      id: `legacy-${log.id}`,
      user_id: "",
      username: log.changedBy,
      occurred_at: log.changedAt,
      action_type: "update",
      action_label: `${log.date} tarihinde ${fieldName}, “${previousName}” yerine “${nextName}” olarak değiştirildi.`,
      route: "/nobet-cizelgesi",
      target: fieldName,
      details: { kaynak: "Eski çizelge değişiklik kaydı", istasyon: stationLabel(station), tarih: log.date, alan: fieldName, öncekiPersonel: previousName, yeniPersonel: nextName },
      device_type: "Geçmiş kayıt",
      device_name: "Bu eski kayıtta cihaz bilgisi tutulmamış",
    };
  }), [state.changeLogs, state.schedules, state.staff, state.stations]);
  const allLogs = useMemo(() => [...logs, ...legacyLogs].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()), [legacyLogs, logs]);
  const users = [...new Set(allLogs.map((log) => log.username))].sort((a, b) => a.localeCompare(b, "tr"));
  const devices = [...new Set(allLogs.map((log) => log.device_type).filter(Boolean))] as string[];
  const browsers = [...new Set(allLogs.map((log) => log.browser).filter(Boolean))] as string[];
  const routes = [...new Set(allLogs.map((log) => log.route).filter(Boolean))];
  const ips = [...new Set(allLogs.map((log) => log.ip_address).filter(Boolean))] as string[];
  const filteredLogs = allLogs.filter((log) => {
    const haystack = `${log.username} ${humanReadableActivity(log)} ${routeLabels[log.route] ?? log.route} ${log.device_name ?? ""} ${log.device_type ?? ""} ${log.operating_system ?? ""} ${log.browser ?? ""} ${log.ip_address ?? ""} ${log.city ?? ""}`.toLocaleLowerCase("tr-TR");
    return (userFilter === "all" || log.username === userFilter)
      && (typeFilter === "all" || log.action_type === typeFilter)
      && (deviceFilter === "all" || log.device_type === deviceFilter)
      && (browserFilter === "all" || log.browser === browserFilter)
      && (routeFilter === "all" || log.route === routeFilter)
      && (ipFilter === "all" || log.ip_address === ipFilter)
      && (!dateFilter || log.occurred_at.slice(0, 10) === dateFilter)
      && (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase("tr-TR")));
  });

  const todayCount = allLogs.filter((log) => new Date(log.occurred_at).toDateString() === new Date().toDateString()).length;
  const uniqueSessions = new Set(allLogs.map((log) => log.session_id).filter(Boolean)).size;

  const exportCsv = () => {
    const headers = ["Tarih Saat", "Kullanıcı", "İşlem", "Türkçe Açıklama", "Sayfa", "Cihaz Türü", "Cihaz", "İşletim Sistemi", "Tarayıcı", "IP Adresi", "Şehir", "Ülke", "Ekran", "Oturum"];
    const rows = filteredLogs.map((log) => [
      new Date(log.occurred_at).toLocaleString("tr-TR"), log.username, activityTypeLabels[log.action_type], humanReadableActivity(log), routeLabels[log.route] ?? log.route,
      log.device_type ?? "", log.device_name ?? "", log.operating_system ?? "", log.browser ?? "", log.ip_address ?? "", log.city ?? "", log.country ?? "", log.screen_size ?? "", log.session_id ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `log-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className="page activity-logs-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">Yönetim ve güvenlik</span>
          <h2>Log Kayıtları</h2>
          <p>Tüm sistem hareketlerini anlaşılır Türkçe açıklamalar, cihaz ve bağlantı bilgileriyle inceleyin.</p>
        </div>
        <div className="activity-log-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading}><RotateCcw size={18} /> {loading ? "Yükleniyor" : "Yenile"}</button>
          <button type="button" className="primary" onClick={exportCsv} disabled={!filteredLogs.length}><Download size={18} /> CSV İndir</button>
        </div>
      </div>

      <div className="activity-log-stats">
        <article><span>Toplam hareket</span><strong>{allLogs.length.toLocaleString("tr-TR")}</strong><small>Canlı ve geçmiş kayıtlar</small></article>
        <article><span>Bugünkü hareket</span><strong>{todayCount.toLocaleString("tr-TR")}</strong><small>Güncel kullanım</small></article>
        <article><span>Kullanıcı</span><strong>{users.length}</strong><small>Log üreten hesap</small></article>
        <article><span>Oturum</span><strong>{uniqueSessions}</strong><small>Farklı cihaz oturumu</small></article>
      </div>

      <div className="panel activity-log-filter-panel">
        <label className="activity-filter-search"><span>Detaylı ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İşlem, personel, cihaz, IP veya sayfa ara" /></label>
        <label><span>Kullanıcı</span><select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}><option value="all">Tüm kullanıcılar</option>{users.map((username) => <option key={username} value={username}>{username}</option>)}</select></label>
        <label><span>İşlem türü</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tüm işlemler</option>{Object.entries(activityTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Sayfa / bölüm</span><select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}><option value="all">Tüm sayfalar</option>{routes.map((route) => <option key={route} value={route}>{routeLabels[route] ?? route}</option>)}</select></label>
        <label><span>Cihaz türü</span><select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}><option value="all">Tüm cihazlar</option>{devices.map((device) => <option key={device} value={device}>{device}</option>)}</select></label>
        <label><span>Tarayıcı</span><select value={browserFilter} onChange={(event) => setBrowserFilter(event.target.value)}><option value="all">Tüm tarayıcılar</option>{browsers.map((browser) => <option key={browser} value={browser}>{browser}</option>)}</select></label>
        <label><span>IP adresi</span><select value={ipFilter} onChange={(event) => setIpFilter(event.target.value)}><option value="all">Tüm IP adresleri</option>{ips.map((ip) => <option key={ip} value={ip}>{ip}</option>)}</select></label>
        <label><span>Tarih</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
        <button type="button" onClick={() => { setQuery(""); setUserFilter("all"); setTypeFilter("all"); setDeviceFilter("all"); setBrowserFilter("all"); setRouteFilter("all"); setIpFilter("all"); setDateFilter(""); }}>Filtreleri Temizle</button>
      </div>

      {notice && <div className="warning-box">{notice}</div>}
      <div className="panel activity-log-table-panel">
        <div className="activity-log-result-bar"><strong>{filteredLogs.length.toLocaleString("tr-TR")} kayıt</strong><span>Satıra tıklayarak teknik ayrıntıları açabilirsiniz.</span></div>
        <div className="table-scroll">
          <table className="activity-log-table">
            <thead><tr><th>Tarih ve saat</th><th>Kullanıcı</th><th>İşlem</th><th>Ne yaptı?</th><th>Sayfa</th><th>Cihaz</th><th>IP / Konum</th><th>Detay</th></tr></thead>
            <tbody>
              {filteredLogs.map((log) => (
                <Fragment key={log.id}>
                  <tr className={expandedId === log.id ? "expanded" : ""} onClick={() => setExpandedId(expandedId === log.id ? "" : log.id)}>
                    <td><strong>{new Date(log.occurred_at).toLocaleDateString("tr-TR")}</strong><small>{new Date(log.occurred_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></td>
                    <td><span className="user-log-avatar">{log.username.slice(0, 1).toUpperCase()}</span><strong>@{log.username}</strong></td>
                    <td><span className={`activity-type ${log.action_type}`}>{activityTypeLabels[log.action_type]}</span></td>
                    <td><strong className="activity-human-label">{humanReadableActivity(log)}</strong></td><td>{routeLabels[log.route] ?? log.route}<small><code>{log.route}</code></small></td>
                    <td><strong>{log.device_type ?? "Bilinmiyor"}</strong><small>{log.device_name ?? "-"}</small><small>{log.operating_system ?? "-"} · {log.browser ?? "-"} · {log.screen_size ?? "-"}</small></td>
                    <td><strong>{log.ip_address ?? "IP yok"}</strong><small>{[log.city, log.country].filter(Boolean).join(" · ") || "Konum yok"}</small></td><td><button type="button" className="compact">{expandedId === log.id ? "Kapat" : "İncele"}</button></td>
                  </tr>
                  {expandedId === log.id && <tr className="activity-detail-row"><td colSpan={8}><div className="activity-detail-grid"><div><span>Oturum kimliği</span><code>{log.session_id ?? "Eski kayıtta yok"}</code></div><div><span>Hedef öğe</span><strong>{log.target ?? "-"}</strong></div><div><span>Cihaz</span><strong>{log.device_name ?? "-"}</strong><small>{log.device_type ?? "-"} · {log.operating_system ?? "-"}</small></div><div><span>IP ve bağlantı</span><strong>{log.ip_address ?? "-"}</strong><small>{[log.city, log.country, log.datacenter].filter(Boolean).join(" · ") || "-"}</small></div><div className="wide"><span>Tarayıcı bilgisi</span><code>{log.user_agent ?? "Eski kayıtta tarayıcı bilgisi tutulmamış"}</code></div><div className="wide"><span>İşlem ayrıntısı</span><pre>{JSON.stringify(log.details ?? {}, null, 2)}</pre></div></div></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!loading && !filteredLogs.length && <div className="empty-state">Seçilen filtrelerle eşleşen log kaydı bulunamadı.</div>}
        </div>
      </div>
    </section>
  );
}

function SettingsPage(props: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  year: number;
  holidays: PublicHoliday[];
}) {
  const [date, setDate] = useState(`${props.year}-01-01`);
  const [name, setName] = useState("");
  const [aiTestResult, setAiTestResult] = useState("");
  const [testingProvider, setTestingProvider] = useState<Exclude<AiProvider, "local"> | "">("");
  const [backupNotice, setBackupNotice] = useState("");
  const [userNotice, setUserNotice] = useState("");
  const [managedUserId, setManagedUserId] = useState("");
  const [newUser, setNewUser] = useState<AppUser>({
    id: crypto.randomUUID(),
    username: "",
    password: "",
    fullName: "",
    role: "user",
    active: true,
    stationIds: props.state.stations[0] ? [props.state.stations[0].id] : [],
    dutyPermissions: ["chief", "ysp", "driver"],
    aiProviders: ["local"],
    canImport: true,
    mustChangePassword: true,
  });
  const managedUser = props.state.users.find((user) => user.id === managedUserId);
  return (
    <section className="page settings-page">
      <div className="settings-grid">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          props.setState((current) => ({
            ...current,
            holidays: [...current.holidays, { id: crypto.randomUUID(), date, name, manual: true }],
          }));
          setName("");
        }}
      >
        <h3>Manuel Resmi Tatil</h3>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <input placeholder="Tatil adı" value={name} onChange={(event) => setName(event.target.value)} required />
        <button className="primary-button">
          <Save size={16} />
          Kaydet
        </button>
        <button type="button" className="danger-button" onClick={() => window.confirm("Tüm bulut verileri sıfırlansın mı?") && props.setState(loadState())}>
          Verileri Sıfırla
        </button>
      </form>
      <div className="panel">
        <h3>Veri Yedekleme</h3>
        <p className="helper-text">
          Personel, istasyon, izin, çizelge ve ayarları JSON dosyası olarak indirip başka bilgisayara veya canlı siteye taşıyabilirsiniz.
        </p>
        <button type="button" className="primary-button" onClick={() => downloadStateBackup(props.state)}>
          <Download size={16} />
          Veri Yedeği Al
        </button>
        <label>
          Yedekten yükle
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const importedState = parseStateBackup(await file.text());
                if (!window.confirm("Mevcut canlı verinin üzerine yedek dosyası yüklensin mi?")) return;
                props.setState(importedState);
                setBackupNotice("Yedek buluta yüklenmek üzere hazırlandı.");
              } catch {
                setBackupNotice("Yedek dosyası okunamadı. Doğru JSON dosyasını seçin.");
              }
            }}
          />
        </label>
        {backupNotice && <p className="save-notice">{backupNotice}</p>}
      </div>
      <div className="panel">
        <h3>AI API Ayarları</h3>
        <p className="helper-text">
          AI testleri canlı sitede `api-test.php` proxy dosyası üzerinden çalışır. Yerelde `127.0.0.1` adresinde PHP çalışmadığı için test başarısız görünebilir.
        </p>
        <label>
          Varsayılan AI sağlayıcı
          <select
            value={props.state.settings.aiProvider}
            onChange={(event) =>
              props.setState((current) => ({ ...current, settings: { ...current.settings, aiProvider: event.target.value as AiProvider } }))
            }
          >
            {aiProviders.map((provider) => (
              <option key={provider} value={provider}>
                {providerLabel(provider)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gemini API anahtarı
          <input
            placeholder="Gemini API key"
            type="password"
            value={props.state.settings.aiApiKeys.gemini ?? ""}
            onChange={(event) =>
              props.setState((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  aiApiKeys: { ...current.settings.aiApiKeys, gemini: event.target.value },
                },
              }))
            }
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            setTestingProvider("gemini");
            setAiTestResult(await testAiProvider("gemini", props.state.settings.aiApiKeys.gemini ?? ""));
            setTestingProvider("");
          }}
        >
          <Sparkles size={16} />
          {testingProvider === "gemini" ? "Gemini Test Ediliyor" : "Gemini API Test"}
        </button>
        <label>
          Groq API anahtarı
          <input
            placeholder="Groq API key"
            type="password"
            value={props.state.settings.aiApiKeys.groq ?? ""}
            onChange={(event) =>
              props.setState((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  aiApiKeys: { ...current.settings.aiApiKeys, groq: event.target.value },
                },
              }))
            }
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            setTestingProvider("groq");
            setAiTestResult(await testAiProvider("groq", props.state.settings.aiApiKeys.groq ?? ""));
            setTestingProvider("");
          }}
        >
          <Sparkles size={16} />
          {testingProvider === "groq" ? "Groq Test Ediliyor" : "Groq API Test"}
        </button>
        {aiTestResult && <p className="ai-note">{aiTestResult}</p>}
        <p className="helper-text">
          API anahtarını burada kaydedebilir veya Hostinger'da `public_html/api-config.php` dosyasına koyabilirsiniz. Frontend dosyasına gömmek güvenli değildir.
        </p>
      </div>
      <div className="panel table-panel">
        <h3>{props.year} Türkiye Tatil Takvimi</h3>
        <table>
          <tbody>
            {props.holidays.map((holiday) => (
              <tr key={`${holiday.date}-${holiday.name}`}>
                <td>{holiday.date}</td>
                <td>{holiday.name}</td>
                <td>{holiday.manual ? "Manuel" : "TR"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel rules-panel">
        <h3>Nöbet Listesi Kuralları</h3>
        <p className="helper-text">
          Bu bölüm sadece admin tarafından görülebilir ve güncellenebilir. Kuralları madde madde güncel tutmak için kullanılır.
        </p>
        <textarea
          value={props.state.settings.scheduleRulesText ?? ""}
          onChange={(event) =>
            props.setState((current) => ({
              ...current,
              settings: { ...current.settings, scheduleRulesText: event.target.value },
            }))
          }
        />
        <div className="rule-preview">
          {(props.state.settings.scheduleRulesText ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => (
              <div key={`${line}-${index}`} className="rule-line">
                {line.replace(/^[-•]\s*/, "")}
              </div>
            ))}
        </div>
      </div>
      </div>
      <div className="panel user-management-panel">
        <h3>Kullanıcı ve Yetki Yönetimi</h3>
        <form
          className="form-grid user-create-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setUserNotice("");
            try {
              await createAuthUser(newUser.username, newUser.password, newUser.role);
              props.setState((current) => ({ ...current, users: [...current.users, { ...newUser, password: "" }] }));
              setUserNotice("Kullanıcı güvenli kimlik doğrulama sisteminde oluşturuldu.");
            } catch {
              setUserNotice("Kullanıcı oluşturulamadı. Kullanıcı adı benzersiz ve şifre en az 6 karakter olmalı.");
              return;
            }
            setNewUser({
              id: crypto.randomUUID(),
              username: "",
              password: "",
              fullName: "",
              role: "user",
              active: true,
              stationIds: props.state.stations[0] ? [props.state.stations[0].id] : [],
              dutyPermissions: ["chief", "ysp", "driver"],
              aiProviders: ["local"],
              canImport: true,
              mustChangePassword: true,
            });
          }}
        >
          <input placeholder="Ad soyad" value={newUser.fullName} onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })} required />
          <input placeholder="Kullanıcı adı" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} required />
          <input placeholder="Şifre" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} required />
          <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as AppUser["role"] })}>
            <option value="user">Kullanıcı</option>
            <option value="admin">Admin</option>
          </select>
          <select
            multiple
            value={newUser.aiProviders}
            onChange={(event) => setNewUser({ ...newUser, aiProviders: selectedOptions(event.currentTarget) as AiProvider[] })}
          >
            {aiProviders.map((provider) => (
              <option key={provider} value={provider}>
                {providerLabel(provider)}
              </option>
            ))}
          </select>
          <select
            multiple
            value={newUser.role === "admin" ? props.state.stations.map((station) => station.id) : newUser.stationIds}
            disabled={newUser.role === "admin"}
            onChange={(event) => setNewUser({ ...newUser, stationIds: selectedOptions(event.currentTarget) })}
          >
            {props.state.stations.map((station) => (
              <option key={station.id} value={station.id}>
                {stationLabel(station)}
              </option>
            ))}
          </select>
          <select
            multiple
            aria-label="Görev yetkileri"
            value={newUser.role === "admin" ? allDutyPermissions : (newUser.dutyPermissions ?? allDutyPermissions)}
            disabled={newUser.role === "admin"}
            onChange={(event) => setNewUser({ ...newUser, dutyPermissions: selectedOptions(event.currentTarget) as StaffDuty[] })}
          >
            <option value="chief">Ekip Şefi</option>
            <option value="ysp">YSP</option>
            <option value="driver">Sürücü</option>
          </select>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={newUser.canImport !== false}
              onChange={(event) => setNewUser({ ...newUser, canImport: event.target.checked })}
            />
            Veri import yetkisi
          </label>
          <button className="primary-button">
            <ShieldCheck size={16} />
            Kullanıcı Ekle
          </button>
          {userNotice && <p className="save-notice">{userNotice}</p>}
        </form>
        <div className="table-panel user-permission-table">
          <table>
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Rol</th>
                <th>AI</th>
                <th>İstasyon Yetkisi</th>
                <th>Görev Yetkisi</th>
                <th>Import</th>
                <th>Durum</th>
                <th>Şifre</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {props.state.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <input
                      value={user.fullName}
                      onChange={(event) =>
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) => (item.id === user.id ? { ...item, fullName: event.target.value } : item)),
                        }))
                      }
                    />
                    <input
                      value={user.username}
                      disabled
                    />
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(event) => {
                        const role = event.target.value as AppUser["role"];
                        void updateAuthUserRole(user.username, role).catch(() => setUserNotice("Kullanıcı rolü kimlik sisteminde güncellenemedi."));
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) => (item.id === user.id ? { ...item, role } : item)),
                        }));
                      }}
                    >
                      <option value="user">Kullanıcı</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <select
                      multiple
                      value={user.aiProviders}
                      onChange={(event) =>
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) =>
                            item.id === user.id ? { ...item, aiProviders: selectedOptions(event.currentTarget) as AiProvider[] } : item,
                          ),
                        }))
                      }
                    >
                      {aiProviders.map((provider) => (
                        <option key={provider} value={provider}>
                          {providerLabel(provider)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      multiple
                      value={user.role === "admin" ? props.state.stations.map((station) => station.id) : user.stationIds}
                      disabled={user.role === "admin"}
                      onChange={(event) =>
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) =>
                            item.id === user.id ? { ...item, stationIds: selectedOptions(event.currentTarget) } : item,
                          ),
                        }))
                      }
                    >
                      {props.state.stations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {stationLabel(station)}
                        </option>
                      ))}
                    </select>
                    <span className="helper-text">Çoklu seçim için Cmd/Ctrl tuşunu kullanın.</span>
                  </td>
                  <td>
                    <select
                      multiple
                      value={user.role === "admin" ? allDutyPermissions : (user.dutyPermissions ?? allDutyPermissions)}
                      disabled={user.role === "admin"}
                      onChange={(event) =>
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) =>
                            item.id === user.id ? { ...item, dutyPermissions: selectedOptions(event.currentTarget) as StaffDuty[] } : item,
                          ),
                        }))
                      }
                    >
                      <option value="chief">Ekip Şefi</option>
                      <option value="ysp">YSP</option>
                      <option value="driver">Sürücü</option>
                    </select>
                  </td>
                  <td>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={user.canImport !== false}
                        onChange={(event) =>
                          props.setState((current) => ({
                            ...current,
                            users: current.users.map((item) => (item.id === user.id ? { ...item, canImport: event.target.checked } : item)),
                          }))
                        }
                      />
                      Yetkili
                    </label>
                  </td>
                  <td>
                    <button
                      className={user.active ? "pill ok" : "pill muted"}
                      onClick={() =>
                        props.setState((current) => ({
                          ...current,
                          users: current.users.map((item) => (item.id === user.id ? { ...item, active: !item.active } : item)),
                        }))
                      }
                    >
                      {user.active ? "Aktif" : "Pasif"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={async () => {
                        const temporaryPassword = window.prompt(`${user.username} için en az 6 karakterlik geçici şifre girin:`);
                        if (!temporaryPassword) return;
                        try {
                          await resetAuthUserPassword(user.username, temporaryPassword);
                          props.setState((current) => ({
                            ...current,
                            users: current.users.map((item) =>
                              item.id === user.id ? { ...item, password: "", mustChangePassword: true } : item,
                            ),
                          }));
                          setUserNotice("Geçici şifre güncellendi; kullanıcı ilk girişte yeni şifre belirleyecek.");
                        } catch {
                          setUserNotice("Şifre sıfırlanamadı. Geçici şifre en az 6 karakter olmalı.");
                        }
                      }}
                    >
                      Sıfırla
                    </button>
                    {user.mustChangePassword && <span className="helper-text">İlk girişte şifre değiştirecek.</span>}
                  </td>
                  <td>
                    <button type="button" className="primary-button" onClick={() => setManagedUserId(user.id)}>
                      Yönet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {managedUser && (
          <div className="panel user-management-panel">
            <div className="section-header">
              <h3>{managedUser.fullName || managedUser.username} - Kullanıcı Yönetimi</h3>
              <button type="button" onClick={() => setManagedUserId("")}>Kapat</button>
            </div>
            <div className="form-grid">
              <label>
                Ad soyad
                <input
                  value={managedUser.fullName}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) => (user.id === managedUser.id ? { ...user, fullName: event.target.value } : user)),
                    }))
                  }
                />
              </label>
              <label>
                Kullanıcı adı
                <input
                  value={managedUser.username}
                  disabled
                />
              </label>
              <label>
                Parola
                <button
                  type="button"
                  onClick={async () => {
                    const temporaryPassword = window.prompt(`${managedUser.username} için en az 6 karakterlik geçici şifre girin:`);
                    if (!temporaryPassword) return;
                    try {
                      await resetAuthUserPassword(managedUser.username, temporaryPassword);
                      props.setState((current) => ({
                        ...current,
                        users: current.users.map((user) =>
                          user.id === managedUser.id ? { ...user, password: "", mustChangePassword: true } : user,
                        ),
                      }));
                      setUserNotice("Geçici şifre güncellendi; kullanıcı ilk girişte yeni şifre belirleyecek.");
                    } catch {
                      setUserNotice("Şifre sıfırlanamadı. Geçici şifre en az 6 karakter olmalı.");
                    }
                  }}
                >
                  Geçici Şifre Belirle
                </button>
              </label>
              <label>
                Rol
                <select
                  value={managedUser.role}
                  onChange={(event) => {
                    const role = event.target.value as UserRole;
                    void updateAuthUserRole(managedUser.username, role).catch(() => setUserNotice("Kullanıcı rolü kimlik sisteminde güncellenemedi."));
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) => (user.id === managedUser.id ? { ...user, role } : user)),
                    }));
                  }}
                >
                  <option value="user">Kullanıcı</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={managedUser.active}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) => (user.id === managedUser.id ? { ...user, active: event.target.checked } : user)),
                    }))
                  }
                />
                Aktif kullanıcı
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={managedUser.canImport !== false}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) => (user.id === managedUser.id ? { ...user, canImport: event.target.checked } : user)),
                    }))
                  }
                />
                Veri import yetkisi
              </label>
              <label>
                AI yetkileri
                <select
                  multiple
                  value={managedUser.aiProviders}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) =>
                        user.id === managedUser.id ? { ...user, aiProviders: selectedOptions(event.currentTarget) as AiProvider[] } : user,
                      ),
                    }))
                  }
                >
                  {aiProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabel(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                İstasyon yetkileri
                <select
                  multiple
                  value={managedUser.role === "admin" ? props.state.stations.map((station) => station.id) : managedUser.stationIds}
                  disabled={managedUser.role === "admin"}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) => (user.id === managedUser.id ? { ...user, stationIds: selectedOptions(event.currentTarget) } : user)),
                    }))
                  }
                >
                  {props.state.stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {stationLabel(station)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Görev yetkileri
                <select
                  multiple
                  value={managedUser.role === "admin" ? allDutyPermissions : (managedUser.dutyPermissions ?? allDutyPermissions)}
                  disabled={managedUser.role === "admin"}
                  onChange={(event) =>
                    props.setState((current) => ({
                      ...current,
                      users: current.users.map((user) =>
                        user.id === managedUser.id
                          ? { ...user, dutyPermissions: selectedOptions(event.currentTarget) as StaffDuty[] }
                          : user,
                      ),
                    }))
                  }
                >
                  <option value="chief">Ekip Şefi</option>
                  <option value="ysp">YSP</option>
                  <option value="driver">Sürücü</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
