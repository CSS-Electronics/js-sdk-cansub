import { effect } from '@preact/signals-core';
import { compareItemKeys } from '@csselectronics/can-pipeline/utils/compareItemKeys';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';

/**
 * Searchable checklist of the raw CAN IDs seen on the connected channels, grouped by
 * channel, with "all" / "none" for the IDs shown. It drives the session's message
 * selection, which filters `session.filteredStorage` (e.g. a filtered trace).
 * New IDs are selected automatically until the first change.
 */
export function mountMessagePicker(container: HTMLElement, session: CansubSession): () => void {
  const messages = session.messages;
  let search = '';
  let shownCount = -1;
  let shownSelection: ReadonlySet<string> | null = null;

  const searchInput = h('input', {
    type: 'search',
    class: 'cs-input',
    placeholder: 'Search CAN IDs',
    oninput: () => { search = searchInput.value.trim().toLowerCase(); render(); },
  });
  const summary = h('div', { class: 'cs-picker-summary' });
  const list = h('div', { class: 'cs-picker-list' });
  replaceChildren(container, searchInput, summary, list);

  function visibleKeys(): string[] {
    const available = messages.getAvailableMessages();
    return [...available.keys()].sort(compareItemKeys).filter(key => {
      if (!search) return true;
      const info = available.get(key)!;
      return `${info.bus} ${info.displayLabel}`.toLowerCase().includes(search);
    });
  }

  function render(): void {
    const available = messages.getAvailableMessages();
    shownCount = available.size;
    const keys = visibleKeys();
    const selected = messages.selectedMessageKeys.peek();
    shownSelection = selected;
    const selectedCount = [...available.keys()].filter(k => selected.has(k)).length;

    replaceChildren(summary, available.size === 0 ? null : h('div', { class: 'cs-picker-actions' },
      h('span', { class: 'cs-muted' }, `${selectedCount} of ${available.size} IDs shown`),
      h('button', {
        class: 'cs-link',
        title: search ? 'Select the IDs that match the search' : 'Select all IDs, including new ones',
        onclick: () => { if (search) messages.selectFiltered(keys); else messages.selectAll(); },
      }, 'all'),
      h('span', { class: 'cs-muted' }, '|'),
      h('button', {
        class: 'cs-link',
        title: search ? 'Deselect the IDs that match the search' : 'Deselect all IDs',
        onclick: () => messages.deselectFiltered(keys),
      }, 'none'),
    ));

    const groups = new Map<string, string[]>();
    for (const key of keys) {
      const bus = available.get(key)!.bus;
      let group = groups.get(bus);
      if (!group) groups.set(bus, group = []);
      group.push(key);
    }
    replaceChildren(list, ...[...groups].map(([bus, groupKeys]) =>
      h('div', { class: 'cs-picker-group' },
        h('div', { class: 'cs-picker-group-label' }, bus),
        ...groupKeys.map(key => {
          const info = available.get(key)!;
          return h('label', { class: 'cs-check' },
            h('input', {
              type: 'checkbox',
              checked: selected.has(key),
              onchange: () => messages.toggleMessage(key),
            }),
            h('span', { class: 'cs-picker-id' }, info.displayLabel),
            info.isTx ? h('span', { class: 'cs-muted' }, 'TX') : null,
          );
        }),
      ),
    ));
  }

  // Re-render when the selection changes or new IDs appear, not on every batch.
  const dispose = effect(() => {
    session.ticks.frameUpdate.value;
    const selection = messages.selectedMessageKeys.value;
    if (messages.getAvailableMessages().size === shownCount && selection === shownSelection) return;
    render();
  });

  return dispose;
}
