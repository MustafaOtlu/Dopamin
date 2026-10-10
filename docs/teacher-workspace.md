# Öğretmen defteri

9 Ekim 2026. Öğretmen panelinin araştırma ve uygulama notları.

## Araştırmadan alınan kararlar

| Kaynak                                                                                                                    | Öğretmen için yararlı yaklaşım                                                                   | Dopamin'e eklenen karşılığı                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [Google Classroom: tüm öğrenci çalışmalarını görüntüleme](https://support.google.com/edu/classroom/answer/9157286?hl=en)  | Dersler arasında bekleyen değerlendirmeleri görmek; teslim ve eksik çalışma durumlarını ayırmak. | Ana sayfada dersler arası iş kuyruğu, yaklaşan teslimler; ders içinde not defteri ve durum filtreleri.                                  |
| [Google Classroom: konular](https://support.google.com/edu/classroom/answer/9093681?co=GENIE.Platform%3DDesktop&hl=en-GB) | İçerikleri konularla düzenlemek ve konuya göre süzmek.                                           | Etkinliklerde konu, yayın durumu ve başlık/kazanım araması. Mevcut haftalık müfredat korundu.                                           |
| [Canvas: SpeedGrader](https://community.instructure.com/en/kb/articles/662775-what-is-speedgrader)                        | Teslim, değerlendirme ve geri bildirimi aynı çalışma akışında tutmak.                            | Kuyruktan doğrudan ilgili ödevi açma; teslimleri değerlendirme durumuna göre süzme; notun güncel teslimle birlikte deftere yansıması.   |
| [Moodle: activity completion](https://docs.moodle.org/503/en/Activity_completion)                                         | Tamamlanmayı ve ilerlemeyi görünür kılmak.                                                       | Mevcut katılım ve kazanım analiziyle birlikte sınıf araması, hiç çalışmayan / son yedi günde çalışmayan öğrenci filtresi, sınıf raporu. |

Bu kaynaklardan iş akışları seçildi. Görsel tasarım Dopamin için hazırlandı; başka ürünün ekranı, markası veya görselleri kopyalanmadı. İncelenen ürünlerin bütün özellikleri bu sürüme taşınmadı.

## Ekranlar

- **Genel bakış / Çalışma masası:** aktif derslerde değerlendirme bekleyen teslimler, incelenmesi gereken içerikler ve açık öğrenci destek talepleri. Sayılar gerçek kayıtlardır. Her kategoride en eski 40 iş listelenir; toplamlar tüm aktif dersleri kapsar. Sonraki 14 günün en yakın 8 ödev teslimi gösterilir. Yenile düğmesi verileri tekrar getirir.
- **Derslerim / Etkinlikler:** konu ve yayın durumu filtreleri, Türkçe büyük/küçük harf duyarlı normalleştirme ile arama, filtreleri temizleme. Seçilen ders ve sekme adres çubuğunda saklanır; yenilemede aynı yere dönülür.
- **Derslerim / Not defteri:** yayımlanmış ve kapalı ödevlerin hedef öğrencileri; teslim edilmedi, başlanmadı, çalışılıyor, değerlendirme bekliyor, değerlendirildi, düzeltme istendi ve geri çekildi durumları. Son teslim tarihi geçen ve güncel teslimi olmayan öğrenci “Teslim edilmedi” olarak görünür. Geç teslim ayrıca filtrelenebilir. Not sadece öğretmenin kaydettiği 0–100 değeridir; boş not sıfır sayılmaz. CSV mevcut filtreleri kullanır.
- **Derslerim / Öğrenciler:** ad/e-posta araması, katılım filtresi ve ilk deneme/tekrar sonuçlarıyla CSV raporu. Öğrenci ayrıntısından mevcut destek ve özel çalışma akışına geçilir.
- **Derslerim / Ödevler:** taslak/yayında/kapalı filtreleri; ödev ayrıntısında yalnız değerlendirme bekleyen veya düzeltme istenen teslimleri gösterebilme.

## Görünüm ve sınırlar

Kırık beyaz kâğıt, koyu yeşil mürekkep, tek Arial yazı tipi, ince çizgiler ve dosya/çizelge düzeni kullanıldı. Öğretmen alanı öğrenci temasından bağımsızdır. Sağ üstte açık/karanlık tema düğmesi bulunur; tercih bu tarayıcıda öğretmen hesabına göre saklanır. Karanlık renkler sekmeler, formlar ve dialoglarda da uygulanır. Emoji kullanılmaz; simgeler SVG'dir. Küçük ekran menüsü ve tablo yatay kaydırması korunur.

Öğretmen menüsünde XP, token, lig ve sınıf oyun sıralaması yoktur. Sıralama API'si de öğretmen isteğine 403 döndürür. Öğrencinin kozmetikleri öğretmen raporlarına taşınmaz. Kaynak üretimindeki API kullanım ölçümleri oyun ekonomisinden ayrıdır.

Yeni sorgular doğrulanmış öğretmeni ve ders sahipliğini denetler, mevcut RLS kapsamı içinde çalışır. Başka öğretmenin dersleri çalışma masasına gelmez. CSV hücreleri tırnaklanır, formül başlatabilen öğrenci metinleri etkisizleştirilir; Türkçe karakterler ve sıfır notu korunur. Geri çekilen veya yeniden çalışılmakta olan teslimin eski notu güncel not gibi gösterilmez.

Mevcut kaynak yükleme, içerik üretme/inceleme, müfredat, ödev iade/yeniden teslim, öğrenci desteği ve hesap güvenliği işlevleri korunur. Bu değişiklik AI sağlayıcısını bağlamaz veya otomatik notlandırma açmaz.

## Yerelde deneme

1. `npm run dev` ile başlat; [yerel uygulamayı aç](http://127.0.0.1:3000/app).
2. Demo öğretmen: `akademisyen@pusula.local`, parola: `PusulaDemo2026!`.
3. Genel bakıştan bir bekleyen işi veya ders dosyasını aç. Sağ üstten temayı değiştir; sayfayı yenileyip tercihin korunduğunu kontrol et.
4. Ders içindeki Not defteri, Öğrenciler ve Etkinlikler sekmelerinde filtreleri dene. CSV yalnız görünen kayıtları indirir.

Test dosyaları: `src/tests/teacher-workspace.integration.test.ts`, `src/tests/csv.test.ts`, `e2e/teacher-desk.spec.ts`. Görsel/erişilebilirlik taraması: `scripts/capture-teacher-desk.mjs`; yerel çıktı `.data/previews/teacher-desk-audit.json`.

## Doğrulama

- 22 dosyada 119 Vitest testi geçti; öğretmen/veri sahipliği, iş kuyruğu, son tarih, boş ve sıfır not, arşiv ve CSV formül koruması dahil.
- 20 Chromium uçtan uca testi geçti. Yeni kuyruk → ödev → değerlendirme → not defteri → CSV akışı; eski kaynak/üretim, ödev iade ve yeniden teslim, destek, hesap ve öğrenci akışları da çalıştırıldı.
- 12 ekran/görünüm ve 6 öğretmen dialogu Axe ile tarandı; incelenen durumlarda WCAG A/AA ihlali saptanmadı. Bu otomatik kontrol, gerçek ekran okuyucu veya fiziksel cihaz değerlendirmesinin yerine geçmez.
- ESLint, TypeScript ve üretim derlemesi geçti. Uygulama kaynaklarında emoji taraması temiz.
