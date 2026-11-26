/**
 * Building blocks for CANsub web apps. Import the CSS once (this module does it) and
 * combine: a `CansubSession`, the sidebar (or its panels one by one), a signal picker
 * and live charts. Every part is plain TypeScript and DOM: copy and adapt as needed.
 */
import './cansub-ui.css';

export { CansubSession, type DeviceSummary, type SessionOptions } from './session';
export { mountSidebar, type SidebarOptions } from './sidebar';
export { mountDevicePanel } from './devicePanel';
export { mountChannelPanel, type ChannelPanelOptions } from './channelPanel';
export { mountDbcPanel, type DbcPanelOptions, type DbcFile } from './dbcPanel';
export { mountSignalPicker, type SignalPicker, type SignalPickerOptions } from './signalPicker';
export { mountMessagePicker } from './messagePicker';
export { mountLiveChart, type LiveChart, type LiveChartOptions } from './liveChart';
export { h, replaceChildren } from './dom';
export { normalizeDeviceUrl } from './deviceUrl';
export { framesToCsv, csvToFrames, downloadCsv, CSV_HEADER } from './csv';
