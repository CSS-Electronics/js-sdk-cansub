/** frame-table: the newest raw frames of every connected channel. */
import { formatCanId, formatDataBytes } from '@csselectronics/websocket-client/utils/DataFormatter';
import { formatEpochLong } from '@csselectronics/websocket-client/utils/EpochFormatter';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import { CansubSession, mountSidebar, h } from '../../shared/ui';

const MAX_ROWS = 200;

const session = new CansubSession();
mountSidebar(document.getElementById('sidebar')!, session, { title: 'Frame table', dbc: false });

let recent: CanFrame[] = [];
let totalFrames = 0;

session.onFrames(frames => {
  totalFrames += frames.length;
  recent = recent.concat(frames).slice(-MAX_ROWS);
});

const tbody = document.getElementById('frame-tbody')!;
session.onUpdate(() => {
  document.getElementById('frame-count')!.textContent = totalFrames.toLocaleString();
  tbody.replaceChildren(...recent.slice().reverse().map(f => h('tr', {},
    h('td', {}, formatEpochLong(f.epoch)),
    h('td', {}, f.bus),
    h('td', {}, formatCanId(f.arbitration_id, f.ide)),
    h('td', {}, f.is_tx ? 'TX' : 'RX'),
    h('td', { class: 'cs-num' }, f.len),
    h('td', {}, formatDataBytes(f.data)),
  )));
});
