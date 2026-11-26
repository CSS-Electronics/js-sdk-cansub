/**
 * BitrateConfigurations - Pre-computed CAN FD bitrate timing lookup table
 *
 * Nominal bitrates: 50k to 1M (incl. 83.333k, 95.238k, 666.667k), data bitrates: 1M to 5M,
 * sample points: 50% to 90%. Timing arrays format: [brp, seg1, seg2, sjw].
 *
 * `phyConfigurations` mirrors the "Bit-timing configurations" table in the CANsub Docs.
 * Do not edit it manually; regenerate with
 * `python -I scripts/gen_bitrate_table.py <cansub docs llm txt>`.
 *
 * Implicit clock invariant: every entry in `phyConfigurations.timings`
 * satisfies brp * (1 + seg1 + seg2) * bitrate = 80_000_000, i.e. the
 * CANsub's CAN-controller clock is 80 MHz. Non-integer bitrates are keyed
 * by bit/s rounded to the nearest integer (666667 for 80 MHz / 120).
 * `findConfigByTiming` does not use this directly: it expands the incoming
 * timing into all integer-equivalent (brp, seg1, seg2) tuples and checks
 * literal membership against this table, so it recognises any encoding the device accepts, not only
 * webCAN's canonical one.
 */

import type { Bittiming } from '../generated';

/** Timing tuple: [brp, seg1, seg2, sjw] */
type TimingTuple = [number, number, number, number];

/** Configuration entry pointing to timing indices */
interface ConfigEntry {
  timing_nom: number;
  timing_dat: number;
}

/** Sample point configurations for a data bitrate */
type SamplePointConfig = Record<number, ConfigEntry>;

/** Data bitrate configurations for a nominal bitrate */
type DataBitrateConfig = Record<number, SamplePointConfig>;

/** All configurations indexed by nominal bitrate */
type ConfigurationsMap = Record<number, DataBitrateConfig>;

/** PHY configurations data structure */
interface PhyConfigurations {
  timings: TimingTuple[];
  configurations: ConfigurationsMap;
}

/** Result of timing lookup */
export interface TimingResult {
  timing: Bittiming;
  timingData: Bittiming;
}

/** Result of reverse lookup */
export interface ConfigLookupResult {
  nominalBitrate: number;
  dataBitrate: number;
  samplingPoint: number;
}

