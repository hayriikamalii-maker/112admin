import type { AppState } from "./types";

const legacyStorageKey = "112-nobet-cizelgesi-state-v1";

const defaultScheduleRulesText = `- A1 istasyonda ekip şefine öncelikle doktor yazılır; doktor yoksa paramedik kullanılır.
- A2 istasyonda ekip şefine öncelikle memur paramedik yazılır; gerekirse sürücü paramedik kullanılır.
- YSP bölümüne öncelikle ATT yazılır; sonra hedefi eksik Sürücü ATT, paramedik ve sürücü paramedik değerlendirilebilir.
- Sürücü görevinde önce 4D işçi sürücüler bütün aya dengeli dağıtılarak hedef nöbetine tamamlanır.
- 4D sürücüler arka arkaya sıkıştırılmaz; uygun izin/rapor/dinlenme varsa nöbetler ay geneline serpiştirilir.
- 4D hedefleri tamamlandıktan sonra kalan sürücü boşluklarına memur sürücüler 24 saat olarak yazılır.
- Memur kadrosundaki sürücüler mümkün olduğunca 24 saat sürücü nöbeti tutar.
- 4D işçiler 12 saat çalışır; gündüz/gece dengesi korunur ve fazla mesai yazılmaz.
- 4D işçiye arka arkaya en fazla 2 gece yazılır; 2 gece sonrası en az 24 saat dinlenme verilir.
- Memur 24 saat nöbetten sonra dinlenme günü alır.
- Görevlendirmedeki, pasif, izinli veya raporlu personel çizelgeye alınmaz.
- Yıllık izin ve rapor tarihleri asla pas geçilmez; isteklerden ve dengelemeden önceliklidir.
- Nöbet isteklerine uyulmaya çalışılır; liste imkansızsa karşılanmayan istekler personele dengeli dağıtılır.
- Haziran, Temmuz, Ağustos ve Eylül aylarında nöbetler mümkün olduğunca aya yayılır.`;

export function createInitialState(): AppState {
  const stationId = crypto.randomUUID();
  const staffIds = Array.from({ length: 8 }, () => crypto.randomUUID());
  const adminId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  return {
    users: [
      {
        id: adminId,
        username: "admin",
        password: "",
        fullName: "Sistem Yöneticisi",
        role: "admin",
        active: true,
        stationIds: [stationId],
        dutyPermissions: ["chief", "ysp", "driver"],
        aiProviders: ["local"],
        canImport: true,
        mustChangePassword: true,
      },
      {
        id: userId,
        username: "kullanici",
        password: "",
        fullName: "İstasyon Kullanıcısı",
        role: "user",
        active: true,
        stationIds: [stationId],
        dutyPermissions: ["chief", "ysp", "driver"],
        aiProviders: ["local"],
        canImport: true,
        mustChangePassword: false,
      },
    ],
    stations: [
      {
        id: stationId,
        name: "Merkez 112 ASHİ",
        city: "İstanbul",
        district: "Kadıköy",
        type: "A1",
      },
    ],
    staff: [
      { id: staffIds[0], stationId, fullName: "Ayşe Demir", title: "Doktor", cadre: "Memur", active: true, overtimeAllowed: false },
      { id: staffIds[1], stationId, fullName: "Mehmet Kaya", title: "Paramedik", cadre: "Memur", active: true, overtimeAllowed: false },
      { id: staffIds[2], stationId, fullName: "Zeynep Aksoy", title: "Paramedik", cadre: "Memur", active: true, overtimeAllowed: false },
      { id: staffIds[3], stationId, fullName: "Emre Şahin", title: "ATT", cadre: "Memur", active: true, overtimeAllowed: false },
      { id: staffIds[4], stationId, fullName: "Fatma Yıldız", title: "Sürücü ATT", cadre: "4D İşçi", active: true, overtimeAllowed: false },
      { id: staffIds[5], stationId, fullName: "Ali Çelik", title: "Sürücü", cadre: "4D İşçi", active: true, overtimeAllowed: false },
      { id: staffIds[6], stationId, fullName: "Can Öz", title: "Sürücü Paramedik", cadre: "Memur", active: true, overtimeAllowed: false },
      { id: staffIds[7], stationId, fullName: "Murat Acar", title: "Sürücü", cadre: "4D İşçi", active: true, overtimeAllowed: false },
    ],
    staffMonthlyAssignments: [],
    leaves: [],
    dutyRequests: [],
    holidays: [],
    schedules: [],
    changeLogs: [],
    settings: {
      appName: "Acil Sağlık Hizmetleri Nöbet Paneli",
      currentUser: "admin",
      aiProvider: "local",
      aiApiKeys: {},
      scheduleRulesText: defaultScheduleRulesText,
    },
  };
}

