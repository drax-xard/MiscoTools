import { registry } from '../core/registry.js';
import { HOST_API_VERSION } from '../core/plugin-host.js';
import { $, clear, el, readTextFile } from './dom.js';

export function createPluginsView(app) {
  const list = $('#plugin-list');
  const panelHost = $('#plugin-panels');
  const fileInput = $('#plugin-file');
  const reloadButton = $('#reload-plugins');
  const apiBadge = $('#plugin-api-version');
  let mountedPanels = [];

  function renderList() {
    clear(list);
    const plugins = app.plugins.list();
    if (plugins.length === 0) {
      list.append(
        el('p', {
          class: 'empty-note',
          text: 'No plugins loaded. The bundled example is loaded at startup; use the button above to load a local .js plugin.',
        }),
      );
      return;
    }
    for (const entry of plugins) {
      list.append(
        el(
          'article',
          { class: 'plugin-card' },
          el(
            'div',
            { class: 'plugin-head' },
            el(
              'div',
              {},
              el('h3', { text: entry.manifest.name }),
              el('p', {
                class: 'field-note',
                text: `${entry.manifest.id} v${entry.manifest.version} · ${entry.source}`,
              }),
            ),
            el('button', {
              class: 'button danger-ghost',
              type: 'button',
              text: 'Unload',
              onclick: () => {
                try {
                  app.plugins.unload(entry.id);
                  app.refreshPlugins();
                  app.notify(`Unloaded ${entry.manifest.name}.`);
                } catch (error) {
                  app.notify(error.message, 'error');
                }
              },
            }),
          ),
          entry.manifest.description ? el('p', { class: 'field-note', text: entry.manifest.description }) : null,
          el(
            'div',
            { class: 'plugin-capabilities' },
            ...entry.manifest.capabilities.map((capability) => el('span', { class: 'chip', text: capability })),
          ),
        ),
      );
    }
  }

  function renderPanels() {
    for (const entry of mountedPanels) {
      try {
        entry.panel.unmount?.(entry.root);
      } catch {
        mountedPanels = mountedPanels.filter((item) => item !== entry);
      }
    }
    mountedPanels = [];
    clear(panelHost);

    const panels = registry.uiPanels.list();
    if (panels.length === 0) {
      panelHost.append(el('p', { class: 'empty-note', text: 'No plugin panels registered.' }));
      return;
    }

    for (const meta of panels) {
      const panel = registry.uiPanels.get(meta.id);
      const root = el('div', { class: 'plugin-panel-body' });
      const card = el(
        'article',
        { class: 'plugin-panel' },
        el('h3', { text: meta.label ?? panel.label ?? meta.id }),
        root,
      );
      panelHost.append(card);
      try {
        panel.mount(root, { app, notify: app.notify, host: app.plugins });
        mountedPanels.push({ panel, root });
      } catch (error) {
        root.append(el('p', { class: 'invalid-message', text: `Panel failed to mount: ${error.message}` }));
      }
    }
  }

  function render() {
    apiBadge.textContent = `Plugin API v${HOST_API_VERSION}`;
    renderList();
    renderPanels();
  }

  function mount() {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const source = await readTextFile(file);
        if (source.length === 0) throw new Error('The selected plugin file is empty');
        const confirmed = window.confirm(
          `Plugins run as trusted code with full access to this page.\n\nLoad “${file.name}”?`,
        );
        if (!confirmed) return;
        await app.plugins.loadFromFile(file);
        app.refreshPlugins();
        app.notify(`Loaded plugin ${file.name}.`);
      } catch (error) {
        app.notify(error.message, 'error');
      } finally {
        fileInput.value = '';
      }
    });

    reloadButton.addEventListener('click', async () => {
      try {
        const errors = await app.plugins.loadBundled('plugins/index.json');
        app.refreshPlugins();
        if (errors.length > 0) {
          app.notify(`Some bundled plugins failed: ${errors.join('; ')}`, 'warning');
        } else {
          app.notify('Bundled plugins are loaded.');
        }
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });
  }

  return { mount, render };
}
