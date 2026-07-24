/**
 * ============================================================================
 *  BACKEND_ATAS.GS — Ata de Reunião Semanal
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida do formulário de Ata Semanal (identificação da reunião,
 *  participantes, atividades discutidas, avanço previsto x realizado e
 *  planejamento semanal por serviço).
 *
 *  ⭐ INTEGRAÇÃO AUTOMÁTICA COM "PROBLEMAS DE OBRA" (pedido do cliente) ⭐
 *  Toda vez que uma Ata é salva com (a) um motivo de desvio preenchido OU
 *  (b) o avanço realizado menor que o previsto, o sistema cria/atualiza
 *  AUTOMATICAMENTE um registro na aba PROBLEMAS, marcado com origem="Ata".
 *  Assim, quem abrir a tela de "Problemas de Obra" já vê esse problema sem
 *  precisar digitar de novo — mas ainda pode editar/detalhar/excluir ele por
 *  lá normalmente (usando o Backend_Problemas.gs).
 *
 *  Se a Ata for editada depois e o desvio deixar de existir, o problema
 *  automático é removido — MAS só se ninguém ainda tiver mexido nele (ou
 *  seja, se continuar "Aberto" e sem ação corretiva registrada). Isso evita
 *  apagar por engano um trabalho que o PCO já começou a fazer em cima dele.
 * ============================================================================
 */


/* ============================================================================
 * 1. CRUD DA ATA SEMANAL
 * ========================================================================= */

/** Lista as atas, opcionalmente filtradas por obra. Devolve o planejamento
 *  semanal já convertido de volta para array (ele é guardado como texto/JSON
 *  na planilha, pois é uma lista de serviços com % por semana). */
function getAtas(params) {
  const obraFiltro = (params && params.obra) ? params.obra : null;

  let linhas = sheetToObjects_(SHEETS.atas).map(function (ata) {
    try {
      ata.planejamento_semanas = JSON.parse(ata.planejamento_semanas || '[]');
    } catch (erroDeLeitura) {
      ata.planejamento_semanas = [];
    }
    return ata;
  });

  if (obraFiltro) {
    linhas = linhas.filter(function (a) { return String(a.obra) === obraFiltro; });
  }

  return { success: true, atas: linhas };
}

/**
 * Cria ou edita uma Ata Semanal.
 * Campos obrigatórios: obra, data_referencia.
 * O campo "planejamento_semanas" deve chegar como um ARRAY de objetos
 * (ex: [{servico:'Alvenaria', s1p:20, s1r:18, ...}]) — aqui ele é convertido
 * pra texto/JSON antes de gravar na planilha.
 */
function salvarAta_(payload) {
  if (!payload || !payload.obra || !payload.data_referencia) {
    return { success: false, msg: 'Informe a obra e a data de referência da reunião.' };
  }

  const avancoPrevisto = parseFloat(payload.avanco_previsto || 0);
  const avancoRealizado = parseFloat(payload.avanco_realizado || 0);
  const desvio = parseFloat((avancoRealizado - avancoPrevisto).toFixed(1));

  const dadosComuns = {
    numero_ata: payload.numero_ata || '',
    obra: payload.obra,
    engenheiro: payload.engenheiro || '',
    data_referencia: payload.data_referencia,
    avanco_previsto: avancoPrevisto,
    avanco_realizado: avancoRealizado,
    desvio: desvio,
    motivo_desvio: payload.motivo_desvio || '',
    participantes: payload.participantes || '',
    terceirizados: payload.terceirizados || '',
    atividades: payload.atividades || '',
    ocorrencias: payload.ocorrencias || '',
    pendencias: payload.pendencias || '',
    previsao_prox: payload.previsao_prox || '',
    obs: payload.obs || '',
    planejamento_semanas: JSON.stringify(payload.planejamento_semanas || []),
    anexo_url: payload.anexo_url || ''
  };

  let idAta;
  let mensagem;

  // ── MODO EDIÇÃO ───────────────────────────────────────────────────────────
  if (payload.id) {
    const linhaAtualizada = updateObjectRowById_(SHEETS.atas, HEADERS.atas, payload.id, dadosComuns);
    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Ata não encontrada para edição (id: ' + payload.id + ').' };
    }
    idAta = payload.id;
    mensagem = 'Ata "' + (payload.numero_ata || idAta) + '" atualizada com sucesso.';

  // ── MODO CRIAÇÃO ──────────────────────────────────────────────────────────
  } else {
    idAta = gerarId_('ATA');
    const dadosCompletos = Object.assign({ id: idAta, timestamp: new Date(), updated_at: new Date() }, dadosComuns);
    appendObjectRow_(SHEETS.atas, HEADERS.atas, dadosCompletos);
    mensagem = 'Ata registrada com sucesso.';
  }

  // Integração automática: cria/atualiza/remove o "problema" vinculado a esta ata
  sincronizarProblemaAutomaticoDaAta_(idAta, payload, desvio);

  return { success: true, msg: mensagem, id: idAta };
}

/** Exclui uma Ata e, junto, remove o problema automático vinculado a ela
 *  (se ele ainda não tiver sido tocado manualmente por ninguém). */
function excluirAta_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID da ata não informado.' };

  const ata = getObjectById_(SHEETS.atas, payload.id);
  if (!ata) return { success: false, msg: 'Ata não encontrada.' };

  removerProblemaAutomaticoSeExistir_(payload.id);

  const excluiuComSucesso = deleteRowById_(SHEETS.atas, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Ata excluída com sucesso.' }
    : { success: false, msg: 'Não foi possível excluir a ata.' };
}


