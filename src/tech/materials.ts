// Teknik mod malzeme veritabanı. bulk: kg/m³, surface: kg/m², line: kg/m.
export type MaterialType = "bulk" | "surface" | "line";

export interface TechMaterial {
  id: string;
  name: string;
  type: MaterialType;
  density: number;
  roughness: number;
  strength: number;
  modulus: number;
  color: string;
  pricePerKg: number;
  desc: string;
}

export const TECH_MATERIALS: Record<string, TechMaterial> = {
  cardboard: { id: "cardboard", name: "Kraft Karton", type: "bulk", density: 550, roughness: 1.0, strength: 1.0, modulus: 3.5e9, color: "#c8a15a", pricePerKg: 120, desc: "Model roket klasiği" },
  basswood: { id: "basswood", name: "Basswood", type: "bulk", density: 500, roughness: 0.96, strength: 1.4, modulus: 9e9, color: "#d9b98a", pricePerKg: 260, desc: "Burun konisi ve kanatlar" },
  balsa: { id: "balsa", name: "Balsa", type: "bulk", density: 160, roughness: 1.0, strength: 0.6, modulus: 3.5e9, color: "#e3c9a0", pricePerKg: 400, desc: "Çok hafif kanat" },
  plywood: { id: "plywood", name: "Kontrplak", type: "bulk", density: 620, roughness: 0.97, strength: 1.6, modulus: 10e9, color: "#b98d5f", pricePerKg: 90, desc: "Sağlam kanat" },
  phenolic: { id: "phenolic", name: "Fenolik", type: "bulk", density: 950, roughness: 0.94, strength: 1.9, modulus: 8e9, color: "#8a6a4a", pricePerKg: 210, desc: "İç tüp / kuplör" },
  fiberglass: { id: "fiberglass", name: "Fiberglas", type: "bulk", density: 1600, roughness: 0.9, strength: 3.5, modulus: 25e9, color: "#b8c4c0", pricePerKg: 190, desc: "Yüksek mukavemet" },
  carbon: { id: "carbon", name: "Karbon", type: "bulk", density: 1500, roughness: 0.87, strength: 5.0, modulus: 70e9, color: "#2a2d33", pricePerKg: 900, desc: "En sert" },
  aluminum: { id: "aluminum", name: "Alüminyum", type: "bulk", density: 2700, roughness: 0.9, strength: 2.6, modulus: 69e9, color: "#b9c4cd", pricePerKg: 220, desc: "Ağır, dayanıklı" },
  ripstop: { id: "ripstop", name: "Ripstop Naylon", type: "surface", density: 0.06, roughness: 0.95, strength: 1.6, modulus: 1e8, color: "#7d8ba0", pricePerKg: 3500, desc: "Paraşüt kanopisi" },
  nylon: { id: "nylon", name: "Naylon", type: "surface", density: 0.08, roughness: 0.95, strength: 1.2, modulus: 8e7, color: "#9aa5b5", pricePerKg: 1800, desc: "Paraşüt kanopisi" },
  elastic: { id: "elastic", name: "Elastik İp", type: "line", density: 0.003, roughness: 1.0, strength: 0.8, modulus: 1e6, color: "#d8d0c0", pricePerKg: 5000, desc: "Şok ipi" },
  kevlar: { id: "kevlar", name: "Kevlar İp", type: "line", density: 0.002, roughness: 0.92, strength: 4.5, modulus: 70e9, color: "#c9a227", pricePerKg: 12000, desc: "Yüksek dayanım şok ipi" },
};

export const TECH_MATERIAL_LIST = Object.values(TECH_MATERIALS);