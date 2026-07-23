/**
 * ============================================================================
 *  BACKEND_SETUP.GS — Estrutura da Planilha + Helpers de CRUD compartilhados
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo é responsável por:
 *   1. Definir os NOMES das abas e os CABEÇALHOS de cada uma (SHEETS / HEADERS).
 *   2. A função setupSpreadsheet() — cria/corrige TUDO automaticamente.
 *   3. Funções genéricas de CRUD (Criar/Ler/Editar/Excluir) que TODOS os
 *      arquivos Backend_*.gs das próximas etapas vão usar. Isso garante que
 *      salvar/editar/excluir funcione igual em todos os módulos (o principal
 *      bug do sistema anterior era cada módulo fazer isso de um jeito).
 *
 *  COMO USAR (para quando formos criar os próximos Backend_*.gs):
 *   - Para SALVAR um registro novo:
 *       appendObjectRow_(SHEETS.obras, HEADERS.obras, { id: gerarId_('OBR'), nome: '...' });
 *   - Para EDITAR um registro existente (precisa ter coluna "id"):
 *       updateObjectRowById_(SHEETS.obras, HEADERS.obras, id, { nome: 'Novo nome' });
 *   - Para EXCLUIR um registro (precisa ter coluna "id"):
 *       deleteRowById_(SHEETS.obras, id);
 *   - Para LER todos os registros de uma aba como uma lista de objetos:
 *       sheetToObjects_(SHEETS.obras);
 * ============================================================================
 */


/* ============================================================================
 * 1. NOMES DAS ABAS
 * ========================================================================= */
const SHEETS = {
  usuarios:          'USUARIOS',
  obras:             'OBRAS',
  engenheiros:       'ENGENHEIROS',
  atas:              'ATAS_SEMANAIS',
  aditivos:          'ADITIVOS',
  medicoes:          'MEDICOES',
  cronograma:        'CRONOGRAMA',
  problemas:         'PROBLEMAS',
  rotina_atividades: 'ROTINA_ATIVIDADES',
  rotina_historico:  'ROTINA_HISTORICO',
  rotina_aderencia:  'ROTINA_ADERENCIA',
  dashboard:         'DASHBOARD_CACHE',
  config:            'CONFIG',
  logs:              'HISTORICO_LOGS'
};

/** Lista simples com todos os nomes de abas (usada para conferir o status). */
const SHEET_NOMES = Object.keys(SHEETS).map(function (chave) { return SHEETS[chave]; });


/* ============================================================================
 * 2. CABEÇALHOS DE CADA ABA
 * ----------------------------------------------------------------------------
 *  Sempre que precisar adicionar um campo novo em algum módulo (ex: um campo
 *  a mais no formulário de Obras), basta ACRESCENTAR o nome dele aqui na
 *  lista correspondente. Na próxima vez que setupSpreadsheet() rodar, a
 *  coluna nova é criada automaticamente no final da aba, SEM apagar nada
 *  que já existia.
 * ========================================================================= */
