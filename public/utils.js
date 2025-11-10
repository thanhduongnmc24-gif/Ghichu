/* =================================================================== */
/* FILE: public/utils.js                                               */
/* MỤC ĐÍCH: Chứa các hàm tiện ích "thuần túy" (tính toán).             */
/* File này sẽ được import bởi app.js.                                  */
/* =================================================================== */

// ===================================================================
// PHẦN 1: LOGIC LỊCH ÂM
// ===================================================================

/**
 * Dữ liệu Lịch Âm (từ 1900 đến 2050)
 * Nguồn: Được chuyển đổi từ các thuật toán lịch vạn niên.
 */
export const LUNAR_CAL_DATA = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63
];

/**
 * Lấy số ngày trong một tháng Âm lịch.
 * @param {number} lunarYear - Năm Âm lịch.
 * @param {number} lunarMonth - Tháng Âm lịch.
 * @returns {number} 30 hoặc 29.
 */
export function getLunarMonthDays(lunarYear, lunarMonth) {
    if ((LUNAR_CAL_DATA[lunarYear - 1900] & (0x10000 >> lunarMonth)))
        return 30;
    else
        return 29;
}

/**
 * Lấy tháng nhuận trong năm Âm lịch.
 * @param {number} lunarYear - Năm Âm lịch.
 * @returns {number} Tháng nhuận (1-12), hoặc 0 nếu không có.
 */
export function getLunarLeapMonth(lunarYear) {
    return (LUNAR_CAL_DATA[lunarYear - 1900] & 0xf);
}

/**
 * Lấy số ngày của tháng nhuận (nếu có).
 * @param {number} lunarYear - Năm Âm lịch.
 * @returns {number} 30 hoặc 29 (nếu có tháng nhuận), hoặc 0 (nếu không có).
 */
export function getLunarLeapDays(lunarYear) {
    if (getLunarLeapMonth(lunarYear) != 0) {
        if ((LUNAR_CAL_DATA[lunarYear - 1900] & 0x10000))
            return 30;
        else
            return 29;
    } else
        return 0;
}

/**
 * Tính tổng số ngày trong một năm Âm lịch (bao gồm cả tháng nhuận).
 * @param {number} lunarYear - Năm Âm lịch.
 * @returns {number} Tổng số ngày (ví dụ: 354, 355, 383, 384).
 */
export function getLunarYearDays(lunarYear) {
    let i, sum = 348;
    for (i = 0x8000; i > 0x8; i >>= 1) {
        if ((LUNAR_CAL_DATA[lunarYear - 1900] & i))
            sum += 1;
    }
    return (sum + getLunarLeapDays(lunarYear));
}

/**
 * Chuyển đổi ngày Dương lịch (Solar) sang Âm lịch (Lunar).
 * @param {number} dd - Ngày Dương lịch (1-31).
 * @param {number} mm - Tháng Dương lịch (1-12).
 * @param {number} yyyy - Năm Dương lịch.
 * @returns {{day: number, month: number, year: number, isLeap: boolean}} Đối tượng Lịch Âm.
 */
export function convertSolarToLunar(dd, mm, yyyy) {
    // (CẬP NHẬT) Chuyển sang Date.UTC để tránh lỗi làm tròn múi giờ
    let date = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
    let i, leap = 0, temp = 0;
    // (CẬP NHẬT) Chuyển sang Date.UTC để tránh lỗi làm tròn múi giờ
    let baseDate = new Date(Date.UTC(1900, 0, 31)); 
    let offset = (date - baseDate) / 86400000;

    for (i = 1900; i < 2050 && offset > 0; i++) {
        temp = getLunarYearDays(i);
        offset -= temp;
    }
    if (offset < 0) {
        offset += temp;
        i--;
    }

    let year = i;
    leap = getLunarLeapMonth(year); 

    let isLeap = false;
    for (i = 1; i < 13 && offset > 0; i++) {
        if (leap > 0 && i == (leap + 1) && !isLeap) {
            --i;
            isLeap = true;
            temp = getLunarLeapDays(year); 
        } else {
            temp = getLunarMonthDays(year, i);
        }
        if (isLeap && i == (leap + 1)) isLeap = false;
        offset -= temp;
    }

    if (offset == 0 && leap > 0 && i == leap + 1) {
        if (isLeap) {
            isLeap = false;
        } else {
            isLeap = true;
            --i;
        }
    }
    if (offset < 0) {
        offset += temp;
        --i;
    }

    let month = i;
    // (GHI CHÚ) Phép tính này bây giờ đã an toàn vì offset là số nguyên
    let day = Math.floor(offset + 1); 
    
    return { day: day, month: month, year: year, isLeap: isLeap };
}

// ===================================================================
// PHẦN 2: LOGIC NGÀY THÁNG & CA KÍP
// ===================================================================

/**
 * Chuyển đối tượng Date thành chuỗi "YYYY-MM-DD".
 * @param {Date} date - Đối tượng Date.
 * @returns {string} Chuỗi ngày tháng.
 */
export function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Chuyển chuỗi "YYYY-MM-DD" thành số ngày (kể từ 1970).
 * @param {string} dateStr - Chuỗi "YYYY-MM-DD".
 * @returns {number} Số ngày.
 */
export function dateToDays(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

// Hằng số cho việc tính ca
export const EPOCH_DAYS = dateToDays('2025-10-26');
export const SHIFT_PATTERN = ['ngày', 'đêm', 'giãn ca'];

/**
 * Tính ca làm việc (Ngày, Đêm, Giãn ca) cho một ngày cụ thể.
 * @param {string} dateStr - Chuỗi "YYYY-MM-DD".
 * @returns {string} Tên ca ("ngày", "đêm", hoặc "giãn ca").
 */
export function getShiftForDate(dateStr) {
    const currentDays = dateToDays(dateStr);
    const diffDays = currentDays - EPOCH_DAYS;
    const patternIndex = (diffDays % SHIFT_PATTERN.length + SHIFT_PATTERN.length) % SHIFT_PATTERN.length;
    return SHIFT_PATTERN[patternIndex];
}

// ===================================================================
// PHẦN 3: TIỆN ÍCH PUSH NOTIFICATION
// ===================================================================

/**
 * Chuyển đổi chuỗi VAPID Base64 (URL-safe) thành Uint8Array.
 * Cần thiết cho việc đăng ký Push Notification.
 * @param {string} base64String - Chuỗi VAPID public key.
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
