import { h, ransom } from './dom';
import { href } from '../router';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

/** What is planned. Plain promises of direction, no dates. */
const FEATURES: readonly Feature[] = [
  {
    icon: '🤝',
    title: 'Amigos',
    text: 'Adicionar amigos por um link ou código e acompanhar os discos que eles estão tirando.',
  },
  {
    icon: '🗂️',
    title: 'Coleção dos amigos',
    text: 'Abrir a galeria de um amigo, ver quantos discos vocês têm em comum e o que falta para cada um.',
  },
  {
    icon: '🎸',
    title: 'Novas figurinhas',
    text: 'Outras cartas colecionáveis além dos discos: membros de banda, singles e artefatos da história da música.',
  },
  {
    icon: '⭐',
    title: 'Notas e comentários',
    text: 'Dar nota aos discos que você tirou, comentar e ver o que os outros acharam.',
  },
];

export function renderRoadmap(): HTMLElement {
  return h(
    'section',
    { class: 'view view--roadmap' },
    h('h1', { class: 'headline' }, ransom('EM BREVE')),
    h(
      'div',
      { class: 'clip clip--note roadmap__preview' },
      h('strong', {}, 'Isto é uma prévia. '),
      'O jogo já funciona, mas ainda está em construção: a sua coleção fica salva só neste navegador (limpar os dados ou trocar de aparelho começa do zero), os textos dos discos ainda estão sendo escritos e revisados, e o que você vê pode mudar.',
    ),
    h('h2', { class: 'roadmap__subtitle' }, 'O que vem por aí'),
    h(
      'ol',
      { class: 'roadmap' },
      ...FEATURES.map((f, i) =>
        h(
          'li',
          { class: 'roadmap__item clip', style: `--r:${i % 2 ? 1.1 : -1.2}deg` },
          h('span', { class: 'roadmap__icon', 'aria-hidden': 'true' }, f.icon),
          h('h3', { class: 'roadmap__title' }, f.title),
          h('p', {}, f.text),
          h('span', { class: 'roadmap__tag' }, 'Em breve'),
        ),
      ),
    ),
    h(
      'p',
      { class: 'roadmap__footer' },
      'Tem uma ideia? ',
      h(
        'a',
        { href: 'https://github.com/ltmleo/disk-discovery/issues', target: '_blank', rel: 'noopener' },
        'Sugira no GitHub',
      ),
      ' · ',
      h('a', { href: href.pack() }, 'Voltar a abrir pacotes'),
    ),
  );
}
