# Rockets_Now_Open — Model Roket Tasarım & Simülasyon Aracı

Model roketleri **tasarla**, **fizik doğruluğu yüksek simülasyonla uçur** ve **telemetriyi
3D olarak izle**. Tarayıcıda çalışır; kurulum gerektirmez.

## Özellikler

- **Roket tasarımı** — gövde, burun konisi (6 profil), kanatlar (6 geometri), malzeme,
  motor ve kurtarma sistemi editörü; çok kademeli (1–3) ve paralel güçlendiricili (0/2/4) tasarım.
- **Motor kataloğu** — Estes barut motorları (A8-3 … F15-6), APCP kompozit (A–K sınıfı),
  sıvı yakıtlı (LOX/RP-1, LOX/LH2, LOX/CH4), hibrit ve soğuk gaz motorları.
- **Fizik motoru** — 6-DOF olmayan ama hızlandırılmış doğrulukta simülasyon:
  - Barrowman stabilite analizi (CG/CP, kalibre marjı)
  - ISA atmosfer modeli, Mach bağımlı sürükleme (transonik artış dahil)
  - Tsiolkovsky roket denklemi ile itki fazı, rüzgar, paralel güçlendiriciler
  - Paraşüt/streamer/tumble kurtarma, kademe ayrımı (hot/cold), çift paraşüt
- **3D görünüm** — Three.js sahnede rampa, fırlatma, alev, duman, paraşüt ve iniş;
  takip/rampa/serbest kamera; yörünge ve ızgara katmanları.
- **Telemetri HUD** — irtifa/hız/Mach/ivme göstergeleri, el yapımı canvas grafikler
  (tıklama ile kare arama), olay timeline'ı (sürükleyerek arama).
- **Hazır tasarımlar** — Estes Alpha, Big Bertha, Saturn V (1:100), Falcon 9 (Model) ve daha fazlası.
- **Dışa/içe aktarma** — tasarımı JSON olarak kaydet/geri yükle.

## Başlarken

```bash
npm install
npm run dev      # geliştirme sunucusu
npm test         # vitest (fizik + preset + store testleri)
npm run build    # üretim derlemesi → dist/
npm run preview  # üretim derlemesini önizle
```

## Kullanım

1. Üst çubuktan bir hazır tasarım seçin veya soldaki editörden kendi roketinizi kurun.
2. Sağdaki özet panelinden kütle, T/W, stabilite ve tahmini apogeeyi kontrol edin.
3. `🚀 FIRLAT` ile simülasyonu başlatın; hız çarpanını ve kaydırıcıyı kullanarak uçuşu inceleyin.
4. Timeline'daki olay noktalarına tıklayarak veya çizgiyi sürükleyerek oyunda gezinebilirsiniz.

## Fizik modeli (özet)

| Alan | Model |
|---|---|
| Atmosfer | ISA 1976 (katmanlı, 0–11 km lapse 6.5 K/km, 11–20 km izotermal) |
| Stabilite | Barrowman 1967: koni/ogive/burun + gövde + kanat normal kuvvet katsayıları |
| Sürükleme | Mach bağımlı: subsonik ~0.3–0.5, transonik ~2×, süpersonik ~0.4–0.6 |
| Motorlar | İtki eğrisi üreteci (end-burn/bates/finocyl), NAR sınıf aralıkları doğrulaması |
| Kurtarma | Paraşüt Cd ~0.75–0.8, hedef iniş 4–6 m/s |

## Testler

- Kabul: Estes Alpha + C6-7 → apogee 150–220 m; vakum modunda Tsiolkovsky ±%1.
- Tüm preset tasarımları montaj + tahmin + tam simülasyonda finite sonuç verir ve uçar.

## Lisans

Özel / açık kaynak değildir.
