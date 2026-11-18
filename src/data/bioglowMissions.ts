import { Mission } from '../types/fll';

export const BIOGLOW_OFFICIAL_MISSIONS: Mission[] = [
  {
    id: 'm_m01',
    code: 'M01',
    name: 'Levantamento com Drone',
    description:
      'O drone não está mais tocando o tapete (20 pts). Bônus: mapa LiDAR completamente invertido com a peça vermelha/marcador de varredura pelo menos parcialmente dentro da área de levantamento (+10 pts). Restrição de equipamento.',
    visualGuide:
      'Local: parte inferior central do tapete, à esquerda da área de lançamento direita. Peças: drone preto/azul sobre trilho inclinado + placa verde/preta (Mapa LiDAR) + marcador vermelho (Scanner). Pontuação exata: 0 pts se drone encosta no tapete; 20 pts se drone levantado fora do tapete mas marcador vermelho fora da caixinha/mapa não invertido; 30 pts apenas se drone fora do tapete E mapa LiDAR invertido com marcador vermelho dentro da caixinha.',
    validScores: [0, 20, 30],
    maxScore: 30,
    partialScore: 20,
    criteria: [
      { id: 'c1', description: 'O drone não está mais tocando o tapete', points: 20 },
      {
        id: 'c2',
        description:
          'Bônus: mapa LiDAR completamente invertido com marcador de varredura (peça vermelha) pelo menos parcialmente dentro da área de levantamento',
        points: 10,
      },
    ],
    zone: 'Centro Inferior',
    estimatedDurationSeconds: 15,
  },
  {
    id: 'm_m02',
    code: 'M02',
    name: 'Sementes Explosivas',
    description: 'Sementes que já não tocam o pendúnculo: 10 pts cada (máx 3 sementes = 30 pts).',
    visualGuide:
      'Local: centro-esquerda do tapete. Peças: haste verde curva (pendúnculo) com 3 vagens/sementes redondas marrons/laranjas suspensas. Conte quantas sementes caíram/soltaram e NÃO tocam mais o pendúnculo verde: 0 soltas = 0 pts, 1 solta = 10 pts, 2 soltas = 20 pts, 3 soltas = 30 pts.',
    validScores: [0, 10, 20, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [{ id: 'c1', description: 'Sementes que já não tocam o pendúnculo (10 cada)', points: 10 }],
    zone: 'Centro-Esquerda',
    estimatedDurationSeconds: 12,
  },
  {
    id: 'm_m03',
    code: 'M03',
    name: 'Vire a Rocha',
    description:
      'A bandeira da pesquisa foi baixada (20 pts). Bônus: e a pedra foi devolvida à sua posição inicial original (+10 pts adicionais).',
    visualGuide:
      'Local: borda esquerda média. Peças: bloco/rocha cinza e verde articulado com bandeira vermelha/branca lateral. Estado inicial: rocha fechada e bandeira levantada. Para pontuar: bandeira visivelmente abaixada (20 pts); se virou a pedra e devolveu fechada na posição original com bandeira baixa (30 pts).',
    validScores: [0, 20, 30],
    maxScore: 30,
    partialScore: 20,
    criteria: [
      { id: 'c1', description: 'A bandeira da pesquisa foi baixada', points: 20 },
      { id: 'c2', description: 'Bônus: a pedra foi devolvida à sua posição inicial original', points: 10 },
    ],
    zone: 'Lado Esquerdo',
    estimatedDurationSeconds: 18,
  },
  {
    id: 'm_m04',
    code: 'M04',
    name: 'Folhas da Sorte',
    description:
      'Uma folha completamente removida sem tocar o ninho (10 pts). Bônus: segunda folha removida sem tocar o ninho com grilo-esperança na posição inicial (+20 pts). Se o grilo-esperança sair do habitat ao final da partida = 0 pts. Restrição de equipamento.',
    visualGuide:
      'Local: canto superior esquerdo. Peças: ninho verde com 3 anéis marrons (folhas) e grilo-esperança verde no topo. Se o grilo verde cair/sair do habitat ao final: 0 pts! 1 folha removida sem tocar ninho (grilo no habitat) = 10 pts; 2 folhas removidas + grilo intocado na posição inicial = 30 pts.',
    validScores: [0, 10, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Uma folha é completamente removida sem tocar o ninho', points: 10 },
      { id: 'c2', description: 'Bônus: segunda folha completamente removida sem tocar o ninho com grilo na posição', points: 20 },
    ],
    zone: 'Topo Esquerda',
    estimatedDurationSeconds: 20,
  },
  {
    id: 'm_m05',
    code: 'M05',
    name: 'Raízes que se estendem',
    description:
      'A raiz da planta está parcialmente estendida (10 pts) OU completamente estendida (20 pts). Restrição de equipamento.',
    visualGuide:
      'Local: topo esquerdo (à direita da M04). Peças: tronco vertical marrom com alavanca/raiz verde e marrom que desliza para fora até a borda. Recolhida = 0 pts; estendida parcialmente = 10 pts; totalmente estendida = 20 pts.',
    validScores: [0, 10, 20],
    maxScore: 20,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'A raiz da planta está parcialmente estendida', points: 10 },
      { id: 'c2', description: 'A raiz da planta está completamente estendida', points: 20 },
    ],
    zone: 'Topo Esquerda',
    estimatedDurationSeconds: 15,
  },
  {
    id: 'm_m06',
    code: 'M06',
    name: 'Correria das Formigas Cortadeiras',
    description:
      'A formiga está tocando o ninho e os fragmentos de folha estão contidos dentro do ninho: 10 pts cada fragmento (máx 30 pts).',
    visualGuide:
      'Local: topo direita-centro. Peças: ninho bege com braço branco Technic, formiga preta/vermelha e fragmentos de folha amarelo/verde. Pontua 10 pts por cada fragmento dentro do ninho SOMENTE se a formiga estiver tocando o ninho.',
    validScores: [0, 10, 20, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [{ id: 'c1', description: 'Fragmentos de folhas contidos dentro do ninho (10 cada)', points: 10 }],
    zone: 'Topo Direita',
    estimatedDurationSeconds: 16,
  },
  {
    id: 'm_m07',
    code: 'M07',
    name: 'Fungo Gigante',
    description:
      'O micélio está completamente estendido (20 pts). Bônus: conexão com raiz da equipe adversária (+10 pts adicionais; em treinos/remoto não há bônus). Restrição de equipamento.',
    visualGuide:
      'Local: topo direita (ao lado da M06). Peças: estrutura branca de micélio articulada com engrenagem/trilho. Completamente estendido = 20 pts (+10 apenas em partida com mesa adversária).',
    validScores: [0, 20, 30],
    maxScore: 30,
    partialScore: 20,
    criteria: [
      { id: 'c1', description: 'O micélio está completamente estendido', points: 20 },
      { id: 'c2', description: 'Bônus de conexão com mesa adversária', points: 10 },
    ],
    zone: 'Topo Direita',
    estimatedDurationSeconds: 15,
  },
  {
    id: 'm_m08',
    code: 'M08',
    name: 'Emaranhado',
    description: 'A trepadeira está desenrolada e tocando o tapete (30 pts).',
    visualGuide:
      'Local: topo centro (na base/tronco da grande árvore junto à M09). Peças: trepadeira verde articulada presa na lateral da árvore. Estado inicial: recolhida/levantada fora do tapete. Pontua 30 pts SOMENTE quando a trepadeira verde baixar e encostar no tapete.',
    validScores: [0, 30],
    maxScore: 30,
    partialScore: 0,
    criteria: [{ id: 'c1', description: 'A trepadeira está desenrolada e tocando o tapete', points: 30 }],
    zone: 'Centro Superior',
    estimatedDurationSeconds: 18,
  },
  {
    id: 'm_m09',
    code: 'M09',
    name: 'Plataforma de pesquisa',
    description:
      'A plataforma está elevada (10 pts). A armadilha fotográfica está instalada (10 pts). A semente não está mais tocando a árvore (10 pts). Restrição de equipamento.',
    visualGuide:
      'Local: topo centro (grande árvore alta com plataforma bege). 3 itens independentes de 10 pts cada: (1) plataforma bege elevada horizontalmente no topo, (2) armadilha fotográfica instalada, (3) semente marrom/vermelha solta sem tocar a árvore.',
    validScores: [0, 10, 20, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Plataforma de pesquisa elevada', points: 10 },
      { id: 'c2', description: 'Armadilha fotográfica instalada', points: 10 },
      { id: 'c3', description: 'Semente não está tocando a árvore', points: 10 },
    ],
    zone: 'Centro Superior',
    estimatedDurationSeconds: 22,
  },
  {
    id: 'm_m10',
    code: 'M10',
    name: 'Micro-habitats sensíveis',
    description:
      'O habitat da aranha está em sua posição inicial original (10 pts). O habitat do caramujo está em sua posição inicial original (10 pts). Restrição de equipamento.',
    visualGuide:
      'Local: 2 pontos no centro do tapete (moldura branca com aranha preta; base marrom/cinza com caramujo). ATENÇÃO: Esta missão já começa montada no estado de pontuação (é uma missão de NÃO DERRUBAR). NÃO marque M10 em vídeos curtos a menos que o usuário informe ou o robô passe exatamente por ela.',
    validScores: [0, 10, 20],
    maxScore: 20,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Habitat da aranha na posição inicial', points: 10 },
      { id: 'c2', description: 'Habitat do caramujo na posição inicial', points: 10 },
    ],
    zone: 'Floresta Central',
    estimatedDurationSeconds: 10,
  },
  {
    id: 'm_m11',
    code: 'M11',
    name: 'Janela para o Passado',
    description: 'A cobertura da raiz está abaixada, tocando o tapete (20 pts).',
    visualGuide:
      'Local: centro-direita. Peças: modelo marrom/vermelho-escuro com tampa articulada lateral. Estado inicial: tampa levantada/fechada. Pontua 20 pts quando a tampa abaixar totalmente e tocar o tapete.',
    validScores: [0, 20],
    maxScore: 20,
    partialScore: 0,
    criteria: [{ id: 'c1', description: 'Cobertura da raiz abaixada tocando o tapete', points: 20 }],
    zone: 'Centro Direita',
    estimatedDurationSeconds: 14,
  },
  {
    id: 'm_m12',
    code: 'M12',
    name: 'Ancião da Floresta',
    description:
      'A bengala está totalmente erguida, tocando a árvore (20 pts). O suporte do tirante está em volta do poste (10 pts). Restrição de equipamento.',
    visualGuide:
      'Local: extremidade direita do tapete. Peças: árvore inclinada verde-clara/marrom com alavanca vermelha (bengala) e suporte/laço vermelho (tirante). Bengala totalmente erguida tocando a árvore = 20 pts; suporte do tirante encaixado em volta do poste = +10 pts.',
    validScores: [0, 10, 20, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Bengala totalmente erguida tocando a árvore', points: 20 },
      { id: 'c2', description: 'Suporte do tirante em volta do poste', points: 10 },
    ],
    zone: 'Direita',
    estimatedDurationSeconds: 20,
  },
  {
    id: 'm_m13',
    code: 'M13',
    name: 'Espécies-chave',
    description:
      'A espécie-chave da equipe está na plataforma de restauração e as árvores jovens são içadas (30 pts).',
    visualGuide:
      'Local: uma das 3 bases quadradas intercambiáveis (mina, cidade ou fazenda). Peças: plataforma preta/verde com árvores jovens que sobem quando a peça colorida de espécie-chave da equipe é encaixada.',
    validScores: [0, 30],
    maxScore: 30,
    partialScore: 0,
    criteria: [{ id: 'c1', description: 'Espécie-chave na plataforma e árvores jovens içadas', points: 30 }],
    zone: 'Base Intercambiável',
    estimatedDurationSeconds: 18,
  },
  {
    id: 'm_m14',
    code: 'M14',
    name: 'Sementes da Renovação',
    description:
      'As sementes estão contidas na estação de replantio: 5 pts cada. Bônus: e estão tocando o tapete (+5 pts adicionais cada). Máx 3 sementes = 30 pts.',
    visualGuide:
      'Local: uma das 3 bases intercambiáveis. Peças: caixa preta/marrom com grade ("Estação de Replantio") e 3 sementes soltas marrons/verdes. Dentro da caixa sem tocar tapete = 5 pts cada; dentro da caixa tocando o tapete = 10 pts cada.',
    validScores: [0, 5, 10, 15, 20, 25, 30],
    maxScore: 30,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Sementes contidas na estação de replantio (5 cada)', points: 15 },
      { id: 'c2', description: 'Bônus: tocando o tapete (+5 cada)', points: 15 },
    ],
    zone: 'Base Intercambiável',
    estimatedDurationSeconds: 15,
  },
  {
    id: 'm_m15',
    code: 'M15',
    name: 'Arquitetura Biocêntrica',
    description:
      'Cobertura elevada (10 pts). Claraboia instalada (10 pts). Escotilha de compostagem aberta tocando o tapete (10 pts). Bônus Ambiental da plataforma (+10 pts, apenas 1 bônus). Restrição de equipamento.',
    visualGuide:
      'Local: uma das 3 bases intercambiáveis. Prédio colorido verde/amarelo/vermelho/azul: teto verde que levanta (10), claraboia azul/transparente colocada no topo (10), escotilha lateral aberta tocando tapete (10), mais +10 se atender à necessidade da plataforma (mina=cobertura, cidade=claraboia, fazenda=escotilha).',
    validScores: [0, 10, 20, 30, 40],
    maxScore: 40,
    partialScore: 10,
    criteria: [
      { id: 'c1', description: 'Cobertura elevada', points: 10 },
      { id: 'c2', description: 'Claraboia do jardim totalmente instalada', points: 10 },
      { id: 'c3', description: 'Escotilha de compostagem completamente aberta tocando o tapete', points: 10 },
      { id: 'c4', description: 'Bônus ambiental da plataforma correspondente', points: 10 },
    ],
    zone: 'Base Intercambiável',
    estimatedDurationSeconds: 25,
  },
];
