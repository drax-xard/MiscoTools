export const manifest = {
  format: 'dilstout.plugin',
  id: 'example-hooks',
  name: 'Example Hooks',
  version: '0.1.0',
  apiVersion: 1,
  entry: 'index.js',
  description: 'Demonstrates a custom slot, a category, a Markdown exporter, and a UI panel.',
  author: 'Dilstout',
  license: 'Same as the repository',
  capabilities: ['slot', 'category', 'exporter', 'uiPanel'],
};

function consonants(lap) {
  return lap.phonology.inventory.filter((phoneme) => phoneme.type === 'consonant').map((phoneme) => phoneme.symbol);
}

function vowels(lap) {
  return lap.phonology.inventory.filter((phoneme) => phoneme.type === 'vowel').map((phoneme) => phoneme.symbol);
}

export function register({ registry }) {
  registry.slotResolvers.register(
    'syllable',
    {
      available: (lap) => consonants(lap).length > 0 && vowels(lap).length > 0,
      resolve: ({ lap, rng }) => {
        const shape = rng.pick(['CV', 'CVC', 'VC', 'CVV']);
        const vowelSymbols = vowels(lap);
        const consonantSymbols = consonants(lap);
        const value = [...shape]
          .map((type) => (type === 'C' ? rng.pick(consonantSymbols) : rng.pick(vowelSymbols)))
          .join('');
        return { value };
      },
    },
    { label: 'Syllable' },
  );

  registry.categories.register(
    'syllable-chant',
    {
      id: 'syllable-chant',
      label: 'Syllable chant',
      description: 'Plugin demo: names built only from the blended phoneme inventories.',
      pools: () => [
        {
          id: 'chant',
          templates: ['{syllable}{syllable}', '{syllable}{syllable}{syllable}', '{syllable}-{syllable}'],
        },
      ],
    },
    { label: 'Syllable chant', description: 'Plugin demo category.' },
  );

  registry.exporters.register(
    'markdown-table',
    {
      id: 'markdown-table',
      label: 'Markdown',
      export: (results) => {
        const seed = results[0]?.seed ?? 'dilstout';
        const lines = [
          '| Name | Category | Pool |',
          '| --- | --- | --- |',
          ...results.map((result) => `| ${result.name} | ${result.category} | ${result.pool} |`),
        ];
        return {
          filename: `${seed}.md`,
          mime: 'text/markdown',
          text: `${lines.join('\n')}\n`,
        };
      },
    },
    { label: 'Markdown' },
  );

  registry.uiPanels.register(
    'example-hooks.panel',
    {
      id: 'example-hooks.panel',
      label: 'Example Hooks',
      mount(root, { app, notify }) {
        const document = root.ownerDocument;
        const copy = document.createElement('p');
        copy.textContent =
          'This panel is registered by a plugin. The plugin also adds a syllable slot, a Syllable chant category, and a Markdown exporter.';
        const capabilities = document.createElement('div');
        capabilities.className = 'plugin-capabilities';
        for (const capability of manifest.capabilities) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = capability;
          capabilities.append(chip);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button subtle';
        button.textContent = 'Select Syllable chant';
        button.addEventListener('click', () => {
          app.state.category = 'syllable-chant';
          app.refresh();
          app.setTab('workspace');
          notify('Syllable chant selected. Press Generate.');
        });
        root.append(copy, capabilities, button);
      },
      unmount(root) {
        root.replaceChildren();
      },
    },
    { label: 'Example Hooks' },
  );
}
