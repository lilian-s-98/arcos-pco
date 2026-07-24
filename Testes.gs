function teste3() {
  const r1 = gerarRelatorioPadrao_({ obra: 'Obra Teste', observacoes: 'Obra dentro do previsto, sem pendências críticas neste mês.' });
  Logger.log(r1); // deve trazer success:true e uma "url" do Drive

  const r2 = gerarRelatorioResumoExecutivo_({ observacoes: 'Portfólio geral estável, atenção à Obra Teste.' });
  Logger.log(r2);
}