const phyConfigurations: PhyConfigurations = {
  timings: [[1,69,10,4],[1,13,2,2],[1,64,15,4],[1,12,3,3],[1,59,20,4],[1,11,4,4],[1,54,25,4],[1,10,5,4],[1,49,30,4],[1,9,6,4],[1,44,35,4],[1,8,7,4],[1,39,40,4],[1,7,8,4],[1,71,8,4],[1,17,2,2],[1,67,12,4],[1,16,3,3],[1,63,16,4],[1,15,4,4],[1,14,5,4],[1,55,24,4],[1,13,6,4],[1,51,28,4],[1,12,7,4],[1,47,32,4],[1,11,8,4],[1,43,36,4],[1,10,9,4],[1,9,10,4],[2,35,4,4],[2,17,2,2],[2,33,6,4],[2,16,3,3],[2,31,8,4],[2,15,4,4],[2,29,10,4],[2,14,5,4],[2,27,12,4],[2,13,6,4],[2,25,14,4],[2,12,7,4],[5,9,6,4],[5,4,3,3],[2,23,16,4],[2,11,8,4],[2,21,18,4],[2,10,9,4],[2,19,20,4],[2,9,10,4],[4,17,2,2],[5,13,2,2],[4,16,3,3],[5,12,3,3],[4,15,4,4],[4,14,5,4],[4,13,6,4],[5,10,5,4],[4,12,7,4],[4,11,8,4],[5,8,7,4],[4,10,9,4],[4,9,10,4],[1,74,25,4],[1,49,50,4],[1,89,10,4],[1,84,15,4],[1,79,20,4],[1,69,30,4],[1,64,35,4],[1,59,40,4],[1,54,45,4],[2,44,5,4],[2,39,10,4],[5,14,5,4],[5,5,2,2],[2,34,15,4],[2,29,20,4],[2,24,25,4],[4,19,5,4],[5,11,4,4],[4,14,10,4],[5,9,10,4],[5,7,8,4],[1,104,15,4],[1,89,30,4],[1,74,45,4],[1,59,60,4],[1,107,12,4],[1,101,18,4],[1,95,24,4],[1,83,36,4],[1,77,42,4],[1,71,48,4],[1,65,54,4],[2,53,6,4],[2,50,9,4],[2,47,12,4],[2,44,15,4],[2,41,18,4],[2,38,21,4],[5,14,9,4],[2,35,24,4],[2,32,27,4],[2,29,30,4],[4,26,3,3],[5,20,3,3],[4,23,6,4],[5,17,6,4],[4,20,9,4],[4,17,12,4],[4,14,15,4],[1,139,20,4],[1,129,30,4],[1,119,40,4],[1,109,50,4],[1,99,60,4],[1,89,70,4],[1,79,80,4],[1,143,16,4],[1,135,24,4],[1,127,32,4],[1,111,48,4],[1,103,56,4],[1,95,64,4],[1,87,72,4],[2,71,8,4],[2,67,12,4],[2,63,16,4],[2,59,20,4],[2,55,24,4],[2,51,28,4],[5,19,12,4],[2,47,32,4],[2,43,36,4],[2,39,40,4],[4,35,4,4],[5,27,4,4],[4,33,6,4],[5,25,6,4],[4,31,8,4],[4,29,10,4],[4,27,12,4],[5,21,10,4],[4,25,14,4],[4,23,16,4],[5,17,14,4],[4,21,18,4],[4,19,20,4],[1,239,80,4],[1,219,100,4],[1,199,120,4],[2,79,80,4],[2,3,4,4],[1,255,64,4],[1,223,96,4],[1,207,112,4],[1,191,128,4],[2,4,5,4],[2,143,16,4],[2,135,24,4],[2,127,32,4],[2,119,40,4],[2,111,48,4],[2,103,56,4],[5,39,24,4],[2,95,64,4],[2,87,72,4],[4,71,8,4],[5,55,8,4],[4,67,12,4],[5,51,12,4],[4,63,16,4],[4,59,20,4],[4,55,24,4],[5,43,20,4],[4,51,28,4],[4,47,32,4],[5,35,28,4],[4,43,36,4],[4,39,40,4],[2,149,50,4],[2,5,2,2],[2,124,75,4],[2,4,3,3],[2,99,100,4],[2,159,40,4],[2,7,2,2],[2,139,60,4],[2,6,3,3],[2,119,80,4],[2,5,4,4],[2,179,20,4],[2,169,30,4],[2,129,70,4],[5,49,30,4],[2,109,90,4],[4,89,10,4],[5,69,10,4],[4,84,15,4],[5,64,15,4],[4,79,20,4],[4,74,25,4],[4,69,30,4],[5,54,25,4],[4,64,35,4],[4,59,40,4],[5,44,35,4],[4,54,45,4],[4,49,50,4],[2,239,80,4],[2,199,120,4],[2,255,64,4],[2,223,96,4],[2,191,128,4],[2,207,112,4],[5,79,48,4],[4,79,80,4],[4,4,5,4],[4,143,16,4],[5,111,16,4],[4,135,24,4],[5,103,24,4],[4,127,32,4],[4,119,40,4],[4,111,48,4],[5,87,40,4],[4,103,56,4],[4,95,64,4],[5,71,56,4],[4,87,72,4],[4,119,80,4],[4,2,2,2],[4,159,40,4],[4,7,2,2],[5,119,40,4],[4,139,60,4],[4,6,3,3],[5,99,60,4],[4,5,4,4],[4,99,100,4],[4,179,20,4],[5,139,20,4],[4,169,30,4],[5,129,30,4],[4,149,50,4],[5,109,50,4],[4,129,70,4],[5,89,70,4],[4,109,90,4],[4,125,84,4],[4,167,42,4],[5,125,42,4],[4,146,63,4],[5,104,63,4],[4,104,105,4],[4,188,21,4],[5,146,21,4],[4,143,96,4],[4,191,48,4],[5,143,48,4],[4,167,72,4],[5,119,72,4],[4,119,120,4],[4,215,24,4],[5,167,24,4],[4,203,36,4],[5,155,36,4],[4,179,60,4],[5,131,60,4],[4,155,84,4],[5,107,84,4],[4,131,108,4],[5,239,80,4],[5,199,120,4],[8,119,80,4],[8,2,2,2],[8,159,40,4],[8,7,2,2],[8,139,60,4],[8,6,3,3],[5,219,100,4],[8,5,4,4],[8,99,100,4],[8,4,5,4]],
  configurations: {1000000:{5000000:{8750:{timing_nom:0,timing_dat:1},8125:{timing_nom:2,timing_dat:3},7500:{timing_nom:4,timing_dat:5},6875:{timing_nom:6,timing_dat:7},6250:{timing_nom:8,timing_dat:9},5625:{timing_nom:10,timing_dat:11},5000:{timing_nom:12,timing_dat:13}},4000000:{9000:{timing_nom:14,timing_dat:15},8500:{timing_nom:16,timing_dat:17},8000:{timing_nom:18,timing_dat:19},7500:{timing_nom:4,timing_dat:20},7000:{timing_nom:21,timing_dat:22},6500:{timing_nom:23,timing_dat:24},6000:{timing_nom:25,timing_dat:26},5500:{timing_nom:27,timing_dat:28},5000:{timing_nom:12,timing_dat:29}},2000000:{9000:{timing_nom:30,timing_dat:31},8500:{timing_nom:32,timing_dat:33},8000:{timing_nom:34,timing_dat:35},7500:{timing_nom:36,timing_dat:37},7000:{timing_nom:38,timing_dat:39},6500:{timing_nom:40,timing_dat:41},6250:{timing_nom:42,timing_dat:43},6000:{timing_nom:44,timing_dat:45},5500:{timing_nom:46,timing_dat:47},5000:{timing_nom:48,timing_dat:49}},1000000:{9000:{timing_nom:50,timing_dat:50},8750:{timing_nom:51,timing_dat:51},8500:{timing_nom:52,timing_dat:52},8125:{timing_nom:53,timing_dat:53},8000:{timing_nom:54,timing_dat:54},7500:{timing_nom:55,timing_dat:55},7000:{timing_nom:56,timing_dat:56},6875:{timing_nom:57,timing_dat:57},6500:{timing_nom:58,timing_dat:58},6250:{timing_nom:42,timing_dat:42},6000:{timing_nom:59,timing_dat:59},5625:{timing_nom:60,timing_dat:60},5500:{timing_nom:61,timing_dat:61},5000:{timing_nom:62,timing_dat:62}}},800000:{5000000:{7500:{timing_nom:63,timing_dat:5},5000:{timing_nom:64,timing_dat:13}},4000000:{9000:{timing_nom:65,timing_dat:15},8500:{timing_nom:66,timing_dat:17},8000:{timing_nom:67,timing_dat:19},7500:{timing_nom:63,timing_dat:20},7000:{timing_nom:68,timing_dat:22},6500:{timing_nom:69,timing_dat:24},6000:{timing_nom:70,timing_dat:26},5500:{timing_nom:71,timing_dat:28},5000:{timing_nom:64,timing_dat:29}},2000000:{9000:{timing_nom:72,timing_dat:31},8000:{timing_nom:73,timing_dat:35},7500:{timing_nom:74,timing_dat:75},7000:{timing_nom:76,timing_dat:39},6000:{timing_nom:77,timing_dat:45},5000:{timing_nom:78,timing_dat:49}},1000000:{8000:{timing_nom:79,timing_dat:54},7500:{timing_nom:74,timing_dat:80},6000:{timing_nom:81,timing_dat:59},5000:{timing_nom:82,timing_dat:83}}},666667:{5000000:{8750:{timing_nom:84,timing_dat:1},7500:{timing_nom:85,timing_dat:5},6250:{timing_nom:86,timing_dat:9},5000:{timing_nom:87,timing_dat:13}},4000000:{9000:{timing_nom:88,timing_dat:15},8500:{timing_nom:89,timing_dat:17},8000:{timing_nom:90,timing_dat:19},7500:{timing_nom:85,timing_dat:20},7000:{timing_nom:91,timing_dat:22},6500:{timing_nom:92,timing_dat:24},6000:{timing_nom:93,timing_dat:26},5500:{timing_nom:94,timing_dat:28},5000:{timing_nom:87,timing_dat:29}},2000000:{9000:{timing_nom:95,timing_dat:31},8500:{timing_nom:96,timing_dat:33},8000:{timing_nom:97,timing_dat:35},7500:{timing_nom:98,timing_dat:37},7000:{timing_nom:99,timing_dat:39},6500:{timing_nom:100,timing_dat:41},6250:{timing_nom:101,timing_dat:43},6000:{timing_nom:102,timing_dat:45},5500:{timing_nom:103,timing_dat:47},5000:{timing_nom:104,timing_dat:49}},1000000:{9000:{timing_nom:105,timing_dat:50},8750:{timing_nom:106,timing_dat:51},8000:{timing_nom:107,timing_dat:54},7500:{timing_nom:108,timing_dat:80},7000:{timing_nom:109,timing_dat:56},6250:{timing_nom:101,timing_dat:42},6000:{timing_nom:110,timing_dat:59},5000:{timing_nom:111,timing_dat:62}}},500000:{5000000:{8750:{timing_nom:112,timing_dat:1},8125:{timing_nom:113,timing_dat:3},7500:{timing_nom:114,timing_dat:5},6875:{timing_nom:115,timing_dat:7},6250:{timing_nom:116,timing_dat:9},5625:{timing_nom:117,timing_dat:11},5000:{timing_nom:118,timing_dat:13}},4000000:{9000:{timing_nom:119,timing_dat:15},8500:{timing_nom:120,timing_dat:17},8000:{timing_nom:121,timing_dat:19},7500:{timing_nom:114,timing_dat:20},7000:{timing_nom:122,timing_dat:22},6500:{timing_nom:123,timing_dat:24},6000:{timing_nom:124,timing_dat:26},5500:{timing_nom:125,timing_dat:28},5000:{timing_nom:118,timing_dat:29}},2000000:{9000:{timing_nom:126,timing_dat:31},8500:{timing_nom:127,timing_dat:33},8000:{timing_nom:128,timing_dat:35},7500:{timing_nom:129,timing_dat:37},7000:{timing_nom:130,timing_dat:39},6500:{timing_nom:131,timing_dat:41},6250:{timing_nom:132,timing_dat:43},6000:{timing_nom:133,timing_dat:45},5500:{timing_nom:134,timing_dat:47},5000:{timing_nom:135,timing_dat:49}},1000000:{9000:{timing_nom:136,timing_dat:50},8750:{timing_nom:137,timing_dat:51},8500:{timing_nom:138,timing_dat:52},8125:{timing_nom:139,timing_dat:53},8000:{timing_nom:140,timing_dat:54},7500:{timing_nom:141,timing_dat:55},7000:{timing_nom:142,timing_dat:56},6875:{timing_nom:143,timing_dat:57},6500:{timing_nom:144,timing_dat:58},6250:{timing_nom:132,timing_dat:42},6000:{timing_nom:145,timing_dat:59},5625:{timing_nom:146,timing_dat:60},5500:{timing_nom:147,timing_dat:61},5000:{timing_nom:148,timing_dat:62}}},250000:{5000000:{7500:{timing_nom:149,timing_dat:5},6875:{timing_nom:150,timing_dat:7},6250:{timing_nom:151,timing_dat:9},5000:{timing_nom:152,timing_dat:153}},4000000:{8000:{timing_nom:154,timing_dat:19},7500:{timing_nom:149,timing_dat:20},7000:{timing_nom:155,timing_dat:22},6500:{timing_nom:156,timing_dat:24},6000:{timing_nom:157,timing_dat:26},5000:{timing_nom:152,timing_dat:158}},2000000:{9000:{timing_nom:159,timing_dat:31},8500:{timing_nom:160,timing_dat:33},8000:{timing_nom:161,timing_dat:35},7500:{timing_nom:162,timing_dat:37},7000:{timing_nom:163,timing_dat:39},6500:{timing_nom:164,timing_dat:41},6250:{timing_nom:165,timing_dat:43},6000:{timing_nom:166,timing_dat:45},5500:{timing_nom:167,timing_dat:47},5000:{timing_nom:152,timing_dat:49}},1000000:{9000:{timing_nom:168,timing_dat:50},8750:{timing_nom:169,timing_dat:51},8500:{timing_nom:170,timing_dat:52},8125:{timing_nom:171,timing_dat:53},8000:{timing_nom:172,timing_dat:54},7500:{timing_nom:173,timing_dat:55},7000:{timing_nom:174,timing_dat:56},6875:{timing_nom:175,timing_dat:57},6500:{timing_nom:176,timing_dat:58},6250:{timing_nom:165,timing_dat:42},6000:{timing_nom:177,timing_dat:59},5625:{timing_nom:178,timing_dat:60},5500:{timing_nom:179,timing_dat:61},5000:{timing_nom:180,timing_dat:62}}},200000:{5000000:{7500:{timing_nom:181,timing_dat:182},6250:{timing_nom:183,timing_dat:184},5000:{timing_nom:185,timing_dat:153}},4000000:{8000:{timing_nom:186,timing_dat:187},7000:{timing_nom:188,timing_dat:189},6000:{timing_nom:190,timing_dat:191},5000:{timing_nom:185,timing_dat:158}},2000000:{9000:{timing_nom:192,timing_dat:31},8500:{timing_nom:193,timing_dat:33},8000:{timing_nom:186,timing_dat:35},7500:{timing_nom:181,timing_dat:37},7000:{timing_nom:188,timing_dat:39},6500:{timing_nom:194,timing_dat:41},6250:{timing_nom:195,timing_dat:43},6000:{timing_nom:190,timing_dat:45},5500:{timing_nom:196,timing_dat:47},5000:{timing_nom:185,timing_dat:49}},1000000:{9000:{timing_nom:197,timing_dat:50},8750:{timing_nom:198,timing_dat:51},8500:{timing_nom:199,timing_dat:52},8125:{timing_nom:200,timing_dat:53},8000:{timing_nom:201,timing_dat:54},7500:{timing_nom:202,timing_dat:55},7000:{timing_nom:203,timing_dat:56},6875:{timing_nom:204,timing_dat:57},6500:{timing_nom:205,timing_dat:58},6250:{timing_nom:195,timing_dat:42},6000:{timing_nom:206,timing_dat:59},5625:{timing_nom:207,timing_dat:60},5500:{timing_nom:208,timing_dat:61},5000:{timing_nom:209,timing_dat:62}}},125000:{5000000:{7500:{timing_nom:210,timing_dat:182},6250:{timing_nom:211,timing_dat:184}},4000000:{8000:{timing_nom:212,timing_dat:187},7000:{timing_nom:213,timing_dat:189},6000:{timing_nom:214,timing_dat:191}},2000000:{8000:{timing_nom:212,timing_dat:35},7500:{timing_nom:210,timing_dat:37},7000:{timing_nom:213,timing_dat:39},6500:{timing_nom:215,timing_dat:41},6250:{timing_nom:216,timing_dat:43},6000:{timing_nom:214,timing_dat:45},5000:{timing_nom:217,timing_dat:218}},1000000:{9000:{timing_nom:219,timing_dat:50},8750:{timing_nom:220,timing_dat:51},8500:{timing_nom:221,timing_dat:52},8125:{timing_nom:222,timing_dat:53},8000:{timing_nom:223,timing_dat:54},7500:{timing_nom:224,timing_dat:55},7000:{timing_nom:225,timing_dat:56},6875:{timing_nom:226,timing_dat:57},6500:{timing_nom:227,timing_dat:58},6250:{timing_nom:216,timing_dat:42},6000:{timing_nom:228,timing_dat:59},5625:{timing_nom:229,timing_dat:60},5500:{timing_nom:230,timing_dat:61},5000:{timing_nom:217,timing_dat:62}}},100000:{4000000:{6000:{timing_nom:231,timing_dat:232}},2000000:{8000:{timing_nom:233,timing_dat:234},7500:{timing_nom:235,timing_dat:75},7000:{timing_nom:236,timing_dat:237},6250:{timing_nom:238,timing_dat:43},6000:{timing_nom:231,timing_dat:239},5000:{timing_nom:240,timing_dat:218}},1000000:{9000:{timing_nom:241,timing_dat:50},8750:{timing_nom:242,timing_dat:51},8500:{timing_nom:243,timing_dat:52},8125:{timing_nom:244,timing_dat:53},8000:{timing_nom:233,timing_dat:54},7500:{timing_nom:245,timing_dat:55},7000:{timing_nom:236,timing_dat:56},6875:{timing_nom:246,timing_dat:57},6500:{timing_nom:247,timing_dat:58},6250:{timing_nom:238,timing_dat:42},6000:{timing_nom:231,timing_dat:59},5625:{timing_nom:248,timing_dat:60},5500:{timing_nom:249,timing_dat:61},5000:{timing_nom:240,timing_dat:62}}},95238:{4000000:{6000:{timing_nom:250,timing_dat:232}},2000000:{8000:{timing_nom:251,timing_dat:234},7500:{timing_nom:252,timing_dat:75},7000:{timing_nom:253,timing_dat:237},6250:{timing_nom:254,timing_dat:43},6000:{timing_nom:250,timing_dat:239},5000:{timing_nom:255,timing_dat:218}},1000000:{9000:{timing_nom:256,timing_dat:50},8750:{timing_nom:257,timing_dat:51},8000:{timing_nom:251,timing_dat:54},7500:{timing_nom:252,timing_dat:80},7000:{timing_nom:253,timing_dat:56},6250:{timing_nom:254,timing_dat:42},6000:{timing_nom:250,timing_dat:59},5000:{timing_nom:255,timing_dat:62}}},83333:{4000000:{6000:{timing_nom:258,timing_dat:232}},2000000:{8000:{timing_nom:259,timing_dat:234},7500:{timing_nom:260,timing_dat:75},7000:{timing_nom:261,timing_dat:237},6250:{timing_nom:262,timing_dat:43},6000:{timing_nom:258,timing_dat:239},5000:{timing_nom:263,timing_dat:218}},1000000:{9000:{timing_nom:264,timing_dat:50},8750:{timing_nom:265,timing_dat:51},8500:{timing_nom:266,timing_dat:52},8125:{timing_nom:267,timing_dat:53},8000:{timing_nom:259,timing_dat:54},7500:{timing_nom:268,timing_dat:55},7000:{timing_nom:261,timing_dat:56},6875:{timing_nom:269,timing_dat:57},6500:{timing_nom:270,timing_dat:58},6250:{timing_nom:262,timing_dat:42},6000:{timing_nom:258,timing_dat:59},5625:{timing_nom:271,timing_dat:60},5500:{timing_nom:272,timing_dat:61},5000:{timing_nom:263,timing_dat:62}}},50000:{2000000:{7500:{timing_nom:273,timing_dat:75},6250:{timing_nom:274,timing_dat:43},6000:{timing_nom:275,timing_dat:276}},1000000:{8000:{timing_nom:277,timing_dat:278},7500:{timing_nom:273,timing_dat:80},7000:{timing_nom:279,timing_dat:280},6875:{timing_nom:281,timing_dat:57},6250:{timing_nom:274,timing_dat:42},6000:{timing_nom:275,timing_dat:282},5000:{timing_nom:283,timing_dat:284}}}}
};

