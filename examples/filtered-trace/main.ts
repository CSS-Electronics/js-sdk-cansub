/**
 * filtered-trace: a time-sorted trace across all connected channels, filtered by
 * CAN ID. The session stores every frame and keeps a filtered view of the IDs
 * selected in the message picker (`session.filteredStorage`). Raw frames only, no decoding.
 */
import { formatCanId, formatDataBytes } from '@csselectronics/websocket-client/utils/DataFormatter';
import { formatEpochLong } from '@csselectronics/websocket-client/utils/EpochFormatter';
import { CansubSession, mountSidebar, mountMessagePicker, h } from '../../shared/ui';

const DISPLAY_ROWS = 50;

const session = new CansubSession();
const picker = h('div');
mountSidebar(document.getElementById('sidebar')!, session, {
  title: 'Filtered trace',
  dbc: false,
  extra: h('section', { class: 'cs-section' }, h('h2', { class: 'cs-section-title' }, 'CAN IDs'), picker),
});
mountMessagePicker(picker, session);

const tbody = document.getElementById('frame-tbody')!;
function render(): void {
  const last = session.filteredStorage.getLastFrame();
  const frames = last ? session.filteredStorage.getFrameWindow(DISPLAY_ROWS, 0, last.epoch) : [];
  tbody.replaceChildren(...frames.map(f => h('tr', {},
    h('td', {}, formatEpochLong(f.epoch)),
    h('td', {}, f.bus),
    h('td', {}, formatCanId(f.arbitration_id, f.ide)),
    h('td', {}, f.is_tx ? 'TX' : 'RX'),
    h('td', { class: 'cs-num' }, f.len),
    h('td', {}, formatDataBytes(f.data)),
  )));
}
session.onUpdate(render);
// The filtered view rebuilds when the selection changes; show it even while no frames arrive.
session.messages.selectedMessageKeys.subscribe(() => queueMicrotask(render));
