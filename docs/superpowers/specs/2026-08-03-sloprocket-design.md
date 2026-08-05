# SlopRocket — Roket Simülatörü Tasarım Dokümanı

Kullanıcının verdiği ana prompt (bölüm 1–10) aynen esastır: `docs/` altında orijinal
olarak korunur. Bu dosya, araştırma sonuçlarını ve uygulama kararlarını özetler.

## Doğrulanmış veriler (web araştırması, Ağustos 2026)

- **Estes Alpha**: 12.3 in (31.2 cm), 0.98 in (24.9 mm / BT-50), 0.8 oz (22.7 g) ağırlık,
  12 in paraşüt. C6-7 ile Estes reklam irtifası 305 m (Estes resmi: 1000 ft).
  Kaynak: estesrockets.com/products/alpha, hobbylinc.com.
- **C6-7**: 18 mm, toplam itki 8.8–10.0 Ns, max itki 14.1–15.3 N, yanma 1.6–1.9 s,
  ortalama itki ~4.7–5.6 N, motor kütlesi 24.2 g, yakıt 10.8–12.2 g, gecikme 7 s.
  Kaynak: thrustcurve.org, apogeerockets.com, Estes engine chart PDF.
- **D12-5**: 24 mm, 16.8–20.0 Ns, max itki 29.7–32.9 N, yanma 1.6–1.7 s, motor 45.2–45.6 g,
  yakıt 21.1–24.2 g, gecikme 5 s. Kaynak: apogeerockets.com, Estes engine chart.
- **B6-4**: 4.3 Ns, max 12.1 N, 0.9 s, 19.1 g / 5.6 g. **A8-3**: 2.3 Ns, max 9.7 N, 0.7 s.
  Kaynak: apogeerockets.com.
- **NAR motor sınıfları**: 1/4A 0.313–0.625, 1/2A 0.626–1.25, A 1.26–2.5, B 2.51–5.0,
  C 5.01–10, D 10.01–20, E 20.01–40, F 40.01–80, G 80.01–160, H 160.01–320,
  I 320.01–640, J 640.01–1280, K 1280.01–2560, L 2560.01–5120, M 5120.01–10240,
  N 10240.01–20480, O 20480.01–40960 (N·s). Kaynak: nar.org, Wikipedia.
- **Barrowman (NARAM-8, 1967)**: (CNα)N=2; koni XN=0.666·LN; ogive XN=0.466·LN;
  gövde CNα=0; geçiş konisi CNα=2[(dR/dF)²−1]; kanat XF formülü (rocketmime,
  usu.edu, nakka-rocketry). Stabilite: 1 kalibre subsonik, 2 kalibre süpersonik.
- **Cd-Mach**: subsonik ~0.3–0.5 (sürtünme ağırlıklı), transonik (0.8–1.2) ~2 katına
  çıkar, süpersonik düşer ~0.4–0.6. Kaynak: Apogee Peak of Flight #666,
  KTH tezi (2024, deneysel Cd modeli), Steppert & Epple 2017.
- **Sıvı motor Isp**: LOX/RP-1 282 sl / 311 vakum (Merlin 1D); LOX/LH2 366 sl / 452 vakum
  (RL-10/RS-25); LOX/CH4 330 sl / 380 vakum (Raptor).
- **ISA**: T0=288.15 K, P0=101325 Pa, ρ0=1.225 kg/m³, g0=9.80665 m/s², lapse 6.5 K/km
  (0–11 km), izotermal 11–20 km, 1 K/km 20–32 km. Kaynak: ISA 1976.
- **Paraşüt Cd**: düz kubbe ~0.75–0.8 (kullanıcı dokümanı), hedef iniş 4–6 m/s.

## Uygulama kararları

- Stack: Vite + React 18 + TypeScript + Three.js (saf, imperative scene modülü) +
  zustand (state) + vitest (test). Grafikler: el yapımı hafif canvas çizelge
  (tıklama → kare arama desteği).
- UI dili: Türkçe (teknik terimler İngilizce kodlarla birlikte).
- Birimler SI; gösterim m/km.
- Kabul testleri: Alpha+C6-7 simülasyonu 150–220 m; vakum modunda Tsiolkovsky ±%1;
  finless roket → stabilite uyarısı.
