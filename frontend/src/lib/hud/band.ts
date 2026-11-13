/** AAR band arithmetic: channel n = 160.110 + 0.015 n MHz; ch07 160.215 ... ch97 161.565 (91 channels). */

export const BAND = { lo: 160.215, hi: 161.565, first: 7, last: 97, step: 0.015 } as const;

export const chToMhz = (ch: number): number => +(160.11 + 0.015 * ch).toFixed(3);
export const mhzToCh = (mhz: number): number => Math.round((mhz - 160.11) / 0.015);
