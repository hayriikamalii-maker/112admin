# 112 Nöbet Çizelgesi

112 acil sağlık hizmetleri istasyonları için personel, izin, resmi tatil ve vardiya kurallarına göre nöbet çizelgesi hazırlayan bağımsız web uygulaması.

## Özellikler

- Kullanıcı adı/şifre ile giriş
- Admin ve kullanıcı rolleri
- Kullanıcı bazlı istasyon erişimi
- Admin tarafından Gemini/Groq API anahtarı ve kullanıcı bazlı çoklu AI sağlayıcı seçimi
- AI API test butonları
- A1/A2 istasyon yönetimi
- İstasyon düzenleme ve silme
- Ünvan ve kadroya göre görev uygunluğu
- Memur ve 4D işçi çalışma hesabı
- Türkiye resmi tatil takvimi ve manuel tatil ekleme
- İzin, rapor, mazeret ve eğitim kaydı
- İzin düzenleme ve silme
- Yıllık izinde memur için manuel son nöbet tarihi ve otomatik 3 gün boşluk kuralı
- Yıllık izinde fazla mesaiyi varsayılan kapatma, checkbox ile izin verme
- Aylık/yıllık fazla mesai raporu ve Excel/Word/PDF çıktısı
- Fazla mesaide memur ve 4D işçi ayrı saat hesabı: memur nöbeti 24 saat, 4D işçi nöbeti 11 saat
- Fazla mesai raporunda personel, ünvan ve kadro filtreleri
- Aylık dış görevlendirme ile personeli çizelge dışı bırakma
- Otomatik nöbet çizelgesi üretimi
- Manuel hücre düzenleme ve kural uyarıları
- Excel, Word ve PDF çıktı
- Değişiklik geçmişi

## Local Çalıştırma

```bash
npm install
npm run dev
```

İlk giriş bilgileri:

- Admin: `admin` / `admin112`
- Kullanıcı: `kullanici` / `112user`

## Build

```bash
npm run lint
npm run build
```

## Yayınlama

Bu proje statik Vite uygulamasıdır. Build çıktısı `dist/` klasörüne üretilir.

```bash
npm run build
```

Sonrasında `dist/` klasörünü Netlify, Vercel, Render Static Site, cPanel veya mevcut hosting paneline yükleyebilirsiniz.

## Hostinger Yayınlama

1. Lokal bilgisayarda `npm run build` çalıştırın.
2. Hostinger hPanel > Websites > File Manager bölümünü açın.
3. Domainin `public_html` klasöründeki eski site dosyalarını yedekleyin veya silin.
4. `dist/` klasörünün içindeki dosyaları `public_html` içine yükleyin. `dist` klasörünün kendisini değil, içindekileri yükleyin.
5. `public_html/.htaccess` ve `public_html/api-test.php` dosyalarının yüklendiğini kontrol edin.
6. Domaini açıp giriş ekranını test edin.

11245911.com için DNS Hostinger'e yönlü değilse önce domain DNS kayıtlarında Hostinger nameserver'larını tanımlayın veya A kaydını Hostinger IP adresine yönlendirin.

Kalıcı veritabanı istenirse Supabase migration çalıştırıldıktan sonra uygulama localStorage yerine Supabase istemcisine bağlanacak şekilde genişletilmelidir.

## Supabase

İstenirse `supabase/migrations/202607220001_create_112_scheduler.sql` dosyasındaki migration çalıştırılarak kalıcı veritabanı altyapısı kurulabilir. Mevcut sürüm localStorage ile çalışır.


.