const HEADERS = {

  usuarios: [
    'id', 'usuario', 'senha_hash', 'nome_completo', 'perfil',
    'obra_vinculada', 'ativo', 'data_cadastro', 'ultimo_acesso'
  ],

  // "id" permite editar/excluir a obra sem depender do nome (bug corrigido).
  obras: [
    'id', 'timestamp', 'nome', 'endereco', 'engenheiro', 'email_eng',
    'data_inicio', 'data_prevista', 'status', 'avanco_percent',
    'valor_contrato', 'updated_at'
  ],

  engenheiros: [
    'id', 'nome_completo', 'email', 'telefone', 'crea',
    'obra_vinculada', 'obras_secundarias', 'ativo', 'data_cadastro', 'updated_at'
  ],

  atas: [
    'id', 'timestamp', 'numero_ata', 'obra', 'engenheiro', 'data_referencia',
    'avanco_previsto', 'avanco_realizado', 'desvio', 'motivo_desvio',
    'participantes', 'terceirizados', 'atividades', 'ocorrencias',
    'pendencias', 'previsao_prox', 'obs', 'planejamento_semanas', 'anexo_url',
    'updated_at'
  ],

  // Fluxo de aditivos: 1 registro por aditivo, com histórico de etapas em JSON
  // (histórico_status) contendo os valores de cada etapa (para o "reajuste de valor").
  aditivos: [
    'id', 'timestamp', 'obra', 'numero', 'descricao',
    'valor_original', 'valor_atual', 'status_atual', 'historico_status',
    'data_criacao', 'updated_at', 'obs'
  ],

  // As 3 fases da medição (Apresentada / Validada / Faturada) ficam lado a
  // lado na MESMA linha, permitindo preencher em momentos diferentes.
  medicoes: [
    'id', 'timestamp', 'obra', 'numero_bm', 'competencia',
    'valor_apresentado', 'data_apresentado',
    'valor_validado', 'data_validado',
    'valor_faturado', 'data_faturado',
    'status', 'obs', 'updated_at'
  ],

  cronograma: [
    'id', 'obra', 'mes', 'atividade', 'responsavel', 'peso_percentual',
    'status', 'semanas_previsto', 'semanas_realizado', 'obs',
    'data_criacao', 'updated_at'
  ],

  // "semana_referencia" é TEXTO puro (ex: "2026-W07"), nunca um objeto Date —
  // isso corrige o bug de a data mudar sozinha ao clicar no card.
  // "origem" e "ata_id" permitem que um problema relatado na Ata Semanal
  // apareça automaticamente no módulo de Problemas de Obra.
  problemas: [
    'id', 'timestamp', 'obra', 'semana_referencia', 'atividade', 'categoria',
    'descricao', 'impacto_dias', 'responsavel', 'acao_corretiva', 'status',
    'causou_atraso', 'origem', 'ata_id', 'updated_at'
  ],

  // Recorrência mais flexível:
  //  - frequencia: Diária | Semanal | Quinzenal | Mensal
  //  - dia_semana: usado quando frequencia = Semanal (ex: "Segunda-feira")
  //  - dia_mes_tipo: 'corrido' | 'util' | 'ultimo_util' (usado quando Mensal)
  //  - dia_mes_valor: número do dia (corrido ou útil), vazio se 'ultimo_util'
  rotina_atividades: [
    'id', 'titulo', 'descricao', 'frequencia',
    'dia_semana', 'dia_mes_tipo', 'dia_mes_valor',
    'categoria', 'ativo', 'data_criacao', 'updated_at'
  ],

  // "status" agora aceita: Feito | Pendente | N/A (antes era só um booleano).
  rotina_historico: [
    'id', 'timestamp', 'atividade_id', 'data', 'status', 'obs', 'usuario', 'updated_at'
  ],

  rotina_aderencia: [
    'atividade_id', 'titulo', 'frequencia', 'mes',
    'esperado', 'realizado', 'aderencia_pct', 'calculado_em'
  ],

  dashboard: [
    'obra', 'avanco_previsto', 'avanco_realizado', 'desvio_fisico',
    'atas_enviadas', 'ultima_atualizacao'
  ],

  // Guarda URLs de logotipos e outras configurações gerais do sistema.
  config: [
    'chave', 'valor', 'descricao', 'updated_at'
  ],

  logs: [
    'timestamp', 'tipo', 'sucesso', 'obra', 'usuario', 'resumo'
  ]
};


/* ============================================================================
 * 3. DADOS PADRÃO (SEED) — inseridos apenas na primeira execução
 * ========================================================================= */

/** Usuário administrador padrão. Login: admin / Senha: admin123 (troque depois). */
function usuarioAdminPadrao_() {
  return {
    id: gerarId_('USR'),
    usuario: 'admin',
    senha_hash: gerarHashSenha_('admin123'),
    nome_completo: 'Administrador PCO',
    perfil: 'pco',
    obra_vinculada: 'Todas',
    ativo: true,
    data_cadastro: new Date(),
    ultimo_acesso: ''
  };
}

/** As 14 atividades padrão de rotina do PCO (mesma lógica do sistema anterior,
 *  agora com o novo formato de recorrência exata). */
