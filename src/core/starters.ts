import type {
  Project,
  Template,
  ComponentSet,
  Element,
  Asset,
  Field,
  Kind,
  ExportProfile,
  Row,
} from './model';
import { APP_VERSION, FORMAT_VERSION, uid, clone, hashString, documentState } from './model';
import { DEFAULT_STYLE } from './layout';
import { tuckbox, standee } from './physical';
export const standardFields: Field[] = [
  { key: 'name', type: 'text', required: true },
  { key: 'type', type: 'choice', options: ['Building', 'Landscape'] },
  { key: 'salt', type: 'number' },
  { key: 'reed', type: 'number' },
  { key: 'clay', type: 'number' },
  { key: 'effect', type: 'text' },
  { key: 'art', type: 'image' },
  { key: 'qty', type: 'number' },
  { key: 'tags', type: 'text' },
];
export function element(type: Element['type'], partial: Partial<Element> = {}): Element {
  return {
    id: uid('el'),
    name: type[0]!.toUpperCase() + type.slice(1),
    type,
    x: 5,
    y: 5,
    w: 40,
    h: 12,
    ...partial,
  };
}
export function makeTemplate(name: string, kind: Kind = 'card', width = 63, height = 88): Template {
  return {
    id: uid('tpl'),
    name,
    width,
    height,
    bleed: 3,
    safe: 3,
    background: '#faf7ef',
    shape: kind === 'token' ? 'ellipse' : kind === 'hex' ? 'hex' : 'rect',
    radius: kind === 'card' ? 3 : 0,
    elements: [],
  };
}
export function cardTemplate(): Template {
  const t = makeTemplate('Structure card');
  t.id = 'structure-front';
  t.elements = [
    element('rect', {
      id: 'frame',
      name: 'Inner frame',
      x: 3,
      y: 3,
      w: 57,
      h: 82,
      fill: 'none',
      stroke: '#d4ccb9',
      strokeWidth: 0.25,
      radius: 1.3,
      locked: true,
    }),
    element('text', {
      id: 'title',
      name: 'Card title',
      x: 5,
      y: 5,
      w: 51,
      h: 8,
      binding: 'name',
      styleId: 'title',
    }),
    element('image', {
      id: 'artwork',
      name: 'Artwork',
      x: 5,
      y: 16,
      w: 53,
      h: 30,
      binding: 'art',
      fit: 'cover',
      radius: 1,
    }),
    element('rect', {
      id: 'type-band',
      name: 'Type band',
      x: 5,
      y: 49,
      w: 53,
      h: 7,
      fill: '#e5e9d9',
      radius: 0.7,
      styleWhen: {
        mode: 'all',
        conditions: [{ field: 'type', op: 'eq', value: 'Building' }],
        fill: '#e4dbc9',
      },
    }),
    element('text', {
      id: 'type',
      name: 'Component type',
      x: 7,
      y: 50,
      w: 48,
      h: 5,
      binding: 'type',
      styleId: 'label',
    }),
    element('text', {
      id: 'effect',
      name: 'Rules text',
      x: 6,
      y: 59,
      w: 51,
      h: 19,
      binding: 'effect',
      styleId: 'rules',
      minFontSize: 7,
    }),
    element('text', {
      id: 'identifier',
      name: 'Component number',
      x: 6,
      y: 81,
      w: 45,
      h: 3.5,
      text: '{{id}}  ·  ×{{qty}}',
      fontSize: 7,
      color: '#817d70',
    }),
    element('group', {
      id: 'costs',
      name: 'Cost bar',
      x: 5,
      y: 12,
      w: 53,
      h: 3.5,
      layout: 'horizontal',
      gap: 3,
      children: ['salt', 'reed', 'clay'].map((key) =>
        element('text', {
          id: `cost-${key}`,
          name: `${key} cost`,
          x: 0,
          y: 0,
          w: 10,
          h: 3.5,
          text: `[icon:${key}] {{${key}}}`,
          fontSize: 7,
          visibleWhen: { mode: 'all', conditions: [{ field: key, op: 'gt', value: 0 }] },
        }),
      ),
    }),
  ];
  return t;
}
export function svgAsset(name: string, color: string, variant = 0): Asset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 530 300"><rect width="530" height="300" fill="#ece6d8"/><path d="M0 200Q110 ${90 + variant * 7} 230 185T530 155V300H0Z" fill="${color}" opacity=".24"/><path d="M0 245Q120 160 260 225T530 195V300H0Z" fill="${color}" opacity=".3"/><circle cx="410" cy="65" r="29" fill="#cfb989" opacity=".7"/><g fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"><path d="M170 228V113L260 54 350 113V230M170 115H350M230 230V157H288V230M190 135H212V160H190Z M310 135H333V160H310Z"/><path d="M115 249V170M115 209L96 183M115 221L138 187M396 242V160M396 194L380 170M396 220L420 183"/><path d="M40 269Q100 259 163 270M315 268Q390 255 468 268" stroke-width="2"/></g></svg>`;
  return {
    id: `art-${variant}`,
    name,
    mime: 'image/svg+xml',
    data: `data:image/svg+xml;base64,${btoa(svg)}`,
    hash: hashString(svg),
    license: 'CC0-1.0',
    width: 530,
    height: 300,
  };
}
export function defaultProfile(): ExportProfile {
  return {
    id: uid('profile'),
    name: 'Home prototype · A4',
    destination: 'home',
    paper: 'A4',
    width: 210,
    height: 297,
    margin: 8,
    gap: 2,
    duplex: 'long',
    offsetX: 0,
    offsetY: 0,
    cropMarks: true,
    bleed: false,
    dpi: 300,
    changedOnly: false,
    setIds: [],
  };
}
export function emptyProject(name = 'Untitled game'): Project {
  const now = new Date().toISOString();
  return {
    formatVersion: FORMAT_VERSION,
    appVersion: APP_VERSION,
    id: uid('project'),
    name,
    description: 'A new tabletop idea.',
    createdAt: now,
    updatedAt: now,
    sets: [],
    templates: [],
    assets: [],
    blocks: [],
    styles: {
      title: { ...DEFAULT_STYLE, font: 'Alegreya', fontSize: 14, bold: true },
      rules: { ...DEFAULT_STYLE, fontSize: 9 },
      label: { ...DEFAULT_STYLE, fontSize: 8, bold: true, color: '#565b49' },
    },
    symbols: [
      { id: 'salt', name: 'Salt', path: 'M12 2L22 12 12 22 2 12Z', color: '#a28c63' },
      {
        id: 'reed',
        name: 'Reed',
        path: 'M10 2H14V22H10ZM2 5L10 12V16L2 9ZM22 5V9L14 16V12Z',
        color: '#5f8053',
      },
      { id: 'clay', name: 'Clay', path: 'M3 3H21V21H3Z', color: '#ac6845' },
      {
        id: 'star',
        name: 'Star',
        path: 'M12 1L15 8 23 9 17 14 19 23 12 18 5 23 7 14 1 9 9 8Z',
        color: '#b4954b',
      },
    ],
    terms: [
      {
        id: 'harvest',
        name: 'Harvest',
        definition: 'Gain the resources shown on your occupied buildings.',
        translations: {},
      },
    ],
    variables: { startingHand: 5 },
    notes: [],
    table: { id: uid('table'), name: 'Standard setup', seed: 42, objects: [], deck: [], dice: [1] },
    setups: [],
    profiles: [defaultProfile()],
    rulebook: [],
    locales: ['en'],
    baseLocale: 'en',
    translations: {},
    packages: [],
    tasks: [],
    snapshots: [],
  };
}
export function addComponentSet(
  p: Project,
  name: string,
  kind: Kind,
  width: number,
  height: number,
): ComponentSet {
  const t =
    kind === 'box'
      ? tuckbox(width, height, Math.min(25, width / 4))
      : kind === 'standee'
        ? standee(width, height)
        : makeTemplate(`${name} template`, kind, width, height);
  if (!['box', 'standee'].includes(kind))
    t.elements = [
      element('text', {
        name: 'Name',
        x: Math.min(5, width * 0.1),
        y: Math.min(5, height * 0.1),
        w: width * 0.8,
        h: Math.min(12, height * 0.4),
        binding: 'name',
        styleId: 'title',
        fontSize: Math.min(14, height),
      }),
    ];
  const set: ComponentSet = {
    id: uid('set'),
    name,
    kind,
    templateId: t.id,
    fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'effect', type: 'text' },
      { key: 'qty', type: 'number' },
    ],
    rows: [{ id: uid('row'), name: 'First component', effect: '', qty: 1 }],
    overrides: {},
  };
  p.templates.push(t);
  p.sets.push(set);
  return set;
}
export const starters = [
  {
    id: 'saltmarsh',
    name: 'Saltmarsh',
    description: 'A small engine builder, from cards to a shared board.',
    kind: 'Complete game',
    color: '#6f8776',
    tag: 'Cards · board · tokens',
  },
  {
    id: 'orchard',
    name: 'Orchard Market',
    description: 'An approachable card layout with paired backs.',
    kind: 'Card starter',
    color: '#b78658',
    tag: 'Cards · shared styles',
  },
  {
    id: 'terrain',
    name: 'Wanderlands',
    description: 'Build a landscape with generated hex tiles.',
    kind: 'Tile starter',
    color: '#7a957c',
    tag: 'Hex tiles · generators',
  },
  {
    id: 'actions',
    name: 'Little Machines',
    description: 'Variable actions and inline resource symbols.',
    kind: 'Advanced cards',
    color: '#8184a3',
    tag: 'Repeaters · nested data',
  },
  {
    id: 'tokens',
    name: 'Pocket Treasury',
    description: 'Resource tokens in a range of denominations.',
    kind: 'Token starter',
    color: '#b59b58',
    tag: 'Tokens · paired backs',
  },
  {
    id: 'expedition',
    name: 'Field Notes',
    description: 'A reusable player aid and exploration board.',
    kind: 'Board starter',
    color: '#648c9c',
    tag: 'Board · player aids',
  },
];
export function createStarter(starterId = 'saltmarsh'): Project {
  const meta = starters.find((s) => s.id === starterId);
  const p = emptyProject(meta?.name ?? 'Untitled game');
  p.description = meta?.description ?? '';
  if (starterId === 'saltmarsh' || starterId === 'orchard' || starterId === 'actions') {
    const front = cardTemplate();
    const back = makeTemplate('Structure back');
    back.id = 'structure-back';
    back.background = '#34483e';
    back.elements = [
      element('rect', {
        id: 'back-frame',
        name: 'Back frame',
        x: 4,
        y: 4,
        w: 55,
        h: 80,
        fill: 'none',
        stroke: '#bcc6ac',
        strokeWidth: 0.5,
        radius: 2,
      }),
      element('text', {
        id: 'back-title',
        name: 'Game title',
        x: 7,
        y: 35,
        w: 49,
        h: 18,
        text: p.name,
        font: 'Alegreya',
        fontSize: 19,
        bold: true,
        align: 'center',
        color: '#ebe7d4',
      }),
      element('symbol', {
        id: 'back-symbol',
        name: 'Emblem',
        x: 26,
        y: 21,
        w: 11,
        h: 11,
        symbolId: 'salt',
        fill: '#d5c79e',
      }),
    ];
    p.templates.push(front, back);
    const names =
      starterId === 'orchard'
        ? ['Apple Cart', 'Pear Orchard', 'Market Stall', 'Golden Basket', 'Cider Press', 'Old Mill']
        : [
            'Salt Farm',
            'Tidal Mill',
            'Reed Cutter',
            'Clay Pit',
            'Fishery',
            'Net House',
            'Drying Rack',
            'Reed Bed',
            'Salt Meadow',
            'Tide Gate',
            'Canal',
            'Watchtower',
          ];
    const effects = [
      'During [term:harvest], gain **2 salt** if this building is occupied.',
      'Once per round, convert 2 resources into 3 of another kind.',
      'Gain [icon:reed] for each adjacent Landscape.',
      'Place a worker here to gain **2 clay**.',
      'Gain 1 salt and draw a card.',
      'Store up to 3 resources between rounds.',
    ];
    p.assets = names.map((n, i) =>
      svgAsset(`${n.toLowerCase().replaceAll(' ', '-')}.svg`, ['#657b5d', '#7d6a50', '#6b8390'][i % 3]!, i),
    );
    const rows: Row[] = names.map((name, i) => ({
      id: `STR-${String(i + 1).padStart(2, '0')}`,
      name,
      type: i % 3 ? 'Building' : 'Landscape',
      salt: (i + 1) % 3,
      reed: i % 2,
      clay: i % 3,
      effect: effects[i % effects.length]!,
      art: `art-${i}`,
      qty: i % 3 === 0 ? 4 : 3,
      tags: i % 2 ? 'engine' : 'resource',
    }));
    const set: ComponentSet = {
      id: 'structures',
      name: starterId === 'orchard' ? 'Market cards' : 'Structure cards',
      kind: 'card',
      templateId: front.id,
      backTemplateId: back.id,
      fields: clone(standardFields),
      rows,
      overrides: {},
    };
    p.sets.push(set);
    if (starterId === 'actions') {
      set.fields.push({ key: 'actions', type: 'list' });
      set.rows.forEach((r, i) => {
        r.actions = Array.from({ length: (i % 3) + 1 }, (_, j) => ({
          id: `${r.id}-action-${j}`,
          title: ['Gather', 'Convert', 'Build'][j]!,
          cost: j + 1,
        }));
      });
      front.elements = front.elements.filter((e) => e.id !== 'effect');
      p.blocks.push({
        id: 'action-block',
        name: 'Compact action',
        elements: [
          element('text', {
            id: 'action-line',
            name: 'Action',
            x: 0,
            y: 0,
            w: 48,
            h: 5,
            text: '**{{title}}** · [icon:clay] {{cost}}',
            fontSize: 9,
          }),
        ],
      });
      front.elements.push(
        element('repeater', {
          id: 'actions',
          name: 'Actions',
          x: 6,
          y: 59,
          w: 51,
          h: 20,
          binding: 'actions',
          layout: 'vertical',
          gap: 1,
          blockId: 'action-block',
        }),
      );
    }
    if (starterId === 'saltmarsh') {
      const board = addComponentSet(p, 'Marsh board', 'board', 297, 210);
      board.rows[0]!.name = 'Saltmarsh';
      const bt = p.templates.find((t) => t.id === board.templateId)!;
      bt.background = '#e6e2d4';
      bt.elements.push(
        element('grid', {
          id: 'marsh-grid',
          name: 'Terrain spaces',
          x: 12,
          y: 28,
          w: 182,
          h: 152,
          columns: 7,
          rows: 6,
          cellShape: 'hex',
          stroke: '#a7ad92',
          strokeWidth: 0.4,
          fill: '#d2dac1',
        }),
        element('text', {
          name: 'Round sequence',
          x: 205,
          y: 32,
          w: 77,
          h: 55,
          text: '**Each round**\n1. Advance the tide\n2. Draft from the market\n3. Place your workers\n4. [term:harvest]\n5. Prepare the next round',
          fontSize: 15,
        }),
        element('grid', {
          name: 'Tide track',
          x: 205,
          y: 104,
          w: 76,
          h: 55,
          columns: 3,
          rows: 4,
          stroke: '#849d9e',
          strokeWidth: 0.5,
          fill: '#c8d8d4',
        }),
      );
      const tokens = addComponentSet(p, 'Resource tokens', 'token', 20, 20);
      tokens.rows = ['Salt', 'Reed', 'Clay'].map((name, i) => ({
        id: `token-${i}`,
        name,
        qty: 20,
        symbol: name.toLowerCase(),
      }));
      const tt = p.templates.find((t) => t.id === tokens.templateId)!;
      tt.background = '#e8dfc6';
      tt.elements = [
        element('symbol', { name: 'Resource', x: 5, y: 3, w: 10, h: 10, binding: 'symbol' }),
        element('text', {
          name: 'Label',
          x: 2,
          y: 14,
          w: 16,
          h: 4,
          binding: 'name',
          fontSize: 7,
          align: 'center',
        }),
      ];
    }
  } else if (starterId === 'terrain') {
    const set = addComponentSet(p, 'Terrain tiles', 'hex', 50, 44);
    set.fields = [
      { key: 'name', type: 'text' },
      { key: 'terrain', type: 'choice', options: ['Forest', 'River', 'Mountain'] },
      { key: 'level', type: 'number' },
      { key: 'qty', type: 'number' },
    ];
    set.generator = {
      dimensions: [
        { field: 'terrain', values: ['Forest', 'River', 'Mountain'] },
        { field: 'level', values: [1, 2, 3] },
      ],
      exclusions: [],
      seed: 42,
    };
    set.rows = ['Forest', 'River', 'Mountain'].flatMap((terrain, i) =>
      [1, 2, 3].map((level) => ({ id: `hex-${i}-${level}`, name: terrain, terrain, level, qty: 3 })),
    );
    const t = p.templates.find((t) => t.id === set.templateId)!;
    t.background = '#d6dfc5';
    t.elements = [
      element('symbol', {
        name: 'Terrain mark',
        x: 18,
        y: 8,
        w: 14,
        h: 14,
        symbolId: 'star',
        fill: '#6d8058',
      }),
      element('text', {
        name: 'Terrain',
        x: 5,
        y: 25,
        w: 40,
        h: 10,
        text: '**{{terrain}}**\nLevel {{level}}',
        align: 'center',
        fontSize: 10,
      }),
    ];
  } else if (starterId === 'tokens') {
    const set = addComponentSet(p, 'Coins', 'token', 25, 25);
    set.rows = [1, 2, 5, 10].map((value) => ({ id: `coin-${value}`, name: String(value), value, qty: 12 }));
    const t = p.templates.find((t) => t.id === set.templateId)!;
    t.background = '#e8d59b';
    t.elements = [
      element('ellipse', {
        name: 'Coin border',
        x: 2,
        y: 2,
        w: 21,
        h: 21,
        fill: 'none',
        stroke: '#9e803a',
        strokeWidth: 0.4,
      }),
      element('text', {
        name: 'Value',
        x: 4,
        y: 6,
        w: 17,
        h: 14,
        binding: 'name',
        font: 'Alegreya',
        fontSize: 25,
        bold: true,
        align: 'center',
        color: '#79612d',
      }),
    ];
    const back = clone(t);
    back.id = uid('tpl');
    back.name = 'Coin back';
    back.elements = back.elements.filter((e) => e.type === 'ellipse');
    back.elements.push(element('symbol', { name: 'Mint mark', x: 7, y: 7, w: 11, h: 11, symbolId: 'star' }));
    p.templates.push(back);
    set.backTemplateId = back.id;
  } else if (starterId === 'expedition') {
    const board = addComponentSet(p, 'Expedition map', 'board', 280, 200);
    const t = p.templates.find((t) => t.id === board.templateId)!;
    t.elements.push(
      element('grid', {
        name: 'Map grid',
        x: 10,
        y: 24,
        w: 260,
        h: 160,
        columns: 13,
        rows: 8,
        stroke: '#819b91',
        strokeWidth: 0.35,
        fill: '#e1e9d8',
      }),
    );
    const aid = addComponentSet(p, 'Field guide', 'aid', 140, 100);
    aid.rows[0] = {
      id: 'guide',
      name: 'Your expedition',
      effect:
        '**On your turn**\nMove up to 2 spaces.\nExplore your current location.\nRecord a discovery to gain 1 point.\n\nFirst to 10 points wins.',
      qty: 4,
    };
    p.templates
      .find((t) => t.id === aid.templateId)!
      .elements.push(
        element('text', {
          name: 'Instructions',
          x: 8,
          y: 26,
          w: 124,
          h: 63,
          binding: 'effect',
          fontSize: 14,
        }),
      );
  }
  p.rulebook = [
    {
      id: uid('section'),
      title: 'Welcome to ' + p.name,
      text: 'A working prototype to make your own. Edit the components, print a set, and try a first session. Record what you learn in Test.',
      componentIds: p.sets.flatMap((s) => s.rows.slice(0, 1).map((r) => r.id)),
    },
    {
      id: uid('section'),
      title: 'Setup and play',
      text:
        starterId === 'saltmarsh'
          ? 'Give each player 3 salt, 2 reed and 1 clay. Reveal five Structure cards. Take turns drafting a card and placing a worker. At the end of each round, [term:harvest]. After six rounds, each Building is worth 1 point. Most points wins.'
          : 'Agree on an initial setup and a win condition. Use the editable content as a starting point for your game.',
      componentIds: [],
    },
  ];
  p.tasks = ['starter'];
  p.snapshots.push({
    id: uid('snapshot'),
    name: 'Starting point',
    createdAt: new Date().toISOString(),
    kind: 'snapshot',
    data: documentState(p),
  });
  return p;
}
