export const M_TO_YD = 1.0936133;
export const YD_TO_M = 1 / M_TO_YD;
export const MS_TO_MPH = 2.236936;
export const yd = (m: number) => m * M_TO_YD;
export const m = (yards: number) => yards * YD_TO_M;
export const fmtYd = (meters: number) => `${Math.round(yd(meters))} yd`;
export const fmtFt = (meters: number) => `${Math.max(1, Math.round(meters * 3.28084))} ft`;
export const fmtDist = (meters: number) => (meters < 18 ? fmtFt(meters) : fmtYd(meters));