function atividadesRotinaPadrao_() {
  const agora = new Date();
  function item(titulo, descricao, frequencia, diaSemana, diaMesTipo, diaMesValor, categoria) {
    return {
      id: gerarId_('ROT'),
      titulo: titulo,
      descricao: descricao,
      frequencia: frequencia,
      dia_semana: diaSemana || '',
      dia_mes_tipo: diaMesTipo || '',
      dia_mes_valor: diaMesValor || '',
      categoria: categoria,
      ativo: true,
      data_criacao: agora,
      updated_at: agora
    };
  }
  return [
    item('Atualizar e monitorar o Dashboard PCO', 'Verificar KPIs, desvios e alertas', 'Diária', '', '', '', 'Dashboard'),
    item('Analisar Ranking de Envio de Atas', 'Verificar obras sem ata na semana', 'Diária', '', '', '', 'Atas'),
    item('Verificar desvios de medição', 'Confrontar cronograma com atas', 'Diária', '', '', '', 'Medição'),
    item('Verificar status dos aditivos por obra', 'Checar controle de aditivos', 'Diária', '', '', '', 'Aditivos'),
    item('Analisar e categorizar causas de atraso', 'Categorizar na planilha de causas', 'Diária', '', '', '', 'Análise'),
    item('Solicitar Medição Faturada ao Engenheiro', 'Enquanto não houver resposta', 'Diária', '', '', '', 'Faturamento'),
    item('Receber Ata de Reunião de Obra', 'Confirmar recebimento e qualidade', 'Semanal', 'Segunda-feira', '', '', 'Atas'),
    item('Atualizar avanço físico no cronograma', 'Identificar desvios', 'Semanal', 'Quinta-feira', '', '', 'Cronograma'),
    item('Consolidar Status Semanal', 'Relatório semanal de situação', 'Semanal', 'Sexta-feira', '', '', 'Relatório'),
    item('Receber Medição Faturada', 'Até o 5º dia corrido do mês', 'Mensal', '', 'corrido', 5, 'Faturamento'),
    item('Estruturar Relatório Executivo', 'Aproximadamente na 2ª semana', 'Mensal', '', 'util', 10, 'Relatório'),
    item('Encaminhar relação de serviços extras', 'Última semana do mês', 'Mensal', '', 'ultimo_util', '', 'Medição'),
    item('Consolidar Avanço Físico e Financeiro', 'Último dia útil do mês', 'Mensal', '', 'ultimo_util', '', 'Consolidação'),
    item('Realizar a reunião mensal', 'Último dia útil do mês', 'Mensal', '', 'ultimo_util', '', 'Reunião')
  ];
}

/** Configurações padrão (logotipos, nomes das empresas etc). */
function configPadrao_() {
  const agora = new Date();
  return [
    { chave: 'logo_empresa_1_url', valor: '', descricao: 'URL pública da logo da AG CONSTRUTORA (link direto de imagem)', updated_at: agora },
    { chave: 'logo_empresa_2_url', valor: '', descricao: 'URL pública da logo da ARCOS (link direto de imagem)', updated_at: agora },
    { chave: 'nome_empresa_1', valor: 'AG CONSTRUTORA', descricao: 'Nome exibido ao lado da logo 1', updated_at: agora },
    { chave: 'nome_empresa_2', valor: 'ARCOS', descricao: 'Nome exibido ao lado da logo 2', updated_at: agora },
    { chave: 'webapp_url', valor: '', descricao: 'URL do Web App publicado (preencher após implantar)', updated_at: agora }
  ];
}


/* ============================================================================
 * 4. FUNÇÃO PRINCIPAL DE SETUP — rode isso pelo menu "⚙️ Sistema PCO"
 * ========================================================================= */

/**
 * Verifica e cria TUDO que o sistema precisa na planilha:
 *  - Todas as 14 abas, com cabeçalhos corretos.
 *  - Colunas novas são adicionadas ao final sem apagar dados existentes.
 *  - Usuário admin (se ainda não existir nenhum usuário).
 *  - As 14 atividades de rotina padrão (se a aba estiver vazia).
 *  - Configurações padrão de logotipo (se a aba estiver vazia).
 *
 * PODE RODAR ESSA FUNÇÃO QUANTAS VEZES QUISER — ela nunca duplica dados,
 * apenas cria o que estiver faltando.
 */
