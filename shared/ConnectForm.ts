import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import { initialDeviceUrl, normalizeDeviceUrl, saveDeviceUrl } from './ui/deviceUrl';
import './ui/cansub-ui.css';

/**
 * A one-line URL (and optionally CAN channel) form for the minimal examples that use the
 * packages directly. Apps built on `shared/ui` use its sidebar instead.
 */
export function connectForm(container: HTMLElement, options: { bus?: boolean; label?: string } = {}): Promise<{ url: string; bus: CanBusName }> {
  const withBus = options.bus ?? true;
  container.innerHTML = `
    <div class="cs-row" style="max-width: 560px">
      <input id="cf-url" class="cs-input" type="text" placeholder="e.g. https://2c08fbb4-usb.local"
        title="USB: https://<device ID>-usb.local, e.g. https://2c08fbb4-usb.local. Ethernet: the device hostname or IP" />
      <select id="cf-bus" class="cs-input" style="flex: none; width: auto;${withBus ? '' : ' display: none'}">
        <option value="CAN1">CAN1</option>
        <option value="CAN2">CAN2</option>
        <option value="CAN3">CAN3</option>
        <option value="CAN4">CAN4</option>
      </select>
      <button id="cf-go" class="cs-btn" style="width: 110px">${options.label ?? 'connect'}</button>
    </div>
    <p id="cf-error" class="cs-error"></p>`;

  const urlInput = container.querySelector<HTMLInputElement>('#cf-url')!;
  const busSelect = container.querySelector<HTMLSelectElement>('#cf-bus')!;
  const btn = container.querySelector<HTMLButtonElement>('#cf-go')!;
  const errorEl = container.querySelector<HTMLParagraphElement>('#cf-error')!;
  urlInput.value = initialDeviceUrl() ?? '';

  return new Promise((resolve) => {
    btn.addEventListener('click', () => {
      const url = normalizeDeviceUrl(urlInput.value);
      if (!url) {
        errorEl.textContent = 'Enter the device URL, e.g. https://2c08fbb4-usb.local';
        return;
      }
      saveDeviceUrl(url);
      errorEl.textContent = '';
      urlInput.value = url;
      btn.disabled = true;
      urlInput.disabled = true;
      busSelect.disabled = true;
      resolve({ url, bus: busSelect.value as CanBusName });
    });
  });
}
