/**
 * Search key for Vietnamese text: lower-case, without diacritics, "đ" → "d", single spaces.
 * "Sữa tươi Đà Lạt" → "sua tuoi da lat". Used for product search on the server and offline on the POS.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