function setupSpreadsheet() {
  const relatorio = construirOuVerificarPlanilhas_();

  const linhas = [
    '✅ Configuração concluída com sucesso!',
    '',
    'Abas verificadas no total: ' + relatorio.totalAbas,
    'Abas criadas agora: ' + (relatorio.criadas.length ? relatorio.criadas.join(', ') : '(nenhuma — já existiam)')
  ];
  if (relatorio.usuarioAdminCriado) {
    linhas.push('', '👤 Usuário administrador criado:', '   login: admin', '   senha: admin123', '   (recomendado trocar a senha depois)');
  }
  if (relatorio.rotinaSeed) {
    linhas.push('', '📋 14 atividades de rotina padrão foram inseridas.');
  }

  mostrarMensagem_(linhas.join('\n'));
}

/**
 * Mostra uma mensagem para quem rodou a função.
 *  - Se foi disparado a partir da PLANILHA (menu, botão desenhado nela) ->
 *    mostra um popup bonito (SpreadsheetApp.getUi().alert).
 *  - Se foi disparado de dentro do EDITOR do Apps Script (botão ▶️ Executar) ->
 *    SpreadsheetApp.getUi() não existe nesse contexto e dá o erro
 *    "Cannot call getUi() from this context". Por isso, nesse caso,
 *    escrevemos no Log de Execução em vez de quebrar
 *    (no editor: menu "Ver" > "Registros de execução", ou atalho Ctrl+Enter).
 */
function mostrarMensagem_(texto) {
  try {
    SpreadsheetApp.getUi().alert(texto);
  } catch (erroSemUi) {
    Logger.log(texto);
  }
}

/**
 * Mesma verificação de setupSpreadsheet(), mas sem exibir popup — usada
 * pela API (?acao=status_setup) e pelo item de menu "Ver status".
 */
function verificarStatusSetup_() {
  const faltando = SHEET_NOMES.filter(function (nome) { return !PLANILHA.getSheetByName(nome); });
  const existentes = SHEET_NOMES.filter(function (nome) { return !!PLANILHA.getSheetByName(nome); });

  return {
    success: true,
    msg: faltando.length === 0
      ? '✅ Todas as ' + SHEET_NOMES.length + ' abas estão configuradas corretamente.'
      : '⚠️ Faltam ' + faltando.length + ' aba(s): ' + faltando.join(', ') + '.\nRode "🚀 Configurar / Verificar Planilha" no menu ⚙️ Sistema PCO.',
    abas_ok: existentes,
    abas_faltando: faltando
  };
}

/** Lógica interna de criação/verificação (sem popup) — reaproveitada acima. */
function construirOuVerificarPlanilhas_() {
  const criadas = [];

  Object.keys(SHEETS).forEach(function (chave) {
    const nome = SHEETS[chave];
    const headers = HEADERS[chave];
    if (!headers) return; // segurança: nunca deve acontecer, mas evita quebrar

    const jaExistia = !!PLANILHA.getSheetByName(nome);
    getOrCreateSheet_(nome, headers);
    if (!jaExistia) criadas.push(nome);
  });

  let usuarioAdminCriado = false;
  let rotinaSeed = false;

  // Seed: usuário admin (somente se a aba de usuários estiver vazia)
  const abaUsuarios = PLANILHA.getSheetByName(SHEETS.usuarios);
  if (abaUsuarios.getLastRow() <= 1) {
    appendObjectRow_(SHEETS.usuarios, HEADERS.usuarios, usuarioAdminPadrao_());
    usuarioAdminCriado = true;
  }

  // Seed: 14 atividades de rotina padrão (somente se a aba estiver vazia)
  const abaRotina = PLANILHA.getSheetByName(SHEETS.rotina_atividades);
  if (abaRotina.getLastRow() <= 1) {
    atividadesRotinaPadrao_().forEach(function (item) {
      appendObjectRow_(SHEETS.rotina_atividades, HEADERS.rotina_atividades, item);
    });
    rotinaSeed = true;
  }

  // Seed: configurações padrão (logotipos etc.)
  const abaConfig = PLANILHA.getSheetByName(SHEETS.config);
  if (abaConfig.getLastRow() <= 1) {
    configPadrao_().forEach(function (item) {
      appendObjectRow_(SHEETS.config, HEADERS.config, item);
    });
  }

  SpreadsheetApp.flush();

  return {
    totalAbas: Object.keys(SHEETS).length,
    criadas: criadas,
    usuarioAdminCriado: usuarioAdminCriado,
    rotinaSeed: rotinaSeed
  };
}


