// Yapı malzemeleri veritabanı.
// Yoğunluklar (kg/m³) ve fiyatlar gerçekçi katalog değerleriyle uyumlu;
// fiyatlar varsayımsal (kullanıcı dokümanı: karton 2₺/m, karbon 150₺/m örnekleri baz alındı).

export interface Material {
  id: string;
  name: string;
  /** Yoğunluk, kg/m³ */
  density: number;
  /** Birim uzunluk fiyatı, ₺/m (boru/levha cinsinden orantılı) */
  pricePerMeter: number;
  /** Sürükleme pürüzlülük çarpanı (1.0 = baz) */
  roughness: number;
  /** Göreli yapısal mukavemet (1.0 = karton) */
  strength: number;
  /** Rijitlik modülü, Pa (kanat sallanması tahmini için) */
  modulus: number;
  /** Renk tonu (3D gösterim için) */
  color: string;
  /** Kısa açıklama */
  desc: string;
}

export const MATERIALS: Record<string, Material> = {
  kraft: {
    id: "kraft",
    name: "Kraft Karton",
    density: 550,
    pricePerMeter: 2,
    roughness: 1.0,
    strength: 1.0,
    modulus: 3.5e9,
    color: "#c8a15a",
    desc: "Model roket klasiği — en ucuz, en yüksek sürtünme",
  },
  phenolic: {
    id: "phenolic",
    name: "Fenolik Reçine",
    density: 950,
    pricePerMeter: 18,
    roughness: 0.94,
    strength: 1.9,
    modulus: 8e9,
    color: "#8a6a4a",
    desc: "Orta seviye — iyi mukavemet/ağırlık dengesi",
  },
  fiberglass: {
    id: "fiberglass",
    name: "Fiberglas",
    density: 1600,
    pricePerMeter: 60,
    roughness: 0.9,
    strength: 3.5,
    modulus: 25e9,
    color: "#b8c4c0",
    desc: "Yüksek mukavemet, pahalı",
  },
  carbon: {
    id: "carbon",
    name: "Karbon Fiber",
    density: 1500,
    pricePerMeter: 150,
    roughness: 0.87,
    strength: 5.0,
    modulus: 70e9,
    color: "#2a2d33",
    desc: "Hafif ve çok sert — en pahalı",
  },
  aluminum: {
    id: "aluminum",
    name: "Alüminyum",
    density: 2700,
    pricePerMeter: 42,
    roughness: 0.9,
    strength: 2.6,
    modulus: 69e9,
    color: "#b9c4cd",
    desc: "Ağır ama çok dayanıklı",
  },
  titanium: {
    id: "titanium",
    name: "Titanyum",
    density: 4430,
    pricePerMeter: 420,
    roughness: 0.91,
    strength: 4.6,
    modulus: 116e9,
    color: "#9aa2ab",
    desc: "En ağır, en dayanıklı, en pahalı",
  },
};

/** Standart model roket tüp çapları (BT-5 ... BT-80), dış çap mm. Kaynak: Estes teknik dokümanları. */
export const TUBE_SIZES: Record<string, number> = {
  "BT-5": 13.3,
  "BT-20": 18.6,
  "BT-50": 24.9,
  "BT-55": 33.0,
  "BT-60": 41.6,
  "BT-70": 55.9,
  "BT-80": 66.0,
};

/** Kanat malzemeleri. */
export const FIN_MATERIALS: Record<string, Material> = {
  balsa: {
    id: "balsa",
    name: "Balsa",
    density: 160,
    pricePerMeter: 8,
    roughness: 1.0,
    strength: 0.6,
    modulus: 3.5e9,
    color: "#d9b98a",
    desc: "Çok hafif, kırılgan",
  },
  plywood: {
    id: "plywood",
    name: "Kontrplak",
    density: 620,
    pricePerMeter: 20,
    roughness: 0.97,
    strength: 1.6,
    modulus: 10e9,
    color: "#b98d5f",
    desc: "Orta ağırlık, sağlam",
  },
  carbon: {
    id: "carbon",
    name: "Karbon Levha",
    density: 1500,
    pricePerMeter: 200,
    roughness: 0.88,
    strength: 4.4,
    modulus: 70e9,
    color: "#2a2d33",
    desc: "Hafif ve çok sert",
  },
};

/** Kurtarma kanopisi malzemeleri (alan yoğunluğu g/m²). */
export const CANOPY_MATERIALS: Record<string, { density: number; price: number }> = {
  plastic: { density: 35, price: 0.4 }, // polietilen film
  ripstop: { density: 60, price: 1.2 }, // ripstop naylon
  nylon: { density: 80, price: 1.8 }, // naylon
};