/* ============================================================================
 * 2. INTEGRAÇÃO AUTOMÁTICA: ATA -> PROBLEMAS DE OBRA
 * ========================================================================= */

/**
 * Decide se a ata "gerou" um problema automático e cria/atualiza/remove esse
 * registro na aba PROBLEMAS de acordo.
 * Critério: existe motivo de desvio preenchido OU o realizado ficou abaixo
 * do previsto (desvio negativo).
 */
function sincronizarProblemaAutomaticoDaAta_(idAta, payload, desvio) {
  const temMotivoDeDesvio = payload.motivo_desvio && String(payload.motivo_desvio).trim() !== '';
  const houveDesvioNegativo = desvio < 0;

  if (!temMotivoDeDesvio && !houveDesvioNegativo) {
    // Não há problema a registrar agora. Se antes havia um (e ninguém mexeu
    // nele ainda), removemos — a ata foi corrigida/editada e o desvio sumiu.
    removerProblemaAutomaticoSeExistir_(idAta);
    return;
  }

  const problemaExistente = sheetToObjects_(SHEETS.problemas).find(function (p) {
    return String(p.ata_id) === String(idAta) && p.origem === 'Ata';
  });

  const dadosDoProblema = {
    obra: payload.obra,
    semana_referencia: semanaTextoDaData_(payload.data_referencia), // TEXTO puro, nunca Data
    atividade: problemaExistente ? problemaExistente.atividade : '',
    categoria: payload.motivo_desvio || (problemaExistente ? problemaExistente.categoria : 'Outro'),
    descricao: montarDescricaoAutoProblema_(payload, desvio),
    impacto_dias: problemaExistente ? problemaExistente.impacto_dias : 0,
    responsavel: payload.engenheiro || '',
    acao_corretiva: problemaExistente ? problemaExistente.acao_corretiva : '',
    status: problemaExistente ? problemaExistente.status : 'Aberto',
    causou_atraso: houveDesvioNegativo ? 'Sim' : 'Não'
  };

  if (problemaExistente) {
    updateObjectRowById_(SHEETS.problemas, HEADERS.problemas, problemaExistente.id, dadosDoProblema);
  } else {
    appendObjectRow_(SHEETS.problemas, HEADERS.problemas, Object.assign({
      id: gerarId_('PRB'),
      timestamp: new Date(),
      origem: 'Ata',
      ata_id: idAta,
      updated_at: new Date()
    }, dadosDoProblema));
  }
}

/**
 * Remove o problema automático vinculado a uma ata, MAS só se ele ainda
 * estiver "intocado" (status ainda "Aberto" e sem ação corretiva escrita).
 * Isso protege o trabalho manual que o PCO já tiver feito em cima dele.
 */
function removerProblemaAutomaticoSeExistir_(idAta) {
  const problemaExistente = sheetToObjects_(SHEETS.problemas).find(function (p) {
    return String(p.ata_id) === String(idAta) && p.origem === 'Ata';
  });
  if (!problemaExistente) return;

  const aindaIntocado = problemaExistente.status === 'Aberto'
    && (!problemaExistente.acao_corretiva || String(problemaExistente.acao_corretiva).trim() === '');

  if (aindaIntocado) {
    deleteRowById_(SHEETS.problemas, problemaExistente.id);
  }
}

/** Monta o texto de descrição do problema gerado automaticamente pela ata. */
function montarDescricaoAutoProblema_(payload, desvio) {
  let texto = '📋 Gerado automaticamente a partir da Ata Semanal';
  if (payload.numero_ata) texto += ' nº ' + payload.numero_ata;
  texto += ' (obra: ' + payload.obra + ', reunião de ' + payload.data_referencia + ').\n';
  texto += 'Avanço previsto: ' + (payload.avanco_previsto || 0) + '% | ';
  texto += 'Avanço realizado: ' + (payload.avanco_realizado || 0) + '% | ';
  texto += 'Desvio: ' + desvio + '%.\n';
  if (payload.motivo_desvio) {
    texto += 'Motivo do desvio apontado na ata: ' + payload.motivo_desvio + '.\n';
  }
  if (payload.ocorrencias) {
    texto += 'Ocorrências relatadas na ata: ' + payload.ocorrencias;
  }
  return texto;
}

/**
 * Transforma uma data ('yyyy-MM-dd') no texto da SEMANA ISO correspondente,
 * ex: "2026-S30". Isso é gerado UMA VEZ no servidor e gravado como TEXTO
 * puro na planilha — nunca como objeto Data. É exatamente isso que corrige
 * o bug antigo de "a semana de referência muda sozinha ao clicar no card":
 * como nunca é um objeto Data, não existe fuso horário pra bagunçar o valor.
 */
function semanaTextoDaData_(dataTexto) {
  if (!dataTexto) return '';
  const dataObj = new Date(String(dataTexto).split('T')[0] + 'T12:00:00');
  if (isNaN(dataObj.getTime())) return String(dataTexto);

  // Cálculo padrão de número de semana ISO-8601
  const dataUtc = new Date(Date.UTC(dataObj.getFullYear(), dataObj.getMonth(), dataObj.getDate()));
  const diaDaSemanaIso = dataUtc.getUTCDay() || 7; // domingo vira 7 (ISO considera segunda=1)
  dataUtc.setUTCDate(dataUtc.getUTCDate() + 4 - diaDaSemanaIso);
  const inicioDoAno = new Date(Date.UTC(dataUtc.getUTCFullYear(), 0, 1));
  const numeroDaSemana = Math.ceil(((dataUtc - inicioDoAno) / 86400000 + 1) / 7);

  return dataUtc.getUTCFullYear() + '-S' + String(numeroDaSemana).padStart(2, '0');
}