/* ============================================================================
 * 5. HELPERS GENÉRICOS DE PLANILHA (usados por TODOS os Backend_*.gs)
 * ----------------------------------------------------------------------------
 *  Estas funções existem para que cada módulo novo (Obras, Aditivos, etc.)
 *  NÃO precise reinventar a lógica de salvar/editar/excluir do zero — reduz
 *  drasticamente a chance de bugs como "botão de salvar não funciona".
 * ========================================================================= */

/** Retorna a aba pelo nome; se não existir, cria com o cabeçalho informado. */
function getOrCreateSheet_(nomeAba, headersDesejados) {
  let aba = PLANILHA.getSheetByName(nomeAba);
  if (!aba) {
    aba = PLANILHA.insertSheet(nomeAba);
    escreverCabecalho_(aba, headersDesejados);
    return aba;
  }
  ensureHeaders_(aba, headersDesejados);
  return aba;
}

/** Escreve a primeira linha (cabeçalho) formatada em uma aba nova. */
function escreverCabecalho_(aba, headers) {
  const intervalo = aba.getRange(1, 1, 1, headers.length);
  intervalo.setValues([headers])
    .setFontWeight('bold')
    .setBackground('#001132')
    .setFontColor('#FFFFFF');
  aba.setFrozenRows(1);
  try { aba.autoResizeColumns(1, headers.length); } catch (e) { /* ignora se a aba estiver vazia demais */ }
}

/**
 * Garante que uma aba já existente tenha todas as colunas do HEADERS atual.
 * Se a aba estiver totalmente vazia, escreve o cabeçalho do zero.
 * Se já tiver dados, ACRESCENTA ao final as colunas que estiverem faltando
 * — nunca reordena nem apaga colunas existentes (protege os dados já salvos).
 */
function ensureHeaders_(aba, headersDesejados) {
  const ultimaColuna = Math.max(aba.getLastColumn(), 1);
  let headerAtual = [];

  if (aba.getLastRow() >= 1) {
    headerAtual = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0].map(String);
  }

  const abaVazia = headerAtual.length === 0 || headerAtual.every(function (h) { return h === ''; });
  if (abaVazia) {
    escreverCabecalho_(aba, headersDesejados);
    return;
  }

  const faltantes = headersDesejados.filter(function (h) { return headerAtual.indexOf(h) === -1; });
  if (faltantes.length > 0) {
    const colunaInicial = headerAtual.length + 1;
    aba.getRange(1, colunaInicial, 1, faltantes.length)
      .setValues([faltantes])
      .setFontWeight('bold')
      .setBackground('#001132')
      .setFontColor('#FFFFFF');
  }
}

/**
 * Lê uma aba inteira e devolve uma lista de objetos JS, um por linha,
 * usando o cabeçalho da própria planilha como nomes de campo.
 * Linhas totalmente vazias são ignoradas automaticamente.
 */
function sheetToObjects_(nomeAba) {
  const aba = PLANILHA.getSheetByName(nomeAba);
  if (!aba || aba.getLastRow() < 2) return [];

  const dados = aba.getDataRange().getValues();
  const headers = dados[0].map(String);

  return dados.slice(1)
    .filter(function (linha) { return linha.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (linha) {
      const obj = {};
      headers.forEach(function (h, i) {
        const valor = linha[i];
        obj[h] = (valor instanceof Date)
          ? Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss")
          : valor;
      });
      return obj;
    });
}

/**
 * Adiciona uma nova linha a uma aba a partir de um OBJETO (não de um array
 * posicional). Isso evita o bug clássico de "coluna trocada" quando alguém
 * reordena os cabeçalhos no futuro — o valor sempre vai para a coluna certa
 * pelo NOME do campo.
 * Campos do objeto que não existirem no cabeçalho são simplesmente ignorados.
 * Campos do cabeçalho que não vierem no objeto ficam em branco (nunca quebra).
 */
function appendObjectRow_(nomeAba, headersDesejados, objetoDados) {
  const aba = getOrCreateSheet_(nomeAba, headersDesejados);
  const headerAtual = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
  const linha = headerAtual.map(function (h) {
    return (objetoDados[h] !== undefined && objetoDados[h] !== null) ? objetoDados[h] : '';
  });
  aba.appendRow(linha);
  SpreadsheetApp.flush();
  return aba.getLastRow();
}

/**
 * Atualiza os campos informados de UM registro já existente, localizado
 * pela coluna "id". Só altera as colunas presentes em novosDados — o resto
 * da linha permanece intacto. Atualiza "updated_at" automaticamente, se a
 * aba tiver essa coluna.
 * Devolve o número da linha atualizada (1-based) ou -1 se o id não existir.
 */
function updateObjectRowById_(nomeAba, headersDesejados, id, novosDados) {
  const aba = getOrCreateSheet_(nomeAba, headersDesejados);
  const dados = aba.getDataRange().getValues();
  const headerAtual = dados[0].map(String);
  const idxId = headerAtual.indexOf('id');
  if (idxId === -1) return -1;

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxId]) === String(id)) {
      headerAtual.forEach(function (h, colIdx) {
        if (novosDados[h] !== undefined) {
          aba.getRange(i + 1, colIdx + 1).setValue(novosDados[h]);
        }
      });
      const idxUpdated = headerAtual.indexOf('updated_at');
      if (idxUpdated !== -1) {
        aba.getRange(i + 1, idxUpdated + 1).setValue(new Date());
      }
      SpreadsheetApp.flush();
      return i + 1;
    }
  }
  return -1;
}

