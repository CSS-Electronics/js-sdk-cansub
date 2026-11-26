import { effect } from '@preact/signals-core';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';
import { initialDeviceUrl, normalizeDeviceUrl } from './deviceUrl';

const URL_HINT = 'USB: https://<device ID>-usb.local, e.g. https://2c08fbb4-usb.local. Ethernet: the device hostname or IP';

/**
 * The device the app talks to. Shows the device once it answers, with a Change link;
 * otherwise a URL field with a Check button. On load it checks the known URL
 * (`?device=`, the last one used, or the page origin when the CANsub serves the page),
 * so a reload comes straight back to the same device. Connecting to CAN channels is
 * a separate step, in the channel panel.
 */
export function mountDevicePanel(container: HTMLElement, session: CansubSession): () => void {
  let checking: string | null = null;
  let error: string | Node | null = null;
  let editing = false;

  const input = h('input', {
    type: 'text',
    class: 'cs-input',
    placeholder: 'e.g. https://2c08fbb4-usb.local',
    title: URL_HINT,
    value: initialDeviceUrl() ?? '',
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') void check();
      if ((e as KeyboardEvent).key === 'Escape' && session.device.value) { editing = false; render(); }
    },
  });

  async function check(): Promise<void> {
    const url = normalizeDeviceUrl(input.value);
    if (!url) {
      error = 'Enter the device URL, e.g. https://2c08fbb4-usb.local';
      render();
      return;
    }
    input.value = url;
    checking = url;
    error = null;
    render();
    try {
      await session.open(url);
      editing = false;
    } catch (e) {
      error = describeError(e, url);
    } finally {
      checking = null;
      render();
    }
  }

  function render(): void {
    const device = session.device.value;
    const anyConnected = session.connection.connectedBuses.value.size > 0;

    if (checking) {
      replaceChildren(container, h('div', { class: 'cs-device' }, h('span', { class: 'cs-muted' }, `Checking ${checking}…`)));
      return;
    }

    if (device && !editing) {
      replaceChildren(container,
        h('div', { class: 'cs-device' },
          h('div', { class: 'cs-device-line' },
            h('span', { class: 'cs-dot cs-dot-on' }),
            h('span', {}, h('b', {}, `ID: ${device.id}`), h('span', { class: 'cs-muted' }, ` | HW: ${device.hwVer} | FW: ${device.fwVer}`)),
          ),
          h('div', { class: 'cs-device-line' },
            h('span', { class: 'cs-device-url', title: device.url }, device.url),
            h('button', {
              class: 'cs-link',
              disabled: anyConnected,
              title: anyConnected ? 'Disconnect all channels to change the device' : 'Use another device',
              onclick: () => { editing = true; input.value = device.url; render(); input.focus(); },
            }, 'Change'),
          ),
        ),
      );
      return;
    }

    replaceChildren(container,
      h('div', { class: 'cs-row' },
        input,
        h('button', { class: 'cs-btn', title: 'Check that the device answers and read its channels', onclick: () => void check() }, 'Check'),
      ),
      error ? h('p', { class: 'cs-error' }, error) : device ? null : h('p', { class: 'cs-muted cs-hint' }, 'Enter the URL of your CANsub.'),
    );
  }

  const dispose = effect(render);
  if (input.value) void check();
  return dispose;
}

const CERTIFICATE_GUIDE = 'https://canlogger.csselectronics.com/cansub-docs/cansub2/getting_started/certificate/index.html';

function describeError(e: unknown, url: string): string | Node {
  // fetch rejects with a TypeError when the host is unreachable or the browser does not trust its
  // certificate (the REST client wraps it in a FetchError). A cross-origin page gets no certificate
  // prompt, so point the user to one.
  if (e instanceof TypeError || (e instanceof Error && e.cause instanceof TypeError)) {
    return h('span', {},
      `No answer from ${url}. If the URL is right, this browser does not trust the CANsub certificate yet: `,
      h('a', { href: url, target: '_blank', rel: 'noopener' }, 'open the device'),
      ' in a new tab and accept the warning, then Check again. To avoid this, ',
      h('a', { href: CERTIFICATE_GUIDE, target: '_blank', rel: 'noopener' }, 'install the certificate'),
      '.',
    );
  }
  return e instanceof Error ? e.message : String(e);
}
