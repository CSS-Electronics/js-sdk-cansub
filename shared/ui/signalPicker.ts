import { effect } from '@preact/signals-core';
import type { SignalInfo } from '@csselectronics/can-types/types/FilterTypes';
import { compareItemKeys } from '@csselectronics/can-pipeline/utils/compareItemKeys';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';

export interface SignalPickerOptions {
  /** Called with the selected signal keys whenever the selection changes. */
  onChange: (keys: string[]) => void;
  /** Keys selected at start (default: the selection remembered in this browser). */
  selected?: string[];
  /** Remember the selection in this browser under this name (default: one per page). Pass null to not remember. */
  rememberAs?: string | null;
  /** Most signals that can be selected at once (default unlimited). */
  max?: number;
  /** Show only the signals this returns true for, e.g. one message or channel. */
  filter?: (key: string, info: SignalInfo) => boolean;
}

export interface SignalPicker {
  getSelected(): string[];
  setSelected(keys: string[]): void;
  dispose(): void;
}

/**
 * Searchable checklist of the decoded signals seen on the connected channels,
 * grouped by channel and message. Signals appear once a DBC decodes them and
 * frames arrive; transmitted frames are marked TX.
 */
export function mountSignalPicker(container: HTMLElement, session: CansubSession, options: SignalPickerOptions): SignalPicker {
  const storageKey = options.rememberAs === null ? null : `cansub-signals:${options.rememberAs ?? location.pathname}`;
  const selected = new Set<string>(options.selected ?? readRemembered(storageKey));
  let search = '';
  let shownCount = -1;
  let shownDbcVersion = -1;

  const searchInput = h('input', {
    type: 'search',
    class: 'cs-input',
    placeholder: 'Search signals',
    oninput: () => { search = searchInput.value.trim().toLowerCase(); renderList(); },
  });
  const summary = h('div', { class: 'cs-muted cs-picker-summary' });
  const list = h('div', { class: 'cs-picker-list' });
  replaceChildren(container, searchInput, summary, list);

  function changed(): void {
    const keys = [...selected];
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(keys)); } catch { /* storage unavailable */ }
    }
    options.onChange(keys);
    renderList();
  }

  function toggle(key: string, on: boolean): void {
    if (on && options.max !== undefined && selected.size >= options.max) return;
    if (on) selected.add(key); else selected.delete(key);
    changed();
  }

  function renderList(): void {
    const signals = session.getSignals();
    const groups = new Map<string, Array<[string, SignalInfo]>>();
    let total = 0;
    for (const key of [...signals.keys()].sort(compareItemKeys)) {
      const info = signals.get(key)!;
      if (options.filter && !options.filter(key, info)) continue;
      total++;
      const groupLabel = `${info.bus} ${info.formattedId} ${info.message.name}${info.isTx ? ' TX' : ''}`;
      if (search && !`${groupLabel} ${info.signal.name}`.toLowerCase().includes(search)) continue;
      let group = groups.get(groupLabel);
      if (!group) groups.set(groupLabel, group = []);
      group.push([key, info]);
    }
    summary.textContent = total === 0 ? '' : `${selected.size} of ${total} signals selected`;
    const full = options.max !== undefined && selected.size >= options.max;
    replaceChildren(list, ...[...groups].map(([label, items]) =>
      h('div', { class: 'cs-picker-group' },
        h('div', { class: 'cs-picker-group-label', title: label }, label),
        ...items.map(([key, info]) => h('label', { class: 'cs-check', title: info.signal.unit ? `${info.signal.name} (${info.signal.unit})` : info.signal.name },
          h('input', {
            type: 'checkbox',
            checked: selected.has(key),
            disabled: full && !selected.has(key),
            onchange: (e: Event) => toggle(key, (e.target as HTMLInputElement).checked),
          }),
          h('span', { class: 'cs-picker-name' }, info.signal.name),
          info.signal.unit ? h('span', { class: 'cs-muted cs-picker-unit' }, info.signal.unit) : null,
        )),
      ),
    ));
  }

  // Re-render only when new signals appear or the DBC assignment changes, not on every batch.
  const dispose = effect(() => {
    session.ticks.frameUpdate.value;
    const dbcVersion = session.dbcVersion.value;
    const count = session.messages.getAvailableSignals().size;
    if (count === shownCount && dbcVersion === shownDbcVersion) return;
    shownCount = count;
    shownDbcVersion = dbcVersion;
    renderList();
  });
  options.onChange([...selected]);

  return {
    getSelected: () => [...selected],
    setSelected: keys => { selected.clear(); keys.forEach(k => selected.add(k)); changed(); },
    dispose,
  };
}

function readRemembered(storageKey: string | null): string[] {
  if (!storageKey) return [];
  try {
    const keys = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