/**
 * Exclui a linha inteira de um registro, localizado pela coluna "id".
 * Devolve true se encontrou e excluiu, false se o id não existia.
 */
function deleteRowById_(nomeAba, id) {
  const aba = PLANILHA.getSheetByName(nomeAba);
  if (!aba) return false;

  const dados = aba.getDataRange().getValues();
  const headerAtual = dados[0].map(String);
  const idxId = headerAtual.indexOf('id');
  if (idxId === -1) return false;

  for (let i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][idxId]) === String(id)) {
      aba.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return true;
    }
  }
  return false;
}

/** Busca UM registro específico pelo "id". Devolve o objeto ou null. */
function getObjectById_(nomeAba, id) {
  const lista = sheetToObjects_(nomeAba);
  for (let i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === String(id)) return lista[i];
  }
  return null;
}


/* ============================================================================
 * 6. SENHA / HASH (usado no seed do admin e, na próxima etapa, no login)
 * ========================================================================= */

/** Gera um hash MD5 simples para não guardar senha em texto puro na planilha. */
function gerarHashSenha_(textoSenha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(textoSenha));
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}


/* ============================================================================
 * 7. CONFIG — leitura/escrita simples da aba CONFIG (chave/valor)
 * ========================================================================= */

/** Lê todas as configurações como um objeto { chave: valor }. */
function getConfig() {
  const linhas = sheetToObjects_(SHEETS.config);
  const mapa = {};
  linhas.forEach(function (l) { mapa[l.chave] = l.valor; });
  return { success: true, config: mapa, bruto: linhas };
}

/** Salva (cria ou atualiza) uma configuração pela chave. */
function salvarConfig_(payload) {
  if (!payload.chave) return { success: false, msg: 'Informe a chave da configuração.' };

  const linhas = sheetToObjects_(SHEETS.config);
  const existente = linhas.find(function (l) { return l.chave === payload.chave; });

  if (existente) {
    // A aba CONFIG não tem "id" — atualizamos direto pela chave.
    const aba = PLANILHA.getSheetByName(SHEETS.config);
    const dados = aba.getDataRange().getValues();
    const headerAtual = dados[0].map(String);
    const idxChave = headerAtual.indexOf('chave');
    const idxValor = headerAtual.indexOf('valor');
    const idxUpdated = headerAtual.indexOf('updated_at');
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][idxChave]) === String(payload.chave)) {
        aba.getRange(i + 1, idxValor + 1).setValue(payload.valor || '');
        if (idxUpdated !== -1) aba.getRange(i + 1, idxUpdated + 1).setValue(new Date());
        return { success: true, msg: 'Configuração "' + payload.chave + '" atualizada.' };
      }
    }
  }

  appendObjectRow_(SHEETS.config, HEADERS.config, {
    chave: payload.chave,
    valor: payload.valor || '',
    descricao: payload.descricao || '',
    updated_at: new Date()
  });
  return { success: true, msg: 'Configuração "' + payload.chave + '" criada.' };
}
