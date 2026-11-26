import { effect, untracked } from '@preact/signals-core';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';

/** A DBC file bundled with the app, e.g. `{ name: 'engine.dbc', content: engineDbc }` with `import engineDbc from './engine.dbc?raw'`. */
export interface DbcFile {
  name: string;
  content: string;
}

export interface DbcPanelOptions {
  /** Files to start with the first time the app runs in a browser. */
  defaults?: DbcFile[];
  /** Remember the loaded files and their channels in this browser under this name (default: one per page). Pass null to not remember. */
  rememberAs?: string | null;
}

interface StoredDbc extends DbcFile {
  /** Channels this file decodes; empty means all channels. */
  buses: CanBusName[];
}

/**
 * Load DBC files (file picker or drag and drop) and choose the channels each one
 * decodes. A new file decodes every channel; click a channel chip to toggle it.
 * When several files decode a channel, the first loaded file wins on duplicate IDs.
 */
export function mountDbcPanel(container: HTMLElement, session: CansubSession, options: DbcPanelOptions = {}): () => void {
  const storageKey = options.rememberAs === null ? null : `cansub-dbc-files:${options.rememberAs ?? location.pathname}`;
  let files: StoredDbc[] = [];
  let error: string | null = null;

  const fileInput = h('input', {
    type: 'file', accept: '.dbc', multiple: true, hidden: true,
    onchange: () => void addFiles(fileInput.files),
  });
  const list = h('div', { class: 'cs-dbc-list' });
  const drop = h('div', { class: 'cs-drop' },
    h('button', { class: 'cs-btn cs-btn-secondary', onclick: () => fileInput.click() }, 'Load DBC files'),
    h('span', { class: 'cs-muted' }, ' or drop them here'),
  );
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('cs-drop-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('cs-drop-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('cs-drop-over');
    void addFiles(e.dataTransfer?.files ?? null);
  });
  replaceChildren(container, drop, fileInput, list);

  async function addFiles(fileList: FileList | null): Promise<void> {
    if (!fileList) return;
    const added: DbcFile[] = [];
    for (const file of Array.from(fileList)) added.push({ name: file.name, content: await file.text() });
    fileInput.value = '';
    load(added.map(f => ({ ...f, buses: [] })));
    void save();
  }

  // Replaces same-named files in place, so their channel choice survives a reload of the file.
  function load(newFiles: StoredDbc[]): void {
    error = null;
    for (const file of newFiles) {
      try {
        const existing = files.find(f => f.name === file.name);
        if (existing) {
          session.dbcFiles.replaceLocal(file.name, file.content);
          existing.content = file.content;
        } else {
          session.dbcFiles.loadLocal(file.name, file.content);
          files.push(file);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    apply();
  }

  function remove(name: string): void {
    const entry = session.dbcFiles.localDefinitions.value.find(d => d.name === name);
    if (entry) session.dbcFiles.removeLocal(entry.id);
    files = files.filter(f => f.name !== name);
    apply();
    void save();
  }

  function toggleBus(file: StoredDbc, bus: CanBusName): void {
    const current = file.buses.length ? file.buses : session.buses;
    const next = current.includes(bus) ? current.filter(b => b !== bus) : [...current, bus];
    file.buses = next.length === session.buses.length ? [] : next;
    apply();
    void save();
  }

  function apply(): void {
    for (const bus of session.buses) {
      session.setChannelDbcs(bus, files.filter(f => decodes(f, bus)).map(f => f.name));
    }
    render();
  }

  function render(): void {
    const buses = session.buses;
    replaceChildren(list,
      files.length === 0 ? h('p', { class: 'cs-muted' }, 'No DBC files loaded: frames are shown raw.') : null,
      ...files.map(file => h('div', { class: 'cs-dbc' },
        h('div', { class: 'cs-dbc-name', title: file.name }, file.name),
        h('div', { class: 'cs-chips' },
          ...buses.map(bus => h('button', {
            class: `cs-chip${decodes(file, bus) ? ' cs-chip-on' : ''}`,
            title: `Decode ${bus} with ${file.name}`,
            onclick: () => toggleBus(file, bus),
          }, bus)),
          h('button', { class: 'cs-icon-btn', title: `Remove ${file.name}`, onclick: () => remove(file.name) }, '×'),
        ),
      )),
      error ? h('p', { class: 'cs-error' }, error) : null,
    );
  }

  async function save(): Promise<void> {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, await compress(JSON.stringify(files)));
    } catch {
      error = 'The DBC files are too large to remember in this browser; load them again next time.';
      render();
    }
  }

  async function restore(): Promise<void> {
    let stored: StoredDbc[] | null = null;
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) stored = JSON.parse(await decompress(raw));
      } catch { /* unreadable: start from the defaults */ }
    }
    load(stored ?? (options.defaults ?? []).map(f => ({ ...f, buses: [] })));
  }

  // Channels are known once a device is open; assignments need them.
  let restored = false;
  const dispose = effect(() => {
    if (!session.device.value) return;
    untracked(() => {
      if (!restored) {
        restored = true;
        void restore();
      } else {
        apply();
      }
    });
  });
  render();
  return dispose;
}

function decodes(file: StoredDbc, bus: CanBusName): boolean {
  return file.buses.length === 0 || file.buses.includes(bus);
}

// DBC files compress about tenfold, which keeps large files inside the localStorage quota.
async function compress(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function decompress(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