export function migrateState(state: Partial<AppState>): AppState {
  const initial = createInitialState();
  const stations = state.stations?.length ? state.stations : initial.stations;
  const firstStationId = stations[0]?.id ?? initial.stations[0].id;
  return {
    ...initial,
    ...state,
    stations,
    staff: (state.staff ?? initial.staff).map((person) => ({
      ...person,
      duties: person.duties ?? [],
      overtimeAllowed: person.overtimeAllowed ?? false,
    })),
    users: state.users?.length
      ? state.users.map((user) => ({
          ...user,
          aiProviders: user.aiProviders ?? [((user as { aiProvider?: AppState["settings"]["aiProvider"] }).aiProvider ?? "local")],
          dutyPermissions: user.dutyPermissions ?? ["chief", "ysp", "driver"],
          canImport: user.canImport ?? true,
          mustChangePassword: user.mustChangePassword ?? false,
        }))
      : [
          {
            id: crypto.randomUUID(),
            username: "admin",
            password: "",
            fullName: "Sistem Yöneticisi",
            role: "admin",
            active: true,
            stationIds: stations.map((station) => station.id),
            dutyPermissions: ["chief", "ysp", "driver"],
            aiProviders: ["local"],
            canImport: true,
            mustChangePassword: true,
          },
          {
            id: crypto.randomUUID(),
            username: "kullanici",
            password: "",
            fullName: "İstasyon Kullanıcısı",
            role: "user",
            active: true,
            stationIds: [firstStationId],
            dutyPermissions: ["chief", "ysp", "driver"],
            aiProviders: ["local"],
            canImport: true,
            mustChangePassword: false,
          },
        ],
    staffMonthlyAssignments: (state.staffMonthlyAssignments ?? []).map((assignment) => ({
      ...assignment,
      originalStationId:
        assignment.originalStationId ?? state.staff?.find((person) => person.id === assignment.staffId)?.stationId,
      indefinite: assignment.indefinite ?? false,
      createdAt: assignment.createdAt ?? new Date().toISOString(),
    })),
    dutyRequests: (state.dutyRequests ?? []).map((request) => ({
      ...request,
      stationId: request.stationId ?? state.staff?.find((person) => person.id === request.staffId)?.stationId ?? firstStationId,
      description: request.description ?? "",
      createdAt: request.createdAt ?? new Date().toISOString(),
    })),
    settings: {
      ...initial.settings,
      ...state.settings,
      aiProvider: state.settings?.aiProvider ?? "local",
      aiApiKeys: state.settings?.aiApiKeys ?? {},
      scheduleRulesText: state.settings?.scheduleRulesText ?? initial.settings.scheduleRulesText,
    },
  };
}

export function loadState() {
  return createInitialState();
}

export function loadLegacyState() {
  const raw = localStorage.getItem(legacyStorageKey);
  if (!raw) return null;
  try {
    return parseStateBackup(raw);
  } catch {
    return null;
  }
}

export function parseStateBackup(raw: string) {
  return migrateState(JSON.parse(raw) as Partial<AppState>);
}

export function clearLegacyState() {
  localStorage.removeItem(legacyStorageKey);
}
