/**
 * device-config: configure a CANsub through the REST API only, no frame stream.
 * Reads the device info, syncs the device time and sets the bit rate of the chosen
 * channel. Apps built on `shared/ui` get the same through the sidebar.
 */
import {
  createApiClient,
  findConfigByTiming,
  formatBitrate,
  getTiming,
  resolvePhySelection,
} from '@csselectronics/rest-client';
import { connectForm } from '../../shared/ConnectForm';

// The bit rate to set; resolvePhySelection snaps it to the closest preset in the CANsub bit-timing table.
const WANTED = { nominalBitrate: 500_000, dataBitrate: 2_000_000, samplePoint: 80 };
const TIME_SYNC_THRESHOLD_MS = 5000;

const { url, bus } = await connectForm(document.getElementById('connect-bar')!);
const channel = Number(bus.slice(3));

const logEl = document.getElementById('log')!;
function log(msg: string, cls: 'ok' | 'err' | 'info' = 'info'): void {
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = msg;
  logEl.append(line);
}

const api = createApiClient(url);

try {
  log(`API version: ${await api.apiVersionGet()}`, 'ok');

  const info = await api.apiInfoGet();
  log(`Device: ${info.id.toUpperCase()}  HW: ${info.hwVer}  FW: ${info.fwVer}`, 'ok');

  const channels = await api.apiCanGet();
  if (!channels.includes(channel)) throw new Error(`${bus} does not exist on this device (channels: ${channels.join(', ')})`);

  const deviceTime = (await api.apiTimeGet()).utc;
  const timeDiff = Math.abs(deviceTime.getTime() - Date.now());
  if (timeDiff > TIME_SYNC_THRESHOLD_MS) {
    // ratePpb 0: no clock rate correction is known. Setting the time disables PTP
    // synchronization for the rest of the device's power cycle.
    await api.apiTimePut({ time: { utc: new Date(), ratePpb: 0 } });
    log(`Time synced (was off by ${(timeDiff / 1000).toFixed(1)} s)`, 'ok');
  } else {
    log(`Time OK (off by ${(timeDiff / 1000).toFixed(1)} s)`, 'ok');
  }

  const phyBefore = await api.apiCanChannelPhyGet({ channel });
  const current = findConfigByTiming(phyBefore.timing, phyBefore.timingData);
  log(current
    ? `${bus} now: ${formatBitrate(current.nominalBitrate)} / ${formatBitrate(current.dataBitrate)}, sample point ${current.samplingPoint}%`
    : `${bus} now: a bit timing that is not in the table`);

  const wanted = resolvePhySelection(WANTED);
  const timing = getTiming(wanted.nominalBitrate, wanted.dataBitrate, wanted.samplePoint)!;
  await api.apiCanChannelPhyPut({
    channel,
    phy: {
      listenOnly: false,
      autoReset: true,
      errorFrames: false,
      txAckFrames: true,
      timing: timing.timing,
      timingData: timing.timingData,
    },
  });
  log(`${bus} set to ${formatBitrate(wanted.nominalBitrate)} / ${formatBitrate(wanted.dataBitrate)}, sample point ${wanted.samplePoint}%`, 'ok');

  const phyAfter = await api.apiCanChannelPhyGet({ channel });
  const confirmed = findConfigByTiming(phyAfter.timing, phyAfter.timingData);
  if (confirmed?.nominalBitrate === wanted.nominalBitrate && confirmed.dataBitrate === wanted.dataBitrate) {
    log('Read-back matches', 'ok');
  } else {
    log('Read-back does not match the bit rate that was set', 'err');
  }
} catch (e) {
  log(`Error: ${e instanceof Error ? e.message : e}. Is the channel connected in another tab or app? The device only accepts PHY changes on a closed channel.`, 'err');
}
