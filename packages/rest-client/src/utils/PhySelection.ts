import { findClosest, getDataBitrates, getNominalBitrates, getSamplePoints } from './BitrateConfigurations';

/** A bit-rate choice: nominal and data bit rate in bit/s, sample point in percent (e.g. 80). */
export interface PhySelection {
  nominalBitrate: number;
  dataBitrate: number;
  samplePoint: number;
}

/** A valid selection plus the values each dropdown can offer for it. */
export interface ResolvedPhySelection extends PhySelection {
  options: {
    nominalBitrates: number[];
    dataBitrates: number[];
    samplePoints: number[];
  };
}

/**
 * Snap a bit-rate selection to the closest preset in the bit-timing table.
 *
 * Fields are resolved in dropdown order: the nominal bit rate first, then the data
 * bit rate among those the nominal allows, then the sample point. A field that is
 * already valid keeps its value, so changing one dropdown only moves the ones after it.
 * Pass the result to `getTiming` to get the `Bittiming` pair for the PHY request.
 */
export function resolvePhySelection(selection: PhySelection): ResolvedPhySelection {
  const nominalBitrates = getNominalBitrates();
  const nominalBitrate = snap(nominalBitrates, selection.nominalBitrate);
  const dataBitrates = getDataBitrates(nominalBitrate);
  const dataBitrate = snap(dataBitrates, selection.dataBitrate);
  const samplePoints = getSamplePoints(nominalBitrate, dataBitrate);
  const samplePoint = snap(samplePoints, selection.samplePoint);
  return {
    nominalBitrate,
    dataBitrate,
    samplePoint,
    options: { nominalBitrates, dataBitrates, samplePoints },
  };
}

function snap(values: number[], target: number): number {
  return values.includes(target) ? target : (findClosest(values, target) ?? target);
}
