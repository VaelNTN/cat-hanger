export interface CatColor {
  id: number;
  name: string;
  body: string;
  belly: string;
  stripe: string;
  earInner: string;
  outline: string;
}

export type EyeColorId = 'amber' | 'emerald' | 'sky' | 'violet';
export type AccessoryId = 'none' | 'collar' | 'bell' | 'bowtie' | 'glasses';

export const CAT_COLORS: CatColor[] = [
  { id: 0, name: 'Ginger Tabby', body: '#f97316', belly: '#ffedd5', stripe: '#c2410c', earInner: '#fda4af', outline: '#431407' },
  { id: 1, name: 'Tuxedo', body: '#1e293b', belly: '#f8fafc', stripe: '#0f172a', earInner: '#fda4af', outline: '#020617' },
  { id: 2, name: 'Snow White', body: '#f8fafc', belly: '#ffffff', stripe: '#cbd5e1', earInner: '#fecdd3', outline: '#334155' },
  { id: 3, name: 'Midnight Black', body: '#18181b', belly: '#27272a', stripe: '#09090b', earInner: '#f472b6', outline: '#000000' },
  { id: 4, name: 'Siamese', body: '#f5deb3', belly: '#fffbeb', stripe: '#5c4033', earInner: '#fda4af', outline: '#451a03' },
  { id: 5, name: 'Russian Blue', body: '#64748b', belly: '#cbd5e1', stripe: '#475569', earInner: '#fda4af', outline: '#1e293b' },
  { id: 6, name: 'Golden Bengal', body: '#eab308', belly: '#fef9c3', stripe: '#a16207', earInner: '#fda4af', outline: '#422006' },
  { id: 7, name: 'Cotton Candy', body: '#f472b6', belly: '#fce7f3', stripe: '#db2777', earInner: '#fbcfe8', outline: '#500724' },
  { id: 8, name: 'Lavender', body: '#a78bfa', belly: '#ede9fe', stripe: '#7c3aed', earInner: '#f5d0fe', outline: '#2e1065' },
  { id: 9, name: 'Mint Kitty', body: '#34d399', belly: '#d1fae5', stripe: '#059669', earInner: '#fda4af', outline: '#064e3b' },
  { id: 10, name: 'Sky Blue', body: '#38bdf8', belly: '#e0f2fe', stripe: '#0284c7', earInner: '#fda4af', outline: '#0c4a6e' },
  { id: 11, name: 'Cherry Red', body: '#ef4444', belly: '#fee2e2', stripe: '#b91c1c', earInner: '#fecdd3', outline: '#450a0a' },
  { id: 12, name: 'Chocolate', body: '#92400e', belly: '#fde68a', stripe: '#451a03', earInner: '#fda4af', outline: '#270e02' },
  { id: 13, name: 'Peach', body: '#fb923c', belly: '#fff7ed', stripe: '#ea580c', earInner: '#fecdd3', outline: '#431407' },
  { id: 14, name: 'Emerald', body: '#10b981', belly: '#ecfdf5', stripe: '#047857', earInner: '#fda4af', outline: '#022c22' },
  { id: 15, name: 'Silver Tabby', body: '#cbd5e1', belly: '#f8fafc', stripe: '#64748b', earInner: '#fda4af', outline: '#1e293b' },
];

export const EYE_COLORS: { id: EyeColorId; name: string; hex: string }[] = [
  { id: 'amber', name: 'Amber', hex: '#f59e0b' },
  { id: 'emerald', name: 'Green', hex: '#10b981' },
  { id: 'sky', name: 'Blue', hex: '#0ea5e9' },
  { id: 'violet', name: 'Violet', hex: '#8b5cf6' },
];

export const ACCESSORIES: { id: AccessoryId; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'collar', name: 'Collar' },
  { id: 'bell', name: 'Bell' },
  { id: 'bowtie', name: 'Bowtie' },
  { id: 'glasses', name: 'Sunglasses' },
];

export function getCatColor(id: number): CatColor {
  return CAT_COLORS[id] ?? CAT_COLORS[0];
}

export function getEyeHex(id: EyeColorId): string {
  return EYE_COLORS.find((e) => e.id === id)?.hex ?? '#f59e0b';
}
