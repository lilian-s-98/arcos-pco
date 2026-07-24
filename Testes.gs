function teste() {
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const mesAtual = hoje.substring(0, 7);

  // 1. Cria uma atividade Mensal no "último dia útil" (pra testar a recorrência exata)
  Logger.log(salvarRotinaAtividade_({
    titulo: 'Teste - Fechar relatório',
    frequencia: 'Mensal',
    dia_mes_tipo: 'ultimo_util',
    categoria: 'Relatório'
  }));

  // 2. Vê o checklist de hoje (deve trazer as 14 atividades padrão que já existiam + essa nova, se hoje bater com a recorrência dela)
  Logger.log(getChecklistDoDia({ data: hoje }));

  // 3. Vê o calendário do mês atual
  Logger.log(getCalendarioMes({ mes: mesAtual }));

  // 4. Recalcula e lê a aderência do mês
  Logger.log(recalcularAderencia_(mesAtual));
  Logger.log(getRotinaAderencia({ mes: mesAtual }));

  // 5. Dashboard completo (Faturado/A Faturar/Saldo Previsto — devem vir 0 ainda, sem Medições/Aditivos)
  Logger.log(getDashboard());
}