/**
 * Get all available nominal bitrates (sorted low to high)
 */
export function getNominalBitrates(): number[] {
  return Object.keys(phyConfigurations.configurations).map(Number).sort((a, b) => a - b);
}

/**
 * Get available data bitrates for a given nominal bitrate (sorted low to high)
 */
export function getDataBitrates(nominalBitrate: number): number[] {
  const nomConfig = phyConfigurations.configurations[nominalBitrate];
  if (!nomConfig) return [];
  return Object.keys(nomConfig).map(Number).sort((a, b) => a - b);
}

/**
 * Get available sample points for a given nominal/data bitrate combination
 * Returns sample points as percentages (e.g., 80 for 80%)
 */
export function getSamplePoints(nominalBitrate: number, dataBitrate: number): number[] {
  const nomConfig = phyConfigurations.configurations[nominalBitrate];
  const dataConfig = nomConfig ? nomConfig[dataBitrate] : null;
  if (!dataConfig) return [];
  // Convert from internal format (e.g., 8000) to percentage (e.g., 80)
  return Object.keys(dataConfig).map(key => Number(key) / 100).sort((a, b) => a - b);
}

/**
 * Get timing parameters for a specific configuration
 * @param nominalBitrate - Nominal bitrate in Hz
 * @param dataBitrate - Data bitrate in Hz
 * @param samplePoint - Sample point as percentage (e.g., 80 for 80%)
 * @returns Timing parameters or null if not found
 */
export function getTiming(nominalBitrate: number, dataBitrate: number, samplePoint: number): TimingResult | null {
  const nomConfig = phyConfigurations.configurations[nominalBitrate];
  const dataConfig = nomConfig ? nomConfig[dataBitrate] : null;
  // Convert percentage (e.g., 80) to internal format (e.g., 8000)
  const spKey = Math.round(samplePoint * 100);
  const config = dataConfig ? dataConfig[spKey] : null;

  if (!config) return null;

  const timingNomArray = phyConfigurations.timings[config.timing_nom];
  const timingDatArray = phyConfigurations.timings[config.timing_dat];

  if (!timingNomArray || !timingDatArray) return null;

  return {
    timing: {
      brp: timingNomArray[0],
      seg1: timingNomArray[1],
      seg2: timingNomArray[2],
      sjw: timingNomArray[3]
    },
    timingData: {
      brp: timingDatArray[0],
      seg1: timingDatArray[1],
      seg2: timingDatArray[2],
      sjw: timingDatArray[3]
    }
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Enumerate all integer-equivalent (brp, seg1, seg2) tuples for a given
 * bit-timing. Two encodings are equivalent iff they yield the same bit rate
 * and the same sample point. `sjw` does not enter the equivalence relation.
 *
 * The class is generated by one parameter: reduce `(brp, tq, p1, p2)` to its
 * canonical "minimum tq" form by dividing tq/p1/p2 by `g = gcd(tq, p1)` and
 * absorbing g into `brp`; then every divisor of that absorbed brp yields one
 * equivalent encoding.
 */
export function timingEquivalenceClass(t: Bittiming): Array<[number, number, number]> {
  const tq = 1 + t.seg1 + t.seg2;
  const p1 = 1 + t.seg1;
  const g = gcd(tq, p1);
  const p1Unit = p1 / g;
  const p2Unit = t.seg2 / g;
  const baseBrp = t.brp * g;

  const variants: Array<[number, number, number]> = [];
  for (let m = 1; m <= baseBrp; m++) {
    if (baseBrp % m === 0) {
      variants.push([baseBrp / m, p1Unit * m - 1, p2Unit * m]);
    }
  }
  return variants;
}

/**
 * Reverse lookup: find configuration from timing parameters
 * Used during initialization to determine current device settings.
 *
 * Matches by integer encoding equivalence (same bit rate and sample point),
 * not by exact 4-tuple equality, so encodings from external tools
 * (python-can, can-utils, ...) that differ in brp/segment granularity or
 * sjw still resolve to the same preset webCAN would have written. Returns
 * null only when no preset in the table is equivalent — i.e. the device is
 * running a bit rate or sample point the dropdowns cannot represent.
 *
 * @param timing - Nominal timing parameters
 * @param timingData - Data timing parameters
 * @returns Configuration or null if not found
 */
export function findConfigByTiming(timing: Bittiming, timingData: Bittiming): ConfigLookupResult | null {
  const nomVariants = timingEquivalenceClass(timing);
  const datVariants = timingEquivalenceClass(timingData);
  const isVariant = (t: TimingTuple, set: Array<[number, number, number]>): boolean =>
    set.some(([b, s1, s2]) => t[0] === b && t[1] === s1 && t[2] === s2);

  for (const nomKey in phyConfigurations.configurations) {
    const nomConfig = phyConfigurations.configurations[Number(nomKey)];
    for (const datKey in nomConfig) {
      const dataConfig = nomConfig[Number(datKey)];
      for (const spKey in dataConfig) {
        const config = dataConfig[Number(spKey)];
        const timingNomArray = phyConfigurations.timings[config.timing_nom];
        const timingDatArray = phyConfigurations.timings[config.timing_dat];

        if (timingNomArray && timingDatArray) {
          if (isVariant(timingNomArray, nomVariants) && isVariant(timingDatArray, datVariants)) {
            return {
              nominalBitrate: Number(nomKey),
              dataBitrate: Number(datKey),
              samplingPoint: Number(spKey) / 100
            };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Find closest value in an array to a target
 */
export function findClosest(values: number[], target: number): number | null {
  if (values.length === 0) return null;
  return values.reduce((prev, curr) =>
    Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
  );
}

/**
 * Format bitrate for display (e.g., 1000000 -> "1 Mbit/s")
 */
export function formatBitrate(bitrate: number): string {
  if (bitrate >= 1000000) {
    return `${bitrate / 1000000} Mbit/s`;
  }
  return `${bitrate / 1000} kbit/s`;
}

/**
 * Format sample point for display (e.g., 80 -> "80.00%")
 */
export function formatSamplePoint(samplePoint: number): string {
  return `${samplePoint.toFixed(2)}%`;
}
